// ==UserScript==
// @name         工单助手 - 自动翻译和标记标题 v1.3.9（可拖拽版）
// @namespace    http://tampermonkey.net/
// @version      1.3.9
// @description  优化了之前版本的代码
// @author       ll96victor
// @match        https://ml-panel.aihelp.net/dashboard/*
// @grant        GM_xmlhttpRequest
// @run-at       document-idle
// ==/UserScript==

(function() {
    'use strict';

    // 配置（完全保留 + 补充并发锁超时）
    const CONFIG = {
        debug: true,
        translationService: 'google',
        checkInterval: 2000,
        maxRetries: 3,
        clickDelay: 1000,
        searchDelay: 1200,
        discoveryListenTimeout: 60000 // 发现迭代监听超时时间（60秒）
    };

    // 常量集中管理（修复Bug1：inputTypes改为大写，匹配tagName返回值）
    const CONSTANTS = {
        allowedLabelTexts: ['任务标题', '发现迭代', '创建人'],
        selectors: {
            inputTypes: ['INPUT', 'TEXTAREA'], // 修复：改为大写，匹配tagName的大写返回值
            dropdownContainers: ['.el-select-dropdown', '.ant-select-dropdown', '.el-popper', '.el-dropdown-menu', '.dropdown-menu'],
            searchInputs: [
                '.el-select-dropdown__item input',
                '.el-select-dropdown input[type="text"]',
                '.el-select-dropdown input[type="search"]',
                '.ant-select-dropdown input',
                '.el-input__inner[type="text"]',
                '.el-input__inner[type="search"]',
                '.el-select__input',
                'input.el-input__inner',
                '.el-select-dropdown.is-multiple .el-select-dropdown__item',
                '.el-select-dropdown__wrap input'
            ],
            dropdownOptions: ['.el-select-dropdown__item', '.ant-select-item', '[role="option"]'],
            selectClassNames: [
                'el-select', 'ant-select', 'select-component',
                'dropdown-select', 'form-select', 'el-input__inner',
                'el-input', 'ant-select-selector', 'el-input--suffix'
            ]
        },
        events: {
            input: ['input', 'change', 'keydown', 'keypress', 'keyup', 'blur', 'focus'],
            composition: ['compositionstart', 'compositionupdate', 'compositionend']
        },
        regex: {
            chinese: /[\u4e00-\u9fa5\u3000-\u303f\uff00-\uffef]/, // 完整中文字符+中文标点范围
            version: /(\d+\.\d+\.\d+)/,
            serverId: /ServerID\s*[=:]\s*(\d+)/i
        }
    };

    // 并发锁：防止重复处理（新增低风险优化）
    let isProcessing = false;
    const processLock = {
        acquire: () => {
            if (isProcessing) return false;
            isProcessing = true;
            return true;
        },
        release: () => {
            isProcessing = false;
        }
    };

    // 缓存管理（新增，仅缓存查询结果，不改动原查询逻辑）
    const elementCache = new Map();
    const CACHE_TTL = 5000; // 缓存有效期5秒
    function getCachedElements(key, fetchFn) {
        const now = Date.now();
        const cached = elementCache.get(key);
        if (cached && now - cached.timestamp < CACHE_TTL) {
            return cached.value;
        }
        const result = fetchFn();
        elementCache.set(key, { value: result, timestamp: now });
        // 清理过期缓存（避免内存膨胀）
        setTimeout(() => elementCache.delete(key), CACHE_TTL);
        return result;
    }

    // 防抖函数（完全保留）
    function debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    // 日志函数（完全保留）
    function log(...args) {
        if (CONFIG.debug) {
            console.log('[工单助手]', ...args);
        }
    }

    // 检查元素是否可见（修复：仅保留尺寸检查，去掉滚动区域误判）
    function isElementVisible(el) {
        if (!el || !el.getBoundingClientRect) return false;
        try {
            const style = window.getComputedStyle(el);
            const rect = el.getBoundingClientRect();
            return style.display !== 'none' &&
                   style.visibility !== 'hidden' &&
                   style.opacity !== '0' &&
                   el.offsetParent !== null &&
                   rect.width > 0 && rect.height > 0; // 仅保留尺寸检查
        } catch (e) {
            return false;
        }
    }

    // 查找输入框元素（Bug1修复后，此处无需修改，因为inputTypes已改为大写）
    function findInputElement(titleElement) {
        if (titleElement.tagName === 'LABEL') {
            const forAttr = titleElement.getAttribute('for');
            if (forAttr) {
                const input = document.getElementById(forAttr);
                if (input && CONSTANTS.selectors.inputTypes.includes(input.tagName)) {
                    return input;
                }
            }
        }

        let parent = titleElement.parentElement;
        for (let i = 0; i < 5 && parent; i++) {
            const inputs = parent.querySelectorAll(CONSTANTS.selectors.inputTypes.join(','));
            for (const input of inputs) {
                if (isElementVisible(input)) {
                    return input;
                }
            }
            parent = parent.parentElement;
        }

        let sibling = titleElement.nextElementSibling;
        while (sibling) {
            if (CONSTANTS.selectors.inputTypes.includes(sibling.tagName)) {
                if (isElementVisible(sibling)) {
                    return sibling;
                }
            }
            sibling = sibling.nextElementSibling;
        }

        return null;
    }

    // 优化findElementByText：保留原TreeWalker逻辑，仅外层加缓存
    function findElementByText(text, exactMatch = false) {
        if (!CONSTANTS.allowedLabelTexts.includes(text)) return [];

        // 缓存层（键值包含exactMatch，默认值统一）
        const cacheKey = `${text}_${exactMatch}`;
        return getCachedElements(cacheKey, () => {
            // 完全保留原TreeWalker查询逻辑
            const elements = [];
            const walker = document.createTreeWalker(
                document.body,
                NodeFilter.SHOW_TEXT,
                null,
                false
            );

            let node;
            while (node = walker.nextNode()) {
                const isMatch = exactMatch
                    ? node.textContent.trim() === text
                    : node.textContent.includes(text);

                if (isMatch) {
                    const parent = node.parentElement;
                    if (isElementVisible(parent) &&
                        (parent.tagName === 'LABEL' || parent.tagName === 'P' || parent.classList.contains('title-of-work-order'))) {
                        if (!parent.textContent.includes('经办人')) {
                            elements.push(parent);
                        }
                    }
                }
            }
            return elements;
        });
    }

    // 查找下拉选择框元素（完全保留，仅替换魔法字符串为常量）
    function findSelectElement(labelElement) {
        if (!labelElement) return null;

        log('开始查找下拉选择框，标签元素:', labelElement.tagName, labelElement.className);

        if (labelElement.tagName === 'P' && labelElement.classList.contains('title-of-work-order')) {
            let sibling = labelElement.nextElementSibling;
            while (sibling) {
                if (sibling.tagName === 'P' && sibling.classList.contains('detail')) {
                    log('找到p.detail容器，开始查找内部下拉框');
                    const selectEl = sibling.querySelector(`.${CONSTANTS.selectors.selectClassNames.join(', .')}`);
                    if (selectEl && isElementVisible(selectEl)) {
                        const innerInput = selectEl.querySelector('.el-input__inner');
                        if (innerInput && isElementVisible(innerInput)) {
                            log('在p.detail中找到下拉框输入框:', innerInput.className);
                            return innerInput;
                        }
                        log('在p.detail中找到下拉框:', selectEl.className);
                        return selectEl;
                    }
                    break;
                }
                sibling = sibling.nextElementSibling;
            }
        }

        let currentElement = labelElement;
        for (let i = 0; i < 10; i++) {
            if (currentElement.nextElementSibling) {
                if (CONSTANTS.selectors.inputTypes.includes(currentElement.nextElementSibling.tagName)) {
                    log('找到兄弟输入框');
                    return currentElement.nextElementSibling;
                }

                const commonInputs = currentElement.nextElementSibling.querySelectorAll(
                    'input[type="text"], input[type="search"], textarea, .el-input__inner, .el-input, .ant-input'
                );

                for (const input of commonInputs) {
                    if (isElementVisible(input)) {
                        log('在兄弟元素中找到输入框:', input.tagName, input.className);
                        return input;
                    }
                }
            }

            if (currentElement.parentElement) {
                const parentInputs = currentElement.parentElement.querySelectorAll(
                    'input[type="text"], input[type="search"], textarea, .el-input__inner, .el-input, .ant-input'
                );

                for (const input of parentInputs) {
                    if (isElementVisible(input)) {
                        log('在父级中找到输入框:', input.tagName, input.className);
                        return input;
                    }
                }
            }

            if (currentElement.nextElementSibling) {
                currentElement = currentElement.nextElementSibling;
            } else {
                break;
            }
        }

        log('未找到下拉选择框');
        return null;
    }

    // 查找指定标签对应的输入框的值（完全保留）
    function getInputValueByLabel(labelText) {
        const exactMatch = labelText === '创建人' ? true : false;
        const labelElements = findElementByText(labelText, exactMatch);
        if (labelElements.length === 0) return null;

        for (const labelElement of labelElements) {
            const inputElement = findSelectElement(labelElement);
            if (inputElement) {
                const value = inputElement.value || inputElement.textContent || '';
                log(`${labelText} 当前值: ${value}`);
                return value;
            }
        }

        return null;
    }

    // Google翻译（修复：URL空格+错误返回逻辑，保留原重试逻辑）
    async function translateWithGoogle(text, retryCount = 0) {
        const attempt = () => new Promise(resolve => {
            // 修复：移除URL中的空格
            const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=zh-CN&dt=t&q=${encodeURIComponent(text)}`;
            GM_xmlhttpRequest({
                method: 'GET',
                url: url,
                timeout: 10000,
                onload: function(response) {
                    try {
                        if (response.status === 200) {
                            const data = JSON.parse(response.responseText);
                            if (data && data[0] && Array.isArray(data[0])) {
                                // 拼接所有翻译片段，解决长文本翻译不完整问题
                                let translatedText = '';
                                for (const segment of data[0]) {
                                    if (segment && segment[0]) {
                                        translatedText += segment[0];
                                    }
                                }

                                if (translatedText) {
                                    resolve(translatedText);
                                } else {
                                    resolve(text); // 原逻辑：返回原文本
                                }
                            } else {
                                resolve(text); // 原逻辑：返回原文本
                            }
                        } else {
                            resolve(text); // 原逻辑：返回原文本
                        }
                    } catch (e) {
                        resolve(text); // 原逻辑：返回原文本
                    }
                },
                onerror: function() {
                    resolve(text); // 原逻辑：返回原文本
                },
                ontimeout: function() {
                    resolve(text); // 原逻辑：返回原文本
                }
            });
        });

        // 保留原重试逻辑
        if (retryCount >= CONFIG.maxRetries) {
            log('Google翻译失败，返回原文本');
            return text;
        }

        const result = await attempt();
        if (result !== text) {
            log('Google翻译成功:', text, '->', result);
            return result;
        } else {
            log(`Google翻译失败，重试 ${retryCount + 1}/${CONFIG.maxRetries}`);
            await new Promise(r => setTimeout(r, 1000));
            return translateWithGoogle(text, retryCount + 1);
        }
    }

    // 判断文本是否为中文（修复：恢复正确的正则范围）
    function isChinese(text) {
        return CONSTANTS.regex.chinese.test(text);
    }

    // 提取第一个冒号后的文本（完全保留）
    function extractTextAfterFirstColon(text) {
        let colonIndex = -1;
        const chineseColonIndex = text.indexOf('：');
        const englishColonIndex = text.indexOf(':');

        if (chineseColonIndex !== -1 && englishColonIndex !== -1) {
            colonIndex = Math.min(chineseColonIndex, englishColonIndex);
        } else if (chineseColonIndex !== -1) {
            colonIndex = chineseColonIndex;
        } else if (englishColonIndex !== -1) {
            colonIndex = englishColonIndex;
        }

        if (colonIndex === -1) {
            return '';
        }

        const textAfterColon = text.substring(colonIndex + 1).trim();
        return textAfterColon;
    }

    // 提取第一个冒号前的文本（完全保留）
    function extractTextBeforeFirstColon(text) {
        let colonIndex = -1;
        const chineseColonIndex = text.indexOf('：');
        const englishColonIndex = text.indexOf(':');

        if (chineseColonIndex !== -1 && englishColonIndex !== -1) {
            colonIndex = Math.min(chineseColonIndex, englishColonIndex);
        } else if (chineseColonIndex !== -1) {
            colonIndex = chineseColonIndex;
        } else if (englishColonIndex !== -1) {
            colonIndex = englishColonIndex;
        }

        if (colonIndex === -1) {
            return text;
        }

        const textBeforeColon = text.substring(0, colonIndex).trim();
        return textBeforeColon;
    }

    // 检查是否已经处理过（完全保留）
    function isAlreadyProcessed(inputElement, serverInfo) {
        if (!inputElement) return true;

        const currentValue = inputElement.value || '';
        const expectedPrefix = serverInfo ? serverInfo.prefix : '';

        if (expectedPrefix && currentValue.startsWith(expectedPrefix)) {
            return true;
        }

        return false;
    }

    // 查找ServerID并判断服务器类型（完全保留，替换魔法正则）
    function checkServerType() {
        const pageText = document.body.innerText || document.body.textContent;
        const serverIdMatch = pageText.match(CONSTANTS.regex.serverId);

        if (serverIdMatch) {
            const serverId = serverIdMatch[1];
            log('找到ServerID:', serverId);

            if (serverId.startsWith('57')) {
                return {
                    type: 'test',
                    prefix: '【40.2测服】：',
                    serverId: serverId
                };
            } else {
                return {
                    type: 'full',
                    prefix: '【2.1.40全服】：',
                    serverId: serverId
                };
            }
        }

        log('未找到ServerID');
        return null;
    }

    // 从标题中提取完整版本号（完全保留，替换魔法正则）
    function extractVersionFromTitle(title) {
        const versionMatch = title.match(/【(\d+\.\d+\.\d+)/);
        if (versionMatch && versionMatch[1]) {
            log(`从标题中提取完整版本号: ${versionMatch[1]}`);
            return versionMatch[1];
        }

        const floatMatch = title.match(CONSTANTS.regex.version);
        if (floatMatch && floatMatch[1]) {
            log(`从标题中提取版本号(备选): ${floatMatch[1]}`);
            return floatMatch[1];
        }

        log('未从标题中找到版本号');
        return null;
    }

    // 模拟输入文本（完全保留，替换魔法字符串为常量）
    function simulateInput(element, text) {
        if (!element) return false;

        log(`模拟输入: ${text}`);

        try {
            element.focus();
            element.value = '';
            element.value = text;

            CONSTANTS.events.input.forEach(eventType => {
                element.dispatchEvent(new Event(eventType, { bubbles: true }));
            });

            CONSTANTS.events.composition.forEach(eventType => {
                element.dispatchEvent(new Event(eventType, { bubbles: true }));
            });

            log('输入事件已触发');
            return true;
        } catch (error) {
            log('模拟输入时出错:', error);
            return false;
        }
    }

    // 查找下拉框的搜索输入框（完全保留，替换魔法字符串为常量）
    function findSearchInput() {
        log('开始查找搜索输入框');

        for (const dropdownSelector of CONSTANTS.selectors.dropdownContainers) {
            const dropdown = document.querySelector(dropdownSelector);
            if (dropdown && isElementVisible(dropdown)) {
                log(`找到下拉容器: ${dropdownSelector}`);

                for (const selector of CONSTANTS.selectors.searchInputs) {
                    const input = dropdown.querySelector(selector);
                    if (input && isElementVisible(input)) {
                        log(`在下拉容器中找到搜索输入框: ${selector}`);
                        return input;
                    }
                }
            }
        }

        log('在下拉容器中未找到，在整个页面中查找');

        const allInputs = document.querySelectorAll('input[type="text"], input[type="search"]');
        for (const input of allInputs) {
            if (isElementVisible(input)) {
                const style = window.getComputedStyle(input);
                const rect = input.getBoundingClientRect();

                if (rect.width > 50 && rect.height > 20) {
                    let parent = input.parentElement;
                    let isInDropdown = false;
                    while (parent && parent !== document.body) {
                        if (parent.classList &&
                            (parent.classList.contains('el-select-dropdown') ||
                             parent.classList.contains('ant-select-dropdown') ||
                             parent.classList.contains('el-popper'))) {
                            isInDropdown = true;
                            break;
                        }
                        parent = parent.parentElement;
                    }

                    if (isInDropdown) {
                        log('找到下拉框中的搜索输入框');
                        return input;
                    }
                }
            }
        }

        log('未找到搜索输入框');
        return null;
    }

    // 简单监听发现迭代值变化（修复Bug1+Bug2：定时器超时清理+防重复注册+once选项）
    let discoveryListenerRegistered = false;
    let discoveryIntervalId = null; // 保存定时器ID，用于清理
    function simpleListenDiscoveryChange(callback) {
        if (discoveryListenerRegistered) return;
        discoveryListenerRegistered = true;

        log('【修复】开始监听发现迭代值变化（轻量版）');
        const discoveryLabel = findElementByText('发现迭代')[0];
        if (!discoveryLabel) {
            log('【修复】未找到发现迭代标签，监听失败');
            discoveryListenerRegistered = false;
            return;
        }

        const discoverySelect = findSelectElement(discoveryLabel);
        if (!discoverySelect) {
            log('【修复】未找到发现迭代下拉框，监听失败');
            discoveryListenerRegistered = false;
            return;
        }

        let lastValue = getInputValueByLabel('发现迭代') || '';
        let timeoutTimer = null; // 超时清理定时器

        // 清理函数：统一释放所有资源（包括discoveryIntervalId和timeoutTimer）
        const cleanUp = () => {
            if (discoveryIntervalId) clearInterval(discoveryIntervalId);
            if (timeoutTimer) clearTimeout(timeoutTimer);
            discoveryListenerRegistered = false;
            log('【修复】发现迭代监听已清理');
        };

        // 超时清理：超过60秒未触发则自动停止
        timeoutTimer = setTimeout(() => {
            log('【修复】发现迭代监听超时，自动清理');
            cleanUp();
        }, CONFIG.discoveryListenTimeout);

        // 监听逻辑
        discoveryIntervalId = setInterval(() => {
            const currentValue = getInputValueByLabel('发现迭代') || '';
            if (currentValue !== lastValue && currentValue.trim() !== '' && !currentValue.includes('请选择')) {
                log(`【修复】检测到用户手动选择发现迭代: ${lastValue} -> ${currentValue}`);
                cleanUp(); // 触发后清理
                callback();
            }
            lastValue = currentValue;
        }, 500);

        // 修复Bug2：添加{ once: true }，防止重复注册beforeunload监听器
        // 统一管理所有资源释放，包括定时器和标记
        window.addEventListener('beforeunload', cleanUp, { once: true });
    }

    // 核心选择逻辑（完全保留，替换魔法字符串为常量）
    async function selectSearchableDropdown(labelText, searchText, isCreator = false) {
        log(`\n=== 开始处理 ${labelText}，搜索文本: ${searchText} ===`);

        if (!CONSTANTS.allowedLabelTexts.includes(labelText)) {
            log(`跳过非目标标签: ${labelText}`);
            return false;
        }

        const exactMatch = labelText === '创建人' ? true : false;
        const labelElements = findElementByText(labelText, exactMatch);

        if (labelElements.length === 0) {
            log(`未找到 ${labelText} 元素`);
            return false;
        }

        for (const labelElement of labelElements) {
            log(`处理 ${labelText} 元素:`, labelElement.tagName, labelElement.className);

            const selectElement = findSelectElement(labelElement);
            if (!selectElement) {
                log(`未找到 ${labelText} 对应的下拉框`);
                continue;
            }

            log(`找到选择框:`, selectElement.tagName, selectElement.className);
            const currentValue = selectElement.value || selectElement.textContent || '';
            log(`${labelText} 当前值: ${currentValue}`);

            if ((isCreator && (currentValue.includes('梁磊') || currentValue.includes('lianglei'))) ||
                (!isCreator && currentValue.includes(searchText))) {
                log(`${labelText} 已选择目标值，跳过`);
                return true;
            }

            log('步骤1: 点击下拉框展开选项');
            selectElement.click();
            await new Promise(resolve => setTimeout(resolve, CONFIG.clickDelay));

            log('步骤2: 查找搜索输入框');
            let searchInput = findSearchInput();
            if (!searchInput) {
                log('未找到搜索输入框，跳过输入步骤');
                return false;
            }

            log('步骤3: 聚焦并输入搜索文本');
            searchInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
            searchInput.focus();
            await new Promise(resolve => setTimeout(resolve, 500));

            simulateInput(searchInput, searchText);
            await new Promise(resolve => setTimeout(resolve, CONFIG.searchDelay));
            searchInput.dispatchEvent(new Event('input', { bubbles: true }));
            log(`已在搜索框输入: ${searchText}`);

            await new Promise(resolve => setTimeout(resolve, 800));

            log('步骤4: 查找匹配的选项');
            let dropdownOptions = [];
            for (const selector of CONSTANTS.selectors.dropdownOptions) {
                dropdownOptions = document.querySelectorAll(selector);
                if (dropdownOptions.length > 0) break;
            }
            log(`找到 ${dropdownOptions.length} 个下拉选项`);

            const matchedOptions = [];
            for (const option of dropdownOptions) {
                const optionText = option.textContent.trim();
                const isOptionMatch = isCreator
                    ? optionText.includes('梁磊')
                    : optionText.includes(searchText);

                if (isOptionMatch && isElementVisible(option)) {
                    matchedOptions.push(option);
                    log(`匹配到选项: ${optionText}`);
                }
            }

            let selected = false;
            let isMultipleMatch = false;
            if (matchedOptions.length === 1) {
                log(`步骤5: 点击唯一匹配选项: ${matchedOptions[0].textContent}`);
                matchedOptions[0].click();
                selected = true;
                await new Promise(resolve => setTimeout(resolve, 600));
            } else if (matchedOptions.length > 1) {
                log(`步骤5: 匹配到多个选项，等待用户手动选择`);
                isMultipleMatch = true;
            } else {
                log(`未找到匹配 ${searchText} 的选项`);
            }

            log('步骤6: 关闭下拉框');
            document.body.click();
            await new Promise(resolve => setTimeout(resolve, 300));

            if (selected) {
                log(`✓ ${labelText} 处理成功`);
                return true;
            } else if (isMultipleMatch) {
                log(`⚠ ${labelText} 等待用户手动选择`);
                return 'await_manual';
            } else {
                log(`✗ ${labelText} 处理失败`);
                return false;
            }
        }
        return false;
    }

    // 处理需求四（完全保留）
    async function processRequirementsFour(processedTitle) {
        if (!processedTitle) return false;
        log('\n=== 开始执行需求四 ===');
        let successCount = 0;

        const version = extractVersionFromTitle(processedTitle);
        log(`从标题中提取的版本号: ${version}`);

        if (version) {
            const discoveryResult = await selectSearchableDropdown('发现迭代', version);
            if (discoveryResult === true) {
                log('✓ 发现迭代处理成功');
                successCount++;

                await new Promise(resolve => setTimeout(resolve, 1000));
                log(`\n开始处理创建人，搜索: 梁磊`);
                const creatorResult = await selectSearchableDropdown('创建人', '梁磊', true);
                if (creatorResult) successCount++;
            } else if (discoveryResult === 'await_manual') {
                simpleListenDiscoveryChange(async () => {
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    await selectSearchableDropdown('创建人', '梁磊', true);
                });
            }
        }
        log(`\n需求四处理完成，成功${successCount}项`);
        return successCount > 0;
    }

    // 处理标题翻译和更新（修复：翻译完整性校验逻辑）
    async function processTitle(inputElement, serverInfo) {
        if (!inputElement || inputElement.disabled || inputElement.readOnly) {
            log('输入框不可编辑，跳过处理');
            return false;
        }

        const currentValue = inputElement.value || '';
        log('当前标题值:', currentValue);

        if (isAlreadyProcessed(inputElement, serverInfo)) {
            log('标题已经处理过，跳过');
            return false;
        }

        const textAfterFirstColon = extractTextAfterFirstColon(currentValue);
        if (!textAfterFirstColon) {
            log('未找到冒号后的文本');
            const newTitle = serverInfo ? serverInfo.prefix + currentValue : currentValue;
            if (inputElement.value !== newTitle) {
                inputElement.value = newTitle;
                inputElement.dispatchEvent(new Event('input', { bubbles: true }));
                inputElement.dispatchEvent(new Event('change', { bubbles: true }));
                log('已添加服务器前缀:', newTitle);
                return newTitle;
            }
            return null;
        }

        // 强化中文检测：只要包含任何中文字符就不翻译
        const hasChineseInTextAfterColon = isChinese(textAfterFirstColon);
        let translatedText = textAfterFirstColon;

        if (!hasChineseInTextAfterColon) {
            log('开始翻译冒号后文本:', textAfterFirstColon);
            translatedText = await translateWithGoogle(textAfterFirstColon);
            log('翻译结果:', translatedText);

            // 修复：恢复原文本长度比例检查（30%阈值）
            if (translatedText.length < textAfterFirstColon.length * 0.3) {
                log('翻译结果过短，判定为不完整，使用原始文本');
                translatedText = textAfterFirstColon;
            }
        } else {
            log('冒号后文本包含中文，不进行翻译');
        }

        let newTitle;
        if (serverInfo) {
            newTitle = serverInfo.prefix + translatedText + ' ' + textAfterFirstColon;
        } else {
            const textBeforeColon = extractTextBeforeFirstColon(currentValue);
            newTitle = textBeforeColon + '：' + translatedText + ' ' + textAfterFirstColon;
        }

        if (inputElement.value !== newTitle) {
            inputElement.value = newTitle;
            inputElement.dispatchEvent(new Event('input', { bubbles: true }));
            inputElement.dispatchEvent(new Event('change', { bubbles: true }));
            log('已更新标题:', newTitle);
            return newTitle;
        }

        return null;
    }

    // 主翻译函数（完全保留）
    async function translateText(text) {
        if (!text || text.trim() === '') return text;
        try {
            return await translateWithGoogle(text);
        } catch (error) {
            log('翻译过程中出错:', error);
            return text;
        }
    }

    // 主处理函数（新增：并发锁，防止重复处理）
    async function processPage() {
        // 加锁：防止重复处理
        if (!processLock.acquire()) {
            log('已有处理任务在执行，跳过本次扫描');
            return;
        }

        try {
            log('\n=== 开始扫描页面 ===');
            const serverInfo = checkServerType();
            const titleElements = findElementByText('任务标题');

            if (titleElements.length === 0) {
                log('未找到"任务标题"元素');
                return;
            }

            log(`找到${titleElements.length}个"任务标题"元素`);
            let processedTitle = null;
            for (const titleElement of titleElements) {
                const inputElement = findInputElement(titleElement);
                if (!inputElement) {
                    log('未找到对应的输入框');
                    continue;
                }
                processedTitle = await processTitle(inputElement, serverInfo);
                if (processedTitle) break;
            }

            if (processedTitle) {
                log('\n任务标题已处理，开始执行需求四...');
                await processRequirementsFour(processedTitle);
            } else {
                log('未处理任务标题，跳过需求四');
            }
        } finally {
            // 释放锁
            processLock.release();
        }
    }

    // 创建状态指示器（完全保留）
    function createStatusIndicator() {
        const indicator = document.createElement('div');
        indicator.id = 'tm-task-helper-indicator';
        // 修改样式：支持拖拽（初始位置仍为右下角）
        indicator.style.cssText = `
            position: fixed;
            left: calc(100% - 120px); /* 初始右下角位置 */
            top: calc(100% - 60px);
            background: #4CAF50;
            color: white;
            padding: 8px 12px;
            border-radius: 4px;
            font-size: 12px;
            font-family: Arial, sans-serif;
            z-index: 999999;
            opacity: 0.9;
            box-shadow: 0 2px 10px rgba(0,0,0,0.2);
            cursor: move; /* 鼠标样式改为移动指针 */
            user-select: none; /* 禁止文本选中 */
        `;
        indicator.innerHTML = '助手已启用';

        // 拖拽功能逻辑
        let isDragging = false;
        let startX, startY, startLeft, startTop;

        indicator.addEventListener('mousedown', (e) => {
            isDragging = true;
            // 记录初始鼠标位置和元素位置
            startX = e.clientX;
            startY = e.clientY;
            startLeft = indicator.offsetLeft;
            startTop = indicator.offsetTop;
            e.preventDefault(); // 防止默认行为（如文本选中）
        });

        // 鼠标移动时更新元素位置
        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            const dx = e.clientX - startX;
            const dy = e.clientY - startY;
            // 更新元素的位置（基于视口）
            indicator.style.left = `${startLeft + dx}px`;
            indicator.style.top = `${startTop + dy}px`;
        });

        // 鼠标松开时停止拖拽
        document.addEventListener('mouseup', () => {
            isDragging = false;
        });

        // 原有点击触发处理的逻辑保留
        indicator.addEventListener('click', () => {
            processPage();
            indicator.style.background = '#2196F3';
            indicator.innerHTML = '正在处理...';
            setTimeout(() => {
                indicator.style.background = '#4CAF50';
                indicator.innerHTML = '助手已启用';
            }, 2000);
        });

        document.body.appendChild(indicator);
        return indicator;
    }

    // 监听DOM变化（新增：页面卸载时断开Observer）
    function observeDOMChanges() {
        const observer = new MutationObserver(debounce((mutations) => {
            let shouldProcess = false;
            for (const mutation of mutations) {
                if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                    shouldProcess = true;
                    break;
                }
                if ((mutation.type === 'characterData' || mutation.type === 'attributes') &&
                    (mutation.target.tagName === 'INPUT' || mutation.target.tagName === 'TEXTAREA')) {
                    shouldProcess = true;
                    break;
                }
            }
            if (shouldProcess) processPage();
        }, 1000));

        observer.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true,
            characterData: true,
            attributeFilter: ['value', 'placeholder', 'class', 'style']
        });
        log('已启动DOM变化监听');

        // 仅保留Observer的断开逻辑，定时器清理交由cleanUp统一管理
        window.addEventListener('beforeunload', () => {
            observer.disconnect();
            log('DOM监听已断开');
        }, { once: true });

        return observer;
    }

    // 初始化（删除重复的beforeunload定时器清理代码）
    function init() {
        log('工单助手 v1.3.6 初始化...');
        createStatusIndicator();
        setTimeout(() => processPage(), 1500);
        setInterval(() => processPage(), CONFIG.checkInterval);

        let lastUrl = location.href;
        setInterval(() => {
            if (location.href !== lastUrl) {
                lastUrl = location.href;
                setTimeout(() => processPage(), 500);
            }
        }, 500);

        observeDOMChanges();
        // 移除：重复的beforeunload监听器，所有定时器清理由simpleListenDiscoveryChange的cleanUp统一管理
    }

    // 启动（完全保留）
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        setTimeout(init, 1000);
    }

})();
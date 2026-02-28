// ==UserScript==
// @name         工单助手 - 自动翻译和标记标题 v1.8
// @namespace    http://tampermonkey.net/
// @version      1.8
// @description  自动检测"任务标题"字段，翻译冒号后内容，并根据ServerID标记测服/全服，自动选择发现迭代和创建人
// @author       ll96victor
// @match        https://ml-panel.aihelp.net/dashboard/*
// @grant        GM_xmlhttpRequest
// @run-at       document-idle
// ==/UserScript==

(function() {
    'use strict';

    // 配置
    const CONFIG = {
        debug: true,  // 开启调试以便查看问题
        translationService: 'google',
        checkInterval: 2000,
        maxRetries: 3,
        clickDelay: 800,  // 点击后的等待时间
        searchDelay: 1000  // 搜索输入后的等待时间
    };

    // 防抖函数
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

    // 简单的日志函数
    function log(...args) {
        if (CONFIG.debug) {
            console.log('[工单助手]', ...args);
        }
    }

    // 检查元素是否可见
    function isElementVisible(el) {
        if (!el) return false;
        try {
            const style = window.getComputedStyle(el);
            return style.display !== 'none' &&
                   style.visibility !== 'hidden' &&
                   style.opacity !== '0' &&
                   el.offsetParent !== null;
        } catch (e) {
            return false;
        }
    }

    // 查找输入框元素
    function findInputElement(titleElement) {
        // 方法1: 通过label的for属性
        if (titleElement.tagName === 'LABEL') {
            const forAttr = titleElement.getAttribute('for');
            if (forAttr) {
                const input = document.getElementById(forAttr);
                if (input && (input.tagName === 'INPUT' || input.tagName === 'TEXTAREA')) {
                    return input;
                }
            }
        }

        // 方法2: 在父元素中查找
        let parent = titleElement.parentElement;
        for (let i = 0; i < 5 && parent; i++) {
            const inputs = parent.querySelectorAll('input, textarea');
            for (const input of inputs) {
                if (isElementVisible(input)) {
                    return input;
                }
            }
            parent = parent.parentElement;
        }

        // 方法3: 查找相邻的input
        let sibling = titleElement.nextElementSibling;
        while (sibling) {
            if (sibling.tagName === 'INPUT' || sibling.tagName === 'TEXTAREA') {
                if (isElementVisible(sibling)) {
                    return sibling;
                }
            }
            sibling = sibling.nextElementSibling;
        }

        return null;
    }

    // 查找元素通过文本内容（支持多种标签类型）
    function findElementByText(text) {
        const elements = [];
        const walker = document.createTreeWalker(
            document.body,
            NodeFilter.SHOW_TEXT,
            null,
            false
        );

        let node;
        while (node = walker.nextNode()) {
            if (node.textContent.includes(text)) {
                const parent = node.parentElement;
                if (isElementVisible(parent)) {
                    elements.push(parent);
                }
            }
        }

        return elements;
    }

    // 查找下拉选择框元素
    function findSelectElement(labelElement) {
        if (!labelElement) return null;

        log('开始查找下拉选择框，标签元素:', labelElement.tagName, labelElement.className);

        // 常见下拉选择框的类名
        const selectClassNames = [
            'el-select', 'ant-select', 'select-component',
            'dropdown-select', 'form-select', 'el-input__inner',
            'el-input', 'ant-select-selector', 'el-input--suffix'
        ];

        // 从标签元素开始，在后续的兄弟元素中查找
        let currentElement = labelElement;

        // 先在同级或父级容器中查找
        for (let i = 0; i < 10; i++) {
            // 检查当前元素的下一个兄弟元素
            if (currentElement.nextElementSibling) {
                // 检查兄弟元素本身是否是输入框
                if (currentElement.nextElementSibling.tagName === 'INPUT' ||
                    currentElement.nextElementSibling.tagName === 'TEXTAREA') {
                    log('找到兄弟输入框');
                    return currentElement.nextElementSibling;
                }

                // 在兄弟元素中查找常见的输入框
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

            // 在父级中查找
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

            // 移动到下一个兄弟元素
            if (currentElement.nextElementSibling) {
                currentElement = currentElement.nextElementSibling;
            } else {
                break;
            }
        }

        log('未找到下拉选择框');
        return null;
    }

    // 查找指定标签对应的输入框的值
    function getInputValueByLabel(labelText) {
        const labelElements = findElementByText(labelText);
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

    // 使用免费的Google翻译
    function translateWithGoogle(text, retryCount = 0) {
        return new Promise((resolve, reject) => {
            // Google翻译的免费API端点
            const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=zh-CN&dt=t&q=${encodeURIComponent(text)}`;

            GM_xmlhttpRequest({
                method: 'GET',
                url: url,
                timeout: 10000,
                onload: function(response) {
                    try {
                        if (response.status === 200) {
                            const data = JSON.parse(response.responseText);
                            if (data && data[0] && data[0][0] && data[0][0][0]) {
                                const translatedText = data[0][0][0];
                                log('Google翻译成功:', text, '->', translatedText);
                                resolve(translatedText);
                            } else {
                                log('Google翻译返回格式异常');
                                resolve(text);
                            }
                        } else if (retryCount < CONFIG.maxRetries) {
                            log(`Google翻译失败，状态码: ${response.status}，重试 ${retryCount + 1}/${CONFIG.maxRetries}`);
                            setTimeout(() => {
                                translateWithGoogle(text, retryCount + 1)
                                    .then(resolve)
                                    .catch(() => resolve(text));
                            }, 1000);
                        } else {
                            log('Google翻译失败，返回原文本');
                            resolve(text);
                        }
                    } catch (e) {
                        log('解析翻译响应时出错:', e);
                        if (retryCount < CONFIG.maxRetries) {
                            setTimeout(() => {
                                translateWithGoogle(text, retryCount + 1)
                                    .then(resolve)
                                    .catch(() => resolve(text));
                            }, 1000);
                        } else {
                            resolve(text);
                        }
                    }
                },
                onerror: function(error) {
                    log('Google翻译请求出错:', error);
                    if (retryCount < CONFIG.maxRetries) {
                        setTimeout(() => {
                            translateWithGoogle(text, retryCount + 1)
                                .then(resolve)
                                .catch(() => resolve(text));
                        }, 1000);
                    } else {
                        resolve(text);
                    }
                },
                ontimeout: function() {
                    log('Google翻译请求超时');
                    if (retryCount < CONFIG.maxRetries) {
                        setTimeout(() => {
                            translateWithGoogle(text, retryCount + 1)
                                .then(resolve)
                                .catch(() => resolve(text));
                        }, 1000);
                    } else {
                        resolve(text);
                    }
                }
            });
        });
    }

    // 判断文本是否为中文
    function isChinese(text) {
        return /[\u4e00-\u9fff]/.test(text);
    }

    // 提取第一个冒号后的文本（优化点1：只考虑第一个冒号）
    function extractTextAfterFirstColon(text) {
        // 查找第一个冒号（中文或英文）的位置
        let colonIndex = -1;

        // 先找中文冒号
        const chineseColonIndex = text.indexOf('：');
        // 再找英文冒号
        const englishColonIndex = text.indexOf(':');

        // 取最先出现的冒号
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

        // 提取冒号后的文本（包含空格）
        const textAfterColon = text.substring(colonIndex + 1).trim();
        return textAfterColon;
    }

    // 提取第一个冒号前的文本
    function extractTextBeforeFirstColon(text) {
        // 查找第一个冒号（中文或英文）的位置
        let colonIndex = -1;

        // 先找中文冒号
        const chineseColonIndex = text.indexOf('：');
        // 再找英文冒号
        const englishColonIndex = text.indexOf(':');

        // 取最先出现的冒号
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

        // 提取冒号前的文本
        const textBeforeColon = text.substring(0, colonIndex).trim();
        return textBeforeColon;
    }

    // 检查是否已经处理过（避免重复处理）
    function isAlreadyProcessed(inputElement, serverInfo) {
        if (!inputElement) return true;

        const currentValue = inputElement.value || '';
        const expectedPrefix = serverInfo ? serverInfo.prefix : '';

        // 如果已经有我们添加的前缀，说明已经处理过
        if (expectedPrefix && currentValue.startsWith(expectedPrefix)) {
            return true;
        }

        return false;
    }

    // 查找ServerID并判断服务器类型
    function checkServerType() {
        // 尝试多种方式查找ServerID
        const pageText = document.body.innerText || document.body.textContent;
        const serverIdMatch = pageText.match(/ServerID\s*[=:]\s*(\d+)/i);

        if (serverIdMatch) {
            const serverId = serverIdMatch[1];
            log('找到ServerID:', serverId);

            if (serverId.startsWith('57')) {
                return {
                    type: 'test',
                    prefix: '【2.1.52测服】：',
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

    // 从标题中提取完整版本号（如2.1.52或2.1.40）
    function extractVersionFromTitle(title) {
        // 匹配类似 "【2.1.52测服】：" 或 "【2.1.40全服】：" 中的完整版本号
        const versionMatch = title.match(/【(\d+\.\d+\.\d+)/);
        if (versionMatch && versionMatch[1]) {
            // 返回完整的版本号，如2.1.52或2.1.40
            log(`从标题中提取完整版本号: ${versionMatch[1]}`);
            return versionMatch[1];
        }

        // 如果没有找到，尝试其他格式
        const floatMatch = title.match(/(\d+\.\d+\.\d+)/);
        if (floatMatch && floatMatch[1]) {
            log(`从标题中提取版本号(备选): ${floatMatch[1]}`);
            return floatMatch[1];
        }

        log('未从标题中找到版本号');
        return null;
    }

    // 模拟在输入框中输入文本
    function simulateInput(element, text) {
        if (!element) return false;

        log(`模拟输入: ${text}`);

        try {
            // 聚焦元素
            element.focus();

            // 清除现有内容
            element.value = '';

            // 设置新值
            element.value = text;

            // 触发所有必要的事件
            const events = ['input', 'change', 'keydown', 'keypress', 'keyup', 'blur', 'focus'];
            events.forEach(eventType => {
                element.dispatchEvent(new Event(eventType, { bubbles: true }));
            });

            // 对于某些框架，可能需要触发composition事件
            const compositionEvents = ['compositionstart', 'compositionupdate', 'compositionend'];
            compositionEvents.forEach(eventType => {
                element.dispatchEvent(new Event(eventType, { bubbles: true }));
            });

            log('输入事件已触发');
            return true;
        } catch (error) {
            log('模拟输入时出错:', error);
            return false;
        }
    }

    // 查找下拉框的搜索输入框
    function findSearchInput() {
        log('开始查找搜索输入框');

        // 常见搜索输入框的选择器
        const searchSelectors = [
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
        ];

        // 先尝试查找可见的下拉框容器
        const dropdownSelectors = [
            '.el-select-dropdown',
            '.ant-select-dropdown',
            '.el-popper',
            '.el-dropdown-menu',
            '.dropdown-menu'
        ];

        for (const dropdownSelector of dropdownSelectors) {
            const dropdown = document.querySelector(dropdownSelector);
            if (dropdown && isElementVisible(dropdown)) {
                log(`找到下拉容器: ${dropdownSelector}`);

                // 在容器内查找搜索输入框
                for (const selector of searchSelectors) {
                    const input = dropdown.querySelector(selector);
                    if (input && isElementVisible(input)) {
                        log(`在下拉容器中找到搜索输入框: ${selector}`);
                        return input;
                    }
                }
            }
        }

        // 如果没有在下拉容器中找到，尝试在整个页面中查找
        log('在下拉容器中未找到，在整个页面中查找');

        // 查找所有可能的输入框
        const allInputs = document.querySelectorAll('input[type="text"], input[type="search"]');
        for (const input of allInputs) {
            // 检查输入框是否可见且可能用于搜索
            if (isElementVisible(input)) {
                const style = window.getComputedStyle(input);
                const rect = input.getBoundingClientRect();

                // 如果输入框在屏幕可见区域且可能在下拉框中
                if (rect.width > 50 && rect.height > 20) {
                    // 检查输入框是否在某个下拉容器内
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

    // 模拟点击下拉框并选择选项（支持可搜索的下拉框）
    async function selectSearchableDropdown(labelText, searchText, isCreator = false) {
        log(`\n=== 开始处理 ${labelText}，搜索文本: ${searchText} ===`);

        // 找到标签元素
        const labelElements = findElementByText(labelText);
        if (labelElements.length === 0) {
            log(`未找到 ${labelText} 元素`);
            return false;
        }

        for (const labelElement of labelElements) {
            log(`处理 ${labelText} 元素:`, labelElement.tagName, labelElement.className);

            // 找到对应的下拉选择框
            const selectElement = findSelectElement(labelElement);
            if (!selectElement) {
                log(`未找到 ${labelText} 对应的下拉选择框`);
                continue;
            }

            log(`找到选择框:`, selectElement.tagName, selectElement.className);

            // 获取当前已选中的值（避免重复选择）
            const currentValue = selectElement.value || selectElement.textContent || '';
            log(`${labelText} 当前值: ${currentValue}`);

            // 对于创建人，如果已经选择了"梁磊"，则跳过
            if (isCreator && (currentValue.includes('梁磊') || currentValue.includes('lianglei'))) {
                log(`${labelText} 已经是梁磊，跳过`);
                return true;
            }

            log('步骤1: 点击下拉框');
            // 点击下拉框展开选项
            selectElement.click();

            // 等待下拉选项出现
            log(`等待 ${CONFIG.clickDelay}ms 让下拉框展开`);
            await new Promise(resolve => setTimeout(resolve, CONFIG.clickDelay));

            log('步骤2: 查找搜索输入框');
            // 查找搜索输入框
            let searchInput = findSearchInput();

            if (searchInput) {
                log('找到搜索输入框，准备输入文本');

                // 确保搜索输入框可见
                searchInput.scrollIntoView({ behavior: 'smooth', block: 'center' });

                // 聚焦到搜索输入框
                searchInput.focus();

                // 等待一下让输入框获得焦点
                await new Promise(resolve => setTimeout(resolve, 300));

                log(`步骤3: 输入搜索文本: ${searchText}`);
                // 输入搜索文本
                simulateInput(searchInput, searchText);

                // 等待搜索结果出现
                log(`等待 ${CONFIG.searchDelay}ms 让搜索结果出现`);
                await new Promise(resolve => setTimeout(resolve, CONFIG.searchDelay));

                // 再次触发输入事件以确保搜索生效
                searchInput.dispatchEvent(new Event('input', { bubbles: true }));
                searchInput.dispatchEvent(new Event('change', { bubbles: true }));

                // 等待更多时间让搜索结果加载
                await new Promise(resolve => setTimeout(resolve, 500));
            } else {
                log('未找到搜索输入框，可能不是可搜索的下拉框或结构不同');
            }

            log('步骤4: 查找并选择选项');
            // 查找所有下拉选项（常见的选择器）
            const optionSelectors = [
                '.el-select-dropdown__item',
                '.ant-select-item',
                '.dropdown-option',
                '.el-select-dropdown .el-select-dropdown__item',
                '.ant-select-dropdown .ant-select-item',
                '.el-select-dropdown__list .el-select-dropdown__item',
                '[role="option"]',
                '.el-dropdown-menu__item',
                '.el-select-dropdown.is-multiple .el-select-dropdown__item',
                '.el-select-dropdown__wrap .el-select-dropdown__item'
            ];

            let dropdownOptions = [];
            for (const selector of optionSelectors) {
                const options = document.querySelectorAll(selector);
                if (options.length > 0) {
                    dropdownOptions = options;
                    log(`使用选择器 ${selector} 找到 ${options.length} 个选项`);
                    break;
                }
            }

            log(`总共找到 ${dropdownOptions.length} 个选项`);

            // 打印前几个选项内容以便调试
            for (let i = 0; i < Math.min(dropdownOptions.length, 5); i++) {
                log(`选项 ${i}: ${dropdownOptions[i].textContent}`);
            }

            let selected = false;
            let matchedOption = null;

            if (isCreator) {
                // 对于创建人，搜索"梁磊"
                for (const option of dropdownOptions) {
                    const optionText = option.textContent || '';
                    if (optionText.includes('梁磊') || optionText.toLowerCase().includes('lianglei')) {
                        matchedOption = option;
                        break;
                    }
                }

                if (matchedOption) {
                    log(`找到创建人选项: ${matchedOption.textContent}`);
                    matchedOption.click();
                    selected = true;
                    log('已点击创建人选项');
                } else {
                    log('未找到梁磊选项');
                }
            } else {
                // 对于发现迭代，根据版本号匹配
                const matchedOptions = [];

                for (const option of dropdownOptions) {
                    const optionText = option.textContent || '';

                    // 检查选项是否包含搜索文本
                    if (optionText.includes(searchText)) {
                        matchedOptions.push(option);
                        log(`匹配到选项: ${optionText}`);
                    }
                }

                log(`匹配到 ${matchedOptions.length} 个选项`);

                // 根据需求四的要求：只匹配到1个选项则选择
                if (matchedOptions.length === 1) {
                    matchedOptions[0].click();
                    log(`已选择发现迭代: ${matchedOptions[0].textContent}`);
                    selected = true;
                } else if (matchedOptions.length > 1) {
                    log(`匹配到多个选项，不选择任何选项`);
                } else {
                    log(`没有匹配到包含 ${searchText} 的选项`);
                }
            }

            // 如果选择了选项，等待一下
            if (selected) {
                await new Promise(resolve => setTimeout(resolve, 500));
            }

            log('步骤5: 关闭下拉框');
            // 关闭下拉框（点击页面其他位置）
            document.body.click();

            // 等待选项关闭
            await new Promise(resolve => setTimeout(resolve, 300));

            if (selected) {
                log(`✓ ${labelText} 处理成功`);
                return true;
            } else {
                log(`✗ ${labelText} 处理失败`);
            }
        }

        return false;
    }

    // 处理标题翻译和更新
    async function processTitle(inputElement, serverInfo) {
        if (!inputElement || inputElement.disabled || inputElement.readOnly) {
            log('输入框不可编辑，跳过处理');
            return false;
        }

        const currentValue = inputElement.value || '';
        log('当前标题值:', currentValue);

        // 检查是否已经处理过
        if (isAlreadyProcessed(inputElement, serverInfo)) {
            log('标题已经处理过，跳过');
            return false;
        }

        // 提取第一个冒号后的文本（优化点1）
        const textAfterFirstColon = extractTextAfterFirstColon(currentValue);

        if (!textAfterFirstColon) {
            log('未找到冒号后的文本');
            // 如果没有冒号，直接用服务器前缀替换整个标题
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

        // 优化点3：判断冒号后的文本是否包含中文
        const hasChineseInTextAfterColon = isChinese(textAfterFirstColon);

        let translatedText = textAfterFirstColon;

        // 如果冒号后的文本包含中文，则不翻译
        if (!hasChineseInTextAfterColon) {
            // 翻译冒号后的文本
            log('开始翻译冒号后文本:', textAfterFirstColon);
            translatedText = await translateText(textAfterFirstColon);
            log('翻译结果:', translatedText);
        } else {
            log('冒号后文本包含中文，不进行翻译');
        }

        // 构建新标题（优化点2：修正冒号问题）
        let newTitle;
        if (serverInfo) {
            // 格式：服务器前缀 + 翻译文本 + 原冒号后文本
            // 注意：服务器前缀已经包含了一个冒号，所以不需要额外添加冒号
            // 翻译文本直接接在服务器前缀后面，然后加上原冒号后文本
            newTitle = serverInfo.prefix + translatedText + ' ' + textAfterFirstColon;
        } else {
            // 如果没有服务器信息，提取冒号前的文本
            const textBeforeColon = extractTextBeforeFirstColon(currentValue);
            // 格式：原冒号前文本 + 冒号 + 翻译文本 + 原冒号后文本
            newTitle = textBeforeColon + '：' + translatedText + ' ' + textAfterFirstColon;
        }

        // 更新标题
        if (inputElement.value !== newTitle) {
            inputElement.value = newTitle;
            inputElement.dispatchEvent(new Event('input', { bubbles: true }));
            inputElement.dispatchEvent(new Event('change', { bubbles: true }));
            log('已更新标题:', newTitle);
            return newTitle;
        }

        return null;
    }

    // 主翻译函数
    async function translateText(text) {
        if (!text || text.trim() === '') {
            return text;
        }

        // 尝试使用Google翻译
        try {
            return await translateWithGoogle(text);
        } catch (error) {
            log('翻译过程中出错:', error);
            return text;
        }
    }

    // 检查发现迭代是否有值
    function checkDiscoveryHasValue() {
        const discoveryValue = getInputValueByLabel('发现迭代');
        return discoveryValue && discoveryValue.trim() !== '';
    }

    // 处理需求四：发现迭代和创建人
    async function processRequirementsFour(processedTitle) {
        if (!processedTitle) return false;

        log('\n=== 开始执行需求四 ===');
        let successCount = 0;

        // 1. 从标题中提取版本号
        const version = extractVersionFromTitle(processedTitle);
        log(`从标题中提取的版本号: ${version}`);

        if (version) {
            // 2. 处理"发现迭代 *"
            log(`\n开始处理发现迭代，搜索版本: ${version}`);
            const discoveryResult = await selectSearchableDropdown('发现迭代', version);
            if (discoveryResult) {
                // 检查发现迭代是否有值
                await new Promise(resolve => setTimeout(resolve, 1000));
                const hasValue = checkDiscoveryHasValue();
                if (hasValue) {
                    log('✓ 发现迭代已成功选择并有值');
                    successCount++;

                    // 3. 处理"创建人*"（只有在发现迭代有值后才执行）
                    log(`\n开始处理创建人，搜索: 梁磊`);
                    const creatorResult = await selectSearchableDropdown('创建人', '梁磊', true);
                    if (creatorResult) {
                        successCount++;
                        log('✓ 创建人处理成功');
                    } else {
                        log('✗ 创建人处理失败');
                    }
                } else {
                    log('✗ 发现迭代处理后没有值，跳过创建人处理');
                }
            } else {
                log('✗ 发现迭代处理失败，跳过创建人处理');
            }
        } else {
            log('无法从标题中提取版本号，跳过需求四');
        }

        log(`\n需求四处理完成，成功${successCount}项`);
        return successCount > 0;
    }

    // 主处理函数
    async function processPage() {
        log('\n=== 开始扫描页面 ===');

        // 检查ServerID
        const serverInfo = checkServerType();

        // 查找"任务标题 *"
        const titleElements = findElementByText('任务标题');

        if (titleElements.length === 0) {
            log('未找到"任务标题"元素');
            return;
        }

        log(`找到${titleElements.length}个"任务标题"元素`);

        // 处理每个找到的标题元素
        let processedTitle = null;
        for (const titleElement of titleElements) {
            const inputElement = findInputElement(titleElement);
            if (!inputElement) {
                log('未找到对应的输入框');
                continue;
            }

            const newTitle = await processTitle(inputElement, serverInfo);
            if (newTitle) {
                processedTitle = newTitle;
                break; // 只处理第一个找到的标题
            }
        }

        // ========== 需求四：处理发现迭代和创建人 ==========
        if (processedTitle) {
            log('\n任务标题已处理，开始执行需求四...');
            await processRequirementsFour(processedTitle);
        } else {
            log('未处理任务标题，跳过需求四');
        }
    }

    // 创建状态指示器
    function createStatusIndicator() {
        const indicator = document.createElement('div');
        indicator.id = 'tm-task-helper-indicator';
        indicator.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            background: #4CAF50;
            color: white;
            padding: 8px 12px;
            border-radius: 4px;
            font-size: 12px;
            font-family: Arial, sans-serif;
            z-index: 999999;
            opacity: 0.9;
            box-shadow: 0 2px 10px rgba(0,0,0,0.2);
            cursor: pointer;
        `;
        indicator.innerHTML = '工单助手已启用';
        indicator.addEventListener('click', () => {
            processPage();
            indicator.style.background = '#2196F3';
            indicator.innerHTML = '正在处理...';
            setTimeout(() => {
                indicator.style.background = '#4CAF50';
                indicator.innerHTML = '工单助手已启用';
            }, 2000);
        });

        document.body.appendChild(indicator);
        return indicator;
    }

    // 监听DOM变化
    function observeDOMChanges() {
        const observer = new MutationObserver(debounce((mutations) => {
            let shouldProcess = false;

            for (const mutation of mutations) {
                if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                    shouldProcess = true;
                    break;
                }

                if (mutation.type === 'characterData' || mutation.type === 'attributes') {
                    const target = mutation.target;
                    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' ||
                        (target.parentElement && (target.parentElement.tagName === 'INPUT' || target.parentElement.tagName === 'TEXTAREA'))) {
                        shouldProcess = true;
                        break;
                    }
                }
            }

            if (shouldProcess) {
                processPage();
            }
        }, 1000));

        observer.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true,
            characterData: true,
            attributeFilter: ['value', 'placeholder', 'class', 'style']
        });

        log('已启动DOM变化监听');
        return observer;
    }

    // 初始化
    function init() {
        log('工单助手 v1.8 初始化...');

        // 创建状态指示器
        createStatusIndicator();

        // 初始处理
        setTimeout(() => {
            processPage();
        }, 1500);

        // 定期检查
        setInterval(() => {
            processPage();
        }, CONFIG.checkInterval);

        // 监听路由变化
        let lastUrl = location.href;
        setInterval(() => {
            if (location.href !== lastUrl) {
                lastUrl = location.href;
                setTimeout(() => {
                    processPage();
                }, 500);
            }
        }, 500);

        // 监听DOM变化
        observeDOMChanges();
    }

    // 等待页面加载
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        setTimeout(init, 1000);
    }
})();
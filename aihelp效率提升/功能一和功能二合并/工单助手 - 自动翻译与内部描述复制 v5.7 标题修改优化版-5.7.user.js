// ==UserScript==
// @name         工单助手 - 自动翻译与内部描述复制 v5.7 标题修改优化版
// @namespace    http://tampermonkey.net/
// @version      5.7
// @description  【状态感知版】支持三种网页状态，智能等待关联第三方加载，焦点监听自动填充。优化了有时关联第三方加载慢，标题修改有时不生效的问题。
// @author       ll96victor (Optimized v5.7)
// @match        https://ml-panel.aihelp.net/dashboard/*
// @match        https://ml.aihelp.net/dashboard/*
// @match        https://aihelp.net.cn/dashboard/*
// @match        https://aihelp.net/dashboard/*
// @exclude      *://*/dashboard/#/newpage-ticket*
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @connect      translate.googleapis.com
// @connect      api.mymemory.translated.net
// @run-at       document-end
// ==/UserScript==

(function() {
    'use strict';

    // ===================== 用户配置区 =====================
    const CONFIG = {
        fullServerLists: ["【2.1.40全服】：", "【2.1.18全服】：", "【40.2全服】：", "【18.2全服】："],
        testServerLists: ["【40.2测服】：", "【2.1.52测服】：", "【1.9.88测服】：", "【2.1.50测服】："],

        fullServer: "【40.2全服】：",
        testServer: "【2.1.56测服】：",

        translateDailyLimit: 150,
        translateTimeout: 6000,

        checkInterval: 1000,        // 工单变化检测
        stateCheckInterval: 1000,    // 状态检测间隔
        maxWaitForAssociated: 20000, // 最多等待关联第三方20秒

        dropdownWaitTime: 300,
        dropdownFillDelay: 100,

        debug: true
    };

    // ===================== 状态定义 =====================
    const STATE = {
        INITIAL: 1,      // 状态1：未点击关联第三方
        ASSOCIATED: 2,   // 状态2：已点击关联第三方，表单可编辑
        SEARCHING: 3     // 状态3：搜索框弹出
    };

    // ===================== 全局状态 =====================
    let state = {
        currentTicketID: null,
        currentState: STATE.INITIAL,
        copiedText: '',
        leftHeading: '',
        versionNumber: '',
        channelText: '',
        faxiandiedai: '',
        hasProcessedTitle: false,
        translateCount: 0,
        isProcessing: false,
        channelFilled: false,
        iterationFilled: false,
        stateObserver: null,
        focusListenersAttached: false
    };

    // ===================== 调试日志 =====================
    function log(...args) {
        if (CONFIG.debug) {
            console.log('[工单助手 v5.7]', ...args);
        }
    }

    function logError(...args) {
        console.error('[工单助手 v5.7 错误]', ...args);
    }

    // ===================== 样式注入 =====================
    GM_addStyle(`
        #copy-status-box {
            position: fixed;
            top: 120px;
            right: 20px;
            padding: 6px 10px;
            background: rgba(51, 112, 255, 0.9);
            color: white;
            border-radius: 4px;
            font-size: 12px;
            cursor: move;
            z-index: 999999;
            user-select: none;
            box-shadow: 0 2px 8px rgba(0,0,0,0.15);
            font-family: sans-serif;
            max-width: 50px;
            text-align: center;
            transition: background 0.2s;
        }
        #copy-status-box:hover {
            background: rgba(40, 90, 204, 0.95);
        }
        #copy-status-box.copied {
            background: rgba(82, 196, 26, 0.9);
        }
        #debug-console {
            position: fixed;
            top: 20px;
            left: 20px;
            width: 320px;
            max-height: 350px;
            background: rgba(0, 0, 0, 0.85);
            color: #00ff00;
            font-family: monospace;
            font-size: 11px;
            padding: 8px;
            border-radius: 4px;
            z-index: 999999;
            overflow-y: auto;
            border: 1px solid #444;
        }
        #debug-console h3 {
            margin: 0 0 8px 0;
            color: white;
            font-size: 13px;
            border-bottom: 1px solid #666;
            padding-bottom: 4px;
            display: flex;
            justify-content: space-between;
        }
        #debug-console button {
            background: #333;
            color: white;
            border: 1px solid #666;
            cursor: pointer;
            padding: 1px 4px;
            font-size: 10px;
        }
        .log-entry { margin-bottom: 3px; border-bottom: 1px solid #333; padding-bottom: 2px; }
        .log-error { color: #ff4444; }
        .log-warn { color: #ffaa00; }
        .log-success { color: #00cc00; }
        .log-info { color: #88ccff; }
    `);

    // ===================== 调试面板 =====================
    function debugLog(msg, type = 'info') {
        if (!CONFIG.debug) return;
        const consoleDiv = document.getElementById('debug-console-content');
        if (!consoleDiv) return;

        const entry = document.createElement('div');
        entry.className = `log-entry log-${type}`;
        entry.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
        consoleDiv.appendChild(entry);

        if (consoleDiv.children.length > 50) {
            consoleDiv.removeChild(consoleDiv.firstChild);
        }
        consoleDiv.scrollTop = consoleDiv.scrollHeight;
    }

    function createDebugConsole() {
        if (document.getElementById('debug-console')) return;
        const box = document.createElement('div');
        box.id = 'debug-console';
        box.innerHTML = `
            <h3>脚本运行日志 v5.7 <button onclick="this.parentElement.parentElement.style.display='none'">关闭</button></h3>
            <div id="debug-console-content"></div>
        `;
        document.body.appendChild(box);
        debugLog('调试面板已启动', 'success');
    }

    // ===================== 工具函数 =====================

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

    // 提取版本号
    function extractVersion(text) {
        const match = text.match(/(\d+(?:\.\d+)+)/);
        return match ? match[1] : '';
    }

    // 提取发现迭代值
    function extractFaxiandiedai(heading) {
        const match = heading.match(/【(.+?)全服】|【(.+?)测服】/);
        if (match) {
            return match[1] || match[2] || '';
        }
        return '';
    }

    // 检测中文
    function hasChinese(text) {
        return /[\u4e00-\u9fa5]/.test(text);
    }

    // 获取工单ID
    function getCurrentTicketID() {
        const elements = document.querySelectorAll('p, div, span');
        for (const el of elements) {
            const text = el.textContent.trim();
            if (/^\d{14}$/.test(text)) {
                return text;
            }
        }
        return null;
    }

    // ===================== 核心功能：状态检测 =====================

    // 检测当前网页状态
    function detectCurrentState() {
        // 查找任务标题输入框
        const titleInput = document.querySelector('input[placeholder="请输入任务标题"]');

        if (!titleInput) {
            return STATE.INITIAL;
        }

        // 检查是否可编辑
        if (titleInput.disabled || titleInput.readOnly) {
            return STATE.INITIAL;
        }

        // 检查关联第三方按钮是否存在
        const associateBtn = Array.from(document.querySelectorAll('.el-button')).find(
            btn => btn.textContent.trim() === '关联第三方'
        );

        // 如果关联第三方按钮存在且可见，说明已经关联了
        if (associateBtn && isElementVisible(associateBtn)) {
            return STATE.ASSOCIATED;
        }

        // 检查是否有搜索框弹出
        const searchContainer = document.querySelector('.el-select-dropdown[style*="display: block"], .el-select-dropdown:not([style*="display: none"])');
        if (searchContainer && isElementVisible(searchContainer)) {
            return STATE.SEARCHING;
        }

        return STATE.ASSOCIATED;
    }

    // 等待到达目标状态
    function waitForState(targetState, timeout = CONFIG.maxWaitForAssociated) {
        return new Promise((resolve) => {
            const startTime = Date.now();
            const check = () => {
                const currentState = detectCurrentState();
                if (currentState >= targetState) {
                    state.currentState = currentState;
                    log(`状态已到达: ${currentState}`);
                    debugLog(`✓ 状态已到达: ${currentState}`, 'success');
                    resolve(currentState);
                } else if (Date.now() - startTime < timeout) {
                    setTimeout(check, CONFIG.stateCheckInterval);
                } else {
                    log(`等待状态超时，当前: ${currentState}, 目标: ${targetState}`);
                    debugLog(`⚠ 等待状态超时`, 'warn');
                    resolve(currentState);
                }
            };
            check();
        });
    }

    // ===================== 核心功能：元素查找 =====================

    // 稳健的标题输入框查找（TreeWalker + CSS选择器）
    function findTitleInputRobust() {
        // 优先使用精确选择器
        const titleInput = document.querySelector('input[placeholder="请输入任务标题"]');
        if (titleInput && isElementVisible(titleInput) && !titleInput.disabled && !titleInput.readOnly) {
            return titleInput;
        }

        // 备用：使用 TreeWalker 遍历
        const walker = document.createTreeWalker(
            document.body,
            NodeFilter.SHOW_TEXT,
            null,
            false
        );

        let node;
        while (node = walker.nextNode()) {
            if (node.textContent.trim() === '任务标题') {
                const parent = node.parentElement;
                if (parent && isElementVisible(parent)) {
                    const container = parent.parentElement;
                    if (container) {
                        let sibling = container.nextElementSibling;
                        while (sibling) {
                            if (sibling.classList && sibling.classList.contains('detail')) {
                                const input = sibling.querySelector('input');
                                if (input && isElementVisible(input) && !input.disabled && !input.readOnly) {
                                    return input;
                                }
                            }
                            sibling = sibling.nextElementSibling;
                        }
                    }
                }
            }
        }

        return null;
    }

    // 查找下拉框输入框（通过标签文本）
    function findDropdownInput(labelText) {
        const walker = document.createTreeWalker(
            document.body,
            NodeFilter.SHOW_TEXT,
            null,
            false
        );

        let node;
        while (node = walker.nextNode()) {
            if (node.textContent.trim() === labelText) {
                const parent = node.parentElement;
                if (parent && isElementVisible(parent)) {
                    const container = parent.parentElement;
                    if (container) {
                        let sibling = container.nextElementSibling;
                        while (sibling) {
                            if (sibling.classList && sibling.classList.contains('detail')) {
                                const select = sibling.querySelector('.el-select');
                                if (select) {
                                    const input = select.querySelector('input');
                                    if (input && isElementVisible(input)) {
                                        return input;
                                    }
                                }
                            }
                            sibling = sibling.nextElementSibling;
                        }
                    }
                }
            }
        }

        return null;
    }

    // ===================== 核心功能：复制 =====================

    // 提取内部描述（保留换行，图片转链接）
    function extractInternalDescription() {
        const allElements = document.querySelectorAll('p, div, span, label');
        let internalDescEl = null;
        let descEl = null;

        for (const el of allElements) {
            const text = el.textContent.trim();
            if (text === '内部描述' || text === '内部描述*') {
                internalDescEl = el;
            }
            if ((text === '描述' || text === '描述*') && !text.includes('内部')) {
                descEl = el;
            }
        }

        if (!internalDescEl) {
            log('未找到"内部描述"标签');
            return '';
        }

        let contentEl = null;

        // 收集"内部描述"与"描述"之间的所有节点
        const parent = internalDescEl.parentElement;
        if (parent) {
            let sibling = parent.nextElementSibling;
            let tempContainer = document.createElement('div');

            while (sibling) {
                if (descEl && sibling.contains(descEl)) {
                    break;
                }
                tempContainer.appendChild(sibling.cloneNode(true));
                sibling = sibling.nextElementSibling;
            }

            if (tempContainer.childNodes.length > 0) {
                contentEl = tempContainer;
            }
        }

        if (!contentEl) {
            return extractViaInnerText();
        }

        const extracted = extractContentWithImages(contentEl);
        state.copiedText = extracted;
        log('提取内部描述成功，长度:', extracted.length);
        debugLog(`✓ 提取内部描述成功，长度: ${extracted.length}`, 'success');
        return extracted;
    }

    // 提取内容并处理图片（TreeWalker 手动拼接）
    function extractContentWithImages(element) {
        const clone = element.cloneNode(true);
        const images = clone.querySelectorAll('img');
        images.forEach(img => {
            const src = img.src || img.getAttribute('data-src');
            if (src) {
                const linkText = document.createTextNode(`  ${src} `);
                img.parentNode.replaceChild(linkText, img);
            } else {
                img.remove();
            }
        });

        const walker = document.createTreeWalker(
            clone,
            NodeFilter.SHOW_TEXT,
            null,
            false
        );

        const textParts = [];
        let node;
        while (node = walker.nextNode()) {
            const text = node.textContent.trim();
            if (text) {
                textParts.push(text);
            }
        }

        return textParts.join('\n').replace(/^(内部描述[\*\s]*[：:]?\s*)/i, '').trim();
    }

    // 备用提取方案
    function extractViaInnerText() {
        const bodyText = document.body.innerText;
        const startIdx = bodyText.indexOf('内部描述');
        if (startIdx === -1) return '';

        const searchStart = startIdx + 4;
        const endIdx = bodyText.indexOf('描述', searchStart);
        if (endIdx === -1) return '';

        let extracted = bodyText.slice(searchStart, endIdx).trim();
        extracted = extracted.replace(/^[：:\s]+/, '');

        state.copiedText = extracted;
        log('通过innerText提取内部描述成功');
        return extracted;
    }

    // ===================== 核心功能：ServerID判断 =====================

    function determineHeading(text) {
        if (!text) {
            log('传入的文本为空，无法判断ServerID');
            return false;
        }

        const serverIdPattern = /ServerID\s*=\s*(\d{4,5})\s*,?/gi;
        const matches = [];
        let match;

        while ((match = serverIdPattern.exec(text)) !== null) {
            matches.push(match[1]);
        }

        log('ServerID匹配结果:', matches);

        if (matches.length === 0) {
            log(`未找到ServerID`);
            debugLog(`⚠ 未找到ServerID`, 'warn');
            return false;
        }

        // 优化：如果有多个，使用第一个有效的
        const serverID = matches[0];
        if (matches.length > 1) {
            log(`警告：检测到多个ServerID，使用第一个: ${serverID}`);
            debugLog(`⚠ 检测到多个ServerID(${matches.length}个)`, 'warn');
        }

        log('提取到ServerID:', serverID);

        const isTestServer = serverID.startsWith('57');

        state.leftHeading = isTestServer ? CONFIG.testServer : CONFIG.fullServer;
        state.versionNumber = extractVersion(state.leftHeading);
        state.channelText = isTestServer ? '测服' : '全服';
        state.faxiandiedai = extractFaxiandiedai(state.leftHeading);

        log('ServerID:', serverID, '| 类型:', state.channelText, '| 版本:', state.versionNumber, '| 迭代:', state.faxiandiedai);
        debugLog(`✓ 识别环境: ${state.channelText}, 版本: ${state.versionNumber}, 迭代: ${state.faxiandiedai}`, 'success');
        return true;
    }

    // ===================== 核心功能：标题处理（替换+翻译） =====================

    // 稳健的输入模拟
    function simulateInputValue(element, text) {
        if (!element) return false;
        try {
            element.focus();

            const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
            nativeSetter.call(element, text);

            const events = ['input', 'change', 'keydown', 'keyup'];
            events.forEach(eventType => {
                element.dispatchEvent(new Event(eventType, { bubbles: true }));
            });

            element.dispatchEvent(new Event('compositionstart', { bubbles: true }));
            element.dispatchEvent(new Event('compositionend', { bubbles: true }));

            return true;
        } catch (e) {
            logError('模拟输入失败:', e);
            return false;
        }
    }

    // 翻译模块
    function translateViaGoogle(text) {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'GET',
                url: `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=zh-CN&dt=t&q=${encodeURIComponent(text)}`,
                timeout: CONFIG.translateTimeout,
                onload: (response) => {
                    try {
                        const result = JSON.parse(response.responseText);
                        resolve(result[0][0][0]);
                    } catch (e) {
                        reject(e);
                    }
                },
                onerror: reject,
                ontimeout: reject
            });
        });
    }

    function translateViaMyMemory(text) {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'GET',
                url: `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=en|zh`,
                timeout: CONFIG.translateTimeout,
                onload: (response) => {
                    try {
                        const result = JSON.parse(response.responseText);
                        resolve(result.responseData.translatedText);
                    } catch (e) {
                        reject(e);
                    }
                },
                onerror: reject,
                ontimeout: reject
            });
        });
    }

    async function translateText(text) {
        if (state.translateCount >= CONFIG.translateDailyLimit) {
            log('已达翻译次数上限');
            return text;
        }

        if (hasChinese(text)) {
            log('文本已包含中文，跳过翻译');
            return text;
        }

        const translators = [
            { name: 'Google', fn: translateViaGoogle },
            { name: 'MyMemory', fn: translateViaMyMemory }
        ];

        for (const translator of translators) {
            try {
                log('尝试使用', translator.name, '翻译');
                const result = await Promise.race([
                    translator.fn(text),
                    new Promise((_, reject) =>
                        setTimeout(() => reject(new Error('timeout')), CONFIG.translateTimeout)
                    )
                ]);

                if (result && result !== text) {
                    state.translateCount++;
                    log('翻译成功:', result);
                    return result;
                }
            } catch (e) {
                log(translator.name, '翻译失败:', e.message);
            }
        }

        log('所有翻译源均失败，返回原文');
        return text;
    }

    // 统一的标题处理函数
    async function processTitleOptimized() {
        if (state.hasProcessedTitle) {
            log('标题已处理过，跳过');
            return;
        }

        const maxRetries = 10; // 增加重试次数
        const retryDelay = 800;

        for (let i = 0; i < maxRetries; i++) {
            const input = findTitleInputRobust();

            if (!input) {
                log(`尝试 ${i + 1}/${maxRetries}: 未找到可编辑的标题输入框`);
                if (i < maxRetries - 1) {
                    await new Promise(resolve => setTimeout(resolve, retryDelay));
                    continue;
                } else {
                    log('最终未找到标题输入框，放弃处理');
                    return;
                }
            }

            const currentValue = input.value || '';

            // 检查是否已包含前缀
            if (currentValue.startsWith(state.leftHeading)) {
                log('标题前缀已存在，跳过');
                state.hasProcessedTitle = true;
                return;
            }

            const colonMatch = currentValue.match(/[：:]/);
            if (!colonMatch) {
                log('标题中未找到冒号');
                return;
            }

            const colonIndex = colonMatch.index;
            const prefixPart = currentValue.substring(0, colonIndex);

            // MCGG检测
            if (/mcgg/i.test(prefixPart)) {
                log('标题包含MCGG，不处理');
                state.hasProcessedTitle = true;
                return;
            }

            const contentPart = currentValue.substring(colonIndex + 1).trim();

            // 翻译
            let translatedContent = contentPart;
            if (contentPart && !hasChinese(contentPart)) {
                log('开始翻译标题内容:', contentPart);
                translatedContent = await translateText(contentPart);
            }

            const newTitle = state.leftHeading + translatedContent + ' ' + contentPart;

            log('应用新标题:', newTitle);
            const success = simulateInputValue(input, newTitle);

            if (success) {
                state.hasProcessedTitle = true;
                log('✓ 标题处理成功');
                debugLog('✓ 标题处理成功', 'success');
                return;
            }
        }
    }

    // ===================== 核心功能：自动填充（焦点监听） =====================

    // 查找下拉框的搜索输入框
    function findSearchInputInDropdown() {
        const dropdown = document.querySelector('.el-select-dropdown:not([style*="display: none"])');
        if (!dropdown) return null;

        const searchInput = dropdown.querySelector('input[type="text"]');
        if (searchInput && isElementVisible(searchInput)) {
            return searchInput;
        }

        return null;
    }

    // 填充下拉框搜索
    async function fillDropdownSearch(text) {
        const searchInput = findSearchInputInDropdown();
        if (!searchInput) {
            log('未找到下拉搜索框');
            return false;
        }

        try {
            searchInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
            searchInput.focus();
            await new Promise(resolve => setTimeout(resolve, CONFIG.dropdownFillDelay));

            const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
            nativeSetter.call(searchInput, text);

            searchInput.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
            searchInput.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));

            searchInput.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: text[0] || 'a' }));
            searchInput.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: text[text.length - 1] || 'a' }));

            log('下拉框填充成功:', text);
            debugLog(`✓ 填充下拉框: ${text}`, 'success');
            return true;
        } catch (e) {
            logError('下拉框填充失败:', e);
            return false;
        }
    }

    // 处理渠道填充
    async function handleChannelFocus() {
        if (state.channelFilled) return;

        log('渠道输入框获得焦点，准备填充:', state.channelText);
        debugLog(`📍 渠道焦点: ${state.channelText}`, 'info');

        await new Promise(resolve => setTimeout(resolve, CONFIG.dropdownWaitTime));

        const success = await fillDropdownSearch(state.channelText);
        if (success) {
            state.channelFilled = true;
        }
    }

    // 处理发现迭代填充
    async function handleIterationFocus() {
        if (state.iterationFilled) return;

        log('发现迭代输入框获得焦点，准备填充:', state.faxiandiedai);
        debugLog(`📍 发现迭代焦点: ${state.faxiandiedai}`, 'info');

        await new Promise(resolve => setTimeout(resolve, CONFIG.dropdownWaitTime));

        const success = await fillDropdownSearch(state.faxiandiedai);
        if (success) {
            state.iterationFilled = true;
        }
    }

    // 全局焦点监听（事件委托）
    function setupGlobalFocusListener() {
        if (state.focusListenersAttached) {
            log('焦点监听器已设置，跳过');
            return;
        }

        log('设置全局焦点监听器');

        document.addEventListener('focusin', async (e) => {
            const target = e.target;
            if (!target || target.tagName !== 'INPUT') return;

            // 检查是否是渠道输入框
            const channelInput = findDropdownInput('渠道');
            if (channelInput && target === channelInput) {
                await handleChannelFocus();
                return;
            }

            // 检查是否是发现迭代输入框
            const iterationInput = findDropdownInput('发现迭代');
            if (iterationInput && target === iterationInput) {
                await handleIterationFocus();
                return;
            }
        }, true);

        state.focusListenersAttached = true;
        log('✓ 全局焦点监听器已设置');
    }

    // ===================== UI组件 =====================

    function createCopyStatusBox() {
        if (document.getElementById('copy-status-box')) {
            return;
        }

        const box = document.createElement('div');
        box.id = 'copy-status-box';
        box.textContent = '效率';
        box.title = '点击复制内部描述';

        box.addEventListener('click', () => {
            if (state.copiedText) {
                navigator.clipboard.writeText(state.copiedText).then(() => {
                    box.textContent = '专注';
                    box.classList.add('copied');
                    log('内部描述已复制到剪贴板');
                    debugLog('✓ 已复制内部描述', 'success');
                    setTimeout(() => {
                        box.textContent = '效率';
                        box.classList.remove('copied');
                    }, 1500);
                }).catch(err => {
                    logError('复制失败:', err);
                });
            } else {
                log('无内容可复制');
            }
        });

        let isDragging = false;
        let offsetX, offsetY;

        box.addEventListener('mousedown', (e) => {
            if (e.button !== 0) return;
            isDragging = true;
            offsetX = e.clientX - box.offsetLeft;
            offsetY = e.clientY - box.offsetTop;
            box.style.cursor = 'grabbing';
        });

        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            box.style.left = (e.clientX - offsetX) + 'px';
            box.style.top = (e.clientY - offsetY) + 'px';
            box.style.right = 'auto';
        });

        document.addEventListener('mouseup', () => {
            if (isDragging) {
                isDragging = false;
                box.style.cursor = 'move';
            }
        });

        document.body.appendChild(box);
        log('✓ 复制状态框已创建');
    }

    // ===================== 主流程 =====================

    // 处理工单
    async function processTicket() {
        if (state.isProcessing) {
            log('正在处理中，跳过重复执行');
            return;
        }

        state.isProcessing = true;
        log('========== 开始处理工单 ==========');

        try {
            // 需求1：复制（立即执行，不受状态影响）
            const internalDesc = extractInternalDescription();
            if (!internalDesc) {
                log('未提取到内部描述，中止处理');
                state.isProcessing = false;
                return;
            }

            // 需求2：判断ServerID
            const hasValidServer = determineHeading(internalDesc);
            if (!hasValidServer) {
                log('ServerID验证失败，跳过标题处理');
                state.isProcessing = false;
                return;
            }

            // 检测当前状态
            state.currentState = detectCurrentState();
            log('当前网页状态:', state.currentState);

            // 需求2-3：等待状态2并处理标题
            if (state.currentState < STATE.ASSOCIATED) {
                log('等待关联第三方加载...');
                debugLog('⏳ 等待关联第三方加载...', 'info');
                await waitForState(STATE.ASSOCIATED, CONFIG.maxWaitForAssociated);
            }

            if (state.currentState >= STATE.ASSOCIATED) {
                await processTitleOptimized();
            }

            // 需求4-5：设置焦点监听（不阻塞）
            setupGlobalFocusListener();

            log('========== 工单处理完成 ==========');

        } catch (e) {
            logError('处理工单时发生异常:', e);
        } finally {
            state.isProcessing = false;
        }
    }

    // 重置状态
    function resetState() {
        state.hasProcessedTitle = false;
        state.channelFilled = false;
        state.iterationFilled = false;
        state.copiedText = '';
        state.leftHeading = '';
        state.versionNumber = '';
        state.channelText = '';
        state.faxiandiedai = '';
        state.currentState = STATE.INITIAL;
        state.focusListenersAttached = false;
    }

    // 监控工单变化
    function monitorTicketChange() {
        setInterval(() => {
            const newTicketID = getCurrentTicketID();

            if (newTicketID && newTicketID !== state.currentTicketID) {
                log(`工单切换: ${state.currentTicketID || '(无)'} -> ${newTicketID}`);
                debugLog(`🆕 检测到新工单: ${newTicketID}`, 'success');
                state.currentTicketID = newTicketID;
                resetState();

                setTimeout(() => {
                    processTicket();
                }, 500);
            }
        }, CONFIG.checkInterval);
    }

    // ===================== 初始化 =====================
    function init() {
        log('========================================');
        log('工单助手 v5.7 已启动');
        log('调试模式:', CONFIG.debug);
        log('最大等待关联第三方时间:', CONFIG.maxWaitForAssociated / 1000, '秒');
        log('========================================');

        createDebugConsole();
        createCopyStatusBox();
        monitorTicketChange();

        setTimeout(() => {
            const ticketID = getCurrentTicketID();
            if (ticketID) {
                log('检测到工单:', ticketID);
                state.currentTicketID = ticketID;
                processTicket();
            } else {
                log('未检测到工单ID');
            }
        }, 1000);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();

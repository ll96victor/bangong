// ==UserScript==
// @name         工单助手与Task客服信息提取合并版
// @namespace    http://tampermonkey.net/
// @version      6.0.0
// @description  合并功能：1. 自动翻译、内部描述复制、下拉框填充；2. Task 客服信息提取一键复制。
// @author       AI Combined
// @match        https://ml-panel.aihelp.net/*
// @match        https://ml.aihelp.net/*
// @match        https://aihelp.net.cn/*
// @match        https://aihelp.net/*
// @exclude      *://*/dashboard/#/newpage-ticket
// @exclude      *://*/dashboard/#/newpage-ticket/*
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @grant        GM_setClipboard
// @connect      translate.googleapis.com
// @connect      api.mymemory.translated.net
// @run-at       document-end
// ==/UserScript==

/**
 * 冲突处理说明：
 * 1. 作用域隔离：采用两个独立的 IIFE 包裹原脚本逻辑，变量和函数名互不干扰。
 * 2. 元数据合并：合并了所有的 @match, @grant 和 @connect 声明。
 * 3. DOM 安全：脚本 A 使用 ID (copy-status-box, debug-console)，脚本 B 使用 ID (aihelp-task-copy)，无命名冲突。
 * 4. 逻辑优化：提取公共页面判定逻辑 (isTargetPage)，避免在两个逻辑块中重复执行相同的 URL 检查。
 */

(function() {
    'use strict';

    // ===================== 公共区域：判定逻辑 =====================
    function isTargetPage() {
        const url = window.location.href;
        return url.includes('task?orderId') || url.includes('tasks?searchType');
    }

    if (!isTargetPage()) {
        // console.log('[合并脚本] 当前非目标 Task 页面，停止运行。');
        return;
    }

    // ==========================================
    // 脚本 A：工单助手 - 自动翻译与内部描述复制
    // ==========================================
    (function() {
        // ... 脚本 A 原有逻辑 (去掉了内部的 URL 判定) ...


    // ===================== 用户配置区 =====================
    const CONFIG = {
        fullServerLists: ["【2.1.40全服】：", "【2.1.18全服】：", "【40.2全服】：", "【18.2全服】："],
        testServerLists: ["【40.2测服】：", "【2.1.52测服】：", "【1.9.88测服】：", "【2.1.50测服】："],

        fullServer: "【40.2全服】：",
        testServer: "【2.1.56测服】：",

        translateDailyLimit: 150,
        translateTimeout: 6000,

        checkInterval: 500,
        titleRetryDelay: 1000,
        titleMaxWaitTime: 20000,
        dropdownWaitTime: 300,
        dropdownFillDelay: 100,

        removeTrailingPunctuation: true,

        debug: true
    };

    // ===================== 全局状态 =====================
    let state = {
        currentTicketID: null,
        copiedText: '',
        leftHeading: '',
        versionNumber: '',
        channelText: '',
        faxiandiedai: '',
        hasProcessedTitle: false,
        translateCount: 0,
        isProcessing: false,
        isTitleProcessing: false, // 唯一新增的安全锁
        channelFilled: false,
        iterationFilled: false,
        focusListenersAttached: false
    };

    // ===================== 调试日志 =====================
    function log(...args) {
        if (CONFIG.debug) {
            console.log('[工单助手 v5.9.8]', ...args);
        }
    }

    function logError(...args) {
        console.error('[工单助手 v5.9.8 错误]', ...args);
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
            border-radius:4px;
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
            top:20px;
            left:20px;
            width: 320px;
            max-height: 350px;
            background: rgba(0, 0, 0, 0.85);
            color: #00ff00;
            font-family: monospace;
            font-size: 11px;
            padding: 8px;
            border-radius:4px;
            z-index: 999999;
            overflow-y: auto;
            border:1px solid #444;
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
        const time = new Date().toLocaleTimeString();
        entry.textContent = `[${time}] ${msg}`;
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
            <h3>脚本运行日志 v5.9.8 <button onclick="this.parentElement.parentElement.style.display='none'">关闭</button></h3>
            <div id="debug-console-content"></div>
        `;
        document.body.appendChild(box);
        debugLog('调试面板已启动', 'success');
    }

    // ===================== 工具函数 =====================

    function isInputAvailable(el) {
        if (!el) return false;
        try {
            const style = window.getComputedStyle(el);
            return style.display !== 'none' &&
                   style.visibility !== 'hidden' &&
                   style.opacity !== '0' &&
                   el.offsetParent !== null &&
                   !el.disabled;
        } catch (e) {
            return false;
        }
    }

    function extractVersion(text) {
        const match = text.match(/(\d+(?:\.\d+)+)/);
        return match ? match[1] : '';
    }

    function extractFaxiandiedai(heading) {
        const match = heading.match(/【(.+?)全服】|【(.+?)测服】/);
        if (match) {
            return match[1] || match[2] || '';
        }
        return '';
    }

    function hasChinese(text) {
        return /[\u4e00-\u9fa5]/.test(text);
    }

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

    // ===================== 核心功能：内部描述提取 =====================
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
                log('通过临时容器收集到', tempContainer.childNodes.length, '个节点');
            }
        }

        if (!contentEl) {
            let sibling = internalDescEl.nextElementSibling;
            while (sibling) {
                if (descEl && sibling.contains(descEl)) {
                    break;
                }
                const text = sibling.textContent.trim();
                if (text && text !== '内部描述') {
                    contentEl = sibling;
                    break;
                }
                sibling = sibling.nextElementSibling;
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

        let text = textParts.join('\n');
        text = text.replace(/^(内部描述[\*\s]*[：:]?\s*)/i, '');
        return text.trim();
    }

    function extractViaInnerText() {
        const bodyText = document.body.innerText;
        const startIdx = bodyText.indexOf('内部描述');
        if (startIdx === -1) {
            log('未找到"内部描述"文本');
            return '';
        }

        const searchStart = startIdx + 4;
        const endIdx = bodyText.indexOf('描述', searchStart);
        if (endIdx === -1) {
            log('未找到"描述"结束标记');
            return '';
        }

        let extracted = bodyText.slice(searchStart, endIdx).trim();
        extracted = extracted.replace(/^[：:\s]+/, '');

        state.copiedText = extracted;
        log('通过innerText提取内部描述成功，长度:', extracted.length);
        return extracted;
    }

    // ===================== 核心功能：ServerID 判断 =====================
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
            log('未找到ServerID');
            debugLog('未找到ServerID', 'warn');
            return false;
        }

        const serverID = matches[0];
        if (matches.length > 1) {
            log(`警告：检测到多个ServerID，使用第一个: ${serverID}`);
            debugLog(`检测到多个ServerID(${matches.length}个)，使用第一个`, 'warn');
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

    // ===================== 核心功能：稳健查找任务标题输入框 =====================
    function findTitleInputRobust() {
        const byPlaceholder = document.querySelector('input[placeholder="请输入任务标题"]');
        if (byPlaceholder && isInputAvailable(byPlaceholder)) {
            return byPlaceholder;
        }

        const walker = document.createTreeWalker(
            document.body,
            NodeFilter.SHOW_TEXT,
            null,
            false
        );

        let node;
        while (node = walker.nextNode()) {
            const text = node.textContent.trim();
            if (text === '任务标题') {
                const parent = node.parentElement;
                if (parent) {
                    let container = parent.parentElement;
                    if (container) {
                        let sibling = container.nextElementSibling;
                        while (sibling) {
                            if (sibling.classList && sibling.classList.contains('detail')) {
                                const input = sibling.querySelector('input');
                                if (input && isInputAvailable(input)) {
                                    return input;
                                }
                            }
                            sibling = sibling.nextElementSibling;
                        }
                        const fallback = container.querySelector('input');
                        if (fallback && isInputAvailable(fallback)) {
                            return fallback;
                        }
                    }
                }
            }
        }
        return null;
    }

    // ===================== 核心功能：标题前缀替换 + 翻译 =====================
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

    async function processTitleWithRetry() {
        if (state.hasProcessedTitle || state.isTitleProcessing) {
            log('标题已处理过或正在处理中，跳过');
            return;
        }
        state.isTitleProcessing = true; // 安全锁

        const startTime = Date.now();
        log('开始等待任务标题输入框变为可用状态...');

        try {
            while (Date.now() - startTime < CONFIG.titleMaxWaitTime) {
                const input = findTitleInputRobust();

                if (input) {
                    const currentValue = input.value || '';
                    if (currentValue.startsWith(state.leftHeading)) {
                        log('标题前缀已存在，跳过');
                        state.hasProcessedTitle = true;
                        return;
                    }

                    const colonMatch = currentValue.match(/[：:]/);
                    if (!colonMatch) {
                        log('标题中未找到冒号，等待重试...');
                    } else {
                        const colonIndex = colonMatch.index;
                        const prefixPart = currentValue.substring(0, colonIndex);

                        if (/mcgg/i.test(prefixPart)) {
                            log('标题包含MCGG，不处理');
                            state.hasProcessedTitle = true;
                            return;
                        }

                        const contentPart = currentValue.substring(colonIndex + 1).trim();

                        let translatedContent = '';

                        if (contentPart && !hasChinese(contentPart)) {
                            log('开始翻译标题内容:', contentPart);
                            translatedContent = await translateText(contentPart);

                            if (CONFIG.removeTrailingPunctuation) {
                                translatedContent = translatedContent.replace(/[。.!?！？]+$/, '');
                            }
                        } else {
                            log('内容包含中文，跳过翻译');
                        }

                        let newTitle;
                        if (translatedContent) {
                            newTitle = state.leftHeading + translatedContent + ' ' + contentPart;
                        } else {
                            newTitle = state.leftHeading + contentPart;
                        }

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

                await new Promise(resolve => setTimeout(resolve, CONFIG.titleRetryDelay));
            }
        } finally {
            state.isTitleProcessing = false;
        }

        log('等待超时，未能处理标题');
    }

    // ===================== 翻译模块 =====================
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

    // ===================== 下拉框填充模块 ======================

    function waitForDropdownSearchInput(timeout = 1200) {
        return new Promise(resolve => {
            const startTime = Date.now();
            const check = () => {
                const dropdown = document.querySelector('.el-select-dropdown:not([style*="display: none"])');
                if (dropdown) {
                    const input = dropdown.querySelector('input[type="text"]');
                    if (input) {
                        resolve(input);
                        return;
                    }
                }

                if (Date.now() - startTime < timeout) {
                    setTimeout(check, 50);
                } else {
                    resolve(null);
                }
            };
            check();
        });
    }

    async function fillDropdownSearch(text) {
        const searchInput = await waitForDropdownSearchInput();
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

    async function handleChannelFocus() {
        if (state.channelFilled) return;
        log('渠道输入框获得焦点，准备填充:', state.channelText);
        const success = await fillDropdownSearch(state.channelText);
        if (success) state.channelFilled = true;
    }

    async function handleIterationFocus() {
        if (state.iterationFilled) return;
        log('发现迭代输入框获得焦点，准备填充:', state.faxiandiedai);
        const success = await fillDropdownSearch(state.faxiandiedai);
        if (success) state.iterationFilled = true;
    }

    function findLabelText(targetInput) {
        let formItem = targetInput.closest('.el-form-item');
        if (formItem) {
            const labelSpan = formItem.querySelector('.el-form-item__label__content');
            if (labelSpan) {
                return labelSpan.textContent.trim();
            }
        }

        let parent = targetInput;
        let maxDepth = 6;
        while (parent && parent !== document.body && maxDepth > 0) {
            if (parent.classList && parent.classList.contains('detail')) {
                let sibling = parent.previousElementSibling;
                while (sibling) {
                    if (sibling.classList && sibling.classList.contains('title-of-work-order')) {
                        return sibling.textContent.trim();
                    }
                    sibling = sibling.previousElementSibling;
                }
                break;
            }
            parent = parent.parentElement;
            maxDepth--;
        }
        return '';
    }

    function setupGlobalFocusListener() {
        if (state.focusListenersAttached) return;
        log('设置全局焦点监听器 (极速版)');

        document.addEventListener('focusin', async (e) => {
            const target = e.target;
            if (!target || target.tagName !== 'INPUT') return;

            const labelText = findLabelText(target);

            if (labelText.includes('渠道')) {
                await handleChannelFocus();
            } else if (labelText.includes('发现迭代')) {
                await handleIterationFocus();
            }
        }, true);

        state.focusListenersAttached = true;
        log('✓ 全局焦点监听器已设置');
    }

    // ===================== UI组件 =====================
    function createCopyStatusBox() {
        if (document.getElementById('copy-status-box')) return;
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
    async function processTicket() {
        if (state.isProcessing) {
            log('正在处理中，跳过重复执行');
            return;
        }

        state.isProcessing = true;
        log('========== 开始处理工单 ==========');

        try {
            const internalDesc = extractInternalDescription();
            if (!internalDesc) {
                log('未提取到内部描述，中止处理');
                state.isProcessing = false;
                return;
            }

            const hasValidServer = determineHeading(internalDesc);
            if (!hasValidServer) {
                log('ServerID验证失败，跳过标题处理');
                state.isProcessing = false;
                return;
            }

            await processTitleWithRetry();
            setupGlobalFocusListener();

            log('========== 工单处理完成 ==========');

        } catch (e) {
            logError('处理工单时发生异常:', e);
        } finally {
            state.isProcessing = false;
        }
    }

    function resetState() {
        state.hasProcessedTitle = false;
        state.channelFilled = false;
        state.iterationFilled = false;
        state.copiedText = '';
        state.leftHeading = '';
        state.versionNumber = '';
        state.channelText = '';
        state.faxiandiedai = '';
        state.focusListenersAttached = false;
    }

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
        log('工单助手 v5.9.8 已启动 (复刻稳定版)');
        log('调试模式:', CONFIG.debug);
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

// ==========================================
// 脚本 B：AiHelp Task 客服信息提取一键复制
// ==========================================
(function() {
    'use strict';

    const DEBUG = true;
    function log(...args) {
        if (DEBUG) console.log('[AiHelp Task Debug]', ...args);
    }


    // ==================== 1. 核心提取逻辑 ====================
    function extractTaskInfo() {
        let extractedUrl = '';
        let agentName = '';
        let agentPrefix = '';

        log('--- 开始提取 Task 信息 ---');

        try {
            const bodyText = document.body.innerText;
            const urlRegex = /[【\[]\s*(https?:\/\/[^】\]\s]+)\s*[】\]]/;
            const urlMatch = bodyText.match(urlRegex);

            if (urlMatch) {
                extractedUrl = urlMatch[1];
            } else {
                const anyUrlMatch = bodyText.match(/https?:\/\/[\w\-\.]+\.aihelp\.net\/[^\s【】\[\]]+/);
                if (anyUrlMatch) extractedUrl = anyUrlMatch[0];
            }

            const creatorXPath = "//*[contains(text(), '工单创建人')]";
            const result = document.evaluate(creatorXPath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
            const creatorNode = result.singleNodeValue;

            if (creatorNode) {
                const namePattern = /([A-Z]+)-([A-Za-z0-9_]+)/;
                const checkText = (text) => {
                    if (!text) return null;
                    const m = text.match(namePattern);
                    return m ? { prefix: m[1], name: m[2] } : null;
                };

                let res = checkText(creatorNode.innerText) || (creatorNode.parentElement ? checkText(creatorNode.parentElement.innerText) : null);
                if (!res) {
                    let sib = creatorNode.nextElementSibling;
                    while (sib) {
                        res = checkText(sib.innerText);
                        if (res) break;
                        sib = sib.nextElementSibling;
                    }
                }
                if (!res && creatorNode.parentElement) {
                    let parentSib = creatorNode.parentElement.nextElementSibling;
                    while (parentSib) {
                        res = checkText(parentSib.innerText);
                        if (res) break;
                        parentSib = parentSib.nextElementSibling;
                    }
                }

                if (res) {
                    agentPrefix = res.prefix;
                    agentName = res.name;
                }
            }
        } catch (error) {
            console.error('提取失败:', error);
        }

        return { url: extractedUrl, agentName: agentName, agentPrefix: agentPrefix };
    }

    async function retryTaskExtraction(maxRetries = 12, interval = 500) {
        for (let i = 0; i < maxRetries; i++) {
            const result = extractTaskInfo();
            if (result.agentName) return result;
            await new Promise(r => setTimeout(r, interval));
        }
        return extractTaskInfo();
    }

    async function handleCopyAction(button) {
        button.innerText = '检测中...';
        button.style.pointerEvents = 'none';

        try {
            const taskInfo = await retryTaskExtraction();
            const finalUrl = taskInfo.url || window.location.href;
            const finalAgentName = taskInfo.agentName;
            const finalPrefix = taskInfo.agentPrefix;

            if (!finalAgentName) {
                showFeedback(button, '未检测到内容', 'error');
            } else {
                const copyText = `${finalUrl} @${finalAgentName}`;
                GM_setClipboard(copyText);
                showFeedback(button, finalPrefix || '✓ 已复制', 'success');
            }
        } catch (e) {
            showFeedback(button, '系统错误', 'error');
        } finally {
            button.style.pointerEvents = 'auto';
        }
    }

    function showFeedback(btn, text, type) {
        const originalText = '复制 Task 信息';
        btn.innerText = text;
        if (type === 'success') btn.classList.add('success');
        if (type === 'error') btn.style.background = '#e53e3e';

        setTimeout(() => {
            btn.innerText = originalText;
            btn.classList.remove('success');
            btn.style.background = '';
        }, 1500);
    }

    function initCopyButton() {
        GM_addStyle(`
            #aihelp-task-copy {
                position: fixed;
                top: calc(33.33% - 20px);
                right: calc(33.33% - 20px);
                z-index: 99999;
                padding: 10px 14px;
                background: linear-gradient(135deg, #f6d365 0%, #fda085 100%);
                color: #fff;
                font-size: 12px;
                font-weight: 600;
                cursor: pointer;
                border-radius: 6px;
                box-shadow: 0 2px 12px rgba(253, 160, 133, 0.4);
                transition: all 0.25s ease;
                opacity: 0.9;
                user-select: none;
            }
            #aihelp-task-copy:hover { opacity: 1; transform: scale(1.05); }
            #aihelp-task-copy.success { background: linear-gradient(135deg, #11998e 0%, #38ef7d 100%) !important; }
        `);

        const copyButton = document.createElement('div');
        copyButton.id = 'aihelp-task-copy';
        copyButton.innerText = '复制 Task 信息';
        copyButton.addEventListener('click', () => handleCopyAction(copyButton));
        document.body.appendChild(copyButton);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initCopyButton);
    } else {
        initCopyButton();
    }
})();

})(); // 结束最外层公共判定包裹


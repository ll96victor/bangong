// ==UserScript==
// @name         工单助手 - 自动翻译与内部描述复制 v5.4 需求四/五精准版
// @namespace    http://tampermonkey.net/
// @version      5.4
// @description  【核心修复】精准实现需求四（渠道填测服/全服）和需求五（迭代填版本号），逻辑完全分离
// @author       ll96victor (Requirements 4&5 Fix v5.4)
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

    // ===================== 配置区 =====================
    const CONFIG = {
        fullServer: "【2.1.40全服】：",
        testServer: "【40.2测服】：",
        translateTimeout: 15000,
        checkInterval: 500,
        debug: true
    };

    // ===================== 全局状态 =====================
    let state = {
        currentTicketID: null,
        copiedText: '',
        leftHeading: '',
        versionNumber: '',
        channelText: '',
        faxiandiedai: '', // 新增：存储leftheading的小数点值
        hasProcessedTitle: false,
        processedDropdowns: new WeakSet()
    };

    // ===================== 样式注入 =====================
    GM_addStyle(`
        /* 复制按钮样式 */
        #copy-status-box {
            position: fixed;
            top: 120px;
            right: 20px;
            padding: 8px 12px;
            background: rgba(51, 112, 255, 0.9);
            color: white;
            border-radius: 6px;
            font-size: 13px;
            cursor: move;
            z-index: 999999;
            user-select: none;
            box-shadow: 0 2px 8px rgba(0,0,0,0.15);
            font-family: sans-serif;
            max-width: 60px;
            text-align: center;
        }
        #copy-status-box:hover { background: rgba(40, 90, 204, 0.95); }
        #copy-status-box.copied { background: rgba(82, 196, 26, 0.9); }

        /* 调试面板样式 */
        #debug-console {
            position: fixed;
            top: 20px;
            left: 20px;
            width: 350px;
            max-height: 400px;
            background: rgba(0, 0, 0, 0.85);
            color: #00ff00;
            font-family: monospace;
            font-size: 12px;
            padding: 10px;
            border-radius: 4px;
            z-index: 999999;
            overflow-y: auto;
            border: 1px solid #444;
            display: block;
        }
        #debug-console h3 {
            margin: 0 0 10px 0;
            color: white;
            font-size: 14px;
            border-bottom: 1px solid #666;
            padding-bottom: 5px;
            display: flex;
            justify-content: space-between;
        }
        #debug-console button {
            background: #333;
            color: white;
            border: 1px solid #666;
            cursor: pointer;
            padding: 2px 5px;
        }
        .log-entry { margin-bottom: 4px; border-bottom: 1px solid #333; padding-bottom: 2px; }
        .log-error { color: #ff4444; }
        .log-warn { color: #ffaa00; }
        .log-success { color: #00cc00; }
        .log-info { color: #88ccff; }
    `);

    // ===================== 调试工具 =====================
    function debugLog(msg, type = 'info') {
        if (!CONFIG.debug) return;
        console.log(`[工单助手] ${msg}`);

        const consoleDiv = document.getElementById('debug-console-content');
        if (consoleDiv) {
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
    }

    function createDebugConsole() {
        if (document.getElementById('debug-console')) return;
        const box = document.createElement('div');
        box.id = 'debug-console';
        box.innerHTML = `
            <h3>脚本运行日志 v5.4 <button onclick="this.parentElement.parentElement.style.display='none'">关闭</button></h3>
            <div id="debug-console-content"></div>
        `;
        document.body.appendChild(box);
        debugLog('调试面板已启动', 'success');
    }

    // ===================== 辅助工具 =====================

    // 检查元素是否可见
    function isVisible(el) {
        if (!el) return false;
        const style = window.getComputedStyle(el);
        return style.display !== 'none' && style.visibility !== 'hidden' && el.offsetWidth > 0 && el.offsetHeight > 0;
    }

    // 安全的值设置函数
    function setNativeValue(element, value, name) {
        if (!element) return false;
        try {
            const valueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
            if (valueSetter) {
                valueSetter.call(element, value);
            } else {
                element.value = value;
            }

            ['input', 'change'].forEach(evt => {
                element.dispatchEvent(new Event(evt, { bubbles: true }));
            });
            return true;
        } catch (e) {
            debugLog(`设置值失败: ${e.message}`, 'error');
            return false;
        }
    }

    // 新增：提取leftheading的小数点值
    function extractFaxiandiedai(heading) {
        const match = heading.match(/【(.+?)全服】|【(.+?)测服】/);
        if (match) {
            return match[1] || match[2] || '';
        }
        return '';
    }

    // ===================== 基础功能 =====================

    function extractInternalDescription() {
        const bodyText = document.body.innerText;
        const startIdx = bodyText.indexOf('内部描述');
        if (startIdx === -1) return '';
        const endIdx = bodyText.indexOf('描述', startIdx + 4);
        if (endIdx === -1) return '';
        const extracted = bodyText.slice(startIdx + 4, endIdx).trim();
        state.copiedText = extracted;
        return extracted;
    }

    function determineHeading(text) {
        const serverMatches = text.match(/ServerID\s*[:=]\s*(\d{4,6})/gi);
        if (!serverMatches || serverMatches.length === 0) return false;

        const serverID = serverMatches[0].match(/\d{4,6}/)[0];
        const isTestServer = serverID.startsWith('57');

        state.leftHeading = isTestServer ? CONFIG.testServer : CONFIG.fullServer;
        state.versionNumber = state.leftHeading.match(/(\d+(?:\.\d+)+)/)[1];
        state.channelText = isTestServer ? '测服' : '全服';
        state.faxiandiedai = extractFaxiandiedai(state.leftHeading); // 提取小数点值

        debugLog(`识别环境: ${state.channelText}, 版本: ${state.versionNumber}, 迭代版本: ${state.faxiandiedai}`, 'success');
        return true;
    }

    async function translateText(text) {
        if (!text || /[\u4e00-\u9fa5]/.test(text)) return text;

        const tryTranslate = (url) => {
            return new Promise((resolve, reject) => {
                GM_xmlhttpRequest({
                    method: 'GET',
                    url: url,
                    timeout: CONFIG.translateTimeout,
                    onload: (res) => {
                        try {
                            const data = JSON.parse(res.responseText);
                            resolve(url.includes('google') ? data[0][0][0] : data.responseData.translatedText);
                        } catch (e) { reject(e); }
                    },
                    onerror: reject,
                    ontimeout: reject
                });
            });
        };

        try {
            return await Promise.race([
                tryTranslate(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=en|zh-CN`),
                new Promise((_, r) => setTimeout(() => r(new Error('timeout')), 10000))
            ]);
        } catch (e) {
            return text;
        }
    }

    // ===================== UI组件 =====================

    function createCopyBox() {
        if (document.getElementById('copy-status-box')) return;
        const box = document.createElement('div');
        box.id = 'copy-status-box';
        box.textContent = '效率';
        box.title = '点击复制';

        box.addEventListener('click', () => {
            if (state.copiedText) {
                navigator.clipboard.writeText(state.copiedText).then(() => {
                    box.textContent = '专注';
                    box.classList.add('copied');
                    setTimeout(() => {
                        box.textContent = '效率';
                        box.classList.remove('copied');
                    }, 1500);
                    debugLog('已复制内部描述', 'success');
                });
            }
        });

        let isDragging = false, offsetX, offsetY;
        box.addEventListener('mousedown', e => {
            isDragging = true;
            offsetX = e.clientX - box.offsetLeft;
            offsetY = e.clientY - box.offsetTop;
        });
        document.addEventListener('mousemove', e => {
            if (isDragging) {
                box.style.left = (e.clientX - offsetX) + 'px';
                box.style.top = (e.clientY - offsetY) + 'px';
                box.style.right = 'auto';
            }
        });
        document.addEventListener('mouseup', () => isDragging = false);

        document.body.appendChild(box);
    }

    // ===================== 核心监听逻辑（需求四/五实现） =====================

    function handleActiveDropdowns() {
        const dropdowns = document.querySelectorAll('.el-select-dropdown');

        dropdowns.forEach(dd => {
            if (!isVisible(dd)) return;
            if (state.processedDropdowns.has(dd)) return;

            const inputInDropdown = dd.querySelector('input[type="text"]');
            if (!inputInDropdown) return;

            // 1. 通过坐标回溯找到触发输入框
            const ddRect = dd.getBoundingClientRect();
            const ddCenterX = ddRect.left + ddRect.width / 2;

            let bestMatch = null;
            let minDistance = Infinity;

            const allInputs = document.querySelectorAll('input');
            for (let input of allInputs) {
                if (!isVisible(input) || input.disabled || input === inputInDropdown) continue;

                const rect = input.getBoundingClientRect();
                if (rect.bottom <= ddRect.top && rect.bottom > 0) {
                    const inputCenterX = rect.left + rect.width / 2;
                    const dist = Math.abs(inputCenterX - ddCenterX);

                    if (dist < 100 && dist < minDistance) {
                        minDistance = dist;
                        bestMatch = input;
                    }
                }
            }

            if (bestMatch) {
                // 2. 精准识别字段类型（需求四/五分离）
                let labelText = "";
                let parent = bestMatch;
                for (let i = 0; i < 10; i++) {
                    if (!parent) break;
                    const text = parent.textContent || parent.innerText;
                    if (text.includes('渠道') || text.includes('发现迭代')) {
                        labelText = text.trim();
                        break;
                    }
                    parent = parent.parentElement;
                }

                if (labelText) {
                    let targetValue = "";
                    let fieldName = "";

                    // 需求四：渠道* -> 填测服/全服
                    if (labelText.includes('渠道')) {
                        targetValue = state.channelText;
                        fieldName = "渠道";
                    }
                    // 需求五：发现迭代* -> 填faxiandiedai
                    else if (labelText.includes('发现迭代')) {
                        targetValue = state.faxiandiedai;
                        fieldName = "发现迭代";
                    }

                    if (targetValue && (inputInDropdown.value === '' || inputInDropdown.value === targetValue)) {
                        debugLog(`精准触发【${fieldName}】(${labelText})，填入: ${targetValue}`, 'success');
                        setTimeout(() => {
                            setNativeValue(inputInDropdown, targetValue, fieldName);
                        }, 50);
                        state.processedDropdowns.add(dd);
                    }
                }
            }
        });
    }

    // ===================== 主处理逻辑 =====================

    async function handleTicket() {
        if (state.hasProcessedTitle) return;

        try {
            const desc = extractInternalDescription();
            if (!desc) return;

            if (!determineHeading(desc)) return;

            // 标题处理（需求二）
            let titleInput = null;
            const titleInputs = document.querySelectorAll('input');
            for (let input of titleInputs) {
                if (input.placeholder && input.placeholder.includes('任务标题') && !input.disabled) {
                    titleInput = input;
                    break;
                }
            }

            if (!titleInput) {
                const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);
                let node;
                while (node = walker.nextNode()) {
                    if (node.textContent.includes('任务标题') && !node.textContent.includes('关联')) {
                        let parent = node.parentElement;
                        while(parent && parent !== document.body) {
                            const input = parent.querySelector('input:not([type="hidden"])');
                            if (input && !input.disabled) {
                                titleInput = input;
                                break;
                            }
                            parent = parent.parentElement;
                        }
                        if (titleInput) break;
                    }
                }
            }

            if (titleInput) {
                const currentVal = titleInput.value;
                const colonMatch = currentVal.match(/[：:]/);
                if (colonMatch && !/mcgg/i.test(currentVal)) {
                    const newVal = state.leftHeading + currentVal.substring(colonMatch.index + 1);
                    if (setNativeValue(titleInput, newVal, '任务标题')) {
                        debugLog('任务标题前缀已更新', 'success');
                        state.hasProcessedTitle = true;
                    }
                } else {
                    state.hasProcessedTitle = true;
                }
            }

            // 翻译处理（需求三）
            if (titleInput) {
                const val = titleInput.value;
                const m = val.match(/[：:]/);
                if (m) {
                    const afterColon = val.substring(m.index + 1).trim();
                    if (afterColon && !/[\u4e00-\u9fa5]/.test(afterColon)) {
                        const trans = await translateText(afterColon);
                        if (trans !== afterColon) {
                            const newVal = val.substring(0, m.index + 1) + trans + ' ' + afterColon;
                            setNativeValue(titleInput, newVal, '任务标题翻译');
                            debugLog('任务标题翻译已应用', 'success');
                        }
                    }
                }
            }

        } catch (e) {
            debugLog(`处理工单异常: ${e.message}`, 'error');
        }
    }

    // ===================== 启动与监控 =====================

    function getTicketID() {
        const els = document.querySelectorAll('p, div, span');
        for (let el of els) {
            if (/^\d{14}$/.test(el.textContent.trim())) return el.textContent.trim();
        }
        return null;
    }

    function monitor() {
        setInterval(() => {
            const id = getTicketID();

            if (id && id !== state.currentTicketID) {
                debugLog(`🆕 检测到新工单: ${id}`);
                state.currentTicketID = id;
                state.hasProcessedTitle = false;
                state.versionNumber = '';
                state.channelText = '';
                state.faxiandiedai = '';
                state.processedDropdowns = new WeakSet();

                handleTicket();
            } else if (id && id === state.currentTicketID) {
                handleActiveDropdowns();
                if (!state.hasProcessedTitle) {
                    handleTicket();
                }
            }
        }, CONFIG.checkInterval);
    }

    function init() {
        createDebugConsole();
        createCopyBox();
        debugLog('工单助手 v5.4 已启动 (需求四/五精准实现)');

        monitor();

        setTimeout(() => {
            const id = getTicketID();
            if (id) {
                state.currentTicketID = id;
                handleTicket();
            }
        }, 3000);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();

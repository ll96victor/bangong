// ==UserScript==
// @name         工单助手 - 自动翻译与内部描述复制 v4.8 智能重试版
// @namespace    http://tampermonkey.net/
// @version      4.8
// @description  【核心修复】智能重试机制，深度兼容自定义组件，等待模块加载完成
// @author       ll96victor (Retry v4.8)
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
        checkInterval: 800,
        debug: true,
        // 新增：重试配置
        maxRetries: 3,
        retryDelay: 2000 // 2秒重试间隔
    };

    // ===================== 全局状态 =====================
    let state = {
        currentTicketID: null,
        copiedText: '',
        leftHeading: '',
        versionNumber: '',
        channelText: '',
        hasProcessedTitle: false,
        isProcessing: false,
        // 新增：重试计数器
        retryCount: 0,
        // 新增：元素操作状态
        elementOperationStatus: {}
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
            consoleDiv.scrollTop = consoleDiv.scrollHeight;
        }
    }

    function createDebugConsole() {
        if (document.getElementById('debug-console')) return;
        const box = document.createElement('div');
        box.id = 'debug-console';
        box.innerHTML = `
            <h3>脚本运行日志 <button onclick="this.parentElement.parentElement.style.display='none'">关闭</button></h3>
            <div id="debug-console-content"></div>
        `;
        document.body.appendChild(box);
        debugLog('调试面板已启动', 'success');
    }

    // ===================== 核心工具：多重策略查找输入框 =====================

    /**
     * 强力查找输入框 - 增强版
     */
    function findInputSmart(targetText, placeholderHint) {
        debugLog(`正在查找元素: "${targetText}" (提示: ${placeholderHint})`);

        // 策略1: Placeholder 匹配
        if (placeholderHint) {
            const allInputs = document.querySelectorAll('input');
            for (let input of allInputs) {
                if (input.placeholder && input.placeholder.includes(placeholderHint)) {
                    debugLog(`✅ 通过Placeholder找到元素`, 'success');
                    return input;
                }
            }
            debugLog(`⚠️ 未通过Placeholder找到`, 'warn');
        }

        // 策略2: 遍历所有标签，检查邻近关系
        const walker = document.createTreeWalker(
            document.body,
            NodeFilter.SHOW_TEXT,
            null,
            false
        );

        let node;
        while (node = walker.nextNode()) {
            if (node.textContent.includes(targetText)) {
                // 找到包含文本的节点，向上或向周围查找 input
                let parent = node.parentElement;
                let depth = 0;
                while (parent && depth < 5) {
                    const input = parent.querySelector('input');
                    if (input && input.type !== 'hidden' && input.type !== 'checkbox' && input.type !== 'radio') {
                        debugLog(`✅ 通过文本邻近找到元素`, 'success');
                        return input;
                    }
                    parent = parent.parentElement;
                    depth++;
                }
            }
        }

        debugLog(`❌ 彻底无法找到元素 "${targetText}"`, 'error');
        return null;
    }

    /**
     * 深度检查元素是否可编辑
     * 新增：检查元素是否有value属性
     */
    function checkElementValidity(element, elementName) {
        if (!element) {
            debugLog(`❌ ${elementName} 元素不存在`, 'error');
            return false;
        }

        // 检查是否已经尝试过这个元素
        if (state.elementOperationStatus[elementName]) {
            debugLog(`⚠️ ${elementName} 元素已尝试操作过，跳过`, 'warn');
            return false;
        }

        state.elementOperationStatus[elementName] = true;

        if (element.disabled) {
            debugLog(`⚠️ ${elementName} 元素被禁用`, 'warn');
            return false;
        }

        if (element.readOnly) {
            debugLog(`⚠️ ${elementName} 元素是只读的`, 'warn');
            return false;
        }

        // 检查元素是否有value属性
        if (!element.value) {
            debugLog(`⚠️ ${elementName} 元素没有value属性`, 'warn');
            return false;
        }

        debugLog(`✅ ${elementName} 元素检查通过`, 'success');
        return true;
    }

    /**
     * 安全的值设置函数 - 增强版
     * 支持多种元素类型和自定义组件，带重试机制
     */
    function setNativeValue(element, value, elementName) {
        if (!checkElementValidity(element, elementName)) return false;

        try {
            debugLog(`正在设置值: ${value.substring(0, 30)}...`);

            // 方法1: 原生setter (标准输入框)
            if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
                const valueSetter = Object.getOwnPropertyDescriptor(element, 'value');
                if (valueSetter && valueSetter.set) {
                    valueSetter.set.call(element, value);
                } else {
                    debugLog(`⚠️ 元素没有value setter，尝试直接赋值`, 'warn');
                    element.value = value;
                }
            } else {
                // 方法2: 尝试直接赋值 (自定义组件)
                element.value = value;
            }

            // 方法3: 触发事件
            element.dispatchEvent(new Event('input', { bubbles: true }));
            element.dispatchEvent(new Event('change', { bubbles: true }));

            // 方法4: 尝试触发blur事件 (某些框架需要)
            element.blur();

            // 方法5: 尝试触发focus事件
            element.focus();

            debugLog(`✅ 值设置成功`, 'success');
            return true;

        } catch (e) {
            debugLog(`❌ 值设置失败: ${e.message}`, 'error');
            return false;
        }
    }

    /**
     * 带重试的值设置函数
     */
    async function setValueWithRetry(element, value, elementName, maxRetries = CONFIG.maxRetries) {
        let success = false;
        let attempts = 0;

        while (!success && attempts < maxRetries) {
            success = setNativeValue(element, value, elementName);
            if (!success) {
                debugLog(`尝试 ${attempts + 1}/${maxRetries} 失败，等待 ${CONFIG.retryDelay}ms 后重试...`, 'warn');
                await new Promise(r => setTimeout(r, CONFIG.retryDelay));
                attempts++;
            }
        }

        return success;
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

        debugLog(`识别环境: ${state.channelText}, 版本: ${state.versionNumber}`, 'success');
        return true;
    }

    // ===================== 翻译模块 =====================

    async function translateText(text) {
        if (!text || /[\u4e00-\u9fa5]/.test(text)) return text;

        debugLog(`开始翻译: ${text.substring(0, 20)}...`);

        // 优先尝试 MyMemory，国内网络更通畅
        const tryTranslate = (url) => {
            return new Promise((resolve, reject) => {
                GM_xmlhttpRequest({
                    method: 'GET',
                    url: url,
                    timeout: CONFIG.translateTimeout,
                    onload: (res) => {
                        try {
                            if (url.includes('google')) {
                                const data = JSON.parse(res.responseText);
                                resolve(data[0][0][0]);
                            } else {
                                const data = JSON.parse(res.responseText);
                                resolve(data.responseData.translatedText);
                            }
                        } catch (e) { reject(e); }
                    },
                    onerror: reject,
                    ontimeout: reject
                });
            });
        };

        try {
            // 尝试 MyMemory
            const result = await Promise.race([
                tryTranslate(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=en|zh-CN`),
                new Promise((_, r) => setTimeout(() => r(new Error('timeout')), 10000))
            ]);
            debugLog(`翻译成功`, 'success');
            return result;
        } catch (e) {
            debugLog(`翻译失败: ${e.message}`, 'error');
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

        // 拖拽
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

    // ===================== 主处理逻辑 =====================

    async function handleTicket() {
        if (state.isProcessing) return;
        state.isProcessing = true;
        debugLog('========== 开始处理工单 ==========');

        try {
            // 1. 描述提取
            const desc = extractInternalDescription();
            if (!desc) {
                debugLog('未提取到描述，终止', 'error');
                return;
            }
            debugLog('提取描述成功', 'success');

            // 2. 判断环境
            if (!determineHeading(desc)) {
                debugLog('环境判断失败，后续步骤跳过', 'warn');
                return;
            }

            // 3. 标题处理
            debugLog('尝试处理任务标题...');
            const titleInput = findInputSmart('任务标题', '标题') || findInputSmart('Task Title', 'Title');

            if (titleInput) {
                debugLog(`找到标题元素，类型: ${titleInput.tagName}, readOnly: ${titleInput.readOnly}, disabled: ${titleInput.disabled}`);

                const currentVal = titleInput.value;
                const colonMatch = currentVal.match(/[：:]/);
                if (colonMatch && !/mcgg/i.test(currentVal)) {
                    const newVal = state.leftHeading + currentVal.substring(colonMatch.index + 1);
                    if (await setValueWithRetry(titleInput, newVal, '标题输入框')) {
                        debugLog('标题前缀已更新', 'success');
                    } else {
                        debugLog('标题前缀更新失败', 'error');
                    }
                } else {
                    debugLog('标题格式不符或已处理', 'warn');
                }
            } else {
                debugLog('严重错误：无法定位标题输入框', 'error');
            }

            // 4. 翻译处理
            if (titleInput) {
                const val = titleInput.value;
                const m = val.match(/[：:]/);
                if (m) {
                    const afterColon = val.substring(m.index + 1).trim();
                    if (afterColon && !/[\u4e00-\u9fa5]/.test(afterColon)) {
                        const trans = await translateText(afterColon);
                        if (trans !== afterColon) {
                            const newVal = val.substring(0, m.index + 1) + trans + ' ' + afterColon;
                            if (await setValueWithRetry(titleInput, newVal, '标题输入框')) {
                                debugLog('翻译已应用', 'success');
                            } else {
                                debugLog('翻译应用失败', 'error');
                            }
                        }
                    }
                }
            }

            // 5. 下拉填充 (通用函数)
            const fillDropdown = async (labelText, placeholderHint, value) => {
                debugLog(`尝试填充 ${labelText}...`);
                const input = findInputSmart(labelText, placeholderHint);

                if (input) {
                    debugLog(`找到${labelText}元素，类型: ${input.tagName}, readOnly: ${input.readOnly}, disabled: ${input.disabled}`);

                    // 模拟点击展开
                    try {
                        input.click();
                        await new Promise(r => setTimeout(r, 500));

                        // 查找下拉框内的搜索框
                        const dropdownInput = document.querySelector('.el-select-dropdown input[type="text"]');
                        if (dropdownInput) {
                            if (await setValueWithRetry(dropdownInput, value, `${labelText}搜索框`)) {
                                await new Promise(r => setTimeout(r, 400));
                                // 尝试点击高亮项
                                const item = document.querySelector('.el-select-dropdown__item.hover');
                                if (item) item.click();
                                debugLog(`${labelText} 填充完成`, 'success');
                            } else {
                                debugLog(`${labelText} 填充失败`, 'error');
                            }
                        } else {
                            // 如果没有搜索框，直接赋值
                            if (await setValueWithRetry(input, value, labelText)) {
                                debugLog(`${labelText} 直接赋值完成`, 'success');
                            } else {
                                debugLog(`${labelText} 直接赋值失败`, 'error');
                            }
                        }
                    } catch (e) {
                        debugLog(`填充${labelText}时出错: ${e.message}`, 'error');
                    }
                } else {
                    debugLog(`无法定位 ${labelText}`, 'error');
                }
            };

            // 并行执行填充
            fillDropdown('发现迭代', '迭代', state.versionNumber);
            fillDropdown('渠道', '渠道', state.channelText);

        } catch (e) {
            debugLog(`处理异常: ${e.message}`, 'error');
            console.error(e);
        } finally {
            state.isProcessing = false;
            state.retryCount = 0; // 重置重试计数
            state.elementOperationStatus = {}; // 重置元素操作状态
            debugLog('========== 工单处理完成 ==========', 'info');
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
                debugLog(`检测到新工单: ${id}`);
                state.currentTicketID = id;
                state.elementOperationStatus = {}; // 重置元素操作状态
                setTimeout(handleTicket, 2000); // 增加延迟
            }
        }, CONFIG.checkInterval);
    }

    function init() {
        createDebugConsole();
        createCopyBox();
        debugLog('工单助手 v4.8 已启动');

        monitor();

        // 首次执行
        setTimeout(() => {
            const id = getTicketID();
            if (id) {
                state.currentTicketID = id;
                handleTicket();
            }
        }, 2500); // 增加初始延迟
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();

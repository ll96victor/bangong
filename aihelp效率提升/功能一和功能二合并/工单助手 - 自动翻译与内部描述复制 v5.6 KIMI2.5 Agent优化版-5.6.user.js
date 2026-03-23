// ==UserScript==
// @name         工单助手 - 自动翻译与内部描述复制 v5.6 KIMI2.5 Agent优化版
// @namespace    http://tampermonkey.net/
// @version      5.6
// @description  【优化版】修复复制逻辑和ServerID提取，支持图片转链接
// @author       ll96victor (Optimized v5.6)
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
        // 服务器前缀列表（供参考）
        fullServerLists: ["【2.1.40全服】：", "【2.1.18全服】：", "【40.2全服】：", "【18.2全服】："],
        testServerLists: ["【40.2测服】：", "【2.1.52测服】：", "【1.9.88测服】：", "【2.1.50测服】："],

        // 当前使用的前缀（用户可手动修改）
        fullServer: "【2.1.40全服】：",
        testServer: "【2.1.56测服】：",

        // 翻译配置
        translateDailyLimit: 150,
        translateTimeout: 6000,

        // 性能配置
        checkInterval: 500,         // 工单变化检测间隔(ms)
        dropdownWaitTime: 300,      // 等待下拉框出现的时间(ms)
        dropdownFillDelay: 100,     // 填充前的额外延迟(ms)

        // 调试开关
        debug: true                 // 设为false关闭控制台日志
    };

    // ===================== 全局状态 =====================
    let state = {
        currentTicketID: null,      // 当前工单ID
        copiedText: '',             // 已复制的文本
        leftHeading: '',            // 当前标题前缀
        versionNumber: '',          // 发现迭代版本号
        channelText: '',            // 渠道文本（"全服"或"测服"）
        faxiandiedai: '',           // 发现迭代填充值（小数点版本）
        hasProcessedTitle: false,   // 是否已处理标题
        translateCount: 0,          // 今日翻译次数
        isProcessing: false,        // 防止重复处理
        channelFilled: false,       // 渠道是否已填充
        iterationFilled: false      // 迭代是否已填充
    };

    // ===================== 调试日志 =====================
    function log(...args) {
        if (CONFIG.debug) {
            console.log('[工单助手 v5.6]', ...args);
        }
    }

    function logError(...args) {
        console.error('[工单助手 v5.6 错误]', ...args);
    }

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
            transition: background 0.2s;
        }
        #copy-status-box:hover {
            background: rgba(40, 90, 204, 0.95);
        }
        #copy-status-box.copied {
            background: rgba(82, 196, 26, 0.9);
        }

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

    // ===================== 调试面板 =====================
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
            <h3>脚本运行日志 v5.6 <button onclick="this.parentElement.parentElement.style.display='none'">关闭</button></h3>
            <div id="debug-console-content"></div>
        `;
        document.body.appendChild(box);
        debugLog('调试面板已启动', 'success');
    }

    // ===================== 工具函数 =====================

    // 提取版本号（如 "【2.1.40全服】：" -> "2.1.40"）
    function extractVersion(text) {
        const match = text.match(/(\d+(?:\.\d+)+)/);
        return match ? match[1] : '';
    }

    // 提取leftheading的小数点值（用于发现迭代）
    function extractFaxiandiedai(heading) {
        const match = heading.match(/【(.+?)全服】|【(.+?)测服】/);
        if (match) {
            return match[1] || match[2] || '';
        }
        return '';
    }

    // 检测文本是否包含中文
    function hasChinese(text) {
        return /[\u4e00-\u9fa5]/.test(text);
    }

    // 获取当前工单ID
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

    // 查找标签对应的输入框/下拉框（根据HTML结构：标签是p.title-of-work-order，下拉框在兄弟p.detail中）
    function findInputByLabel(labelText) {
        const titles = Array.from(document.querySelectorAll('p.title-of-work-order'));
        const targetTitle = titles.find(t => t.textContent.includes(labelText));

        if (!targetTitle) return null;

        // 查找兄弟元素 <p class="detail">
        let sibling = targetTitle.nextElementSibling;
        while (sibling) {
            if (sibling.classList.contains('detail')) {
                return sibling.querySelector('input, textarea, .el-select');
            }
            sibling = sibling.nextElementSibling;
        }
        return null;
    }

    // 等待元素出现
    function waitForElement(labelText, timeout = 3000) {
        return new Promise((resolve) => {
            const startTime = Date.now();
            const check = () => {
                const element = findInputByLabel(labelText);
                if (element) {
                    resolve(element);
                } else if (Date.now() - startTime < timeout) {
                    setTimeout(check, 100);
                } else {
                    resolve(null);
                }
            };
            check();
        });
    }

    // 等待下拉框出现
    function waitForDropdown(timeout = 1000) {
        return new Promise((resolve) => {
            const startTime = Date.now();
            const check = () => {
                const dropdown = document.querySelector('.el-select-dropdown:not([style*="display: none"])');
                if (dropdown) {
                    const searchInput = dropdown.querySelector('input[type="text"]');
                    if (searchInput) {
                        resolve(searchInput);
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

    // ===================== 核心功能 =====================

    // 【需求一】提取"内部描述"到"描述"之间的文本（优化版）
    function extractInternalDescription() {
        // 获取所有包含"内部描述"和"描述"的元素
        const allElements = document.querySelectorAll('p, div, span, label');
        let internalDescEl = null;
        let descEl = null;

        // 查找"内部描述"和"描述"标签元素
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

        // 根据实际网页结构，内容通常在标签的父元素的兄弟元素中
        // 尝试多种方式获取内容
        let contentEl = null;

        // 方式1：查找父元素的下一个兄弟元素（p.detail）
        const parent = internalDescEl.parentElement;
        if (parent) {
            let sibling = parent.nextElementSibling;
            while (sibling) {
                // 如果找到"描述"标签的父元素，停止
                if (descEl && sibling.contains(descEl)) {
                    break;
                }
                // 如果找到包含内容的元素
                if (sibling.classList && (sibling.classList.contains('detail') || sibling.classList.contains('content'))) {
                    contentEl = sibling;
                    break;
                }
                // 如果元素有文本内容且不是标签
                const text = sibling.textContent.trim();
                if (text && text !== '内部描述' && !text.startsWith('内部描述')) {
                    contentEl = sibling;
                    break;
                }
                sibling = sibling.nextElementSibling;
            }
        }

        // 方式2：如果方式1没找到，查找内部描述标签后面的兄弟元素
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

        // 方式3：通过innerText提取（备用方案）
        if (!contentEl) {
            return extractViaInnerText();
        }

        // 提取内容并处理图片
        const extracted = extractContentWithImages(contentEl);
        state.copiedText = extracted;
        log('提取内部描述成功，长度:', extracted.length);
        debugLog(`提取内部描述成功，长度: ${extracted.length}`, 'success');
        return extracted;
    }

    // 备用方案：通过innerText提取
    function extractViaInnerText() {
        const bodyText = document.body.innerText;

        // 找到"内部描述"的位置
        const startIdx = bodyText.indexOf('内部描述');
        if (startIdx === -1) {
            log('未找到"内部描述"文本');
            return '';
        }

        // 从"内部描述"之后开始找"描述"
        const searchStart = startIdx + 4;
        const endIdx = bodyText.indexOf('描述', searchStart);

        if (endIdx === -1) {
            log('未找到"描述"结束标记');
            return '';
        }

        // 提取两者之间的文本
        let extracted = bodyText.slice(searchStart, endIdx).trim();

        // 清理开头可能的冒号或空格
        extracted = extracted.replace(/^[：:\s]+/, '');

        state.copiedText = extracted;
        log('通过innerText提取内部描述成功，长度:', extracted.length);
        return extracted;
    }

    // 提取内容并处理图片（将图片转为链接）
    function extractContentWithImages(element) {
        // 克隆元素以避免修改原DOM
        const clone = element.cloneNode(true);

        // 处理所有图片元素
        const images = clone.querySelectorAll('img');
        images.forEach(img => {
            const src = img.src || img.getAttribute('data-src');
            if (src) {
                // 创建链接文本节点替换图片
                const linkText = document.createTextNode(`  ${src} `);
                img.parentNode.replaceChild(linkText, img);
            } else {
                img.remove();
            }
        });

        // 获取处理后的文本
        let text = clone.innerText || clone.textContent || '';

        // 清理文本
        text = text.trim();

        // 移除开头的标签文本（如果有）
        text = text.replace(/^(内部描述[\*\s]*[：:]?\s*)/i, '');

        return text;
    }

    // 【需求二】根据ServerID判断并设置标题前缀（优化版）
    function determineHeading(text) {
        if (!text) {
            log('传入的文本为空，无法判断ServerID');
            return false;
        }

        // 严格匹配：查找所有"ServerID = "的出现
        const serverIdPattern = /ServerID\s*=\s*(\d{4,5})\s*,?/gi;
        const matches = [];
        let match;

        while ((match = serverIdPattern.exec(text)) !== null) {
            matches.push(match[1]);
        }

        log('ServerID匹配结果:', matches);
        debugLog(`ServerID匹配数量: ${matches.length}, 值: ${matches.join(', ')}`, 'info');

        // 必须恰好有1个ServerID且是4位或5位数字
        if (matches.length !== 1) {
            log(`ServerID数量不符合要求: ${matches.length}个`);
            debugLog(`ServerID不符合要求，匹配数量: ${matches.length}`, 'warn');
            return false;
        }

        const serverID = matches[0];
        log('提取到ServerID:', serverID);

        // 判断是否为测服（以57开头）
        const isTestServer = serverID.startsWith('57');

        state.leftHeading = isTestServer ? CONFIG.testServer : CONFIG.fullServer;
        state.versionNumber = extractVersion(state.leftHeading);
        state.channelText = isTestServer ? '测服' : '全服';
        state.faxiandiedai = extractFaxiandiedai(state.leftHeading);

        log('ServerID:', serverID, '| 类型:', state.channelText, '| 版本:', state.versionNumber, '| 迭代:', state.faxiandiedai);
        debugLog(`识别环境: ${state.channelText}, 版本: ${state.versionNumber}, 迭代: ${state.faxiandiedai}`, 'success');
        return true;
    }

    // 【需求二】替换标题前缀
    function updateTitlePrefix() {
        if (state.hasProcessedTitle) {
            log('标题已处理过，跳过');
            return;
        }

        const titleInput = findInputByLabel('任务标题');
        if (!titleInput || titleInput.disabled || titleInput.readOnly) {
            log('未找到可编辑的标题输入框');
            return;
        }

        const input = titleInput.tagName === 'INPUT' ? titleInput : titleInput.querySelector('input');
        if (!input) {
            log('无法获取input元素');
            return;
        }

        const currentValue = input.value;
        const colonMatch = currentValue.match(/[：:]/);
        if (!colonMatch) {
            log('标题中未找到冒号');
            return;
        }

        const colonIndex = colonMatch.index;
        const prefix = currentValue.substring(0, colonIndex);

        // 如果包含MCGG则不处理
        if (/mcgg/i.test(prefix)) {
            log('标题包含MCGG，不处理');
            state.hasProcessedTitle = true;
            return;
        }

        // 替换前缀
        const afterColon = currentValue.substring(colonIndex + 1);
        const newValue = state.leftHeading + afterColon;

        // 使用原生setter设置值
        const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        nativeSetter.call(input, newValue);

        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));

        state.hasProcessedTitle = true;
        log('标题前缀已更新:', newValue);
        debugLog('任务标题前缀已更新', 'success');
    }

    // ===================== 翻译模块 =====================

    // 谷歌翻译
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

    // MyMemory翻译
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

    // 翻译文本（多源备份）
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

    // 【需求三】应用翻译到标题
    async function applyTranslation() {
        const titleInput = findInputByLabel('任务标题');
        if (!titleInput) {
            log('未找到标题输入框，跳过翻译');
            return;
        }

        const input = titleInput.tagName === 'INPUT' ? titleInput : titleInput.querySelector('input');
        if (!input) return;

        const currentValue = input.value;
        const colonMatch = currentValue.match(/[：:]/);
        if (!colonMatch) return;

        const colonIndex = colonMatch.index;
        const afterColon = currentValue.substring(colonIndex + 1).trim();

        if (!afterColon || hasChinese(afterColon)) {
            log('标题冒号后已是中文或为空，跳过翻译');
            return;
        }

        log('开始翻译标题...');
        const translated = await translateText(afterColon);

        if (translated !== afterColon) {
            const newValue = currentValue.substring(0, colonIndex + 1) + translated + ' ' + afterColon;

            // 使用原生setter设置值
            const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
            nativeSetter.call(input, newValue);

            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));

            log('翻译已应用到标题');
            debugLog('任务标题翻译已应用', 'success');
        }
    }

    // ===================== 下拉框填充模块 =====================

    // 填充下拉框搜索输入框
    async function fillDropdownSearch(searchInput, text) {
        if (!searchInput) {
            log('搜索输入框不存在');
            return false;
        }

        try {
            // 先聚焦
            searchInput.focus();

            // 等待一小段时间确保焦点已设置
            await new Promise(resolve => setTimeout(resolve, CONFIG.dropdownFillDelay));

            // 使用原生setter（兼容Vue/React框架）
            const nativeSetter = Object.getOwnPropertyDescriptor(
                window.HTMLInputElement.prototype,
                'value'
            ).set;
            nativeSetter.call(searchInput, text);

            // 触发完整事件链
            searchInput.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
            searchInput.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));

            // Element UI特定事件
            searchInput.dispatchEvent(new KeyboardEvent('keydown', {
                bubbles: true,
                key: text[0] || 'a'
            }));
            searchInput.dispatchEvent(new KeyboardEvent('keyup', {
                bubbles: true,
                key: text[text.length - 1] || 'a'
            }));

            log('下拉框填充成功:', text);
            return true;
        } catch (e) {
            logError('下拉框填充失败:', e);
            return false;
        }
    }

    // 【需求四】自动填充渠道
    async function autoFillChannel() {
        if (state.channelFilled) {
            log('渠道已填充，跳过');
            return;
        }

        const channelBox = findInputByLabel('渠道');
        if (!channelBox) {
            log('未找到渠道选择框');
            return;
        }

        const input = channelBox.querySelector('input');
        if (!input) {
            log('渠道选择框无input元素');
            return;
        }

        log('设置渠道自动填充监听');

        // 创建一次性监听器
        const handleFocus = async () => {
            log('渠道选择框获得焦点，准备填充:', state.channelText);
            debugLog(`渠道选择框获得焦点，准备填充: ${state.channelText}`, 'info');

            // 等待下拉框出现
            await new Promise(resolve => setTimeout(resolve, CONFIG.dropdownWaitTime));

            const searchInput = await waitForDropdown();
            if (searchInput) {
                const success = await fillDropdownSearch(searchInput, state.channelText);
                if (success) {
                    state.channelFilled = true;
                    debugLog(`渠道填充成功: ${state.channelText}`, 'success');
                }
            } else {
                log('未检测到下拉框出现');
            }
        };

        input.addEventListener('focus', handleFocus, { once: true });
    }

    // 【需求五】自动填充发现迭代
    async function autoFillIteration() {
        if (state.iterationFilled) {
            log('迭代已填充，跳过');
            return;
        }

        const iterationBox = findInputByLabel('发现迭代');
        if (!iterationBox) {
            log('未找到发现迭代选择框');
            return;
        }

        const input = iterationBox.querySelector('input');
        if (!input) {
            log('发现迭代选择框无input元素');
            return;
        }

        log('设置迭代自动填充监听，版本号:', state.faxiandiedai);

        // 创建一次性监听器
        const handleFocus = async () => {
            log('发现迭代选择框获得焦点，准备填充:', state.faxiandiedai);
            debugLog(`发现迭代选择框获得焦点，准备填充: ${state.faxiandiedai}`, 'info');

            // 等待下拉框出现
            await new Promise(resolve => setTimeout(resolve, CONFIG.dropdownWaitTime));

            const searchInput = await waitForDropdown();
            if (searchInput) {
                const success = await fillDropdownSearch(searchInput, state.faxiandiedai);
                if (success) {
                    state.iterationFilled = true;
                    debugLog(`发现迭代填充成功: ${state.faxiandiedai}`, 'success');
                }
            } else {
                log('未检测到下拉框出现');
            }
        };

        input.addEventListener('focus', handleFocus, { once: true });
    }

    // ===================== UI组件 =====================

    // 创建复制状态框
    function createCopyStatusBox() {
        if (document.getElementById('copy-status-box')) {
            return;
        }

        const box = document.createElement('div');
        box.id = 'copy-status-box';
        box.textContent = '效率';
        box.title = '点击复制内部描述';

        // 点击复制
        box.addEventListener('click', () => {
            if (state.copiedText) {
                navigator.clipboard.writeText(state.copiedText).then(() => {
                    box.textContent = '专注';
                    box.classList.add('copied');
                    log('内部描述已复制到剪贴板');
                    debugLog('已复制内部描述', 'success');
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

        // 拖拽功能
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
        log('复制状态框已创建');
    }

    // ===================== 主流程 =====================

    // 处理新工单
    async function processTicket() {
        if (state.isProcessing) {
            log('正在处理中，跳过重复执行');
            return;
        }

        state.isProcessing = true;
        log('========== 开始处理工单 ==========');

        try {
            // 步骤1：提取内部描述
            const internalDesc = extractInternalDescription();
            if (!internalDesc) {
                log('未提取到内部描述，中止处理');
                state.isProcessing = false;
                return;
            }

            // 步骤2：判断ServerID并设置前缀
            const hasValidServer = determineHeading(internalDesc);
            if (!hasValidServer) {
                log('ServerID验证失败，中止处理');
                state.isProcessing = false;
                return;
            }

            // 等待标题输入框出现
            log('等待标题输入框出现...');
            await waitForElement('任务标题');

            // 步骤3：更新标题前缀
            updateTitlePrefix();

            // 步骤4：应用翻译
            await applyTranslation();

            // 步骤5：设置自动填充监听（不阻塞）
            autoFillChannel();
            autoFillIteration();

            log('========== 工单处理完成 ==========');

        } catch (e) {
            logError('处理工单时发生异常:', e);
        } finally {
            state.isProcessing = false;
        }
    }

    // 重置状态（切换工单时）
    function resetState() {
        state.hasProcessedTitle = false;
        state.channelFilled = false;
        state.iterationFilled = false;
        state.copiedText = '';
        state.leftHeading = '';
        state.versionNumber = '';
        state.channelText = '';
        state.faxiandiedai = '';
    }

    // 监控工单变化
    function monitorTicketChange() {
        setInterval(() => {
            const newTicketID = getCurrentTicketID();

            if (newTicketID && newTicketID !== state.currentTicketID) {
                log(`工单切换: ${state.currentTicketID || '(无)'} -> ${newTicketID}`);
                debugLog(`🆕 检测到新工单: ${newTicketID}`);
                state.currentTicketID = newTicketID;
                resetState();

                // 延迟处理，确保DOM已更新
                setTimeout(() => {
                    processTicket();
                }, 300);
            }
        }, CONFIG.checkInterval);
    }

    // ===================== 初始化 =====================
    function init() {
        log('========================================');
        log('工单助手 v5.6 已启动');
        log('调试模式:', CONFIG.debug);
        log('========================================');

        createDebugConsole();
        createCopyStatusBox();
        monitorTicketChange();

        // 首次加载处理
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

    // 启动脚本
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
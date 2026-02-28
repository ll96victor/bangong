// ==UserScript==
// @name         工单助手 - 自动翻译与内部描述复制 v4.0 claude优化
// @namespace    http://tampermonkey.net/
// @version      4.0
// @description  智能工单处理：一键复制内部描述、自动更新标题前缀、智能翻译、自动填充渠道与迭代版本
// @author       ll96victor (Refactored v4.0)
// @match        https://ml-panel.aihelp.net/dashboard/*
// @match        https://ml.aihelp.net/dashboard/*
// @match        https://aihelp.net.cn/dashboard/*
// @match        https://aihelp.net/dashboard/*
// @exclude      *://*/dashboard/#/newpage-ticket*
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @connect      translate.googleapis.com
// @connect      api.mymemory.translated.net
// @connect      fanyi.baidu.com
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
        testServer: "【40.2测服】：",

        // 翻译配置
        translateDailyLimit: 150,
        translateTimeout: 6000,

        // 性能配置
        checkInterval: 500,  // 工单变化检测间隔(ms)
    };

    // ===================== 全局状态 =====================
    let state = {
        currentTicketID: null,      // 当前工单ID
        copiedText: '',             // 已复制的文本
        leftHeading: '',            // 当前标题前缀
        versionNumber: '',          // 发现迭代版本号
        hasProcessedTitle: false,   // 是否已处理标题
        translateCount: 0,          // 今日翻译次数
        isProcessing: false         // 防止重复处理
    };

    // ===================== 样式注入 =====================
    GM_addStyle(`
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
            transition: background 0.2s;
        }
        #copy-status-box:hover {
            background: rgba(40, 90, 204, 0.95);
        }
        #copy-status-box.copied {
            background: rgba(82, 196, 26, 0.9);
        }
    `);

    // ===================== 工具函数 =====================

    // 提取版本号（如 "【2.1.40全服】：" -> "2.1.40"）
    function extractVersion(text) {
        const match = text.match(/(\d+(?:\.\d+)+)/);
        return match ? match[1] : '';
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

    // 查找标签对应的输入框/下拉框
    function findInputByLabel(labelText) {
        const titles = Array.from(document.querySelectorAll('p.title-of-work-order'));
        const targetTitle = titles.find(t => t.textContent.includes(labelText));

        if (!targetTitle) return null;

        // 查找兄弟元素 <p class="detail">
        let sibling = targetTitle.nextElementSibling;
        while (sibling) {
            if (sibling.classList.contains('detail')) {
                // 在 detail 内部查找输入框或下拉框
                return sibling.querySelector('input, textarea, .el-select');
            }
            sibling = sibling.nextElementSibling;
        }
        return null;
    }

    // ===================== 核心功能 =====================

    // 【需求一】提取并缓存"内部描述"到"描述"之间的文本
    function extractInternalDescription() {
        const bodyText = document.body.innerText;
        const startIdx = bodyText.indexOf('内部描述');
        const endIdx = bodyText.indexOf('描述', startIdx + 4);

        if (startIdx === -1 || endIdx === -1) return '';

        const extracted = bodyText.slice(startIdx + 4, endIdx).trim();
        state.copiedText = extracted;
        return extracted;
    }

    // 【需求二】根据ServerID判断并设置标题前缀
    function determineHeading(text) {
        const serverMatch = text.match(/ServerID\s*=\s*(\d{4,5})/);
        if (!serverMatch) return false;

        const serverID = serverMatch[1];
        const isTestServer = serverID.startsWith('57');

        state.leftHeading = isTestServer ? CONFIG.testServer : CONFIG.fullServer;
        state.versionNumber = extractVersion(state.leftHeading);

        return true;
    }

    // 【需求二】替换标题前缀
    function updateTitlePrefix() {
        if (state.hasProcessedTitle) return;

        const titleInput = findInputByLabel('任务标题');
        if (!titleInput || titleInput.disabled || titleInput.readOnly) return;

        const input = titleInput.tagName === 'INPUT' ? titleInput : titleInput.querySelector('input');
        if (!input) return;

        const currentValue = input.value;
        const colonMatch = currentValue.match(/[：:]/);
        if (!colonMatch) return;

        const colonIndex = colonMatch.index;
        const prefix = currentValue.substring(0, colonIndex);

        // 如果包含MCGG则不处理
        if (/mcgg/i.test(prefix)) return;

        // 替换前缀
        const newValue = state.leftHeading + currentValue.substring(colonIndex + 1);
        input.value = newValue;
        input.dispatchEvent(new Event('input', { bubbles: true }));

        state.hasProcessedTitle = true;
    }

    // 【需求三】翻译功能（多源备份）
    async function translateText(text) {
        if (state.translateCount >= CONFIG.translateDailyLimit) {
            return text;
        }

        if (hasChinese(text)) return text;

        const translators = [
            translateViaGoogle,
            translateViaMyMemory,
            translateViaBaidu
        ];

        for (const translator of translators) {
            try {
                const result = await Promise.race([
                    translator(text),
                    new Promise((_, reject) => setTimeout(() => reject('timeout'), CONFIG.translateTimeout))
                ]);

                if (result && result !== text) {
                    state.translateCount++;
                    return result;
                }
            } catch (e) {
                continue;
            }
        }

        return text;
    }

    // 谷歌翻译
    function translateViaGoogle(text) {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'GET',
                url: `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=zh-CN&dt=t&q=${encodeURIComponent(text)}`,
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
                onload: (response) => {
                    try {
                        const result = JSON.parse(response.responseText);
                        resolve(result.responseData.translatedText);
                    } catch (e) {
                        reject(e);
                    }
                },
                onerror: reject
            });
        });
    }

    // 百度翻译（简化版，无需API Key的公开接口可能不稳定）
    function translateViaBaidu(text) {
        return new Promise((resolve) => {
            // 备用方案：返回原文
            resolve(text);
        });
    }

    // 【需求三】应用翻译到标题
    async function applyTranslation() {
        const titleInput = findInputByLabel('任务标题');
        if (!titleInput) return;

        const input = titleInput.tagName === 'INPUT' ? titleInput : titleInput.querySelector('input');
        if (!input) return;

        const currentValue = input.value;
        const colonMatch = currentValue.match(/[：:]/);
        if (!colonMatch) return;

        const colonIndex = colonMatch.index;
        const afterColon = currentValue.substring(colonIndex + 1).trim();

        if (!afterColon || hasChinese(afterColon)) return;

        const translated = await translateText(afterColon);
        if (translated !== afterColon) {
            const newValue = currentValue.substring(0, colonIndex + 1) + translated + ' ' + afterColon;
            input.value = newValue;
            input.dispatchEvent(new Event('input', { bubbles: true }));
        }
    }

    // 【需求四】自动填充渠道
    function autoFillChannel() {
        const channelBox = findInputByLabel('渠道');
        if (!channelBox) return;

        const input = channelBox.querySelector('input');
        if (!input) return;

        // 监听一次焦点事件
        input.addEventListener('focus', function fillOnce() {
            setTimeout(() => {
                const searchInput = document.querySelector('.el-select-dropdown input');
                if (searchInput) {
                    const fillText = state.leftHeading.includes('测服') ? '测服' : '全服';
                    searchInput.value = fillText;
                    searchInput.dispatchEvent(new Event('input', { bubbles: true }));
                }
            }, 100);
            input.removeEventListener('focus', fillOnce);
        }, { once: true });
    }

    // 【需求五】自动填充发现迭代
    function autoFillIteration() {
        const iterationBox = findInputByLabel('发现迭代');
        if (!iterationBox) return;

        const input = iterationBox.querySelector('input');
        if (!input) return;

        input.addEventListener('focus', function fillOnce() {
            setTimeout(() => {
                const searchInput = document.querySelector('.el-select-dropdown input');
                if (searchInput && state.versionNumber) {
                    searchInput.value = state.versionNumber;
                    searchInput.dispatchEvent(new Event('input', { bubbles: true }));
                }
            }, 100);
            input.removeEventListener('focus', fillOnce);
        }, { once: true });
    }

    // ===================== UI组件 =====================

    // 创建复制状态框
    function createCopyStatusBox() {
        const box = document.createElement('div');
        box.id = 'copy-status-box';
        box.textContent = '点击复制';
        box.title = '点击复制内部描述';

        // 点击复制
        box.addEventListener('click', () => {
            if (state.copiedText) {
                navigator.clipboard.writeText(state.copiedText).then(() => {
                    box.textContent = '已复制';
                    box.classList.add('copied');
                    setTimeout(() => {
                        box.textContent = '点击复制';
                        box.classList.remove('copied');
                    }, 1500);
                });
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
    }

    // ===================== 主流程 =====================

    // 处理新工单
    async function processTicket() {
        if (state.isProcessing) return;
        state.isProcessing = true;

        try {
            // 步骤1：提取内部描述
            const internalDesc = extractInternalDescription();
            if (!internalDesc) {
                state.isProcessing = false;
                return;
            }

            // 步骤2：判断ServerID并设置前缀
            const hasValidServer = determineHeading(internalDesc);
            if (!hasValidServer) {
                state.isProcessing = false;
                return;
            }

            // 等待标题输入框出现
            await waitForElement('任务标题');

            // 步骤3：更新标题前缀
            updateTitlePrefix();

            // 步骤4：应用翻译
            await applyTranslation();

            // 步骤5：设置自动填充
            autoFillChannel();
            autoFillIteration();

        } catch (e) {
            console.error('处理工单失败:', e);
        } finally {
            state.isProcessing = false;
        }
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

    // 监控工单变化
    function monitorTicketChange() {
        setInterval(() => {
            const newTicketID = getCurrentTicketID();

            if (newTicketID && newTicketID !== state.currentTicketID) {
                state.currentTicketID = newTicketID;
                state.hasProcessedTitle = false;

                setTimeout(() => {
                    processTicket();
                }, 300);
            }
        }, CONFIG.checkInterval);
    }

    // ===================== 初始化 =====================
    function init() {
        createCopyStatusBox();
        monitorTicketChange();

        // 首次加载处理
        setTimeout(() => {
            const ticketID = getCurrentTicketID();
            if (ticketID) {
                state.currentTicketID = ticketID;
                processTicket();
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
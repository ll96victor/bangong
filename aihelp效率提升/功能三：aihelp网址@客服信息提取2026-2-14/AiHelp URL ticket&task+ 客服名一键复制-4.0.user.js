// ==UserScript==
// @name         AiHelp URL + 客服名一键复制
// @namespace    http://tampermonkey.net/
// @version      4.3
// @description  优化 Task 提取逻辑，点击复制后反馈客服名前缀。
// @author       Front-end Expert
// @match        https://ml-panel.aihelp.net/*
// @match        https://ml.aihelp.net/*
// @match        https://aihelp.net.cn/*
// @match        https://aihelp.net/*
// @grant        GM_setClipboard
// @grant        GM_addStyle
// ==/UserScript==

(function() {
    'use strict';

    const DEBUG = true;
    function log(...args) {
        if (DEBUG) console.log('[AiHelp Debug]', ...args);
    }

    // ==================== 1. 原有 Ticket 逻辑 ====================
    function extractAiHelpAgentName(options = {}) {
        try {
            const allButtons = document.querySelectorAll('button');
            const candidates = [];
            for (let btn of allButtons) {
                const rect = btn.getBoundingClientRect();
                const text = btn.innerText.trim();
                if (rect.top > 0 && rect.top < 150 && text.includes('-')) {
                    const match = text.match(/([A-Z]{2,})-([A-Z][a-z]+)/);
                    if (match) candidates.push({ text, prefix: match[1], name: match[2] });
                }
            }
            // 返回包含前缀的对象
            return candidates.length > 0 ? { prefix: candidates[0].prefix, name: candidates[0].name } : null;
        } catch (e) { return null; }
    }

    // ==================== 2. 核心提取逻辑 (针对 Task 场景) ====================
    function extractTaskInfo() {
        let extractedUrl = '';
        let agentName = '';
        let agentPrefix = '';

        log('--- 开始提取 Task 信息 ---');

        try {
            // --- 1. 提取 URL ---
            const bodyText = document.body.innerText;
            const urlRegex = /[【\[]\s*(https?:\/\/[^】\]\s]+)\s*[】\]]/;
            const urlMatch = bodyText.match(urlRegex);
            
            if (urlMatch) {
                extractedUrl = urlMatch[1];
                log('找到括号内的 URL:', extractedUrl);
            } else {
                const anyUrlMatch = bodyText.match(/https?:\/\/[\w\-\.]+\.aihelp\.net\/[^\s【】\[\]]+/);
                if (anyUrlMatch) {
                    extractedUrl = anyUrlMatch[0];
                    log('通过文本搜索找到 URL:', extractedUrl);
                }
            }

            // --- 2. 提取客服名 (工单创建人) ---
            const creatorXPath = "//*[contains(text(), '工单创建人')]";
            const result = document.evaluate(creatorXPath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
            const creatorNode = result.singleNodeValue;

            if (creatorNode) {
                log('定位到“工单创建人”标签');

                // 定义提取正则：匹配 IDP-Taufik 这种格式
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
                    log('成功提取客服名:', agentName, '前缀:', agentPrefix);
                } else {
                    log('未在相邻元素中发现符合格式的客服名');
                }
            } else {
                log('页面未发现“工单创建人”文本');
            }
        } catch (error) {
            console.error('提取失败:', error);
        }

        return { url: extractedUrl, agentName: agentName, agentPrefix: agentPrefix };
    }

    // ==================== 3. 异步重试/轮询机制 ====================
    async function retryTaskExtraction(maxRetries = 12, interval = 500) {
        for (let i = 0; i < maxRetries; i++) {
            log(`第 ${i + 1} 次尝试提取...`);
            const result = extractTaskInfo();
            if (result.agentName) {
                return result;
            }
            await new Promise(r => setTimeout(r, interval));
        }
        return extractTaskInfo();
    }

    // ==================== 4. 动作响应 ====================
    async function handleCopyAction(button) {
        const currentUrl = window.location.href;
        let isTaskScene = currentUrl.includes('task?orderId') || currentUrl.includes('tasks?searchType');
        
        button.innerText = '检测中...';
        button.style.pointerEvents = 'none';

        try {
            let finalUrl = currentUrl;
            let finalAgentName = '';
            let finalPrefix = '';

            if (isTaskScene) {
                const taskInfo = await retryTaskExtraction();
                finalUrl = taskInfo.url || currentUrl;
                finalAgentName = taskInfo.agentName;
                finalPrefix = taskInfo.agentPrefix;
            } else if (currentUrl.includes('ticket')) {
                const ticketInfo = extractAiHelpAgentName();
                if (ticketInfo) {
                    finalAgentName = ticketInfo.name;
                    finalPrefix = ticketInfo.prefix;
                }
            }

            if (!finalAgentName && isTaskScene) {
                showFeedback(button, '未检测到客服名', 'error');
            } else {
                const copyText = `${finalUrl} @${finalAgentName || '未知客服'}`;
                GM_setClipboard(copyText);
                // 需求补充：提示前缀，而不是“已复制”
                showFeedback(button, finalPrefix || '✓ 已复制', 'success');
                log('复制成功:', copyText);
            }
        } catch (e) {
            showFeedback(button, '错误', 'error');
        } finally {
            button.style.pointerEvents = 'auto';
        }
    }

    // ==================== 5. UI 与反馈 ====================
    function showFeedback(btn, text, type) {
        const originalText = '复制 URL@客服';
        btn.innerText = text;
        if (type === 'success') btn.classList.add('success');
        
        setTimeout(() => {
            btn.innerText = originalText;
            btn.classList.remove('success');
        }, 1500);
    }

    function initCopyButton() {
        GM_addStyle(`
            #aihelp-quick-copy {
                position: fixed;
                top: calc(33.33% - 20px);
                right: calc(33.33% - 20px);
                z-index: 99999;
                padding: 10px 14px;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: #fff;
                font-size: 12px;
                font-weight: 600;
                cursor: pointer;
                border-radius: 6px;
                box-shadow: 0 2px 12px rgba(102,126,234,0.4);
                transition: all 0.25s ease;
                opacity: 0.88;
                user-select: none;
            }
            #aihelp-quick-copy:hover { opacity: 1; transform: scale(1.05); }
            #aihelp-quick-copy.success { background: linear-gradient(135deg, #11998e 0%, #38ef7d 100%) !important; }
        `);

        const copyButton = document.createElement('div');
        copyButton.id = 'aihelp-quick-copy';
        copyButton.innerText = '复制 URL@客服';
        copyButton.addEventListener('click', () => handleCopyAction(copyButton));
        document.body.appendChild(copyButton);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initCopyButton);
    } else {
        initCopyButton();
    }
})();

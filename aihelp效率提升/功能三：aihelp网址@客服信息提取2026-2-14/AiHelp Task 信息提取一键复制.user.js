// ==UserScript==
// @name         AiHelp Task 客服信息提取一键复制
// @namespace    http://tampermonkey.net/
// @version      1.1
// @description  专门针对 AiHelp Task (工单) 详情和列表页。仅在匹配页面显示悬浮窗。
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

    // 判定当前页面是否为 Task 相关页面
    function isTaskPage() {
        const url = window.location.href;
        return url.includes('task?orderId') || url.includes('tasks?searchType');
    }

    if (!isTaskPage()) return; // 不符合页面逻辑，直接退出脚本，不执行 UI 初始化

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

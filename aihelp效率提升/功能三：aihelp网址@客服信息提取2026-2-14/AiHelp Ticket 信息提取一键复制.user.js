// ==UserScript==
// @name         AiHelp Ticket 客服信息提取一键复制
// @namespace    http://tampermonkey.net/
// @version      1.1
// @description  专门针对 AiHelp Ticket (客诉) 页面。仅在匹配页面显示悬浮窗。
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

    // 判定当前页面是否为 Ticket 页面
    function isTicketPage() {
        return window.location.href.includes('ticket');
    }

    if (!isTicketPage()) return; // 如果不是 Ticket 页面，直接退出，不创建 UI

    const DEBUG = true;
    function log(...args) {
        if (DEBUG) console.log('[AiHelp Ticket Debug]', ...args);
    }

    // ==================== 1. 核心提取逻辑 ====================
    function extractTicketAgentInfo() {
        try {
            const allButtons = document.querySelectorAll('button');
            const candidates = [];
            for (let btn of allButtons) {
                const rect = btn.getBoundingClientRect();
                const text = btn.innerText.trim();
                if (rect.top > 0 && rect.top < 150 && text.includes('-')) {
                    const match = text.match(/([A-Z]+)-([A-Za-z0-9_]+)/);
                    if (match) {
                        candidates.push({ prefix: match[1], name: match[2] });
                    }
                }
            }
            return candidates.length > 0 ? candidates[0] : null;
        } catch (e) {
            console.error('Ticket 提取失败:', e);
        }
        return null;
    }

    // ==================== 2. 动作响应 ====================
    function handleCopyAction(button) {
        try {
            const agentInfo = extractTicketAgentInfo();
            const finalAgentName = agentInfo ? agentInfo.name : '未知客服';
            const finalPrefix = agentInfo ? agentInfo.prefix : '';

            const copyText = `${window.location.href} @${finalAgentName}`;
            GM_setClipboard(copyText);

            showFeedback(button, finalPrefix || '✓ 已复制', 'success');
        } catch (e) {
            showFeedback(button, '错误', 'error');
        }
    }

    // ==================== 3. UI 与反馈 ====================
    function showFeedback(btn, text, type) {
        const originalText = '复制 Ticket 信息';
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
            #aihelp-ticket-copy {
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
                box-shadow: 0 2px 12px rgba(102, 126, 234, 0.4);
                transition: all 0.25s ease;
                opacity: 0.88;
                user-select: none;
            }
            #aihelp-ticket-copy:hover { opacity: 1; transform: scale(1.05); }
            #aihelp-ticket-copy.success { background: linear-gradient(135deg, #11998e 0%, #38ef7d 100%) !important; }
        `);

        const copyButton = document.createElement('div');
        copyButton.id = 'aihelp-ticket-copy';
        copyButton.innerText = '复制 Ticket 信息';
        copyButton.addEventListener('click', () => handleCopyAction(copyButton));
        document.body.appendChild(copyButton);
    }

    initCopyButton();
})();

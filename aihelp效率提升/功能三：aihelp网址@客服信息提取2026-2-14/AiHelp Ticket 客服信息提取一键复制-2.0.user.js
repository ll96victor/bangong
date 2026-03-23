// ==UserScript==
// @name         AiHelp Ticket 客服信息提取一键复制
// @namespace    http://tampermonkey.net/
// @version      2.0
// @description  专门针对 AiHelp Ticket (客诉) 页面。点击图标复制URL@客服，悬浮3秒显示提示。
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

    function isTicketPage() {
        return window.location.href.includes('ticket');
    }

    if (!isTicketPage()) return;

    const DEBUG = true;
    function log(...args) {
        if (DEBUG) console.log('[AiHelp Ticket Debug]', ...args);
    }

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

    function extractFeishuOrder() {
        try {
            log('开始提取飞书单...');
            
            let feishuLink = null;
            const allLinks = document.querySelectorAll('a');
            log('页面总链接数量:', allLinks.length);
            
            for (const link of allLinks) {
                const href = link.getAttribute('href') || '';
                if (href.includes('feishu.cn')) {
                    feishuLink = link;
                    log('找到飞书链接:', href);
                    break;
                }
            }
            
            if (!feishuLink) {
                log('未找到飞书链接，尝试搜索文本...');
                const allDivs = document.querySelectorAll('div');
                for (const div of allDivs) {
                    if (div.innerText && div.innerText.includes('飞书单：')) {
                        log('找到包含飞书单的div:', div.innerText.substring(0, 100));
                        const linkInDiv = div.querySelector('a');
                        if (linkInDiv) {
                            feishuLink = linkInDiv;
                            log('在div中找到链接');
                            break;
                        }
                    }
                }
            }
            
            if (!feishuLink) {
                log('仍未找到飞书链接');
                return null;
            }

            let linkHref = feishuLink.getAttribute('href') || '';
            linkHref = linkHref.replace(/[`\s]/g, '').trim();
            log('飞书链接(清理后):', linkHref);

            let timeText = '';
            let parent = feishuLink.parentElement;
            for (let i = 0; i < 10 && parent; i++) {
                const timeSpan = parent.querySelector('.note-time');
                if (timeSpan) {
                    const fullTimeText = timeSpan.textContent.trim();
                    log('时间文本:', fullTimeText);
                    const pipeIndex = fullTimeText.indexOf('|');
                    timeText = pipeIndex !== -1 ? fullTimeText.substring(0, pipeIndex).trim() : fullTimeText;
                    break;
                }
                parent = parent.parentElement;
            }
            
            if (!timeText) {
                const timeSpan = document.querySelector('.note-time');
                if (timeSpan) {
                    const fullTimeText = timeSpan.textContent.trim();
                    log('全局时间文本:', fullTimeText);
                    const pipeIndex = fullTimeText.indexOf('|');
                    timeText = pipeIndex !== -1 ? fullTimeText.substring(0, pipeIndex).trim() : fullTimeText;
                }
            }

            const feishuOrder = `飞书单：${linkHref} 的子单`;
            if (timeText) {
                log('提取成功:', `${feishuOrder}\n${timeText}`);
                return `${feishuOrder}\n${timeText}`;
            }
            log('提取成功(无时间):', feishuOrder);
            return feishuOrder;
        } catch (e) {
            console.error('飞书单提取失败:', e);
        }
        return null;
    }

    function handleCopyAction(button) {
        try {
            const agentInfo = extractTicketAgentInfo();
            const finalAgentName = agentInfo ? agentInfo.name : '未知客服';
            const finalPrefix = agentInfo ? agentInfo.prefix : '';

            let copyText;
            if (finalAgentName === '未知客服') {
                const feishuOrder = extractFeishuOrder();
                if (feishuOrder) {
                    copyText = `${window.location.href}\n${feishuOrder}`;
                } else {
                    copyText = `${window.location.href} @${finalAgentName}`;
                }
            } else {
                copyText = `${window.location.href} @${finalAgentName}`;
            }

            GM_setClipboard(copyText);

            showFeedback(button, finalPrefix || '✓', 'success');
        } catch (e) {
            showFeedback(button, '✗', 'error');
        }
    }

    function showFeedback(btn, text, type) {
        const iconSpan = btn.querySelector('.ai-icon-symbol');
        const originalText = iconSpan ? iconSpan.textContent : '📋';

        if (iconSpan) {
            iconSpan.textContent = text;
        }

        if (type === 'success') {
            btn.classList.add('ai-icon-success');
        }
        if (type === 'error') {
            btn.classList.add('ai-icon-error');
        }

        setTimeout(() => {
            if (iconSpan) {
                iconSpan.textContent = originalText;
            }
            btn.classList.remove('ai-icon-success', 'ai-icon-error');
        }, 1500);
    }

    GM_addStyle(`
        .ai-copy-icon-btn {
            position: fixed;
            top: 0px;
            right: 400px;
            z-index: 99999;
            width: 36px;
            height: 36px;
            border-radius: 50%;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: #fff;
            font-size: 16px;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            box-shadow: 0 2px 8px rgba(102, 126, 234, 0.35);
            transition: transform 0.2s ease, box-shadow 0.2s ease, opacity 0.2s ease;
            opacity: 0.85;
            user-select: none;
            overflow: visible;
        }

        .ai-copy-icon-btn:hover {
            opacity: 1;
            transform: scale(1.08);
            box-shadow: 0 4px 16px rgba(102, 126, 234, 0.5);
        }

        .ai-copy-icon-btn:active {
            transform: scale(0.95);
        }

        .ai-copy-icon-btn.ai-icon-success {
            background: linear-gradient(135deg, #11998e 0%, #38ef7d 100%) !important;
        }

        .ai-copy-icon-btn.ai-icon-error {
            background: linear-gradient(135deg, #e53e3e 0%, #fc8181 100%) !important;
        }

        .ai-delayed-tooltip {
            position: absolute;
            left: 50%;
            bottom: calc(100% + 10px);
            transform: translateX(-50%) translateY(5px);
            background: rgba(30, 30, 30, 0.95);
            color: #fff;
            padding: 8px 14px;
            border-radius: 6px;
            font-size: 13px;
            white-space: nowrap;
            opacity: 0;
            pointer-events: none;
            transition: opacity 0.25s ease, transform 0.25s ease;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
            z-index: 100001;
        }

        .ai-delayed-tooltip::after {
            content: '';
            position: absolute;
            top: 100%;
            left: 50%;
            transform: translateX(-50%);
            border: 6px solid transparent;
            border-top-color: rgba(30, 30, 30, 0.95);
        }

        .ai-delayed-tooltip.visible {
            opacity: 1;
            transform: translateX(-50%) translateY(0);
        }

        .ai-tooltip-title {
            font-weight: 600;
            margin-bottom: 2px;
        }

        .ai-tooltip-desc {
            font-size: 11px;
            opacity: 0.8;
        }
    `);

    function initCopyButton() {
        const copyButton = document.createElement('div');
        copyButton.className = 'ai-copy-icon-btn';
        copyButton.innerHTML = '<span class="ai-icon-symbol">📋</span>';

        const tooltip = document.createElement('div');
        tooltip.className = 'ai-delayed-tooltip';
        tooltip.innerHTML = `
            <div class="ai-tooltip-title">复制URL@客服</div>
            <div class="ai-tooltip-desc">点击复制当前页面链接和客服信息</div>
        `;
        copyButton.appendChild(tooltip);

        let hoverTimer = null;
        const TIP_DELAY = 3000;

        let isDragging = false;
        let mouseDownPos = { x: 0, y: 0 };
        let btnStartPos = { x: 0, y: 0 };

        copyButton.addEventListener('mouseenter', () => {
            if (hoverTimer) {
                clearTimeout(hoverTimer);
            }
            hoverTimer = setTimeout(() => {
                tooltip.classList.add('visible');
            }, TIP_DELAY);
        });

        copyButton.addEventListener('mouseleave', () => {
            if (hoverTimer) {
                clearTimeout(hoverTimer);
                hoverTimer = null;
            }
            tooltip.classList.remove('visible');
        });

        copyButton.addEventListener('mousedown', (e) => {
            if (e.button !== 0) return;

            isDragging = false;
            mouseDownPos = { x: e.clientX, y: e.clientY };

            const rect = copyButton.getBoundingClientRect();
            btnStartPos = {
                x: e.clientX - rect.left,
                y: e.clientY - rect.top
            };

            if (hoverTimer) {
                clearTimeout(hoverTimer);
                hoverTimer = null;
            }
            tooltip.classList.remove('visible');

            const handleMouseMove = (moveEvent) => {
                const dx = moveEvent.clientX - mouseDownPos.x;
                const dy = moveEvent.clientY - mouseDownPos.y;

                if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
                    isDragging = true;

                    let newX = moveEvent.clientX - btnStartPos.x;
                    let newY = moveEvent.clientY - btnStartPos.y;

                    newX = Math.max(0, Math.min(newX, window.innerWidth - 36));
                    newY = Math.max(0, Math.min(newY, window.innerHeight - 36));

                    copyButton.style.left = newX + 'px';
                    copyButton.style.top = newY + 'px';
                    copyButton.style.right = 'auto';
                }
            };

            const handleMouseUp = (upEvent) => {
                document.removeEventListener('mousemove', handleMouseMove);
                document.removeEventListener('mouseup', handleMouseUp);

                if (!isDragging) {
                    handleCopyAction(copyButton);
                }
            };

            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
        });

        document.body.appendChild(copyButton);
    }

    initCopyButton();
})();

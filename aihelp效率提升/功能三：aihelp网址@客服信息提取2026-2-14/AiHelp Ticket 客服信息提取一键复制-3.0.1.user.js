// ==UserScript==
// @name         AiHelp Ticket 客服信息提取一键复制
// @namespace    http://tampermonkey.net/
// @version      3.0.1
// @description  专门针对 AiHelp Ticket (客诉) 页面。点击图标复制URL@客服，悬浮3秒显示提示。新增分组和打标签功能。
// @author       Front-end Expert
// @match        https://ml-panel.aihelp.net/*
// @match        https://ml-panel.aihelp.net/dashboard/#/manual/tickets/?queryType=3
// @match        https://ml.aihelp.net/*
// @match        https://aihelp.net.cn/*
// @match        https://aihelp.net/*
// @grant        GM_setClipboard
// @grant        GM_addStyle
// ==/UserScript==

/**
 * 更新日志：
 * v3.0.1 (2026-03-20)
 * - 修复：油猴脚本沙箱环境中 MouseEvent 的 view 属性问题
 *
 * v3.0 (2026-03-20)
 * - 新增：更改分组功能（点击分组按钮→选择"CN 二线-BUG"→确认）
 * - 新增：打标签功能（自动检测并添加"BUG二綫 BUG Agents"标签）
 * - 优化：UI改为双按钮布局，支持多功能入口
 * - 优化：添加状态反馈和错误处理
 *
 * v2.1 (2026-02-14)
 * - 原始功能：复制URL@客服信息
 */

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

    const CONFIG = {
        targetGroup: 'CN 二线-BUG',
        targetTag: 'BUG二綫 BUG Agents',
        dialogWaitTime: 1500,
        dropdownWaitTime: 800,
        inputWaitTime: 300
    };

    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    function isElementAvailable(el) {
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

    function simulateInputValue(element, value) {
        if (!element) return false;
        try {
            element.focus();
            const nativeSetter = Object.getOwnPropertyDescriptor(
                window.HTMLInputElement.prototype, 'value'
            ).set;
            nativeSetter.call(element, value);
            const events = ['input', 'change', 'keydown', 'keyup'];
            events.forEach(eventType => {
                element.dispatchEvent(new Event(eventType, { bubbles: true }));
            });
            element.dispatchEvent(new Event('compositionstart', { bubbles: true }));
            element.dispatchEvent(new Event('compositionend', { bubbles: true }));
            return true;
        } catch (e) {
            console.error('[模拟输入失败]', e);
            return false;
        }
    }

    function triggerClick(element) {
        if (!element) return false;
        element.focus();
        const rect = element.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        ['mousedown', 'mouseup', 'click'].forEach(type => {
            element.dispatchEvent(new MouseEvent(type, {
                bubbles: true,
                cancelable: true,
                clientX: cx,
                clientY: cy,
                button: 0
            }));
        });
        return true;
    }

    function waitForElement(selector, timeout = 10000, checkAvailable = true) {
        return new Promise((resolve, reject) => {
            const existing = document.querySelector(selector);
            if (existing && (!checkAvailable || isElementAvailable(existing))) {
                return resolve(existing);
            }

            const observer = new MutationObserver(() => {
                const el = document.querySelector(selector);
                if (el && (!checkAvailable || isElementAvailable(el))) {
                    observer.disconnect();
                    resolve(el);
                }
            });

            observer.observe(document.body, {
                childList: true,
                subtree: true,
                attributes: true,
                attributeFilter: ['style', 'class', 'disabled']
            });

            setTimeout(() => {
                observer.disconnect();
                reject(new Error('等待超时: ' + selector));
            }, timeout);
        });
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

    async function handleChangeGroup(button) {
        log('开始执行更改分组功能...');
        try {
            const groupBtn = findGroupButton();
            if (!groupBtn) {
                log('未找到分组按钮');
                showFeedback(button, '✗', 'error');
                return;
            }

            log('找到分组按钮，点击...');
            triggerClick(groupBtn);
            await sleep(CONFIG.dialogWaitTime);

            const queueInput = await waitForQueueInput();
            if (!queueInput) {
                log('未找到客诉队列输入框');
                showFeedback(button, '✗', 'error');
                return;
            }

            log('找到客诉队列输入框，点击并输入...');
            triggerClick(queueInput);
            await sleep(CONFIG.inputWaitTime);

            log('直接在输入框输入目标分组:', CONFIG.targetGroup);
            simulateInputValue(queueInput, CONFIG.targetGroup);
            await sleep(CONFIG.dropdownWaitTime);

            const targetOption = await findDropdownOption(CONFIG.targetGroup);
            if (!targetOption) {
                log('未找到目标分组选项');
                showFeedback(button, '✗', 'error');
                return;
            }

            log('点击目标分组选项');
            triggerClick(targetOption);
            await sleep(CONFIG.inputWaitTime);

            const confirmBtn = await findConfirmButton();
            if (!confirmBtn) {
                log('未找到确认按钮');
                showFeedback(button, '✗', 'error');
                return;
            }

            log('点击确认按钮');
            triggerClick(confirmBtn);
            await sleep(CONFIG.inputWaitTime);

            log('更改分组成功');
            showFeedback(button, '✓', 'success');
        } catch (e) {
            console.error('[更改分组失败]', e);
            showFeedback(button, '✗', 'error');
        }
    }

    function findGroupButton() {
        const allButtons = document.querySelectorAll('button');
        for (const btn of allButtons) {
            const svg = btn.querySelector('svg.icon-ai-group');
            if (svg && isElementAvailable(btn)) {
                const rect = btn.getBoundingClientRect();
                if (rect.top > 0 && rect.top < 200) {
                    log('找到分组按钮，文本:', btn.textContent.trim());
                    return btn;
                }
            }
        }
        return null;
    }

    async function waitForQueueInput(timeout = 5000) {
        const startTime = Date.now();
        while (Date.now() - startTime < timeout) {
            const dialog = document.querySelector('.ai-distribute-ticket-wrap');
            if (dialog) {
                const inputs = dialog.querySelectorAll('input.el-input__inner');
                for (const input of inputs) {
                    const placeholder = input.getAttribute('placeholder') || '';
                    if (placeholder.includes('请选择客诉队列') || placeholder.includes('客诉队列')) {
                        if (isElementAvailable(input)) {
                            log('找到客诉队列输入框，placeholder:', placeholder);
                            return input;
                        }
                    }
                }
            }
            await sleep(200);
        }
        return null;
    }

    async function waitForDropdownSearchInput(timeout = 3000) {
        const startTime = Date.now();
        while (Date.now() - startTime < timeout) {
            const dropdowns = document.querySelectorAll('.el-select-dropdown:not([style*="display: none"])');
            for (const dropdown of dropdowns) {
                const input = dropdown.querySelector('input.el-input__inner');
                if (input && isElementAvailable(input)) {
                    log('找到下拉搜索输入框');
                    return input;
                }
            }
            await sleep(100);
        }
        return null;
    }

    async function findDropdownOption(targetText) {
        const startTime = Date.now();
        while (Date.now() - startTime < 3000) {
            const options = document.querySelectorAll('.el-select-dropdown__item');
            for (const option of options) {
                const text = option.textContent.trim();
                if (text.includes(targetText) || text === targetText) {
                    if (isElementAvailable(option)) {
                        log('找到目标选项:', text);
                        return option;
                    }
                }
            }
            await sleep(100);
        }
        return null;
    }

    async function findConfirmButton(timeout = 3000) {
        const startTime = Date.now();
        while (Date.now() - startTime < timeout) {
            const buttons = document.querySelectorAll('button.el-button--primary');
            for (const btn of buttons) {
                const text = btn.textContent.trim();
                if (text === '确认' && isElementAvailable(btn)) {
                    log('找到确认按钮');
                    return btn;
                }
            }
            await sleep(100);
        }
        return null;
    }

    async function handleAddTag(button) {
        log('开始执行打标签功能...');
        try {
            const tagContainer = findTagContainer();
            if (!tagContainer) {
                log('未找到标签容器');
                showFeedback(button, '✗', 'error');
                return;
            }

            const showtags = tagContainer.getAttribute('showtags') || '';
            if (showtags.includes(CONFIG.targetTag)) {
                log('标签已存在，无需添加');
                showFeedback(button, '✓', 'success');
                return;
            }

            log('标签不存在，开始添加...');
            const searchInput = tagContainer.querySelector('.elp-cascader__search-input');
            if (!searchInput) {
                log('未找到标签搜索输入框');
                showFeedback(button, '✗', 'error');
                return;
            }

            log('点击标签输入框...');
            triggerClick(searchInput);
            await sleep(CONFIG.dropdownWaitTime);

            log('输入目标标签:', CONFIG.targetTag);
            simulateInputValue(searchInput, CONFIG.targetTag);
            await sleep(CONFIG.dropdownWaitTime);

            const tagOption = await findTagOption(CONFIG.targetTag);
            if (!tagOption) {
                log('未找到目标标签选项');
                showFeedback(button, '✗', 'error');
                return;
            }

            log('点击目标标签选项');
            triggerClick(tagOption);
            await sleep(CONFIG.inputWaitTime);

            log('打标签成功');
            showFeedback(button, '✓', 'success');
        } catch (e) {
            console.error('[打标签失败]', e);
            showFeedback(button, '✗', 'error');
        }
    }

    function findTagContainer() {
        const containers = document.querySelectorAll('.ai-select-tag.elp-cascader');
        for (const container of containers) {
            if (isElementAvailable(container)) {
                log('找到标签容器');
                return container;
            }
        }
        return null;
    }

    async function findTagOption(targetText) {
        const startTime = Date.now();
        while (Date.now() - startTime < 3000) {
            const options = document.querySelectorAll('.elp-cascader__suggestion-item, .el-cascader-node__label, .el-select-dropdown__item');
            for (const option of options) {
                const text = option.textContent.trim();
                if (text.includes(targetText) || text === targetText) {
                    if (isElementAvailable(option)) {
                        log('找到目标标签选项:', text);
                        return option;
                    }
                }
            }
            await sleep(100);
        }
        return null;
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

        .ai-action-btn-container {
            position: fixed;
            top: 0px;
            right: 440px;
            z-index: 99999;
            display: flex;
            gap: 8px;
        }

        .ai-action-btn {
            width: 36px;
            height: 36px;
            border-radius: 50%;
            color: #fff;
            font-size: 14px;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
            transition: transform 0.2s ease, box-shadow 0.2s ease, opacity 0.2s ease;
            opacity: 0.85;
            user-select: none;
            overflow: visible;
        }

        .ai-action-btn:hover {
            opacity: 1;
            transform: scale(1.08);
            box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
        }

        .ai-action-btn:active {
            transform: scale(0.95);
        }

        .ai-action-btn.ai-btn-group {
            background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
        }

        .ai-action-btn.ai-btn-tag {
            background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%);
        }

        .ai-action-btn.ai-icon-success {
            background: linear-gradient(135deg, #11998e 0%, #38ef7d 100%) !important;
        }

        .ai-action-btn.ai-icon-error {
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

    function createButtonWithTooltip(id, className, symbol, tooltipTitle, tooltipDesc, clickHandler) {
        const btn = document.createElement('div');
        btn.id = id;
        btn.className = className;
        btn.innerHTML = `<span class="ai-icon-symbol">${symbol}</span>`;

        const tooltip = document.createElement('div');
        tooltip.className = 'ai-delayed-tooltip';
        tooltip.innerHTML = `
            <div class="ai-tooltip-title">${tooltipTitle}</div>
            <div class="ai-tooltip-desc">${tooltipDesc}</div>
        `;
        btn.appendChild(tooltip);

        let hoverTimer = null;
        const TIP_DELAY = 3000;

        let isDragging = false;
        let mouseDownPos = { x: 0, y: 0 };
        let btnStartPos = { x: 0, y: 0 };

        btn.addEventListener('mouseenter', () => {
            if (hoverTimer) {
                clearTimeout(hoverTimer);
            }
            hoverTimer = setTimeout(() => {
                tooltip.classList.add('visible');
            }, TIP_DELAY);
        });

        btn.addEventListener('mouseleave', () => {
            if (hoverTimer) {
                clearTimeout(hoverTimer);
                hoverTimer = null;
            }
            tooltip.classList.remove('visible');
        });

        btn.addEventListener('mousedown', (e) => {
            if (e.button !== 0) return;

            isDragging = false;
            mouseDownPos = { x: e.clientX, y: e.clientY };

            const rect = btn.getBoundingClientRect();
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

                    btn.style.left = newX + 'px';
                    btn.style.top = newY + 'px';
                    btn.style.right = 'auto';
                }
            };

            const handleMouseUp = (upEvent) => {
                document.removeEventListener('mousemove', handleMouseMove);
                document.removeEventListener('mouseup', handleMouseUp);

                if (!isDragging) {
                    clickHandler(btn);
                }
            };

            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
        });

        return btn;
    }

    function initButtons() {
        const copyButton = createButtonWithTooltip(
            'ai-copy-btn',
            'ai-copy-icon-btn',
            '📋',
            '复制URL@客服',
            '点击复制当前页面链接和客服信息',
            handleCopyAction
        );
        document.body.appendChild(copyButton);

        const actionContainer = document.createElement('div');
        actionContainer.className = 'ai-action-btn-container';

        const groupButton = createButtonWithTooltip(
            'ai-group-btn',
            'ai-action-btn ai-btn-group',
            '📁',
            '更改分组',
            '点击更改分组为"CN 二线-BUG"',
            handleChangeGroup
        );

        const tagButton = createButtonWithTooltip(
            'ai-tag-btn',
            'ai-action-btn ai-btn-tag',
            '🏷️',
            '打标签',
            '点击添加"BUG二綫 BUG Agents"标签',
            handleAddTag
        );

        actionContainer.appendChild(groupButton);
        actionContainer.appendChild(tagButton);
        document.body.appendChild(actionContainer);
    }

    initButtons();
})();

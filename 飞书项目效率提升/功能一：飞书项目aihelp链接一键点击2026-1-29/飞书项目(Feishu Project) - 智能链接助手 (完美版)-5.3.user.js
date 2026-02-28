// ==UserScript==
// @name         飞书项目(Feishu Project) - 智能链接助手 (完美版)
// @namespace    http://tampermonkey.net/
// @version      5.3
// @description  修复多链接bug：只打开视口内链接，增强状态锁，详细日志
// @author       You
// @match        *://project.feishu.cn/*
// @grant        GM_openInTab
// @grant        GM_addStyle
// @run-at       document-end
// ==/UserScript==

(function() {
    'use strict';

    // ================= 配置区域 =================
    const CONFIG = {
        KEYWORD: 'aihelp',
        SHORTCUT_KEY: 'q',
        LOCK_TIME: 1500,
        CHECK_INTERVAL: 2000,
        TIP_DELAY: 3000,
        MAX_LOG_LINES: 100,
        DRAG_THRESHOLD: 5,
        EXCLUDE_EXTS: ['.bytes', '.jpg', '.png', '.jpeg', '.gif', '.svg', '.webp'],
        LOG_LEVELS: { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 },
        CURRENT_LOG_LEVEL: 0
    };

    const ZONE_TIPS = {
        action: { title: '提取链接', desc: '提取当前视口内的aihelp链接' },
        log: { title: '日志面板', desc: '查看调试日志和链接详情' }
    };
    // ===========================================

    // ================= 日志系统 =================
    const LOG_PREFIX = '[FeishuHelper]';
    const logHistory = [];
    const logPanelListeners = new Set();

    function log(level, message, ...args) {
        const timestamp = new Date().toLocaleTimeString();
        const levelName = Object.keys(CONFIG.LOG_LEVELS).find(k => CONFIG.LOG_LEVELS[k] === level) || 'INFO';
        
        if (level >= CONFIG.CURRENT_LOG_LEVEL) {
            console.log(`${LOG_PREFIX} [${timestamp}] [${levelName}] ${message}`, ...args);
        }

        const logEntry = {
            timestamp,
            level: levelName,
            message,
            details: args.length > 0 ? args.map(a => {
                try {
                    return typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a);
                } catch (e) {
                    return '[无法序列化]';
                }
            }) : []
        };

        logHistory.push(logEntry);
        if (logHistory.length > CONFIG.MAX_LOG_LINES) {
            logHistory.shift();
        }

        notifyLogPanel(logEntry);
    }

    function logDebug(msg, ...args) { log(CONFIG.LOG_LEVELS.DEBUG, msg, ...args); }
    function logInfo(msg, ...args) { log(CONFIG.LOG_LEVELS.INFO, msg, ...args); }
    function logWarn(msg, ...args) { log(CONFIG.LOG_LEVELS.WARN, msg, ...args); }
    function logError(msg, ...args) { log(CONFIG.LOG_LEVELS.ERROR, msg, ...args); }

    function notifyLogPanel(entry) {
        logPanelListeners.forEach(fn => {
            try { fn(entry); } catch (e) { }
        });
    }

    function registerLogPanelListener(fn) {
        logPanelListeners.add(fn);
        return () => logPanelListeners.delete(fn);
    }

    logInfo('脚本初始化开始...');
    // ===========================================

    // ================= 状态管理 =================
    const state = {
        isProcessing: false,
        processId: 0,
        logPanelVisible: false,
        keepAliveTimer: null
    };
    // ===========================================

    // ================= 样式注入 =================
    GM_addStyle(`
        .fs-status-bar-container {
            position: fixed;
            bottom: 120px;
            right: 30px;
            z-index: 2147483647;
            user-select: none;
        }

        .fs-status-icon {
            width: 48px;
            height: 24px;
            display: grid;
            grid-template-columns: 1fr 1fr;
            grid-template-rows: 1fr;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            border-radius: 12px;
            box-shadow: 0 2px 8px rgba(102, 126, 234, 0.4);
            cursor: pointer;
            transition: transform 0.2s ease, box-shadow 0.2s ease;
        }

        .fs-status-icon:hover {
            transform: scale(1.05);
            box-shadow: 0 4px 12px rgba(102, 126, 234, 0.6);
        }

        .fs-status-icon:active {
            transform: scale(0.98);
        }

        .fs-icon-zone {
            width: 24px;
            height: 24px;
            overflow: visible;
            position: relative;
            display: flex;
            align-items: center;
            justify-content: center;
        }

        .fs-icon-zone:first-child {
            border-radius: 12px 0 0 12px;
        }

        .fs-icon-zone:last-child {
            border-radius: 0 12px 12px 0;
        }

        .fs-icon-zone:hover {
            background: rgba(255, 255, 255, 0.15);
        }

        .fs-icon-zone:active {
            background: rgba(255, 255, 255, 0.25);
        }

        .fs-zone-text {
            font-size: 14px;
            color: white;
            line-height: 1;
        }

        .fs-delayed-tip {
            position: absolute;
            left: 50%;
            bottom: calc(100% + 8px);
            transform: translateX(-50%) translateY(5px);
            background: rgba(0, 0, 0, 0.85);
            color: #fff;
            padding: 8px 12px;
            border-radius: 6px;
            font-size: 12px;
            white-space: nowrap;
            opacity: 0;
            transition: opacity 0.3s ease, transform 0.3s ease;
            pointer-events: none;
            z-index: 2147483647;
            text-align: center;
        }

        .fs-delayed-tip.visible {
            opacity: 1;
            transform: translateX(-50%) translateY(0);
        }

        .fs-delayed-tip::after {
            content: '';
            position: absolute;
            top: 100%;
            left: 50%;
            transform: translateX(-50%);
            border: 6px solid transparent;
            border-top-color: rgba(0, 0, 0, 0.85);
        }

        .fs-delayed-tip-title {
            font-weight: bold;
            margin-bottom: 2px;
        }

        .fs-delayed-tip-desc {
            color: #aaa;
            font-size: 11px;
        }

        .fs-opener-toast {
            position: fixed;
            top: 30px;
            left: 50%;
            transform: translateX(-50%);
            background: rgba(0, 0, 0, 0.85);
            color: #fff;
            padding: 10px 20px;
            border-radius: 8px;
            z-index: 2147483647;
            font-size: 14px;
            pointer-events: none;
            animation: fadeInOut 2.5s forwards;
        }

        @keyframes fadeInOut {
            0% { opacity: 0; transform: translate(-50%, -10px); }
            10% { opacity: 1; transform: translate(-50%, 0); }
            80% { opacity: 1; }
            100% { opacity: 0; }
        }

        #fs-log-panel {
            position: fixed;
            top: 80px;
            right: 20px;
            width: 450px;
            max-height: 450px;
            background: #1e1e1e;
            border-radius: 8px;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
            z-index: 2147483646;
            font-family: 'Consolas', 'Monaco', monospace;
            font-size: 12px;
            overflow: hidden;
            display: none;
        }

        #fs-log-panel.visible {
            display: flex;
            flex-direction: column;
        }

        #fs-log-panel-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 10px 12px;
            background: #2d2d2d;
            border-bottom: 1px solid #404040;
            cursor: move;
            user-select: none;
        }

        #fs-log-panel-title {
            color: #e0e0e0;
            font-weight: bold;
        }

        #fs-log-panel-close {
            color: #888;
            cursor: pointer;
            font-size: 16px;
            padding: 2px 6px;
        }

        #fs-log-panel-close:hover {
            color: #fff;
        }

        #fs-log-panel-content {
            flex: 1;
            overflow-y: auto;
            padding: 8px;
            max-height: 390px;
        }

        .fs-log-entry {
            padding: 4px 8px;
            border-bottom: 1px solid #333;
            word-break: break-all;
        }

        .fs-log-entry:last-child {
            border-bottom: none;
        }

        .fs-log-time {
            color: #888;
            margin-right: 8px;
        }

        .fs-log-level {
            padding: 1px 4px;
            border-radius: 3px;
            font-size: 10px;
            margin-right: 6px;
        }

        .fs-log-level-DEBUG { background: #444; color: #aaa; }
        .fs-log-level-INFO { background: #1a5276; color: #5dade2; }
        .fs-log-level-WARN { background: #7d5a00; color: #f7dc6f; }
        .fs-log-level-ERROR { background: #922b21; color: #f1948a; }

        .fs-log-msg {
            color: #e0e0e0;
        }

        .fs-log-details {
            color: #888;
            font-size: 11px;
            margin-top: 4px;
            padding-left: 12px;
            white-space: pre-wrap;
        }

        .fs-log-link {
            color: #5dade2;
            text-decoration: underline;
            cursor: pointer;
        }

        .fs-log-link:hover {
            color: #85c1e9;
        }

        .fs-icon-zone.success {
            background: rgba(46, 204, 113, 0.4) !important;
        }

        .fs-icon-zone.processing {
            opacity: 0.6;
        }
    `);
    // ===========================================

    // ================= Toast 提示 =================
    function showToast(msg) {
        logInfo('Toast: ' + msg);
        const oldToast = document.querySelector('.fs-opener-toast');
        if (oldToast) oldToast.remove();

        const toast = document.createElement('div');
        toast.className = 'fs-opener-toast';
        toast.textContent = msg;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 2600);
    }
    // ===============================================

    // ================= 悬浮窗UI类 =================
    class StatusBarUI {
        constructor() {
            this.container = null;
            this.iconElement = null;
            this.zones = {};
            this.delayedTipTimers = {};
            this.delayedTipElements = {};
            this.actionCallbacks = {
                action: null,
                log: null
            };
            this.isDragging = false;
            this.dragStartPos = { x: 0, y: 0 };
            this.containerOffset = { x: 0, y: 0 };

            this.init();
        }

        init() {
            this.createDOM();
            this.bindEvents();
            this.registerCallbacks();
        }

        createDOM() {
            if (document.querySelector('.fs-status-bar-container')) {
                logDebug('悬浮窗已存在，跳过创建');
                return;
            }

            logInfo('创建悬浮窗...');

            this.container = document.createElement('div');
            this.container.className = 'fs-status-bar-container';

            this.iconElement = document.createElement('div');
            this.iconElement.className = 'fs-status-icon';

            const actionZone = document.createElement('div');
            actionZone.className = 'fs-icon-zone';
            actionZone.dataset.zone = 'action';
            actionZone.innerHTML = '<span class="fs-zone-text">⚡</span>';

            const logZone = document.createElement('div');
            logZone.className = 'fs-icon-zone';
            logZone.dataset.zone = 'log';
            logZone.innerHTML = '<span class="fs-zone-text">📋</span>';

            this.iconElement.appendChild(actionZone);
            this.iconElement.appendChild(logZone);

            this.zones = {
                action: actionZone,
                log: logZone
            };

            this.container.appendChild(this.iconElement);
            document.body.appendChild(this.container);

            logInfo('悬浮窗创建完成');
        }

        bindEvents() {
            this.iconElement.addEventListener('mousedown', (e) => {
                this.handleMouseDown(e);
            });

            Object.keys(this.zones).forEach(zoneName => {
                const zone = this.zones[zoneName];

                zone.addEventListener('mouseenter', () => {
                    if (!this.isDragging) {
                        this.startDelayedTipTimer(zoneName);
                    }
                });

                zone.addEventListener('mouseleave', () => {
                    this.cancelDelayedTipTimer(zoneName);
                    this.hideDelayedTip(zoneName);
                });

                zone.addEventListener('mousemove', () => {
                    if (!this.isDragging) {
                        this.cancelDelayedTipTimer(zoneName);
                        this.startDelayedTipTimer(zoneName);
                    }
                });
            });
        }

        handleMouseDown(e) {
            this.isDragging = false;
            this.dragStartPos = { x: e.clientX, y: e.clientY };

            const rect = this.container.getBoundingClientRect();
            this.containerOffset = {
                x: e.clientX - rect.left,
                y: e.clientY - rect.top
            };

            const handleMouseMove = (moveEvent) => {
                const dx = moveEvent.clientX - this.dragStartPos.x;
                const dy = moveEvent.clientY - this.dragStartPos.y;

                if (Math.abs(dx) > CONFIG.DRAG_THRESHOLD || Math.abs(dy) > CONFIG.DRAG_THRESHOLD) {
                    if (!this.isDragging) {
                        logDebug('开始拖拽');
                        this.cancelAllTipTimers();
                        this.hideAllTips();
                    }
                    this.isDragging = true;

                    let newX = moveEvent.clientX - this.containerOffset.x;
                    let newY = moveEvent.clientY - this.containerOffset.y;
                    newX = Math.max(0, Math.min(newX, window.innerWidth - 48));
                    newY = Math.max(0, Math.min(newY, window.innerHeight - 24));

                    this.container.style.right = 'auto';
                    this.container.style.bottom = 'auto';
                    this.container.style.left = newX + 'px';
                    this.container.style.top = newY + 'px';
                }
            };

            const handleMouseUp = (upEvent) => {
                document.removeEventListener('mousemove', handleMouseMove);
                document.removeEventListener('mouseup', handleMouseUp);

                if (!this.isDragging) {
                    const zone = upEvent.target.closest('.fs-icon-zone');
                    if (zone) {
                        this.handleZoneClick(zone.dataset.zone);
                    }
                } else {
                    logDebug('拖拽结束');
                }
            };

            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
        }

        handleZoneClick(zoneName) {
            logDebug('点击区域:', zoneName);

            if (this.actionCallbacks[zoneName]) {
                this.actionCallbacks[zoneName](this.zones[zoneName]);
            }
        }

        registerCallbacks() {
            this.actionCallbacks.action = (element) => {
                logInfo('点击提取链接');
                openValidLinks();
            };

            this.actionCallbacks.log = (element) => {
                logInfo('点击日志面板');
                logPanel.toggle();
            };
        }

        startDelayedTipTimer(zoneName) {
            if (this.delayedTipTimers[zoneName]) {
                clearTimeout(this.delayedTipTimers[zoneName]);
            }
            this.delayedTipTimers[zoneName] = setTimeout(() => {
                this.showDelayedTip(zoneName);
                logDebug('延迟提示显示:', zoneName);
            }, CONFIG.TIP_DELAY);
        }

        cancelDelayedTipTimer(zoneName) {
            if (this.delayedTipTimers[zoneName]) {
                clearTimeout(this.delayedTipTimers[zoneName]);
                this.delayedTipTimers[zoneName] = null;
            }
        }

        cancelAllTipTimers() {
            Object.keys(this.delayedTipTimers).forEach(zoneName => {
                this.cancelDelayedTipTimer(zoneName);
            });
        }

        showDelayedTip(zoneName) {
            const zone = this.zones[zoneName];
            if (!zone) return;

            let tipEl = this.delayedTipElements[zoneName];
            if (!tipEl) {
                tipEl = document.createElement('div');
                tipEl.className = 'fs-delayed-tip';
                const tipInfo = ZONE_TIPS[zoneName];
                tipEl.innerHTML = `
                    <div class="fs-delayed-tip-title">${tipInfo.title}</div>
                    <div class="fs-delayed-tip-desc">${tipInfo.desc}</div>
                `;
                zone.appendChild(tipEl);
                this.delayedTipElements[zoneName] = tipEl;
            }

            requestAnimationFrame(() => {
                tipEl.classList.add('visible');
            });
        }

        hideDelayedTip(zoneName) {
            const tipEl = this.delayedTipElements[zoneName];
            if (tipEl) {
                tipEl.classList.remove('visible');
            }
        }

        hideAllTips() {
            Object.keys(this.delayedTipElements).forEach(zoneName => {
                this.hideDelayedTip(zoneName);
            });
        }

        showZoneSuccess(zoneName) {
            if (this.zones[zoneName]) {
                this.zones[zoneName].classList.add('success');
                setTimeout(() => {
                    this.zones[zoneName].classList.remove('success');
                }, 1500);
            }
        }

        showZoneProcessing(zoneName) {
            if (this.zones[zoneName]) {
                this.zones[zoneName].classList.add('processing');
            }
        }

        hideZoneProcessing(zoneName) {
            if (this.zones[zoneName]) {
                this.zones[zoneName].classList.remove('processing');
            }
        }

        exists() {
            return !!document.querySelector('.fs-status-bar-container');
        }
    }
    // ===============================================

    // ================= 日志面板类 =================
    class LogPanel {
        constructor() {
            this.panel = null;
            this.content = null;
            this.isDragging = false;
            this.dragStartPos = { x: 0, y: 0 };
            this.panelOffset = { x: 0, y: 0 };
            this.unsubscribe = null;
        }

        create() {
            if (this.panel) {
                this.toggle();
                return;
            }

            logDebug('创建日志面板');
            this.panel = document.createElement('div');
            this.panel.id = 'fs-log-panel';
            this.panel.className = 'visible';
            state.logPanelVisible = true;

            this.panel.innerHTML = `
                <div id="fs-log-panel-header">
                    <span id="fs-log-panel-title">📋 调试日志</span>
                    <span id="fs-log-panel-close">×</span>
                </div>
                <div id="fs-log-panel-content"></div>
            `;

            document.body.appendChild(this.panel);
            this.content = this.panel.querySelector('#fs-log-panel-content');

            this.renderHistory();
            this.bindEvents();
            this.subscribeToLogs();
        }

        renderHistory() {
            logHistory.forEach(entry => this.appendEntry(entry));
            this.scrollToBottom();
        }

        appendEntry(entry) {
            if (!this.content) return;

            const div = document.createElement('div');
            div.className = 'fs-log-entry';

            let detailsHtml = '';
            if (entry.details && entry.details.length > 0) {
                detailsHtml = `<div class="fs-log-details">${entry.details.map(d => {
                    if (d && d.includes && d.includes('http')) {
                        return d.replace(/(https?:\/\/[^\s]+)/g, '<span class="fs-log-link">$1</span>');
                    }
                    return d;
                }).join('\n')}</div>`;
            }

            div.innerHTML = `
                <span class="fs-log-time">${entry.timestamp}</span>
                <span class="fs-log-level fs-log-level-${entry.level}">${entry.level}</span>
                <span class="fs-log-msg">${entry.message}</span>
                ${detailsHtml}
            `;

            this.content.appendChild(div);
            this.scrollToBottom();
        }

        scrollToBottom() {
            if (this.content) {
                this.content.scrollTop = this.content.scrollHeight;
            }
        }

        bindEvents() {
            const header = this.panel.querySelector('#fs-log-panel-header');
            const closeBtn = this.panel.querySelector('#fs-log-panel-close');

            closeBtn.addEventListener('click', () => this.hide());

            header.addEventListener('mousedown', (e) => {
                if (e.target === closeBtn) return;

                this.isDragging = false;
                this.dragStartPos = { x: e.clientX, y: e.clientY };

                const rect = this.panel.getBoundingClientRect();
                this.panelOffset = {
                    x: e.clientX - rect.left,
                    y: e.clientY - rect.top
                };

                const onMove = (ev) => {
                    const dx = ev.clientX - this.dragStartPos.x;
                    const dy = ev.clientY - this.dragStartPos.y;

                    if (Math.abs(dx) > CONFIG.DRAG_THRESHOLD || Math.abs(dy) > CONFIG.DRAG_THRESHOLD) {
                        this.isDragging = true;

                        let newX = ev.clientX - this.panelOffset.x;
                        let newY = ev.clientY - this.panelOffset.y;
                        newX = Math.max(0, Math.min(newX, window.innerWidth - 450));
                        newY = Math.max(0, Math.min(newY, window.innerHeight - 100));

                        this.panel.style.left = newX + 'px';
                        this.panel.style.top = newY + 'px';
                        this.panel.style.right = 'auto';
                    }
                };

                const onUp = () => {
                    document.removeEventListener('mousemove', onMove);
                    document.removeEventListener('mouseup', onUp);
                };

                document.addEventListener('mousemove', onMove);
                document.addEventListener('mouseup', onUp);
            });
        }

        subscribeToLogs() {
            this.unsubscribe = registerLogPanelListener((entry) => {
                if (state.logPanelVisible) {
                    this.appendEntry(entry);
                }
            });
        }

        toggle() {
            if (!this.panel) {
                this.create();
                return;
            }

            state.logPanelVisible = !state.logPanelVisible;
            if (state.logPanelVisible) {
                this.panel.classList.add('visible');
                this.scrollToBottom();
            } else {
                this.panel.classList.remove('visible');
            }
        }

        hide() {
            if (this.panel) {
                state.logPanelVisible = false;
                this.panel.classList.remove('visible');
            }
        }
    }

    const logPanel = new LogPanel();
    // ===============================================

    // ================= 链接提取上下文分析 =================
    function findCurrentContext() {
        logDebug('开始分析当前上下文...');

        const modalSelectors = [
            '[role="dialog"][aria-modal="true"]',
            '.larkc-modal-container',
            '.larkc-drawer',
            '[class*="Modal"]',
            '[class*="Drawer"]',
            '[class*="Dialog"]',
            '[class*="modal-content"]',
            '[class*="drawer-content"]'
        ];

        for (const selector of modalSelectors) {
            const elements = document.querySelectorAll(selector);
            for (const el of elements) {
                if (isElementVisible(el) && isElementInViewport(el)) {
                    logInfo('找到可见的上下文容器:', selector, '元素数量:', elements.length);
                    return { element: el, type: 'modal/drawer', selector };
                }
            }
        }

        const detailSelectors = [
            '.detail-panel',
            '[class*="detail-panel"]',
            '[class*="DetailPanel"]',
            '[class*="task-detail"]',
            '[class*="ticket-detail"]'
        ];

        for (const selector of detailSelectors) {
            const elements = document.querySelectorAll(selector);
            for (const el of elements) {
                if (isElementVisible(el) && isElementInViewport(el)) {
                    logInfo('找到可见的详情面板:', selector);
                    return { element: el, type: 'detail', selector };
                }
            }
        }

        const activeElement = document.activeElement;
        if (activeElement) {
            for (const selector of [...modalSelectors, ...detailSelectors]) {
                const container = activeElement.closest(selector);
                if (container && isElementVisible(container)) {
                    logInfo('找到焦点上下文:', selector);
                    return { element: container, type: 'focused', selector };
                }
            }
        }

        logDebug('未找到特定上下文，使用全局document');
        return { element: document, type: 'global', selector: 'document' };
    }

    function isElementVisible(el) {
        if (!el) return false;
        const style = window.getComputedStyle(el);
        return style.display !== 'none' &&
               style.visibility !== 'hidden' &&
               parseFloat(style.opacity) > 0;
    }

    function isElementInViewport(el) {
        if (!el) return false;
        const rect = el.getBoundingClientRect();
        const threshold = 50;
        return (
            rect.top < window.innerHeight - threshold &&
            rect.bottom > threshold &&
            rect.left < window.innerWidth - threshold &&
            rect.right > threshold
        );
    }

    function isLinkClickable(link) {
        if (!link) return false;
        
        const style = window.getComputedStyle(link);
        if (style.pointerEvents === 'none') {
            return false;
        }

        let parent = link.parentElement;
        let depth = 0;
        while (parent && depth < 10) {
            const parentStyle = window.getComputedStyle(parent);
            if (parentStyle.pointerEvents === 'none') {
                return false;
            }
            parent = parent.parentElement;
            depth++;
        }

        return true;
    }

    function extractLinksFromContext(context) {
        const links = context.element.querySelectorAll(`a[href*="${CONFIG.KEYWORD}"]`);
        logDebug(`在上下文 [${context.type}] 中找到 ${links.length} 个候选链接`);

        const results = [];
        const seenUrls = new Set();

        links.forEach((link, index) => {
            const url = link.href;
            const rect = link.getBoundingClientRect();
            const inViewport = isInViewport(link);
            const visible = isElementVisible(link);
            const clickable = isLinkClickable(link);

            logDebug(`链接 #${index + 1}:`, {
                url: url.substring(0, 60) + (url.length > 60 ? '...' : ''),
                text: (link.textContent?.trim() || '[无文本]').substring(0, 20),
                visible,
                inViewport,
                clickable,
                rect: `(${Math.round(rect.left)},${Math.round(rect.top)})-(${Math.round(rect.right)},${Math.round(rect.bottom)})`
            });

            if (!url || !url.startsWith('http')) {
                logDebug(`  -> 跳过: 非HTTP链接`);
                return;
            }

            if (seenUrls.has(url)) {
                logDebug(`  -> 跳过: URL重复`);
                return;
            }

            if (!inViewport) {
                logDebug(`  -> 跳过: 不在视口内`);
                return;
            }

            if (!visible) {
                logDebug(`  -> 跳过: 不可见`);
                return;
            }

            if (!clickable) {
                logDebug(`  -> 跳过: 不可点击(pointer-events:none)`);
                return;
            }

            try {
                const pathname = new URL(url).pathname.toLowerCase();
                const isExcluded = CONFIG.EXCLUDE_EXTS.some(ext => pathname.endsWith(ext));
                if (isExcluded) {
                    logDebug(`  -> 跳过: 排除的文件类型`);
                    return;
                }
            } catch (e) {
                logWarn(`  -> 跳过: URL解析失败`, url);
                return;
            }

            const linkInfo = {
                url,
                text: link.textContent?.trim() || '[无文本]',
                visible,
                inViewport,
                clickable,
                context: context.type,
                selector: context.selector
            };

            seenUrls.add(url);
            results.push(linkInfo);
            logInfo(`  -> ✓ 有效链接: ${url.substring(0, 50)}...`);
        });

        return results;
    }

    function isInViewport(el) {
        if (!el) return false;
        const rect = el.getBoundingClientRect();
        return (
            rect.top < window.innerHeight &&
            rect.bottom > 0 &&
            rect.left < window.innerWidth &&
            rect.right > 0 &&
            rect.width > 0 &&
            rect.height > 0
        );
    }
    // =======================================================

    // ================= 核心逻辑 =================
    let statusBarUI = null;

    function openValidLinks() {
        const currentProcessId = ++state.processId;
        
        if (state.isProcessing) {
            showToast('操作过于频繁，请稍候...');
            logWarn('操作被锁定，跳过 (processId:', currentProcessId, ')');
            return;
        }
        state.isProcessing = true;

        logInfo('========== 开始提取链接 ==========');
        logInfo('进程ID:', currentProcessId);
        logInfo('当前URL:', window.location.href);

        if (statusBarUI) {
            statusBarUI.showZoneProcessing('action');
        }

        const context = findCurrentContext();
        logInfo('提取上下文:', context.type, context.selector);

        const linkInfos = extractLinksFromContext(context);

        logInfo(`提取完成，有效链接数量: ${linkInfos.length}`);

        if (linkInfos.length === 0) {
            showToast(`当前视口内未发现有效的 "${CONFIG.KEYWORD}" 链接`);
            logWarn('提取失败：无有效链接');
            if (statusBarUI) {
                statusBarUI.hideZoneProcessing('action');
            }
            state.isProcessing = false;
            return;
        }

        logInfo('准备打开的链接列表:');
        linkInfos.forEach((info, i) => {
            logInfo(`  [${i + 1}] ${info.url}`);
            logDebug(`      文本: ${info.text}`);
            logDebug(`      来源: ${info.context}`);
        });

        const openCount = { value: 0 };

        if (linkInfos.length <= 5 || confirm(`检测到 ${linkInfos.length} 个有效链接。\n\n是否立即全部打开？\n\n(来源: ${context.type})`)) {
            linkInfos.forEach((info, index) => {
                logInfo(`打开链接 [${index + 1}/${linkInfos.length}]:`, info.url);
                try {
                    GM_openInTab(info.url, { active: false, insert: true });
                    openCount.value++;
                } catch (e) {
                    logError('打开链接失败:', info.url, e.message);
                }
            });
            
            showToast(`已在后台打开 ${openCount.value} 个链接`);
            logInfo(`成功打开 ${openCount.value} 个链接`);
            
            if (statusBarUI) {
                statusBarUI.showZoneSuccess('action');
            }
        } else {
            showToast('操作已取消');
            logInfo('用户取消操作');
        }

        if (statusBarUI) {
            statusBarUI.hideZoneProcessing('action');
        }

        logInfo('========== 提取结束 (进程ID: ' + currentProcessId + ') ==========');
        
        setTimeout(() => {
            if (state.processId === currentProcessId) {
                state.isProcessing = false;
                logDebug('状态锁已释放');
            }
        }, CONFIG.LOCK_TIME);
    }
    // =============================================

    // ================= DOM监听逻辑 =================
    function onUrlChange() {
        logDebug('URL变化检测，尝试创建悬浮窗');
        setTimeout(createStatusBar, 100);
        setTimeout(createStatusBar, 400);
    }

    function createStatusBar() {
        if (!statusBarUI || !statusBarUI.exists()) {
            statusBarUI = new StatusBarUI();
        }
    }

    function setupMutationObserver() {
        logDebug('启动 MutationObserver 监听...');

        const observer = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                    if (!statusBarUI || !statusBarUI.exists()) {
                        createStatusBar();
                        startKeepAliveCheck();
                        break;
                    }
                }
            }
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });

        logDebug('MutationObserver 监听已启动');
    }

    function startKeepAliveCheck() {
        if (state.keepAliveTimer) return;

        state.keepAliveTimer = setInterval(() => {
            if (statusBarUI && statusBarUI.exists()) {
                clearInterval(state.keepAliveTimer);
                state.keepAliveTimer = null;
                logDebug('悬浮窗存在，停止保活检查');
            } else {
                logWarn('定时检查：悬浮窗丢失，重新创建');
                createStatusBar();
            }
        }, CONFIG.CHECK_INTERVAL);
    }

    function initListeners() {
        logInfo('初始化监听系统...');

        window.addEventListener('hashchange', onUrlChange);
        logDebug('已绑定 hashchange 事件');

        window.addEventListener('popstate', onUrlChange);
        logDebug('已绑定 popstate 事件');

        const originalPush = history.pushState;
        const originalReplace = history.replaceState;

        history.pushState = function(...args) {
            originalPush.apply(this, args);
            logDebug('检测到 pushState 调用');
            onUrlChange();
        };

        history.replaceState = function(...args) {
            originalReplace.apply(this, args);
            logDebug('检测到 replaceState 调用');
            onUrlChange();
        };

        logDebug('已 Hook history API');

        setupMutationObserver();

        document.addEventListener('keydown', handleGlobalKeydown, true);

        logInfo('监听系统初始化完成');
    }

    function handleGlobalKeydown(e) {
        if (!e.altKey || e.key.toLowerCase() !== CONFIG.SHORTCUT_KEY) return;

        const target = e.target;
        const isInput = target.tagName === 'INPUT' ||
                        target.tagName === 'TEXTAREA' ||
                        target.isContentEditable;

        if (isInput) {
            logDebug('快捷键触发但焦点在输入框，跳过');
            return;
        }

        e.preventDefault();
        e.stopPropagation();
        logInfo('快捷键 Alt+%s 触发', CONFIG.SHORTCUT_KEY.toUpperCase());
        openValidLinks();
    }
    // ===============================================

    // ================= 主入口 =================
    logInfo('脚本开始执行...');

    createStatusBar();
    initListeners();

    logInfo('脚本初始化完成！');
    logInfo('悬浮窗使用说明：');
    logInfo('  ⚡ 图标 - 点击提取视口内的链接');
    logInfo('  📋 图标 - 点击打开日志面板');
    logInfo('  悬停3秒 - 显示功能提示');
    logInfo('  Alt+Q - 快捷键提取链接');
    // ===========================================

})();

// ==UserScript==
// @name         飞书项目工具集 (状态栏版)
// @namespace    http://tampermonkey.net/
// @version      2.0
// @description  合并多个飞书项目相关工具脚本，使用状态栏UI设计
// @match        https://project.feishu.cn/*
// @match        https://project.feishu.cn/ml/onlineissue*
// @exclude      https://ml-panel.aihelp.net/*
// @exclude      https://ml.aihelp.net/*
// @exclude      https://aihelp.net.cn/*
// @exclude      https://aihelp.net/*
// @grant        GM_setClipboard
// @grant        GM_openInTab
// @grant        GM_addStyle
// @run-at       document-end
// ==/UserScript==

(function() {
    'use strict';

    // 内存优化：只在需要时执行耗内存操作
    const CONFIG = {
        TIP_DELAY: 3000,
        DRAG_THRESHOLD: 5,
        MAX_LOG_LINES: 100,
        LOCK_TIME: 1500,
        KEYWORD: 'aihelp',
        STORAGE_KEYS: {
            STATUS_BAR_POSITION: 'feishu_tools_status_bar_position',
            LOG_PANEL_POSITION: 'feishu_tools_log_panel_position',
            LOG_PANEL_SIZE: 'feishu_tools_log_panel_size'
        }
    };

    // 日志存储
    const logHistory = [];
    const logPanelListeners = new Set();

    // 存储高亮元素的引用，用于后续清除
    let highlightedElements = [];

    // 功能模块状态
    const moduleStates = {
        searchKeyword: { isProcessing: false },
        infoExtractor: { isProcessing: false },
        listExtractor: { isProcessing: false },
        smartLink: { isProcessing: false, processId: 0 }
    };

    // 注入CSS样式
    function injectStyles() {
        GM_addStyle(`
            /* 主容器 */
            .ai-status-bar-container {
                position: fixed;
                top: 50px;
                right: 20px;
                z-index: 2147483647;
                user-select: none;
            }

            /* 图标容器 - 5区域布局 */
            .ai-status-icon {
                width: 60px;
                height: 60px;
                display: grid;
                grid-template-columns: 1fr 1fr 1fr;
                grid-template-rows: 1fr 1fr;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                border-radius: 12px;
                box-shadow: 0 4px 20px rgba(102, 126, 234, 0.4);
                cursor: pointer;
                transition: transform 0.2s ease, box-shadow 0.2s ease;
                overflow: visible;
            }

            .ai-status-icon:hover {
                transform: scale(1.05);
                box-shadow: 0 6px 24px rgba(102, 126, 234, 0.6);
            }

            /* 功能区域 */
            .ai-icon-zone {
                width: 20px;
                height: 20px;
                overflow: visible;
                position: relative;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: background 0.2s ease;
            }

            .ai-icon-zone:hover {
                background: rgba(255, 255, 255, 0.15);
            }

            .ai-icon-zone:active {
                opacity: 0.7;
            }

            /* 区域文本 */
            .ai-zone-text {
                font-size: 12px;
                color: white;
                line-height: 1;
                font-weight: bold;
            }

            /* 延迟提示框 */
            .ai-delayed-tip {
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

            .ai-delayed-tip.visible {
                opacity: 1;
                transform: translateX(-50%) translateY(0);
            }

            .ai-delayed-tip::after {
                content: '';
                position: absolute;
                top: 100%;
                left: 50%;
                transform: translateX(-50%);
                border: 6px solid transparent;
                border-top-color: rgba(0, 0, 0, 0.85);
            }

            .ai-delayed-tip-title {
                font-weight: bold;
                margin-bottom: 2px;
            }

            .ai-delayed-tip-desc {
                color: #aaa;
                font-size: 11px;
            }

            /* 状态样式 */
            .ai-icon-zone.success {
                background: linear-gradient(135deg, #10b981 0%, #059669 100%) !important;
            }

            .ai-icon-zone.processing {
                opacity: 0.6;
            }

            /* 日志面板 */
            #ai-log-panel {
                position: fixed;
                top: 130px;
                right: 20px;
                width: 400px;
                height: 500px;
                background: #1e1e1e;
                border-radius: 12px;
                box-shadow: 0 8px 32px rgba(0, 0, 0, 0.6);
                z-index: 2147483646;
                font-family: 'Consolas', 'Monaco', monospace;
                font-size: 12px;
                overflow: hidden;
                display: none;
                resize: both;
                min-width: 300px;
                min-height: 300px;
                max-width: 800px;
                max-height: 800px;
            }

            #ai-log-panel.visible {
                display: flex;
                flex-direction: column;
            }

            /* 日志面板头部 */
            #ai-log-panel-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 12px 16px;
                background: #2d2d2d;
                border-bottom: 1px solid #404040;
                cursor: move;
            }

            #ai-log-panel-title {
                color: #e0e0e0;
                font-weight: bold;
                font-size: 14px;
            }

            #ai-log-panel-close {
                color: #888;
                cursor: pointer;
                font-size: 18px;
                padding: 2px 8px;
                border-radius: 4px;
            }

            #ai-log-panel-close:hover {
                color: #fff;
                background: #444;
            }

            /* 功能按钮区域 */
            #ai-log-panel-actions {
                display: flex;
                gap: 8px;
                padding: 8px 16px;
                background: #252526;
                border-bottom: 1px solid #404040;
            }

            .ai-action-btn {
                padding: 6px 12px;
                background: #3c3c3c;
                color: #e0e0e0;
                border: none;
                border-radius: 4px;
                cursor: pointer;
                font-size: 12px;
                transition: background 0.2s ease;
            }

            .ai-action-btn:hover {
                background: #4a4a4a;
            }

            .ai-action-btn:active {
                background: #5a5a5a;
            }

            /* 日志内容区域 */
            #ai-log-panel-content {
                flex: 1;
                overflow-y: auto;
                padding: 12px;
            }

            .ai-log-entry {
                padding: 6px 8px;
                border-bottom: 1px solid #333;
                word-break: break-all;
                cursor: text;
            }

            .ai-log-entry:hover {
                background: rgba(255, 255, 255, 0.05);
            }

            .ai-log-entry:last-child {
                border-bottom: none;
            }

            .ai-log-time {
                color: #888;
                margin-right: 10px;
            }

            .ai-log-level {
                padding: 2px 6px;
                border-radius: 3px;
                font-size: 10px;
                margin-right: 8px;
            }

            .ai-log-level-DEBUG { background: #444; color: #aaa; }
            .ai-log-level-INFO { background: #1a5276; color: #5dade2; }
            .ai-log-level-WARN { background: #7d5a00; color: #f7dc6f; }
            .ai-log-level-ERROR { background: #922b21; color: #f1948a; }

            .ai-log-msg {
                color: #e0e0e0;
            }

            .ai-log-details {
                color: #888;
                font-size: 11px;
                margin-top: 4px;
                padding-left: 16px;
                white-space: pre-wrap;
            }

            /* 提示框 */
            .ai-toast {
                position: fixed;
                top: 20px;
                left: 50%;
                transform: translateX(-50%);
                background: rgba(0, 0, 0, 0.85);
                color: #fff;
                padding: 12px 24px;
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

            /* 可调整大小 */
            #ai-log-panel {
                resize: both;
            }
        `);
    }

    // 显示提示信息
    function showToast(message) {
        const oldToast = document.querySelector('.ai-toast');
        if (oldToast) oldToast.remove();

        const toast = document.createElement('div');
        toast.className = 'ai-toast';
        toast.textContent = message;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 2600);
    }

    // 日志函数
    function log(level, message, ...args) {
        const timestamp = new Date().toLocaleTimeString();
        const levelName = ['DEBUG', 'INFO', 'WARN', 'ERROR'][level] || 'INFO';

        console.log(`[FeishuTools] [${timestamp}] [${levelName}] ${message}`, ...args);

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

        // 通知所有监听器
        logPanelListeners.forEach(fn => {
            try { fn(logEntry); } catch (e) {}
        });
    }

    // 注册日志面板监听器
    function registerLogPanelListener(fn) {
        logPanelListeners.add(fn);
        return () => logPanelListeners.delete(fn);
    }

    // 清除之前的高亮标记
    function clearHighlights() {
        highlightedElements.forEach(el => {
            if (el.parentNode) {
                const parent = el.parentNode;
                parent.replaceChild(document.createTextNode(el.textContent), el);
                parent.normalize();
            }
        });
        highlightedElements = [];
    }

    // 高亮文本节点
    function highlightTextNode(textNode, keyword) {
        const span = document.createElement('span');
        span.style.cssText = 'background: linear-gradient(120deg, #ffd700 0%, #ffed4e 100%); color: #000; padding: 2px 4px; border-radius: 3px; box-shadow: 0 2px 4px rgba(0,0,0,0.2); font-weight: bold;';
        span.className = 'cb-search-highlight';

        const text = textNode.textContent;
        const index = text.indexOf(keyword);

        if (index === -1) return null;

        const before = text.substring(0, index);
        const match = text.substring(index, index + keyword.length);
        const after = text.substring(index + keyword.length);

        const fragment = document.createDocumentFragment();
        if (before) fragment.appendChild(document.createTextNode(before));

        span.textContent = match;
        fragment.appendChild(span);
        highlightedElements.push(span);

        if (after) fragment.appendChild(document.createTextNode(after));

        return fragment;
    }

    // 智能网页关键词检索功能
    function searchKeywords() {
        if (moduleStates.searchKeyword.isProcessing) {
            showToast('操作过于频繁，请稍候...');
            return;
        }
        moduleStates.searchKeyword.isProcessing = true;

        const keywords = ['已联系', '已咨询', '已告知', '已询问', '已索要'];

        // 清除之前的高亮
        clearHighlights();

        showToast('🔍 正在检索关键词...');

        setTimeout(() => {
            let foundKeyword = null;
            let foundNode = null;

            const walker = document.createTreeWalker(
                document.body,
                NodeFilter.SHOW_TEXT,
                {
                    acceptNode: function(node) {
                        return node.textContent.trim().length > 0 ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
                    }
                },
                false
            );

            let node;
            while (node = walker.nextNode()) {
                const text = node.textContent;
                const matchedKeyword = keywords.find(k => text.includes(k));
                if (matchedKeyword && isElementVisible(node.parentElement)) {
                    foundKeyword = matchedKeyword;
                    foundNode = node;
                    break;
                }
            }

            if (foundNode && foundKeyword) {
                const fragment = highlightTextNode(foundNode, foundKeyword);
                if (fragment) {
                    foundNode.parentNode.replaceChild(fragment, foundNode);
                }

                const highlightEl = highlightedElements[0];
                if (highlightEl) {
                    highlightEl.scrollIntoView({
                        behavior: 'smooth',
                        block: 'center',
                        inline: 'nearest'
                    });
                }

                showToast('✅');
                log(1, '关键词检索成功', { keyword: foundKeyword });
            } else {
                showToast('❌ 未联系');
                log(1, '关键词检索未找到匹配');
            }

            moduleStates.searchKeyword.isProcessing = false;
        }, 50);
    }

    // 飞书项目信息提取功能
    function extractProjectInfo() {
        if (moduleStates.infoExtractor.isProcessing) {
            showToast('操作过于频繁，请稍候...');
            return;
        }
        moduleStates.infoExtractor.isProcessing = true;

        if (!window.location.href.includes('project.feishu.cn/ml/onlineissue')) {
            showToast('请在飞书项目详情页面使用此功能');
            moduleStates.infoExtractor.isProcessing = false;
            return;
        }

        showToast('📋 正在提取项目信息...');

        setTimeout(() => {
            const name = document.title.trim().replace(/\s*-\s*飞书项目.*/, '');
            const processInfo = getProcessInfo();
            const ticketUrl = getAihelpLink(name);
            const today = new Date();
            const formattedDate = today.getFullYear() + '/' + padZero(today.getMonth() + 1) + '/' + padZero(today.getDate());
            const result = [name, '定位中未修复', name, '', formattedDate, 'BugGarage', ticketUrl, processInfo].join('\t');

            navigator.clipboard.writeText(result).then(() => {
                showToast('✅ 信息提取成功，已复制到剪贴板');
                log(1, '项目信息提取成功', { name, hasLink: !!ticketUrl, hasProcessInfo: !!processInfo });
            }).catch(() => {
                showToast('⚠️ 剪贴板复制失败，请手动复制');
                log(2, '剪贴板复制失败');
            }).finally(() => {
                moduleStates.infoExtractor.isProcessing = false;
            });
        }, 150);
    }

    // 获取处理信息
    function getProcessInfo() {
        const INTERFERENCE_WORDS = ['解决方案', '缺陷描述', '当前负责人', '优先级', '严重程度', '所属模块', '发现迭代', '影响版本', '复现步骤', '问题现象', '处理结果', '备注'];

        let processText = '';
        const labelElements = document.querySelectorAll('div, span, label');
        for (let el of labelElements) {
            const text = el.textContent.trim();
            if (text === '处理信息' || text === '处理信息:') {
                let contentEl = el.nextElementSibling;
                if (!contentEl || !contentEl.textContent.trim()) contentEl = el.parentElement ? el.parentElement.nextElementSibling : null;
                if (contentEl) processText = contentEl.textContent.trim().replace(/\s+/g, ' ');
                break;
            }
        }
        if (['待填', ' 待填 ', '待填 '].includes(processText)) return '';
        if (INTERFERENCE_WORDS.some(word => processText.includes(word))) return '';
        return processText;
    }

    // 获取aihelp链接
    function getAihelpLink(name) {
        let ticketUrl = '';
        const allElements = document.querySelectorAll('div, span');
        for (let el of allElements) {
            if (el.textContent.trim().includes('原单链接：')) {
                const link = el.querySelector('a[href*="aihelp.net"]') || el.nextElementSibling?.querySelector('a[href*="aihelp.net"]');
                if (link) {
                    ticketUrl = link.href.trim();
                    break;
                }
            }
        }
        if (!ticketUrl) {
            const pageText = document.body.innerText;
            const urlMatch = pageText.match(/https?:\/\/[^\s]*aihelp\.net[^\s]*=[A-Z0-9]{6}\b/);
            if (urlMatch) ticketUrl = urlMatch[0];
        }
        if (!ticketUrl && name && name.includes('MCGG')) {
            const pageText = document.body.innerText;
            const ticketIdMatch = pageText.match(/Ticket\s*ID\s*=\s*([A-Z0-9]{6})/i);
            if (ticketIdMatch) {
                ticketUrl = ticketIdMatch[1].toUpperCase();
            }
        }
        return ticketUrl;
    }

    // 辅助函数：补零
    function padZero(num) {
        return num < 10 ? '0' + num : num;
    }

    // 辅助函数：判断元素是否可见
    function isElementVisible(el) {
        if (!el) return false;
        if (el.nodeType === Node.TEXT_NODE) el = el.parentElement;
        if (!el || el.offsetParent === null) return false;

        const style = window.getComputedStyle(el);
        return style.display !== 'none' &&
               style.visibility !== 'hidden' &&
               style.opacity !== '0' &&
               el.offsetWidth > 0;
    }

    // 飞书项目列表链接提取功能
    function extractListLinks() {
        if (moduleStates.listExtractor.isProcessing) {
            showToast('操作过于频繁，请稍候...');
            return;
        }
        moduleStates.listExtractor.isProcessing = true;

        if (!window.location.href.includes('project.feishu.cn')) {
            showToast('请在飞书项目页面使用此功能');
            moduleStates.listExtractor.isProcessing = false;
            return;
        }

        showToast('⚡ 正在提取链接...');

        setTimeout(() => {
            const links = new Set();
            const docs = [document];

            // 递归获取所有iframe文档（延迟执行）
            function traverseFrames(win) {
                for (let i = 0; i < win.frames.length; i++) {
                    try {
                        const frameDoc = win.frames[i].document;
                        if (frameDoc) {
                            docs.push(frameDoc);
                            traverseFrames(win.frames[i]);
                        }
                    } catch (e) {}
                }
            }
            traverseFrames(window);

            // 提取链接
            docs.forEach(doc => {
                doc.querySelectorAll('a[href]').forEach(a => {
                    const href = a.href.trim();
                    if (href.includes('project.feishu.cn')) {
                        links.add(href.split('?')[0]);
                    }
                });

                doc.querySelectorAll('[data-href], [data-url], [data-link]').forEach(el => {
                    ['data-href', 'data-url', 'data-link'].forEach(attr => {
                        const val = el.getAttribute(attr);
                        if (val && val.includes('project.feishu.cn')) {
                            links.add(val.trim().split('?')[0]);
                        }
                    });
                });
            });

            const linkList = Array.from(links);
            if (linkList.length > 0) {
                GM_setClipboard(linkList.join('\n'));
                showToast(`✅ 成功提取 ${linkList.length} 个链接，已复制到剪贴板`);
                log(1, '链接提取成功', { count: linkList.length });
            } else {
                showToast('❌ 未找到链接，请确认列表已加载完成');
                log(2, '未找到飞书项目链接');
            }
            moduleStates.listExtractor.isProcessing = false;
        }, 200);
    }

    // 飞书项目智能链接助手功能（打开aihelp链接）
    function extractSmartLinks() {
        if (moduleStates.smartLink.isProcessing) {
            showToast('操作过于频繁，请稍候...');
            return;
        }
        moduleStates.smartLink.isProcessing = true;
        const currentProcessId = ++moduleStates.smartLink.processId;

        if (!window.location.href.includes('project.feishu.cn')) {
            showToast('请在飞书项目页面使用此功能');
            moduleStates.smartLink.isProcessing = false;
            return;
        }

        showToast('🔗 正在提取智能链接...');

        setTimeout(() => {
            const linkInfos = extractAllValidLinks();

            if (linkInfos.length === 0) {
                showToast(`❌ 当前视口内未发现有效的 "${CONFIG.KEYWORD}" 链接`);
                log(2, '未找到有效链接');
                moduleStates.smartLink.isProcessing = false;
                return;
            }

            log(1, '准备打开的链接列表:', linkInfos.map(info => info.url));

            if (linkInfos.length <= 5 || confirm(`检测到 ${linkInfos.length} 个有效链接。\n\n是否立即全部打开？`)) {
                const openCount = { value: 0 };
                linkInfos.forEach((info, index) => {
                    try {
                        GM_openInTab(info.url, { active: false, insert: true });
                        openCount.value++;
                    } catch (e) {
                        log(3, '打开链接失败:', info.url, e.message);
                    }
                });
                showToast(`✅ 已在后台打开 ${openCount.value} 个链接`);
                log(1, `成功打开 ${openCount.value} 个链接`);
            } else {
                showToast('操作已取消');
                log(1, '用户取消操作');
            }

            moduleStates.smartLink.isProcessing = false;
        }, 150);
    }

    // 提取所有有效链接
    function extractAllValidLinks() {
        const results = [];
        const seenUrls = new Set();

        const modalOrDrawer = findVisibleModalOrDrawer();
        const searchRoot = modalOrDrawer || document;

        const allLinks = searchRoot.querySelectorAll(`a[href*="${CONFIG.KEYWORD}"]`);
        log(0, `找到 ${allLinks.length} 个候选链接`);

        allLinks.forEach((link, index) => {
            const url = link.href;
            const visible = isElementVisible(link);
            const clickable = isLinkClickable(link);

            if (!url || !url.startsWith('http')) return;
            if (seenUrls.has(url)) return;
            if (!visible) return;
            if (!clickable) return;

            try {
                const pathname = new URL(url).pathname.toLowerCase();
                const excludedExts = ['.bytes', '.jpg', '.png', '.jpeg', '.gif', '.svg', '.webp'];
                if (excludedExts.some(ext => pathname.endsWith(ext))) return;
            } catch (e) {
                log(2, 'URL解析失败:', url);
                return;
            }

            seenUrls.add(url);
            results.push({ url, text: link.textContent?.trim() || '[无文本]' });
        });

        return results;
    }

    // 查找可见的模态框或抽屉
    function findVisibleModalOrDrawer() {
        const modalSelectors = [
            '[role="dialog"][aria-modal="true"]',
            '.larkc-modal-container',
            '.larkc-drawer',
            '[class*="Modal"]',
            '[class*="Drawer"]',
            '[class*="Dialog"]',
            '[class*="modal-content"]',
            '[class*="drawer-content"]',
            '[class*="detail-panel"]',
            '[class*="DetailPanel"]',
            '[class*="task-detail"]',
            '[class*="ticket-detail"]',
            '[class*="side-panel"]',
            '[class*="SidePanel"]'
        ];

        for (const selector of modalSelectors) {
            try {
                const elements = document.querySelectorAll(selector);
                for (const el of elements) {
                    if (isElementVisible(el)) {
                        return el;
                    }
                }
            } catch (e) {
                log(0, '选择器查询失败:', selector);
            }
        }

        return null;
    }

    // 判断链接是否可点击
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

    // 创建日志面板
    function createLogPanel() {
        let panel = document.getElementById('ai-log-panel');
        if (panel) {
            panel.classList.toggle('visible');
            return;
        }

        panel = document.createElement('div');
        panel.id = 'ai-log-panel';
        panel.className = 'visible';

        // 读取保存的位置
        const savedPosition = localStorage.getItem(CONFIG.STORAGE_KEYS.LOG_PANEL_POSITION);
        if (savedPosition) {
            try {
                const pos = JSON.parse(savedPosition);
                if (pos.left !== undefined && pos.top !== undefined) {
                    panel.style.position = 'fixed';
                    panel.style.left = pos.left;
                    panel.style.top = pos.top;
                    panel.style.right = 'auto';
                    panel.style.bottom = 'auto';
                    log(1, '恢复日志面板位置:', pos);
                }
            } catch (e) {
                log(2, '读取日志面板位置失败:', e.message);
            }
        }

        // 读取保存的大小
        const savedSize = localStorage.getItem(CONFIG.STORAGE_KEYS.LOG_PANEL_SIZE);
        if (savedSize) {
            try {
                const size = JSON.parse(savedSize);
                if (size.width !== undefined && size.height !== undefined) {
                    panel.style.width = size.width;
                    panel.style.height = size.height;
                    log(1, '恢复日志面板大小:', size);
                }
            } catch (e) {
                log(2, '读取日志面板大小失败:', e.message);
            }
        }

        panel.innerHTML = `
            <div id="ai-log-panel-header">
                <span id="ai-log-panel-title">📋 飞书工具日志</span>
                <span id="ai-log-panel-close">×</span>
            </div>
            <div id="ai-log-panel-actions">
                <button class="ai-action-btn" data-action="search">🔍 CtrlF已联系</button>
                <button class="ai-action-btn" data-action="extract-info">📋 bug表信息提取</button>
                <button class="ai-action-btn" data-action="extract-links">⚡ 列表链接提取</button>
                <button class="ai-action-btn" data-action="smart-links">🔗 打开aihelp链接</button>
            </div>
            <div id="ai-log-panel-content"></div>
        `;

        document.body.appendChild(panel);

        // 绑定事件
        const header = panel.querySelector('#ai-log-panel-header');
        const closeBtn = panel.querySelector('#ai-log-panel-close');
        const content = panel.querySelector('#ai-log-panel-content');
        const actionBtns = panel.querySelectorAll('.ai-action-btn');

        // 关闭按钮
        closeBtn.addEventListener('click', () => {
            panel.classList.remove('visible');
        });

        // 功能按钮
        actionBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const action = btn.dataset.action;
                switch (action) {
                    case 'search':
                        searchKeywords();
                        break;
                    case 'extract-info':
                        extractProjectInfo();
                        break;
                    case 'extract-links':
                        extractListLinks();
                        break;
                    case 'smart-links':
                        extractSmartLinks();
                        break;
                }
            });
        });

        // 渲染历史日志
        logHistory.forEach(entry => appendLogEntry(content, entry));

        // 注册日志监听器
        const unsubscribe = registerLogPanelListener((entry) => {
            if (panel.classList.contains('visible')) {
                appendLogEntry(content, entry);
            }
        });

        // 拖拽功能
        let isDragging = false;
        let dragStartPos = { x: 0, y: 0 };
        let panelOffset = { x: 0, y: 0 };

        header.addEventListener('mousedown', (e) => {
            if (e.target === closeBtn) return;

            isDragging = false;
            dragStartPos = { x: e.clientX, y: e.clientY };

            const rect = panel.getBoundingClientRect();
            panelOffset = {
                x: e.clientX - rect.left,
                y: e.clientY - rect.top
            };

            const handleMouseMove = (ev) => {
                const dx = ev.clientX - dragStartPos.x;
                const dy = ev.clientY - dragStartPos.y;

                if (Math.abs(dx) > CONFIG.DRAG_THRESHOLD || Math.abs(dy) > CONFIG.DRAG_THRESHOLD) {
                    isDragging = true;

                    let newX = ev.clientX - panelOffset.x;
                    let newY = ev.clientY - panelOffset.y;
                    newX = Math.max(0, Math.min(newX, window.innerWidth - 300));
                    newY = Math.max(0, Math.min(newY, window.innerHeight - 300));

                    panel.style.left = newX + 'px';
                    panel.style.top = newY + 'px';
                    panel.style.right = 'auto';
                }
            };

            const handleMouseUp = () => {
                document.removeEventListener('mousemove', handleMouseMove);
                document.removeEventListener('mouseup', handleMouseUp);

                // 保存位置
                if (isDragging) {
                    const rect = panel.getBoundingClientRect();
                    const position = {
                        left: Math.round(rect.left) + 'px',
                        top: Math.round(rect.top) + 'px'
                    };
                    localStorage.setItem(CONFIG.STORAGE_KEYS.LOG_PANEL_POSITION, JSON.stringify(position));
                    log(1, '保存日志面板位置:', position);
                }
            };

            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
        });

        // 使用ResizeObserver监听大小变化
        let resizeTimer = null;
        const resizeObserver = new ResizeObserver(() => {
            clearTimeout(resizeTimer);
            resizeTimer = setTimeout(() => {
                const rect = panel.getBoundingClientRect();
                const size = {
                    width: Math.round(rect.width) + 'px',
                    height: Math.round(rect.height) + 'px'
                };
                localStorage.setItem(CONFIG.STORAGE_KEYS.LOG_PANEL_SIZE, JSON.stringify(size));
                log(1, '保存日志面板大小:', size);
            }, 200);
        });
        resizeObserver.observe(panel);

        return panel;
    }

    // 追加日志条目
    function appendLogEntry(content, entry) {
        const div = document.createElement('div');
        div.className = 'ai-log-entry';

        let detailsHtml = '';
        if (entry.details && entry.details.length > 0) {
            detailsHtml = `<div class="ai-log-details">${entry.details.join('\n')}</div>`;
        }

        div.innerHTML = `
            <span class="ai-log-time">${entry.timestamp}</span>
            <span class="ai-log-level ai-log-level-${entry.level}">${entry.level}</span>
            <span class="ai-log-msg">${entry.message}</span>
            ${detailsHtml}
        `;

        content.appendChild(div);
        content.scrollTop = content.scrollHeight;
    }

    // 创建状态栏UI
    function createStatusBar() {
        if (document.querySelector('.ai-status-bar-container')) {
            log(0, '状态栏已存在，跳过创建');
            return;
        }

        const container = document.createElement('div');
        container.className = 'ai-status-bar-container';

        // 读取保存的位置
        const savedPosition = localStorage.getItem(CONFIG.STORAGE_KEYS.STATUS_BAR_POSITION);
        if (savedPosition) {
            try {
                const pos = JSON.parse(savedPosition);
                if (pos.left !== undefined && pos.top !== undefined) {
                    container.style.left = pos.left;
                    container.style.top = pos.top;
                    container.style.right = 'auto';
                    log(1, '恢复状态栏位置:', pos);
                }
            } catch (e) {
                log(2, '读取状态栏位置失败:', e.message);
            }
        }

        const iconContainer = document.createElement('div');
        iconContainer.className = 'ai-status-icon';

        // 5个功能区域
        const zones = [
            { name: 'search', text: '🔍', title: 'CtrlF已联系', desc: '在页面中搜索联系记录' },
            { name: 'extract-info', text: '📋', title: 'bug表信息提取', desc: '提取项目信息到剪贴板' },
            { name: 'extract-links', text: '⚡', title: '列表链接提取', desc: '提取页面中的飞书链接' },
            { name: 'smart-links', text: '🔗', title: '打开aihelp链接', desc: '提取并打开aihelp链接' },
            { name: 'log', text: '📄', title: '日志面板', desc: '打开工具日志面板' }
        ];

        zones.forEach(zone => {
            const zoneEl = document.createElement('div');
            zoneEl.className = 'ai-icon-zone';
            zoneEl.dataset.zone = zone.name;
            zoneEl.innerHTML = `<span class="ai-zone-text">${zone.text}</span>`;

            // 添加延迟提示
            zoneEl.addEventListener('mouseenter', () => {
                const tip = document.createElement('div');
                tip.className = 'ai-delayed-tip';
                tip.innerHTML = `
                    <div class="ai-delayed-tip-title">${zone.title}</div>
                    <div class="ai-delayed-tip-desc">${zone.desc}</div>
                `;
                zoneEl.appendChild(tip);

                const timer = setTimeout(() => {
                    tip.classList.add('visible');
                }, CONFIG.TIP_DELAY);

                zoneEl.addEventListener('mouseleave', () => {
                    clearTimeout(timer);
                    if (tip) {
                        tip.classList.remove('visible');
                        setTimeout(() => tip.remove(), 300);
                    }
                }, { once: true });
            });

            iconContainer.appendChild(zoneEl);
        });

        container.appendChild(iconContainer);
        document.body.appendChild(container);

        // 绑定点击事件
        bindStatusBarEvents(iconContainer);

        // 绑定拖拽事件
        bindDragEvents(container);

        log(1, '状态栏创建完成');
    }

    // 绑定状态栏事件
    function bindStatusBarEvents(iconContainer) {
        iconContainer.addEventListener('click', (e) => {
            const zone = e.target.closest('.ai-icon-zone');
            if (!zone) return;

            const zoneName = zone.dataset.zone;
            switch (zoneName) {
                case 'search':
                    searchKeywords();
                    break;
                case 'extract-info':
                    extractProjectInfo();
                    break;
                case 'extract-links':
                    extractListLinks();
                    break;
                case 'smart-links':
                    extractSmartLinks();
                    break;
                case 'log':
                    createLogPanel();
                    break;
            }
        });
    }

    // 绑定拖拽事件
    function bindDragEvents(container) {
        let isDragging = false;
        let dragStartPos = { x: 0, y: 0 };
        let containerOffset = { x: 0, y: 0 };

        container.addEventListener('mousedown', (e) => {
            isDragging = false;
            dragStartPos = { x: e.clientX, y: e.clientY };

            const rect = container.getBoundingClientRect();
            containerOffset = {
                x: e.clientX - rect.left,
                y: e.clientY - rect.top
            };

            const handleMouseMove = (moveEvent) => {
                const dx = moveEvent.clientX - dragStartPos.x;
                const dy = moveEvent.clientY - dragStartPos.y;

                if (Math.abs(dx) > CONFIG.DRAG_THRESHOLD || Math.abs(dy) > CONFIG.DRAG_THRESHOLD) {
                    isDragging = true;

                    let newX = moveEvent.clientX - containerOffset.x;
                    let newY = moveEvent.clientY - containerOffset.y;
                    newX = Math.max(0, Math.min(newX, window.innerWidth - 80));
                    newY = Math.max(0, Math.min(newY, window.innerHeight - 80));

                    container.style.right = 'auto';
                    container.style.top = newY + 'px';
                    container.style.left = newX + 'px';
                }
            };

            const handleMouseUp = () => {
                document.removeEventListener('mousemove', handleMouseMove);
                document.removeEventListener('mouseup', handleMouseUp);

                // 保存位置
                if (isDragging) {
                    const position = {
                        left: container.style.left,
                        top: container.style.top
                    };
                    localStorage.setItem(CONFIG.STORAGE_KEYS.STATUS_BAR_POSITION, JSON.stringify(position));
                    log(1, '保存状态栏位置:', position);
                }
            };

            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
        });
    }

    // 初始化
    function init() {
        injectStyles();
        createStatusBar();
        log(1, '飞书工具集初始化完成');
        log(1, '使用说明：');
        log(1, '  🔍 区域 - 检索页面中的联系记录关键词');
        log(1, '  📋 区域 - 提取飞书项目信息到剪贴板');
        log(1, '  ⚡ 区域 - 提取页面中的飞书链接');
        log(1, '  🔗 区域 - 提取并打开aihelp链接');
        log(1, '  📄 区域 - 打开工具日志面板');
    }

    // 页面加载完成后初始化
    if (document.readyState === 'complete') {
        init();
    } else {
        window.addEventListener('load', init);
    }

})();

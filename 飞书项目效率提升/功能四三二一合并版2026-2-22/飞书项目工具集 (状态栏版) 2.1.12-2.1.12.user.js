// ==UserScript==
// @name         飞书项目工具集 (状态栏版) 2.1.12
// @namespace    http://tampermonkey.net/
// @version      2.1.12
// @description  合并多个飞书项目相关工具脚本，使用状态栏UI设计。新增自动评论功能（已联系/未回复）。打开链接功能支持Alt+Q快捷键。
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

/**
 * 更新日志：
 * v2.1.11
 * - 优化：“已联系”检索功能也支持了连续点击查找下一个匹配项的功能，并会按预设关键词数组的顺序依次查找展示。
 *
 * v2.1.10
 * - 修复：“@ 找@”功能连续点击时因防抖导致的误拦截提示频繁问题。
 * - 优化：“@ 找@”功能在未找到 @ 时，能够正确匹配并高亮所有非 Albin 的评论记录。
 *
 * v2.1.9
 * - 优化：“@ 找@”功能支持连续点击查找下一个匹配项（类似Ctrl+F效果），并显示当前匹配进度。
 *
 * v2.1.8
 * - 新增：状态栏与日志面板中添加“@ 找@”功能，一键跳转到页面内的@位置。若无@则自动匹配非朱亚斌(Albin)的评论时间节点。
 *
 * v2.1.7
 * - 修复：智能网页关键词检索功能中，由于脚本自身的UI（如日志面板、状态栏）包含了“已联系”等关键词，导致误判显示“√”图标的bug。现已在搜索时排除脚本自身的UI元素。
 */

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
        },
        SEARCH_BOX: {
            CONTAINER_SELECTORS: [
                '#story-view-search-container',
                '[id*="search-container"]'
            ],
            INPUT_SELECTORS: [
                'input[placeholder="按标题查找"]',
                'input.semi-input[placeholder*="查找"]',
                '#story-view-search-container input'
            ],
            WAIT_TIMEOUT: 5000
        },
        AUTO_COMMENT: {
            RETRY_MAX: 10,
            RETRY_INTERVAL: 300,
            COMMENTS: {
                contacted: {
                    text: '已联系',
                    icon: '已',
                    zoneName: 'contacted'
                },
                noReply: {
                    text: '联系玩家24小时后玩家未提供有效信息',
                    icon: '未',
                    zoneName: 'noReply'
                }
            }
        }
    };

    // 日志存储
    const logHistory = [];
    const logPanelListeners = new Set();
    let logCleanupTimer = null;

    // 存储高亮元素的引用，用于后续清除
    let highlightedElements = [];

    // 功能模块状态
    const moduleStates = {
        searchKeyword: { isProcessing: false },
        searchAt: { isProcessing: false },
        searchBox: { isProcessing: false },
        infoExtractor: { isProcessing: false },
        listExtractor: { isProcessing: false },
        smartLink: { isProcessing: false, processId: 0 },
        autoComment: { isProcessing: false }
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

            /* 图标容器 - 8区域布局 (2列×4行 或 根据需要调整) */
            .ai-status-icon {
                width: 60px;
                height: 130px;
                display: grid;
                grid-template-columns: 1fr 1fr;
                grid-template-rows: repeat(5, 1fr);
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

            /* 日志面板 - 浅色主题 */
            #ai-log-panel {
                position: fixed;
                top: 130px;
                right: 20px;
                width: 420px;
                height: 400px;
                background: rgba(255, 255, 255, 0.98);
                backdrop-filter: blur(10px);
                border-radius: 12px;
                box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
                z-index: 2147483646;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                font-size: 12px;
                overflow: hidden;
                display: none;
                resize: both;
                min-width: 80px;
                min-height: 200px;
                max-width: 800px;
                max-height: 800px;
                border: 1px solid rgba(0, 0, 0, 0.05);
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
                background: #fff;
                border-bottom: 1px solid rgba(0, 0, 0, 0.05);
                cursor: move;
                flex-shrink: 0;
            }

            #ai-log-panel-title {
                color: #1d1d1f;
                font-weight: 600;
                font-size: 13px;
            }

            #ai-log-panel-close {
                color: #86868b;
                cursor: pointer;
                font-size: 14px;
                padding: 4px 8px;
                border-radius: 50%;
                width: 20px;
                height: 20px;
                display: flex;
                align-items: center;
                justify-content: center;
                background: #f5f5f7;
                border: none;
                transition: all 0.2s;
            }

            #ai-log-panel-close:hover {
                background: #e5e5e7;
                color: #1d1d1f;
            }

            /* 功能按钮区域 */
            #ai-log-panel-actions {
                display: grid;
                grid-template-columns: repeat(auto-fill, minmax(80px, 1fr));
                gap: 6px;
                padding: 8px 10px;
                background: #fafafa;
                border-bottom: 1px solid rgba(0, 0, 0, 0.05);
                flex-shrink: 0;
                min-height: 36px;
            }

            .ai-action-btn {
                padding: 6px 8px;
                background: #3370ff;
                color: white;
                border: none;
                border-radius: 6px;
                cursor: pointer;
                font-size: 11px;
                font-weight: 500;
                transition: all 0.2s;
                display: flex;
                align-items: center;
                gap: 3px;
                white-space: nowrap;
                min-width: 40px;
                flex: 0 1 auto;
                justify-content: center;
            }

            .ai-action-btn:hover {
                opacity: 0.9;
                transform: translateY(-1px);
            }

            .ai-action-btn:active {
                transform: translateY(0);
            }

            .ai-action-btn.success {
                background: linear-gradient(135deg, #52c41a 0%, #73d13d 100%) !important;
            }

            /* 按钮颜色分类 */
            .ai-action-btn.btn-search { background: linear-gradient(135deg, #3370ff 0%, #4e8cff 100%); }
            .ai-action-btn.btn-at { background: linear-gradient(135deg, #1890ff 0%, #40a9ff 100%); }
            .ai-action-btn.btn-info { background: linear-gradient(135deg, #52c41a 0%, #73d13d 100%); }
            .ai-action-btn.btn-links { background: linear-gradient(135deg, #f5a623 0%, #f7b731 100%); }
            .ai-action-btn.btn-smart { background: linear-gradient(135deg, #722ed1 0%, #9254de 100%); }
            .ai-action-btn.btn-commented { background: linear-gradient(135deg, #eb2f96 0%, #f759ab 100%); }
            .ai-action-btn.btn-noreply { background: linear-gradient(135deg, #fa8c16 0%, #ffa940 100%); }
            .ai-action-btn.btn-clear { background: linear-gradient(135deg, #8c8c8c 0%, #bfbfbf 100%); }

            /* 日志内容区域 */
            #ai-log-panel-content {
                flex: 1;
                overflow-y: auto;
                padding: 8px;
                background: #f9f9f9;
                font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;
                font-size: 11px;
                line-height: 1.5;
                border: 1px solid rgba(0,0,0,0.03);
                user-select: text;
                -webkit-user-select: text;
                -moz-user-select: text;
                cursor: text;
            }

            .ai-log-entry {
                padding: 4px 6px;
                margin-bottom: 4px;
                border-bottom: 1px solid rgba(0, 0, 0, 0.02);
                word-break: break-all;
                cursor: text;
            }

            .ai-log-entry:hover {
                background: rgba(0, 0, 0, 0.02);
            }

            .ai-log-entry:last-child {
                border-bottom: none;
            }

            .ai-log-time {
                color: #86868b;
                margin-right: 8px;
                font-size: 10px;
            }

            /* 日志类型样式 */
            .ai-log-info { color: #1d1d1f; }
            .ai-log-success { color: #52c41a; }
            .ai-log-warn { color: #faad14; }
            .ai-log-error { color: #ff4d4f; }

            /* 模块标签样式 */
            .ai-log-module-search { color: #3370ff; font-weight: 600; }
            .ai-log-module-at { color: #1890ff; font-weight: 600; }
            .ai-log-module-info { color: #52c41a; font-weight: 600; }
            .ai-log-module-links { color: #f5a623; font-weight: 600; }
            .ai-log-module-smart { color: #722ed1; font-weight: 600; }
            .ai-log-module-comment { color: #eb2f96; font-weight: 600; }

            .ai-log-msg {
                color: #1d1d1f;
            }

            .ai-log-details {
                color: #86868b;
                font-size: 10px;
                margin-top: 2px;
                padding-left: 12px;
                white-space: pre-wrap;
            }

            /* 调整大小手柄 */
            .ai-log-resize-handle {
                position: absolute;
                right: 0;
                bottom: 0;
                width: 16px;
                height: 16px;
                cursor: se-resize;
                background: linear-gradient(135deg, transparent 50%, rgba(0, 0, 0, 0.15) 50%);
                border-radius: 0 0 12px 0;
            }

            .ai-log-resize-handle:hover {
                background: linear-gradient(135deg, transparent 50%, rgba(51, 112, 255, 0.4) 50%);
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
        const timestamp = new Date().toLocaleTimeString([], { hour12: false });
        const levelNames = ['info', 'info', 'warn', 'error'];
        const levelName = levelNames[level] || 'info';

        console.log(`[FeishuTools] [${timestamp}] [${levelName}] ${message}`, ...args);

        const logEntry = {
            timestamp,
            level: levelName,
            message,
            moduleTag: '',
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

        logPanelListeners.forEach(fn => {
            try { fn(logEntry); } catch (e) {}
        });
    }

    // 添加日志条目到面板
    function addLogToPanel(msg, type = 'info', moduleTag = '') {
        const content = document.getElementById('ai-log-panel-content');
        if (!content) return;

        const logItem = document.createElement('div');
        logItem.className = `ai-log-entry ai-log-${type}`;

        const time = new Date().toLocaleTimeString([], { hour12: false });

        if (moduleTag) {
            const tagClass = `ai-log-module-${moduleTag}`;
            logItem.innerHTML = `<span class="${tagClass}">[${moduleTag}]</span> <span class="ai-log-time">${time}</span> ${msg}`;
        } else {
            logItem.innerHTML = `<span class="ai-log-time">${time}</span> <span class="ai-log-${type}">${msg}</span>`;
        }

        content.appendChild(logItem);

        logHistory.push({ time, msg, type, moduleTag });
        if (logHistory.length > CONFIG.MAX_LOG_LINES * 1.5) {
            const removeCount = Math.floor(logHistory.length - CONFIG.MAX_LOG_LINES);
            logHistory.splice(0, removeCount);
        }

        while (content.children.length > CONFIG.MAX_LOG_LINES) {
            content.removeChild(content.firstChild);
        }

        content.scrollTop = content.scrollHeight;
    }

    // 创建日志通道
    function createLogChannel(moduleName) {
        return {
            log: (msg) => addLogToPanel(msg, 'info', moduleName),
            error: (msg) => addLogToPanel(msg, 'error', moduleName),
            warn: (msg) => addLogToPanel(msg, 'warn', moduleName),
            success: (msg) => addLogToPanel(msg, 'success', moduleName)
        };
    }

    // 启动日志清理定时器
    function startLogCleanupTimer() {
        if (logCleanupTimer) {
            clearInterval(logCleanupTimer);
        }

        logCleanupTimer = setInterval(() => {
            cleanupOldLogs();
        }, 60000);
    }

    // 清理旧日志
    function cleanupOldLogs() {
        const content = document.getElementById('ai-log-panel-content');
        if (!content) return;

        const currentCount = content.children.length;
        if (currentCount > CONFIG.MAX_LOG_LINES * 0.8) {
            const removeCount = Math.floor(currentCount * 0.3);
            for (let i = 0; i < removeCount; i++) {
                if (content.firstChild) {
                    content.removeChild(content.firstChild);
                }
            }
            console.log('[FeishuTools] 日志清理：移除了', removeCount, '条旧日志');
        }

        if (logHistory.length > CONFIG.MAX_LOG_LINES) {
            logHistory.splice(0, logHistory.length - CONFIG.MAX_LOG_LINES);
        }
    }

    // 清空所有日志
    function clearAllLogs() {
        const content = document.getElementById('ai-log-panel-content');
        if (content) {
            content.innerHTML = '';
        }
        logHistory.length = 0;
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
    const searchLogger = createLogChannel('search');

    // 存储所有匹配到的关键词节点和索引
    let keywordSearchState = {
        matches: [],
        currentIndex: -1,
        lastSearchTime: 0
    };

    function searchKeywords() {
        const now = Date.now();
        // 放宽防抖限制，支持连续点击
        if (moduleStates.searchKeyword.isProcessing && now - keywordSearchState.lastSearchTime < 200) {
            return;
        }
        moduleStates.searchKeyword.isProcessing = true;

        const keywords = ['已联系', '已咨询', '已告知', '已询问', '已索要'];

        // 如果距离上次搜索超过10秒，或者当前没有匹配项，则重新扫描页面
        const shouldRescan = now - keywordSearchState.lastSearchTime > 10000 || keywordSearchState.matches.length === 0;

        if (shouldRescan) {
            clearHighlights();
            showToast('🔍 正在检索关键词...');

            setTimeout(() => {
                const newMatches = [];

                const walker = document.createTreeWalker(
                    document.body,
                    NodeFilter.SHOW_TEXT,
                    {
                        acceptNode: function(node) {
                            if (node.textContent.trim().length === 0) return NodeFilter.FILTER_REJECT;

                            // 排除脚本自身的UI元素（状态栏、日志面板、提示框、高亮元素等）
                            const parent = node.parentElement;
                            if (parent && parent.closest && parent.closest('#ai-log-panel, .ai-status-bar-container, .ai-toast, .cb-search-highlight')) {
                                return NodeFilter.FILTER_REJECT;
                            }

                            return NodeFilter.FILTER_ACCEPT;
                        }
                    },
                    false
                );

                // 收集所有文本节点
                const allNodes = [];
                let node;
                while (node = walker.nextNode()) {
                    allNodes.push(node);
                }

                // 按照 keywords 的顺序，依次收集匹配的节点
                for (const keyword of keywords) {
                    for (const n of allNodes) {
                        if (n.textContent.includes(keyword) && isElementVisible(n.parentElement)) {
                            newMatches.push({ node: n, keyword: keyword });
                        }
                    }
                }

                if (newMatches.length > 0) {
                    keywordSearchState.matches = newMatches;
                    keywordSearchState.currentIndex = 0;
                    keywordSearchState.lastSearchTime = now;
                    highlightAndJumpToCurrentKeywordMatch();
                } else {
                    keywordSearchState.matches = [];
                    keywordSearchState.currentIndex = -1;
                    showToast('❌ 未联系');
                    searchLogger.warn('关键词检索未找到匹配');
                }

                moduleStates.searchKeyword.isProcessing = false;
            }, 50);
        } else {
            // 继续查找下一个
            keywordSearchState.currentIndex = (keywordSearchState.currentIndex + 1) % keywordSearchState.matches.length;
            keywordSearchState.lastSearchTime = now;
            highlightAndJumpToCurrentKeywordMatch();
            moduleStates.searchKeyword.isProcessing = false;
        }
    }

    function highlightAndJumpToCurrentKeywordMatch() {
        clearHighlights();

        const matchInfo = keywordSearchState.matches[keywordSearchState.currentIndex];
        const { node, keyword } = matchInfo;

        // 检查节点是否仍在DOM中（可能页面已更新）
        if (!document.body.contains(node)) {
            // 如果节点不在DOM中，强制重新扫描
            keywordSearchState.matches = [];
            searchKeywords();
            return;
        }

        const fragment = highlightTextNode(node, keyword);
        if (fragment) {
            node.parentNode.replaceChild(fragment, node);
        }

        const highlightEl = highlightedElements[0];
        if (highlightEl) {
            highlightEl.scrollIntoView({
                behavior: 'smooth',
                block: 'center',
                inline: 'nearest'
            });
        }

        const currentNum = keywordSearchState.currentIndex + 1;
        const totalNum = keywordSearchState.matches.length;
        showToast(`✅ 找到 (${currentNum}/${totalNum})`);

        searchLogger.success(`关键词检索成功: ${keyword} (${currentNum}/${totalNum})`);
        showZoneSuccess('search');
    }

    // 智能网页 @ 检索功能
    const atLogger = createLogChannel('at');

    // 存储所有匹配到的节点和索引，用于实现"查找下一个"功能
    let atSearchState = {
        matches: [],
        currentIndex: -1,
        lastSearchTime: 0
    };

    function searchAtKeyword() {
        // 由于需要支持连续点击（类似Ctrl+F），放宽防抖限制
        // 如果正在处理且距离上次搜索很近（比如200ms内），才提示频繁
        const now = Date.now();
        if (moduleStates.searchAt.isProcessing && now - atSearchState.lastSearchTime < 200) {
            return;
        }
        moduleStates.searchAt.isProcessing = true;

        // 如果距离上次搜索超过了10秒，或者当前没有匹配项，则重新扫描页面
        const shouldRescan = now - atSearchState.lastSearchTime > 10000 || atSearchState.matches.length === 0;

        if (shouldRescan) {
            clearHighlights();
            showToast('🔍 正在检索@或评论...');

            setTimeout(() => {
                const newMatches = [];
                const commentRegex = /于\s+\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}\s+评论/;

                const walker = document.createTreeWalker(
                    document.body,
                    NodeFilter.SHOW_TEXT,
                    {
                        acceptNode: function(node) {
                            if (node.textContent.trim().length === 0) return NodeFilter.FILTER_REJECT;

                            // 排除脚本自身的UI元素
                            const parent = node.parentElement;
                            if (parent && parent.closest && parent.closest('#ai-log-panel, .ai-status-bar-container, .ai-toast, .cb-search-highlight')) {
                                return NodeFilter.FILTER_REJECT;
                            }

                            return NodeFilter.FILTER_ACCEPT;
                        }
                    },
                    false
                );

                // 遍历所有文本节点
                let node;
                const allNodes = [];
                while (node = walker.nextNode()) {
                    allNodes.push(node);
                }

                // 1. 优先收集所有包含 '@' 的节点
                for (const n of allNodes) {
                    if (n.textContent.includes('@') && isElementVisible(n.parentElement)) {
                        newMatches.push({ node: n, keyword: '@', type: 'at' });
                    }
                }

                // 2. 收集符合条件的评论节点
                for (let i = 0; i < allNodes.length; i++) {
                    const currentNode = allNodes[i];
                    const text = currentNode.textContent;
                    const match = text.match(commentRegex);

                    if (match && isElementVisible(currentNode.parentElement)) {
                        let prevText = "";
                        const index = match.index;

                        if (index > 0) {
                            prevText = text.substring(0, index).trim();
                        } else if (i > 0) {
                            let j = i - 1;
                            while (j >= 0 && allNodes[j].textContent.trim() === "") {
                                j--;
                            }
                            if (j >= 0) {
                                prevText = allNodes[j].textContent.trim();
                            }
                        }

                        if (!prevText.includes('朱亚斌(Albin)')) {
                            newMatches.push({ node: currentNode, keyword: match[0], type: 'comment' });
                        }
                    }
                }

                if (newMatches.length > 0) {
                    atSearchState.matches = newMatches;
                    atSearchState.currentIndex = 0;
                    atSearchState.lastSearchTime = now;
                    highlightAndJumpToCurrentMatch();
                } else {
                    atSearchState.matches = [];
                    atSearchState.currentIndex = -1;
                    showToast('❌ 未找到相关记录');
                    atLogger.warn('未找到 @ 标记或符合条件的评论');
                }

                moduleStates.searchAt.isProcessing = false;
            }, 50);
        } else {
            // 继续查找下一个
            atSearchState.currentIndex = (atSearchState.currentIndex + 1) % atSearchState.matches.length;
            atSearchState.lastSearchTime = now;
            highlightAndJumpToCurrentMatch();
            moduleStates.searchAt.isProcessing = false;
        }
    }

    function highlightAndJumpToCurrentMatch() {
        clearHighlights();

        const matchInfo = atSearchState.matches[atSearchState.currentIndex];
        const { node, keyword, type } = matchInfo;

        // 检查节点是否仍在DOM中（可能页面已更新）
        if (!document.body.contains(node)) {
            // 如果节点不在DOM中，强制重新扫描
            atSearchState.matches = [];
            searchAtKeyword();
            return;
        }

        const fragment = highlightTextNode(node, keyword);
        if (fragment) {
            node.parentNode.replaceChild(fragment, node);
        }

        const highlightEl = highlightedElements[0];
        if (highlightEl) {
            highlightEl.scrollIntoView({
                behavior: 'smooth',
                block: 'center',
                inline: 'nearest'
            });
        }

        const currentNum = atSearchState.currentIndex + 1;
        const totalNum = atSearchState.matches.length;
        showToast(`✅ 找到 (${currentNum}/${totalNum})`);

        if (type === 'at') {
            atLogger.success(`找到 @ 标记 (${currentNum}/${totalNum})`);
        } else {
            atLogger.success(`找到非 Albin 的评论记录 (${currentNum}/${totalNum})`);
        }
        showZoneSuccess('search-at');
    }

    // 飞书项目信息提取功能
    const infoLogger = createLogChannel('info');

    function extractProjectInfo() {
        if (moduleStates.infoExtractor.isProcessing) {
            // showToast('操作过于频繁，请稍候...');
            infoLogger.warn('操作过于频繁，请稍候...');
            return;
        }
        moduleStates.infoExtractor.isProcessing = true;

        if (!window.location.href.includes('project.feishu.cn/ml/onlineissue')) {
            // showToast('请在飞书项目详情页面使用此功能');
            infoLogger.error('请在飞书项目详情页面使用此功能');
            moduleStates.infoExtractor.isProcessing = false;
            return;
        }

        // showToast('📋 正在提取项目信息...');
        infoLogger.log('正在提取项目信息...');

        setTimeout(() => {
            const name = document.title.trim().replace(/\s*-\s*飞书项目.*/, '');
            const processInfo = getProcessInfo();
            const ticketUrl = getAihelpLink(name);
            const today = new Date();
            const formattedDate = today.getFullYear() + '/' + padZero(today.getMonth() + 1) + '/' + padZero(today.getDate());
            const result = [name, '定位中未修复', name, '', formattedDate, 'BugGarage', ticketUrl, processInfo].join('\t');

            navigator.clipboard.writeText(result).then(() => {
                // showToast('✅ 信息提取成功，已复制到剪贴板');
                infoLogger.success('项目信息提取成功，已复制到剪贴板');
                infoLogger.log('名称: ' + name);
                infoLogger.log('链接: ' + (ticketUrl || '无'));
                infoLogger.log('处理信息: ' + (processInfo || '无'));
                showZoneSuccess('extract-info');
            }).catch(() => {
                // showToast('⚠️ 剪贴板复制失败，请手动复制');
                infoLogger.error('剪贴板复制失败，请手动复制');
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
    const linksLogger = createLogChannel('links');

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
                linksLogger.success('链接提取成功: ' + linkList.length + ' 个');
                showZoneSuccess('extract-links');
            } else {
                showToast('❌ 未找到链接，请确认列表已加载完成');
                linksLogger.warn('未找到飞书项目链接');
            }
            moduleStates.listExtractor.isProcessing = false;
        }, 200);
    }

    // 飞书项目智能链接助手功能（打开aihelp链接）
    const smartLogger = createLogChannel('smart');

    function extractSmartLinks() {
        if (moduleStates.smartLink.isProcessing) {
            // showToast('操作过于频繁，请稍候...');
            smartLogger.warn('操作过于频繁，请稍候...');
            return;
        }
        moduleStates.smartLink.isProcessing = true;
        const currentProcessId = ++moduleStates.smartLink.processId;

        if (!window.location.href.includes('project.feishu.cn')) {
            // showToast('请在飞书项目页面使用此功能');
            smartLogger.error('请在飞书项目页面使用此功能');
            moduleStates.smartLink.isProcessing = false;
            return;
        }

        // showToast('🔗 正在提取智能链接...');
        smartLogger.log('正在提取智能链接...');

        setTimeout(() => {
            const linkInfos = extractAllValidLinks();

            if (linkInfos.length === 0) {
                // showToast(`❌ 当前视口内未发现有效的 "${CONFIG.KEYWORD}" 链接`);
                smartLogger.warn(`当前视口内未发现有效的 "${CONFIG.KEYWORD}" 链接`);
                moduleStates.smartLink.isProcessing = false;
                return;
            }

            smartLogger.log('准备打开的链接列表:');
            linkInfos.forEach((info, index) => {
                smartLogger.log((index + 1) + '. ' + info.url);
            });

            if (linkInfos.length <= 5 || confirm(`检测到 ${linkInfos.length} 个有效链接。\n\n是否立即全部打开？`)) {
                const openCount = { value: 0 };
                linkInfos.forEach((info, index) => {
                    try {
                        GM_openInTab(info.url, { active: false, insert: true });
                        openCount.value++;
                    } catch (e) {
                        smartLogger.error('打开链接失败: ' + info.url);
                    }
                });
                // showToast(`✅ 已在后台打开 ${openCount.value} 个链接`);
                smartLogger.success('成功打开 ' + openCount.value + ' 个链接');
                showZoneSuccess('smart-links');
            } else {
                // showToast('操作已取消');
                smartLogger.log('用户取消操作');
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
        smartLogger.log('找到 ' + allLinks.length + ' 个候选链接');

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
                smartLogger.warn('URL解析失败: ' + url);
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
                // 静默处理选择器错误
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

    // 自动评论功能模块
    const searchBoxLogger = createLogChannel('searchbox');

    function findFeishuSearchButton() {
        for (const selector of CONFIG.SEARCH_BOX.CONTAINER_SELECTORS) {
            const container = document.querySelector(selector);
            if (container) {
                const button = container.querySelector('button');
                if (button) return button;
            }
        }

        const allButtons = document.querySelectorAll('button');
        for (const button of allButtons) {
            if (button.innerText && button.innerText.trim() === '查找') {
                return button;
            }
        }

        const allSpans = document.querySelectorAll('.semi-button-content-right span, .semi-button-content span');
        for (const span of allSpans) {
            if (span.innerText && span.innerText.trim() === '查找') {
                return span.closest('button');
            }
        }

        return null;
    }

    function getVisibleSearchInput() {
        for (const selector of CONFIG.SEARCH_BOX.INPUT_SELECTORS) {
            const input = document.querySelector(selector);
            if (input && isElementVisible(input)) {
                return input;
            }
        }
        return null;
    }

    function waitForVisibleElement(selectors, timeout = CONFIG.SEARCH_BOX.WAIT_TIMEOUT) {
        const selectorList = Array.isArray(selectors) ? selectors : [selectors];
        return new Promise((resolve) => {
            let observer = null;
            let timeoutId = null;

            const findVisibleElement = () => {
                for (const selector of selectorList) {
                    const element = document.querySelector(selector);
                    if (element && isElementVisible(element)) {
                        return element;
                    }
                }
                return null;
            };

            const cleanup = () => {
                if (observer) observer.disconnect();
                if (timeoutId) clearTimeout(timeoutId);
            };

            const immediateResult = findVisibleElement();
            if (immediateResult) {
                resolve(immediateResult);
                return;
            }

            observer = new MutationObserver(() => {
                const result = findVisibleElement();
                if (result) {
                    cleanup();
                    resolve(result);
                }
            });

            observer.observe(document.body, {
                childList: true,
                subtree: true,
                attributes: true,
                attributeFilter: ['class', 'style']
            });

            timeoutId = setTimeout(() => {
                cleanup();
                resolve(findVisibleElement());
            }, timeout);
        });
    }

    async function focusFeishuSearchBox() {
        if (moduleStates.searchBox.isProcessing) {
            searchBoxLogger.warn('搜索框激活正在进行中，请稍后再试');
            return;
        }

        moduleStates.searchBox.isProcessing = true;
        showZoneProcessing('focus-search', true);
        searchBoxLogger.log('开始激活飞书项目搜索框');

        try {
            await waitForVisibleElement(CONFIG.SEARCH_BOX.CONTAINER_SELECTORS, CONFIG.SEARCH_BOX.WAIT_TIMEOUT);

            let searchInput = getVisibleSearchInput();
            if (!searchInput) {
                const searchButton = findFeishuSearchButton();
                if (!searchButton) {
                    searchBoxLogger.error('未找到“查找”按钮，请确认飞书页面已加载完成');
                    return;
                }

                searchBoxLogger.log('找到“查找”按钮，准备展开搜索框');
                searchButton.click();
                searchInput = await waitForVisibleElement(CONFIG.SEARCH_BOX.INPUT_SELECTORS, CONFIG.SEARCH_BOX.WAIT_TIMEOUT);
            }

            if (!searchInput) {
                searchBoxLogger.error('搜索输入框未出现，请稍后重试');
                return;
            }

            searchInput.scrollIntoView({
                behavior: 'smooth',
                block: 'center',
                inline: 'nearest'
            });
            searchInput.click();
            searchInput.focus();

            searchBoxLogger.success('飞书项目搜索框已激活，可直接输入');
            showZoneSuccess('focus-search');
        } catch (error) {
            searchBoxLogger.error('激活搜索框失败: ' + error.message);
        } finally {
            moduleStates.searchBox.isProcessing = false;
            showZoneProcessing('focus-search', false);
        }
    }

    const autoCommentLogger = createLogChannel('comment');

    async function handleAutoComment(commentType) {
        if (moduleStates.autoComment.isProcessing) {
            showToast('操作进行中，请稍候...');
            return;
        }
        moduleStates.autoComment.isProcessing = true;

        const commentConfig = CONFIG.AUTO_COMMENT.COMMENTS[commentType];
        if (!commentConfig) {
            // showToast('未知的评论类型');
            autoCommentLogger.error('未知的评论类型');
            moduleStates.autoComment.isProcessing = false;
            return;
        }

        // showToast(`📝 正在评论"${commentConfig.text}"...`);
        autoCommentLogger.log(`开始自动评论: ${commentConfig.text}`);

        try {
            const commentBox = await findAndActivateCommentBox();
            if (!commentBox) {
                // showToast('❌ 未找到评论框，请确保在项目详情页');
                autoCommentLogger.error('未找到评论框，请确保在项目详情页');
                moduleStates.autoComment.isProcessing = false;
                return;
            }

            const inputSuccess = await inputCommentText(commentConfig.text, commentBox);
            if (!inputSuccess) {
                // showToast('❌ 输入评论失败');
                autoCommentLogger.error('输入评论失败');
                moduleStates.autoComment.isProcessing = false;
                return;
            }

            await sleep(200);

            const publishSuccess = await clickPublishButton(commentBox);
            if (publishSuccess) {
                // showToast(`✅ 评论"${commentConfig.text}"成功`);
                autoCommentLogger.success(`评论成功: ${commentConfig.text}`);
                showZoneSuccess(commentType === 'contacted' ? 'contacted' : 'noReply');
            } else {
                // showToast('⚠️ 未找到发布按钮，请手动发布');
                autoCommentLogger.warn('未找到发布按钮，请手动发布');
            }
        } catch (error) {
            // showToast('❌ 操作失败: ' + error.message);
            autoCommentLogger.error('操作失败: ' + error.message);
        }

        moduleStates.autoComment.isProcessing = false;
    }

    async function findAndActivateCommentBox() {
        for (let i = 0; i < CONFIG.AUTO_COMMENT.RETRY_MAX; i++) {
            let searchRoot = document;

            const drawer = document.querySelector('.meego-drawer-content-wrapper');
            if (drawer) {
                autoCommentLogger.log('检测到抽屉详情页，在抽屉内查找评论框');
                searchRoot = drawer;
            }

            const commentBoxes = searchRoot.querySelectorAll('.meego-comment.issue-comment-wrap');
            autoCommentLogger.log(`找到 ${commentBoxes.length} 个评论框容器`);

            for (const commentBox of commentBoxes) {
                const addScene = commentBox.querySelector('.add-scene');
                if (!addScene) continue;

                const storyEditGroup = commentBox.querySelector('.story-edit-group');
                if (!storyEditGroup) continue;

                if (storyEditGroup.classList.contains('focused') &&
                    storyEditGroup.classList.contains('editing')) {
                    autoCommentLogger.log('找到已激活的评论输入框');
                    return commentBox;
                }
            }

            for (const commentBox of commentBoxes) {
                const addScene = commentBox.querySelector('.add-scene');
                if (!addScene) continue;

                const storyEditGroup = commentBox.querySelector('.story-edit-group');
                if (!storyEditGroup) continue;

                if (!storyEditGroup.classList.contains('focused') ||
                    !storyEditGroup.classList.contains('editing')) {
                    autoCommentLogger.log('尝试点击comment-placeholder激活评论框');
                    const placeholder = storyEditGroup.querySelector('.comment-placeholder');
                    if (placeholder) {
                        placeholder.click();
                    } else {
                        const richText = storyEditGroup.querySelector('.rich-text');
                        if (richText) {
                            richText.click();
                        } else {
                            storyEditGroup.click();
                        }
                    }
                    await sleep(CONFIG.AUTO_COMMENT.RETRY_INTERVAL);

                    if (storyEditGroup.classList.contains('focused') &&
                        storyEditGroup.classList.contains('editing')) {
                        autoCommentLogger.log('评论输入框激活成功');
                        return commentBox;
                    }
                }
            }

            await sleep(CONFIG.AUTO_COMMENT.RETRY_INTERVAL);
        }
        autoCommentLogger.error('未找到评论框');
        return null;
    }

    async function inputCommentText(text, commentBox) {
        if (!commentBox) return false;

        for (let i = 0; i < CONFIG.AUTO_COMMENT.RETRY_MAX; i++) {
            const storyEditGroup = commentBox.querySelector('.story-edit-group.focused.editing');
            if (!storyEditGroup) {
                autoCommentLogger.log(`等待评论框激活... (${i + 1}/${CONFIG.AUTO_COMMENT.RETRY_MAX})`);
                await sleep(CONFIG.AUTO_COMMENT.RETRY_INTERVAL);
                continue;
            }

            const aceLine = storyEditGroup.querySelector('.ace-line[data-node="true"]');
            const editor = storyEditGroup.querySelector('.zone-container[data-slate-editor="true"]');

            autoCommentLogger.log(`检查编辑器状态: aceLine=${!!aceLine}, editor=${!!editor}`);

            if (aceLine && editor) {
                const span = document.createElement('span');
                span.setAttribute('data-string', 'true');
                span.setAttribute('data-leaf', 'true');
                span.textContent = text;

                aceLine.innerHTML = '';
                aceLine.appendChild(span);

                const enterSpan = document.createElement('span');
                enterSpan.setAttribute('data-string', 'true');
                enterSpan.setAttribute('data-enter', 'true');
                enterSpan.setAttribute('data-leaf', 'true');
                enterSpan.innerHTML = '\u200B';
                aceLine.appendChild(enterSpan);

                editor.dispatchEvent(new Event('input', { bubbles: true }));
                editor.dispatchEvent(new Event('change', { bubbles: true }));

                autoCommentLogger.log('评论内容已输入');
                return true;
            }
            await sleep(CONFIG.AUTO_COMMENT.RETRY_INTERVAL);
        }
        return false;
    }

    async function clickPublishButton(commentBox) {
        if (!commentBox) return false;

        for (let i = 0; i < CONFIG.AUTO_COMMENT.RETRY_MAX; i++) {
            const buttons = commentBox.querySelectorAll('button.semi-button-primary');
            for (const btn of buttons) {
                if (btn.textContent.includes('发布评论')) {
                    btn.click();
                    autoCommentLogger.log('已点击发布按钮');
                    return true;
                }
            }
            await sleep(CONFIG.AUTO_COMMENT.RETRY_INTERVAL);
        }
        return false;
    }

    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // 创建日志面板
    function createLogPanel() {
        let panel = document.getElementById('ai-log-panel');
        if (panel) {
            const isVisible = panel.classList.toggle('visible');
            const statusBar = document.querySelector('.ai-status-bar-container');
            if (statusBar) statusBar.style.display = isVisible ? 'none' : 'block';
            return;
        }

        panel = document.createElement('div');
        panel.id = 'ai-log-panel';
        panel.className = 'visible';

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
                }
            } catch (e) {
                console.error('[FeishuTools] 读取日志面板位置失败:', e.message);
            }
        }

        const savedSize = localStorage.getItem(CONFIG.STORAGE_KEYS.LOG_PANEL_SIZE);
        if (savedSize) {
            try {
                const size = JSON.parse(savedSize);
                if (size.width !== undefined && size.height !== undefined) {
                    panel.style.width = size.width;
                    panel.style.height = size.height;
                }
            } catch (e) {
                console.error('[FeishuTools] 读取日志面板大小失败:', e.message);
            }
        }

        panel.innerHTML = `
            <div id="ai-log-panel-header">
                <span id="ai-log-panel-title">📋 飞书工具日志</span>
                <span id="ai-log-panel-close">×</span>
            </div>
            <div id="ai-log-panel-actions">
                <button class="ai-action-btn btn-search-box" data-action="focus-search">🔎 搜索框</button>
                <button class="ai-action-btn btn-search" data-action="search">🔍 已联系</button>
                <button class="ai-action-btn btn-at" data-action="search-at">@ 找@</button>
                <button class="ai-action-btn btn-info" data-action="extract-info">📋 信息提取</button>
                <button class="ai-action-btn btn-links" data-action="extract-links">⚡ 链接提取</button>
                <button class="ai-action-btn btn-smart" data-action="smart-links">🔗 打开链接</button>
                <button class="ai-action-btn btn-commented" data-action="contacted">已 已联系</button>
                <button class="ai-action-btn btn-noreply" data-action="no-reply">未 未回复</button>
                <button class="ai-action-btn btn-clear" data-action="clear-logs">🗑️ 清空</button>
            </div>
            <div id="ai-log-panel-content"></div>
            <div class="ai-log-resize-handle"></div>
        `;

        document.body.appendChild(panel);

        const statusBar = document.querySelector('.ai-status-bar-container');
        if (statusBar) statusBar.style.display = 'none';

        const header = panel.querySelector('#ai-log-panel-header');
        const closeBtn = panel.querySelector('#ai-log-panel-close');
        const content = panel.querySelector('#ai-log-panel-content');
        const actionBtns = panel.querySelectorAll('.ai-action-btn');
        const resizeHandle = panel.querySelector('.ai-log-resize-handle');

        closeBtn.addEventListener('click', () => {
            panel.classList.remove('visible');
            const statusBar = document.querySelector('.ai-status-bar-container');
            if (statusBar) statusBar.style.display = 'block';
        });

        actionBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const action = btn.dataset.action;
                switch (action) {
                    case 'focus-search':
                        focusFeishuSearchBox();
                        break;
                    case 'search':
                        searchKeywords();
                        break;
                    case 'search-at':
                        searchAtKeyword();
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
                    case 'contacted':
                        handleAutoComment('contacted');
                        break;
                    case 'no-reply':
                        handleAutoComment('noReply');
                        break;
                    case 'clear-logs':
                        clearAllLogs();
                        addLogToPanel('日志已清空', 'info', '');
                        break;
                }
            });
        });

        logHistory.forEach(entry => {
            if (entry.msg) {
                appendLogEntry(content, entry);
            }
        });

        const unsubscribe = registerLogPanelListener((entry) => {
            if (panel.classList.contains('visible')) {
                appendLogEntry(content, entry);
            }
        });

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
                    newY = Math.max(0, Math.min(newY, window.innerHeight - 250));

                    panel.style.left = newX + 'px';
                    panel.style.top = newY + 'px';
                    panel.style.right = 'auto';
                }
            };

            const handleMouseUp = () => {
                document.removeEventListener('mousemove', handleMouseMove);
                document.removeEventListener('mouseup', handleMouseUp);

                if (isDragging) {
                    const rect = panel.getBoundingClientRect();
                    const position = {
                        left: Math.round(rect.left) + 'px',
                        top: Math.round(rect.top) + 'px'
                    };
                    localStorage.setItem(CONFIG.STORAGE_KEYS.LOG_PANEL_POSITION, JSON.stringify(position));
                }
            };

            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
        });

        let isResizing = false;
        let resizeStartPos = { x: 0, y: 0 };
        let resizeStartSize = { width: 0, height: 0 };

        resizeHandle.addEventListener('mousedown', (e) => {
            e.preventDefault();
            e.stopPropagation();

            isResizing = true;
            resizeStartPos = { x: e.clientX, y: e.clientY };

            const rect = panel.getBoundingClientRect();
            resizeStartSize = {
                width: rect.width,
                height: rect.height
            };

            const handleResizeMove = (ev) => {
                if (!isResizing) return;

                const dx = ev.clientX - resizeStartPos.x;
                const dy = ev.clientY - resizeStartPos.y;

                let newWidth = resizeStartSize.width + dx;
                let newHeight = resizeStartSize.height + dy;

                newWidth = Math.max(300, Math.min(newWidth, 800));
                newHeight = Math.max(250, Math.min(newHeight, 800));

                panel.style.width = newWidth + 'px';
                panel.style.height = newHeight + 'px';
            };

            const handleResizeUp = () => {
                document.removeEventListener('mousemove', handleResizeMove);
                document.removeEventListener('mouseup', handleResizeUp);

                if (isResizing) {
                    const rect = panel.getBoundingClientRect();
                    const size = {
                        width: Math.round(rect.width) + 'px',
                        height: Math.round(rect.height) + 'px'
                    };
                    localStorage.setItem(CONFIG.STORAGE_KEYS.LOG_PANEL_SIZE, JSON.stringify(size));
                }

                isResizing = false;
            };

            document.addEventListener('mousemove', handleResizeMove);
            document.addEventListener('mouseup', handleResizeUp);
        });

        startLogCleanupTimer();

        return panel;
    }

    // 追加日志条目
    function appendLogEntry(content, entry) {
        const div = document.createElement('div');
        div.className = 'ai-log-entry';

        if (entry.msg) {
            const type = entry.type || 'info';
            const moduleTag = entry.moduleTag || '';

            div.className = `ai-log-entry ai-log-${type}`;

            if (moduleTag) {
                const tagClass = `ai-log-module-${moduleTag}`;
                div.innerHTML = `<span class="${tagClass}">[${moduleTag}]</span> <span class="ai-log-time">${entry.time}</span> ${entry.msg}`;
            } else {
                div.innerHTML = `<span class="ai-log-time">${entry.time}</span> <span class="ai-log-${type}">${entry.msg}</span>`;
            }
        } else {
            let detailsHtml = '';
            if (entry.details && entry.details.length > 0) {
                detailsHtml = `<div class="ai-log-details">${entry.details.join('\n')}</div>`;
            }

            const type = entry.level || 'info';
            div.className = `ai-log-entry ai-log-${type}`;
            div.innerHTML = `
                <span class="ai-log-time">${entry.timestamp}</span>
                <span class="ai-log-${type}">${entry.message}</span>
                ${detailsHtml}
            `;
        }

        content.appendChild(div);
        content.scrollTop = content.scrollHeight;
    }

    // 创建状态栏UI
    function createStatusBar() {
        if (document.querySelector('.ai-status-bar-container')) {
            return;
        }

        const container = document.createElement('div');
        container.className = 'ai-status-bar-container';

        const savedPosition = localStorage.getItem(CONFIG.STORAGE_KEYS.STATUS_BAR_POSITION);
        if (savedPosition) {
            try {
                const pos = JSON.parse(savedPosition);
                if (pos.left !== undefined && pos.top !== undefined) {
                    container.style.left = pos.left;
                    container.style.top = pos.top;
                    container.style.right = 'auto';
                }
            } catch (e) {
                console.error('[FeishuTools] 读取状态栏位置失败:', e.message);
            }
        }

        const iconContainer = document.createElement('div');
        iconContainer.className = 'ai-status-icon';

        const zones = [
            { name: 'focus-search', text: '🔎', title: '搜索框', desc: '展开并聚焦飞书项目搜索框' },
            { name: 'search', text: '🔍', title: '已联系', desc: '在页面中搜索联系记录' },
            { name: 'search-at', text: '@', title: '找@', desc: '寻找@或者评论' },
            { name: 'extract-info', text: '📋', title: '信息提取', desc: '提取项目信息到剪贴板' },
            { name: 'extract-links', text: '⚡', title: '链接提取', desc: '提取页面中的飞书链接' },
            { name: 'smart-links', text: '🔗', title: '打开链接', desc: '提取并打开aihelp链接' },
            { name: 'log', text: '📄', title: '日志面板', desc: '打开工具日志面板' },
            { name: 'contacted', text: '已', title: '已联系', desc: '自动评论"已联系"' },
            { name: 'noReply', text: '未', title: '未回复', desc: '自动评论"未提供有效信息"' }
        ];

        zones.forEach(zone => {
            const zoneEl = document.createElement('div');
            zoneEl.className = 'ai-icon-zone';
            zoneEl.dataset.zone = zone.name;
            zoneEl.innerHTML = `<span class="ai-zone-text">${zone.text}</span>`;

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

        bindStatusBarEvents(iconContainer);
        bindDragEvents(container);
    }

    // 显示区域成功状态
    function showZoneSuccess(zoneName) {
        const zone = document.querySelector(`.ai-icon-zone[data-zone="${zoneName}"]`);
        if (zone) {
            zone.classList.add('success');
            setTimeout(() => {
                zone.classList.remove('success');
            }, 1500);
        }
    }

    // 显示区域处理中状态
    function showZoneProcessing(zoneName, isProcessing) {
        const zone = document.querySelector(`.ai-icon-zone[data-zone="${zoneName}"]`);
        if (zone) {
            if (isProcessing) {
                zone.classList.add('processing');
            } else {
                zone.classList.remove('processing');
            }
        }
    }

    // 绑定状态栏事件
    function bindStatusBarEvents(iconContainer) {
        iconContainer.addEventListener('click', (e) => {
            const zone = e.target.closest('.ai-icon-zone');
            if (!zone) return;

            const zoneName = zone.dataset.zone;
            switch (zoneName) {
                case 'focus-search':
                    focusFeishuSearchBox();
                    break;
                case 'search':
                    searchKeywords();
                    break;
                case 'search-at':
                    searchAtKeyword();
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
                case 'contacted':
                    handleAutoComment('contacted');
                    break;
                case 'noReply':
                    handleAutoComment('noReply');
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

                if (isDragging) {
                    const position = {
                        left: container.style.left,
                        top: container.style.top
                    };
                    localStorage.setItem(CONFIG.STORAGE_KEYS.STATUS_BAR_POSITION, JSON.stringify(position));
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
        bindKeyboardShortcut();
        addLogToPanel('🔎 搜索框 - 展开并聚焦飞书项目搜索输入框', 'info', 'searchbox');
        addLogToPanel('飞书工具集初始化完成', 'success', '');
        addLogToPanel('使用说明：', 'info', '');
        addLogToPanel('🔍 已联系 - 检索页面中的联系记录关键词', 'info', 'search');
        addLogToPanel('@ 找@ - 检索页面中的@或者非Albin评论', 'info', 'at');
        addLogToPanel('📋 信息提取 - 提取飞书项目信息到剪贴板', 'info', 'info');
        addLogToPanel('⚡ 链接提取 - 提取页面中的飞书链接', 'info', 'links');
        addLogToPanel('🔗 打开链接 - 提取并打开aihelp链接 (快捷键: Alt+Q)', 'info', 'smart');
        addLogToPanel('📄 日志面板 - 打开工具日志面板', 'info', '');
    }

    // 绑定键盘快捷键
    function bindKeyboardShortcut() {
        document.addEventListener('keydown', function(e) {
            if (e.altKey && e.key.toLowerCase() === 'q') {
                e.preventDefault();
                extractSmartLinks();
            }
        });
    }

    // 页面加载完成后初始化
    if (document.readyState === 'complete') {
        init();
    } else {
        window.addEventListener('load', init);
    }

})();

// ==UserScript==
// @name         工单助手与Task客服信息提取合并版 6.2.9 日志面板可拖拽调整版（额外添加尝试修复偶现的提示内部描述识别，长度只有1的情况；尝试修复标题有时不替换的情况）
// @namespace    http://tampermonkey.net/
// @version      6.2.9
// @description  日志面板可拖拽调整版：可拖拽日志面板 + 可调整大小 + 位置大小记忆 + 刷新后恢复 + 错误处理
// @author       AI Combined & Optimized
// @match        https://ml-panel.aihelp.net/*
// @match        https://ml.aihelp.net/*
// @match        https://aihelp.net.cn/*
// @match        https://aihelp.net/*
// @exclude      *://*/dashboard/#/newpage-ticket*
// @exclude      *://*/dashboard/#/newpage-ticket/*
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @grant        GM_setClipboard
// @connect      translate.googleapis.com
// @connect      api.mymemory.translated.net
// @run-at       document-end
// ==/UserScript==

/**
 * 6.2.9 日志面板可拖拽调整版 更新说明：
 *
 * 【日志面板增强】
 * 1. 日志面板可拖拽：通过拖拽面板标题栏移动面板位置
 * 2. 日志面板可调整大小：通过右下角调整手柄改变面板大小
 * 3. 最小尺寸限制：宽度最小300px，高度最小200px
 *
 * 【位置和大小记忆】
 * 4. 状态栏位置记忆：记住用户拖动后的位置
 * 5. 日志面板位置记忆：记住用户拖动后的位置
 * 6. 日志面板大小记忆：记住用户调整后的大小
 * 7. 刷新网页后自动恢复：所有设置在刷新后保持不变
 *
 * 【错误处理】
 * 8. 存储读取失败时不会导致脚本崩溃
 * 9. 所有存储操作都有try-catch包裹
 *
 * 【保留架构优势】
 * - 三模块完全独立：普通工单、MCGG、Task各自封装为独立IIFE
 * - 配置完全分离：每个模块独立CONFIG对象
 * - 状态完全隔离：每个模块独立state管理
 * - 四区域图标：独立点击区域，保持拖拽功能
 */

(function() {
    'use strict';

    // ===================== 公共区域：页面判定逻辑 =====================

    function shouldRunNormalModule() {
        const url = window.location.href;
        return url.includes('/manual/tasks') || url.includes('/newpage-task') || url.includes('tasks?searchType');
    }

    function shouldRunTaskModule() {
        const url = window.location.href;
        return url.includes('task?orderId') || url.includes('tasks?searchType');
    }

    function isTargetPage() {
        return shouldRunNormalModule() || shouldRunTaskModule();
    }

    // ===================== 公共区域：状态栏 UI 类 (四区域图标版) =====================
    // 注意：UI始终创建，各模块根据URL决定是否运行

    /**
     * 状态栏UI类 - 四区域图标版
     * 小图标分为四个独立可点击区域，支持拖拽
     * 支持日志面板可拖拽、可调整大小、位置和大小记忆
     */
    class StatusbarUI {
        static STORAGE_KEYS = {
            STATUS_BAR_POSITION: 'feishu_tools_status_bar_position_v1',
            LOG_PANEL_POSITION: 'feishu_tools_log_panel_position_v1',
            LOG_PANEL_SIZE: 'feishu_tools_log_panel_size_v1'
        };

        constructor(config = {}) {
            this.config = {
                maxLogLines: 100,
                initialPosition: { top: '120px', right: '320px' },
                tipDelay: 3000,
                logCleanupInterval: 60000,
                defaultLogPanelSize: { width: 420, height: 350 },
                minLogPanelSize: { width: 300, height: 200 },
                ...config
            };
            this.container = null;
            this.iconElement = null;
            this.expandedElement = null;
            this.logContainer = null;
            this.isDragging = false;
            this.dragStartPos = { x: 0, y: 0 };
            this.isExpanded = false;
            this.actionCallbacks = {
                normal: null,
                mcgg: null,
                task: null,
                expand: null
            };
            this.delayedTipTimers = {};
            this.delayedTipElements = {};
            this.zoneTips = {
                normal: { title: '普通工单', desc: '复制内部描述，自动翻译标题' },
                mcgg: { title: 'MCGG工单', desc: '复制描述，MCGG标题处理' },
                task: { title: 'Task信息', desc: '提取客服信息并复制链接' },
                expand: { title: '展开面板', desc: '查看日志和更多选项' }
            };
            this.logData = [];
            this.logCleanupTimer = null;
            this.isPanelDragging = false;
            this.panelDragStartPos = { x: 0, y: 0 };
            this.panelOffset = { x: 0, y: 0 };
            this.isResizing = false;
            this.resizeStartPos = { x: 0, y: 0 };
            this.resizeStartSize = { width: 0, height: 0 };
            this.resizeObserver = null;
            this.saveSizeTimeout = null;

            this.init();
        }

        saveToStorage(key, data) {
            try {
                localStorage.setItem(key, JSON.stringify(data));
            } catch (e) {
                console.error('[UI] 存储数据失败:', key, e.message);
            }
        }

        loadFromStorage(key, defaultValue = null) {
            try {
                const data = localStorage.getItem(key);
                if (data) {
                    return JSON.parse(data);
                }
            } catch (e) {
                console.error('[UI] 读取存储数据失败:', key, e.message);
            }
            return defaultValue;
        }

        saveStatusBarPosition() {
            if (!this.container) return;
            try {
                const rect = this.container.getBoundingClientRect();
                const position = {
                    left: Math.round(rect.left),
                    top: Math.round(rect.top)
                };
                this.saveToStorage(StatusbarUI.STORAGE_KEYS.STATUS_BAR_POSITION, position);
            } catch (e) {
                console.error('[UI] 保存状态栏位置失败:', e.message);
            }
        }

        loadStatusBarPosition() {
            const position = this.loadFromStorage(StatusbarUI.STORAGE_KEYS.STATUS_BAR_POSITION);
            if (position && typeof position.left === 'number' && typeof position.top === 'number') {
                return position;
            }
            return null;
        }

        saveLogPanelPosition() {
            if (!this.expandedElement) return;
            try {
                const rect = this.expandedElement.getBoundingClientRect();
                const position = {
                    left: Math.round(rect.left),
                    top: Math.round(rect.top)
                };
                this.saveToStorage(StatusbarUI.STORAGE_KEYS.LOG_PANEL_POSITION, position);
            } catch (e) {
                console.error('[UI] 保存日志面板位置失败:', e.message);
            }
        }

        loadLogPanelPosition() {
            const position = this.loadFromStorage(StatusbarUI.STORAGE_KEYS.LOG_PANEL_POSITION);
            if (position && typeof position.left === 'number' && typeof position.top === 'number') {
                return position;
            }
            return null;
        }

        saveLogPanelSize() {
            if (!this.expandedElement) return;
            try {
                const rect = this.expandedElement.getBoundingClientRect();
                const size = {
                    width: Math.round(rect.width),
                    height: Math.round(rect.height)
                };
                this.saveToStorage(StatusbarUI.STORAGE_KEYS.LOG_PANEL_SIZE, size);
            } catch (e) {
                console.error('[UI] 保存日志面板大小失败:', e.message);
            }
        }

        loadLogPanelSize() {
            const size = this.loadFromStorage(StatusbarUI.STORAGE_KEYS.LOG_PANEL_SIZE);
            if (size && typeof size.width === 'number' && typeof size.height === 'number') {
                return size;
            }
            return this.config.defaultLogPanelSize;
        }

        init() {
            this.injectStyles();
            this.createDOM();
            this.bindEvents();
            this.startLogCleanupTimer();
        }

        injectStyles() {
            GM_addStyle(`
                .ai-status-bar-container {
                    position: fixed;
                    z-index: 999999;
                    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                    user-select: none;
                }

                /* 四区域图标容器 */
                .ai-status-icon {
                    width: 44px;
                    height: 44px;
                    border-radius: 8px;
                    background: #fff;
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    grid-template-rows: 1fr 1fr;
                    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
                    cursor: move;
                    border: 1px solid rgba(0, 0, 0, 0.08);
                    transition: transform 0.2s, box-shadow 0.2s;
                }
                .ai-status-icon:hover {
                    box-shadow: 0 6px 20px rgba(0, 0, 0, 0.2);
                }
                .ai-status-icon.dragging {
                    cursor: grabbing;
                    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.25);
                }

                /* 四个功能区域 */
                .ai-icon-zone {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 14px;
                    font-weight: 600;
                    cursor: pointer;
                    transition: background 0.15s ease, opacity 0.15s ease;
                    position: relative;
                    width: 22px;
                    height: 22px;
                    flex-shrink: 0;
                    overflow: visible;
                }

                /* 区域1：普通工单 - 左上 - 蓝色 */
                .ai-icon-zone-normal {
                    background: linear-gradient(135deg, #3370ff 0%, #4e8cff 100%);
                    color: white;
                    border-radius: 6px 0 0 0;
                }
                .ai-icon-zone-normal:hover {
                    background: linear-gradient(135deg, #285acc 0%, #3d6fd9 100%);
                }
                .ai-icon-zone-normal:active {
                    opacity: 0.7;
                }

                /* 区域2：MCGG - 右上 - 紫色 */
                .ai-icon-zone-mcgg {
                    background: linear-gradient(135deg, #722ed1 0%, #9254de 100%);
                    color: white;
                    border-radius: 0 6px 0 0;
                }
                .ai-icon-zone-mcgg:hover {
                    background: linear-gradient(135deg, #5b23a8 0%, #7a3dc7 100%);
                }
                .ai-icon-zone-mcgg:active {
                    opacity: 0.7;
                }

                /* 区域3：Task - 左下 - 橙色 */
                .ai-icon-zone-task {
                    background: linear-gradient(135deg, #f6d365 0%, #fda085 100%);
                    color: white;
                    border-radius: 0 0 0 6px;
                }
                .ai-icon-zone-task:hover {
                    background: linear-gradient(135deg, #e5c254 0%, #f08c6f 100%);
                }
                .ai-icon-zone-task:active {
                    opacity: 0.7;
                }

                /* 区域4：展开面板 - 右下 - 灰色 */
                .ai-icon-zone-expand {
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    color: white;
                    border-radius: 0 0 6px 0;
                }
                .ai-icon-zone-expand:hover {
                    background: linear-gradient(135deg, #5a6fd6 0%, #6a4190 100%);
                }
                .ai-icon-zone-expand:active {
                    opacity: 0.7;
                }

                /* 成功状态 */
                .ai-icon-zone.success {
                    background: linear-gradient(135deg, #52c41a 0%, #73d13d 100%) !important;
                }

                /* 处理中状态 */
                .ai-icon-zone.processing {
                    opacity: 0.6;
                }

                /* zone文本容器 */
                .ai-zone-text {
                    pointer-events: none;
                }

                /* 展开面板 */
                .ai-status-expanded {
                    position: fixed;
                    top: 100px;
                    left: 100px;
                    width: 420px;
                    height: 350px;
                    min-width: 300px;
                    min-height: 200px;
                    background: rgba(255, 255, 255, 0.98);
                    backdrop-filter: blur(10px);
                    border-radius: 12px;
                    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
                    padding: 12px;
                    border: 1px solid rgba(0, 0, 0, 0.05);
                    display: flex;
                    flex-direction: column;
                    gap: 10px;
                    transform-origin: top left;
                    overflow: hidden;
                }

                .ai-status-expanded.dragging {
                    cursor: move;
                    user-select: none;
                }

                .ai-status-expanded.resizing {
                    user-select: none;
                }

                .ai-panel-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    border-bottom: 1px solid rgba(0, 0, 0, 0.05);
                    padding-bottom: 8px;
                    cursor: move;
                    flex-shrink: 0;
                }

                .ai-panel-header:active {
                    cursor: grabbing;
                }

                .ai-resize-handle {
                    position: absolute;
                    right: 0;
                    bottom: 0;
                    width: 20px;
                    height: 20px;
                    cursor: se-resize;
                    background: linear-gradient(135deg, transparent 50%, rgba(0, 0, 0, 0.25) 50%);
                    border-radius: 0 0 12px 0;
                    z-index: 10;
                }

                .ai-resize-handle:hover {
                    background: linear-gradient(135deg, transparent 50%, rgba(51, 112, 255, 0.5) 50%);
                }

                .ai-resize-handle:active {
                    background: linear-gradient(135deg, transparent 50%, rgba(51, 112, 255, 0.7) 50%);
                }

                .ai-status-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    border-bottom: 1px solid rgba(0, 0, 0, 0.05);
                    padding-bottom: 8px;
                    flex-shrink: 0;
                }
                .ai-status-title {
                    font-size: 13px;
                    font-weight: 600;
                    color: #1d1d1f;
                }
                .ai-status-close {
                    border: none;
                    background: #f5f5f7;
                    width: 20px;
                    height: 20px;
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    cursor: pointer;
                    color: #86868b;
                    font-size: 14px;
                    transition: background 0.2s;
                }
                .ai-status-close:hover { background: #e5e5e7; color: #1d1d1f; }

                .ai-status-actions {
                    display: flex;
                    flex-wrap: wrap;
                    gap: 8px;
                }
                .ai-status-actions button {
                    padding: 6px 12px;
                    border: none;
                    border-radius: 6px;
                    font-size: 12px;
                    font-weight: 500;
                    cursor: pointer;
                    transition: all 0.2s;
                    display: flex;
                    align-items: center;
                    gap: 4px;
                }

                .btn-normal { background: #3370ff; color: white; }
                .btn-normal:hover { background: #285acc; transform: translateY(-1px); }
                .btn-normal.success { background: #52c41a !important; }

                .btn-mcgg { background: linear-gradient(135deg, #722ed1 0%, #9254de 100%); color: white; }
                .btn-mcgg:hover { opacity: 0.9; transform: translateY(-1px); }
                .btn-mcgg.success { background: linear-gradient(135deg, #11998e 0%, #38ef7d 100%) !important; }

                .btn-task { background: linear-gradient(135deg, #f6d365 0%, #fda085 100%); color: white; }
                .btn-task:hover { opacity: 0.9; transform: translateY(-1px); }
                .btn-task.success { background: linear-gradient(135deg, #11998e 0%, #38ef7d 100%) !important; }

                .ai-status-logs {
                    flex: 1;
                    min-height: 80px;
                    overflow-y: auto;
                    background: #f9f9f9;
                    border-radius: 6px;
                    padding: 8px;
                    font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;
                    font-size: 11px;
                    line-height: 1.5;
                    border: 1px solid rgba(0,0,0,0.03);
                    user-select: text;
                    -webkit-user-select: text;
                    -moz-user-select: text;
                    cursor: text;
                }
                .ai-log-item { margin-bottom: 4px; padding-bottom: 2px; border-bottom: 1px solid rgba(0,0,0,0.02); word-break: break-all; }
                .ai-log-info { color: #1d1d1f; }
                .ai-log-success { color: #52c41a; }
                .ai-log-warn { color: #faad14; }
                .ai-log-error { color: #ff4d4f; }

                .ai-log-module-normal { color: #3370ff; font-weight: 600; }
                .ai-log-module-mcgg { color: #722ed1; font-weight: 600; }
                .ai-log-module-task { color: #f5a623; font-weight: 600; }


                /* 5秒延迟详细提示 */
                .ai-delayed-tip {
                    position: absolute;
                    background: rgba(0, 0, 0, 0.9);
                    color: white;
                    padding: 8px 12px;
                    border-radius: 6px;
                    font-size: 12px;
                    line-height: 1.5;
                    white-space: nowrap;
                    pointer-events: none;
                    opacity: 0;
                    transform: translateX(-50%) translateY(5px);
                    transition: opacity 0.3s ease, transform 0.3s ease;
                    z-index: 1001;
                    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
                    max-width: 200px;
                }
                .ai-delayed-tip.visible {
                    opacity: 1;
                    transform: translateX(-50%) translateY(0);
                }
                .ai-delayed-tip-title {
                    font-weight: 600;
                    margin-bottom: 4px;
                    color: #fff;
                }
                .ai-delayed-tip-desc {
                    font-size: 11px;
                    color: rgba(255, 255, 255, 0.85);
                }
            `);
        }

        createDOM() {
            this.container = document.createElement('div');
            this.container.id = 'ai-merged-statusbar';
            this.container.className = 'ai-status-bar-container';

            const savedPosition = this.loadStatusBarPosition();
            if (savedPosition) {
                this.container.style.left = savedPosition.left + 'px';
                this.container.style.top = savedPosition.top + 'px';
                this.container.style.right = 'auto';
            } else {
                Object.assign(this.container.style, this.config.initialPosition);
            }

            this.iconElement = document.createElement('div');
            this.iconElement.className = 'ai-status-icon';

            const zoneNormal = document.createElement('div');
            zoneNormal.className = 'ai-icon-zone ai-icon-zone-normal';
            zoneNormal.innerHTML = '<span class="ai-zone-text">N</span>';
            zoneNormal.dataset.zone = 'normal';

            const zoneMcgg = document.createElement('div');
            zoneMcgg.className = 'ai-icon-zone ai-icon-zone-mcgg';
            zoneMcgg.innerHTML = '<span class="ai-zone-text">M</span>';
            zoneMcgg.dataset.zone = 'mcgg';

            const zoneTask = document.createElement('div');
            zoneTask.className = 'ai-icon-zone ai-icon-zone-task';
            zoneTask.innerHTML = '<span class="ai-zone-text">T</span>';
            zoneTask.dataset.zone = 'task';

            const zoneExpand = document.createElement('div');
            zoneExpand.className = 'ai-icon-zone ai-icon-zone-expand';
            zoneExpand.innerHTML = '<span class="ai-zone-text">⚡</span>';
            zoneExpand.dataset.zone = 'expand';

            this.iconElement.append(zoneNormal, zoneMcgg, zoneTask, zoneExpand);
            this.zones = { normal: zoneNormal, mcgg: zoneMcgg, task: zoneTask, expand: zoneExpand };

            this.expandedElement = document.createElement('div');
            this.expandedElement.className = 'ai-status-expanded';
            this.expandedElement.style.display = 'none';
            this.expandedElement.style.transform = 'scale(0.8)';
            this.expandedElement.style.opacity = '0';

            const savedSize = this.loadLogPanelSize();
            this.expandedElement.style.width = savedSize.width + 'px';
            this.expandedElement.style.height = savedSize.height + 'px';

            const header = document.createElement('div');
            header.className = 'ai-panel-header';
            header.innerHTML = `
                <span class="ai-status-title">工单助手 & Task 复制</span>
                <button class="ai-status-close">×</button>
            `;

            this.actionContainer = document.createElement('div');
            this.actionContainer.className = 'ai-status-actions';
            this.actionContainer.style.flexShrink = '0';

            this.logContainer = document.createElement('div');
            this.logContainer.className = 'ai-status-logs';

            const resizeHandle = document.createElement('div');
            resizeHandle.className = 'ai-resize-handle';

            this.expandedElement.append(header, this.actionContainer, this.logContainer, resizeHandle);
            this.container.append(this.iconElement, this.expandedElement);
            document.body.appendChild(this.container);
        }

        bindEvents() {
            let mouseDownTime = 0;
            let mouseDownPos = { x: 0, y: 0 };
            let hasMoved = false;

            const handleMouseDown = (e) => {
                if (e.button !== 0) return;
                mouseDownTime = Date.now();
                mouseDownPos = { x: e.clientX, y: e.clientY };
                hasMoved = false;
                this.isDragging = false;

                const rect = this.container.getBoundingClientRect();
                const offset = { x: e.clientX - rect.left, y: e.clientY - rect.top };

                const handleMouseMove = (moveEvent) => {
                    const dx = moveEvent.clientX - mouseDownPos.x;
                    const dy = moveEvent.clientY - mouseDownPos.y;

                    if (!hasMoved && (Math.abs(dx) > 5 || Math.abs(dy) > 5)) {
                        hasMoved = true;
                        this.isDragging = true;
                        this.iconElement.classList.add('dragging');
                        this.container.style.transition = 'none';
                        this.hideAllDelayedTips();
                    }

                    if (this.isDragging) {
                        let newX = moveEvent.clientX - offset.x;
                        let newY = moveEvent.clientY - offset.y;
                        newX = Math.max(0, Math.min(newX, window.innerWidth - 44));
                        newY = Math.max(0, Math.min(newY, window.innerHeight - 44));
                        this.container.style.left = newX + 'px';
                        this.container.style.top = newY + 'px';
                        this.container.style.right = 'auto';
                        this.container.style.bottom = 'auto';
                    }
                };

                const handleMouseUp = (upEvent) => {
                    document.removeEventListener('mousemove', handleMouseMove);
                    document.removeEventListener('mouseup', handleMouseUp);

                    this.iconElement.classList.remove('dragging');

                    if (this.isDragging) {
                        this.container.style.transition = 'all 0.3s cubic-bezier(0.18, 0.89, 0.32, 1.28)';
                        this.saveStatusBarPosition();
                    } else {
                        const target = upEvent.target.closest('.ai-icon-zone');
                        if (target) {
                            const zone = target.dataset.zone;
                            this.handleZoneClick(zone, target);
                        }
                    }

                    this.isDragging = false;
                };

                document.addEventListener('mousemove', handleMouseMove);
                document.addEventListener('mouseup', handleMouseUp);
            };

            this.iconElement.addEventListener('mousedown', handleMouseDown);

            Object.keys(this.zones).forEach(zoneName => {
                const zone = this.zones[zoneName];

                zone.addEventListener('mouseenter', () => {
                    this.startDelayedTipTimer(zoneName);
                });

                zone.addEventListener('mouseleave', () => {
                    this.cancelDelayedTipTimer(zoneName);
                    this.hideDelayedTip(zoneName);
                });

                zone.addEventListener('mousemove', () => {
                    this.cancelDelayedTipTimer(zoneName);
                    this.startDelayedTipTimer(zoneName);
                });
            });

            this.expandedElement.querySelector('.ai-status-close').addEventListener('click', (e) => {
                e.stopPropagation();
                this.collapse();
            });

            this.bindPanelDragEvents();
            this.bindPanelResizeEvents();
        }

        bindPanelDragEvents() {
            const header = this.expandedElement.querySelector('.ai-panel-header');
            if (!header) return;

            let panelMouseDownPos = { x: 0, y: 0 };
            let panelHasMoved = false;

            const handlePanelMouseDown = (e) => {
                if (e.button !== 0) return;
                if (e.target.closest('.ai-status-close')) return;

                this.isPanelDragging = false;
                panelHasMoved = false;
                panelMouseDownPos = { x: e.clientX, y: e.clientY };

                const rect = this.expandedElement.getBoundingClientRect();
                this.panelOffset = {
                    x: e.clientX - rect.left,
                    y: e.clientY - rect.top
                };

                this.expandedElement.classList.add('dragging');

                const handlePanelMouseMove = (moveEvent) => {
                    const dx = moveEvent.clientX - panelMouseDownPos.x;
                    const dy = moveEvent.clientY - panelMouseDownPos.y;

                    if (!panelHasMoved && (Math.abs(dx) > 3 || Math.abs(dy) > 3)) {
                        panelHasMoved = true;
                        this.isPanelDragging = true;
                    }

                    if (this.isPanelDragging) {
                        let newX = moveEvent.clientX - this.panelOffset.x;
                        let newY = moveEvent.clientY - this.panelOffset.y;
                        newX = Math.max(0, Math.min(newX, window.innerWidth - 100));
                        newY = Math.max(0, Math.min(newY, window.innerHeight - 50));

                        this.expandedElement.style.left = newX + 'px';
                        this.expandedElement.style.top = newY + 'px';
                    }
                };

                const handlePanelMouseUp = () => {
                    document.removeEventListener('mousemove', handlePanelMouseMove);
                    document.removeEventListener('mouseup', handlePanelMouseUp);

                    this.expandedElement.classList.remove('dragging');

                    if (this.isPanelDragging) {
                        this.saveLogPanelPosition();
                    }

                    this.isPanelDragging = false;
                };

                document.addEventListener('mousemove', handlePanelMouseMove);
                document.addEventListener('mouseup', handlePanelMouseUp);
            };

            header.addEventListener('mousedown', handlePanelMouseDown);
        }

        bindPanelResizeEvents() {
            const resizeHandle = this.expandedElement.querySelector('.ai-resize-handle');
            if (!resizeHandle) return;

            const handleResizeMouseDown = (e) => {
                if (e.button !== 0) return;
                e.preventDefault();
                e.stopPropagation();

                this.isResizing = true;
                this.resizeStartPos = { x: e.clientX, y: e.clientY };

                const rect = this.expandedElement.getBoundingClientRect();
                this.resizeStartSize = {
                    width: rect.width,
                    height: rect.height
                };

                this.expandedElement.classList.add('resizing');

                const handleResizeMouseMove = (moveEvent) => {
                    if (!this.isResizing) return;

                    const dx = moveEvent.clientX - this.resizeStartPos.x;
                    const dy = moveEvent.clientY - this.resizeStartPos.y;

                    let newWidth = this.resizeStartSize.width + dx;
                    let newHeight = this.resizeStartSize.height + dy;

                    newWidth = Math.max(this.config.minLogPanelSize.width, newWidth);
                    newHeight = Math.max(this.config.minLogPanelSize.height, newHeight);

                    newWidth = Math.min(newWidth, window.innerWidth - 50);
                    newHeight = Math.min(newHeight, window.innerHeight - 50);

                    this.expandedElement.style.width = newWidth + 'px';
                    this.expandedElement.style.height = newHeight + 'px';
                };

                const handleResizeMouseUp = () => {
                    document.removeEventListener('mousemove', handleResizeMouseMove);
                    document.removeEventListener('mouseup', handleResizeMouseUp);

                    this.expandedElement.classList.remove('resizing');

                    if (this.isResizing) {
                        this.saveLogPanelSize();
                        this.saveLogPanelPosition();
                    }

                    this.isResizing = false;
                };

                document.addEventListener('mousemove', handleResizeMouseMove);
                document.addEventListener('mouseup', handleResizeMouseUp);
            };

            resizeHandle.addEventListener('mousedown', handleResizeMouseDown);
        }

        startDelayedTipTimer(zoneName) {
            if (this.delayedTipTimers[zoneName]) {
                clearTimeout(this.delayedTipTimers[zoneName]);
            }

            this.delayedTipTimers[zoneName] = setTimeout(() => {
                console.log('[UI] 显示延迟提示:', zoneName);
                this.showDelayedTip(zoneName);
            }, this.config.tipDelay);
        }

        cancelDelayedTipTimer(zoneName) {
            if (this.delayedTipTimers[zoneName]) {
                clearTimeout(this.delayedTipTimers[zoneName]);
                this.delayedTipTimers[zoneName] = null;
            }
        }

        showDelayedTip(zoneName) {
            const zone = this.zones[zoneName];
            if (!zone) {
                console.warn('[UI] 未找到zone:', zoneName);
                return;
            }

            let tipEl = this.delayedTipElements[zoneName];
            if (!tipEl) {
                tipEl = document.createElement('div');
                tipEl.className = 'ai-delayed-tip';
                const tipInfo = this.zoneTips[zoneName] || { title: '', desc: '' };
                tipEl.innerHTML = `
                    <div class="ai-delayed-tip-title">${tipInfo.title}</div>
                    <div class="ai-delayed-tip-desc">${tipInfo.desc}</div>
                `;
                zone.appendChild(tipEl);
                this.delayedTipElements[zoneName] = tipEl;
                console.log('[UI] 创建延迟提示元素:', zoneName, tipInfo);
            }

            // 设置位置
            const isTop = zoneName === 'normal' || zoneName === 'mcgg';
            if (isTop) {
                tipEl.style.top = '-50px';
                tipEl.style.bottom = 'auto';
            } else {
                tipEl.style.bottom = '-50px';
                tipEl.style.top = 'auto';
            }
            tipEl.style.left = '50%';

            // 触发重排后添加visible类
            requestAnimationFrame(() => {
                tipEl.classList.add('visible');
                console.log('[UI] 延迟提示已显示:', zoneName);
            });
        }

        hideDelayedTip(zoneName) {
            const tipEl = this.delayedTipElements[zoneName];
            if (tipEl) {
                tipEl.classList.remove('visible');
            }
        }

        hideAllDelayedTips() {
            Object.keys(this.delayedTipElements).forEach(zoneName => {
                this.hideDelayedTip(zoneName);
            });
        }

        handleZoneClick(zone, element) {
            if (zone === 'expand') {
                if (this.isExpanded) {
                    this.collapse();
                } else {
                    this.expand();
                }
            } else if (this.actionCallbacks[zone]) {
                this.actionCallbacks[zone](element);
            }
        }

        /**
         * 注册区域点击回调
         * @param {string} zone - 区域名称 (normal/mcgg/task)
         * @param {Function} callback - 点击回调函数
         */
        registerZoneCallback(zone, callback) {
            this.actionCallbacks[zone] = callback;
        }

        expand() {
            this.isExpanded = true;

            const savedPosition = this.loadLogPanelPosition();
            const savedSize = this.loadLogPanelSize();

            if (savedPosition) {
                let left = savedPosition.left;
                let top = savedPosition.top;

                if (left + savedSize.width > window.innerWidth) {
                    left = window.innerWidth - savedSize.width - 10;
                }
                if (top + savedSize.height > window.innerHeight) {
                    top = window.innerHeight - savedSize.height - 10;
                }
                left = Math.max(10, left);
                top = Math.max(10, top);

                this.expandedElement.style.left = left + 'px';
                this.expandedElement.style.top = top + 'px';
            } else {
                const rect = this.container.getBoundingClientRect();
                let left = rect.left + 50;
                let top = rect.top + 50;

                if (left + savedSize.width > window.innerWidth) {
                    left = window.innerWidth - savedSize.width - 10;
                }
                if (top + savedSize.height > window.innerHeight) {
                    top = window.innerHeight - savedSize.height - 10;
                }
                left = Math.max(10, left);
                top = Math.max(10, top);

                this.expandedElement.style.left = left + 'px';
                this.expandedElement.style.top = top + 'px';
            }

            this.expandedElement.style.width = savedSize.width + 'px';
            this.expandedElement.style.height = savedSize.height + 'px';

            this.iconElement.style.display = 'none';
            this.expandedElement.style.display = 'flex';
            this.expandedElement.offsetHeight;
            this.expandedElement.style.transform = 'scale(1)';
            this.expandedElement.style.opacity = '1';
        }

        collapse() {
            this.isExpanded = false;
            this.expandedElement.style.transform = 'scale(0.8)';
            this.expandedElement.style.opacity = '0';
            setTimeout(() => {
                if (!this.isExpanded) {
                    this.expandedElement.style.display = 'none';
                    this.iconElement.style.display = 'grid';
                    Object.values(this.zones).forEach(zone => {
                        zone.style.transform = '';
                    });
                }
            }, 300);
        }

        addButton(text, className, onClick) {
            const btn = document.createElement('button');
            btn.textContent = text;
            btn.className = className;
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                onClick(btn);
            });
            this.actionContainer.appendChild(btn);
            return btn;
        }

        addLog(msg, type = 'info', moduleTag = '') {
            if (!this.logContainer) return;
            const logItem = document.createElement('div');
            logItem.className = `ai-log-item ai-log-${type}`;

            const time = new Date().toLocaleTimeString([], { hour12: false });

            if (moduleTag) {
                const tagClass = `ai-log-module-${moduleTag}`;
                logItem.innerHTML = `<span class="${tagClass}">[${moduleTag}]</span> [${time}] ${msg}`;
            } else {
                logItem.textContent = `[${time}] ${msg}`;
            }

            this.logContainer.appendChild(logItem);

            this.logData.push({ time, msg, type, moduleTag });
            if (this.logData.length > this.config.maxLogLines * 1.5) {
                this.logData = this.logData.slice(-this.config.maxLogLines);
            }

            while (this.logContainer.children.length > this.config.maxLogLines) {
                this.logContainer.removeChild(this.logContainer.firstChild);
            }

            this.logContainer.scrollTop = this.logContainer.scrollHeight;
        }

        startLogCleanupTimer() {
            if (this.logCleanupTimer) {
                clearInterval(this.logCleanupTimer);
            }

            this.logCleanupTimer = setInterval(() => {
                this.cleanupOldLogs();
            }, this.config.logCleanupInterval);
        }

        cleanupOldLogs() {
            if (!this.logContainer) return;

            const currentCount = this.logContainer.children.length;
            if (currentCount > this.config.maxLogLines * 0.8) {
                const removeCount = Math.floor(currentCount * 0.3);
                for (let i = 0; i < removeCount; i++) {
                    if (this.logContainer.firstChild) {
                        this.logContainer.removeChild(this.logContainer.firstChild);
                    }
                }
                console.log('[UI] 日志清理：移除了', removeCount, '条旧日志');
            }

            if (this.logData.length > this.config.maxLogLines) {
                this.logData = this.logData.slice(-this.config.maxLogLines);
            }
        }

        clearAllLogs() {
            if (this.logContainer) {
                this.logContainer.innerHTML = '';
            }
            this.logData = [];
        }

        createLogChannel(moduleName) {
            const self = this;
            return {
                log: (msg) => self.addLog(msg, 'info', moduleName),
                error: (msg) => self.addLog(msg, 'error', moduleName),
                warn: (msg) => self.addLog(msg, 'warn', moduleName),
                success: (msg) => self.addLog(msg, 'success', moduleName)
            };
        }

        showZoneSuccess(zone) {
            if (this.zones[zone]) {
                this.zones[zone].classList.add('success');
                setTimeout(() => {
                    this.zones[zone].classList.remove('success');
                }, 1500);
            }
        }

        showZoneProcessing(zone, isProcessing) {
            if (this.zones[zone]) {
                if (isProcessing) {
                    this.zones[zone].classList.add('processing');
                } else {
                    this.zones[zone].classList.remove('processing');
                }
            }
        }

        setZoneText(zone, text) {
            if (this.zones[zone]) {
                const textEl = this.zones[zone].querySelector('.ai-zone-text');
                if (textEl) {
                    textEl.textContent = text;
                }
            }
        }

        resetZoneText(zone) {
            const defaultTexts = {
                normal: 'N',
                mcgg: 'M',
                task: 'T',
                expand: '⚡'
            };
            if (this.zones[zone]) {
                const textEl = this.zones[zone].querySelector('.ai-zone-text');
                if (textEl) {
                    textEl.textContent = defaultTexts[zone] || '';
                }
            }
        }
    }

    // ===================== 创建 UI =====================
    // @run-at document-end 意味着 DOM 已准备好，直接同步创建
    let UI = null;
    try {
        UI = new StatusbarUI();
        console.log('[工单助手] UI 创建成功');
    } catch (e) {
        console.error('[工单助手] UI 创建失败:', e);
    }

    // ===================== 公共工具函数 =====================

    const SharedUtils = {
        isInputAvailable(el) {
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
        },

        extractVersion(text) {
            const match = text.match(/(\d+(?:\.\d+)+)/);
            return match ? match[1] : '';
        },

        hasChinese(text) {
            return /[\u4e00-\u9fa5]/.test(text);
        },

        getCurrentTicketID() {
            const elements = document.querySelectorAll('p, div, span');
            for (const el of elements) {
                const text = el.textContent.trim();
                if (/^\d{14}$/.test(text)) {
                    return text;
                }
            }
            return null;
        },

        findTitleInputRobust() {
            const byPlaceholder = document.querySelector('input[placeholder="请输入任务标题"]');
            if (byPlaceholder && this.isInputAvailable(byPlaceholder)) {
                return byPlaceholder;
            }

            const walker = document.createTreeWalker(
                document.body,
                NodeFilter.SHOW_TEXT,
                null,
                false
            );

            let node;
            while (node = walker.nextNode()) {
                const text = node.textContent.trim();
                if (text === '任务标题') {
                    const parent = node.parentElement;
                    if (parent) {
                        let container = parent.parentElement;
                        if (container) {
                            let sibling = container.nextElementSibling;
                            while (sibling) {
                                if (sibling.classList && sibling.classList.contains('detail')) {
                                    const input = sibling.querySelector('input');
                                    if (input && this.isInputAvailable(input)) {
                                        return input;
                                    }
                                }
                                sibling = sibling.nextElementSibling;
                            }
                            const fallback = container.querySelector('input');
                            if (fallback && this.isInputAvailable(fallback)) {
                                return fallback;
                            }
                        }
                    }
                }
            }
            return null;
        },

        simulateInputValue(element, text) {
            if (!element) return false;
            try {
                element.focus();
                const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
                nativeSetter.call(element, text);

                const events = ['input', 'change', 'keydown', 'keyup'];
                events.forEach(eventType => {
                    element.dispatchEvent(new Event(eventType, { bubbles: true }));
                });

                element.dispatchEvent(new Event('compositionstart', { bubbles: true }));
                element.dispatchEvent(new Event('compositionend', { bubbles: true }));
                return true;
            } catch (e) {
                console.error('模拟输入失败:', e);
                return false;
            }
        },

        waitForDropdownSearchInput(timeout = 1200) {
            return new Promise(resolve => {
                const startTime = Date.now();
                const check = () => {
                    const dropdown = document.querySelector('.el-select-dropdown:not([style*="display: none"])');
                    if (dropdown) {
                        const input = dropdown.querySelector('input[type="text"]');
                        if (input) {
                            resolve(input);
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
        },

        async fillDropdownSearch(text, logger, delay = 100) {
            const searchInput = await this.waitForDropdownSearchInput();
            if (!searchInput) {
                if (logger) logger.warn('未找到下拉搜索框');
                return false;
            }

            try {
                searchInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
                searchInput.focus();
                await new Promise(resolve => setTimeout(resolve, delay));

                const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
                nativeSetter.call(searchInput, text);

                searchInput.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
                searchInput.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));

                searchInput.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: text[0] || 'a' }));
                searchInput.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: text[text.length - 1] || 'a' }));

                if (logger) logger.success('填充下拉框: ' + text);
                return true;
            } catch (e) {
                if (logger) logger.error('下拉框填充失败: ' + e.message);
                return false;
            }
        },

        findLabelText(targetInput) {
            let formItem = targetInput.closest('.el-form-item');
            if (formItem) {
                const labelSpan = formItem.querySelector('.el-form-item__label__content');
                if (labelSpan) {
                    return labelSpan.textContent.trim();
                }
            }

            let parent = targetInput;
            let maxDepth = 6;
            while (parent && parent !== document.body && maxDepth > 0) {
                if (parent.classList && parent.classList.contains('detail')) {
                    let sibling = parent.previousElementSibling;
                    while (sibling) {
                        if (sibling.classList && sibling.classList.contains('title-of-work-order')) {
                            return sibling.textContent.trim();
                        }
                        sibling = sibling.previousElementSibling;
                    }
                    break;
                }
                parent = parent.parentElement;
                maxDepth--;
            }
            return '';
        },

        extractContentWithImages(element) {
            const clone = element.cloneNode(true);
            const images = clone.querySelectorAll('img');
            images.forEach(img => {
                const src = img.src || img.getAttribute('data-src');
                if (src) {
                    const linkText = document.createTextNode('  ' + src + ' ');
                    img.parentNode.replaceChild(linkText, img);
                } else {
                    img.remove();
                }
            });

            const walker = document.createTreeWalker(
                clone,
                NodeFilter.SHOW_TEXT,
                null,
                false
            );

            const textParts = [];
            let node;
            while (node = walker.nextNode()) {
                const text = node.textContent.trim();
                if (text) {
                    textParts.push(text);
                }
            }

            let text = textParts.join('\n');
            text = text.replace(/^(内部描述[\*\s]*[：:]?\s*)/i, '');
            return text.trim();
        }
    };

    // =========================================================================
    // 模块 A：普通工单助手 - 自动翻译与内部描述复制（完全独立）
    // =========================================================================
    (function() {
        'use strict';

        if (!shouldRunNormalModule()) return;

        const CONFIG = {
            translateDailyLimit: 150,
            translateTimeout: 6000,
            checkInterval: 500,
            titleRetryDelay: 1000,
            titleMaxWaitTime: 100000,
            internalDescRetryDelay: 3000,
            internalDescMaxRetries: 5,
            removeTrailingPunctuation: true,
            debug: true,
            fullServerLists: ["【2.1.40全服】：", "【2.1.18全服】：", "【40.2全服】：", "【18.2全服】："],
            testServerLists: ["【40.2测服】：", "【2.1.52测服】：", "【1.9.88测服】：", "【2.1.50测服】："],
            fullServer: "【40.2全服】：",
            testServer: "【2.1.60测服】：",
            debounceDelay: 300
        };

        let state = {
            currentTicketID: null,
            copiedText: '',
            leftHeading: '',
            versionNumber: '',
            channelText: '',
            faxiandiedai: '',
            hasProcessedTitle: false,
            translateCount: 0,
            isProcessing: false,
            isTitleProcessing: false,
            channelFilled: false,
            iterationFilled: false,
            focusListenersAttached: false,
            abnormalLoadRetries: 0,
            lastExtractedLength: 0,
            lastProcessTime: 0,
            processDebounceTimer: null
        };

        const logger = UI ? UI.createLogChannel('normal') : { log: console.log, error: console.error, warn: console.warn, success: console.log };

        function log(...args) {
            if (CONFIG.debug) {
                const msg = args.join(' ');
                console.log('[普通工单]', ...args);
                logger.log(msg);
            }
        }

        function logError(...args) {
            const msg = args.join(' ');
            console.error('[普通工单 错误]', ...args);
            logger.error(msg);
        }

        function extractFaxiandiedai(heading) {
            const match = heading.match(/【(.+?)全服】|【(.+?)测服】/);
            return match ? (match[1] || match[2] || '') : '';
        }

        function extractInternalDescription() {
            const allElements = document.querySelectorAll('p, div, span, label');
            let internalDescEl = null;
            let descEl = null;

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

            let contentEl = null;
            const parent = internalDescEl.parentElement;
            if (parent) {
                let sibling = parent.nextElementSibling;
                let tempContainer = document.createElement('div');

                while (sibling) {
                    if (descEl && sibling.contains(descEl)) break;
                    tempContainer.appendChild(sibling.cloneNode(true));
                    sibling = sibling.nextElementSibling;
                }

                if (tempContainer.childNodes.length > 0) {
                    contentEl = tempContainer;
                    log('通过临时容器收集到', tempContainer.childNodes.length, '个节点');
                }
            }

            if (!contentEl) {
                let sibling = internalDescEl.nextElementSibling;
                while (sibling) {
                    if (descEl && sibling.contains(descEl)) break;
                    const text = sibling.textContent.trim();
                    if (text && text !== '内部描述') {
                        contentEl = sibling;
                        break;
                    }
                    sibling = sibling.nextElementSibling;
                }
            }

            if (!contentEl) {
                log('主提取方式失败，尝试备用方式');
                return extractViaInnerText();
            }

            const extracted = SharedUtils.extractContentWithImages(contentEl);
            state.copiedText = extracted;
            state.lastExtractedLength = extracted.length;
            log('提取内部描述成功，长度:', extracted.length);
            logger.success('提取内部描述成功，长度: ' + extracted.length);

            if (extracted.length < 3) {
                log('警告：提取内容长度异常（<3），尝试备用提取方式');
                logger.warn('提取内容长度异常（' + extracted.length + '），尝试备用方式');
                const fallbackResult = extractViaInnerText();
                if (fallbackResult && fallbackResult.length >= 3) {
                    log('备用方式提取成功，长度:', fallbackResult.length);
                    return fallbackResult;
                }
                return '';
            }

            return extracted;
        }

        function isAbnormalLoad(extractedLength) {
            return extractedLength > 0 && extractedLength < 3;
        }

        async function extractInternalDescriptionWithRetry() {
            let result = extractInternalDescription();

            if (result && result.length >= 3) return result;

            if (result && isAbnormalLoad(result.length)) {
                log('检测到异常加载（长度=' + result.length + '），将触发重新提取');
                logger.warn('检测到异常加载，触发重新提取...');
            }

            const maxRetries = Math.max(1, CONFIG.internalDescMaxRetries || 5);
            for (let i = 0; i < maxRetries; i++) {
                log('内部描述未就绪，' + CONFIG.internalDescRetryDelay + 'ms 后重试 (' + (i + 1) + '/' + maxRetries + ')');
                logger.log('等待内容加载... (' + (i + 1) + '/' + maxRetries + ')');
                await new Promise(resolve => setTimeout(resolve, CONFIG.internalDescRetryDelay));
                result = extractInternalDescription();
                if (result && result.length >= 3) return result;

                if (result && isAbnormalLoad(result.length)) {
                    log('重试后仍检测到异常加载（长度=' + result.length + '）');
                    logger.warn('重试后仍异常，长度=' + result.length);
                }
            }
            return '';
        }

        function extractViaInnerText() {
            const bodyText = document.body.innerText;
            const startIdx = bodyText.indexOf('内部描述');
            if (startIdx === -1) {
                log('未找到"内部描述"文本');
                return '';
            }

            const searchStart = startIdx + 4;
            const endIdx = bodyText.indexOf('描述', searchStart);
            if (endIdx === -1) {
                log('未找到"描述"结束标记');
                return '';
            }

            let extracted = bodyText.slice(searchStart, endIdx).trim();
            extracted = extracted.replace(/^[：:\s]+/, '');

            if (extracted.length < 3) {
                log('innerText提取结果过短，尝试查找DOM内容区域');
                return extractViaDOMQuery();
            }

            state.copiedText = extracted;
            log('通过innerText提取内部描述成功，长度:', extracted.length);
            return extracted;
        }

        function extractViaDOMQuery() {
            log('尝试通过DOM选择器提取');

            const selectors = [
                '.el-form-item:has(.el-form-item__label:contains("内部描述")) .el-form-item__content',
                '.detail:has(+ .title-of-work-order:contains("内部描述"))',
                '[class*="internal-desc"]',
                '[class*="internalDescription"]',
                '.ql-editor',
                '.markdown-body',
                '.rich-text-content',
                '.editor-content'
            ];

            for (const selector of selectors) {
                try {
                    const elements = document.querySelectorAll(selector);
                    for (const el of elements) {
                        const text = el.textContent.trim();
                        if (text && text.length > 10 && !text.startsWith('内部描述')) {
                            const cleaned = text.replace(/^[\s：:]+/, '').trim();
                            if (cleaned.length >= 3) {
                                state.copiedText = cleaned;
                                log('通过DOM选择器提取成功，长度:', cleaned.length);
                                return cleaned;
                            }
                        }
                    }
                } catch (e) {
                    continue;
                }
            }

            log('DOM选择器提取失败');
            return '';
        }

        function determineHeading(text) {
            if (!text) {
                log('传入的文本为空，无法判断ServerID');
                return false;
            }

            const serverIdPattern = /ServerID\s*=\s*(\d{4,5})\s*,?/gi;
            const matches = [];
            let match;

            while ((match = serverIdPattern.exec(text)) !== null) {
                matches.push(match[1]);
            }

            log('ServerID匹配结果:', matches);

            if (matches.length === 0) {
                log('未找到ServerID');
                logger.warn('未找到ServerID');
                return false;
            }

            const serverID = matches[0];
            if (matches.length > 1) {
                log('警告：检测到多个ServerID，使用第一个: ' + serverID);
                logger.warn('检测到多个ServerID(' + matches.length + '个)，使用第一个');
            }

            log('提取到ServerID:', serverID);
            const isTestServer = serverID.startsWith('57');
            state.leftHeading = isTestServer ? CONFIG.testServer : CONFIG.fullServer;
            state.versionNumber = SharedUtils.extractVersion(state.leftHeading);
            state.channelText = isTestServer ? '测服' : '全服';
            state.faxiandiedai = extractFaxiandiedai(state.leftHeading);

            log('ServerID:', serverID, '| 类型:', state.channelText, '| 版本:', state.versionNumber, '| 迭代:', state.faxiandiedai);
            logger.success('识别环境: ' + state.channelText + ', 版本: ' + state.versionNumber + ', 迭代: ' + state.faxiandiedai);
            return true;
        }

        function translateViaGoogle(text) {
            return new Promise((resolve, reject) => {
                GM_xmlhttpRequest({
                    method: 'GET',
                    url: 'https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=zh-CN&dt=t&q=' + encodeURIComponent(text),
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

        function translateViaMyMemory(text) {
            return new Promise((resolve, reject) => {
                GM_xmlhttpRequest({
                    method: 'GET',
                    url: 'https://api.mymemory.translated.net/get?q=' + encodeURIComponent(text) + '&langpair=en|zh',
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

        async function translateText(text) {
            if (state.translateCount >= CONFIG.translateDailyLimit) {
                log('已达翻译次数上限');
                return text;
            }

            if (SharedUtils.hasChinese(text)) {
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
                        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), CONFIG.translateTimeout))
                    ]);

                    if (result && result !== text) {
                        state.translateCount++;
                        log('翻译成功:', result);
                        logger.success('翻译成功');
                        logger.log('原文: ' + text.substring(0, 50) + (text.length > 50 ? '...' : ''));
                        logger.log('译文: ' + result.substring(0, 50) + (result.length > 50 ? '...' : ''));
                        return result;
                    }
                } catch (e) {
                    log(translator.name, '翻译失败:', e.message);
                }
            }

            log('所有翻译源均失败，返回原文');
            return text;
        }

        async function processTitleWithRetry() {
            if (state.hasProcessedTitle || state.isTitleProcessing) {
                log('标题已处理过或正在处理中，跳过');
                return;
            }
            state.isTitleProcessing = true;

            const startTime = Date.now();
            log('开始等待任务标题输入框变为可用状态...');

            try {
                while (Date.now() - startTime < CONFIG.titleMaxWaitTime) {
                    const input = SharedUtils.findTitleInputRobust();
                    if (input) {
                        const currentValue = input.value || '';

                        if (/mcgg/i.test(currentValue)) {
                            log('检测到MCGG标识，普通工单模块跳过');
                            state.hasProcessedTitle = true;
                            return;
                        }

                        const colonMatch = currentValue.match(/[：:]/);
                        if (!colonMatch) {
                            const newTitle = state.leftHeading + currentValue;
                            log('标题中未找到冒号，直接插入前缀:', newTitle);
                            const success = SharedUtils.simulateInputValue(input, newTitle);
                            if (success) {
                                state.hasProcessedTitle = true;
                                log('✓ 标题处理成功');
                                logger.success('标题处理成功');
                                return;
                            }
                        } else {
                            const colonIndex = colonMatch.index;
                            const prefixPart = currentValue.substring(0, colonIndex);

                            if (/mcgg/i.test(prefixPart)) {
                                log('标题包含MCGG，不处理');
                                state.hasProcessedTitle = true;
                                return;
                            }

                            const prefixPattern = /^【[\d.]+[^】]*(?:全服|测服)】：?$/;
                            const isOldPrefix = prefixPattern.test(prefixPart);

                            if (currentValue.startsWith(state.leftHeading) && !isOldPrefix) {
                                log('标题前缀已是最新版本，跳过');
                                state.hasProcessedTitle = true;
                                return;
                            }

                            const contentPart = currentValue.substring(colonIndex + 1).trim();
                            let translatedContent = '';

                            if (contentPart && !SharedUtils.hasChinese(contentPart)) {
                                log('开始翻译标题内容:', contentPart);
                                translatedContent = await translateText(contentPart);
                                if (CONFIG.removeTrailingPunctuation) {
                                    translatedContent = translatedContent.replace(/[。.!?！？]+$/, '');
                                }
                            } else {
                                log('内容包含中文，跳过翻译');
                            }

                            let newTitle;
                            if (translatedContent) {
                                newTitle = state.leftHeading + translatedContent + ' ' + contentPart;
                            } else {
                                newTitle = state.leftHeading + contentPart;
                            }

                            log('应用新标题:', newTitle);
                            if (isOldPrefix) {
                                log('检测到旧版本前缀，将替换: ' + prefixPart + ' -> ' + state.leftHeading);
                                logger.log('更新标题前缀: ' + prefixPart + ' → ' + state.leftHeading);
                            }

                            const success = SharedUtils.simulateInputValue(input, newTitle);
                            if (success) {
                                state.hasProcessedTitle = true;
                                log('✓ 标题处理成功');
                                logger.success('标题处理成功');
                                return;
                            }
                        }
                    }
                    await new Promise(resolve => setTimeout(resolve, CONFIG.titleRetryDelay));
                }
            } finally {
                state.isTitleProcessing = false;
            }

            log('等待超时，未能处理标题');
        }

        async function handleChannelFocus() {
            if (state.channelFilled) return;
            log('渠道输入框获得焦点，准备填充:', state.channelText);
            const success = await SharedUtils.fillDropdownSearch(state.channelText, logger);
            if (success) state.channelFilled = true;
        }

        async function handleIterationFocus() {
            if (state.iterationFilled) return;
            log('发现迭代输入框获得焦点，准备填充:', state.faxiandiedai);
            const success = await SharedUtils.fillDropdownSearch(state.faxiandiedai, logger);
            if (success) state.iterationFilled = true;
        }

        function setupFocusListener() {
            if (state.focusListenersAttached) return;
            log('设置普通工单焦点监听器');

            document.addEventListener('focusin', async (e) => {
                const target = e.target;
                if (!target || target.tagName !== 'INPUT') return;

                const titleInput = SharedUtils.findTitleInputRobust();
                const titleValue = titleInput ? titleInput.value || '' : '';
                if (/mcgg/i.test(titleValue)) return;

                const labelText = SharedUtils.findLabelText(target);
                if (labelText.includes('渠道')) {
                    await handleChannelFocus();
                } else if (labelText.includes('发现迭代')) {
                    await handleIterationFocus();
                }
            }, true);

            state.focusListenersAttached = true;
            log('✓ 普通工单焦点监听器已设置');
        }

        function resetState() {
            state.hasProcessedTitle = false;
            state.channelFilled = false;
            state.iterationFilled = false;
            state.copiedText = '';
            state.leftHeading = '';
            state.versionNumber = '';
            state.channelText = '';
            state.faxiandiedai = '';
            state.focusListenersAttached = false;
            state.abnormalLoadRetries = 0;
            state.lastExtractedLength = 0;
        }

        function shouldSkipProcess() {
            const now = Date.now();
            const timeSinceLastProcess = now - state.lastProcessTime;

            if (state.isProcessing) {
                log('跳过执行：正在处理中');
                return true;
            }

            if (timeSinceLastProcess < CONFIG.debounceDelay) {
                log('跳过执行：防抖间隔内（距上次' + timeSinceLastProcess + 'ms）');
                return true;
            }

            return false;
        }

        async function processTicket() {
            if (shouldSkipProcess()) {
                return;
            }

            const titleInput = SharedUtils.findTitleInputRobust();
            const titleValue = titleInput ? titleInput.value || '' : '';
            if (/mcgg/i.test(titleValue)) {
                log('检测到MCGG标识，普通工单模块跳过');
                return;
            }

            state.isProcessing = true;
            state.lastProcessTime = Date.now();
            log('========== 开始处理普通工单 ==========');

            try {
                const internalDesc = await extractInternalDescriptionWithRetry();
                if (!internalDesc) {
                    log('未提取到内部描述，中止处理');
                    state.isProcessing = false;
                    return;
                }

                const hasValidServer = determineHeading(internalDesc);
                if (!hasValidServer) {
                    log('ServerID验证失败，跳过标题处理');
                    state.isProcessing = false;
                    return;
                }

                await processTitleWithRetry();
                setupFocusListener();
                log('========== 普通工单处理完成 ==========');
            } catch (e) {
                logError('处理工单时发生异常:', e);
            } finally {
                state.isProcessing = false;
            }
        }

        function handleNormalZoneClick(element) {
            const titleInput = SharedUtils.findTitleInputRobust();
            const titleValue = titleInput ? titleInput.value || '' : '';
            if (/mcgg/i.test(titleValue)) {
                log('当前工单为MCGG类型，请使用MCGG按钮');
                return;
            }

            if (!state.copiedText) {
                log('无内容可复制');
                return;
            }

            navigator.clipboard.writeText(state.copiedText).then(() => {
                UI.showZoneSuccess('normal');
                log('内部描述已复制到剪贴板');
            }).catch(err => {
                logError('复制失败:', err);
            });
        }

        function initUI() {
            if (!UI) return;
            UI.addButton('普通工单', 'btn-normal', async (btn) => {
                handleNormalZoneClick(btn);
            });
            UI.registerZoneCallback('normal', handleNormalZoneClick);
        }

        function monitorTicketChange() {
            setInterval(() => {
                const newTicketID = SharedUtils.getCurrentTicketID();
                if (newTicketID && newTicketID !== state.currentTicketID) {
                    log('工单切换: ' + (state.currentTicketID || '(无)') + ' -> ' + newTicketID);
                    logger.success('检测到新工单: ' + newTicketID);
                    resetState();
                    state.currentTicketID = newTicketID;
                    setTimeout(() => {
                        processTicket();
                    }, 500);
                }
            }, CONFIG.checkInterval);
        }

        function init() {
            log('========================================');
            log('普通工单模块 v6.2.8 已启动');
            log('调试模式:', CONFIG.debug);
            log('========================================');
            initUI();
            monitorTicketChange();
            setTimeout(() => {
                const ticketID = SharedUtils.getCurrentTicketID();
                if (ticketID) {
                    log('检测到工单:', ticketID);
                    state.currentTicketID = ticketID;
                    processTicket();
                } else {
                    log('未检测到工单ID');
                }
            }, 1000);
        }

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', init);
        } else {
            init();
        }
    })();

    // =========================================================================
    // 模块 B：MCGG工单助手（完全独立）
    // =========================================================================
    (function() {
        'use strict';

        if (!shouldRunNormalModule()) return;

        const CONFIG = {
            debug: true,
            checkInterval: 500,
            titleRetryDelay: 1000,
            titleMaxWaitTime: 100000,
            internalDescRetryDelay: 3000,
            internalDescMaxRetries: 5,
            mcggfullServerLists: ["【MCGG】- 1.2.60：", "【MCGG】- 1.2.58：", "【MCGG】- 1.2.62：", "【MCGG】- 1.2.56："],
            mcggtestServerLists: ["【MCGG】- 1.2.60：", "【MCGG】- 1.2.58：", "【MCGG】- 1.2.62：", "【MCGG】- 1.2.56："],
            mcggfullServer: "【MCGG】- 1.2.58：",
            mcggtestServer: "【MCGG】- 1.2.60：",
            debounceDelay: 300
        };

        let state = {
            currentTicketID: null,
            copiedText: '',
            leftHeading: '',
            versionNumber: '',
            channelText: '',
            faxiandiedai: '',
            hasProcessedTitle: false,
            isProcessing: false,
            isTitleProcessing: false,
            channelFilled: false,
            iterationFilled: false,
            moduleFilled: false,
            focusListenersAttached: false,
            lastProcessTime: 0
        };

        const logger = UI ? UI.createLogChannel('mcgg') : { log: console.log, error: console.error, warn: console.warn, success: console.log };

        function log(msg, type = 'info') {
            if (!CONFIG.debug) return;
            const text = msg;
            if (type === 'error') {
                console.error('[MCGG模块] ' + msg);
                logger.error(text);
            } else if (type === 'warn') {
                console.warn('[MCGG模块] ' + msg);
                logger.warn(text);
            } else if (type === 'success') {
                console.log('[MCGG模块] ' + msg);
                logger.success(text);
            } else {
                console.log('[MCGG模块] ' + msg);
                logger.log(text);
            }
        }

        function isMCGGTitle(titleValue, options = {}) {
            const hasMCGG = /mcgg/i.test(titleValue || '');
            if (!options.silent) {
                log('标题检测: ' + (hasMCGG ? '检测到MCGG标识' : '未检测到MCGG标识'));
            }
            return hasMCGG;
        }

        function resetState() {
            state = {
                currentTicketID: state.currentTicketID,
                copiedText: '',
                leftHeading: '',
                versionNumber: '',
                channelText: '',
                faxiandiedai: '',
                hasProcessedTitle: false,
                isProcessing: false,
                isTitleProcessing: false,
                channelFilled: false,
                iterationFilled: false,
                moduleFilled: false,
                focusListenersAttached: false,
                lastProcessTime: 0
            };
        }

        function shouldSkipProcess() {
            const now = Date.now();
            const timeSinceLastProcess = now - state.lastProcessTime;

            if (state.isProcessing) {
                log('跳过执行：正在处理中');
                return true;
            }

            if (timeSinceLastProcess < CONFIG.debounceDelay) {
                log('跳过执行：防抖间隔内（距上次' + timeSinceLastProcess + 'ms）');
                return true;
            }

            return false;
        }

        async function processMCGGTicket() {
            if (shouldSkipProcess()) {
                return;
            }

            state.isProcessing = true;
            state.lastProcessTime = Date.now();
            log('========== 开始处理MCGG工单 ==========');

            try {
                const description = await extractMCGGInternalDescriptionWithRetry();
                if (!description) {
                    log('未提取到描述内容，中止处理', 'error');
                    return;
                }

                const hasValidServer = determineMCGGHeading(description);
                if (!hasValidServer) {
                    log('ServerID验证失败，跳过标题处理', 'warn');
                }

                await processMCGGTitleWithRetry();
                setupMCGGFocusListener();
                log('========== MCGG工单处理完成 ==========', 'success');
            } finally {
                state.isProcessing = false;
            }
        }

        function extractTextFromElement(element) {
            if (!element) return '';
            if (element.tagName === 'TEXTAREA' || element.tagName === 'INPUT') {
                return (element.value || '').trim();
            }
            return SharedUtils.extractContentWithImages(element);
        }

        function extractMCGGInternalDescription() {
            log('开始提取描述内容');
            const allElements = document.querySelectorAll('p, div, span, label');
            let descLabel = null;

            for (const el of allElements) {
                const text = el.textContent.trim();
                if ((text === '描述' || text === '描述*') && !text.includes('内部')) {
                    descLabel = el;
                    break;
                }
            }

            if (!descLabel) {
                log('未找到"描述"标签', 'warn');
                return '';
            }

            const formItem = descLabel.closest('.el-form-item');
            let extracted = '';

            if (formItem) {
                const candidates = formItem.querySelectorAll(
                    '.el-form-item__content, .detail, .ql-editor, [contenteditable="true"], textarea, .el-textarea__inner, input[type="text"], .markdown-body, .editor-content, .rich-text, .text-content, .aihelp-editor, .editor, .editor-container, pre'
                );

                for (const candidate of candidates) {
                    const text = extractTextFromElement(candidate);
                    if (text) {
                        extracted = text.replace(/^描述\*?[\s：:]*/, '');
                        break;
                    }
                }
            }

            if (!extracted) {
                let sibling = formItem ? formItem.nextElementSibling : descLabel.parentElement?.nextElementSibling;
                const tempContainer = document.createElement('div');

                while (sibling) {
                    const siblingText = sibling.textContent.trim();
                    if (/(^|\s)(内部描述|描述|渠道|发现迭代|功能模块|任务标题)/.test(siblingText)) break;
                    tempContainer.appendChild(sibling.cloneNode(true));
                    sibling = sibling.nextElementSibling;
                }

                if (tempContainer.childNodes.length > 0) {
                    extracted = SharedUtils.extractContentWithImages(tempContainer).replace(/^描述\*?[\s：:]*/, '');
                }
            }

            if (!extracted) {
                log('未找到"描述"内容区域', 'warn');
                return '';
            }

            if (!extracted.trim()) {
                log('描述内容为空', 'warn');
                return '';
            }

            state.copiedText = extracted.trim();
            log('描述内容提取成功，长度: ' + state.copiedText.length, 'success');
            return state.copiedText;
        }

        async function extractMCGGInternalDescriptionWithRetry() {
            let result = extractMCGGInternalDescription();
            if (result) return result;

            const maxRetries = Math.max(1, CONFIG.internalDescMaxRetries || 0);
            for (let i = 0; i < maxRetries; i++) {
                log('描述未就绪，' + CONFIG.internalDescRetryDelay + 'ms 后重试 (' + (i + 1) + '/' + maxRetries + ')');
                await new Promise(resolve => setTimeout(resolve, CONFIG.internalDescRetryDelay));
                result = extractMCGGInternalDescription();
                if (result) return result;
            }
            return '';
        }

        function determineMCGGHeading(text) {
            if (!text) {
                log('传入的文本为空，无法判断ServerID', 'warn');
                return false;
            }

            const serverIdPattern = /ServerID\s*=\s*(\d{4,5})\s*,?/gi;
            const matches = [];
            let match;

            while ((match = serverIdPattern.exec(text)) !== null) {
                matches.push(match[1]);
            }

            log('ServerID匹配结果: ' + (matches.join(', ') || '无'));

            if (matches.length === 0) {
                log('未找到有效ServerID', 'warn');
                return false;
            }

            const serverID = matches[0];
            if (matches.length > 1) {
                log('检测到多个ServerID(' + matches.length + '个)，使用第一个: ' + serverID, 'warn');
            }

            const isTestServer = serverID.startsWith('57');
            state.leftHeading = isTestServer ? CONFIG.mcggtestServer : CONFIG.mcggfullServer;
            state.versionNumber = SharedUtils.extractVersion(state.leftHeading);
            state.channelText = isTestServer ? '测服' : '全服';
            state.faxiandiedai = SharedUtils.extractVersion(state.leftHeading);

            log('识别环境: ' + state.channelText + ', 版本: ' + state.versionNumber);
            return true;
        }

        async function processMCGGTitleWithRetry() {
            if (state.hasProcessedTitle || state.isTitleProcessing) {
                log('标题已处理或正在处理中，跳过');
                return;
            }

            if (!state.leftHeading) {
                log('未设置标题前缀，跳过标题处理', 'warn');
                return;
            }

            state.isTitleProcessing = true;
            const startTime = Date.now();
            log('开始等待任务标题输入框变为可用状态...');

            try {
                while (Date.now() - startTime < CONFIG.titleMaxWaitTime) {
                    const input = SharedUtils.findTitleInputRobust();
                    if (input) {
                        const currentValue = input.value || '';
                        if (currentValue.startsWith(state.leftHeading)) {
                            log('标题前缀已存在，跳过');
                            state.hasProcessedTitle = true;
                            return;
                        }

                        const colonMatch = currentValue.match(/[：:]/);
                        let newTitle = '';

                        if (!colonMatch) {
                            newTitle = state.leftHeading + currentValue;
                            log('标题中未找到冒号，直接插入前缀: ' + newTitle);
                        } else {
                            const contentPart = currentValue.substring(colonMatch.index + 1).trim();
                            newTitle = state.leftHeading + contentPart;
                        }

                        const success = SharedUtils.simulateInputValue(input, newTitle);
                        if (success) {
                            state.hasProcessedTitle = true;
                            log('标题处理成功: ' + newTitle, 'success');
                            return;
                        }
                    }
                    await new Promise(resolve => setTimeout(resolve, CONFIG.titleRetryDelay));
                }
            } finally {
                state.isTitleProcessing = false;
            }

            log('等待超时，未能处理标题', 'warn');
        }

        async function handleMCGGChannelFocus() {
            if (state.channelFilled) return;
            log('渠道输入框获得焦点，准备填充: ' + state.channelText);
            const success = await SharedUtils.fillDropdownSearch(state.channelText, logger);
            if (success) {
                state.channelFilled = true;
                log('渠道填充成功', 'success');
            } else {
                log('渠道填充失败', 'warn');
            }
        }

        async function handleMCGGIterationFocus() {
            if (state.iterationFilled) return;
            log('发现迭代输入框获得焦点，准备填充: ' + state.faxiandiedai);
            const success = await SharedUtils.fillDropdownSearch(state.faxiandiedai, logger);
            if (success) {
                state.iterationFilled = true;
                log('发现迭代填充成功', 'success');
            } else {
                log('发现迭代填充失败', 'warn');
            }
        }

        async function handleMCGGModuleFocus() {
            if (state.moduleFilled) return;
            log('功能模块输入框获得焦点，准备填充: 模式独立包');
            const success = await SharedUtils.fillDropdownSearch('模式独立包', logger);
            if (success) {
                state.moduleFilled = true;
                log('功能模块填充成功', 'success');
            } else {
                log('功能模块填充失败', 'warn');
            }
        }

        function setupMCGGFocusListener() {
            if (state.focusListenersAttached) return;
            log('设置 MCGG 焦点监听器');

            document.addEventListener('focusin', async (e) => {
                const target = e.target;
                if (!target || target.tagName !== 'INPUT') return;

                const titleInput = SharedUtils.findTitleInputRobust();
                const titleValue = titleInput ? titleInput.value || '' : '';
                if (!isMCGGTitle(titleValue, { silent: true })) return;

                const labelText = SharedUtils.findLabelText(target);
                if (labelText.includes('渠道')) {
                    await handleMCGGChannelFocus();
                } else if (labelText.includes('发现迭代')) {
                    await handleMCGGIterationFocus();
                } else if (labelText.includes('功能模块')) {
                    await handleMCGGModuleFocus();
                }
            }, true);

            state.focusListenersAttached = true;
            log('MCGG 焦点监听器已设置', 'success');
        }

        async function handleMcggZoneClick(element) {
            const titleInput = SharedUtils.findTitleInputRobust();
            const titleValue = titleInput ? titleInput.value || '' : '';
            if (!isMCGGTitle(titleValue, { silent: true }) && !state.copiedText && !state.leftHeading) {
                log('当前工单不是MCGG类型，请使用普通工单按钮', 'warn');
                return;
            }

            let copyText = state.copiedText || await extractMCGGInternalDescriptionWithRetry();
            if (!copyText) {
                log('无内容可复制', 'warn');
                return;
            }

            navigator.clipboard.writeText(copyText).then(() => {
                UI.showZoneSuccess('mcgg');
                log('描述已复制到剪贴板', 'success');
            }).catch(err => {
                log('复制失败: ' + err, 'error');
            });
        }

        function initUI() {
            if (!UI) return;
            UI.addButton('MCGG工单', 'btn-mcgg', async (btn) => {
                handleMcggZoneClick(btn);
            });
            UI.registerZoneCallback('mcgg', handleMcggZoneClick);
        }

        function monitorTicketChange() {
            setInterval(() => {
                const newTicketID = SharedUtils.getCurrentTicketID();
                if (newTicketID && newTicketID !== state.currentTicketID) {
                    resetState();
                    state.currentTicketID = newTicketID;
                    setTimeout(() => {
                        const titleInput = SharedUtils.findTitleInputRobust();
                        const titleValue = titleInput ? titleInput.value || '' : '';
                        if (isMCGGTitle(titleValue, { silent: true })) {
                            log('检测到MCGG工单切换: ' + newTicketID);
                            logger.success('检测到MCGG工单: ' + newTicketID);
                            processMCGGTicket();
                        }
                    }, 500);
                }
            }, CONFIG.checkInterval);
        }

        function init() {
            log('========================================');
            log('MCGG工单模块 v6.2.9 已启动');
            log('调试模式:', CONFIG.debug);
            log('========================================');
            initUI();
            monitorTicketChange();
            setTimeout(() => {
                const ticketID = SharedUtils.getCurrentTicketID();
                if (ticketID) {
                    state.currentTicketID = ticketID;
                    const titleInput = SharedUtils.findTitleInputRobust();
                    const titleValue = titleInput ? titleInput.value || '' : '';
                    if (isMCGGTitle(titleValue, { silent: true })) {
                        log('检测到MCGG工单:', ticketID);
                        logger.success('检测到MCGG工单: ' + ticketID);
                        processMCGGTicket();
                    }
                }
            }, 1000);
        }

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', init);
        } else {
            init();
        }
    })();

    // =========================================================================
    // 模块 C：Task客服信息提取（完全独立）
    // =========================================================================
    (function() {
        'use strict';

        if (!shouldRunTaskModule()) return;

        const CONFIG = {
            debug: true,
            maxRetries: 12,
            retryInterval: 500
        };

        const logger = UI ? UI.createLogChannel('task') : { log: console.log, error: console.error, warn: console.warn, success: console.log };

        function log(...args) {
            if (CONFIG.debug) {
                const msg = args.join(' ');
                console.log('[Task模块]', ...args);
                logger.log(msg);
            }
        }

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

        async function retryTaskExtraction(maxRetries = CONFIG.maxRetries, interval = CONFIG.retryInterval) {
            for (let i = 0; i < maxRetries; i++) {
                const result = extractTaskInfo();
                if (result.agentName) return result;
                await new Promise(r => setTimeout(r, interval));
            }
            return extractTaskInfo();
        }

        async function handleTaskZoneClick(element) {
            UI.showZoneProcessing('task', true);

            try {
                const taskInfo = await retryTaskExtraction();
                const finalUrl = taskInfo.url || window.location.href;
                const finalAgentName = taskInfo.agentName;
                const finalPrefix = taskInfo.agentPrefix;

                if (!finalAgentName) {
                    UI.setZoneText('task', '?');
                    setTimeout(() => {
                        UI.resetZoneText('task');
                        UI.showZoneProcessing('task', false);
                    }, 1500);
                } else {
                    const copyText = finalUrl + ' @' + finalAgentName;
                    GM_setClipboard(copyText);
                    UI.showZoneSuccess('task');
                    log('Task信息已复制: ' + copyText);
                    UI.setZoneText('task', finalPrefix || 'OK');
                    setTimeout(() => {
                        UI.resetZoneText('task');
                        UI.showZoneProcessing('task', false);
                    }, 1500);
                }
            } catch (e) {
                UI.setZoneText('task', 'X');
                setTimeout(() => {
                    UI.resetZoneText('task');
                    UI.showZoneProcessing('task', false);
                }, 1500);
            }
        }

        function initUI() {
            if (!UI) return;
            UI.addButton('复制 Task 信息', 'btn-task', (btn) => {
                handleTaskZoneClick(btn);
            });
            UI.registerZoneCallback('task', handleTaskZoneClick);
        }

        function init() {
            log('========================================');
            log('Task模块 v6.2.8 已启动');
            log('调试模式:', CONFIG.debug);
            log('========================================');
            initUI();
        }

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', init);
        } else {
            init();
        }
    })();

})();

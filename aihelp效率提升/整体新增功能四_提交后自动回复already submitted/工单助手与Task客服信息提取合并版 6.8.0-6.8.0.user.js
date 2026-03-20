// ==UserScript==
// @name         工单助手与Task客服信息提取合并版 6.8.0
// @namespace    http://tampermonkey.net/
// @version      6.8.0
// @description  新增内部回复功能：在面板和展开菜单提供内部回复的快捷按钮，模拟用户点击
// @author       AI Combined & Optimized
// @match        https://ml-panel.aihelp.net/*
// @match        https://ml.aihelp.net/*
// @match        https://aihelp.net.cn/*
// @match        https://aihelp.net/*
// @match        https://project.feishu.cn/ml/workObjectView/onlineissue/Cot68m5vg
// @match        https://project.feishu.cn/ml/workObjectView/onlineissue/Cot68m5vg?*
// @match        https://project.feishu.cn/ml/*
// @match        https://gm.moba.youngjoygame.com:8090/*
// @exclude      *://*/dashboard/#/newpage-ticket*
// @exclude      *://*/dashboard/#/newpage-ticket/*
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @grant        GM_setClipboard
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @grant        GM_openInTab
// @grant        GM_registerMenuCommand
// @connect      translate.googleapis.com
// @connect      api.mymemory.translated.net
// @connect      api.deeplx.fun
// @connect      api.deeplx.org
// @connect      api.popcat.xyz
// @connect      open.bigmodel.cn
// @connect      project.feishu.cn
// @connect      gm.moba.youngjoygame.com
// @run-at       document-end
// ==/UserScript==

/**
 * v6.8.0 (2026-03-19) 新增内部回复快捷按钮功能（模块G）
 *
 * 【新增功能 - 模块G：内部回复】
 * 需求来源：用户需求新增"内部回复"按钮
 * 功能说明：
 *   - 在主脚本小图标新增"内"区域（第6格），替换原来的空白格
 *   - 展开面板中新增"内部回复"按钮
 *   - 用户点击后，自动查找并模拟点击工单界面的"内部回复"或"内部备注"按钮
 * 实现机制：
 *   - 纯前端DOM操作模拟点击，快速响应
 * 耦合性：完全独立模块
 *
 * 【历史更新】
 * v6.7.0 (2026-03-19) 新增清除头像冷却时间功能（模块F）
 *
 * 【新增功能 - 模块F：清除头像冷却时间】
 * 需求来源：gm工具\清除头像\清除头像冷却时间-1.1.0-新增日志面板同步.user.js
 * 功能说明：
 *   - 在主脚本小图标新增"清"区域（第5格），点击后提取当前工单的UID和ServerID
 *   - 自动以弹窗方式打开GM工具页面（https://gm.moba.youngjoygame.com:8090/#/customer/banTool）
 *   - GM工具页面自动选择服务器、输入UID、点击执行，完成清除操作
 *   - GM工具页面执行日志通过GM_setValue跨域同步到主脚本日志面板
 *   - 展开面板中新增"清除头像"按钮，与"清"图标功能相同
 * 实现机制：
 *   - AIHelp端（模块F-AIHelp）：提取UID/ServerID → GM_setValue写入 → window.open弹窗
 *   - GM工具端（模块F-GM，独立IIFE）：读取任务 → 自动操作 → 日志写入GM存储
 *   - AIHelp端轮询 GM_getValue 获取GM工具日志并实时显示在日志面板
 * 耦合性：模块完全独立封装，不干扰现有功能；图标与展开面板均已集成
 *
 * 【历史更新】
 * v6.6.2: 飞书端修复搜索功能稳定性
 * v6.6.0 (2026-03-18): 新增飞书项目 Ticket ID 搜索功能（模块E）
 * v6.5.7: 翻译源精简与延迟优化，移除不稳定源(DeepLX/Popcat)，保留三大核心稳定源
 * v6.5.6: 增强 DeepLX 和 Popcat 稳定性（已在 v6.5.7 移除）
 * v6.5.5: 修复谷歌翻译超时问题（恢复为 6 秒超时）
 */

(function() {
    'use strict';

    // ===================== 最优先：URL检查 =====================
    // 参考脚本：AiHelp Task 信息提取一键复制.user
    // 如果URL包含ticket，直接退出整个脚本，不执行任何代码
    const currentUrl = window.location.href;
    if (currentUrl.includes('ticket')) {
        console.log('[工单助手] URL包含ticket，跳过脚本加载');
        return;
    }

    // 判定当前页面是否为目标页面
    function isTargetPage() {
        return currentUrl.includes('task?orderId') || currentUrl.includes('tasks?searchType');
    }

    if (!isTargetPage()) {
        console.log('[工单助手] 非目标页面，跳过脚本加载');
        return;
    }

    console.log('[工单助手] 目标页面，开始加载脚本');

    // ===================== 公共区域：页面判定逻辑 =====================

    /**
     * 判断是否应该运行普通工单模块
     */
    function shouldRunNormalModule() {
        return currentUrl.includes('task?orderId') || currentUrl.includes('tasks?searchType');
    }

    /**
     * 判断是否应该运行Task模块
     */
    function shouldRunTaskModule() {
        return currentUrl.includes('task?orderId') || currentUrl.includes('tasks?searchType');
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
                minLogPanelSize: { width: 120, height: 200 },
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
                clear: null,   // [模块F] 清除头像冷却时间
                reply: null,   // [模块G] 内部回复
                expand: null
            };
            this.delayedTipTimers = {};
            this.delayedTipElements = {};
            this.zoneTips = {
                normal: { title: '普通工单', desc: '复制内部描述，自动翻译标题' },
                mcgg: { title: 'MCGG工单', desc: '复制描述，MCGG标题处理' },
                task: { title: 'Task信息', desc: '提取客服信息并复制链接' },
                clear: { title: '清除头像', desc: '提取信息并清除头像冷却' }, // [模块F]
                reply: { title: '内部回复', desc: '点击工单界面的内部回复按钮' }, // [模块G]
                expand: { title: '展开面板', desc: '查看日志和更多选项' }
            };
            // [模块F] 跨域日志轮询相关（GM工具页面 → 主脚本日志面板）
            this.clearAvatarLogPollingTimer = null;
            this.clearAvatarLastLogTimestamp = 0;
            this.clearAvatarLogPollingInterval = 500;
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

                /* 五区域图标容器（2列×3行，第5格为"清"，第6格为"⚡"） */
                .ai-status-icon {
                    width: 44px;
                    height: 66px;
                    border-radius: 8px;
                    background: #fff;
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    grid-template-rows: 1fr 1fr 1fr;
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

                /* [模块F] 区域5：清除头像 - 左下 - 绿色 */
                .ai-icon-zone-clear {
                    background: linear-gradient(135deg, #52c41a 0%, #73d13d 100%);
                    color: white;
                    border-radius: 0 0 0 6px;
                }
                .ai-icon-zone-clear:hover {
                    background: linear-gradient(135deg, #3fad0a 0%, #5cb82d 100%);
                }
                .ai-icon-zone-clear:active {
                    opacity: 0.7;
                }

                /* [模块G] 区域6：内部回复 - 右下 - 橙色 */
                .ai-icon-zone-reply {
                    background: linear-gradient(135deg, #fa8c16 0%, #ffa940 100%);
                    color: white;
                    border-radius: 0 0 6px 0;
                }
                .ai-icon-zone-reply:hover {
                    background: linear-gradient(135deg, #d46b08 0%, #e8922d 100%);
                }
                .ai-icon-zone-reply:active {
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
                    min-width: 120px;
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
                    overflow: auto;
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

                /* [模块F] 清除头像按钮样式 */
                .btn-clear { background: linear-gradient(135deg, #52c41a 0%, #73d13d 100%); color: white; }
                .btn-clear:hover { background: linear-gradient(135deg, #3fad0a 0%, #5cb82d 100%); transform: translateY(-1px); }
                .btn-clear.success { background: linear-gradient(135deg, #52c41a 0%, #73d13d 100%) !important; }

                /* [模块F] GM工具日志模块标签 */
                .ai-log-module-clear { color: #52c41a; font-weight: 600; }

                /* [模块G] 内部回复按钮样式 */
                .btn-reply { background: linear-gradient(135deg, #fa8c16 0%, #ffa940 100%); color: white; }
                .btn-reply:hover { background: linear-gradient(135deg, #d46b08 0%, #e8922d 100%); transform: translateY(-1px); }
                .btn-reply.success { background: linear-gradient(135deg, #fa8c16 0%, #ffa940 100%) !important; }

                /* [模块G] 内部回复日志模块标签 */
                .ai-log-module-reply { color: #fa8c16; font-weight: 600; }

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

            // [模块F] 新增"清除头像"图标区域（第5格，左中位置）
            const zoneClear = document.createElement('div');
            zoneClear.className = 'ai-icon-zone ai-icon-zone-clear';
            zoneClear.innerHTML = '<span class="ai-zone-text">清</span>';
            zoneClear.dataset.zone = 'clear';

            // 组装图标容器（6格 2列×3行：N/M/T/⚡/清/内）
            // 第1行：N（普通）、M（MCGG）
            // 第2行：T（Task）、⚡（展开）
            // 第3行：清（清除头像）、内（内部回复）
            const zoneReply = document.createElement('div');
            zoneReply.className = 'ai-icon-zone ai-icon-zone-reply';
            zoneReply.innerHTML = '<span class="ai-zone-text">内</span>';
            zoneReply.dataset.zone = 'reply';

            this.iconElement.append(zoneNormal, zoneMcgg, zoneTask, zoneExpand, zoneClear, zoneReply);
            this.zones = { normal: zoneNormal, mcgg: zoneMcgg, task: zoneTask, expand: zoneExpand, clear: zoneClear, reply: zoneReply };

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
                        newY = Math.max(0, Math.min(newY, window.innerHeight - 66)); // 图标高度66px（2列×3行）
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

            // 设置位置（第1行：normal/mcgg 提示显示在上方；第2/3行：task/expand/clear 提示显示在下方）
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

            if (typeof msg === 'string') {
                if (moduleTag) {
                    const tagClass = `ai-log-module-${moduleTag}`;
                    logItem.innerHTML = `<span class="${tagClass}">[${moduleTag}]</span> [${time}] ${msg}`;
                } else {
                    logItem.textContent = `[${time}] ${msg}`;
                }
            } else if (msg instanceof HTMLElement) {
                if (moduleTag) {
                    const tagClass = `ai-log-module-${moduleTag}`;
                    const prefix = document.createElement('span');
                    prefix.innerHTML = `<span class="${tagClass}">[${moduleTag}]</span> [${time}] `;
                    logItem.appendChild(prefix);
                } else {
                    const prefix = document.createElement('span');
                    prefix.textContent = `[${time}] `;
                    logItem.appendChild(prefix);
                }
                logItem.appendChild(msg);
            }

            this.logContainer.appendChild(logItem);

            this.logData.push({ time, msg: (typeof msg === 'string' ? msg : 'DOM Element'), type, moduleTag });
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
                success: (msg) => self.addLog(msg, 'success', moduleName),
                custom: (el) => self.addLog(el, 'info', moduleName)
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
                expand: '⚡',
                clear: '清',   // [模块F]
                reply: '内'    // [模块G]
            };
            if (this.zones[zone]) {
                const textEl = this.zones[zone].querySelector('.ai-zone-text');
                if (textEl) {
                    textEl.textContent = defaultTexts[zone] || '';
                }
            }
        }

        // ==================== [模块F] 跨域日志轮询方法 ====================

        /**
         * 启动清除头像跨域日志轮询
         * 从 GM 存储读取 GM 工具页面写入的日志，并显示在主面板
         * @param {string} storageKey - GM存储键名
         */
        startClearAvatarLogPolling(storageKey) {
            if (this.clearAvatarLogPollingTimer) return;
            console.log('[模块F] 启动清除头像跨域日志轮询...');
            this.clearAvatarLogPollingTimer = setInterval(() => {
                this._pollClearAvatarLogs(storageKey);
            }, this.clearAvatarLogPollingInterval);
        }

        /**
         * 停止清除头像跨域日志轮询
         */
        stopClearAvatarLogPolling() {
            if (this.clearAvatarLogPollingTimer) {
                clearInterval(this.clearAvatarLogPollingTimer);
                this.clearAvatarLogPollingTimer = null;
                console.log('[模块F] 清除头像跨域日志轮询已停止');
            }
        }

        /**
         * 内部：轮询读取跨域日志
         * @param {string} storageKey - GM存储键名
         */
        _pollClearAvatarLogs(storageKey) {
            try {
                const rawData = GM_getValue(storageKey, null);
                if (!rawData) return;
                let logData;
                try { logData = typeof rawData === 'string' ? JSON.parse(rawData) : rawData; } catch (e) { return; }
                if (!Array.isArray(logData) || logData.length === 0) return;

                const newLogs = logData.filter(entry => entry.timestamp && entry.timestamp > this.clearAvatarLastLogTimestamp);
                if (newLogs.length === 0) return;

                newLogs.sort((a, b) => a.timestamp - b.timestamp);
                for (const entry of newLogs) {
                    this.addLog('[GM] ' + entry.msg, entry.type || 'info', 'clear');
                }
                this.clearAvatarLastLogTimestamp = newLogs[newLogs.length - 1].timestamp;
            } catch (e) {
                console.error('[模块F] 轮询跨域日志失败:', e);
            }
        }

        /**
         * 重置清除头像跨域日志时间戳（开始新任务时清除旧日志记录）
         */
        resetClearAvatarLogTimestamp() {
            this.clearAvatarLastLogTimestamp = 0;
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

    /**
     * MCGG工单判断配置
     * 集中管理MCGG工单的判断规则，便于后期修改
     */
    const MCGG_CONFIG = {
        patterns: ['【MCGG】'],
        caseSensitive: false
    };

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

        /**
         * 判断标题是否为MCGG工单
         * @param {string} titleValue - 标题文本
         * @param {object} options - 选项 { silent: true/false }
         * @returns {boolean} - 是否为MCGG工单
         *
         * 判断规则（可在MCGG_CONFIG中修改）：
         * - 标题必须包含"【MCGG】"（精确匹配，包含中文方括号）
         * - 仅包含"MCGG"而没有"【MCGG】"不算MCGG工单
         */
        isMCGGTitle(titleValue, options = {}) {
            if (!titleValue) return false;
            const text = MCGG_CONFIG.caseSensitive ? titleValue : titleValue.toLowerCase();
            for (const pattern of MCGG_CONFIG.patterns) {
                const searchPattern = MCGG_CONFIG.caseSensitive ? pattern : pattern.toLowerCase();
                if (text.includes(searchPattern)) {
                    if (!options.silent) {
                        console.log('[MCGG判断] 检测到MCGG标识:', pattern);
                    }
                    return true;
                }
            }
            return false;
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
            translateTimeoutGoogle: 6000, // 恢复谷歌翻译超时时间为 6 秒，国内网络环境下 2 秒确实太短容易误判
            translateTimeoutOther: 6000,
            checkInterval: 500,
            titleRetryDelay: 1000,
            titleMaxWaitTime: 100000,
            internalDescRetryDelay: 3000,
            internalDescMaxRetries: 5,
            removeTrailingPunctuation: true,
            debug: true,
            fullServerLists: ["【2.1.40全服】：", "【2.1.18全服】：", "【40.2全服】：", "【18.2全服】："],
            testServerLists: ["【40.2测服】：", "【2.1.52测服】：", "【1.9.88测服】：", "【2.1.50测服】："],
            fullServer: "【2.1.60全服】：",
            testServer: "【2.1.64测服】：",
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

        let focusinHandler = null;

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
                // 更换为更稳定的国内可访问节点
                const googleDomains = [
                    'translate.googleapis.com',
                    'translate.google.com'
                ];

                // 尝试第一个域名
                GM_xmlhttpRequest({
                    method: 'GET',
                    url: `https://${googleDomains[0]}/translate_a/single?client=gtx&sl=auto&tl=zh-CN&dt=t&q=${encodeURIComponent(text)}`,
                    timeout: CONFIG.translateTimeoutGoogle, // 恢复合理的超时时间
                    onload: (response) => {
                        try {
                            const result = JSON.parse(response.responseText);
                            if (result && result[0] && result[0][0] && result[0][0][0]) {
                                resolve(result[0][0][0]);
                            } else {
                                reject(new Error('Google API format error'));
                            }
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
                    timeout: CONFIG.translateTimeoutOther,
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

        function translateViaPopcat(text) {
            return new Promise((resolve, reject) => {
                // 自动检测目标语言，如果是英文原文则翻译为中文
                // Popcat 接口很简单，我们尝试强制指定源语言（虽然它可能不完全支持）或者直接只传目标语言
                GM_xmlhttpRequest({
                    method: 'GET',
                    // Popcat 不支持自动检测英文转中文，如果原文是英文，它可能报错
                    // 我们尝试使用更通用的 API 参数，或者如果 Popcat 确实太弱，就只能接受它的局限性
                    // 这里我们尝试将 text 参数进行更严格的编码，并增加错误处理
                    url: 'https://api.popcat.xyz/translate?to=zh&text=' + encodeURIComponent(text),
                    timeout: CONFIG.translateTimeoutOther,
                    onload: (response) => {
                        try {
                            const result = JSON.parse(response.responseText);
                            if (result.translated) {
                                if (result.translated.includes('is not supported')) {
                                    reject(new Error('Language not supported by Popcat'));
                                } else {
                                    resolve(result.translated);
                                }
                            } else if (result.error) {
                                reject(new Error('Popcat error: ' + result.error));
                            } else {
                                reject(new Error('Popcat unknown error'));
                            }
                        } catch (e) {
                            reject(e);
                        }
                    },
                    onerror: reject,
                    ontimeout: reject
                });
            });
        }

        // DeepLX (Mirror) 经常不稳定，我们尝试增加另一个备用镜像或优化错误提示
        function translateViaDeepLX_Mirror(text) {
            return new Promise((resolve, reject) => {
                // 尝试另一个更稳定的 DeepLX 公共实例（如果可用），或者保留当前但优化错误处理
                // 目前 api.deeplx.fun 是比较知名的，如果它报错，可能是请求频率过高或暂不可用
                // 我们尝试切换到另一个公共镜像（如果有的话），或者保留当前并建议用户稍后重试

                // 备用镜像列表
                const mirrors = [
                    'https://api.deeplx.fun/translate',
                    'https://api.deeplx.org/translate' // 官方接口，虽然有时被墙但值得作为备选
                ];

                let currentMirror = 0;

                function tryNext() {
                    if (currentMirror >= mirrors.length) {
                        reject(new Error('All DeepLX mirrors failed'));
                        return;
                    }

                    const url = mirrors[currentMirror];
                    GM_xmlhttpRequest({
                        method: 'POST',
                        url: url,
                        headers: { 'Content-Type': 'application/json' },
                        data: JSON.stringify({ text: text, source_lang: 'auto', target_lang: 'ZH' }),
                        timeout: CONFIG.translateTimeoutOther,
                        onload: (response) => {
                            try {
                                const result = JSON.parse(response.responseText);
                                if (result.code === 200 && result.data) {
                                    resolve(result.data);
                                } else {
                                    // 当前镜像失败，尝试下一个
                                    currentMirror++;
                                    tryNext();
                                }
                            } catch (e) {
                                currentMirror++;
                                tryNext();
                            }
                        },
                        onerror: () => {
                            currentMirror++;
                            tryNext();
                        },
                        ontimeout: () => {
                            currentMirror++;
                            tryNext();
                        }
                    });
                }

                tryNext();
            });
        }

        function translateViaMicrosoft(text) {
            return new Promise((resolve, reject) => {
                // Microsoft Edge Translator API (Unofficial, No Key Required)
                const url = 'https://api-edge.cognitive.microsofttranslator.com/translate?from=&to=zh-Hans&api-version=3.0&includeSentenceLength=true';
                GM_xmlhttpRequest({
                    method: 'POST',
                    url: url,
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': 'Bearer', // Edge API sometimes works without bearer or with a dummy one
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0'
                    },
                    data: JSON.stringify([{ "Text": text }]),
                    timeout: CONFIG.translateTimeoutOther,
                    onload: (response) => {
                        try {
                            const result = JSON.parse(response.responseText);
                            if (result && result[0] && result[0].translations && result[0].translations[0]) {
                                resolve(result[0].translations[0].text);
                            } else {
                                reject(new Error('Microsoft API format error'));
                            }
                        } catch (e) {
                            reject(e);
                        }
                    },
                    onerror: reject,
                    ontimeout: reject
                });
            });
        }

        function translateViaGLM4Flash(text) {
            return new Promise((resolve, reject) => {
                let apiKey = GM_getValue('glm_api_key_v1', '');
                // 默认使用官方推荐的速度优先模型 glm-4-flash-250414
                let modelVersion = GM_getValue('glm_model_version_v1', 'glm-4-flash-250414');

                if (!apiKey) {
                    return reject(new Error('未配置智谱API Key (请在油猴菜单中设置)'));
                }

                GM_xmlhttpRequest({
                    method: 'POST',
                    url: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${apiKey}`
                    },
                    data: JSON.stringify({
                        model: modelVersion,
                        messages: [
                            { role: "system", content: "你是一个专业翻译引擎。用户会给出原文和目标语言，你只输出译文，不要解释，不要添加额外内容。" },
                            { role: "user", content: `请将下面文本翻译成中文：\n\n"${text}"` }
                        ],
                        temperature: 0.3,
                        max_tokens: 512
                    }),
                    timeout: CONFIG.translateTimeoutOther,
                    onload: (response) => {
                        try {
                            const result = JSON.parse(response.responseText);
                            if (result.error) {
                                reject(new Error(result.error.message || 'GLM API error'));
                            } else if (result.choices && result.choices[0] && result.choices[0].message) {
                                let content = result.choices[0].message.content.trim();
                                // 去除可能存在的首尾引号（包括中文和英文引号）
                                content = content.replace(/^["“'‘]+|["”'’]+$/g, '');
                                resolve(content);
                            } else {
                                reject(new Error('GLM API format error'));
                            }
                        } catch (e) {
                            reject(e);
                        }
                    },
                    onerror: reject,
                    ontimeout: reject
                });
            });
        }

        function renderTranslationLogPanel(originalText, results) {
            if (!UI) return;

            const container = document.createElement('div');
            container.style.cssText = 'margin-top: 6px; padding: 8px; background: #fff; border-radius: 6px; border: 1px solid #e8e8e8; box-shadow: 0 2px 8px rgba(0,0,0,0.04);';

            const origDiv = document.createElement('div');
            origDiv.style.cssText = 'font-size: 11px; color: #86868b; margin-bottom: 8px; word-break: break-all; border-bottom: 1px dashed #f0f0f0; padding-bottom: 4px;';
            origDiv.textContent = `原文: ${originalText}`;
            container.appendChild(origDiv);

            const resultsDiv = document.createElement('div');
            resultsDiv.style.cssText = 'display: flex; flex-direction: column; gap: 6px; margin-bottom: 10px;';

            let selectedText = '';
            const editInput = document.createElement('input');

            // 优先选择第一个成功的结果
            const firstSuccess = results.find(r => r.success);
            if (firstSuccess) {
                selectedText = firstSuccess.text;
            }

            results.forEach((r, idx) => {
                const row = document.createElement('div');
                row.style.cssText = 'display: flex; align-items: center; gap: 6px; margin-bottom: 4px;';

                const label = document.createElement('span');
                label.style.cssText = 'font-weight: 600; color: #3370ff; width: 75px; flex-shrink: 0; font-size: 10px; text-align: right;';
                label.textContent = r.name + ':';

                if (r.success) {
                    const radio = document.createElement('input');
                    radio.type = 'radio';
                    radio.name = `trans_${Date.now()}`;
                    radio.value = r.text;
                    // 如果是第一个成功的，默认选中
                    radio.checked = (r === firstSuccess);
                    radio.style.margin = '0';
                    radio.onchange = () => { selectedText = r.text; editInput.value = r.text; };

                    const textSpan = document.createElement('span');
                    textSpan.style.cssText = 'flex: 1; word-break: break-all; cursor: pointer; font-size: 11px; color: #1d1d1f;';
                    textSpan.textContent = r.text;
                    textSpan.onclick = () => { radio.checked = true; radio.onchange(); };

                    const copyBtn = document.createElement('button');
                    copyBtn.textContent = '复制';
                    copyBtn.style.cssText = 'padding: 2px 6px; font-size: 10px; border-radius: 4px; border: 1px solid #d9d9d9; background: #f5f5f7; cursor: pointer; color: #1d1d1f;';
                    copyBtn.onclick = () => {
                        navigator.clipboard.writeText(r.text);
                        const oldText = copyBtn.textContent;
                        copyBtn.textContent = '已复制';
                        copyBtn.style.background = '#e6f7ff';
                        copyBtn.style.borderColor = '#91d5ff';
                        copyBtn.style.color = '#1890ff';
                        setTimeout(() => {
                            copyBtn.textContent = oldText;
                            copyBtn.style.background = '#f5f5f7';
                            copyBtn.style.borderColor = '#d9d9d9';
                            copyBtn.style.color = '#1d1d1f';
                        }, 1000);
                    };

                    row.appendChild(radio);
                    row.appendChild(label);
                    row.appendChild(textSpan);
                    row.appendChild(copyBtn);
                } else {
                    // 失败状态显示
                    const errorSpan = document.createElement('span');
                    errorSpan.style.cssText = 'flex: 1; font-size: 10px; color: #ff4d4f; font-style: italic;';
                    errorSpan.textContent = `失败: ${r.error || 'unknown error'}`;

                    row.appendChild(document.createElement('span')); // 占位 radio
                    row.children[0].style.width = '13px'; // 保持对齐
                    row.children[0].style.display = 'inline-block';

                    row.appendChild(label);
                    row.appendChild(errorSpan);
                }
                resultsDiv.appendChild(row);
            });
            container.appendChild(resultsDiv);

            const editRow = document.createElement('div');
            editRow.style.cssText = 'display: flex; gap: 6px; align-items: center; border-top: 1px solid #f0f0f0; padding-top: 8px;';

            editInput.type = 'text';
            editInput.value = selectedText;
            editInput.style.cssText = 'flex: 1; padding: 4px 8px; border: 1px solid #d9d9d9; border-radius: 4px; font-size: 11px; outline: none;';
            editInput.onfocus = () => editInput.style.borderColor = '#3370ff';
            editInput.onblur = () => editInput.style.borderColor = '#d9d9d9';

            const replaceBtn = document.createElement('button');
            replaceBtn.textContent = '修改并替换标题';
            replaceBtn.style.cssText = 'padding: 4px 10px; background: #3370ff; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 11px; font-weight: 500; transition: background 0.2s;';
            replaceBtn.onmouseover = () => replaceBtn.style.background = '#285acc';
            replaceBtn.onmouseout = () => replaceBtn.style.background = '#3370ff';

            replaceBtn.onclick = () => {
                const input = SharedUtils.findTitleInputRobust();
                if (input) {
                    let newTitle = state.leftHeading + editInput.value.trim() + ' ' + originalText;

                    const success = SharedUtils.simulateInputValue(input, newTitle);
                    if (success) {
                        const oldText = replaceBtn.textContent;
                        replaceBtn.textContent = '替换成功!';
                        replaceBtn.style.background = '#52c41a';
                        setTimeout(() => {
                            replaceBtn.textContent = oldText;
                            replaceBtn.style.background = '#3370ff';
                        }, 1500);
                    } else {
                        replaceBtn.textContent = '替换失败';
                        replaceBtn.style.background = '#ff4d4f';
                    }
                } else {
                    alert('未找到标题输入框');
                }
            };

            editRow.appendChild(editInput);
            editRow.appendChild(replaceBtn);
            container.appendChild(editRow);

            logger.custom(container);
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
                { name: 'Google', fn: translateViaGoogle, timeout: CONFIG.translateTimeoutGoogle },
                { name: 'MyMemory', fn: translateViaMyMemory, timeout: CONFIG.translateTimeoutOther },
                { name: '智谱AI', fn: translateViaGLM4Flash, timeout: CONFIG.translateTimeoutOther }
            ];

            const promises = translators.map(t => {
                return new Promise((resolve) => {
                    const timer = setTimeout(() => resolve({ name: t.name, success: false, error: 'timeout' }), t.timeout);
                    t.fn(text).then(res => {
                        clearTimeout(timer);
                        resolve({ name: t.name, success: true, text: res });
                    }).catch(err => {
                        clearTimeout(timer);
                        resolve({ name: t.name, success: false, error: err.message });
                    });
                });
            });

            let fastestResult = null;

            const firstSuccessPromise = new Promise((resolve) => {
                let pending = promises.length;
                promises.forEach(p => {
                    p.then(r => {
                        if (r.success && !fastestResult) {
                            fastestResult = r.text;
                            resolve(r.text);
                        }
                        pending--;
                        if (pending === 0 && !fastestResult) {
                            resolve(null);
                        }
                    });
                });
            });

            // 等待最快结果返回后，延迟 2秒 再显示交互面板（总共等待时间缩短）
            Promise.all(promises).then(async (allResults) => {
                // 如果已经有最快结果被使用了，这里我们稍作等待再渲染面板
                if (fastestResult) {
                    await new Promise(resolve => setTimeout(resolve, 2000));
                }

                const successful = allResults.filter(r => r.success && r.text && r.text !== text);

                if (successful.length > 0) {
                    state.translateCount++;

                    // 构建面板数据：包含成功的结果和失败的错误信息
                    const panelData = [];
                    const seen = new Set();

                    // 先加入成功的
                    for (const r of successful) {
                        let cleanText = r.text;
                        if (CONFIG.removeTrailingPunctuation) {
                            cleanText = cleanText.replace(/[。.!?！？]+$/, '');
                        }
                        // 额外清洗引号
                        cleanText = cleanText.replace(/^["“'‘]+|["”'’]+$/g, '');

                        if (!seen.has(cleanText)) {
                            seen.add(cleanText);
                            panelData.push({ name: r.name, success: true, text: cleanText });
                        } else {
                            // 如果结果重复，但也记录一下来源名（可选，为了简洁这里合并）
                            // 也可以选择 r.name + '(同上)'
                        }
                    }

                    // 再加入失败的（可选，如果用户想看）
                    const failed = allResults.filter(r => !r.success);
                    for (const r of failed) {
                        panelData.push({ name: r.name, success: false, error: r.error });
                    }

                    if (panelData.length > 0) {
                        log('生成多源翻译交互面板');
                        renderTranslationLogPanel(text, panelData);
                    }
                } else {
                    log('所有翻译源均失败或未返回有效结果');
                }
            });

            const bestText = await firstSuccessPromise;

            if (bestText) {
                let cleanBest = bestText;
                if (CONFIG.removeTrailingPunctuation) {
                    cleanBest = cleanBest.replace(/[。.!?！？]+$/, '');
                }
                return cleanBest;
            }
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

                        if (SharedUtils.isMCGGTitle(currentValue)) {
                            log('检测到【MCGG】标识，普通工单模块跳过，应由MCGG模块处理');
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

                            if (SharedUtils.isMCGGTitle(prefixPart)) {
                                log('标题包含【MCGG】，不处理');
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

            focusinHandler = async (e) => {
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
            };

            document.addEventListener('focusin', focusinHandler, true);
            state.focusListenersAttached = true;
            log('✓ 普通工单焦点监听器已设置');
        }

        function removeFocusListener() {
            if (focusinHandler) {
                document.removeEventListener('focusin', focusinHandler, true);
                focusinHandler = null;
            }
            state.focusListenersAttached = false;
        }

        function resetState() {
            removeFocusListener();
            state.hasProcessedTitle = false;
            state.channelFilled = false;
            state.iterationFilled = false;
            state.copiedText = '';
            state.leftHeading = '';
            state.versionNumber = '';
            state.channelText = '';
            state.faxiandiedai = '';
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

                let isExpandedBtn = element && element.tagName === 'BUTTON';
                if (isExpandedBtn) {
                    const originalText = element.textContent;
                    element.textContent = '已复制！';
                    element.classList.add('success');
                    setTimeout(() => {
                        element.textContent = originalText;
                        element.classList.remove('success');
                    }, 1500);
                }
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

            // 注册菜单命令：设置智谱 API Key
            // 这样用户可以随时更改 Key，而不需要修改代码
            GM_registerMenuCommand('设置智谱AI 翻译 API Key', () => {
                const currentKey = GM_getValue('glm_api_key_v1', '');
                const newKey = prompt('请输入智谱 API Key (永久免费，获取方式见智谱官网 open.bigmodel.cn):', currentKey);
                if (newKey !== null) {
                    GM_setValue('glm_api_key_v1', newKey.trim());
                    alert('API Key 已保存！下次翻译时生效。');
                }
            });

            // 注册菜单命令：选择智谱AI 翻译模型
            GM_registerMenuCommand('选择智谱AI 翻译模型', () => {
                const currentModel = GM_getValue('glm_model_version_v1', 'glm-4-flash-250414');
                const models = [
                    'glm-4-flash-250414',
                    'glm-4-flash',
                    'glm-4.7-flash',
                    'glm-4.6v-flash',
                    'glm-4.1v-thinking-flash',
                    'glm-4v-flash',
                    'cogview-3-flash',
                    'cogvideox-flash'
                ];

                let promptText = `当前模型: ${currentModel}\n请选择并输入模型名称 (输入数字序号或直接输入模型名):\n`;
                models.forEach((m, i) => promptText += `${i + 1}. ${m}${i === 0 ? ' (推荐:速度优先)' : ''}${i === 2 ? ' (推荐:质量优先)' : ''}\n`);

                const input = prompt(promptText, currentModel);
                if (input !== null) {
                    const trimmed = input.trim().toLowerCase();
                    let selectedModel = trimmed;

                    // 如果输入的是数字
                    if (/^\d+$/.test(trimmed)) {
                        const index = parseInt(trimmed) - 1;
                        if (index >= 0 && index < models.length) {
                            selectedModel = models[index];
                        }
                    }

                    GM_setValue('glm_model_version_v1', selectedModel);
                    alert(`模型已更新为: ${selectedModel}`);
                }
            });
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

        let mcggFocusinHandler = null;

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
            return SharedUtils.isMCGGTitle(titleValue, options);
        }

        function resetState() {
            removeMCGGFocusListener();
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

            mcggFocusinHandler = async (e) => {
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
            };

            document.addEventListener('focusin', mcggFocusinHandler, true);
            state.focusListenersAttached = true;
            log('MCGG 焦点监听器已设置', 'success');
        }

        function removeMCGGFocusListener() {
            if (mcggFocusinHandler) {
                document.removeEventListener('focusin', mcggFocusinHandler, true);
                mcggFocusinHandler = null;
            }
            state.focusListenersAttached = false;
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

                let isExpandedBtn = element && element.tagName === 'BUTTON';
                if (isExpandedBtn) {
                    const originalText = element.textContent;
                    element.textContent = '已复制！';
                    element.classList.add('success');
                    setTimeout(() => {
                        element.textContent = originalText;
                        element.classList.remove('success');
                    }, 1500);
                }
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

            let isExpandedBtn = element && element.tagName === 'BUTTON';
            let originalText = isExpandedBtn ? element.textContent : '';
            if (isExpandedBtn) {
                element.textContent = '提取中...';
                element.style.opacity = '0.7';
            }

            try {
                const taskInfo = await retryTaskExtraction();
                const finalUrl = taskInfo.url || window.location.href;
                const finalAgentName = taskInfo.agentName;
                const finalPrefix = taskInfo.agentPrefix;

                if (!finalAgentName) {
                    UI.setZoneText('task', '?');
                    if (isExpandedBtn) {
                        element.textContent = '未找到客服信息';
                        element.style.opacity = '1';
                    }
                    setTimeout(() => {
                        UI.resetZoneText('task');
                        UI.showZoneProcessing('task', false);
                        if (isExpandedBtn) {
                            element.textContent = originalText;
                        }
                    }, 1500);
                } else {
                    const copyText = finalUrl + ' @' + finalAgentName;
                    GM_setClipboard(copyText);
                    UI.showZoneSuccess('task');
                    log('Task信息已复制: ' + copyText);
                    UI.setZoneText('task', finalPrefix || 'OK');

                    if (isExpandedBtn) {
                        element.textContent = (finalPrefix || 'OK') + ' 已复制';
                        element.classList.add('success');
                        element.style.opacity = '1';
                    }

                    setTimeout(() => {
                        UI.resetZoneText('task');
                        UI.showZoneProcessing('task', false);
                        if (isExpandedBtn) {
                            element.textContent = originalText;
                            element.classList.remove('success');
                        }
                    }, 1500);
                }
            } catch (e) {
                UI.setZoneText('task', 'X');
                if (isExpandedBtn) {
                    element.textContent = '提取失败';
                    element.style.opacity = '1';
                }
                setTimeout(() => {
                    UI.resetZoneText('task');
                    UI.showZoneProcessing('task', false);
                    if (isExpandedBtn) {
                        element.textContent = originalText;
                    }
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

    // =========================================================================
    // 模块 D：提交后自动回复 "already submitted"（完全独立）
    // 功能：监听"确定"按钮状态变化，自动点击"内部回复"并填充固定文本
    // =========================================================================
    (function() {
        'use strict';

        // 简单的URL检查：如果URL包含ticket，直接跳过
        const currentUrl = window.location.href;
        if (currentUrl.includes('ticket')) {
            console.log('[自动回复模块] URL包含ticket，跳过模块加载');
            return;
        }

        if (!shouldRunNormalModule()) return;

        const AUTO_REPLY_CONFIG = {
            debug: true,
            replyText: 'already submitted',
            dialogLoadDelay: 1500,
            dialogLoadDelayMax: 2000,
            elementFindTimeout: 5000,
            checkInterval: 500,
            debounceDelay: 300
        };

        const autoReplyState = {
            isProcessing: false,
            confirmButtonObserver: null,
            lastProcessTime: 0,
            currentTicketID: null,
            hasTriggered: false
        };

        const autoReplyLogger = UI ? UI.createLogChannel('autoReply') : {
            log: console.log,
            error: console.error,
            warn: console.warn,
            success: console.log
        };

        function autoReplyLog(...args) {
            if (AUTO_REPLY_CONFIG.debug) {
                const msg = args.join(' ');
                console.log('[自动回复模块]', ...args);
                autoReplyLogger.log(msg);
            }
        }

        function autoReplyLogError(...args) {
            const msg = args.join(' ');
            console.error('[自动回复模块 错误]', ...args);
            autoReplyLogger.error(msg);
        }

        function autoReplyLogSuccess(...args) {
            const msg = args.join(' ');
            console.log('[自动回复模块]', ...args);
            autoReplyLogger.success(msg);
        }

        function autoReplyLogWarn(...args) {
            const msg = args.join(' ');
            console.warn('[自动回复模块 警告]', ...args);
            autoReplyLogger.warn(msg);
        }

        function waitForElement(selector, options = {}) {
            const {
                timeout = AUTO_REPLY_CONFIG.elementFindTimeout,
                condition = null,
                parent = document.body
            } = options;

            return new Promise((resolve) => {
                const startTime = Date.now();

                const check = () => {
                    const elements = parent.querySelectorAll(selector);
                    for (const el of elements) {
                        if (condition ? condition(el) : SharedUtils.isInputAvailable(el)) {
                            resolve(el);
                            return;
                        }
                    }

                    if (Date.now() - startTime < timeout) {
                        setTimeout(check, 100);
                    } else {
                        resolve(null);
                    }
                };

                check();
            });
        }

        function waitForElementWithObserver(selector, options = {}) {
            const {
                timeout = AUTO_REPLY_CONFIG.elementFindTimeout,
                condition = null,
                parent = document.body
            } = options;

            return new Promise((resolve) => {
                const startTime = Date.now();
                let observer = null;
                let timeoutId = null;

                const cleanup = () => {
                    if (observer) {
                        observer.disconnect();
                        observer = null;
                    }
                    if (timeoutId) {
                        clearTimeout(timeoutId);
                        timeoutId = null;
                    }
                };

                const check = () => {
                    const elements = parent.querySelectorAll(selector);
                    for (const el of elements) {
                        if (condition ? condition(el) : SharedUtils.isInputAvailable(el)) {
                            cleanup();
                            resolve(el);
                            return true;
                        }
                    }
                    return false;
                };

                if (check()) return;

                observer = new MutationObserver(() => {
                    if (check()) return;

                    if (Date.now() - startTime >= timeout) {
                        cleanup();
                        resolve(null);
                    }
                });

                observer.observe(parent, {
                    childList: true,
                    subtree: true,
                    attributes: true,
                    attributeFilter: ['style', 'class', 'disabled']
                });

                timeoutId = setTimeout(() => {
                    cleanup();
                    resolve(null);
                }, timeout);
            });
        }

        async function safeClick(element, description = '') {
            if (!element) {
                autoReplyLogWarn(`safeClick: 元素不存在 ${description}`);
                return false;
            }

            try {
                if (element.disabled) {
                    autoReplyLogWarn(`safeClick: 元素已禁用 ${description}`);
                    return false;
                }

                element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                await new Promise(resolve => setTimeout(resolve, 100));

                element.click();
                autoReplyLog(`safeClick: 点击成功 ${description}`);
                return true;
            } catch (e) {
                autoReplyLogError(`safeClick: 点击失败 ${description}`, e.message);
                return false;
            }
        }

        function findInternalReplyButton() {
            const selectors = [
                'button:has(.el-icon-chat-dot-round)',
                'button:has(.el-icon-chat-line-round)',
                'button:has(.el-icon-chat-square)',
                '.internal-reply-btn',
                '[class*="internal-reply"]',
                '[class*="InternalReply"]'
            ];

            for (const selector of selectors) {
                try {
                    const buttons = document.querySelectorAll('button');
                    for (const btn of buttons) {
                        const text = (btn.textContent || '').trim();
                        if (text.includes('内部回复') || text.includes('内部备注')) {
                            return btn;
                        }
                    }
                } catch (e) {
                    continue;
                }
            }

            const allButtons = document.querySelectorAll('button');
            for (const btn of allButtons) {
                const text = (btn.textContent || '').trim();
                if (text.includes('内部回复') || text.includes('内部备注')) {
                    return btn;
                }
            }

            return null;
        }

        function findReplyTextarea(dialog) {
            if (!dialog) return null;

            const selectors = [
                'textarea.el-textarea__inner',
                'textarea[placeholder*="工单回复"]',
                'textarea[placeholder*="回复"]',
                'textarea[placeholder*="内部"]',
                '.ql-editor[contenteditable="true"]',
                'div[contenteditable="true"]',
                'textarea'
            ];

            for (const selector of selectors) {
                const textarea = dialog.querySelector(selector);
                if (textarea && SharedUtils.isInputAvailable(textarea)) {
                    return textarea;
                }
            }

            return null;
        }

        function findReplyDialog() {
            const selectors = [
                '.el-dialog:has(textarea)',
                '.el-dialog:has(.ql-editor)',
                '.el-dialog:has([contenteditable="true"])',
                '.el-dialog__wrapper:has(textarea)',
                '[class*="reply-dialog"]',
                '[class*="ReplyDialog"]'
            ];

            for (const selector of selectors) {
                try {
                    const dialogs = document.querySelectorAll('.el-dialog, .el-dialog__wrapper');
                    for (const dialog of dialogs) {
                        const style = window.getComputedStyle(dialog);
                        if (style.display !== 'none' && style.visibility !== 'hidden') {
                            const textarea = findReplyTextarea(dialog);
                            if (textarea) {
                                return dialog;
                            }
                        }
                    }
                } catch (e) {
                    continue;
                }
            }

            return null;
        }

        async function fillTextarea(textarea, text) {
            if (!textarea) {
                autoReplyLogWarn('fillTextarea: 文本框不存在');
                return false;
            }

            try {
                autoReplyLog('fillTextarea: 元素类型', textarea.tagName, 'nodeName', textarea.nodeName);

                textarea.focus();
                await new Promise(resolve => setTimeout(resolve, 100));

                if (textarea.tagName === 'TEXTAREA' || textarea.tagName === 'INPUT') {
                    const nativeSetter = Object.getOwnPropertyDescriptor(
                        window.HTMLTextAreaElement.prototype || window.HTMLInputElement.prototype,
                        'value'
                    ).set;
                    nativeSetter.call(textarea, text);
                    textarea.dispatchEvent(new Event('input', { bubbles: true }));
                    textarea.dispatchEvent(new Event('change', { bubbles: true }));
                } else if (textarea.tagName === 'BODY' || textarea.contentEditable === 'true') {
                    textarea.innerHTML = '<p>' + text + '</p>';
                    textarea.focus();

                    const inputEvent = new InputEvent('input', {
                        bubbles: true,
                        cancelable: true,
                        data: text,
                        inputType: 'insertText'
                    });
                    textarea.dispatchEvent(inputEvent);

                    const keydownEvent = new KeyboardEvent('keydown', { bubbles: true });
                    textarea.dispatchEvent(keydownEvent);
                    const keyupEvent = new KeyboardEvent('keyup', { bubbles: true });
                    textarea.dispatchEvent(keyupEvent);
                } else {
                    textarea.textContent = text;
                    textarea.dispatchEvent(new Event('input', { bubbles: true }));
                }

                autoReplyLogSuccess(`fillTextarea: 填充成功 "${text}"`);
                return true;
            } catch (e) {
                autoReplyLogError('fillTextarea: 填充失败', e.message);
                return false;
            }
        }

        async function executeAutoReply() {
            if (autoReplyState.isProcessing) {
                autoReplyLog('已在处理中，跳过');
                return;
            }

            const now = Date.now();
            if (now - autoReplyState.lastProcessTime < AUTO_REPLY_CONFIG.debounceDelay) {
                autoReplyLog('防抖间隔内，跳过');
                return;
            }

            autoReplyState.isProcessing = true;
            autoReplyState.lastProcessTime = now;

            autoReplyLog('========== 开始执行自动回复流程 ==========');

            try {
                const delay = AUTO_REPLY_CONFIG.dialogLoadDelay +
                    Math.random() * (AUTO_REPLY_CONFIG.dialogLoadDelayMax - AUTO_REPLY_CONFIG.dialogLoadDelay);

                autoReplyLog(`等待 ${(delay/1000).toFixed(1)} 秒让对话框加载...`);
                await new Promise(resolve => setTimeout(resolve, delay));

                autoReplyLog('查找"内部回复"按钮...');
                const internalReplyBtn = await waitForElementWithObserver('button', {
                    timeout: AUTO_REPLY_CONFIG.elementFindTimeout,
                    condition: (el) => {
                        const text = (el.textContent || '').trim();
                        return text.includes('内部回复') || text.includes('内部备注');
                    }
                });

                if (!internalReplyBtn) {
                    autoReplyLogWarn('未找到"内部回复"按钮，流程终止');
                    autoReplyState.isProcessing = false;
                    return;
                }

                autoReplyLog('找到"内部回复"按钮，准备点击...');
                const clickSuccess = await safeClick(internalReplyBtn, '"内部回复"按钮');

                if (!clickSuccess) {
                    autoReplyLogWarn('点击"内部回复"按钮失败，流程终止');
                    autoReplyState.isProcessing = false;
                    return;
                }

                autoReplyLog('等待回复对话框加载...');
                await new Promise(resolve => setTimeout(resolve, 1500));

                let dialog = null;
                let attempts = 0;
                const maxAttempts = 10;

                while (!dialog && attempts < maxAttempts) {
                    attempts++;
                    const allDialogs = document.querySelectorAll('.el-dialog, .el-dialog__wrapper, [class*="dialog"], [class*="modal"]');

                    for (const d of allDialogs) {
                        const style = window.getComputedStyle(d);
                        if (style.display !== 'none' && style.visibility !== 'hidden') {
                            const text = d.textContent || '';
                            if (text.includes('工单回复') || text.includes('内部回复') || text.includes('内部备注')) {
                                dialog = d;
                                autoReplyLog('找到"内部回复"对话框');
                                break;
                            }
                        }
                    }

                    if (!dialog) {
                        autoReplyLog('第', attempts, '次尝试未找到对话框，等待中...');
                        await new Promise(resolve => setTimeout(resolve, 500));
                    }
                }

                if (!dialog) {
                    autoReplyLogWarn('未找到"内部回复"对话框，流程终止');
                    autoReplyState.isProcessing = false;
                    return;
                }

                autoReplyLog('对话框内容预览:', dialog.textContent.slice(0, 100));

                autoReplyLog('查找工单回复文本框...');

                let textarea = null;
                let textareaAttempts = 0;
                const maxTextareaAttempts = 10;

                while (!textarea && textareaAttempts < maxTextareaAttempts) {
                    textareaAttempts++;
                    autoReplyLog('第', textareaAttempts, '次尝试查找文本框...');

                    await new Promise(resolve => setTimeout(resolve, 300));

                    const iframe = dialog.querySelector('iframe.tox-edit-area__iframe, iframe[class*="edit-area"]');
                    if (iframe) {
                        autoReplyLog('找到TinyMCE iframe，尝试访问内部文档...');
                        try {
                            const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
                            if (iframeDoc && iframeDoc.body) {
                                textarea = iframeDoc.body;
                                autoReplyLog('找到iframe内的body元素');
                                break;
                            }
                        } catch (e) {
                            autoReplyLog('无法访问iframe内容:', e.message);
                        }
                    }

                    if (!textarea) {
                        const allElements = dialog.querySelectorAll('*');
                        for (const el of allElements) {
                            if (el.contentEditable === 'true') {
                                textarea = el;
                                autoReplyLog('找到contentEditable元素:', el.tagName, el.className);
                                break;
                            }
                        }
                    }

                    if (!textarea) {
                        const allElements = dialog.querySelectorAll('*');
                        for (const el of allElements) {
                            if (el.tagName === 'TEXTAREA') {
                                textarea = el;
                                autoReplyLog('找到TEXTAREA元素:', el.className);
                                break;
                            }
                        }
                    }
                }

                if (!textarea) {
                    autoReplyLogWarn('未找到工单回复文本框，流程终止');
                    autoReplyState.isProcessing = false;
                    return;
                }

                autoReplyLog('找到文本框，先点击激活...');
                try {
                    textarea.click();
                    await new Promise(resolve => setTimeout(resolve, 200));
                    textarea.focus();
                    await new Promise(resolve => setTimeout(resolve, 100));
                } catch (e) {
                    autoReplyLog('点击激活失败，继续尝试填充');
                }

                autoReplyLog('准备填充内容...');
                const fillSuccess = await fillTextarea(textarea, AUTO_REPLY_CONFIG.replyText);

                if (fillSuccess) {
                    autoReplyLogSuccess(`文本填充成功: "${AUTO_REPLY_CONFIG.replyText}"`);

                    autoReplyLog('等待1秒后点击回复按钮...');
                    await new Promise(resolve => setTimeout(resolve, 1000));

                    const replyButtons = dialog.querySelectorAll('button');
                    let replyBtn = null;

                    for (const btn of replyButtons) {
                        const btnText = (btn.textContent || '').trim();
                        if (btnText === '回复') {
                            replyBtn = btn;
                            autoReplyLog('找到"回复"按钮');
                            break;
                        }
                    }

                    if (replyBtn) {
                        const btnClickSuccess = await safeClick(replyBtn, '"回复"按钮');
                        if (btnClickSuccess) {
                            autoReplyLogSuccess('========== 自动回复流程完成 ==========');
                        } else {
                            autoReplyLogWarn('点击"回复"按钮失败');
                        }
                    } else {
                        autoReplyLogWarn('未找到"回复"按钮');
                    }
                } else {
                    autoReplyLogWarn('自动回复填充失败');
                }

            } catch (e) {
                autoReplyLogError('自动回复流程异常:', e.message);
            } finally {
                autoReplyState.isProcessing = false;
            }
        }

        function setupConfirmButtonObserver() {
            document.addEventListener('click', function(e) {
                const target = e.target;
                const clickableEl = target.closest('button, .el-button, [role="button"], span.el-button, a, [class*="btn"], span');

                if (clickableEl) {
                    const el = clickableEl;
                    const elText = (el.textContent || el.innerText || '').trim();
                    const normalizedText = elText.replace(/\s+/g, '');

                    if (normalizedText !== '确认' && normalizedText !== '确定') return;

                    // ===================== 批量处理模式检测 =====================
                    // 检测方式：通过检测"已选择"和"选择全部"文本
                    // 这两个文本只有在用户全选工单进行批量处理时才会同时出现
                    const bodyText = document.body.innerText || '';
                    const hasSelectedText = bodyText.includes('已选择');
                    const hasSelectAllText = bodyText.includes('选择全部');

                    if (hasSelectedText && hasSelectAllText) {
                        autoReplyLog('检测到"已选择"和"选择全部"文本，跳过自动回复（批量处理模式）');
                        return;
                    }

                    // ===================== 批量筛选模式检测 =====================
                    // 检测方式：检测是否存在两个名称为"编辑筛选项"但尺寸不同的按钮
                    // 批量筛选模式下会出现两个"编辑筛选项"按钮，一个大一个小
                    const allButtons = document.querySelectorAll('button, span');
                    const editFilterButtons = [];

                    for (const btn of allButtons) {
                        const btnText = (btn.textContent || '').trim();
                        if (btnText === '编辑筛选项') {
                            const rect = btn.getBoundingClientRect();
                            const style = window.getComputedStyle(btn);
                            if (style.display !== 'none' && style.visibility !== 'hidden') {
                                editFilterButtons.push({
                                    element: btn,
                                    width: rect.width,
                                    height: rect.height
                                });
                            }
                        }
                    }

                    // 如果找到两个"编辑筛选项"按钮，检查它们的尺寸是否不同
                    if (editFilterButtons.length >= 2) {
                        const btn1 = editFilterButtons[0];
                        const btn2 = editFilterButtons[1];
                        // 比较尺寸差异（宽度和高度至少有一个不同）
                        const hasSizeDifference =
                            Math.abs(btn1.width - btn2.width) > 2 ||
                            Math.abs(btn1.height - btn2.height) > 2;

                        if (hasSizeDifference) {
                            autoReplyLog('检测到两个尺寸不同的"编辑筛选项"按钮，跳过自动回复（批量筛选模式）');
                            return;
                        }
                    }

                    autoReplyLog('检测到"确认"按钮点击, 文本:', elText);

                    const ticketID = SharedUtils.getCurrentTicketID();
                    if (!ticketID) {
                        autoReplyLog('未检测到当前工单ID，跳过（可能是批量处理场景）');
                        return;
                    }

                    let foundInternalReply = false;
                    document.querySelectorAll('button').forEach(btn => {
                        const text = (btn.textContent || '').trim();
                        if (text.includes('内部回复') || text.includes('内部备注')) {
                            foundInternalReply = true;
                        }
                    });
                    if (!foundInternalReply) {
                        autoReplyLog('页面上没有"内部回复"按钮，跳过（可能是批量处理场景）');
                        return;
                    }

                    if (autoReplyState.hasTriggered) {
                        autoReplyLog('当前工单已触发过，跳过');
                        return;
                    }

                    autoReplyState.hasTriggered = true;

                    setTimeout(() => {
                        executeAutoReply();
                    }, 500);
                }
            }, true);

            autoReplyLog('已设置全局点击监听器（事件委托模式）');
        }

        function monitorTicketChangeForAutoReply() {
            setInterval(() => {
                const newTicketID = SharedUtils.getCurrentTicketID();
                if (newTicketID && newTicketID !== autoReplyState.currentTicketID) {
                    autoReplyLog('工单切换: ' + (autoReplyState.currentTicketID || '(无)') + ' -> ' + newTicketID);
                    autoReplyState.currentTicketID = newTicketID;
                    autoReplyState.hasTriggered = false;
                    autoReplyState.isProcessing = false;
                }
            }, AUTO_REPLY_CONFIG.checkInterval);
        }

        function initAutoReplyModule() {
            autoReplyLog('========================================');
            autoReplyLog('自动回复模块 v6.3.1 已启动');
            autoReplyLog('调试模式:', AUTO_REPLY_CONFIG.debug);
            autoReplyLog('回复文本:', AUTO_REPLY_CONFIG.replyText);
            autoReplyLog('========================================');

            setupConfirmButtonObserver();
            monitorTicketChangeForAutoReply();

            const ticketID = SharedUtils.getCurrentTicketID();
            if (ticketID) {
                autoReplyState.currentTicketID = ticketID;
                autoReplyLog('检测到工单:', ticketID);
            }
        }

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', initAutoReplyModule);
        } else {
            initAutoReplyModule();
        }
    })();

    // =========================================================================
    // 模块 E-AIHelp端：飞书 Ticket ID 搜索触发器（完全独立）
    //
    // 需求来源：提示词总结和skills2026-2-13\通用提示词模版.md
    // 功能：
    //   - 每次工单ID变化时，从工单内部描述中提取 Ticket ID 值
    //     （匹配格式：Ticket ID= XXXXXX 或 Ticket ID : XXXXXX 等常见写法）
    //   - 将 Ticket ID 写入 GM_setValue，开后台标签页让飞书端模块执行搜索
    //   - 轮询 GM_getValue 获取飞书端的搜索结果，更新日志面板
    //   - 若找到结果：日志面板红色显示；若未找到：普通样式提示
    //   - 若用户未登录飞书：日志面板提示用户登录
    // =========================================================================
    (function() {
        'use strict';

        // 仅在 AIHelp 页面运行（非飞书页面）
        const currentUrl = window.location.href;
        if (currentUrl.includes('feishu.cn')) return;
        if (currentUrl.includes('ticket')) return;
        if (!shouldRunNormalModule()) return;

        // ---- 配置区 ----
        const FEISHU_SEARCH_CONFIG = {
            debug: true,
            // 飞书项目目标页面 URL
            feishuTargetUrl: 'https://project.feishu.cn/ml/workObjectView/onlineissue/Cot68m5vg?scope=workspaces&node=28514456',
            // Ticket ID 提取正则
            // 匹配 "Ticket ID= Y372U8" / "Ticket ID : Y372U8" / "Ticket ID=Y372U8" 等格式
            ticketIdPattern: /Ticket\s*ID\s*[=:：]\s*([A-Za-z0-9_\-]+)/i,
            // 轮询结果的间隔（毫秒）
            pollInterval: 500,
            // 轮询最大等待时间（毫秒），飞书重型应用页面加载慢，留足够时间
            pollMaxWait: 60000,
            // GM_setValue 存储键名（带唯一前缀，避免冲突）
            storageKeyPending: 'feishu_ticket_search_pending_v1',   // AIHelp端写入：待搜索的 Ticket ID
            storageKeyResult: 'feishu_ticket_search_result_v1',      // 飞书端写入：搜索结果
            storageKeyResultTs: 'feishu_ticket_search_result_ts_v1', // 结果时间戳，防止读取旧结果
            checkInterval: 500
        };

        // ---- 状态区 ----
        const feishuSearchState = {
            currentTicketID: null,      // 当前 AIHelp 工单 ID
            lastExtractedId: null,      // 上次提取的 Ticket ID（避免重复搜索）
            pollTimer: null,            // 轮询定时器
            pollStartTime: 0,           // 轮询开始时间
            feishuTabRef: null          // 后台标签页引用
        };

        // ---- 日志通道 ----
        // 注意：此模块的日志使用独立标签 'feishu'
        const feishuLogger = UI ? UI.createLogChannel('feishu') : {
            log: console.log,
            error: console.error,
            warn: console.warn,
            success: console.log
        };

        // 注册飞书模块日志样式（蓝绿色标识，区别其他模块）
        if (UI && UI.logContainer) {
            // 通过 GM_addStyle 补充 feishu 模块标签颜色
            GM_addStyle('.ai-log-module-feishu { color: #13c2c2; font-weight: 600; }');
        }

        function feishuLog(...args) {
            if (FEISHU_SEARCH_CONFIG.debug) {
                const msg = args.join(' ');
                console.log('[飞书搜索]', ...args);
                feishuLogger.log(msg);
            }
        }

        function feishuLogError(...args) {
            const msg = args.join(' ');
            console.error('[飞书搜索 错误]', ...args);
            feishuLogger.error(msg);
        }

        /**
         * 从工单内部描述文本中提取 Ticket ID 值
         * 需求：匹配 "Ticket ID= Y372U8" 格式，提取 "Y372U8"
         * 防御性处理：内部描述可能未加载，返回 null 代表未找到
         * @returns {string|null}
         */
        function extractTicketId() {
            // 从页面文本直接搜索，覆盖内部描述、其他字段
            const bodyText = document.body.innerText || '';
            const match = bodyText.match(FEISHU_SEARCH_CONFIG.ticketIdPattern);
            if (match && match[1]) {
                const id = match[1].trim();
                feishuLog('提取到 Ticket ID:', id);
                return id;
            }
            feishuLog('未在页面文本中找到 Ticket ID');
            return null;
        }

        /**
         * 显示搜索结果到日志面板
         * 需求：找到结果用红色显示，未找到用普通样式
         * @param {string} ticketId - 搜索的 Ticket ID
         * @param {string} status - 'found' | 'notfound' | 'not_logged_in' | 'error' | 'searching'
         * @param {string} [detail] - 额外说明
         */
        function showSearchResultInLog(ticketId, status, detail) {
            if (!UI) return;

            const container = document.createElement('div');
            container.style.cssText = 'margin-top: 4px; padding: 6px 8px; border-radius: 5px; font-size: 11px; line-height: 1.6;';

            if (status === 'found') {
                // 需求：找到结果用红色显示
                container.style.cssText += 'background: #fff1f0; border: 1px solid #ffccc7; color: #cf1322;';
                container.innerHTML = `<strong style="color:#cf1322;">🔴 在飞书项目中搜索到 Ticket ID：${ticketId}</strong>`;
            } else if (status === 'notfound') {
                container.style.cssText += 'background: #f6ffed; border: 1px solid #b7eb8f; color: #389e0d;';
                container.innerHTML = `✅ 未在飞书项目中搜到 Ticket ID：<strong>${ticketId}</strong>`;
            } else if (status === 'not_logged_in') {
                container.style.cssText += 'background: #fffbe6; border: 1px solid #ffe58f; color: #d46b08;';
                container.innerHTML = `⚠️ 飞书未登录，请先<a href="${FEISHU_SEARCH_CONFIG.feishuTargetUrl}" target="_blank" style="color:#d46b08;text-decoration:underline;">登录飞书</a>后重试`;
            } else if (status === 'searching') {
                container.style.cssText += 'background: #e6f4ff; border: 1px solid #91caff; color: #0958d9;';
                container.textContent = `🔍 正在飞书项目中搜索 Ticket ID：${ticketId}...`;
            } else if (status === 'error') {
                container.style.cssText += 'background: #fff2f0; border: 1px solid #ffb3a7; color: #a8071a;';
                container.textContent = `❌ 飞书搜索出错：${detail || '未知错误'}`;
            } else {
                container.textContent = detail || '';
            }

            // 使用日志通道的 custom 方法（支持 HTMLElement）
            if (feishuLogger.custom) {
                feishuLogger.custom(container);
            } else {
                feishuLogger.log(container.textContent);
            }
        }

        /**
         * 停止当前的结果轮询
         */
        function stopPollResult() {
            if (feishuSearchState.pollTimer) {
                clearInterval(feishuSearchState.pollTimer);
                feishuSearchState.pollTimer = null;
            }
        }

        /**
         * 开始轮询 GM_getValue 等待飞书端的搜索结果
         * @param {string} ticketId - 正在搜索的 Ticket ID
         * @param {number} requestTs - 本次搜索请求的时间戳（用于过滤旧结果）
         */
        function startPollResult(ticketId, requestTs) {
            stopPollResult();
            feishuSearchState.pollStartTime = Date.now();

            feishuLog('开始轮询飞书搜索结果，Ticket ID:', ticketId);

            feishuSearchState.pollTimer = setInterval(() => {
                try {
                    const resultTs = GM_getValue(FEISHU_SEARCH_CONFIG.storageKeyResultTs, 0);
                    // 只接受本次请求之后写入的结果，防止读到上次的旧结果
                    if (resultTs < requestTs) {
                        // 检查是否超时
                        if (Date.now() - feishuSearchState.pollStartTime > FEISHU_SEARCH_CONFIG.pollMaxWait) {
                            stopPollResult();
                            feishuLogError('等待飞书搜索结果超时（' + (FEISHU_SEARCH_CONFIG.pollMaxWait / 1000) + '秒）');
                            showSearchResultInLog(ticketId, 'error', '等待超时，请检查飞书标签页是否正常加载');
                        }
                        return;
                    }

                    // 有新结果
                    stopPollResult();
                    const result = GM_getValue(FEISHU_SEARCH_CONFIG.storageKeyResult, null);
                    feishuLog('收到飞书搜索结果:', JSON.stringify(result));

                    if (!result) {
                        showSearchResultInLog(ticketId, 'error', '结果数据为空');
                        return;
                    }

                    if (result.status === 'found') {
                        showSearchResultInLog(ticketId, 'found');
                    } else if (result.status === 'notfound') {
                        showSearchResultInLog(ticketId, 'notfound');
                    } else if (result.status === 'not_logged_in') {
                        showSearchResultInLog(ticketId, 'not_logged_in');
                    } else {
                        showSearchResultInLog(ticketId, 'error', result.detail || '未知状态');
                    }
                } catch (e) {
                    stopPollResult();
                    feishuLogError('轮询结果异常:', e.message);
                }
            }, FEISHU_SEARCH_CONFIG.pollInterval);
        }

        /**
         * 触发飞书搜索：写入待搜索 Ticket ID，打开后台标签页
         * 需求：飞书页面在后台显示，不打扰当前页面操作
         * @param {string} ticketId - 要搜索的 Ticket ID
         */
        function triggerFeishuSearch(ticketId) {
            if (!ticketId) return;

            feishuLog('触发飞书搜索，Ticket ID:', ticketId);

            const requestTs = Date.now();

            // 1. 写入待搜索的 Ticket ID 和时间戳
            GM_setValue(FEISHU_SEARCH_CONFIG.storageKeyPending, {
                ticketId: ticketId,
                requestTs: requestTs
            });

            // 2. 显示"正在搜索"状态
            showSearchResultInLog(ticketId, 'searching');

            // 3. 在后台标签页打开飞书目标页面
            //    需求：不要打扰用户在当前页面的操作
            //    注意：飞书是重型 SPA，复用标签页时【不要 reload】，
            //    飞书端脚本已持续轮询 GM_setValue，直接依赖轮询读取新任务即可。
            //    只有标签页不存在时才打开新标签页（脚本会随页面注入并自动初始化）。
            try {
                let tabExists = false;
                try {
                    tabExists = !!(feishuSearchState.feishuTabRef && !feishuSearchState.feishuTabRef.closed);
                } catch (e) {
                    // 跨域访问 .closed 可能抛 SecurityError，视为标签页不可用
                    tabExists = false;
                }

                if (tabExists) {
                    // 飞书端脚本持续轮询，GM_setValue 已在步骤1写入，飞书端会自动检测到
                    feishuLog('已有飞书标签页在后台运行，等待其轮询到新任务');
                } else {
                    feishuSearchState.feishuTabRef = window.open(
                        FEISHU_SEARCH_CONFIG.feishuTargetUrl,
                        'feishu_ticket_search_tab'  // 指定名称，防止重复开多个标签
                    );
                    feishuLog('已打开飞书后台标签页，等待脚本初始化后执行搜索');
                }
            } catch (e) {
                feishuLogError('打开飞书标签页失败:', e.message);
                showSearchResultInLog(ticketId, 'error', '无法打开飞书页面：' + e.message);
                return;
            }

            // 4. 开始轮询等待结果
            startPollResult(ticketId, requestTs);
        }

        /**
         * 监控工单ID变化，触发 Ticket ID 提取与飞书搜索
         * 与现有模块的工单监控独立运行，互不干扰
         */
        function monitorTicketForFeishuSearch() {
            setInterval(() => {
                try {
                    const newTicketID = SharedUtils.getCurrentTicketID();
                    if (!newTicketID || newTicketID === feishuSearchState.currentTicketID) return;

                    feishuLog('工单切换: ' + (feishuSearchState.currentTicketID || '(无)') + ' -> ' + newTicketID);
                    feishuSearchState.currentTicketID = newTicketID;

                    // 停止上一次的轮询
                    stopPollResult();
                    feishuSearchState.lastExtractedId = null;

                    // 延迟提取（等待内部描述内容加载完毕，参考现有模块延迟策略）
                    setTimeout(() => {
                        const ticketId = extractTicketId();
                        if (!ticketId) {
                            feishuLog('工单 ' + newTicketID + ' 中未找到 Ticket ID，跳过飞书搜索');
                            return;
                        }

                        if (ticketId === feishuSearchState.lastExtractedId) {
                            feishuLog('Ticket ID 未变化，跳过重复搜索:', ticketId);
                            return;
                        }

                        feishuSearchState.lastExtractedId = ticketId;
                        triggerFeishuSearch(ticketId);
                    }, 2000); // 等待 2 秒让内部描述加载完毕
                } catch (e) {
                    feishuLogError('工单监控异常:', e.message);
                }
            }, FEISHU_SEARCH_CONFIG.checkInterval);
        }

        function initFeishuSearchAIHelpModule() {
            feishuLog('========================================');
            feishuLog('飞书 Ticket ID 搜索模块（AIHelp端）v6.6.0 已启动');
            feishuLog('目标飞书页面:', FEISHU_SEARCH_CONFIG.feishuTargetUrl);
            feishuLog('========================================');

            monitorTicketForFeishuSearch();

            // 初始检查：如果当前已有工单，立即尝试提取
            setTimeout(() => {
                const ticketID = SharedUtils.getCurrentTicketID();
                if (ticketID) {
                    feishuSearchState.currentTicketID = ticketID;
                    const ticketId = extractTicketId();
                    if (ticketId) {
                        feishuSearchState.lastExtractedId = ticketId;
                        triggerFeishuSearch(ticketId);
                    }
                }
            }, 1500);
        }

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', initFeishuSearchAIHelpModule);
        } else {
            initFeishuSearchAIHelpModule();
        }
    })();

    // =========================================================================
    // 模块 F-AIHelp端：清除头像冷却时间（在 AIHelp 工单页面运行）
    //
    // 功能：
    //   - 在主脚本状态栏图标新增"清"区域，点击后提取 UID 和 ServerID
    //   - 自动以弹窗方式打开 GM 工具页面执行清除操作
    //   - 通过 GM_setValue 跨域存储传递任务数据给 GM 工具端
    //   - 轮询 GM_getValue 获取 GM 工具端的执行日志并同步到主面板
    //   - 展开面板中添加"清除头像"快捷按钮
    // 耦合性：完全独立的 IIFE，崩溃不影响其他模块
    // =========================================================================
    (function() {
        'use strict';

        // 仅在工单页面运行
        if (!currentUrl.includes('ml-panel.aihelp.net')) return;

        console.log('[模块F-AIHelp] 清除头像模块初始化...');

        // ==================== 配置区 ====================
        const CLEAR_AVATAR_CONFIG = {
            // GM 工具页面地址
            GM_TOOL_URL: 'https://gm.moba.youngjoygame.com:8090/#/customer/banTool',

            // 存储键名前缀（避免与其他模块冲突）
            STORAGE_PREFIX: 'clear_avatar_',

            // 调试模式
            DEBUG: true,

            // 最大日志行数
            MAX_LOG_LINES: 100
        };

        // ==================== 存储键名 ====================
        const CA_STORAGE_KEYS = {
            // 待处理的清除任务数据（传递给 GM 工具端）
            PENDING_TASK: CLEAR_AVATAR_CONFIG.STORAGE_PREFIX + 'pending_task',

            // 弹窗模式标记（用于 GM 工具端执行完成后关闭弹窗）
            POPUP_MODE: CLEAR_AVATAR_CONFIG.STORAGE_PREFIX + 'popup_mode',

            // 跨域日志数据（GM 工具页面写入，AIHelp 端轮询读取）
            LOG_DATA: CLEAR_AVATAR_CONFIG.STORAGE_PREFIX + 'log_data'
        };

        // ==================== 日志工具 ====================
        // 复用主脚本 UI 的日志通道
        const caLogger = UI ? UI.createLogChannel('clear') : {
            log: (msg) => console.log('[清除头像]', msg),
            error: (msg) => console.error('[清除头像]', msg),
            warn: (msg) => console.warn('[清除头像]', msg),
            success: (msg) => console.log('[清除头像] ✓', msg)
        };

        function caLog(msg) {
            console.log('[模块F-AIHelp]', msg);
            caLogger.log(msg);
        }

        function caLogError(msg) {
            console.error('[模块F-AIHelp]', msg);
            caLogger.error(msg);
        }

        function caLogSuccess(msg) {
            console.log('[模块F-AIHelp] ✓', msg);
            caLogger.success(msg);
        }

        // ==================== 信息提取 ====================

        /**
         * 从工单页面提取账号信息（UID 和 ServerID）
         * 从页面内部描述区域提取，格式如 "UID = 1186053970"、"ServerID = 13814"
         * @returns {{uid: string, serverId: string}|null}
         */
        function extractClearAvatarInfo() {
            caLog('开始提取账号信息...');
            const bodyText = document.body.innerText;

            const uidMatch = bodyText.match(/UID\s*=\s*(\d+)/i);
            const serverIdMatch = bodyText.match(/ServerID\s*=\s*(\d{4,5})/i);

            if (!uidMatch || !serverIdMatch) {
                caLogError('未找到UID或ServerID，请确认已打开工单详情');
                return null;
            }

            const uid = uidMatch[1];
            const serverId = serverIdMatch[1];
            caLogSuccess('提取成功 - UID: ' + uid + ', ServerID: ' + serverId);
            return { uid, serverId };
        }

        // ==================== 跨域数据操作 ====================

        /**
         * 保存数据到 GM 存储（支持跨域读取）
         */
        function caSaveGM(key, data) {
            try {
                GM_setValue(key, JSON.stringify(data));
            } catch (e) {
                caLogError('GM存储写入失败: ' + e.message);
            }
        }

        /**
         * 从 GM 存储读取数据
         */
        function caLoadGM(key, defaultVal = null) {
            try {
                const raw = GM_getValue(key, null);
                if (raw !== null && raw !== undefined) {
                    return typeof raw === 'string' ? JSON.parse(raw) : raw;
                }
            } catch (e) {
                caLogError('GM存储读取失败: ' + e.message);
            }
            return defaultVal;
        }

        /**
         * 删除 GM 存储中的数据
         */
        function caDeleteGM(key) {
            try {
                GM_deleteValue(key);
            } catch (e) {
                caLogError('GM存储删除失败: ' + e.message);
            }
        }

        // ==================== 清除头像主逻辑 ====================

        /**
         * 执行清除头像操作
         * 提取账号信息 → 保存到 GM 存储 → 打开 GM 工具弹窗
         * @param {Element} zoneElement - 被点击的图标区域元素（可选）
         */
        async function doClearAvatar(zoneElement) {
            caLog('开始清除头像流程...');

            // 显示处理中状态
            if (UI) {
                UI.showZoneProcessing('clear', true);
                UI.setZoneText('clear', '...');
            }

            try {
                // 1. 重置跨域日志时间戳（确保只显示本次操作的日志）
                if (UI) {
                    UI.resetClearAvatarLogTimestamp();
                    // 清除旧的跨域日志数据
                    caDeleteGM(CA_STORAGE_KEYS.LOG_DATA);
                }

                // 2. 提取账号信息
                const accountInfo = extractClearAvatarInfo();
                if (!accountInfo) {
                    if (UI) {
                        UI.showZoneProcessing('clear', false);
                        UI.resetZoneText('clear');
                    }
                    return;
                }

                // 3. 保存任务数据到 GM 跨域存储
                caSaveGM(CA_STORAGE_KEYS.PENDING_TASK, accountInfo);
                caSaveGM(CA_STORAGE_KEYS.POPUP_MODE, true);
                caLog('任务数据已保存，准备打开GM工具弹窗...');

                // 4. 显示成功状态，恢复图标文字
                if (UI) {
                    UI.showZoneSuccess('clear');
                    UI.showZoneProcessing('clear', false);
                    UI.resetZoneText('clear');
                }

                // 5. 以最大化弹窗方式打开 GM 工具页面
                const popupWidth = window.screen.availWidth;
                const popupHeight = window.screen.availHeight;
                const popupFeatures = [
                    'width=' + popupWidth,
                    'height=' + popupHeight,
                    'left=0',
                    'top=0',
                    'resizable=yes',
                    'scrollbars=yes',
                    'status=yes',
                    'menubar=no',
                    'toolbar=no',
                    'location=yes'
                ].join(',');

                const popupWindow = window.open(CLEAR_AVATAR_CONFIG.GM_TOOL_URL, 'GM_Tool_ClearAvatar', popupFeatures);

                if (popupWindow) {
                    caLogSuccess('GM工具弹窗已打开，等待执行结果...');
                    // 启动跨域日志轮询，实时同步GM工具执行日志到主面板
                    if (UI) {
                        UI.startClearAvatarLogPolling(CA_STORAGE_KEYS.LOG_DATA);
                    }
                } else {
                    caLogError('弹窗被浏览器拦截，请允许弹窗或手动打开GM工具页面');
                    // 清除弹窗模式标记（因为弹窗未打开，GM端不会自动关闭）
                    caDeleteGM(CA_STORAGE_KEYS.POPUP_MODE);
                }

            } catch (e) {
                caLogError('清除头像流程异常: ' + e.message);
                console.error('[模块F-AIHelp] 详细错误:', e);
                if (UI) {
                    UI.showZoneProcessing('clear', false);
                    UI.resetZoneText('clear');
                }
            }
        }

        // ==================== 初始化 ====================

        /**
         * 初始化模块F-AIHelp端
         * 注册"清"图标区域的点击回调，在展开面板中添加按钮
         */
        function initClearAvatarAIHelpModule() {
            if (!UI) {
                caLogError('UI未初始化，模块F跳过');
                return;
            }

            // 注册"清"图标区域点击回调
            UI.registerZoneCallback('clear', (el) => {
                doClearAvatar(el);
            });

            // 在展开面板中添加"清除头像"快捷按钮
            UI.addButton('清除头像', 'btn-clear', (btn) => {
                doClearAvatar(null);
            });

            caLogSuccess('模块F-AIHelp端初始化完成');
        }

        // 延迟初始化（等待UI就绪）
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => setTimeout(initClearAvatarAIHelpModule, 500));
        } else {
            setTimeout(initClearAvatarAIHelpModule, 500);
        }

    })();

    // =========================================================================
    // 模块 G-AIHelp端：内部回复（在 AIHelp 工单页面运行）
    //
    // 功能：
    //   - 在主脚本状态栏图标新增"内"区域
    //   - 展开面板中添加"内部回复"快捷按钮
    //   - 用户点击后，模拟点击工单界面的"内部回复"按钮
    // =========================================================================
    (function() {
        'use strict';

        // 仅在工单页面运行
        if (!currentUrl.includes('ml-panel.aihelp.net')) return;

        console.log('[模块G-AIHelp] 内部回复模块初始化...');

        // 复用主脚本 UI 的日志通道
        const replyLogger = UI ? UI.createLogChannel('reply') : {
            log: (msg) => console.log('[内部回复]', msg),
            error: (msg) => console.error('[内部回复]', msg),
            warn: (msg) => console.warn('[内部回复]', msg),
            success: (msg) => console.log('[内部回复] ✓', msg)
        };

        function replyLog(msg) {
            replyLogger.log(msg);
        }

        function replyLogError(msg) {
            replyLogger.error(msg);
        }

        function replyLogWarn(msg) {
            replyLogger.warn(msg);
        }

        /**
         * 模拟点击原生的"内部回复"按钮
         */
        function doInternalReply(zoneElement) {
            replyLog('准备点击"内部回复"...');

            if (UI) {
                UI.showZoneProcessing('reply', true);
                UI.setZoneText('reply', '...');
            }

            try {
                // 查找包含"内部回复"或"内部备注"文本的 button 元素
                const buttons = Array.from(document.querySelectorAll('button'));
                const targetBtn = buttons.find(el => {
                    const text = (el.textContent || '').trim();
                    return text.includes('内部回复') || text.includes('内部备注');
                });

                if (targetBtn) {
                    if (targetBtn.disabled) {
                        replyLogWarn('"内部回复"按钮已被禁用');
                        if (UI) {
                            UI.showZoneProcessing('reply', false);
                            UI.resetZoneText('reply');
                        }
                        return;
                    }
                    targetBtn.click();
                    replyLog('已成功点击"内部回复"按钮');

                    if (UI) {
                        UI.showZoneSuccess('reply');
                        UI.showZoneProcessing('reply', false);
                        UI.resetZoneText('reply');
                    }
                } else {
                    replyLogWarn('未找到"内部回复"按钮');
                    if (UI) {
                        UI.showZoneProcessing('reply', false);
                        UI.resetZoneText('reply');
                    }
                }
            } catch (e) {
                replyLogError('点击内部回复按钮异常: ' + e.message);
                if (UI) {
                    UI.showZoneProcessing('reply', false);
                    UI.resetZoneText('reply');
                }
            }
        }

        /**
         * 初始化模块G-AIHelp端
         */
        function initInternalReplyModule() {
            if (!UI) {
                replyLogError('UI未初始化，模块G跳过');
                return;
            }

            // 注册"内"图标区域点击回调
            UI.registerZoneCallback('reply', (el) => {
                doInternalReply(el);
            });

            // 在展开面板中添加"内部回复"快捷按钮
            UI.addButton('内部回复', 'btn-reply', (btn) => {
                doInternalReply(null);
            });

            replyLog('模块G-AIHelp端初始化完成');
        }

        // 延迟初始化（等待UI就绪）
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => setTimeout(initInternalReplyModule, 600));
        } else {
            setTimeout(initInternalReplyModule, 600);
        }

    })();

})(); // ← 外层主 IIFE 结束

// =========================================================================
// 模块 E-飞书端：飞书项目 Ticket ID 搜索执行器（顶层独立 IIFE，不依赖外层）
//
// 需求来源：提示词总结和skills2026-2-13\通用提示词模版.md
// 功能：
//   - 仅在飞书项目目标页面运行
//   - 读取 GM_getValue 中的待搜索 Ticket ID
//   - 先点击"查找"按钮展开搜索框，再输入 Ticket ID
//   - 等待搜索结果列表更新，检测是否有结果
//   - 将搜索结果写入 GM_setValue，由 AIHelp端模块读取并展示
//   - 若页面处于未登录状态，写入 not_logged_in 状态
// 技术要点（来自 rules.md / AIHelp skills）：
//   - 飞书是重型 SPA，初始化需等待 3000ms
//   - 搜索框是 React 组件，需使用原生 setter + 完整事件链
//   - 使用 MutationObserver 检测搜索结果变化
// =========================================================================
(function() {
        'use strict';

        // 仅在飞书目标页面运行
        const currentUrl = window.location.href;
        if (!currentUrl.includes('feishu.cn')) return;
        if (!currentUrl.includes('Cot68m5vg')) return;

        // ---- 配置区（与 AIHelp 端保持同步的存储键名）----
        const FEISHU_EXEC_CONFIG = {
            debug: true,
            storageKeyPending: 'feishu_ticket_search_pending_v1',
            storageKeyResult: 'feishu_ticket_search_result_v1',
            storageKeyResultTs: 'feishu_ticket_search_result_ts_v1',
            // 飞书重型应用，初始化等待时间（来自 rules.md 动态页面处理规范）
            initDelay: 3000,
            // 搜索结果等待超时（毫秒）
            searchResultTimeout: 10000,
            // 轮询待搜索 ID 的间隔（毫秒）：页面加载后持续检测新任务
            pollPendingInterval: 1000
        };

        // ---- 状态区 ----
        const feishuExecState = {
            isSearching: false,         // 防止并发搜索
            lastSearchedId: null,       // 上次搜索的 Ticket ID（防重复）
            lastRequestTs: 0,           // 上次请求的时间戳
            isInitialized: false        // 是否已完成初始化
        };

        function feishuExecLog(...args) {
            if (FEISHU_EXEC_CONFIG.debug) {
                console.log('[飞书搜索执行器]', ...args);
            }
        }

        function feishuExecLogError(...args) {
            console.error('[飞书搜索执行器 错误]', ...args);
        }

        /**
         * 检测飞书页面是否已登录
         * 登录判断依据：页面存在用户相关元素，或不存在登录引导文本
         * @returns {boolean}
         */
        function isFeishuLoggedIn() {
            const bodyText = document.body.innerText || '';
            // 飞书未登录时页面内容极少，且通常包含登录引导文字
            if (bodyText.length < 200) return false; // 页面内容太少，还在加载或未登录
            if (bodyText.includes('请登录') || bodyText.includes('立即登录') || bodyText.includes('扫码登录')) return false;
            if (bodyText.includes('登录') && bodyText.includes('账号') && bodyText.length < 800) return false;
            return true; // 页面内容正常，视为已登录
        }

        /**
         * 等待指定选择器的元素出现并可用
         * 来自 rules.md 动态页面处理规范中的 waitFor 模板
         * @param {string} selector
         * @param {number} timeout
         * @returns {Promise<Element|null>}
         */
        function waitForElement(selector, timeout = 10000) {
            return new Promise((resolve) => {
                // 先检查是否已存在
                const existing = document.querySelector(selector);
                if (existing) {
                    const style = window.getComputedStyle(existing);
                    if (style.display !== 'none' && style.visibility !== 'hidden') {
                        return resolve(existing);
                    }
                }

                const observer = new MutationObserver(() => {
                    const el = document.querySelector(selector);
                    if (el) {
                        const style = window.getComputedStyle(el);
                        if (style.display !== 'none' && style.visibility !== 'hidden') {
                            observer.disconnect();
                            resolve(el);
                        }
                    }
                });

                observer.observe(document.body, {
                    childList: true,
                    subtree: true,
                    attributes: true,
                    attributeFilter: ['style', 'class']
                });

                setTimeout(() => {
                    observer.disconnect();
                    resolve(null);
                }, timeout);
            });
        }

        /**
         * 使用原生 setter 向 React/SPA 框架中的 input 设置值并触发事件
         * 需求：飞书搜索框是 React 组件，直接赋值无效
         * 来自 rules.md SPA架构适配规范 - 框架双向绑定突破
         * @param {HTMLInputElement} input
         * @param {string} value
         */
        function simulateSearchInput(input, value) {
            try {
                input.focus();
                // 先清空旧值
                const nativeSetter = Object.getOwnPropertyDescriptor(
                    window.HTMLInputElement.prototype, 'value'
                ).set;
                nativeSetter.call(input, '');
                input.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));

                // 再写入新值，使用原生 setter 绕过 React 的 proxy
                nativeSetter.call(input, value);

                // 触发完整事件链，确保 React 状态同步
                input.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true, inputType: 'insertText', data: value }));
                input.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));

                // 模拟最后一个字符的键盘事件（部分 React 版本依赖 keydown 触发过滤）
                if (value.length > 0) {
                    const lastChar = value[value.length - 1];
                    input.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, composed: true, key: lastChar }));
                    input.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, cancelable: true, composed: true, key: lastChar }));
                }

                feishuExecLog('搜索框已输入:', value);

                // 发送 Enter 键触发搜索（飞书搜索框需要 Enter 才会执行搜索，不是输入即搜索）
                setTimeout(() => {
                    input.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, composed: true, key: 'Enter', keyCode: 13, which: 13 }));
                    input.dispatchEvent(new KeyboardEvent('keypress', { bubbles: true, cancelable: true, composed: true, key: 'Enter', keyCode: 13, which: 13 }));
                    input.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, cancelable: true, composed: true, key: 'Enter', keyCode: 13, which: 13 }));
                    feishuExecLog('已发送 Enter 键触发搜索');
                }, 200);

                return true;
            } catch (e) {
                feishuExecLogError('模拟搜索输入失败:', e.message);
                return false;
            }
        }

        /**
         * 检测搜索结果：等待列表项变化，判断是否有搜索结果
         * 策略：MutationObserver 监听列表容器变化 + 超时保底
         * @returns {Promise<'found'|'notfound'>}
         */
        function detectSearchResult() {
            return new Promise((resolve) => {
                let observer = null;
                let timeoutId = null;

                function cleanup() {
                    if (observer) { observer.disconnect(); observer = null; }
                    if (timeoutId) { clearTimeout(timeoutId); timeoutId = null; }
                }

                function checkResult() {
                    const bodyText = document.body.innerText || '';

                    // 策略1：识别飞书搜索过滤后的 X/X 计数（如"0/0"表示无结果，"1/12"表示有结果）
                    // 飞书过滤后会在搜索框附近显示 "当前结果/总数" 格式
                    const countMatch = bodyText.match(/(\d+)\/(\d+)/);
                    if (countMatch) {
                        const matched = parseInt(countMatch[1], 10);
                        feishuExecLog('检测到计数:', countMatch[0], '→ matched =', matched);
                        if (matched === 0) return 'notfound';
                        if (matched > 0) return 'found';
                    }

                    // 策略2：检查空结果标记（飞书常见的空状态文本）
                    const emptyTexts = ['暂无数据', '没有找到', '无搜索结果', 'No data', '暂无内容', 'No results', '未找到'];
                    const hasEmptyState = emptyTexts.some(t => bodyText.includes(t));

                    // 策略3：检查是否有工作项列表行（飞书项目多种可能的列表行选择器）
                    const listRows = document.querySelectorAll([
                        'tr.story-list-table-row',
                        '[class*="story-row"]',
                        '[class*="work-item-row"]',
                        '[class*="listItem"]',
                        '[class*="storyItem"]',
                        '[class*="issueItem"]',
                        '[data-testid*="story"]',
                        '.story-list-table tbody tr',
                        '[class*="StoryItem"]',
                        '[class*="WorkItem"]'
                    ].join(', '));

                    if (hasEmptyState && listRows.length === 0) {
                        return 'notfound';
                    }
                    return null; // 还在加载中，等待计数出现
                }

                // 先检查一次
                const immediate = checkResult();
                if (immediate) {
                    resolve(immediate);
                    return;
                }

                // 监听 DOM 变化
                observer = new MutationObserver(() => {
                    const result = checkResult();
                    if (result) {
                        cleanup();
                        resolve(result);
                    }
                });

                observer.observe(document.body, {
                    childList: true,
                    subtree: true
                });

                // 超时保底：等待足够时间后再次检查
                timeoutId = setTimeout(() => {
                    cleanup();
                    // 超时时再做一次最终判断
                    const finalResult = checkResult();
                    if (finalResult) {
                        resolve(finalResult);
                    } else {
                        // 无法明确判断：以"未找到"处理（保守策略）
                        feishuExecLog('检测搜索结果超时，默认返回 notfound');
                        resolve('notfound');
                    }
                }, FEISHU_EXEC_CONFIG.searchResultTimeout);
            });
        }

        /**
         * 写入搜索结果到 GM_setValue，供 AIHelp 端轮询读取
         * @param {'found'|'notfound'|'not_logged_in'|'error'} status
         * @param {string} [detail]
         */
        function writeSearchResult(status, detail) {
            try {
                GM_setValue(FEISHU_EXEC_CONFIG.storageKeyResult, { status, detail: detail || '' });
                GM_setValue(FEISHU_EXEC_CONFIG.storageKeyResultTs, Date.now());
                feishuExecLog('搜索结果已写入:', status, detail || '');
            } catch (e) {
                feishuExecLogError('写入搜索结果失败:', e.message);
            }
        }

        /**
         * 执行一次 Ticket ID 搜索的完整流程
         * @param {string} ticketId - 要搜索的 Ticket ID
         * @param {number} requestTs - 本次请求的时间戳（用于结果标记）
         */
        async function executeFeishuSearch(ticketId, requestTs) {
            if (feishuExecState.isSearching) {
                feishuExecLog('正在搜索中，跳过重复请求');
                return;
            }

            feishuExecState.isSearching = true;
            feishuExecLog('========== 开始飞书搜索 ==========');
            feishuExecLog('Ticket ID:', ticketId, '| 请求时间:', new Date(requestTs).toLocaleTimeString());

            try {
                // 1. 检查登录状态
                if (!isFeishuLoggedIn()) {
                    feishuExecLog('飞书未登录，返回 not_logged_in 状态');
                    writeSearchResult('not_logged_in');
                    return;
                }

                // 2. 先点击"查找"图标按钮，展开搜索输入框
                //    飞书搜索框默认折叠，必须先点击查找图标才会显示 input
                //    查找图标特征：按钮内包含"查找"文字的 span
                feishuExecLog('等待查找图标按钮出现...');

                // 等待查找按钮所在的容器加载完成
                await waitForElement(
                    '#story-view-search-container, [id*="search-container"]',
                    FEISHU_EXEC_CONFIG.searchResultTimeout
                );

                // 多种选择器尝试定位查找按钮
                function findSearchButton() {
                    // 优先：通过容器 ID 下的按钮
                    const container = document.getElementById('story-view-search-container');
                    if (container) {
                        const btn = container.querySelector('button');
                        if (btn) return btn;
                    }
                    // 备用：找包含"查找"文字的按钮
                    const allBtns = document.querySelectorAll('button');
                    for (const btn of allBtns) {
                        if (btn.innerText && btn.innerText.trim() === '查找') return btn;
                    }
                    // 备用：找包含"查找" span 的按钮
                    const spans = document.querySelectorAll('.semi-button-content-right span');
                    for (const span of spans) {
                        if (span.innerText && span.innerText.trim() === '查找') {
                            return span.closest('button');
                        }
                    }
                    return null;
                }

                const queryBtn = findSearchButton();
                if (!queryBtn) {
                    feishuExecLogError('未找到查找图标按钮，页面可能未加载完成或结构已变化');
                    if (!isFeishuLoggedIn()) {
                        writeSearchResult('not_logged_in');
                    } else {
                        writeSearchResult('error', '未找到查找按钮，请确认飞书页面已正常加载');
                    }
                    return;
                }

                feishuExecLog('找到查找按钮，模拟点击展开搜索框...');
                queryBtn.click();

                // 3. 等待搜索输入框展开（点击后动画/渲染需要短暂时间）
                feishuExecLog('等待搜索输入框出现...');
                const searchInput = await waitForElement(
                    'input[placeholder="按标题查找"], input.semi-input[placeholder*="查找"], #story-view-search-container input',
                    5000
                );

                if (!searchInput) {
                    feishuExecLogError('点击查找按钮后搜索输入框仍未出现');
                    writeSearchResult('error', '搜索输入框未展开，请检查飞书页面');
                    return;
                }

                // 4. 向搜索框输入 Ticket ID
                feishuExecLog('搜索输入框已展开，开始输入 Ticket ID:', ticketId);
                const inputResult = simulateSearchInput(searchInput, ticketId);
                if (!inputResult) {
                    writeSearchResult('error', '无法向搜索框输入内容');
                    return;
                }

                // 4. 等待 Enter 的 debounce，再点击"过滤"复选框
                //    飞书搜索框输入后需要点击"过滤"复选框才能真正按标题过滤
                //    结构：<span class="semi-checkbox-inner-display"></span>（在 meego-checkbox 内）
                feishuExecLog('等待过滤复选框出现...');
                await new Promise(resolve => setTimeout(resolve, 600));

                async function clickFilterCheckbox() {
                    // 优先：找包含"过滤"文字且未勾选的复选框
                    const checkboxes = document.querySelectorAll('.semi-checkbox');
                    for (const cb of checkboxes) {
                        const label = cb.querySelector('.meego-checkbox-label, .semi-checkbox-addon');
                        if (label && label.innerText && label.innerText.trim() === '过滤') {
                            const input = cb.querySelector('input[type="checkbox"]');
                            if (input && input.getAttribute('aria-checked') !== 'true') {
                                feishuExecLog('找到"过滤"复选框，模拟点击...');
                                // 点击 inner-display（视觉元素）
                                const display = cb.querySelector('.semi-checkbox-inner-display');
                                if (display) { display.click(); return true; }
                                // 备用：点击 input
                                input.click();
                                return true;
                            } else if (input && input.getAttribute('aria-checked') === 'true') {
                                feishuExecLog('"过滤"复选框已勾选，无需重复点击');
                                return true;
                            }
                        }
                    }
                    // 备用：直接找 semi-checkbox-inner-display，通过附近文字判断
                    const displays = document.querySelectorAll('.semi-checkbox-inner-display');
                    for (const d of displays) {
                        const parent = d.closest('.semi-checkbox');
                        if (parent) {
                            const text = parent.innerText || '';
                            if (text.includes('过滤')) {
                                feishuExecLog('备用：找到"过滤"复选框显示元素，模拟点击...');
                                d.click();
                                return true;
                            }
                        }
                    }
                    feishuExecLog('未找到"过滤"复选框，跳过（继续等待结果）');
                    return false;
                }

                const filterClicked = await clickFilterCheckbox();
                feishuExecLog('过滤复选框点击结果:', filterClicked);

                // 5. 等待过滤后搜索结果更新
                feishuExecLog('等待搜索结果...');
                await new Promise(resolve => setTimeout(resolve, 1500));

                // 6. 检测结果
                const result = await detectSearchResult();
                feishuExecLog('搜索结果:', result);

                // 7. 写入结果
                writeSearchResult(result);
                feishuExecLog('========== 飞书搜索完成 ==========');

            } catch (e) {
                feishuExecLogError('飞书搜索执行异常:', e.message);
                writeSearchResult('error', e.message);
            } finally {
                feishuExecState.isSearching = false;
            }
        }

        /**
         * 轮询检查是否有新的 Ticket ID 搜索请求
         * 每次页面加载后持续检测，及时响应 AIHelp 端的搜索请求
         */
        function startPollPending() {
            feishuExecLog('开始轮询待搜索 Ticket ID...');

            setInterval(() => {
                try {
                    const pending = GM_getValue(FEISHU_EXEC_CONFIG.storageKeyPending, null);
                    if (!pending || !pending.ticketId) return;

                    const { ticketId, requestTs } = pending;

                    // 跳过已处理过的请求（通过时间戳区分）
                    if (requestTs <= feishuExecState.lastRequestTs) return;

                    feishuExecLog('检测到新的搜索请求:', ticketId, '时间戳:', requestTs);
                    feishuExecState.lastRequestTs = requestTs;
                    feishuExecState.lastSearchedId = ticketId;

                    // 异步执行搜索
                    executeFeishuSearch(ticketId, requestTs);
                } catch (e) {
                    feishuExecLogError('轮询异常:', e.message);
                }
            }, FEISHU_EXEC_CONFIG.pollPendingInterval);
        }

        function initFeishuExecModule() {
            feishuExecLog('========================================');
            feishuExecLog('飞书 Ticket ID 搜索执行器 v6.6.2 已启动');
            feishuExecLog('当前页面:', currentUrl.substring(0, 80));
            feishuExecLog('========================================');

            feishuExecState.isInitialized = true;

            // 页面加载后等待飞书 SPA 初始化完成（重型应用规范：3000ms）
            // 再开始轮询，避免搜索框还没渲染就执行
            setTimeout(() => {
                feishuExecLog('飞书 SPA 初始化等待完毕，开始工作...');
                startPollPending();

                // 检查是否有立即需要处理的任务（页面刚打开时）
                try {
                    const pending = GM_getValue(FEISHU_EXEC_CONFIG.storageKeyPending, null);
                    if (pending && pending.ticketId && pending.requestTs > feishuExecState.lastRequestTs) {
                        feishuExecLog('发现页面打开时已有待搜索任务:', pending.ticketId);
                        feishuExecState.lastRequestTs = pending.requestTs;
                        feishuExecState.lastSearchedId = pending.ticketId;
                        executeFeishuSearch(pending.ticketId, pending.requestTs);
                    }
                } catch (e) {
                    feishuExecLogError('初始任务检查异常:', e.message);
                }
            }, FEISHU_EXEC_CONFIG.initDelay);
        }

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', initFeishuExecModule);
        } else {
            initFeishuExecModule();
        }
    })();

// =========================================================================
// 模块 F-GM端：清除头像冷却时间 - GM工具页面自动操作执行器（顶层独立 IIFE）
//
// 功能：
//   - 仅在 GM 工具页面（gm.moba.youngjoygame.com）运行
//   - 读取 AIHelp 端写入的任务数据（UID、ServerID）
//   - 自动在 banTool 页面：选择服务器 → 输入 UID → 点击执行
//   - 将执行日志写入 GM_setValue，供 AIHelp 端实时轮询显示
//   - 操作完成后自动关闭弹窗
// 技术要点：
//   - GM 工具为 Vue/Ant Design 框架，使用原生 setter 写入输入框
//   - 下拉框需通过 ant-select-selector 触发，等待下拉框展开后选择选项
//   - 日志同步通过 GM_setValue 写入 JSON 数组，AIHelp 端通过时间戳过滤
// =========================================================================
(function() {
    'use strict';

    // 仅在 GM 工具页面运行
    const gmCurrentUrl = window.location.href;
    if (!gmCurrentUrl.includes('gm.moba.youngjoygame.com')) return;

    console.log('[模块F-GM] GM工具端启动...');

    // ==================== 配置区（与 AIHelp 端保持同步）====================
    const GM_MODULE_CONFIG = {
        // 存储键名（与 AIHelp 端一致）
        STORAGE_PREFIX: 'clear_avatar_',
        MAX_LOG_LINES: 100,
        // banTool 页面 hash 标识
        BAN_TOOL_HASH: 'banTool',
        // 元素查找超时（ms）
        ELEMENT_TIMEOUT: 10000,
        // 重试间隔（ms）
        RETRY_INTERVAL: 500,
        // 最大重试次数
        MAX_RETRIES: 20
    };

    const GM_STORAGE_KEYS = {
        PENDING_TASK: GM_MODULE_CONFIG.STORAGE_PREFIX + 'pending_task',
        POPUP_MODE: GM_MODULE_CONFIG.STORAGE_PREFIX + 'popup_mode',
        LOG_DATA: GM_MODULE_CONFIG.STORAGE_PREFIX + 'log_data'
    };

    // ==================== 工具函数 ====================

    function gmSleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    function gmWaitForElement(selector, timeout) {
        timeout = timeout || GM_MODULE_CONFIG.ELEMENT_TIMEOUT;
        return new Promise(resolve => {
            const startTime = Date.now();
            const check = () => {
                const el = document.querySelector(selector);
                if (el) { resolve(el); return; }
                if (Date.now() - startTime >= timeout) { resolve(null); return; }
                setTimeout(check, GM_MODULE_CONFIG.RETRY_INTERVAL);
            };
            check();
        });
    }

    /**
     * 读取 GM 存储数据
     */
    function gmLoadData(key, defaultVal) {
        if (defaultVal === undefined) defaultVal = null;
        try {
            const raw = GM_getValue(key, null);
            if (raw !== null && raw !== undefined) {
                return typeof raw === 'string' ? JSON.parse(raw) : raw;
            }
        } catch (e) {
            console.error('[模块F-GM] GM存储读取失败:', key, e);
        }
        return defaultVal;
    }

    /**
     * 写入 GM 存储数据
     */
    function gmSaveData(key, data) {
        try {
            GM_setValue(key, JSON.stringify(data));
        } catch (e) {
            console.error('[模块F-GM] GM存储写入失败:', key, e);
        }
    }

    /**
     * 删除 GM 存储数据
     */
    function gmDeleteData(key) {
        try {
            GM_deleteValue(key);
        } catch (e) {
            console.error('[模块F-GM] GM存储删除失败:', key, e);
        }
    }

    // ==================== 跨域日志系统 ====================

    // GM 工具端日志悬浮层（显示在 GM 工具页面右上角）
    let gmLogDiv = null;

    /**
     * 创建 GM 工具页面的日志悬浮层
     */
    function createGMLogOverlay() {
        if (document.getElementById('gm-module-f-log')) return;
        gmLogDiv = document.createElement('div');
        gmLogDiv.id = 'gm-module-f-log';
        gmLogDiv.style.cssText = [
            'position:fixed',
            'top:10px',
            'right:10px',
            'width:320px',
            'max-height:220px',
            'overflow-y:auto',
            'background:rgba(0,0,0,0.82)',
            'color:#fff',
            'padding:10px 12px',
            'border-radius:8px',
            'font-size:12px',
            'font-family:monospace',
            'z-index:999999',
            'box-shadow:0 4px 12px rgba(0,0,0,0.3)',
            'line-height:1.6'
        ].join(';');
        document.body.appendChild(gmLogDiv);
    }

    /**
     * 输出日志（同时写入悬浮层 + 跨域 GM 存储 → 供 AIHelp 端读取）
     * @param {string} msg - 日志消息
     * @param {string} type - info / success / warn / error
     */
    function gmLog(msg, type) {
        type = type || 'info';
        const colors = { info: '#fff', success: '#73d13d', warn: '#faad14', error: '#ff4d4f' };
        const time = new Date().toLocaleTimeString([], { hour12: false });

        console.log('[模块F-GM]', msg);

        // 写入悬浮层
        if (gmLogDiv) {
            const div = document.createElement('div');
            div.style.color = colors[type] || '#fff';
            div.textContent = '[' + time + '] ' + msg;
            gmLogDiv.appendChild(div);
            gmLogDiv.scrollTop = gmLogDiv.scrollHeight;
        }

        // 同步到跨域 GM 存储（供 AIHelp 端轮询读取）
        try {
            let logData = gmLoadData(GM_STORAGE_KEYS.LOG_DATA, []);
            if (!Array.isArray(logData)) logData = [];
            logData.push({ time: time, msg: msg, type: type, timestamp: Date.now() });
            if (logData.length > GM_MODULE_CONFIG.MAX_LOG_LINES) {
                logData = logData.slice(-GM_MODULE_CONFIG.MAX_LOG_LINES);
            }
            gmSaveData(GM_STORAGE_KEYS.LOG_DATA, logData);
        } catch (e) {
            console.error('[模块F-GM] 跨域日志同步失败:', e);
        }
    }

    // ==================== 清除头像核心操作 ====================

    /**
     * 主操作流程：在 banTool 页面自动完成清除头像操作
     * 步骤：等待页面加载 → 选择ServerID → 输入UID → 点击执行 → 读取结果 → 关闭弹窗
     */
    async function executeClearAvatarOnGMTool() {
        gmLog('========== 开始清除头像操作 ==========');

        // 从 GM 存储获取任务数据
        const taskData = gmLoadData(GM_STORAGE_KEYS.PENDING_TASK);
        if (!taskData) {
            gmLog('没有待处理的任务', 'warn');
            return;
        }

        const { uid, serverId } = taskData;
        gmLog('待处理任务 - UID: ' + uid + ', ServerID: ' + serverId);

        // 确保在 banTool 页面
        if (!window.location.hash.includes(GM_MODULE_CONFIG.BAN_TOOL_HASH)) {
            gmLog('当前不在banTool页面，尝试跳转...', 'warn');
            window.location.hash = '/customer/banTool';
            await gmSleep(2000);
        }

        try {
            // ===== 步骤1：等待页面内容加载 =====
            gmLog('等待页面内容加载...');
            await gmSleep(2000);

            let pageReady = false;
            for (let i = 0; i < 20; i++) {
                if (document.querySelector('.ant-select-selector, .item, .el-input')) {
                    pageReady = true;
                    gmLog('页面内容已加载');
                    break;
                }
                gmLog('等待页面内容加载... (' + (i + 1) + '/20)');
                await gmSleep(500);
            }
            if (!pageReady) gmLog('页面加载超时，继续尝试...', 'warn');

            // ===== 步骤2：点击 ServerID 选择框 =====
            gmLog('查找ServerID选择框...');
            const serverIdSelector = await gmWaitForElement('.ant-select-selector', 10000);
            if (!serverIdSelector) {
                gmLog('未找到ServerID选择框，请检查页面是否正确加载', 'error');
                return;
            }

            serverIdSelector.scrollIntoView({ behavior: 'smooth', block: 'center' });
            await gmSleep(300);

            // 模拟鼠标事件触发下拉框
            ['mousedown', 'mouseup'].forEach(evType => {
                serverIdSelector.dispatchEvent(new MouseEvent(evType, { bubbles: true, cancelable: true }));
            });
            await gmSleep(100);
            serverIdSelector.click();
            gmLog('已点击ServerID选择框');
            await gmSleep(800);

            // ===== 步骤3：等待下拉框显示 =====
            gmLog('等待下拉框显示...');
            let dropdown = null;
            for (let i = 0; i < 15; i++) {
                dropdown = document.querySelector('.ant-select-dropdown:not(.ant-select-dropdown-hidden)');
                if (dropdown) break;
                gmLog('下拉框未显示，尝试再次点击...');
                serverIdSelector.click();
                await gmSleep(500);
            }
            if (!dropdown) gmLog('下拉框未能打开，尝试直接输入...', 'warn');
            else gmLog('下拉框已打开');

            // ===== 步骤4：输入 ServerID 搜索 =====
            gmLog('输入ServerID: ' + serverId);
            const searchInput = document.querySelector('.ant-select-selection-search-input');
            if (!searchInput) {
                gmLog('未找到搜索输入框', 'error');
                return;
            }

            searchInput.focus();
            await gmSleep(100);

            const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
            nativeSetter.call(searchInput, serverId);
            searchInput.dispatchEvent(new Event('input', { bubbles: true }));
            searchInput.dispatchEvent(new Event('change', { bubbles: true }));
            gmLog('已输入ServerID，等待选项加载...');
            await gmSleep(800);

            // ===== 步骤5：选择匹配的 ServerID 选项 =====
            gmLog('查找匹配的ServerID选项...');
            dropdown = document.querySelector('.ant-select-dropdown:not(.ant-select-dropdown-hidden)');
            if (!dropdown) {
                gmLog('下拉框已关闭', 'error');
                return;
            }

            const options = dropdown.querySelectorAll('.ant-select-item-option');
            gmLog('找到 ' + options.length + ' 个选项');

            let matchedOption = null;
            for (const option of options) {
                const title = option.getAttribute('title') || '';
                if (title.startsWith(serverId + '-') || title === serverId) {
                    matchedOption = option;
                    gmLog('找到匹配选项: ' + title, 'success');
                    break;
                }
            }

            if (matchedOption) {
                matchedOption.click();
                await gmSleep(500);
                gmLog('ServerID选择完成', 'success');
            } else {
                gmLog('未找到精确匹配，尝试选择第一个选项...', 'warn');
                if (options.length > 0) {
                    options[0].click();
                    await gmSleep(500);
                }
            }

            // ===== 步骤6：定位"清除上传头像倒计时"功能区域 =====
            gmLog('查找"清除上传头像倒计时"区域...');
            let targetSpan = null;
            for (const span of document.querySelectorAll('span')) {
                if (span.textContent.trim() === '清除上传头像倒计时') {
                    targetSpan = span;
                    break;
                }
            }

            if (!targetSpan) {
                gmLog('未找到"清除上传头像倒计时"区域', 'error');
                return;
            }

            const itemContainer = targetSpan.closest('.item');
            if (!itemContainer) {
                gmLog('未找到功能区域容器(.item)', 'error');
                return;
            }

            itemContainer.scrollIntoView({ behavior: 'smooth', block: 'center' });
            await gmSleep(500);
            gmLog('找到功能区域');

            // ===== 步骤7：输入 UID =====
            gmLog('查找UID输入框...');
            const uidInput = itemContainer.querySelector('input[placeholder="UID"]');
            if (!uidInput) {
                gmLog('未找到UID输入框', 'error');
                return;
            }

            uidInput.focus();
            await gmSleep(100);
            nativeSetter.call(uidInput, uid);
            uidInput.dispatchEvent(new Event('input', { bubbles: true }));
            uidInput.dispatchEvent(new Event('change', { bubbles: true }));
            uidInput.dispatchEvent(new Event('blur', { bubbles: true }));
            gmLog('UID输入完成: ' + uid, 'success');
            await gmSleep(300);

            // ===== 步骤8：点击执行按钮 =====
            gmLog('查找执行按钮...');
            const executeBtn = itemContainer.querySelector('.el-icon-video-play[title="运行"]');
            if (!executeBtn) {
                gmLog('未找到执行按钮(.el-icon-video-play[title="运行"])', 'error');
                return;
            }

            executeBtn.click();
            gmLog('已点击执行按钮', 'success');

            // ===== 步骤9：等待执行结果 =====
            gmLog('等待执行结果...');
            await gmSleep(2000);

            let resultFound = false;
            for (const el of document.querySelectorAll('*')) {
                const text = el.textContent || '';
                if (text.includes('Result:Ok') || text.includes('Result: Ok')) {
                    gmLog('清除头像冷却时间成功！', 'success');
                    resultFound = true;
                    break;
                } else if (text.includes('Result:Error') || text.includes('Result: Error')) {
                    gmLog('清除头像冷却时间失败，请检查参数', 'error');
                    resultFound = true;
                    break;
                }
            }
            if (!resultFound) {
                gmLog('操作已执行，请查看右侧结果栏确认', 'warn');
            }

            // ===== 步骤10：清除任务数据并关闭弹窗 =====
            gmDeleteData(GM_STORAGE_KEYS.PENDING_TASK);
            gmLog('任务完成，已清除待处理数据');

            const isPopupMode = gmLoadData(GM_STORAGE_KEYS.POPUP_MODE, false);
            if (isPopupMode) {
                gmDeleteData(GM_STORAGE_KEYS.POPUP_MODE);
                gmLog('3秒后自动关闭弹窗...');
                await gmSleep(2500);
                gmLog('正在关闭弹窗...', 'success');
                await gmSleep(500);
                window.close();
                gmLog('如果窗口未关闭，请手动关闭此页面', 'warn');
            } else {
                gmLog('非弹窗模式，请手动关闭此页面');
            }

        } catch (e) {
            gmLog('执行过程中发生错误: ' + e.message, 'error');
            console.error('[模块F-GM] 详细错误:', e);
        }
    }

    // ==================== 页面判断 ====================

    function isGMBanToolPage() {
        return (window.location.hash || '').includes(GM_MODULE_CONFIG.BAN_TOOL_HASH);
    }

    // ==================== 初始化 ====================

    /**
     * 初始化 GM 工具端模块
     * 在 banTool 页面且有待处理任务时自动执行清除操作
     */
    function initGMModuleF() {
        console.log('[模块F-GM] 初始化，当前hash:', window.location.hash);

        // 创建日志悬浮层
        createGMLogOverlay();

        const taskData = gmLoadData(GM_STORAGE_KEYS.PENDING_TASK);
        gmLog('任务数据: ' + JSON.stringify(taskData));

        if (taskData && isGMBanToolPage()) {
            gmLog('发现待处理任务，准备执行...', 'success');

            if (document.readyState === 'complete') {
                setTimeout(executeClearAvatarOnGMTool, 1500);
            } else {
                window.addEventListener('load', () => setTimeout(executeClearAvatarOnGMTool, 1500));
            }
        } else {
            gmLog('没有待处理任务 或 当前不在banTool页面');
        }

        // 监听 hash 变化（SPA路由），当切换到 banTool 页面时重新检查
        window.addEventListener('hashchange', () => {
            gmLog('hash变化: ' + window.location.hash);
            setTimeout(() => {
                const newTaskData = gmLoadData(GM_STORAGE_KEYS.PENDING_TASK);
                if (newTaskData && isGMBanToolPage()) {
                    gmLog('hash变化后检测到banTool页面，执行任务...', 'success');
                    setTimeout(executeClearAvatarOnGMTool, 500);
                }
            }, 500);
        });
    }

    // 启动模块
    gmLog('========== 模块F-GM工具端已加载 ==========');
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => setTimeout(initGMModuleF, 1000));
    } else {
        setTimeout(initGMModuleF, 1000);
    }

})();

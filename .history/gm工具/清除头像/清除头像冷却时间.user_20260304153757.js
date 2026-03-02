// ==UserScript==
// @name         清除头像冷却时间
// @namespace    http://tampermonkey.net/
// @version      1.0.7
// @description  自动清除玩家头像冷却时间 - 从工单界面提取信息并自动操作GM工具
// @author       AI Assistant
// @match        https://ml-panel.aihelp.net/*
// @match        https://gm.moba.youngjoygame.com:8090/*
// @grant        GM_addStyle
// @grant        GM_openInTab
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @run-at       document-end
// ==/UserScript==

/**
 * 清除头像冷却时间 - 油猴脚本
 * 
 * 功能说明：
 * 1. 在工单列表界面显示状态栏（包含"清"和"日"两个区域）
 * 2. 点击"清"区域时，自动提取工单中的UID和ServerID
 * 3. 自动打开GM工具页面并执行清除头像操作
 * 4. 点击"日"区域时，打开日志面板查看执行记录
 * 
 * 使用方法：
 * 1. 在工单列表界面点击某个工单，确保能看到"内部描述"区域
 * 2. 点击状态栏的"清"区域
 * 3. 脚本会自动提取信息并打开GM工具页面执行操作
 * 4. 操作结果会显示在日志面板中
 */

(function() {
    'use strict';

    // ==================== 配置区 ====================
    
    /**
     * 全局配置对象
     * 包含脚本运行所需的所有配置参数
     */
    const CONFIG = {
        // GM工具页面地址
        GM_TOOL_URL: 'https://gm.moba.youngjoygame.com:8090/#/customer/banTool',
        
        // 存储键名前缀（用于避免与其他脚本冲突）
        STORAGE_PREFIX: 'clear_avatar_',
        
        // 调试模式开关
        DEBUG: true,
        
        // 状态栏初始位置
        INITIAL_POSITION: { top: '120px', right: '20px' },
        
        // 延迟提示显示时间（毫秒）
        TIP_DELAY: 3000,
        
        // 最大日志行数
        MAX_LOG_LINES: 100,
        
        // 日志面板默认大小
        DEFAULT_PANEL_SIZE: { width: 420, height: 350 },
        
        // 日志面板最小大小
        MIN_PANEL_SIZE: { width: 300, height: 200 },
        
        // 元素查找超时时间（毫秒）
        ELEMENT_TIMEOUT: 10000,
        
        // 重试间隔（毫秒）
        RETRY_INTERVAL: 500,
        
        // 最大重试次数
        MAX_RETRIES: 20
    };

    // ==================== 存储键名定义 ====================
    
    /**
     * 存储键名常量
     * 用于localStorage存储，添加前缀避免与其他脚本冲突
     */
    const STORAGE_KEYS = {
        // 待处理的清除任务数据
        PENDING_TASK: CONFIG.STORAGE_PREFIX + 'pending_task',
        
        // 状态栏位置
        STATUS_BAR_POSITION: CONFIG.STORAGE_PREFIX + 'status_bar_position',
        
        // 日志面板位置
        LOG_PANEL_POSITION: CONFIG.STORAGE_PREFIX + 'log_panel_position',
        
        // 日志面板大小
        LOG_PANEL_SIZE: CONFIG.STORAGE_PREFIX + 'log_panel_size'
    };

    // ==================== 工具函数 ====================
    
    /**
     * 日志输出函数
     * 同时输出到浏览器控制台和日志面板
     * @param {string} msg - 日志消息
     * @param {string} type - 日志类型：info/success/warn/error
     */
    function log(msg, type = 'info') {
        // 输出到浏览器控制台
        const prefix = '[清除头像]';
        if (type === 'error') {
            console.error(prefix, msg);
        } else if (type === 'warn') {
            console.warn(prefix, msg);
        } else {
            console.log(prefix, msg);
        }
        
        // 如果日志面板已创建，同时输出到面板
        if (window.clearAvatarLogger) {
            window.clearAvatarLogger(msg, type);
        }
    }

    /**
     * 保存跨域数据（使用GM存储，支持跨域）
     * 用于保存任务数据，在工单页面和GM工具页面之间传递
     * @param {string} key - 存储键名
     * @param {any} data - 要存储的数据
     */
    function saveCrossDomainData(key, data) {
        try {
            GM_setValue(key, JSON.stringify(data));
            log('跨域数据保存成功: ' + key);
        } catch (e) {
            log('跨域数据存储失败: ' + e.message, 'error');
        }
    }

    /**
     * 读取跨域数据（使用GM存储，支持跨域）
     * @param {string} key - 存储键名
     * @param {any} defaultValue - 默认值
     * @returns {any} 读取的数据或默认值
     */
    function loadCrossDomainData(key, defaultValue = null) {
        try {
            const data = GM_getValue(key);
            if (data) {
                return JSON.parse(data);
            }
        } catch (e) {
            log('跨域数据读取失败: ' + e.message, 'error');
        }
        return defaultValue;
    }

    /**
     * 删除跨域数据
     * @param {string} key - 存储键名
     */
    function deleteCrossDomainData(key) {
        try {
            GM_deleteValue(key);
            log('跨域数据已删除: ' + key);
        } catch (e) {
            log('跨域数据删除失败: ' + e.message, 'error');
        }
    }

    /**
     * 保存数据到localStorage（仅限当前域名）
     * 用于保存UI位置、大小等不需要跨域的数据
     * @param {string} key - 存储键名
     * @param {any} data - 要存储的数据
     */
    function saveToStorage(key, data) {
        try {
            localStorage.setItem(key, JSON.stringify(data));
        } catch (e) {
            log('存储数据失败: ' + e.message, 'error');
        }
    }

    /**
     * 从localStorage读取数据（仅限当前域名）
     * @param {string} key - 存储键名
     * @param {any} defaultValue - 默认值
     * @returns {any} 读取的数据或默认值
     */
    function loadFromStorage(key, defaultValue = null) {
        try {
            const data = localStorage.getItem(key);
            if (data) {
                return JSON.parse(data);
            }
        } catch (e) {
            log('读取存储数据失败: ' + e.message, 'error');
        }
        return defaultValue;
    }

    /**
     * 删除localStorage中的数据
     * @param {string} key - 存储键名
     */
    function deleteFromStorage(key) {
        try {
            localStorage.removeItem(key);
        } catch (e) {
            log('删除存储数据失败: ' + e.message, 'error');
        }
    }

    /**
     * 等待指定时间
     * @param {number} ms - 等待毫秒数
     * @returns {Promise} Promise对象
     */
    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * 等待元素出现
     * @param {string} selector - CSS选择器
     * @param {number} timeout - 超时时间（毫秒）
     * @returns {Promise<Element|null>} 找到的元素或null
     */
    function waitForElement(selector, timeout = CONFIG.ELEMENT_TIMEOUT) {
        return new Promise(resolve => {
            const startTime = Date.now();
            
            // 检查元素的函数
            const check = () => {
                const element = document.querySelector(selector);
                if (element) {
                    resolve(element);
                    return;
                }
                
                // 检查是否超时
                if (Date.now() - startTime >= timeout) {
                    resolve(null);
                    return;
                }
                
                // 继续等待
                setTimeout(check, CONFIG.RETRY_INTERVAL);
            };
            
            check();
        });
    }

    /**
     * 等待多个元素中的任意一个出现
     * @param {string[]} selectors - CSS选择器数组
     * @param {number} timeout - 超时时间（毫秒）
     * @returns {Promise<Element|null>} 找到的元素或null
     */
    function waitForAnyElement(selectors, timeout = CONFIG.ELEMENT_TIMEOUT) {
        return new Promise(resolve => {
            const startTime = Date.now();
            
            const check = () => {
                for (const selector of selectors) {
                    const element = document.querySelector(selector);
                    if (element) {
                        resolve(element);
                        return;
                    }
                }
                
                if (Date.now() - startTime >= timeout) {
                    resolve(null);
                    return;
                }
                
                setTimeout(check, CONFIG.RETRY_INTERVAL);
            };
            
            check();
        });
    }

    // ==================== 页面判断函数 ====================
    
    /**
     * 判断当前页面是否为工单列表页面
     * @returns {boolean} 是否为工单列表页面
     */
    function isTicketPage() {
        const url = window.location.href;
        const hash = window.location.hash || '';
        // 同时检查 URL 和 hash，确保在 SPA 路由变化时也能正确识别
        return url.includes('ml-panel.aihelp.net') && (hash.includes('tasks') || url.includes('tasks'));
    }

    /**
     * 判断当前页面是否为GM工具页面
     * @returns {boolean} 是否为GM工具页面
     */
    function isGMToolPage() {
        const url = window.location.href;
        return url.includes('gm.moba.youngjoygame.com');
    }

    /**
     * 判断当前页面是否为GM工具的banTool页面
     * @returns {boolean} 是否为banTool页面
     */
    function isBanToolPage() {
        const hash = window.location.hash || '';
        return hash.includes('banTool');
    }

    // ==================== 状态栏UI类 ====================
    
    /**
     * 状态栏UI类
     * 负责创建和管理状态栏界面，包括：
     * - 两区域图标（清、日）
     * - 拖拽功能
     * - 位置记忆
     * - 延迟提示
     * - 日志面板
     */
    class StatusbarUI {
        /**
         * 构造函数
         * @param {Object} config - 配置选项
         */
        constructor(config = {}) {
            // 合并配置
            this.config = {
                maxLogLines: CONFIG.MAX_LOG_LINES,
                initialPosition: CONFIG.INITIAL_POSITION,
                tipDelay: CONFIG.TIP_DELAY,
                defaultPanelSize: CONFIG.DEFAULT_PANEL_SIZE,
                minPanelSize: CONFIG.MIN_PANEL_SIZE,
                ...config
            };
            
            // DOM元素引用
            this.container = null;          // 主容器
            this.iconElement = null;        // 图标容器
            this.expandedElement = null;    // 展开的日志面板
            this.logContainer = null;       // 日志内容容器
            
            // 区域元素引用
            this.zones = {};                // 存储各区域的DOM元素
            
            // 状态变量
            this.isDragging = false;        // 是否正在拖拽状态栏
            this.isExpanded = false;        // 日志面板是否展开
            this.isPanelDragging = false;   // 是否正在拖拽日志面板
            this.isResizing = false;        // 是否正在调整日志面板大小
            
            // 延迟提示相关
            this.delayedTipTimers = {};     // 延迟提示定时器
            this.delayedTipElements = {};   // 延迟提示DOM元素
            
            // 区域提示信息
            this.zoneTips = {
                clear: { title: '清除头像', desc: '提取信息并清除头像冷却' },
                log: { title: '日志面板', desc: '查看执行日志' }
            };
            
            // 点击回调函数
            this.actionCallbacks = {
                clear: null,
                log: null
            };
            
            // 日志数据
            this.logData = [];
            
            // 初始化
            this.init();
        }

        /**
         * 初始化状态栏
         * 按顺序执行：注入样式 -> 创建DOM -> 绑定事件
         */
        init() {
            this.injectStyles();
            this.createDOM();
            this.bindEvents();
        }

        /**
         * 注入CSS样式
         * 使用GM_addStyle注入样式到页面
         */
        injectStyles() {
            GM_addStyle(`
                /* 主容器样式 */
                .ca-status-bar-container {
                    position: fixed;
                    z-index: 999999;
                    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                    user-select: none;
                }

                /* 两区域图标容器 */
                .ca-status-icon {
                    width: 44px;
                    height: 44px;
                    border-radius: 8px;
                    background: #fff;
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    grid-template-rows: 1fr;
                    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
                    cursor: move;
                    border: 1px solid rgba(0, 0, 0, 0.08);
                    transition: transform 0.2s, box-shadow 0.2s;
                }
                
                .ca-status-icon:hover {
                    box-shadow: 0 6px 20px rgba(0, 0, 0, 0.2);
                }
                
                .ca-status-icon.dragging {
                    cursor: grabbing;
                    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.25);
                }

                /* 功能区域通用样式 */
                .ca-icon-zone {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 14px;
                    font-weight: 600;
                    cursor: pointer;
                    transition: background 0.15s ease, opacity 0.15s ease;
                    position: relative;
                    width: 22px;
                    height: 44px;
                    flex-shrink: 0;
                    overflow: visible;
                }

                /* 清除头像区域 - 左侧 - 绿色 */
                .ca-icon-zone-clear {
                    background: linear-gradient(135deg, #52c41a 0%, #73d13d 100%);
                    color: white;
                    border-radius: 6px 0 0 6px;
                }
                
                .ca-icon-zone-clear:hover {
                    background: linear-gradient(135deg, #3fad0a 0%, #5cb82d 100%);
                }
                
                .ca-icon-zone-clear:active {
                    opacity: 0.7;
                }

                /* 日志区域 - 右侧 - 蓝色 */
                .ca-icon-zone-log {
                    background: linear-gradient(135deg, #3370ff 0%, #4e8cff 100%);
                    color: white;
                    border-radius: 0 6px 6px 0;
                }
                
                .ca-icon-zone-log:hover {
                    background: linear-gradient(135deg, #285acc 0%, #3d6fd9 100%);
                }
                
                .ca-icon-zone-log:active {
                    opacity: 0.7;
                }

                /* 成功状态 */
                .ca-icon-zone.success {
                    background: linear-gradient(135deg, #52c41a 0%, #73d13d 100%) !important;
                }

                /* 处理中状态 */
                .ca-icon-zone.processing {
                    opacity: 0.6;
                }

                /* 区域文本 */
                .ca-zone-text {
                    pointer-events: none;
                }

                /* 日志面板 */
                .ca-status-expanded {
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
                    overflow: auto;
                }

                .ca-status-expanded.dragging {
                    cursor: move;
                    user-select: none;
                }

                .ca-status-expanded.resizing {
                    user-select: none;
                }

                /* 面板头部 */
                .ca-panel-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    border-bottom: 1px solid rgba(0, 0, 0, 0.05);
                    padding-bottom: 8px;
                    cursor: move;
                    flex-shrink: 0;
                }

                .ca-panel-header:active {
                    cursor: grabbing;
                }

                /* 调整大小手柄 */
                .ca-resize-handle {
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

                .ca-resize-handle:hover {
                    background: linear-gradient(135deg, transparent 50%, rgba(51, 112, 255, 0.5) 50%);
                }

                /* 面板标题 */
                .ca-status-title {
                    font-size: 13px;
                    font-weight: 600;
                    color: #1d1d1f;
                }

                /* 关闭按钮 */
                .ca-status-close {
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
                
                .ca-status-close:hover {
                    background: #e5e5e7;
                    color: #1d1d1f;
                }

                /* 操作按钮容器 */
                .ca-status-actions {
                    display: flex;
                    flex-wrap: wrap;
                    gap: 8px;
                    flex-shrink: 0;
                }

                /* 操作按钮样式 */
                .ca-status-actions button {
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

                .btn-clear {
                    background: linear-gradient(135deg, #52c41a 0%, #73d13d 100%);
                    color: white;
                }
                
                .btn-clear:hover {
                    transform: translateY(-1px);
                }
                
                .btn-clear.success {
                    background: linear-gradient(135deg, #52c41a 0%, #73d13d 100%) !important;
                }

                /* 日志容器 */
                .ca-status-logs {
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

                /* 日志条目 */
                .ca-log-item {
                    margin-bottom: 4px;
                    padding-bottom: 2px;
                    border-bottom: 1px solid rgba(0,0,0,0.02);
                    word-break: break-all;
                }

                /* 日志类型样式 */
                .ca-log-info { color: #1d1d1f; }
                .ca-log-success { color: #52c41a; }
                .ca-log-warn { color: #faad14; }
                .ca-log-error { color: #ff4d4f; }

                /* 延迟提示框 */
                .ca-delayed-tip {
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
                
                .ca-delayed-tip.visible {
                    opacity: 1;
                    transform: translateX(-50%) translateY(0);
                }
                
                .ca-delayed-tip-title {
                    font-weight: 600;
                    margin-bottom: 4px;
                    color: #fff;
                }
                
                .ca-delayed-tip-desc {
                    font-size: 11px;
                    color: rgba(255, 255, 255, 0.85);
                }
            `);
        }

        /**
         * 创建DOM元素
         * 构建状态栏和日志面板的HTML结构
         */
        createDOM() {
            // 创建主容器
            this.container = document.createElement('div');
            this.container.id = 'ca-statusbar';
            this.container.className = 'ca-status-bar-container';

            // 设置初始位置（优先使用保存的位置）
            const savedPosition = loadFromStorage(STORAGE_KEYS.STATUS_BAR_POSITION);
            if (savedPosition) {
                this.container.style.left = savedPosition.left + 'px';
                this.container.style.top = savedPosition.top + 'px';
                this.container.style.right = 'auto';
            } else {
                Object.assign(this.container.style, this.config.initialPosition);
            }

            // 创建图标容器
            this.iconElement = document.createElement('div');
            this.iconElement.className = 'ca-status-icon';

            // 创建"清除头像"区域（左侧）
            const zoneClear = document.createElement('div');
            zoneClear.className = 'ca-icon-zone ca-icon-zone-clear';
            zoneClear.innerHTML = '<span class="ca-zone-text">清</span>';
            zoneClear.dataset.zone = 'clear';

            // 创建"日志"区域（右侧）
            const zoneLog = document.createElement('div');
            zoneLog.className = 'ca-icon-zone ca-icon-zone-log';
            zoneLog.innerHTML = '<span class="ca-zone-text">日</span>';
            zoneLog.dataset.zone = 'log';

            // 将区域添加到图标容器
            this.iconElement.append(zoneClear, zoneLog);
            this.zones = { clear: zoneClear, log: zoneLog };

            // 创建日志面板
            this.expandedElement = document.createElement('div');
            this.expandedElement.className = 'ca-status-expanded';
            this.expandedElement.style.display = 'none';
            this.expandedElement.style.transform = 'scale(0.8)';
            this.expandedElement.style.opacity = '0';

            // 设置日志面板大小（优先使用保存的大小）
            const savedSize = loadFromStorage(STORAGE_KEYS.LOG_PANEL_SIZE, this.config.defaultPanelSize);
            this.expandedElement.style.width = savedSize.width + 'px';
            this.expandedElement.style.height = savedSize.height + 'px';

            // 创建面板头部
            const header = document.createElement('div');
            header.className = 'ca-panel-header';
            header.innerHTML = `
                <span class="ca-status-title">清除头像冷却时间</span>
                <button class="ca-status-close">×</button>
            `;

            // 创建操作按钮容器
            this.actionContainer = document.createElement('div');
            this.actionContainer.className = 'ca-status-actions';
            this.actionContainer.style.flexShrink = '0';

            // 添加"清除头像"按钮
            this.addButton('清除头像', 'btn-clear', (btn) => {
                if (this.actionCallbacks.clear) {
                    this.actionCallbacks.clear(btn);
                }
            });

            // 创建日志容器
            this.logContainer = document.createElement('div');
            this.logContainer.className = 'ca-status-logs';

            // 创建调整大小手柄
            const resizeHandle = document.createElement('div');
            resizeHandle.className = 'ca-resize-handle';

            // 组装日志面板
            this.expandedElement.append(header, this.actionContainer, this.logContainer, resizeHandle);

            // 组装主容器
            this.container.append(this.iconElement, this.expandedElement);

            // 添加到页面
            document.body.appendChild(this.container);
        }

        /**
         * 绑定事件
         * 包括拖拽、点击、延迟提示等事件
         */
        bindEvents() {
            // 状态栏拖拽相关变量
            let mouseDownPos = { x: 0, y: 0 };
            let hasMoved = false;

            /**
             * 鼠标按下事件处理
             * 开始拖拽或准备点击
             */
            const handleMouseDown = (e) => {
                if (e.button !== 0) return; // 只处理左键
                
                mouseDownPos = { x: e.clientX, y: e.clientY };
                hasMoved = false;
                this.isDragging = false;

                // 计算鼠标在容器内的偏移量
                const rect = this.container.getBoundingClientRect();
                const offset = { x: e.clientX - rect.left, y: e.clientY - rect.top };

                /**
                 * 鼠标移动事件处理
                 * 执行拖拽操作
                 */
                const handleMouseMove = (moveEvent) => {
                    const dx = moveEvent.clientX - mouseDownPos.x;
                    const dy = moveEvent.clientY - mouseDownPos.y;

                    // 移动超过5px才视为拖拽
                    if (!hasMoved && (Math.abs(dx) > 5 || Math.abs(dy) > 5)) {
                        hasMoved = true;
                        this.isDragging = true;
                        this.iconElement.classList.add('dragging');
                        this.container.style.transition = 'none';
                        this.hideAllDelayedTips();
                    }

                    // 执行拖拽
                    if (this.isDragging) {
                        let newX = moveEvent.clientX - offset.x;
                        let newY = moveEvent.clientY - offset.y;
                        
                        // 限制在可视区域内
                        newX = Math.max(0, Math.min(newX, window.innerWidth - 44));
                        newY = Math.max(0, Math.min(newY, window.innerHeight - 44));
                        
                        this.container.style.left = newX + 'px';
                        this.container.style.top = newY + 'px';
                        this.container.style.right = 'auto';
                    }
                };

                /**
                 * 鼠标释放事件处理
                 * 结束拖拽或执行点击
                 */
                const handleMouseUp = (upEvent) => {
                    document.removeEventListener('mousemove', handleMouseMove);
                    document.removeEventListener('mouseup', handleMouseUp);

                    this.iconElement.classList.remove('dragging');

                    if (this.isDragging) {
                        // 拖拽结束，保存位置
                        this.container.style.transition = 'all 0.3s cubic-bezier(0.18, 0.89, 0.32, 1.28)';
                        this.saveStatusBarPosition();
                    } else {
                        // 点击事件
                        const target = upEvent.target.closest('.ca-icon-zone');
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

            // 绑定状态栏鼠标按下事件
            this.iconElement.addEventListener('mousedown', handleMouseDown);

            // 为每个区域绑定延迟提示事件
            Object.keys(this.zones).forEach(zoneName => {
                const zone = this.zones[zoneName];

                // 鼠标进入：启动延迟提示计时器
                zone.addEventListener('mouseenter', () => {
                    this.startDelayedTipTimer(zoneName);
                });

                // 鼠标离开：取消计时器并隐藏提示
                zone.addEventListener('mouseleave', () => {
                    this.cancelDelayedTipTimer(zoneName);
                    this.hideDelayedTip(zoneName);
                });

                // 鼠标移动：重置计时器
                zone.addEventListener('mousemove', () => {
                    this.cancelDelayedTipTimer(zoneName);
                    this.startDelayedTipTimer(zoneName);
                });
            });

            // 关闭按钮点击事件
            this.expandedElement.querySelector('.ca-status-close').addEventListener('click', (e) => {
                e.stopPropagation();
                this.collapse();
            });

            // 绑定日志面板拖拽和调整大小事件
            this.bindPanelDragEvents();
            this.bindPanelResizeEvents();
        }

        /**
         * 绑定日志面板拖拽事件
         */
        bindPanelDragEvents() {
            const header = this.expandedElement.querySelector('.ca-panel-header');
            if (!header) return;

            let panelMouseDownPos = { x: 0, y: 0 };
            let panelHasMoved = false;
            let panelOffset = { x: 0, y: 0 };

            const handlePanelMouseDown = (e) => {
                if (e.button !== 0) return;
                if (e.target.closest('.ca-status-close')) return;

                this.isPanelDragging = false;
                panelHasMoved = false;
                panelMouseDownPos = { x: e.clientX, y: e.clientY };

                const rect = this.expandedElement.getBoundingClientRect();
                panelOffset = {
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
                        let newX = moveEvent.clientX - panelOffset.x;
                        let newY = moveEvent.clientY - panelOffset.y;
                        
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

        /**
         * 绑定日志面板调整大小事件
         */
        bindPanelResizeEvents() {
            const resizeHandle = this.expandedElement.querySelector('.ca-resize-handle');
            if (!resizeHandle) return;

            let resizeStartPos = { x: 0, y: 0 };
            let resizeStartSize = { width: 0, height: 0 };

            const handleResizeMouseDown = (e) => {
                if (e.button !== 0) return;
                e.preventDefault();
                e.stopPropagation();

                this.isResizing = true;
                resizeStartPos = { x: e.clientX, y: e.clientY };

                const rect = this.expandedElement.getBoundingClientRect();
                resizeStartSize = {
                    width: rect.width,
                    height: rect.height
                };

                this.expandedElement.classList.add('resizing');

                const handleResizeMouseMove = (moveEvent) => {
                    if (!this.isResizing) return;

                    const dx = moveEvent.clientX - resizeStartPos.x;
                    const dy = moveEvent.clientY - resizeStartPos.y;

                    let newWidth = resizeStartSize.width + dx;
                    let newHeight = resizeStartSize.height + dy;

                    // 限制最小大小
                    newWidth = Math.max(this.config.minPanelSize.width, newWidth);
                    newHeight = Math.max(this.config.minPanelSize.height, newHeight);

                    // 限制最大大小
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

        /**
         * 保存状态栏位置到localStorage
         */
        saveStatusBarPosition() {
            if (!this.container) return;
            try {
                const rect = this.container.getBoundingClientRect();
                const position = {
                    left: Math.round(rect.left),
                    top: Math.round(rect.top)
                };
                saveToStorage(STORAGE_KEYS.STATUS_BAR_POSITION, position);
            } catch (e) {
                log('保存状态栏位置失败: ' + e.message, 'error');
            }
        }

        /**
         * 保存日志面板位置到localStorage
         */
        saveLogPanelPosition() {
            if (!this.expandedElement) return;
            try {
                const rect = this.expandedElement.getBoundingClientRect();
                const position = {
                    left: Math.round(rect.left),
                    top: Math.round(rect.top)
                };
                saveToStorage(STORAGE_KEYS.LOG_PANEL_POSITION, position);
            } catch (e) {
                log('保存日志面板位置失败: ' + e.message, 'error');
            }
        }

        /**
         * 保存日志面板大小到localStorage
         */
        saveLogPanelSize() {
            if (!this.expandedElement) return;
            try {
                const rect = this.expandedElement.getBoundingClientRect();
                const size = {
                    width: Math.round(rect.width),
                    height: Math.round(rect.height)
                };
                saveToStorage(STORAGE_KEYS.LOG_PANEL_SIZE, size);
            } catch (e) {
                log('保存日志面板大小失败: ' + e.message, 'error');
            }
        }

        /**
         * 启动延迟提示计时器
         * @param {string} zoneName - 区域名称
         */
        startDelayedTipTimer(zoneName) {
            if (this.delayedTipTimers[zoneName]) {
                clearTimeout(this.delayedTipTimers[zoneName]);
            }

            this.delayedTipTimers[zoneName] = setTimeout(() => {
                this.showDelayedTip(zoneName);
            }, this.config.tipDelay);
        }

        /**
         * 取消延迟提示计时器
         * @param {string} zoneName - 区域名称
         */
        cancelDelayedTipTimer(zoneName) {
            if (this.delayedTipTimers[zoneName]) {
                clearTimeout(this.delayedTipTimers[zoneName]);
                this.delayedTipTimers[zoneName] = null;
            }
        }

        /**
         * 显示延迟提示
         * @param {string} zoneName - 区域名称
         */
        showDelayedTip(zoneName) {
            const zone = this.zones[zoneName];
            if (!zone) return;

            // 创建或获取提示元素
            let tipEl = this.delayedTipElements[zoneName];
            if (!tipEl) {
                tipEl = document.createElement('div');
                tipEl.className = 'ca-delayed-tip';
                const tipInfo = this.zoneTips[zoneName] || { title: '', desc: '' };
                tipEl.innerHTML = `
                    <div class="ca-delayed-tip-title">${tipInfo.title}</div>
                    <div class="ca-delayed-tip-desc">${tipInfo.desc}</div>
                `;
                zone.appendChild(tipEl);
                this.delayedTipElements[zoneName] = tipEl;
            }

            // 设置位置
            tipEl.style.left = '50%';
            tipEl.style.top = '-50px';

            // 触发动画显示
            requestAnimationFrame(() => {
                tipEl.classList.add('visible');
            });
        }

        /**
         * 隐藏延迟提示
         * @param {string} zoneName - 区域名称
         */
        hideDelayedTip(zoneName) {
            const tipEl = this.delayedTipElements[zoneName];
            if (tipEl) {
                tipEl.classList.remove('visible');
            }
        }

        /**
         * 隐藏所有延迟提示
         */
        hideAllDelayedTips() {
            Object.keys(this.delayedTipElements).forEach(zoneName => {
                this.hideDelayedTip(zoneName);
            });
        }

        /**
         * 处理区域点击
         * @param {string} zone - 区域名称
         * @param {Element} element - 被点击的元素
         */
        handleZoneClick(zone, element) {
            if (zone === 'log') {
                // 日志区域：展开/收起面板
                if (this.isExpanded) {
                    this.collapse();
                } else {
                    this.expand();
                }
            } else if (this.actionCallbacks[zone]) {
                // 其他区域：执行注册的回调
                this.actionCallbacks[zone](element);
            }
        }

        /**
         * 注册区域点击回调
         * @param {string} zone - 区域名称
         * @param {Function} callback - 回调函数
         */
        registerZoneCallback(zone, callback) {
            this.actionCallbacks[zone] = callback;
        }

        /**
         * 展开日志面板
         */
        expand() {
            this.isExpanded = true;

            // 加载保存的位置和大小
            const savedPosition = loadFromStorage(STORAGE_KEYS.LOG_PANEL_POSITION);
            const savedSize = loadFromStorage(STORAGE_KEYS.LOG_PANEL_SIZE, this.config.defaultPanelSize);

            if (savedPosition) {
                // 使用保存的位置，但确保不超出屏幕
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
                // 默认显示在状态栏旁边
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

            // 显示面板
            this.iconElement.style.display = 'none';
            this.expandedElement.style.display = 'flex';
            this.expandedElement.offsetHeight; // 触发重排
            this.expandedElement.style.transform = 'scale(1)';
            this.expandedElement.style.opacity = '1';
        }

        /**
         * 收起日志面板
         */
        collapse() {
            this.isExpanded = false;
            this.expandedElement.style.transform = 'scale(0.8)';
            this.expandedElement.style.opacity = '0';
            
            setTimeout(() => {
                if (!this.isExpanded) {
                    this.expandedElement.style.display = 'none';
                    this.iconElement.style.display = 'grid';
                }
            }, 300);
        }

        /**
         * 添加操作按钮
         * @param {string} text - 按钮文本
         * @param {string} className - 按钮样式类名
         * @param {Function} onClick - 点击回调
         * @returns {HTMLButtonElement} 创建的按钮元素
         */
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

        /**
         * 添加日志条目
         * @param {string} msg - 日志消息
         * @param {string} type - 日志类型：info/success/warn/error
         */
        addLog(msg, type = 'info') {
            if (!this.logContainer) return;

            // 创建日志条目元素
            const logItem = document.createElement('div');
            logItem.className = `ca-log-item ca-log-${type}`;

            // 格式化时间戳
            const time = new Date().toLocaleTimeString([], { hour12: false });
            logItem.textContent = `[${time}] ${msg}`;

            // 添加到日志容器
            this.logContainer.appendChild(logItem);

            // 存储日志数据
            this.logData.push({ time, msg, type });

            // 限制日志数量
            if (this.logData.length > this.config.maxLogLines * 1.5) {
                this.logData = this.logData.slice(-this.config.maxLogLines);
            }

            // 清理DOM中的旧日志
            while (this.logContainer.children.length > this.config.maxLogLines) {
                this.logContainer.removeChild(this.logContainer.firstChild);
            }

            // 自动滚动到底部
            this.logContainer.scrollTop = this.logContainer.scrollHeight;
        }

        /**
         * 创建日志通道
         * @returns {Object} 日志方法集合
         */
        createLogChannel() {
            const self = this;
            return {
                log: (msg) => self.addLog(msg, 'info'),
                error: (msg) => self.addLog(msg, 'error'),
                warn: (msg) => self.addLog(msg, 'warn'),
                success: (msg) => self.addLog(msg, 'success')
            };
        }

        /**
         * 显示区域成功状态
         * @param {string} zone - 区域名称
         */
        showZoneSuccess(zone) {
            if (this.zones[zone]) {
                this.zones[zone].classList.add('success');
                setTimeout(() => {
                    this.zones[zone].classList.remove('success');
                }, 1500);
            }
        }

        /**
         * 设置区域处理中状态
         * @param {string} zone - 区域名称
         * @param {boolean} isProcessing - 是否处理中
         */
        showZoneProcessing(zone, isProcessing) {
            if (this.zones[zone]) {
                if (isProcessing) {
                    this.zones[zone].classList.add('processing');
                } else {
                    this.zones[zone].classList.remove('processing');
                }
            }
        }

        /**
         * 设置区域文本
         * @param {string} zone - 区域名称
         * @param {string} text - 新文本
         */
        setZoneText(zone, text) {
            if (this.zones[zone]) {
                const textEl = this.zones[zone].querySelector('.ca-zone-text');
                if (textEl) {
                    textEl.textContent = text;
                }
            }
        }

        /**
         * 重置区域文本
         * @param {string} zone - 区域名称
         */
        resetZoneText(zone) {
            const defaultTexts = {
                clear: '清',
                log: '日'
            };
            if (this.zones[zone]) {
                const textEl = this.zones[zone].querySelector('.ca-zone-text');
                if (textEl) {
                    textEl.textContent = defaultTexts[zone] || '';
                }
            }
        }
    }

    // ==================== 信息提取模块 ====================
    
    /**
     * 从工单页面提取账号信息
     * 从"内部描述"区域提取UID和ServerID
     * @returns {Object|null} 包含uid和serverId的对象，失败返回null
     */
    function extractAccountInfo() {
        log('开始提取账号信息...');
        
        // 获取页面所有文本
        const bodyText = document.body.innerText;
        
        // 使用正则表达式匹配UID
        // 格式：UID = 1186053970 或 UID=1186053970
        const uidPattern = /UID\s*=\s*(\d+)/i;
        const uidMatch = bodyText.match(uidPattern);
        
        // 使用正则表达式匹配ServerID
        // 格式：ServerID = 13814 或 ServerID=13814
        const serverIdPattern = /ServerID\s*=\s*(\d{4,5})/i;
        const serverIdMatch = bodyText.match(serverIdPattern);
        
        if (!uidMatch || !serverIdMatch) {
            log('未找到UID或ServerID', 'warn');
            return null;
        }
        
        const uid = uidMatch[1];
        const serverId = serverIdMatch[1];
        
        log('提取成功 - UID: ' + uid + ', ServerID: ' + serverId, 'success');
        
        return { uid, serverId };
    }

    // ==================== GM工具操作模块 ====================
    
    /**
     * 在GM工具页面执行清除头像操作
     * 包括：选择服务器、输入UID、点击执行
     */
    async function executeClearAvatar() {
        log('开始执行清除头像操作...');
        
        // 从跨域存储获取待处理的任务数据
        const taskData = loadCrossDomainData(STORAGE_KEYS.PENDING_TASK);
        if (!taskData) {
            log('没有待处理的任务', 'warn');
            return;
        }
        
        const { uid, serverId } = taskData;
        log('待处理任务 - UID: ' + uid + ', ServerID: ' + serverId);
        
        // 检查是否在正确的页面
        if (!window.location.hash.includes('banTool')) {
            log('当前不在banTool页面，尝试跳转...', 'warn');
            window.location.hash = '/customer/banTool';
            return;
        }
        
        try {
            // ==================== 步骤1：等待页面加载完成 ====================
            log('等待页面加载...');
            
            // 等待页面完全加载（增加等待时间）
            await sleep(3000);
            
            // 额外等待：检测页面是否有内容
            let pageReady = false;
            let waitCount = 0;
            const maxWait = 20; // 最多等待 20 次，每次 500ms
            
            while (!pageReady && waitCount < maxWait) {
                // 检查页面是否有主要内容
                const hasContent = document.querySelector('.ant-select-selector, .item, .el-input');
                if (hasContent) {
                    pageReady = true;
                    log('页面内容已加载');
                } else {
                    waitCount++;
                    log('等待页面内容加载... (' + waitCount + '/' + maxWait + ')');
                    await sleep(500);
                }
            }
            
            if (!pageReady) {
                log('页面加载超时，继续尝试执行...', 'warn');
            }
            
            // ==================== 步骤2：查找并点击ServerID选择框 ====================
            log('查找ServerID选择框...');
            
            // 等待选择框出现
            const serverIdSelector = await waitForElement('.ant-select-selector', 10000);
            if (!serverIdSelector) {
                log('未找到ServerID选择框，请检查页面是否正确加载', 'error');
                return;
            }
            
            log('找到ServerID选择框，准备点击...');
            
            // 滚动到选择框可见位置
            serverIdSelector.scrollIntoView({ behavior: 'smooth', block: 'center' });
            await sleep(300);
            
            // 使用多种方式触发点击
            // 方式1：模拟鼠标事件（不使用 view 属性）
            try {
                const mouseDownEvent = new MouseEvent('mousedown', {
                    bubbles: true,
                    cancelable: true
                });
                serverIdSelector.dispatchEvent(mouseDownEvent);
                
                await sleep(50);
                
                const mouseUpEvent = new MouseEvent('mouseup', {
                    bubbles: true,
                    cancelable: true
                });
                serverIdSelector.dispatchEvent(mouseUpEvent);
                
                log('已触发鼠标事件');
            } catch (e) {
                log('鼠标事件触发失败: ' + e.message, 'warn');
            }
            
            await sleep(100);
            
            // 方式2：直接调用 click()
            serverIdSelector.click();
            
            log('已点击选择框');
            await sleep(800);
            
            // ==================== 步骤3：等待下拉框显示 ====================
            log('等待下拉框显示...');
            
            // 等待下拉框出现（移除 hidden 类）
            let dropdown = null;
            let retryCount = 0;
            const maxRetries = 15;
            
            while (!dropdown && retryCount < maxRetries) {
                dropdown = document.querySelector('.ant-select-dropdown:not(.ant-select-dropdown-hidden)');
                if (!dropdown) {
                    // 再次点击尝试打开
                    log('下拉框未显示，尝试再次点击...');
                    serverIdSelector.click();
                    await sleep(500);
                    retryCount++;
                }
            }
            
            if (!dropdown) {
                log('下拉框未能打开，尝试直接输入...', 'warn');
            } else {
                log('下拉框已打开');
            }
            
            // ==================== 步骤4：输入ServerID进行搜索 ====================
            log('输入ServerID: ' + serverId);
            
            // 查找搜索输入框
            const searchInput = document.querySelector('.ant-select-selection-search-input');
            if (!searchInput) {
                log('未找到搜索输入框', 'error');
                return;
            }
            
            // 聚焦输入框
            searchInput.focus();
            await sleep(100);
            
            // 使用原生setter设置值（解决Vue/React双向绑定问题）
            const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
            nativeInputValueSetter.call(searchInput, serverId);
            
            // 触发input事件
            searchInput.dispatchEvent(new Event('input', { bubbles: true }));
            searchInput.dispatchEvent(new Event('change', { bubbles: true }));
            
            log('已输入ServerID，等待选项加载...');
            await sleep(800);
            
            // ==================== 步骤5：选择匹配的ServerID选项 ====================
            log('查找匹配的ServerID选项...');
            
            // 重新获取下拉框（可能已更新）
            dropdown = document.querySelector('.ant-select-dropdown:not(.ant-select-dropdown-hidden)');
            if (!dropdown) {
                log('下拉框已关闭', 'error');
                return;
            }
            
            // 查找所有选项
            const options = dropdown.querySelectorAll('.ant-select-item-option');
            log('找到 ' + options.length + ' 个选项');
            
            // 查找匹配的选项（title 以 serverId 开头，格式如 "12916-xxx"）
            let matchedOption = null;
            for (const option of options) {
                const title = option.getAttribute('title') || '';
                log('检查选项: ' + title);
                if (title.startsWith(serverId + '-') || title === serverId) {
                    matchedOption = option;
                    log('找到匹配选项: ' + title, 'success');
                    break;
                }
            }
            
            if (matchedOption) {
                log('点击选择ServerID选项...');
                matchedOption.click();
                await sleep(500);
                log('ServerID选择完成', 'success');
            } else {
                log('未找到匹配的ServerID选项，尝试选择第一个选项...', 'warn');
                if (options.length > 0) {
                    options[0].click();
                    await sleep(500);
                }
            }
            
            // ==================== 步骤6：查找"清除上传头像倒计时"区域 ====================
            log('查找"清除上传头像倒计时"区域...');
            
            // 查找包含该文本的 span 元素
            const allSpans = document.querySelectorAll('span');
            let targetSpan = null;
            
            for (const span of allSpans) {
                if (span.textContent.trim() === '清除上传头像倒计时') {
                    targetSpan = span;
                    break;
                }
            }
            
            if (!targetSpan) {
                log('未找到"清除上传头像倒计时"区域', 'error');
                return;
            }
            
            log('找到目标区域');
            
            // 获取祖父容器（.item）
            const itemContainer = targetSpan.closest('.item');
            if (!itemContainer) {
                log('未找到功能区域容器', 'error');
                return;
            }
            
            // 滚动到可见位置
            itemContainer.scrollIntoView({ behavior: 'smooth', block: 'center' });
            await sleep(500);
            
            // ==================== 步骤7：输入UID ====================
            log('查找UID输入框...');
            
            // 在功能区域内查找UID输入框
            const uidInput = itemContainer.querySelector('input[placeholder="UID"]');
            if (!uidInput) {
                log('未找到UID输入框', 'error');
                return;
            }
            
            log('找到UID输入框，输入UID: ' + uid);
            
            // 聚焦输入框
            uidInput.focus();
            await sleep(100);
            
            // 使用原生setter设置值
            nativeInputValueSetter.call(uidInput, uid);
            
            // 触发事件
            uidInput.dispatchEvent(new Event('input', { bubbles: true }));
            uidInput.dispatchEvent(new Event('change', { bubbles: true }));
            uidInput.dispatchEvent(new Event('blur', { bubbles: true }));
            
            log('UID输入完成', 'success');
            await sleep(300);
            
            // ==================== 步骤8：点击执行按钮 ====================
            log('查找执行按钮...');
            
            // 在功能区域内查找执行按钮（播放图标）
            const executeBtn = itemContainer.querySelector('.el-icon-video-play[title="运行"]');
            if (!executeBtn) {
                log('未找到执行按钮', 'error');
                return;
            }
            
            log('找到执行按钮，准备点击...');
            
            // 点击执行按钮
            executeBtn.click();
            log('已点击执行按钮', 'success');
            
            // ==================== 步骤9：等待执行结果 ====================
            log('等待执行结果...');
            await sleep(3000);
            
            // 检查右侧结果栏
            // 尝试查找包含 Result 的元素
            const allElements = document.querySelectorAll('*');
            let resultFound = false;
            let isSuccess = false;
            
            for (const el of allElements) {
                const text = el.textContent || '';
                if (text.includes('Result:Ok') || text.includes('Result: Ok')) {
                    log('清除头像冷却时间成功！', 'success');
                    resultFound = true;
                    isSuccess = true;
                    break;
                } else if (text.includes('Result:Error') || text.includes('Result: Error')) {
                    log('清除头像冷却时间失败，请检查参数', 'error');
                    resultFound = true;
                    isSuccess = false;
                    break;
                }
            }
            
            if (!resultFound) {
                log('操作已执行，请查看右侧结果栏确认', 'warn');
            }
            
            // 清除待处理任务（跨域存储）
            deleteCrossDomainData(STORAGE_KEYS.PENDING_TASK);
            log('任务完成，已清除待处理数据');
            
            // ==================== 步骤10：自动关闭弹窗 ====================
            // 检查是否是通过弹窗打开的（有 opener 且窗口名称匹配）
            const isPopup = window.opener && window.name === 'GM_Tool_ClearAvatar';
            
            if (isPopup) {
                log('3秒后自动关闭弹窗...');
                await sleep(3000);
                
                // 显示关闭提示
                log('正在关闭弹窗...', 'success');
                await sleep(500);
                
                // 关闭窗口
                window.close();
                
                // 如果 window.close() 被浏览器阻止，提示用户手动关闭
                log('如果窗口未关闭，请手动关闭此页面', 'warn');
            } else {
                log('当前不是弹窗模式，请手动关闭页面', 'info');
            }
            
        } catch (e) {
            log('执行过程中发生错误: ' + e.message, 'error');
            console.error('[清除头像] 详细错误:', e);
        }
    }

    // ==================== 主程序入口 ====================
    
    // UI 实例引用（避免重复创建）
    let uiInstance = null;
    
    /**
     * 初始化工单页面功能
     * 创建状态栏UI并注册事件
     */
    function initTicketPage() {
        // 检查是否已创建UI
        if (uiInstance) {
            log('状态栏已存在，跳过创建');
            return;
        }
        
        log('初始化工单页面功能...');
        
        // 创建状态栏UI
        uiInstance = new StatusbarUI();
        
        // 创建日志通道
        const logger = uiInstance.createLogChannel();
        window.clearAvatarLogger = (msg, type) => logger[type === 'info' ? 'log' : type](msg);
        
        // 注册"清除头像"区域点击回调
        uiInstance.registerZoneCallback('clear', async (element) => {
            log('点击了清除头像区域');
            
            // 显示处理中状态
            uiInstance.showZoneProcessing('clear', true);
            uiInstance.setZoneText('clear', '...');
            
            try {
                // 提取账号信息
                const accountInfo = extractAccountInfo();
                
                if (!accountInfo) {
                    log('未能提取到账号信息，请确保已打开工单详情', 'error');
                    uiInstance.showZoneProcessing('clear', false);
                    uiInstance.resetZoneText('clear');
                    return;
                }
                
                // 保存任务数据到跨域存储（GM存储）
                saveCrossDomainData(STORAGE_KEYS.PENDING_TASK, accountInfo);
                log('已保存任务数据，准备打开GM工具页面...');
                
                // 显示成功状态
                uiInstance.showZoneSuccess('clear');
                uiInstance.resetZoneText('clear');
                uiInstance.showZoneProcessing('clear', false);
                
                // ==================== 打开GM工具页面 ====================
                // 方案一：新标签页（已注释，备用）
                // log('正在打开GM工具页面（新标签页）...');
                // GM_openInTab(CONFIG.GM_TOOL_URL, { active: true });
                
                // 方案三：弹窗方式（当前使用）
                log('正在打开GM工具页面（弹窗）...');
                const popupWidth = 1200;
                const popupHeight = 800;
                const popupLeft = (window.screen.width - popupWidth) / 2;
                const popupTop = (window.screen.height - popupHeight) / 2;
                
                const popupFeatures = [
                    'width=' + popupWidth,
                    'height=' + popupHeight,
                    'left=' + popupLeft,
                    'top=' + popupTop,
                    'resizable=yes',
                    'scrollbars=yes',
                    'status=yes',
                    'menubar=no',
                    'toolbar=no',
                    'location=yes'
                ].join(',');
                
                const popupWindow = window.open(CONFIG.GM_TOOL_URL, 'GM_Tool_ClearAvatar', popupFeatures);
                
                if (popupWindow) {
                    log('弹窗已打开', 'success');
                } else {
                    log('弹窗被浏览器拦截，请允许弹窗或手动打开GM工具', 'warn');
                    // 备用方案：如果弹窗被拦截，使用新标签页
                    // GM_openInTab(CONFIG.GM_TOOL_URL, { active: true });
                }
                
            } catch (e) {
                log('处理失败: ' + e.message, 'error');
                uiInstance.showZoneProcessing('clear', false);
                uiInstance.resetZoneText('clear');
            }
        });
        
        log('状态栏创建完成');
    }
    
    /**
     * 初始化GM工具页面功能
     * 检查待处理任务并执行
     */
    function initGMToolPage() {
        log('检测到GM工具页面，检查待处理任务...');
        
        // 从跨域存储读取任务数据
        const taskData = loadCrossDomainData(STORAGE_KEYS.PENDING_TASK);
        log('任务数据: ' + JSON.stringify(taskData));
        
        if (taskData && isBanToolPage()) {
            log('发现待处理任务，准备执行...');
            
            // 创建简单的日志显示（在GM工具页面也显示日志）
            const logDiv = document.createElement('div');
            logDiv.style.cssText = `
                position: fixed;
                top: 10px;
                right: 10px;
                width: 300px;
                max-height: 200px;
                overflow-y: auto;
                background: rgba(0,0,0,0.8);
                color: #fff;
                padding: 10px;
                border-radius: 8px;
                font-size: 12px;
                z-index: 999999;
                font-family: monospace;
            `;
            document.body.appendChild(logDiv);
            
            window.clearAvatarLogger = (msg, type) => {
                const colors = {
                    info: '#fff',
                    success: '#52c41a',
                    warn: '#faad14',
                    error: '#ff4d4f'
                };
                const time = new Date().toLocaleTimeString([], { hour12: false });
                const div = document.createElement('div');
                div.style.color = colors[type] || '#fff';
                div.textContent = `[${time}] ${msg}`;
                logDiv.appendChild(div);
                logDiv.scrollTop = logDiv.scrollHeight;
            };
            
            // 等待页面完全加载后执行
            if (document.readyState === 'complete') {
                setTimeout(executeClearAvatar, 1500);
            } else {
                window.addEventListener('load', () => {
                    setTimeout(executeClearAvatar, 1500);
                });
            }
        } else {
            log('没有待处理的任务或不在banTool页面');
        }
    }
    
    /**
     * 主程序初始化
     * 根据当前页面类型执行不同的逻辑
     */
    function main() {
        log('脚本启动，当前页面: ' + window.location.href);
        log('当前 hash: ' + window.location.hash);
        
        if (isTicketPage()) {
            // 工单列表页面：延迟创建状态栏UI（等待SPA加载）
            log('检测到工单列表页面，准备创建状态栏...');
            setTimeout(initTicketPage, 1000);
            
        } else if (isGMToolPage()) {
            // GM工具页面：检查是否有待处理的任务
            setTimeout(initGMToolPage, 1000);
        } else {
            log('当前页面不是目标页面');
        }
    }
    
    /**
     * 监听 SPA 路由变化
     * 当 hash 变化时重新检查页面类型
     */
    function setupHashChangeListener() {
        window.addEventListener('hashchange', () => {
            log('检测到 hash 变化: ' + window.location.hash);
            
            // 延迟执行，等待 SPA 渲染完成
            setTimeout(() => {
                if (isTicketPage() && !uiInstance) {
                    log('hash 变化后检测到工单页面，初始化...');
                    initTicketPage();
                } else if (isGMToolPage() && isBanToolPage()) {
                    log('hash 变化后检测到 banTool 页面，检查任务...');
                    initGMToolPage();
                }
            }, 500);
        });
    }

    // 启动脚本
    log('========== 清除头像冷却时间脚本加载 ==========');
    
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            main();
            setupHashChangeListener();
        });
    } else {
        main();
        setupHashChangeListener();
    }

})();

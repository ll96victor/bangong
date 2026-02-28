// ==UserScript==
// @name         AIHelp工单批量筛选与处理工具
// @namespace    http://tampermonkey.net/
// @version      2.0
// @description  AIHelp工单批量筛选与批量处理工具，提供一键快捷操作
// @author       YourName
// @match        https://ml-panel.aihelp.net/dashboard/*
// @exclude      *://*/ticket*
// @grant        none
// @run-at       document-end
// ==/UserScript==

(function() {
    'use strict';

    // ==================== 最优先：URL检查 - 快速退出机制 ====================
    const currentUrl = window.location.href;
    if (currentUrl.includes('ticket')) {
        console.log('[AIHelp工单工具] URL包含ticket，跳过脚本加载');
        return;
    }

    if (!currentUrl.includes('tasks?searchType')) {
        console.log('[AIHelp工单工具] 非目标页面，跳过脚本加载');
        return;
    }

    console.log('[AIHelp工单工具] 目标页面，开始加载脚本');

    // ==================== 常量定义 ====================
    const STYLE_ID = 'aihelp-task-toolbar-styles';
    const TOOLBAR_ID = 'aihelp-task-toolbar';
    const LOG_PANEL_ID = 'aihelp-log-panel';
    const STORAGE_KEYS = {
        STATUS_BAR_POSITION: 'aihelp_tools_status_bar_position',
        LOG_PANEL_POSITION: 'aihelp_tools_log_panel_position',
        LOG_PANEL_SIZE: 'aihelp_tools_log_panel_size'
    };

    // ==================== 全局状态锁 ====================
    class ScriptState {
        constructor() { this.isProcessing = false; }
        reset() { this.isProcessing = false; }
        async withLock(asyncFn) {
            if (this.isProcessing) {
                console.log('[AIHelp工单工具] 操作正在执行中，请稍候');
                return null;
            }
            this.isProcessing = true;
            try {
                return await asyncFn();
            } finally {
                this.isProcessing = false;
            }
        }
    }
    const scriptState = new ScriptState();

    // ==================== 工具函数 ====================
    const ToolUtil = {
        waitForElement(selector, timeout = 5000) {
            return new Promise((resolve, reject) => {
                const el = document.querySelector(selector);
                if (el && this.isElementAvailable(el)) return resolve(el);

                const observer = new MutationObserver(() => {
                    const el = document.querySelector(selector);
                    if (el && this.isElementAvailable(el)) {
                        observer.disconnect();
                        resolve(el);
                    }
                });

                observer.observe(document.body, { childList: true, subtree: true });

                setTimeout(() => {
                    observer.disconnect();
                    reject(new Error(`Timeout waiting for element: ${selector}`));
                }, timeout);
            });
        },

        isElementAvailable(el) {
            if (!el) return false;
            const style = window.getComputedStyle(el);
            return style.display !== 'none' &&
                   style.visibility !== 'hidden' &&
                   style.opacity !== '0' &&
                   el.offsetParent !== null &&
                   !el.disabled;
        },

        async clickElement(selector, options = {}) {
            const { timeout = 5000, needScroll = false } = options;
            const el = await this.waitForElement(selector, timeout);
            if (needScroll) {
                el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                await this.sleep(300);
            }
            el.click();
            await this.sleep(300);
            return el;
        },

        async clickByText(selectors, text, options = {}) {
            const { timeout = 5000, needScroll = false } = options;
            const selectorList = Array.isArray(selectors) ? selectors : [selectors];

            for (const selector of selectorList) {
                try {
                    const els = await this.waitForAll(selector, timeout);
                    for (const el of els) {
                        if (el.textContent.trim().includes(text) && this.isElementAvailable(el)) {
                            if (needScroll) {
                                el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                await this.sleep(300);
                            }
                            el.click();
                            await this.sleep(300);
                            return el;
                        }
                    }
                } catch (e) {
                    continue;
                }
            }
            throw new Error(`Element with text "${text}" not found`);
        },

        waitForAll(selector, timeout = 5000) {
            return new Promise((resolve, reject) => {
                const check = () => document.querySelectorAll(selector);

                const result = check();
                if (result.length > 0) return resolve(result);

                const observer = new MutationObserver(() => {
                    const result = check();
                    if (result.length > 0) {
                        observer.disconnect();
                        resolve(result);
                    }
                });

                observer.observe(document.body, { childList: true, subtree: true });

                setTimeout(() => {
                    observer.disconnect();
                    reject(new Error(`Timeout waiting for elements: ${selector}`));
                }, timeout);
            });
        },

        async inputText(selector, text, options = {}) {
            const { timeout = 5000, clearFirst = true } = options;
            const el = await this.waitForElement(selector, timeout);

            // 使用原生 setter 解决框架双向绑定问题
            const nativeSetter = Object.getOwnPropertyDescriptor(
                window.HTMLInputElement.prototype, 'value'
            ).set;

            if (clearFirst) {
                nativeSetter.call(el, '');
                el.dispatchEvent(new Event('input', { bubbles: true }));
            }

            nativeSetter.call(el, text);
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
            await this.sleep(300);
            return el;
        },

        sleep(ms) {
            return new Promise(resolve => setTimeout(resolve, ms));
        },

        savePosition(key, element) {
            try {
                const rect = element.getBoundingClientRect();
                const position = {
                    left: Math.round(rect.left) + 'px',
                    top: Math.round(rect.top) + 'px'
                };
                localStorage.setItem(key, JSON.stringify(position));
            } catch (e) {
                console.error('[AIHelp工单工具] 保存位置失败:', e.message);
            }
        },

        loadPosition(key, element) {
            try {
                const saved = localStorage.getItem(key);
                if (saved) {
                    const pos = JSON.parse(saved);
                    if (pos.left !== undefined && pos.top !== undefined) {
                        element.style.position = 'fixed';
                        element.style.left = pos.left;
                        element.style.top = pos.top;
                        element.style.right = 'auto';
                        element.style.bottom = 'auto';
                        return true;
                    }
                }
            } catch (e) {
                console.error('[AIHelp工单工具] 读取位置失败:', e.message);
            }
            return false;
        },

        saveSize(key, element) {
            try {
                const rect = element.getBoundingClientRect();
                const size = {
                    width: Math.round(rect.width) + 'px',
                    height: Math.round(rect.height) + 'px'
                };
                localStorage.setItem(key, JSON.stringify(size));
            } catch (e) {
                console.error('[AIHelp工单工具] 保存大小失败:', e.message);
            }
        },

        loadSize(key, element) {
            try {
                const saved = localStorage.getItem(key);
                if (saved) {
                    const size = JSON.parse(saved);
                    if (size.width !== undefined && size.height !== undefined) {
                        element.style.width = size.width;
                        element.style.height = size.height;
                        return true;
                    }
                }
            } catch (e) {
                console.error('[AIHelp工单工具] 读取大小失败:', e.message);
            }
            return false;
        }
    };

    // ==================== 功能模块 ====================
    const actions = [
        { name: '筛选BUG标签', icon: '🔍', shortTip: '筛选BUG标签', detailTip: '筛选包含"AI识别为BUG"标签的工单', execute: async function() {
            await ToolUtil.clickByText(['button', 'span', 'i'], '筛选');
            await ToolUtil.sleep(500);
            await ToolUtil.clickByText(['button', 'span'], '重置');
            await ToolUtil.sleep(500);
            await ToolUtil.clickElement('input[placeholder="请选择标签"]');
            await ToolUtil.sleep(500);
            await ToolUtil.inputText('input.elp-cascader__search-input', 'AI识别为BUG bug identified by ai');
            await ToolUtil.sleep(800);
            await ToolUtil.clickByText(['li', 'span'], 'AI识别为BUG bug identified by ai');
            await ToolUtil.sleep(500);
            await ToolUtil.clickByText(['span'], '筛选', { needScroll: true });
            await ToolUtil.sleep(500);
            return { success: true, message: 'BUG标签筛选完成' };
        }},
        { name: '筛选MCGG标题', icon: '📝', shortTip: '筛选MCGG标题', detailTip: '筛选工单标题中包含"【MCGG】"的工单', execute: async function() {
            await ToolUtil.clickByText(['button', 'span', 'i'], '筛选');
            await ToolUtil.sleep(500);
            await ToolUtil.clickByText(['button', 'span'], '重置');
            await ToolUtil.sleep(500);
            await ToolUtil.clickElement('input[placeholder="请输入工单标题"]');
            await ToolUtil.sleep(300);
            await ToolUtil.inputText('input[placeholder="请输入工单标题"]', '【MCGG】');
            await ToolUtil.sleep(500);
            await ToolUtil.clickByText(['span'], '筛选', { needScroll: true });
            await ToolUtil.sleep(500);
            return { success: true, message: 'MCGG标题筛选完成' };
        }},
        { name: '筛选s57描述', icon: '📄', shortTip: '筛选s57描述', detailTip: '筛选工单描述中包含"s57"的工单', execute: async function() {
            await ToolUtil.clickByText(['button', 'span', 'i'], '筛选');
            await ToolUtil.sleep(500);
            await ToolUtil.clickByText(['button', 'span'], '重置');
            await ToolUtil.sleep(500);
            await ToolUtil.clickElement('input[placeholder="请输入描述"]');
            await ToolUtil.sleep(300);
            await ToolUtil.inputText('input[placeholder="请输入描述"]', 's57');
            await ToolUtil.sleep(500);
            await ToolUtil.clickByText(['span'], '筛选', { needScroll: true });
            await ToolUtil.sleep(500);
            return { success: true, message: 's57描述筛选完成' };
        }},
        { name: '清除筛选', icon: '🗑️', shortTip: '清除筛选', detailTip: '清除所有筛选条件，显示全部工单', execute: async function() {
            await ToolUtil.clickByText(['button', 'span', 'i'], '筛选');
            await ToolUtil.sleep(500);
            await ToolUtil.clickByText(['button', 'span'], '重置');
            await ToolUtil.sleep(500);
            await ToolUtil.clickByText(['span'], '筛选', { needScroll: true });
            await ToolUtil.sleep(500);
            return { success: true, message: '已清除所有筛选条件' };
        }},
        { name: '批量处理', icon: '⚡', shortTip: '批量处理', detailTip: '将选中工单状态改为"= QA"并发送奖励邮件', execute: async function() {
            await ToolUtil.clickElement('span.el-checkbox__inner');
            await ToolUtil.sleep(800);
            await ToolUtil.clickByText(['button', 'span'], '编辑');
            await ToolUtil.sleep(800);
            await ToolUtil.clickElement('input[placeholder="请输入工单状态"]');
            await ToolUtil.sleep(500);
            await ToolUtil.inputText('input[placeholder="搜索"]', '= QA');
            await ToolUtil.sleep(800);
            await ToolUtil.clickByText(['li', 'span'], '= QA');
            await ToolUtil.sleep(500);
            await ToolUtil.clickElement('input[placeholder="请选择"]');
            await ToolUtil.sleep(500);
            await ToolUtil.sleep(1000);
            const spans = document.querySelectorAll('span');
            let mailItem = null;
            for (const span of spans) {
                if (span.textContent.includes('15 ProjectCreated.mail') && ToolUtil.isElementAvailable(span)) {
                    mailItem = span;
                    break;
                }
            }
            if (mailItem) {
                mailItem.scrollIntoView({ behavior: 'smooth', block: 'end' });
                await ToolUtil.sleep(500);
                mailItem.click();
            } else {
                throw new Error('未找到邮件选项: 15 ProjectCreated.mail');
            }
            await ToolUtil.sleep(500);
            await ToolUtil.clickByText(['span', 'button'], '提交', { needScroll: true });
            await ToolUtil.sleep(500);
            return { success: true, message: '批量处理完成' };
        }},
        { name: '日志', icon: '📋', shortTip: '查看日志', detailTip: '显示所有筛选和批量操作的执行记录', isLog: true, execute: async function() {
            const panel = document.getElementById(LOG_PANEL_ID);
            panel.classList.toggle('visible');
            return { success: true, message: '日志面板已切换' };
        }}
     ];

    const logs = [];

    // ==================== 延迟提示管理 ====================
    const TipManager = {
        timers: {},
        detailTimers: {},
        elements: {},

        showTip(btn, tipContent) {
            let tipEl = this.elements[btn.id];
            if (!tipEl) {
                tipEl = document.createElement('div');
                tipEl.className = 'aihelp-delayed-tip';
                btn.appendChild(tipEl);
                this.elements[btn.id] = tipEl;
            }
            tipEl.innerHTML = tipContent;
            requestAnimationFrame(() => {
                tipEl.classList.add('visible');
            });
        },

        startDetailTimer(btnId, showDetailCallback) {
            this.cancelDetailTimer(btnId);
            this.detailTimers[btnId] = setTimeout(() => {
                showDetailCallback();
            }, 2000);
        },

        cancelTimer(btnId) {
            if (this.timers[btnId]) {
                clearTimeout(this.timers[btnId]);
                this.timers[btnId] = null;
            }
        },

        cancelDetailTimer(btnId) {
            if (this.detailTimers[btnId]) {
                clearTimeout(this.detailTimers[btnId]);
                this.detailTimers[btnId] = null;
            }
        },

        hideTip(btn) {
            const tipEl = this.elements[btn.id];
            if (tipEl) {
                tipEl.classList.remove('visible');
            }
        }
    };

    // ==================== 日志管理 ====================
    function addLog(actionName, result) {
        const timestamp = new Date().toLocaleTimeString();
        logs.unshift({ time: timestamp, action: actionName, result });
        updateLogPanel();
    }

    function updateLogPanel() {
        const panel = document.getElementById(LOG_PANEL_ID);
        if (!panel) return;

        const content = panel.querySelector('.log-content');

        if (logs.length === 0) {
            content.innerHTML = '<div class="log-empty">暂无日志记录</div>';
            return;
        }

        content.innerHTML = logs.map(log => `
            <div class="log-item">
                <div class="log-time">${log.time}</div>
                <div class="log-action">${log.action}</div>
                <div class="log-result ${log.result.success ? '' : 'error'}">${log.result.message}</div>
            </div>
        `).join('');
    }

    // ==================== 样式注入 ====================
    function createStyles() {
        if (document.getElementById(STYLE_ID)) return;

        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = `
            #${TOOLBAR_ID} {
                position: fixed;
                top: 120px;
                right: 20px;
                width: 44px;
                height: 44px;
                display: grid;
                grid-template-columns: 1fr 1fr;
                grid-template-rows: 1fr 1fr 1fr;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                border-radius: 8px;
                z-index: 999999;
                box-shadow: 0 4px 15px rgba(0,0,0,0.3);
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                cursor: move;
                user-select: none;
                overflow: visible;
            }

            #${TOOLBAR_ID} .toolbar-btn {
                display: flex;
                align-items: center;
                justify-content: center;
                width: 22px;
                height: 22px;
                background: rgba(255,255,255,0.15);
                border-radius: 4px;
                color: white;
                cursor: pointer;
                font-size: 14px;
                transition: all 0.2s ease;
                position: relative;
                overflow: visible;
            }

            #${TOOLBAR_ID} .toolbar-btn:hover {
                background: rgba(255,255,255,0.35);
                transform: scale(1.1);
            }

            #${TOOLBAR_ID} .toolbar-btn:active {
                transform: scale(0.95);
            }

            #${TOOLBAR_ID} .toolbar-btn.loading {
                opacity: 0.7;
                pointer-events: none;
            }

            #${TOOLBAR_ID} .toolbar-btn.loading::after {
                content: '⏳';
                animation: spin 1s linear infinite;
            }

            @keyframes spin {
                from { transform: rotate(0deg); }
                to { transform: rotate(360deg); }
            }

            .aihelp-delayed-tip {
                position: absolute;
                right: calc(100% + 10px);
                top: 50%;
                transform: translateY(-50%) translateX(5px);
                background: rgba(0,0,0,0.9);
                color: white;
                padding: 8px 12px;
                border-radius: 6px;
                font-size: 12px;
                white-space: nowrap;
                opacity: 0;
                transition: opacity 0.2s ease, transform 0.2s ease;
                pointer-events: none;
                z-index: 1000;
                box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            }

            .aihelp-delayed-tip.visible {
                opacity: 1;
                transform: translateY(-50%) translateX(0);
            }

            .aihelp-delayed-tip .tip-title {
                font-weight: bold;
                margin-bottom: 2px;
            }

            .aihelp-delayed-tip .tip-desc {
                color: #ccc;
                font-size: 11px;
            }

            #${LOG_PANEL_ID} {
                position: fixed;
                top: 120px;
                right: 80px;
                width: 320px;
                max-height: 350px;
                background: white;
                border-radius: 8px;
                box-shadow: 0 4px 20px rgba(0,0,0,0.15);
                z-index: 999998;
                display: none;
                overflow: hidden;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                resize: both;
                min-width: 280px;
                min-height: 200px;
            }

            #${LOG_PANEL_ID}.visible {
                display: block;
            }

            #${LOG_PANEL_ID} .log-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 12px 15px;
                background: #f5f5f5;
                border-bottom: 1px solid #eee;
                cursor: move;
            }

            #${LOG_PANEL_ID} .log-header h3 {
                margin: 0;
                font-size: 14px;
                color: #333;
            }

            #${LOG_PANEL_ID} .log-header .close-btn {
                background: none;
                border: none;
                font-size: 18px;
                cursor: pointer;
                color: #999;
            }

            #${LOG_PANEL_ID} .log-content {
                max-height: calc(100% - 45px);
                overflow-y: auto;
                padding: 10px;
            }

            #${LOG_PANEL_ID} .log-item {
                padding: 8px 10px;
                margin-bottom: 8px;
                background: #f9f9f9;
                border-radius: 4px;
                font-size: 12px;
            }

            #${LOG_PANEL_ID} .log-item .log-time {
                color: #999;
                font-size: 11px;
            }

            #${LOG_PANEL_ID} .log-item .log-action {
                color: #333;
                font-weight: 500;
                margin: 4px 0;
            }

            #${LOG_PANEL_ID} .log-item .log-result {
                color: #67c23a;
            }

            #${LOG_PANEL_ID} .log-item .log-result.error {
                color: #f56c6c;
            }

            #${LOG_PANEL_ID} .log-empty {
                text-align: center;
                color: #999;
                padding: 30px;
                font-size: 13px;
            }
        `;
        document.head.appendChild(style);
    }

    // ==================== 创建工具栏 ====================
    function createToolbar() {
        if (document.getElementById(TOOLBAR_ID)) return;

        const toolbar = document.createElement('div');
        toolbar.id = TOOLBAR_ID;

        actions.forEach((action, index) => {
            const btn = document.createElement('div');
            btn.className = 'toolbar-btn';
            btn.id = `toolbar-btn-${index}`;
            btn.textContent = action.icon;

            btn.addEventListener('mouseenter', () => {
                TipManager.showTip(btn, `<div class="tip-title">${action.shortTip}</div>`);
                TipManager.startDetailTimer(btn.id, () => {
                    TipManager.showTip(btn, `
                        <div class="tip-title">${action.shortTip}</div>
                        <div class="tip-desc">${action.detailTip}</div>
                    `);
                });
            });

            btn.addEventListener('mouseleave', () => {
                TipManager.cancelTimer(btn.id);
                TipManager.cancelDetailTimer(btn.id);
                TipManager.hideTip(btn);
            });

            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                if (btn.classList.contains('loading')) return;

                btn.classList.add('loading');
                const originalContent = btn.textContent;
                btn.textContent = '⏳';

                const result = await scriptState.withLock(async () => {
                    try {
                        const result = await action.execute();
                        addLog(action.name, result);
                        console.log(`[AIHelp工具] ${action.name}:`, result);
                        return result;
                    } catch (error) {
                        addLog(action.name, { success: false, message: error.message });
                        console.error(`[AIHelp工具] ${action.name} 失败:`, error);
                        return { success: false, message: error.message };
                    }
                });

                btn.classList.remove('loading');
                btn.textContent = originalContent;
            });

            toolbar.appendChild(btn);
        });

        document.body.appendChild(toolbar);

        // 加载保存的位置
        const hasPosition = ToolUtil.loadPosition(STORAGE_KEYS.STATUS_BAR_POSITION, toolbar);
        if (!hasPosition) {
            toolbar.style.top = '120px';
            toolbar.style.right = '20px';
        }

        // 实现拖拽功能
        let isDragging = false;
        let startX, startY, startLeft, startTop;

        toolbar.addEventListener('mousedown', (e) => {
            if (e.target.closest('.toolbar-btn')) return;

            isDragging = false;
            startX = e.clientX;
            startY = e.clientY;
            const rect = toolbar.getBoundingClientRect();
            startLeft = rect.left;
            startTop = rect.top;

            const onMove = (ev) => {
                const dx = ev.clientX - startX;
                const dy = ev.clientY - startY;

                if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
                    isDragging = true;

                    let newLeft = startLeft + dx;
                    let newTop = startTop + dy;

                    newLeft = Math.max(0, Math.min(newLeft, window.innerWidth - toolbar.offsetWidth));
                    newTop = Math.max(0, Math.min(newTop, window.innerHeight - toolbar.offsetHeight));

                    toolbar.style.left = newLeft + 'px';
                    toolbar.style.top = newTop + 'px';
                    toolbar.style.right = 'auto';
                    toolbar.style.bottom = 'auto';
                }
            };

            const onUp = () => {
                document.removeEventListener('mousemove', onMove);
                document.removeEventListener('mouseup', onUp);

                if (isDragging) {
                    ToolUtil.savePosition(STORAGE_KEYS.STATUS_BAR_POSITION, toolbar);
                }
            };

            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', onUp);
        });
    }

    // ==================== 创建日志面板 ====================
    function createLogPanel() {
        if (document.getElementById(LOG_PANEL_ID)) return;

        const panel = document.createElement('div');
        panel.id = LOG_PANEL_ID;
        panel.innerHTML = `
            <div class="log-header">
                <h3>操作日志</h3>
                <button class="close-btn">×</button>
            </div>
            <div class="log-content">
                <div class="log-empty">暂无日志记录</div>
            </div>
        `;

        panel.querySelector('.close-btn').addEventListener('click', () => {
            panel.classList.remove('visible');
        });

        document.body.appendChild(panel);

        // 加载保存的位置和大小
        ToolUtil.loadPosition(STORAGE_KEYS.LOG_PANEL_POSITION, panel);
        ToolUtil.loadSize(STORAGE_KEYS.LOG_PANEL_SIZE, panel);

        // 实现日志面板拖拽
        const header = panel.querySelector('.log-header');
        let isDragging = false;
        let startX, startY, startLeft, startTop;

        header.addEventListener('mousedown', (e) => {
            isDragging = false;
            startX = e.clientX;
            startY = e.clientY;
            const rect = panel.getBoundingClientRect();
            startLeft = rect.left;
            startTop = rect.top;

            const onMove = (ev) => {
                const dx = ev.clientX - startX;
                const dy = ev.clientY - startY;

                if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
                    isDragging = true;

                    let newLeft = startLeft + dx;
                    let newTop = startTop + dy;

                    newLeft = Math.max(0, Math.min(newLeft, window.innerWidth - panel.offsetWidth));
                    newTop = Math.max(0, Math.min(newTop, window.innerHeight - panel.offsetHeight));

                    panel.style.left = newLeft + 'px';
                    panel.style.top = newTop + 'px';
                    panel.style.right = 'auto';
                    panel.style.bottom = 'auto';
                }
            };

            const onUp = () => {
                document.removeEventListener('mousemove', onMove);
                document.removeEventListener('mouseup', onUp);

                if (isDragging) {
                    ToolUtil.savePosition(STORAGE_KEYS.LOG_PANEL_POSITION, panel);
                }
            };

            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', onUp);
        });

        // 使用 ResizeObserver 监听大小变化
        let resizeTimeout;
        const resizeObserver = new ResizeObserver(() => {
            clearTimeout(resizeTimeout);
            resizeTimeout = setTimeout(() => {
                ToolUtil.saveSize(STORAGE_KEYS.LOG_PANEL_SIZE, panel);
            }, 300);
        });
        resizeObserver.observe(panel);
    }

    // ==================== 路由变化监听 ====================
    function monitorRouteChange() {
        let lastUrl = window.location.href;

        setInterval(() => {
            const newUrl = window.location.href;
            if (newUrl !== lastUrl) {
                lastUrl = newUrl;
                console.log('[AIHelp工单工具] 路由变化:', newUrl);

                if (newUrl.includes('ticket')) {
                    console.log('[AIHelp工单工具] 路由包含ticket，移除UI');
                    const toolbar = document.getElementById(TOOLBAR_ID);
                    const panel = document.getElementById(LOG_PANEL_ID);
                    if (toolbar) toolbar.remove();
                    if (panel) panel.remove();
                } else if (newUrl.includes('tasks?searchType')) {
                    console.log('[AIHelp工单工具] 路由包含tasks，确保UI存在');
                    if (!document.getElementById(TOOLBAR_ID)) {
                        createToolbar();
                        createLogPanel();
                    }
                }
            }
        }, 500);
    }

    // ==================== 初始化 ====================
    function init() {
        createStyles();
        createToolbar();
        createLogPanel();
        monitorRouteChange();
        console.log('[AIHelp工单工具] 已加载 - 点击底部按钮执行筛选或批量操作');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();

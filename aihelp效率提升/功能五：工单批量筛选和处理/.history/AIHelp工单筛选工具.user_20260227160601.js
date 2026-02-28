// ==UserScript==
// @name         AIHelp工单批量筛选与处理工具
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  AIHelp工单批量筛选与批量处理工具，提供一键快捷操作
// @author       YourName
// @match        https://ml-panel.aihelp.net/dashboard/*
// @exclude      *://*/ticket*
// @grant        none
// @run-at       document-end
// ==/UserScript==

(function() {
    'use strict';

    const STYLE_ID = 'aihelp-task-toolbar-styles';
    const TOOLBAR_ID = 'aihelp-task-toolbar';
    const LOG_PANEL_ID = 'aihelp-log-panel';

    const ToolUtil = {
        waitForElement(selector, timeout = 5000) {
            return new Promise((resolve, reject) => {
                const el = document.querySelector(selector);
                if (el) return resolve(el);

                const observer = new MutationObserver(() => {
                    const el = document.querySelector(selector);
                    if (el) {
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

        waitForText(selector, text, timeout = 5000) {
            return new Promise((resolve, reject) => {
                const check = () => {
                    const els = document.querySelectorAll(selector);
                    for (const el of els) {
                        if (el.textContent.trim().includes(text)) {
                            return resolve(el);
                        }
                    }
                    return null;
                };

                const result = check();
                if (result) return result;

                const observer = new MutationObserver(() => {
                    const result = check();
                    if (result) {
                        observer.disconnect();
                        resolve(result);
                    }
                });

                observer.observe(document.body, { childList: true, subtree: true });

                setTimeout(() => {
                    observer.disconnect();
                    reject(new Error(`Timeout waiting for text: ${text}`));
                }, timeout);
            });
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
                        if (el.textContent.trim().includes(text)) {
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
            if (clearFirst) {
                el.value = '';
            }
            el.value = text;
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
            await this.sleep(300);
            return el;
        },

        sleep(ms) {
            return new Promise(resolve => setTimeout(resolve, ms));
        }
    };

    const ActionA = {
        name: '筛选BUG标签',
        shortTip: '筛选AI识别为BUG的工单',
        detailTip: '筛选包含"AI识别为BUG bug identified by ai"标签的工单',
        async execute() {
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
        }
    };

    const ActionB = {
        name: '筛选MCGG标题',
        shortTip: '筛选标题包含【MCGG】的工单',
        detailTip: '筛选工单标题中包含"【MCGG】"的工单',
        async execute() {
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
        }
    };

    const ActionC = {
        name: '筛选s57描述',
        shortTip: '筛选描述包含s57的工单',
        detailTip: '筛选工单描述中包含"s57"的工单',
        async execute() {
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
        }
    };

    const ActionD = {
        name: '清除筛选',
        shortTip: '清除所有筛选条件',
        detailTip: '清除所有筛选条件，显示全部工单',
        async execute() {
            await ToolUtil.clickByText(['button', 'span', 'i'], '筛选');
            await ToolUtil.sleep(500);

            await ToolUtil.clickByText(['button', 'span'], '重置');
            await ToolUtil.sleep(500);

            await ToolUtil.clickByText(['span'], '筛选', { needScroll: true });
            await ToolUtil.sleep(500);

            return { success: true, message: '已清除所有筛选条件' };
        }
    };

    const ActionE = {
        name: '批量处理',
        shortTip: '批量改状态并发送邮件',
        detailTip: '将选中工单状态改为"= QA"并发送"15 ProjectCreated.mail"奖励邮件',
        async execute() {
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
                if (span.textContent.includes('15 ProjectCreated.mail')) {
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
        }
    };

    const actions = [ActionA, ActionB, ActionC, ActionD, ActionE];
    const logs = [];

    function addLog(actionName, result) {
        const timestamp = new Date().toLocaleTimeString();
        logs.unshift({ time: timestamp, action: actionName, result });
        updateLogPanel();
    }

    function createStyles() {
        if (document.getElementById(STYLE_ID)) return;

        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = `
            #${TOOLBAR_ID} {
                position: fixed;
                bottom: 0;
                left: 0;
                right: 0;
                height: 50px;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 10px;
                padding: 0 20px;
                z-index: 999999;
                box-shadow: 0 -2px 10px rgba(0,0,0,0.2);
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            }

            #${TOOLBAR_ID} .toolbar-btn {
                display: flex;
                align-items: center;
                justify-content: center;
                padding: 8px 16px;
                background: rgba(255,255,255,0.2);
                border: 1px solid rgba(255,255,255,0.3);
                border-radius: 6px;
                color: white;
                cursor: pointer;
                font-size: 13px;
                transition: all 0.3s ease;
                position: relative;
                user-select: none;
            }

            #${TOOLBAR_ID} .toolbar-btn:hover {
                background: rgba(255,255,255,0.3);
                transform: translateY(-2px);
            }

            #${TOOLBAR_ID} .toolbar-btn:active {
                transform: translateY(0);
            }

            #${TOOLBAR_ID} .toolbar-btn.loading {
                opacity: 0.7;
                pointer-events: none;
            }

            #${TOOLBAR_ID} .toolbar-btn .btn-icon {
                margin-right: 6px;
                font-size: 14px;
            }

            #${TOOLBAR_ID} .toolbar-tip {
                position: absolute;
                bottom: 60px;
                left: 50%;
                transform: translateX(-50%);
                background: rgba(0,0,0,0.85);
                color: white;
                padding: 8px 12px;
                border-radius: 4px;
                font-size: 12px;
                white-space: nowrap;
                opacity: 0;
                transition: opacity 0.3s ease;
                pointer-events: none;
            }

            #${TOOLBAR_ID} .toolbar-btn:hover .toolbar-tip {
                opacity: 1;
            }

            #${TOOLBAR_ID} .toolbar-tip.detail-tip {
                transition-delay: 2s;
            }

            #${LOG_PANEL_ID} {
                position: fixed;
                bottom: 60px;
                right: 20px;
                width: 350px;
                max-height: 400px;
                background: white;
                border-radius: 8px;
                box-shadow: 0 4px 20px rgba(0,0,0,0.15);
                z-index: 999998;
                display: none;
                overflow: hidden;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
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
                max-height: 340px;
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

    function createToolbar() {
        if (document.getElementById(TOOLBAR_ID)) return;

        const toolbar = document.createElement('div');
        toolbar.id = TOOLBAR_ID;

        actions.forEach((action, index) => {
            const btn = document.createElement('div');
            btn.className = 'toolbar-btn';
            btn.innerHTML = `
                <span class="btn-icon">${['🔍', '📝', '📄', '🗑️', '⚡'][index]}</span>
                <span>${action.name}</span>
                <div class="toolbar-tip">${action.shortTip}</div>
                <div class="toolbar-tip detail-tip">${action.detailTip}</div>
            `;

            btn.addEventListener('click', async () => {
                if (btn.classList.contains('loading')) return;

                btn.classList.add('loading');
                btn.innerHTML = `<span class="btn-icon">⏳</span><span>执行中...</span>`;

                try {
                    const result = await action.execute();
                    addLog(action.name, result);
                    console.log(`[AIHelp工具] ${action.name}:`, result);
                } catch (error) {
                    addLog(action.name, { success: false, message: error.message });
                    console.error(`[AIHelp工具] ${action.name} 失败:`, error);
                } finally {
                    btn.classList.remove('loading');
                    btn.innerHTML = `
                        <span class="btn-icon">${['🔍', '📝', '📄', '🗑️', '⚡'][index]}</span>
                        <span>${action.name}</span>
                        <div class="toolbar-tip">${action.shortTip}</div>
                        <div class="toolbar-tip detail-tip">${action.detailTip}</div>
                    `;
                }
            });

            toolbar.appendChild(btn);
        });

        const logBtn = document.createElement('div');
        logBtn.className = 'toolbar-btn';
        logBtn.innerHTML = `
            <span class="btn-icon">📋</span>
            <span>日志</span>
            <div class="toolbar-tip">查看操作日志</div>
            <div class="toolbar-tip detail-tip">显示所有筛选和批量操作的执行记录</div>
        `;
        logBtn.addEventListener('click', () => {
            const panel = document.getElementById(LOG_PANEL_ID);
            panel.classList.toggle('visible');
        });
        toolbar.appendChild(logBtn);

        document.body.appendChild(toolbar);
    }

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

    function init() {
        createStyles();
        createToolbar();
        createLogPanel();
        console.log('[AIHelp工单工具] 已加载 - 点击底部按钮执行筛选或批量操作');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();

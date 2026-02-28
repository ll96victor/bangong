// ==UserScript==
// @name         工单助手与Task客服信息提取合并版 6.2.6 最终优化版
// @namespace    http://tampermonkey.net/
// @version      6.2.6
// @description  最终优化版：三模块完全独立 + 日志通道颜色标识 + 工具函数优化 + 完善注释
// @author       AI Combined & Optimized
// @match        https://ml-panel.aihelp.net/*
// @match        https://ml.aihelp.net/*
// @match        https://aihelp.net.cn/*
// @match        https://aihelp.net/*
// @exclude      *://*/dashboard/#/newpage-ticket
// @exclude      *://*/dashboard/#/newpage-ticket/*
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @grant        GM_setClipboard
// @connect      translate.googleapis.com
// @connect      api.mymemory.translated.net
// @run-at       document-end
// ==/UserScript==

/**
 * 6.2.6 最终优化版 更新说明：
 * 
 * 【架构优势 - 来自6.2.4】
 * 1. 三模块完全独立：普通工单、MCGG、Task各自封装为独立IIFE
 * 2. 配置完全分离：每个模块独立CONFIG对象
 * 3. 状态完全隔离：每个模块独立state管理
 * 4. 入口完全分离：每个模块独立监听和处理
 * 5. UI按钮独立：三个独立按钮对应三个模块
 * 
 * 【功能优势 - 来自6.2.5】
 * 1. 日志通道颜色标识：createLogChannel()方法
 * 2. 模块标签样式：不同模块日志有不同颜色
 * 3. 工具函数参数注入：降低隐式依赖
 * 4. 完善的JSDoc注释
 * 
 * 【新增优化】
 * 1. SharedUtils统一管理所有共享工具函数
 * 2. 减少代码重复，提高可维护性
 * 3. 明确的版本更新记录
 */

(function() {
    'use strict';

    // ===================== 公共区域：页面判定逻辑 =====================
    
    /**
     * 检查是否应该运行普通工单/MCGG模块
     * @returns {boolean}
     */
    function shouldRunNormalModule() {
        const url = window.location.href;
        return url.includes('/manual/tasks') || url.includes('/newpage-task') || url.includes('tasks?searchType');
    }

    /**
     * 检查是否应该运行Task模块
     * @returns {boolean}
     */
    function shouldRunTaskModule() {
        const url = window.location.href;
        return url.includes('task?orderId') || url.includes('tasks?searchType');
    }

    /**
     * 检查是否为目标页面
     * @returns {boolean}
     */
    function isTargetPage() {
        return shouldRunNormalModule() || shouldRunTaskModule();
    }

    if (!isTargetPage()) return;

    // ===================== 公共区域：状态栏 UI 类 (日志通道版) =====================
    
    /**
     * 状态栏UI类
     * 支持日志通道分离，不同模块日志有不同颜色标识
     */
    class StatusbarUI {
        /**
         * @param {Object} config - 配置对象
         * @param {number} config.maxLogLines - 最大日志行数
         * @param {string} config.iconCompact - 紧凑图标
         * @param {Object} config.initialPosition - 初始位置
         */
        constructor(config = {}) {
            this.config = {
                maxLogLines: 100,
                iconCompact: "⚡",
                initialPosition: { top: '120px', right: '20px' },
                ...config
            };
            this.container = null;
            this.iconElement = null;
            this.expandedElement = null;
            this.logContainer = null;
            this.isDragging = false;
            this.dragStartPos = { x: 0, y: 0 };
            this.isExpanded = false;

            this.init();
        }

        init() {
            this.injectStyles();
            this.createDOM();
            this.bindEvents();
        }

        injectStyles() {
            GM_addStyle(`
                .ai-status-bar-container {
                    position: fixed;
                    z-index: 999999;
                    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                    user-select: none;
                    transition: all 0.3s cubic-bezier(0.18, 0.89, 0.32, 1.28);
                }
                .ai-status-icon {
                    width: 40px;
                    height: 40px;
                    border-radius: 50%;
                    background: linear-gradient(135deg, #3370ff 0%, #4e8cff 100%);
                    color: white;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    cursor: move;
                    box-shadow: 0 4px 12px rgba(51, 112, 255, 0.4);
                    font-size: 20px;
                    transition: transform 0.2s, box-shadow 0.2s;
                }
                .ai-status-icon:hover { 
                    transform: scale(1.1); 
                    box-shadow: 0 6px 16px rgba(51, 112, 255, 0.5);
                }
                
                .ai-status-expanded {
                    position: absolute;
                    top: 0;
                    left: 0;
                    width: 320px;
                    background: rgba(255, 255, 255, 0.95);
                    backdrop-filter: blur(10px);
                    border-radius: 12px;
                    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
                    padding: 12px;
                    border: 1px solid rgba(0, 0, 0, 0.05);
                    display: flex;
                    flex-direction: column;
                    gap: 10px;
                    transform-origin: top left;
                }
                
                .ai-status-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    border-bottom: 1px solid rgba(0, 0, 0, 0.05);
                    padding-bottom: 8px;
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
                
                /* 模块按钮样式 */
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
                    height: 150px;
                    overflow-y: auto;
                    background: #f9f9f9;
                    border-radius: 6px;
                    padding: 8px;
                    font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;
                    font-size: 11px;
                    line-height: 1.5;
                    border: 1px solid rgba(0,0,0,0.03);
                }
                .ai-log-item { margin-bottom: 4px; padding-bottom: 2px; border-bottom: 1px solid rgba(0,0,0,0.02); word-break: break-all; }
                .ai-log-info { color: #1d1d1f; }
                .ai-log-success { color: #52c41a; }
                .ai-log-warn { color: #faad14; }
                .ai-log-error { color: #ff4d4f; }
                
                /* 模块标签颜色样式 */
                .ai-log-module-normal { color: #3370ff; font-weight: 600; }
                .ai-log-module-mcgg { color: #722ed1; font-weight: 600; }
                .ai-log-module-task { color: #f5a623; font-weight: 600; }
            `);
        }

        createDOM() {
            this.container = document.createElement('div');
            this.container.id = 'ai-merged-statusbar';
            this.container.className = 'ai-status-bar-container';
            Object.assign(this.container.style, this.config.initialPosition);

            this.iconElement = document.createElement('div');
            this.iconElement.className = 'ai-status-icon';
            this.iconElement.textContent = this.config.iconCompact;
            this.iconElement.title = '左键展开，长按拖拽';

            this.expandedElement = document.createElement('div');
            this.expandedElement.className = 'ai-status-expanded';
            this.expandedElement.style.display = 'none';
            this.expandedElement.style.transform = 'scale(0.8)';
            this.expandedElement.style.opacity = '0';

            const header = document.createElement('div');
            header.className = 'ai-status-header';
            header.innerHTML = `
                <span class="ai-status-title">工单助手 & Task 复制</span>
                <button class="ai-status-close" title="折叠">×</button>
            `;

            this.actionContainer = document.createElement('div');
            this.actionContainer.className = 'ai-status-actions';

            this.logContainer = document.createElement('div');
            this.logContainer.className = 'ai-status-logs';

            this.expandedElement.append(header, this.actionContainer, this.logContainer);
            this.container.append(this.iconElement, this.expandedElement);
            document.body.appendChild(this.container);
        }

        bindEvents() {
            const onMouseDown = (e) => {
                if (e.button !== 0) return;
                this.isDragging = false;
                this.dragStartPos = { x: e.clientX, y: e.clientY };
                
                const rect = this.container.getBoundingClientRect();
                const offset = { x: e.clientX - rect.left, y: e.clientY - rect.top };

                const onMouseMove = (moveEvent) => {
                    const dx = moveEvent.clientX - this.dragStartPos.x;
                    const dy = moveEvent.clientY - this.dragStartPos.y;
                    
                    if (!this.isDragging && (Math.abs(dx) > 5 || Math.abs(dy) > 5)) {
                        this.isDragging = true;
                        this.container.style.transition = 'none';
                    }

                    if (this.isDragging) {
                        let newX = moveEvent.clientX - offset.x;
                        let newY = moveEvent.clientY - offset.y;
                        newX = Math.max(0, Math.min(newX, window.innerWidth - (this.isExpanded ? 320 : 40)));
                        newY = Math.max(0, Math.min(newY, window.innerHeight - (this.isExpanded ? 300 : 40)));
                        this.container.style.left = newX + 'px';
                        this.container.style.top = newY + 'px';
                        this.container.style.right = 'auto';
                        this.container.style.bottom = 'auto';
                    }
                };

                const onMouseUp = () => {
                    document.removeEventListener('mousemove', onMouseMove);
                    document.removeEventListener('mouseup', onMouseUp);
                    
                    if (this.isDragging) {
                        this.container.style.transition = 'all 0.3s cubic-bezier(0.18, 0.89, 0.32, 1.28)';
                    } else if (!this.isExpanded) {
                        this.expand();
                    }
                };

                document.addEventListener('mousemove', onMouseMove);
                document.addEventListener('mouseup', onMouseUp);
            };

            this.iconElement.addEventListener('mousedown', onMouseDown);

            this.expandedElement.querySelector('.ai-status-close').addEventListener('click', (e) => {
                e.stopPropagation();
                this.collapse();
            });
        }

        expand() {
            this.isExpanded = true;
            const rect = this.container.getBoundingClientRect();
            let newX = rect.left;
            let newY = rect.top;
            const width = 320;
            const height = 300;

            if (newX + width > window.innerWidth) newX = window.innerWidth - width - 10;
            if (newY + height > window.innerHeight) newY = window.innerHeight - height - 10;
            newX = Math.max(10, newX);
            newY = Math.max(10, newY);

            this.container.style.left = newX + 'px';
            this.container.style.top = newY + 'px';
            this.container.style.right = 'auto';
            this.container.style.bottom = 'auto';

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
                    this.iconElement.style.display = 'flex';
                }
            }, 300);
        }

        /**
         * 添加按钮
         * @param {string} text - 按钮文本
         * @param {string} className - 按钮样式类名
         * @param {Function} onClick - 点击回调
         * @returns {HTMLButtonElement}
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
         * 添加日志
         * @param {string} msg - 日志消息
         * @param {string} type - 日志类型 (info/success/warn/error)
         * @param {string} moduleTag - 模块标签 (normal/mcgg/task)
         */
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

            while (this.logContainer.children.length > this.config.maxLogLines) {
                this.logContainer.removeChild(this.logContainer.firstChild);
            }

            this.logContainer.scrollTop = this.logContainer.scrollHeight;
        }

        /**
         * 创建独立日志通道
         * @param {string} moduleName - 模块名称 (normal/mcgg/task)
         * @returns {Object} 日志对象 { log, error, warn, success }
         */
        createLogChannel(moduleName) {
            const self = this;
            return {
                log: (msg) => self.addLog(msg, 'info', moduleName),
                error: (msg) => self.addLog(msg, 'error', moduleName),
                warn: (msg) => self.addLog(msg, 'warn', moduleName),
                success: (msg) => self.addLog(msg, 'success', moduleName)
            };
        }
    }

    const UI = new StatusbarUI();

    // ===================== 公共工具函数 =====================
    
    /**
     * 共享工具函数集合
     */
    const SharedUtils = {
        /**
         * 检查输入框是否可用
         * @param {HTMLElement} el - 输入框元素
         * @returns {boolean}
         */
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

        /**
         * 提取版本号
         * @param {string} text - 文本
         * @returns {string}
         */
        extractVersion(text) {
            const match = text.match(/(\d+(?:\.\d+)+)/);
            return match ? match[1] : '';
        },

        /**
         * 检测是否包含中文
         * @param {string} text - 文本
         * @returns {boolean}
         */
        hasChinese(text) {
            return /[\u4e00-\u9fa5]/.test(text);
        },

        /**
         * 获取当前工单ID
         * @returns {string|null}
         */
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

        /**
         * 查找任务标题输入框
         * @returns {HTMLInputElement|null}
         */
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

        /**
         * 模拟输入值（解决Vue/React数据绑定问题）
         * @param {HTMLInputElement} element - 输入框元素
         * @param {string} text - 要输入的文本
         * @returns {boolean}
         */
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

        /**
         * 等待下拉搜索框出现
         * @param {number} timeout - 超时时间(ms)
         * @returns {Promise<HTMLInputElement|null>}
         */
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

        /**
         * 填充下拉搜索框
         * @param {string} text - 要填充的文本
         * @param {Object} logger - 日志对象
         * @param {number} delay - 延迟时间(ms)
         * @returns {Promise<boolean>}
         */
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

        /**
         * 查找输入框关联的标签文本
         * @param {HTMLElement} targetInput - 输入框元素
         * @returns {string}
         */
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

        /**
         * 提取元素内容（包含图片URL）
         * @param {HTMLElement} element - 元素
         * @returns {string}
         */
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

        // ===================== 独立配置 =====================
        const CONFIG = {
            translateDailyLimit: 150,
            translateTimeout: 6000,
            checkInterval: 500,
            titleRetryDelay: 1000,
            titleMaxWaitTime: 20000,
            internalDescRetryDelay: 2000,
            internalDescMaxRetries: 1,
            removeTrailingPunctuation: true,
            debug: true,
            fullServerLists: ["【2.1.40全服】：", "【2.1.18全服】：", "【40.2全服】：", "【18.2全服】："],
            testServerLists: ["【40.2测服】：", "【2.1.52测服】：", "【1.9.88测服】：", "【2.1.50测服】："],
            fullServer: "【40.2全服】：",
            testServer: "【2.1.60测服】："
        };

        // ===================== 独立状态 =====================
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
            focusListenersAttached: false
        };

        // ===================== 独立日志通道 =====================
        const logger = UI.createLogChannel('normal');

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

        // ===================== 本地工具函数 =====================
        function extractFaxiandiedai(heading) {
            const match = heading.match(/【(.+?)全服】|【(.+?)测服】/);
            return match ? (match[1] || match[2] || '') : '';
        }

        // ===================== 核心功能：内部描述提取 =====================
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

            if (!contentEl) return extractViaInnerText();

            const extracted = SharedUtils.extractContentWithImages(contentEl);
            state.copiedText = extracted;
            log('提取内部描述成功，长度:', extracted.length);
            logger.success('提取内部描述成功，长度: ' + extracted.length);
            return extracted;
        }

        async function extractInternalDescriptionWithRetry() {
            let result = extractInternalDescription();
            if (result) return result;

            const maxRetries = Math.max(0, CONFIG.internalDescMaxRetries || 0);
            for (let i = 0; i < maxRetries; i++) {
                log('内部描述未就绪，' + CONFIG.internalDescRetryDelay + 'ms 后重试 (' + (i + 1) + '/' + maxRetries + ')');
                await new Promise(resolve => setTimeout(resolve, CONFIG.internalDescRetryDelay));
                result = extractInternalDescription();
                if (result) return result;
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
            state.copiedText = extracted;
            log('通过innerText提取内部描述成功，长度:', extracted.length);
            return extracted;
        }

        // ===================== 核心功能：ServerID判断 =====================
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

        // ===================== 翻译模块 =====================
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
                        return result;
                    }
                } catch (e) {
                    log(translator.name, '翻译失败:', e.message);
                }
            }

            log('所有翻译源均失败，返回原文');
            return text;
        }

        // ===================== 核心功能：标题处理 =====================
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
                        if (currentValue.startsWith(state.leftHeading)) {
                            log('标题前缀已存在，跳过');
                            state.hasProcessedTitle = true;
                            return;
                        }

                        // 检查是否为MCGG工单
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

        // ===================== 焦点监听 =====================
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

        // ===================== 状态重置 =====================
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
        }

        // ===================== 主流程 =====================
        async function processTicket() {
            if (state.isProcessing) {
                log('正在处理中，跳过重复执行');
                return;
            }

            const titleInput = SharedUtils.findTitleInputRobust();
            const titleValue = titleInput ? titleInput.value || '' : '';
            if (/mcgg/i.test(titleValue)) {
                log('检测到MCGG标识，普通工单模块跳过');
                return;
            }

            state.isProcessing = true;
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

        // ===================== UI初始化 =====================
        function initUI() {
            UI.addButton('普通工单', 'btn-normal', async (btn) => {
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
                    btn.textContent = '已复制';
                    btn.classList.add('success');
                    log('内部描述已复制到剪贴板');
                    setTimeout(() => {
                        btn.textContent = '普通工单';
                        btn.classList.remove('success');
                    }, 1500);
                }).catch(err => {
                    logError('复制失败:', err);
                });
            });
        }

        // ===================== 工单监听 =====================
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

        // ===================== 初始化 =====================
        function init() {
            log('========================================');
            log('普通工单模块 v6.2.6 已启动');
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

        // ===================== 独立配置 =====================
        const CONFIG = {
            debug: true,
            checkInterval: 500,
            titleRetryDelay: 1000,
            titleMaxWaitTime: 20000,
            internalDescRetryDelay: 2000,
            internalDescMaxRetries: 1,
            mcggfullServerLists: ["【MCGG】- 1.2.60：", "【MCGG】- 1.2.58：", "【MCGG】- 1.2.62：", "【MCGG】- 1.2.56："],
            mcggtestServerLists: ["【MCGG】- 1.2.60：", "【MCGG】- 1.2.58：", "【MCGG】- 1.2.62：", "【MCGG】- 1.2.56："],
            mcggfullServer: "【MCGG】- 1.2.60：",
            mcggtestServer: "【MCGG】- 1.2.62："
        };

        // ===================== 独立状态 =====================
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
            focusListenersAttached: false
        };

        // ===================== 独立日志通道 =====================
        const logger = UI.createLogChannel('mcgg');

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

        // ===================== MCGG检测 =====================
        function isMCGGTitle(titleValue, options = {}) {
            const hasMCGG = /mcgg/i.test(titleValue || '');
            if (!options.silent) {
                log('标题检测: ' + (hasMCGG ? '检测到MCGG标识' : '未检测到MCGG标识'));
            }
            return hasMCGG;
        }

        // ===================== 状态重置 =====================
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
                focusListenersAttached: false
            };
        }

        // ===================== 本地工具函数 =====================
        function extractTextFromElement(element) {
            if (!element) return '';
            if (element.tagName === 'TEXTAREA' || element.tagName === 'INPUT') {
                return (element.value || '').trim();
            }
            return SharedUtils.extractContentWithImages(element);
        }

        // ===================== 核心功能：描述提取 =====================
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

        // ===================== 核心功能：ServerID判断 =====================
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

        // ===================== 核心功能：标题处理 =====================
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

        // ===================== 焦点监听 =====================
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

        // ===================== 主流程 =====================
        async function processMCGGTicket() {
            if (state.isProcessing) {
                log('正在处理中，跳过重复执行');
                return;
            }

            state.isProcessing = true;
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

        // ===================== UI初始化 =====================
        function initUI() {
            UI.addButton('MCGG工单', 'btn-mcgg', async (btn) => {
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
                    btn.textContent = '已复制';
                    btn.classList.add('success');
                    log('描述已复制到剪贴板', 'success');
                    setTimeout(() => {
                        btn.textContent = 'MCGG工单';
                        btn.classList.remove('success');
                    }, 1500);
                }).catch(err => {
                    log('复制失败: ' + err, 'error');
                });
            });
        }

        // ===================== 工单监听 =====================
        function monitorTicketChange() {
            setInterval(() => {
                const newTicketID = SharedUtils.getCurrentTicketID();
                if (newTicketID && newTicketID !== state.currentTicketID) {
                    log('工单切换: ' + (state.currentTicketID || '(无)') + ' -> ' + newTicketID);
                    resetState();
                    state.currentTicketID = newTicketID;
                    setTimeout(() => {
                        const titleInput = SharedUtils.findTitleInputRobust();
                        const titleValue = titleInput ? titleInput.value || '' : '';
                        if (isMCGGTitle(titleValue, { silent: true })) {
                            processMCGGTicket();
                        }
                    }, 500);
                }
            }, CONFIG.checkInterval);
        }

        // ===================== 初始化 =====================
        function init() {
            log('========================================');
            log('MCGG工单模块 v6.2.6 已启动');
            log('调试模式:', CONFIG.debug);
            log('========================================');
            initUI();
            monitorTicketChange();
            setTimeout(() => {
                const ticketID = SharedUtils.getCurrentTicketID();
                if (ticketID) {
                    log('检测到工单:', ticketID);
                    state.currentTicketID = ticketID;
                    const titleInput = SharedUtils.findTitleInputRobust();
                    const titleValue = titleInput ? titleInput.value || '' : '';
                    if (isMCGGTitle(titleValue, { silent: true })) {
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

        // ===================== 独立配置 =====================
        const CONFIG = {
            debug: true,
            maxRetries: 12,
            retryInterval: 500
        };

        // ===================== 独立日志通道 =====================
        const logger = UI.createLogChannel('task');

        function log(...args) {
            if (CONFIG.debug) {
                const msg = args.join(' ');
                console.log('[Task模块]', ...args);
                logger.log(msg);
            }
        }

        // ===================== 核心功能：信息提取 =====================
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

        // ===================== UI交互 =====================
        async function handleCopyAction(button) {
            button.innerText = '检测中...';
            button.style.pointerEvents = 'none';

            try {
                const taskInfo = await retryTaskExtraction();
                const finalUrl = taskInfo.url || window.location.href;
                const finalAgentName = taskInfo.agentName;
                const finalPrefix = taskInfo.agentPrefix;

                if (!finalAgentName) {
                    showFeedback(button, '未检测到内容', 'error');
                } else {
                    const copyText = finalUrl + ' @' + finalAgentName;
                    GM_setClipboard(copyText);
                    showFeedback(button, finalPrefix || '✓ 已复制', 'success');
                    log('Task信息已复制: ' + copyText);
                }
            } catch (e) {
                showFeedback(button, '系统错误', 'error');
            } finally {
                button.style.pointerEvents = 'auto';
            }
        }

        function showFeedback(btn, text, type) {
            const originalText = '复制 Task 信息';
            btn.innerText = text;
            if (type === 'success') btn.classList.add('success');
            if (type === 'error') btn.style.background = '#e53e3e';
            
            setTimeout(() => {
                btn.innerText = originalText;
                btn.classList.remove('success');
                btn.style.background = '';
            }, 1500);
        }

        // ===================== UI初始化 =====================
        function initUI() {
            UI.addButton('复制 Task 信息', 'btn-task', (btn) => {
                handleCopyAction(btn);
            });
        }

        // ===================== 初始化 =====================
        function init() {
            log('========================================');
            log('Task模块 v6.2.6 已启动');
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

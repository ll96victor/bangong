// ==UserScript==
// @name         工单助手 - 自动翻译与内部描述复制 (集成优化版 v3.0)
// @namespace    http://tampermonkey.net/
// @version      3.0
// @description  集成自动翻译标题/标记服务器与提取内部描述功能。优化了内存占用(移除DOM克隆)和监听性能。
// @author       ll96victor (Optimized by AI)
// @match        https://ml-panel.aihelp.net/dashboard/*
// @grant        GM_xmlhttpRequest
// @grant        GM_setClipboard
// @grant        GM_addStyle
// @run-at       document-idle
// ==/UserScript==

(function() {
    'use strict';

    // ============================
    // 全局配置
    // ============================
    const CONFIG = {
        debug: false,
        translationService: 'google',
        checkInterval: 2000, // 标题检查轮询间隔
        observerDebounce: 800, // DOM变化防抖时间(合并后稍微放宽，减少计算)
        copyCheckInterval: 5000 // 复制功能兜底轮询
    };

    // 工具函数：日志
    function log(module, ...args) {
        if (CONFIG.debug) {
            console.log(`[${module}]`, ...args);
        }
    }

    // 工具函数：防抖
    function debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    // ============================
    // 模块一：标题自动翻译助手
    // ============================
    const TitleHelper = {
        serverInfo: null,
        indicator: null,

        init() {
            log('TitleHelper', '初始化...');
            this.createIndicator();
            this.process(); // 初始执行
        },

        createIndicator() {
            // 防止重复创建
            if (document.getElementById('tm-task-helper-indicator')) {
                this.indicator = document.getElementById('tm-task-helper-indicator');
                return;
            }

            const indicator = document.createElement('div');
            indicator.id = 'tm-task-helper-indicator';
            indicator.style.cssText = `
                position: fixed; bottom: 20px; right: 20px; background: #4CAF50;
                color: white; padding: 8px 12px; border-radius: 4px; font-size: 12px;
                font-family: Arial, sans-serif; z-index: 999999; opacity: 0.9;
                box-shadow: 0 2px 10px rgba(0,0,0,0.2); cursor: pointer; pointer-events: auto;
            `;
            indicator.innerHTML = '工单助手已启用';
            indicator.addEventListener('click', () => {
                this.process();
                indicator.style.background = '#2196F3';
                indicator.innerHTML = '正在处理...';
                setTimeout(() => {
                    indicator.style.background = '#4CAF50';
                    indicator.innerHTML = '工单助手已启用';
                }, 2000);
            });

            document.body.appendChild(indicator);
            this.indicator = indicator;
        },

        checkServerType() {
            // 优化：缓存 ServerID 检查结果，避免频繁遍历 body
            if (this.serverInfo) return this.serverInfo;

            const pageText = document.body.innerText || document.body.textContent;
            const serverIdMatch = pageText.match(/ServerID\s*[=:]\s*(\d+)/i);

            if (serverIdMatch) {
                const serverId = serverIdMatch[1];
                if (serverId.startsWith('57')) {
                    this.serverInfo = { type: 'test', prefix: '【2.1.52测服】：', serverId };
                } else {
                    this.serverInfo = { type: 'full', prefix: '【2.1.40全服】：', serverId };
                }
                log('TitleHelper', 'ServerID:', this.serverInfo);
            }
            return this.serverInfo;
        },

        async translateWithGoogle(text, retryCount = 0) {
            return new Promise((resolve) => {
                const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=zh-CN&dt=t&q=${encodeURIComponent(text)}`;
                GM_xmlhttpRequest({
                    method: 'GET',
                    url: url,
                    timeout: 5000,
                    onload: (response) => {
                        try {
                            if (response.status === 200) {
                                const data = JSON.parse(response.responseText);
                                if (data?.[0]?.[0]?.[0]) {
                                    resolve(data[0][0][0]);
                                    return;
                                }
                            }
                        } catch (e) {}
                        resolve(text);
                    },
                    onerror: () => resolve(text),
                    ontimeout: () => resolve(text)
                });
            });
        },

        extractTextAfterFirstColon(text) {
            const zhIdx = text.indexOf('：');
            const enIdx = text.indexOf(':');
            let idx = -1;
            if (zhIdx !== -1 && enIdx !== -1) idx = Math.min(zhIdx, enIdx);
            else if (zhIdx !== -1) idx = zhIdx;
            else if (enIdx !== -1) idx = enIdx;

            return idx === -1 ? '' : text.substring(idx + 1).trim();
        },

        extractTextBeforeFirstColon(text) {
            const zhIdx = text.indexOf('：');
            const enIdx = text.indexOf(':');
            let idx = -1;
            if (zhIdx !== -1 && enIdx !== -1) idx = Math.min(zhIdx, enIdx);
            else if (zhIdx !== -1) idx = zhIdx;
            else if (enIdx !== -1) idx = enIdx;

            return idx === -1 ? text : text.substring(0, idx).trim();
        },

        isChinese(text) {
            return /[\u4e00-\u9fff]/.test(text);
        },

        async processTitle(inputElement) {
            if (!inputElement || inputElement.disabled || inputElement.readOnly) return;

            const serverInfo = this.checkServerType();
            const currentValue = inputElement.value || '';

            // 简单的去重检查
            if (serverInfo && currentValue.startsWith(serverInfo.prefix)) return;

            const textAfterColon = this.extractTextAfterFirstColon(currentValue);
            if (!textAfterColon) {
                if (serverInfo && !currentValue.startsWith(serverInfo.prefix)) {
                    inputElement.value = serverInfo.prefix + currentValue;
                    this.triggerChange(inputElement);
                }
                return;
            }

            let translatedText = textAfterColon;
            if (!this.isChinese(textAfterColon)) {
                translatedText = await this.translateWithGoogle(textAfterColon);
            }

            let newTitle;
            if (serverInfo) {
                newTitle = serverInfo.prefix + translatedText + ' ' + textAfterColon;
            } else {
                const textBefore = this.extractTextBeforeFirstColon(currentValue);
                newTitle = textBefore + '：' + translatedText + ' ' + textAfterColon;
            }

            if (inputElement.value !== newTitle) {
                inputElement.value = newTitle;
                this.triggerChange(inputElement);
            }
        },

        triggerChange(el) {
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
        },

        findInput(titleElement) {
            // 查找逻辑
            if (titleElement.tagName === 'LABEL') {
                const input = document.getElementById(titleElement.getAttribute('for'));
                if (input && (input.tagName === 'INPUT' || input.tagName === 'TEXTAREA')) return input;
            }
            let parent = titleElement.parentElement;
            for (let i = 0; i < 3 && parent; i++) {
                const input = parent.querySelector('input, textarea');
                if (input) return input;
                parent = parent.parentElement;
            }
            return null;
        },

        process() {
            const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);
            let node;
            while (node = walker.nextNode()) {
                if (node.textContent.includes('任务标题')) {
                    const input = this.findInput(node.parentElement);
                    if (input) this.processTitle(input);
                }
            }
        }
    };

    // ============================
    // 模块二：内部描述复制助手 (优化内存版)
    // ============================
    const CopyHelper = {
        button: null,
        currentContent: null,
        markers: { start: "内部描述", end: "描述" },

        init() {
            log('CopyHelper', '初始化...');
            this.injectStyles();
            this.createButton();
            this.scan();
        },

        injectStyles() {
            GM_addStyle(`
                .fixed-copy-btn {
                    position: fixed !important; z-index: 100000 !important;
                    background: linear-gradient(135deg, #2196F3 0%, #21CBF3 100%) !important;
                    color: white !important; border: none !important; border-radius: 20px !important;
                    padding: 8px 16px !important; font-size: 12px !important; font-weight: bold !important;
                    cursor: move !important; box-shadow: 0 4px 15px rgba(33, 150, 243, 0.4) !important;
                    transition: all 0.3s ease !important; display: flex !important;
                    align-items: center !important; justify-content: center !important;
                    gap: 6px !important; min-width: 140px !important;
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
                    top: 20px !important; right: 20px !important; user-select: none !important;
                }
                .fixed-copy-btn:hover { transform: translateY(-2px) !important; box-shadow: 0 6px 20px rgba(33, 150, 243, 0.6) !important; }
                .fixed-copy-btn.copied { background: linear-gradient(135deg, #4CAF50 0%, #8BC34A 100%) !important; animation: pulse 0.5s ease !important; }
                @keyframes pulse { 0% { transform: scale(1); } 50% { transform: scale(1.05); } 100% { transform: scale(1); } }
            `);
        },

        createButton() {
            if (document.querySelector('.fixed-copy-btn')) return;

            const btn = document.createElement('button');
            btn.className = 'fixed-copy-btn';
            btn.innerHTML = '<span>⏳</span><span>等待内容...</span>';
            btn.disabled = true;

            // 拖拽逻辑
            let isDragging = false, startX, startY, startLeft, startTop;
            btn.addEventListener('mousedown', (e) => {
                isDragging = true;
                startX = e.clientX; startY = e.clientY;
                startLeft = btn.offsetLeft; startTop = btn.offsetTop;
                e.preventDefault();
            });
            document.addEventListener('mousemove', (e) => {
                if (!isDragging) return;
                btn.style.left = `${startLeft + (e.clientX - startX)}px`;
                btn.style.top = `${startTop + (e.clientY - startY)}px`;
            });
            document.addEventListener('mouseup', () => isDragging = false);

            btn.addEventListener('click', () => this.copyContent());
            document.body.appendChild(btn);
            this.button = btn;
        },

        // ⚡ 性能核心优化：使用 TreeWalker 直接提取，不克隆 DOM
        extractTextWithoutCloning(container) {
            const unwantedTags = ['SCRIPT', 'STYLE', 'IFRAME', 'NOSCRIPT', 'NAV', 'HEADER', 'FOOTER'];
            const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, {
                acceptNode: (node) => {
                    // 检查父级是否在不想要的标签内
                    let parent = node.parentElement;
                    while (parent && parent !== container) {
                        if (unwantedTags.includes(parent.tagName)) {
                            return NodeFilter.FILTER_REJECT;
                        }
                        parent = parent.parentElement;
                    }
                    return NodeFilter.FILTER_ACCEPT;
                }
            });

            const texts = [];
            let node;
            while (node = walker.nextNode()) {
                const text = node.textContent.trim();
                if (text) texts.push(text);
            }
            return texts.join('\n');
        },

        scan() {
            // 1. 查找起始点
            let startNode = null;
            // 尝试通过属性查找
            const selectors = ['[内部描述]', '[name*="内部描述"]', '[data-内部描述]'];
            for (const sel of selectors) {
                const el = document.querySelector(sel);
                if (el) { startNode = el; break; }
            }
            
            // 备用：文本遍历查找
            if (!startNode) {
                const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);
                let node;
                while (node = walker.nextNode()) {
                    if (node.textContent.includes(this.markers.start)) {
                        startNode = node.parentElement;
                        break;
                    }
                }
            }

            if (!startNode) {
                this.updateButton(false);
                return;
            }

            // 2. 确定容器 (向上查找 DIV/SECTION 等)
            let container = startNode;
            while (container.parentElement && container !== document.body) {
                if (['DIV', 'SECTION', 'ARTICLE', 'MAIN', 'TD'].includes(container.parentElement.tagName)) {
                    container = container.parentElement;
                    break;
                }
                container = container.parentElement;
            }

            // 3. 提取文本 (使用非克隆优化方法)
            const fullText = this.extractTextWithoutCloning(container);
            
            // 4. 切割文本
            const startIdx = fullText.indexOf(this.markers.start);
            let endIdx = fullText.indexOf(this.markers.end, startIdx + this.markers.start.length);
            if (startIdx === -1) {
                this.updateButton(false);
                return;
            }
            if (endIdx === -1) endIdx = fullText.length;
            else endIdx += this.markers.end.length;

            const contentText = fullText.substring(startIdx + this.markers.start.length, endIdx).trim();
            
            // 5. 提取图片 (简单的去重)
            const images = Array.from(container.querySelectorAll('img'))
                .map(img => img.src)
                .filter((src, index, self) => self.indexOf(src) === index && src);

            if (contentText || images.length > 0) {
                this.currentContent = { text: contentText, images };
                this.updateButton(true, images.length);
            } else {
                this.updateButton(false);
            }
        },

        updateButton(enabled, imgCount = 0) {
            if (!this.button) return;
            this.button.disabled = !enabled;
            if (enabled) {
                const text = imgCount > 0 ? `复制内容 (${imgCount}图)` : '复制内容';
                this.button.innerHTML = `<span>📋</span><span>${text}</span>`;
            } else {
                this.button.innerHTML = '<span>⏳</span><span>等待内容...</span>';
            }
        },

        copyContent() {
            if (!this.currentContent) return;
            let copyText = this.currentContent.text;
            if (this.currentContent.images.length > 0) {
                copyText += '\n\n' + this.currentContent.images.join('\n');
            }

            GM_setClipboard(copyText, 'text');
            
            const originalHTML = this.button.innerHTML;
            this.button.innerHTML = '<span>✅</span><span>已复制</span>';
            this.button.classList.add('copied');
            setTimeout(() => {
                this.button.innerHTML = originalHTML;
                this.button.classList.remove('copied');
            }, 1500);
        }
    };

    // ============================
    // 主控逻辑：统一的监听与初始化
    // ============================
    
    // 统一的 DOM 变化处理 (防抖)
    const handleDOMChange = debounce(() => {
        log('System', 'DOM Changed, processing...');
        TitleHelper.process();
        CopyHelper.scan();
    }, CONFIG.observerDebounce);

    // 启动函数
    function start() {
        // 初始化模块
        TitleHelper.init();
        CopyHelper.init();

        // 设置统一的观察者
        const observer = new MutationObserver((mutations) => {
            let shouldProcess = false;
            for (const mutation of mutations) {
                if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                    // 如果增加的节点包含input或img，或者文本变化，则处理
                    shouldProcess = true; 
                    break;
                }
            }
            if (shouldProcess) handleDOMChange();
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: false, // 关闭属性监听以提升性能，主要靠 childList
            characterData: true
        });

        log('System', 'Shared Observer Started');

        // 路由变化监听 (SPA)
        let lastUrl = location.href;
        setInterval(() => {
            if (location.href !== lastUrl) {
                lastUrl = location.href;
                TitleHelper.serverInfo = null; // 重置服务器缓存
                handleDOMChange();
            }
        }, 1000);

        // 定时兜底 (标题处理)
        setInterval(() => {
            TitleHelper.process();
        }, CONFIG.checkInterval);

        // 定时兜底 (复制检查 - 只有当没内容时才检查，节省资源)
        setInterval(() => {
            if (!CopyHelper.currentContent) {
                CopyHelper.scan();
            }
        }, CONFIG.copyCheckInterval);
    }

    // 启动
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start);
    } else {
        start();
    }

})();

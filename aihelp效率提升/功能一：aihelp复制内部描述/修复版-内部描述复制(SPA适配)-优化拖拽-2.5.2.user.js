// ==UserScript==
// @name         修复版-内部描述复制(SPA适配)-优化拖拽
// @namespace    http://tampermonkey.net/
// @version      2.5.2
// @description  基于2.5.1版本，修复拖拽问题，优化状态显示
// @author       ll96victor
// @match        https://ml-panel.aihelp.net/dashboard/*
// @grant        GM_setClipboard
// @grant        GM_addStyle
// @run-at       document-end
// ==/UserScript==

(function() {
    'use strict';

    // 优化样式 - 改进拖拽和状态显示
    GM_addStyle(`
        .fixed-copy-btn {
            position: fixed !important;
            z-index: 100000 !important;
            background: linear-gradient(135deg, #2196F3 0%, #21CBF3 100%) !important;
            color: white !important;
            border: none !important;
            border-radius: 20px !important;
            padding: 8px 16px !important;
            font-size: 12px !important;
            font-weight: bold !important;
            cursor: move !important;
            box-shadow: 0 4px 15px rgba(33, 150, 243, 0.4) !important;
            transition: all 0.3s ease !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            gap: 6px !important;
            min-width: 140px !important;
            max-width: 200px !important;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
            user-select: none !important;
            box-sizing: border-box !important;
            overflow: hidden !important;
            white-space: nowrap !important;
            text-overflow: ellipsis !important;
        }

        .fixed-copy-btn:hover {
            transform: translateY(-2px) !important;
            box-shadow: 0 6px 20px rgba(33, 150, 243, 0.6) !important;
            cursor: move !important;
        }

        .fixed-copy-btn.copied {
            background: linear-gradient(135deg, #4CAF50 0%, #8BC34A 100%) !important;
            animation: pulse 0.5s ease !important;
        }

        .fixed-copy-btn.error {
            background: linear-gradient(135deg, #F44336 0%, #E91E63 100%) !important;
        }

        .fixed-copy-btn:disabled {
            background: linear-gradient(135deg, #9E9E9E 0%, #BDBDBD 100%) !important;
            cursor: not-allowed !important;
            opacity: 0.8 !important;
        }

        .fixed-copy-btn.dragging {
            opacity: 0.9 !important;
            box-shadow: 0 8px 25px rgba(33, 150, 243, 0.8) !important;
            cursor: grabbing !important;
        }

        .fixed-copy-btn .btn-text {
            overflow: hidden !important;
            text-overflow: ellipsis !important;
            max-width: 120px !important;
        }

        @keyframes pulse {
            0% { transform: scale(1); }
            50% { transform: scale(1.05); }
            100% { transform: scale(1); }
        }

        @keyframes fadeIn {
            from { opacity: 0; transform: translateY(-10px); }
            to { opacity: 1; transform: translateY(0); }
        }
    `);

    class FixedContentCopier {
        constructor() {
            this.startMarker = "内部描述";
            this.endMarker = "描述";
            this.copyButton = null;
            this.currentContent = null;
            this.isDragging = false;
            this.dragStartPos = { x: 0, y: 0 };
            this.buttonStartPos = { x: 20, y: 20 }; // 默认位置
            this.init();
        }

        init() {
            console.log('修复版脚本已启动（版本2.5.2 - 优化拖拽和状态显示）');

            // 从本地存储加载之前保存的位置
            this.loadButtonPosition();

            // 创建按钮
            this.createButton();

            // 初始扫描
            this.scanForContent();

            // 设置SPA监听器
            this.setupSPAListeners();
        }

        loadButtonPosition() {
            try {
                const savedPos = localStorage.getItem('fixedCopyBtn_position');
                if (savedPos) {
                    const pos = JSON.parse(savedPos);
                    this.buttonStartPos = pos;
                    console.log('加载按钮位置:', pos);
                }
            } catch (e) {
                console.warn('无法加载按钮位置:', e);
            }
        }

        saveButtonPosition(x, y) {
            try {
                const pos = { x, y };
                localStorage.setItem('fixedCopyBtn_position', JSON.stringify(pos));
            } catch (e) {
                console.warn('无法保存按钮位置:', e);
            }
        }

        createButton() {
            // 移除旧按钮
            const oldBtn = document.querySelector('.fixed-copy-btn');
            if (oldBtn) oldBtn.remove();

            this.copyButton = document.createElement('button');
            this.copyButton.className = 'fixed-copy-btn';
            this.copyButton.innerHTML = `
                <span>⏳</span>
                <span class="btn-text">等待内容...</span>
            `;
            this.copyButton.disabled = true;
            this.copyButton.title = "点击复制内容 | 拖拽移动位置";

            // 设置初始位置
            this.copyButton.style.left = `${this.buttonStartPos.x}px`;
            this.copyButton.style.top = `${this.buttonStartPos.y}px`;

            // 添加点击事件
            this.copyButton.addEventListener('click', (e) => {
                if (!this.isDragging) {
                    this.copyContent();
                }
            });

            // ========== 优化的拖拽逻辑 ==========
            this.copyButton.addEventListener('mousedown', (e) => {
                // 只允许左键拖拽
                if (e.button !== 0) return;

                this.isDragging = true;
                this.dragStartPos = {
                    x: e.clientX,
                    y: e.clientY
                };

                // 获取按钮当前位置
                const rect = this.copyButton.getBoundingClientRect();
                this.buttonStartPos = {
                    x: rect.left,
                    y: rect.top
                };

                // 添加拖拽样式
                this.copyButton.classList.add('dragging');
                this.copyButton.style.cursor = 'grabbing';

                e.preventDefault();
                e.stopPropagation();
            });

            // 使用更高效的拖拽处理
            const handleMouseMove = (e) => {
                if (!this.isDragging) return;

                // 计算移动距离
                const deltaX = e.clientX - this.dragStartPos.x;
                const deltaY = e.clientY - this.dragStartPos.y;

                // 计算新位置
                let newX = this.buttonStartPos.x + deltaX;
                let newY = this.buttonStartPos.y + deltaY;

                // 边界检查
                const viewportWidth = window.innerWidth;
                const viewportHeight = window.innerHeight;
                const btnRect = this.copyButton.getBoundingClientRect();

                // 确保按钮不会移出视口
                newX = Math.max(0, Math.min(newX, viewportWidth - btnRect.width));
                newY = Math.max(0, Math.min(newY, viewportHeight - btnRect.height));

                // 更新按钮位置
                this.copyButton.style.left = `${newX}px`;
                this.copyButton.style.top = `${newY}px`;
            };

            const handleMouseUp = () => {
                if (this.isDragging) {
                    this.isDragging = false;

                    // 移除拖拽样式
                    this.copyButton.classList.remove('dragging');
                    this.copyButton.style.cursor = 'move';

                    // 保存当前位置
                    const rect = this.copyButton.getBoundingClientRect();
                    this.saveButtonPosition(rect.left, rect.top);
                }
            };

            // 添加事件监听器
            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);

            // 防止拖拽时选中文本
            document.addEventListener('selectstart', (e) => {
                if (this.isDragging) {
                    e.preventDefault();
                }
            });

            // 添加动画效果
            this.copyButton.style.animation = 'fadeIn 0.3s ease';

            document.body.appendChild(this.copyButton);

            // 清理动画
            setTimeout(() => {
                this.copyButton.style.animation = '';
            }, 300);
        }

        scanForContent() {
            console.log('扫描内容...');

            // 使用精确提取方法
            const content = this.extractContent();

            if (content && (content.text || content.images.length > 0)) {
                this.currentContent = content;
                this.updateButtonState(true, content.images.length);
                console.log('找到内容:', {
                    文本长度: content.text ? content.text.length : 0,
                    图片数量: content.images.length
                });
            } else {
                this.currentContent = null;
                this.updateButtonState(false);
                console.log('未找到内容');
            }
        }

        // 精确提取逻辑（保持不变）
        extractContent() {
            const result = {
                text: '',
                images: []
            };

            // 1. 查找起始元素
            const startElement = this.findStartElement();
            if (!startElement) {
                console.log('未找到起始元素');
                return null;
            }

            // 2. 向上找到容器
            let container = this.findContainer(startElement);
            if (!container) {
                console.log('使用文档主体作为容器');
                container = document.body;
            }

            // 3. 提取容器内的文本和图片
            const content = this.extractFromContainer(container);

            // 4. 在容器文本中查找从"内部描述"到"描述"之间的内容
            const startIndex = content.text.indexOf(this.startMarker);
            let endIndex = content.text.indexOf(this.endMarker, startIndex + this.startMarker.length);

            if (startIndex === -1) {
                console.log('未找到起始标记');
                return result;
            }

            if (endIndex === -1) {
                console.log('未找到结束标记，提取到容器末尾');
                endIndex = content.text.length;
            } else {
                // 包含结束标记
                endIndex += this.endMarker.length;
            }

            // 5. 提取纯文本（不包含"内部描述"四个字）
            result.text = content.text.substring(startIndex + this.startMarker.length, endIndex).trim();

            // 6. 提取相关图片（在容器内）
            result.images = this.filterImages(content.images, container);

            // 7. 清理文本开头可能出现的多余空格或换行
            result.text = this.cleanTextStart(result.text);

            return result;
        }

        findStartElement() {
            // 多种方式查找起始元素
            const selectors = [
                '[内部描述]',
                '[name*="内部描述"]',
                '[data-内部描述]',
                '.内部描述',
                '[class*="内部描述"]',
                '#内部描述',
                '[id*="内部描述"]'
            ];

            for (const selector of selectors) {
                try {
                    const element = document.querySelector(selector);
                    if (element) {
                        return element;
                    }
                } catch (e) {
                    console.warn(`选择器 ${selector} 出错:`, e);
                }
            }

            // 通过文本内容查找
            const walker = document.createTreeWalker(
                document.body,
                NodeFilter.SHOW_TEXT,
                {
                    acceptNode: function(node) {
                        if (node.textContent.includes('内部描述')) {
                            return NodeFilter.FILTER_ACCEPT;
                        }
                        return NodeFilter.FILTER_SKIP;
                    }
                }
            );

            const textNode = walker.nextNode();
            if (textNode) {
                return textNode.parentElement;
            }

            return null;
        }

        findContainer(element) {
            // 常见的容器标签
            const containerTags = ['DIV', 'SECTION', 'ARTICLE', 'MAIN', 'FORM',
                                  'TABLE', 'UL', 'OL', 'DL', 'FIGURE', 'ASIDE'];

            let current = element;
            while (current && current !== document.body) {
                if (containerTags.includes(current.tagName)) {
                    return current;
                }
                current = current.parentElement;
            }

            return current;
        }

        extractFromContainer(container) {
            const result = {
                text: '',
                images: []
            };

            // 创建临时副本进行处理
            const clone = container.cloneNode(true);

            // 移除不需要的元素
            const elementsToRemove = clone.querySelectorAll(
                'script, style, iframe, noscript, nav, header, footer'
            );
            elementsToRemove.forEach(el => el.remove());

            // 提取纯文本
            const walker = document.createTreeWalker(
                clone,
                NodeFilter.SHOW_TEXT,
                null,
                false
            );

            let node;
            const textNodes = [];
            while (node = walker.nextNode()) {
                const text = node.textContent.trim();
                if (text) {
                    textNodes.push(text);
                }
            }

            result.text = textNodes.join('\n');

            // 提取图片
            const images = container.querySelectorAll('img');
            images.forEach(img => {
                if (img.src) {
                    result.images.push({
                        src: this.resolveUrl(img.src),
                        alt: img.alt || ''
                    });
                }
            });

            return result;
        }

        filterImages(images, container) {
            // 去重
            const uniqueImages = [];
            const seen = new Set();

            images.forEach(img => {
                if (!seen.has(img.src)) {
                    seen.add(img.src);
                    uniqueImages.push(img);
                }
            });

            return uniqueImages;
        }

        resolveUrl(url) {
            if (url.startsWith('//')) {
                return window.location.protocol + url;
            } else if (url.startsWith('/')) {
                return window.location.origin + url;
            } else if (!url.startsWith('http')) {
                const base = window.location.href.substring(
                    0, window.location.href.lastIndexOf('/') + 1
                );
                return base + url;
            }
            return url;
        }

        cleanTextStart(text) {
            if (!text) return '';

            // 去除开头的空白字符（空格、换行、制表符等）
            return text.replace(/^[\s\n\r\t]+/, '');
        }

        updateButtonState(enabled, imageCount = 0) {
            if (!this.copyButton) return;

            this.copyButton.disabled = !enabled;

            const btnText = this.copyButton.querySelector('.btn-text');
            if (!btnText) return;

            if (enabled) {
                let statusText = '复制内容';
                if (imageCount > 0) {
                    statusText = `复制 (${imageCount}图)`;
                }
                btnText.textContent = statusText;
                this.copyButton.innerHTML = `<span>📋</span><span class="btn-text">${statusText}</span>`;
            } else {
                this.copyButton.innerHTML = '<span>⏳</span><span class="btn-text">等待内容...</span>';
            }
        }

        copyContent() {
            if (!this.currentContent) return;

            // 构建输出文本
            let copyText = '';

            // 添加文本（已经去除了"内部描述"四个字）
            if (this.currentContent.text) {
                copyText = this.currentContent.text;
            }

            // 添加图片链接（纯链接，没有序号）
            if (this.currentContent.images && this.currentContent.images.length > 0) {
                if (copyText) copyText += '\n\n';
                this.currentContent.images.forEach((img) => {
                    copyText += `${img.src}\n`;
                });
            }

            // 复制到剪贴板
            if (typeof GM_setClipboard === 'function') {
                GM_setClipboard(copyText, 'text');
                this.showSuccess();
            } else {
                // 备用方案
                navigator.clipboard.writeText(copyText).catch(() => {
                    const textarea = document.createElement('textarea');
                    textarea.value = copyText;
                    document.body.appendChild(textarea);
                    textarea.select();
                    document.execCommand('copy');
                    document.body.removeChild(textarea);
                });
                this.showSuccess();
            }

            console.log('纯内容已复制:', {
                textLength: this.currentContent.text ? this.currentContent.text.length : 0,
                imageCount: this.currentContent.images ? this.currentContent.images.length : 0
            });
        }

        showSuccess() {
            if (!this.copyButton) return;

            const originalHTML = this.copyButton.innerHTML;
            this.copyButton.innerHTML = `
                <span>✅</span>
                <span class="btn-text">已复制</span>
            `;
            this.copyButton.classList.add('copied');
            this.copyButton.disabled = true; // 暂时禁用

            setTimeout(() => {
                this.copyButton.innerHTML = originalHTML;
                this.copyButton.classList.remove('copied');
                this.copyButton.disabled = !this.currentContent;
            }, 1500);
        }

        setupSPAListeners() {
            // 监听DOM变化
            const observer = new MutationObserver((mutations) => {
                let contentChanged = false;

                for (const mutation of mutations) {
                    if (mutation.addedNodes.length > 0 ||
                        mutation.removedNodes.length > 0) {
                        contentChanged = true;
                        break;
                    }
                }

                if (contentChanged) {
                    // 延迟扫描，等待内容稳定
                    setTimeout(() => {
                        this.scanForContent();
                    }, 300);
                }
            });

            observer.observe(document.body, {
                childList: true,
                subtree: true
            });

            // 监听点击事件（可能触发内容变化）
            document.addEventListener('click', (e) => {
                const target = e.target;

                // 检查点击的是否可能是链接或按钮
                if (target.tagName === 'A' ||
                    target.tagName === 'BUTTON' ||
                    target.closest('a') ||
                    target.closest('button')) {

                    // 延迟扫描，等待新内容加载
                    setTimeout(() => {
                        this.scanForContent();
                    }, 500);
                }
            }, true);

            // 定期扫描（每5秒一次，作为后备）
            setInterval(() => {
                if (!this.currentContent) {
                    this.scanForContent();
                }
            }, 5000);
        }
    }

    // 启动
    let copier = null;

    function start() {
        copier = new FixedContentCopier();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start);
    } else {
        start();
    }

    // 全局重载函数，方便调试
    window.reloadCopyScript = () => {
        if (copier) {
            copier.scanForContent();
        }
    };

})();
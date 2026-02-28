// ==UserScript==
// @name         修复版-内部描述复制(SPA适配)
// @namespace    http://tampermonkey.net/
// @version      2.5.1
// @description  基于2.4版本的精确提取逻辑，添加SPA动态检测，修复拖拽问题
// @author       ll96victor
// @match        https://ml-panel.aihelp.net/dashboard/*
// @grant        GM_setClipboard
// @grant        GM_addStyle
// @run-at       document-end
// ==/UserScript==

(function() {
    'use strict';

    // 2.4版本的样式（修复定位和拖拽相关样式）
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
            width: auto !important; /* 固定宽度，防止拉伸 */
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
            top: 20px !important;
            left: 20px !important; /* 统一用left定位，取消right */
            user-select: none !important;
            resize: none !important;
            box-sizing: border-box !important; /* 盒模型统一 */
        }

        .fixed-copy-btn:hover {
            transform: translateY(-2px) !important;
            box-shadow: 0 6px 20px rgba(33, 150, 243, 0.6) !important;
        }

        .fixed-copy-btn.copied {
            background: linear-gradient(135deg, #4CAF50 0%, #8BC34A 100%) !important;
            animation: pulse 0.5s ease !important;
        }

        .fixed-copy-btn.error {
            background: linear-gradient(135deg, #F44336 0%, #E91E63 100%) !important;
        }

        .fixed-copy-btn:disabled {
            background: #BDBDBD !important;
            cursor: not-allowed !important;
        }

        @keyframes pulse {
            0% { transform: scale(1); }
            50% { transform: scale(1.05); }
            100% { transform: scale(1); }
        }
    `);

    class FixedContentCopier {
        constructor() {
            this.startMarker = "内部描述";
            this.endMarker = "描述";
            this.copyButton = null;
            this.currentContent = null;
            this.init();
        }

        init() {
            console.log('修复版脚本已启动（基于2.4版本，修复拖拽问题）');

            // 创建按钮
            this.createButton();

            // 初始扫描
            this.scanForContent();

            // 设置SPA监听器
            this.setupSPAListeners();
        }

        createButton() {
            // 移除旧按钮
            const oldBtn = document.querySelector('.fixed-copy-btn');
            if (oldBtn) oldBtn.remove();

            this.copyButton = document.createElement('button');
            this.copyButton.className = 'fixed-copy-btn';
            this.copyButton.innerHTML = '<span>📋</span><span>等待内容...</span>';
            this.copyButton.disabled = true;
            this.copyButton.addEventListener('click', () => this.copyContent());

            // ========== 修复拖拽逻辑 ==========
            let isDragging = false;
            let startX, startY, initialLeft, initialTop;

            // 鼠标按下：记录初始位置
            this.copyButton.addEventListener('mousedown', (e) => {
                // 只允许左键拖拽
                if (e.button !== 0) return;

                isDragging = true;
                // 获取按钮当前的定位坐标（带单位转数字）
                initialLeft = parseFloat(window.getComputedStyle(this.copyButton).left) || 20;
                initialTop = parseFloat(window.getComputedStyle(this.copyButton).top) || 20;
                // 记录鼠标按下时的坐标
                startX = e.clientX;
                startY = e.clientY;

                // 阻止默认行为（防止选中文字/拉伸）
                e.preventDefault();
                // 提升层级，防止被遮挡
                this.copyButton.style.zIndex = 100001;
            });

            // 鼠标移动：计算偏移并更新位置（加边界限制）
            document.addEventListener('mousemove', (e) => {
                if (!isDragging) return;

                // 计算鼠标偏移量
                const dx = e.clientX - startX;
                const dy = e.clientY - startY;

                // 新的定位坐标
                let newLeft = initialLeft + dx;
                let newTop = initialTop + dy;

                // ========== 边界限制：防止按钮超出视口 ==========
                // 视口宽度/高度
                const viewportWidth = window.innerWidth;
                const viewportHeight = window.innerHeight;
                // 按钮自身宽高（带单位转数字）
                const btnWidth = parseFloat(window.getComputedStyle(this.copyButton).width) || 140;
                const btnHeight = parseFloat(window.getComputedStyle(this.copyButton).height) || 40;

                // 左边界：不能小于0
                newLeft = Math.max(0, newLeft);
                // 右边界：不能超出视口（按钮右边缘不超过视口）
                newLeft = Math.min(newLeft, viewportWidth - btnWidth - 10); // 留10px边距
                // 上边界：不能小于0
                newTop = Math.max(0, newTop);
                // 下边界：不能超出视口（按钮下边缘不超过视口）
                newTop = Math.min(newTop, viewportHeight - btnHeight - 10); // 留10px边距

                // 更新按钮位置（只改left/top，避免拉伸）
                this.copyButton.style.left = `${newLeft}px`;
                this.copyButton.style.top = `${newTop}px`;
            });

            // 鼠标松开：结束拖拽
            document.addEventListener('mouseup', () => {
                if (isDragging) {
                    isDragging = false;
                    // 恢复层级
                    this.copyButton.style.zIndex = 100000;
                }
            });

            // 鼠标离开窗口：强制结束拖拽（防止卡死）
            document.addEventListener('mouseleave', () => {
                isDragging = false;
                this.copyButton.style.zIndex = 100000;
            });

            document.body.appendChild(this.copyButton);
        }

        scanForContent() {
            console.log('扫描内容...');

            // 使用2.4版本的精确提取方法
            const content = this.extractContent();

            if (content && (content.text || content.images.length > 0)) {
                this.currentContent = content;
                this.updateButtonState(true);
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

        // 2.4版本的精确提取逻辑（无修改）
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

        updateButtonState(enabled) {
            if (!this.copyButton) return;

            this.copyButton.disabled = !enabled;

            if (enabled) {
                const imageCount = this.currentContent?.images.length || 0;
                const buttonText = imageCount > 0
                    ? `复制内容 (${imageCount}图)`
                    : '复制内容';
                this.copyButton.innerHTML = `<span>📋</span><span>${buttonText}</span>`;
            } else {
                this.copyButton.innerHTML = '<span>⏳</span><span>等待内容...</span>';
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
                <span>已复制</span>
            `;
            this.copyButton.classList.add('copied');

            setTimeout(() => {
                this.copyButton.innerHTML = originalHTML;
                this.copyButton.classList.remove('copied');
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
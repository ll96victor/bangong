// ==UserScript==
// @name         纯内容版-内部描述到描述复制（去除标记词）
// @namespace    http://tampermonkey.net/
// @version      2.2
// @description  只复制从"内部描述"到"描述"之间的纯文本和图片链接，无额外格式，且不包含"内部描述"这四个字
// @author       Python教授
// @match        *://*/*
// @grant        GM_setClipboard
// @grant        GM_notification
// @grant        GM_addStyle
// @run-at       document-end
// ==/UserScript==

(function() {
    'use strict';

    // 简洁的按钮样式
    GM_addStyle(`
        .internal-desc-copy-btn {
            position: fixed !important;
            z-index: 100000 !important;
            background: linear-gradient(135deg, #2196F3 0%, #21CBF3 100%) !important;
            color: white !important;
            border: none !important;
            border-radius: 20px !important;
            padding: 12px 24px !important;
            font-size: 14px !important;
            font-weight: bold !important;
            cursor: pointer !important;
            box-shadow: 0 4px 15px rgba(33, 150, 243, 0.4) !important;
            transition: all 0.3s ease !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            gap: 8px !important;
            min-width: 180px !important;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
            top: 20px !important;
            right: 20px !important;
        }

        .internal-desc-copy-btn:hover {
            transform: translateY(-2px) !important;
            box-shadow: 0 6px 20px rgba(33, 150, 243, 0.6) !important;
        }

        .internal-desc-copy-btn.copied {
            background: linear-gradient(135deg, #4CAF50 0%, #8BC34A 100%) !important;
            animation: pulse 0.5s ease !important;
        }

        .internal-desc-copy-btn.error {
            background: linear-gradient(135deg, #F44336 0%, #E91E63 100%) !important;
        }

        @keyframes pulse {
            0% { transform: scale(1); }
            50% { transform: scale(1.05); }
            100% { transform: scale(1); }
        }
    `);

    class PureContentCopier {
        constructor() {
            this.startMarker = "内部描述";
            this.endMarker = "描述";
            this.copyButton = null;
            this.init();
        }

        init() {
            console.log('纯内容复制脚本已启动');

            // 等待页面稳定
            setTimeout(() => {
                this.scanForTarget();
                this.setupMutationObserver();
            }, 1500);
        }

        scanForTarget() {
            console.log('扫描页面内容...');

            const startElement = this.findStartElement();
            if (!startElement) {
                console.log('未找到"内部描述"');
                return;
            }

            console.log('找到起始位置，正在提取内容...');

            const content = this.extractPureContent(startElement);
            if (content.text || content.images.length > 0) {
                this.addCopyButton(content);
            } else {
                console.log('未找到有效内容');
            }
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

        extractPureContent(startElement) {
            const result = {
                text: '',
                images: []
            };

            // 向上找到最近的块级容器
            let container = this.findContentContainer(startElement);
            if (!container) {
                console.log('使用文档主体作为容器');
                container = document.body;
            }

            // 提取容器内的文本和图片
            const content = this.extractFromContainer(container);

            // 只保留从"内部描述"到"描述"之间的内容
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

            // 修改点1：提取纯文本，从"内部描述"之后开始，不包含"内部描述"这四个字
            result.text = content.text.substring(startIndex + this.startMarker.length, endIndex).trim();

            // 修改点2：清理文本开头可能出现的多余空格或换行
            result.text = this.cleanTextStart(result.text);

            // 提取相关图片
            result.images = this.filterImages(content.images, container);

            return result;
        }

        findContentContainer(element) {
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
                        alt: img.alt || '图片'
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

        // 新增方法：清理文本开头可能出现的多余空格或换行
        cleanTextStart(text) {
            if (!text) return '';

            // 去除开头的空白字符（空格、换行、制表符等）
            return text.replace(/^[\s\n\r\t]+/, '');
        }

        addCopyButton(content) {
            // 移除已存在的按钮
            const existingButton = document.querySelector('.internal-desc-copy-btn');
            if (existingButton) {
                existingButton.remove();
            }

            // 创建按钮
            this.copyButton = document.createElement('button');
            this.copyButton.className = 'internal-desc-copy-btn';
            this.copyButton.innerHTML = `
                <span>📋</span>
                <span>复制内容</span>
            `;

            // 存储内容供复制使用
            this.copyButton.dataset.content = JSON.stringify(content);

            // 添加点击事件
            this.copyButton.addEventListener('click', (e) => {
                this.copyPureContent(e.target.dataset.content);
            });

            // 添加到页面
            document.body.appendChild(this.copyButton);

            console.log('复制按钮已添加');
        }

        copyPureContent(contentJson) {
            try {
                const content = JSON.parse(contentJson);

                // 只复制纯内容，无任何额外格式
                let copyText = '';

                // 添加文本（已经去除了"内部描述"四个字）
                if (content.text) {
                    copyText = content.text;
                }

                // 添加图片链接（如果有）
                if (content.images && content.images.length > 0) {
                    if (copyText) copyText += '\n\n';
                    copyText += '图片链接:\n';
                    content.images.forEach((img, index) => {
                        copyText += `${img.src}\n`;
                    });
                }

                // 复制到剪贴板
                if (typeof GM_setClipboard === 'function') {
                    GM_setClipboard(copyText, 'text');
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
                }

                // 显示成功状态
                this.showSuccess();

                console.log('纯内容已复制:', {
                    textLength: content.text ? content.text.length : 0,
                    imageCount: content.images ? content.images.length : 0
                });

            } catch (error) {
                console.error('复制失败:', error);
                this.showError();
            }
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

        showError() {
            if (!this.copyButton) return;

            const originalHTML = this.copyButton.innerHTML;
            this.copyButton.innerHTML = `
                <span>❌</span>
                <span>失败</span>
            `;
            this.copyButton.classList.add('error');

            setTimeout(() => {
                this.copyButton.innerHTML = originalHTML;
                this.copyButton.classList.remove('error');
            }, 1500);
        }

        setupMutationObserver() {
            // 监听DOM变化，针对动态加载的内容
            const observer = new MutationObserver((mutations) => {
                let shouldRescan = false;

                for (const mutation of mutations) {
                    if (mutation.addedNodes.length > 0) {
                        shouldRescan = true;
                        break;
                    }
                }

                if (shouldRescan && !this.copyButton) {
                    setTimeout(() => {
                        this.scanForTarget();
                    }, 1000);
                }
            });

            observer.observe(document.body, {
                childList: true,
                subtree: true
            });
        }
    }

    // 启动
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            new PureContentCopier();
        });
    } else {
        new PureContentCopier();
    }

})();
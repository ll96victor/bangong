// ==UserScript==
// @name         增强版-内部描述到描述复制
// @namespace    http://tampermonkey.net/
// @version      2.3
// @description  修复遗漏开头图片问题，确保提取所有图片和文本
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

    class EnhancedContentCopier {
        constructor() {
            this.startMarker = "内部描述";
            this.endMarker = "描述";
            this.copyButton = null;
            this.init();
        }

        init() {
            console.log('增强版内容复制脚本已启动');
            
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
            
            const content = this.extractEnhancedContent(startElement);
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

        extractEnhancedContent(startElement) {
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
            
            console.log('使用容器:', container.tagName, container.className || '');
            
            // 新方法：使用DOM遍历提取内容和图片
            this.extractUsingDOM(startElement, container, result);
            
            // 如果DOM提取方法没有提取到图片，尝试备用方法
            if (result.images.length === 0) {
                console.log('DOM提取方法未找到图片，尝试备用方法...');
                const fallbackContent = this.extractFallbackContent(startElement, container);
                result.text = fallbackContent.text;
                result.images = fallbackContent.images;
            }
            
            // 清理文本
            result.text = this.cleanText(result.text);
            
            console.log('提取结果:', {
                文本长度: result.text.length,
                图片数量: result.images.length
            });
            
            return result;
        }

        // 新增：使用DOM遍历方法，确保提取所有图片
        extractUsingDOM(startElement, container, result) {
            // 查找结束标记
            const endElement = this.findEndElement(startElement, container);
            
            // 创建TreeWalker遍历所有节点
            const walker = document.createTreeWalker(
                container,
                NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT,
                {
                    acceptNode: function(node) {
                        return NodeFilter.FILTER_ACCEPT;
                    }
                }
            );
            
            let foundStart = false;
            let foundEnd = false;
            let node = walker.currentNode;
            
            // 开始遍历
            while (node) {
                // 检查是否找到起始元素
                if (node === startElement || (node.contains && node.contains(startElement))) {
                    foundStart = true;
                }
                
                // 检查是否找到结束元素
                if (endElement && (node === endElement || (node.contains && node.contains(endElement)))) {
                    foundEnd = true;
                }
                
                // 如果已经找到起始但未找到结束，处理内容
                if (foundStart && !foundEnd) {
                    if (node.nodeType === Node.TEXT_NODE) {
                        const text = node.textContent.trim();
                        // 跳过"内部描述"标记
                        if (text && text !== this.startMarker) {
                            // 检查是否包含"内部描述"但不在开头
                            if (text.includes(this.startMarker)) {
                                const cleanedText = text.replace(this.startMarker, '').trim();
                                if (cleanedText) {
                                    result.text += cleanedText + '\n';
                                }
                            } else {
                                result.text += text + '\n';
                            }
                        }
                    } else if (node.nodeType === Node.ELEMENT_NODE) {
                        // 检查是否是图片
                        if (node.tagName === 'IMG') {
                            const src = node.src || node.dataset.src || '';
                            if (src) {
                                result.images.push({
                                    src: this.resolveUrl(src),
                                    alt: node.alt || '图片'
                                });
                            }
                        } else if (node.querySelectorAll) {
                            // 检查元素内的图片
                            const images = node.querySelectorAll('img');
                            images.forEach(img => {
                                const src = img.src || img.dataset.src || '';
                                if (src) {
                                    result.images.push({
                                        src: this.resolveUrl(src),
                                        alt: img.alt || '图片'
                                    });
                                }
                            });
                        }
                    }
                }
                
                // 如果已经找到结束，停止遍历
                if (foundEnd) {
                    break;
                }
                
                node = walker.nextNode();
            }
            
            // 如果没有找到结束标记，继续到容器结束
            if (foundStart && !endElement) {
                console.log('未找到结束标记，已提取到容器末尾');
            }
            
            // 去重图片
            result.images = this.removeDuplicateImages(result.images);
        }

        // 新增：查找结束元素
        findEndElement(startElement, container) {
            // 查找包含"描述"但不包含"内部描述"的元素
            const walker = document.createTreeWalker(
                container,
                NodeFilter.SHOW_TEXT,
                {
                    acceptNode: function(node) {
                        const text = node.textContent || '';
                        if (text.includes('描述') && !text.includes('内部描述')) {
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

        // 备用提取方法
        extractFallbackContent(startElement, container) {
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
            
            const fullText = textNodes.join('\n');
            
            // 只保留从"内部描述"到"描述"之间的内容，不包含"内部描述"四个字
            const startIndex = fullText.indexOf(this.startMarker);
            let endIndex = fullText.indexOf(this.endMarker, startIndex + this.startMarker.length);
            
            if (startIndex === -1) {
                console.log('未找到起始标记');
                return result;
            }
            
            if (endIndex === -1) {
                console.log('未找到结束标记，提取到末尾');
                endIndex = fullText.length;
            } else {
                // 包含结束标记
                endIndex += this.endMarker.length;
            }
            
            // 提取文本（不包含"内部描述"四个字）
            result.text = fullText.substring(startIndex + this.startMarker.length, endIndex).trim();
            
            // 增强版图片提取：提取容器内所有图片
            const allImages = container.querySelectorAll('img');
            const images = [];
            
            allImages.forEach(img => {
                if (img.src) {
                    images.push({
                        src: this.resolveUrl(img.src),
                        alt: img.alt || '图片',
                        element: img
                    });
                }
            });
            
            // 筛选在内容区域内的图片
            result.images = this.filterImagesByPosition(images, container, startIndex, endIndex, fullText);
            
            return result;
        }

        // 新增：根据位置筛选图片
        filterImagesByPosition(images, container, startIndex, endIndex, fullText) {
            const filtered = [];
            const seen = new Set();
            
            // 获取容器内所有文本
            const containerText = container.innerText || container.textContent || '';
            
            images.forEach(img => {
                if (seen.has(img.src)) return;
                
                // 方法1：检查图片的alt文本是否在内容区域内
                if (img.alt) {
                    const altIndex = fullText.indexOf(img.alt);
                    if (altIndex >= startIndex && altIndex <= endIndex) {
                        seen.add(img.src);
                        filtered.push(img);
                        return;
                    }
                }
                
                // 方法2：检查图片周围的文本
                const imgText = this.getImageContext(img, container);
                if (imgText) {
                    const contextIndex = fullText.indexOf(imgText);
                    if (contextIndex >= startIndex && contextIndex <= endIndex) {
                        seen.add(img.src);
                        filtered.push(img);
                        return;
                    }
                }
                
                // 方法3：如果图片在起始元素之后，包含它
                const startElement = container.querySelector('[内部描述], .内部描述, #内部描述');
                if (startElement && this.isElementAfter(img.element, startElement)) {
                    seen.add(img.src);
                    filtered.push(img);
                }
            });
            
            return filtered;
        }

        // 新增：获取图片周围的文本内容
        getImageContext(imgElement, container) {
            // 获取图片前后的文本
            let context = '';
            
            // 获取前一个兄弟元素的文本
            let prev = imgElement.previousElementSibling;
            for (let i = 0; i < 2 && prev; i++) {
                const text = prev.textContent || '';
                if (text.trim()) {
                    context = text.trim() + ' ' + context;
                }
                prev = prev.previousElementSibling;
            }
            
            // 获取后一个兄弟元素的文本
            let next = imgElement.nextElementSibling;
            for (let i = 0; i < 2 && next; i++) {
                const text = next.textContent || '';
                if (text.trim()) {
                    context = context + ' ' + text.trim();
                }
                next = next.nextElementSibling;
            }
            
            return context.trim();
        }

        // 新增：检查元素是否在另一个元素之后
        isElementAfter(element, referenceElement) {
            // 比较两个元素在DOM中的位置
            const position = referenceElement.compareDocumentPosition(element);
            return (position & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
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

        resolveUrl(url) {
            if (!url) return '';
            
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
        
        removeDuplicateImages(images) {
            const seen = new Set();
            return images.filter(img => {
                if (seen.has(img.src)) return false;
                seen.add(img.src);
                return true;
            });
        }

        cleanText(text) {
            if (!text) return '';
            
            // 去除开头的空白字符
            let cleaned = text.replace(/^[\s\n\r\t]+/, '');
            
            // 去除多余空行（保留最多2个连续空行）
            cleaned = cleaned.replace(/\n\s*\n\s*\n/g, '\n\n');
            
            return cleaned.trim();
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
            
            // 根据内容设置按钮文本
            let buttonText = '复制内容';
            if (content.images.length > 0) {
                buttonText = `复制内容 (${content.images.length}图)`;
            }
            
            this.copyButton.innerHTML = `
                <span>📋</span>
                <span>${buttonText}</span>
            `;
            
            // 存储内容供复制使用
            this.copyButton.dataset.content = JSON.stringify(content);
            
            // 添加点击事件
            this.copyButton.addEventListener('click', (e) => {
                this.copyContent(e.target.dataset.content);
            });
            
            // 添加到页面
            document.body.appendChild(this.copyButton);
            
            console.log('复制按钮已添加');
        }

        copyContent(contentJson) {
            try {
                const content = JSON.parse(contentJson);
                
                // 构建输出文本
                let copyText = '';
                
                // 添加文本
                if (content.text) {
                    copyText = content.text;
                }
                
                // 添加图片链接
                if (content.images && content.images.length > 0) {
                    if (copyText) copyText += '\n\n';
                    copyText += '图片链接:\n';
                    content.images.forEach((img, index) => {
                        copyText += `${index + 1}. ${img.src}\n`;
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
                
                console.log('内容已复制:', {
                    文本长度: content.text ? content.text.length : 0,
                    图片数量: content.images ? content.images.length : 0
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
            new EnhancedContentCopier();
        });
    } else {
        new EnhancedContentCopier();
    }

})();
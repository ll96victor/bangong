// ==UserScript==
// @name         智能网页关键词检索助手 (性能交互优化版)
// @namespace    http://tampermonkey.net/
// @version      2.1
// @description  优化内存占用，改进点击即时反馈交互
// @author       CodeBuddy AI
// @match        *://*/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    const CONFIG = {
        keywords: ['已联系', '已咨询', '已告知', '已询问'],
        successMsg: '✅ 已联系',
        failMsg: '❌ 未联系',
        searchingMsg: '🔍 正在检索...',
        iconColor: '#4f46e5',
        toastDuration: 2000
    };

    let toastTimer = null;

    /**
     * 判断元素是否肉眼可见
     */
    function isElementVisible(el) {
        if (!el) return false;
        if (el.nodeType === Node.TEXT_NODE) el = el.parentElement;
        // 性能优化：快速剔除 display:none 容器
        if (!el || el.offsetParent === null) return false;
        
        const style = window.getComputedStyle(el);
        return style.display !== 'none' && 
               style.visibility !== 'hidden' && 
               style.opacity !== '0' &&
               el.offsetWidth > 0;
    }

    /**
     * 显示提示信息（支持覆盖和即时重置）
     */
    function showToast(message, bgColor, isTemporary = true) {
        if (toastTimer) clearTimeout(toastTimer); // 清除旧计时器

        let toast = document.getElementById('cb-search-toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'cb-search-toast';
            Object.assign(toast.style, {
                position: 'fixed',
                top: '20px',
                left: '50%',
                transform: 'translateX(-50%)',
                padding: '12px 24px',
                borderRadius: '12px',
                color: 'white',
                fontSize: '16px',
                fontWeight: 'bold',
                zIndex: '2147483647',
                transition: 'opacity 0.2s',
                pointerEvents: 'none',
                boxShadow: '0 4px 12px rgba(0,0,0,0.2)'
            });
            document.body.appendChild(toast);
        }
        
        toast.textContent = message;
        toast.style.backgroundColor = bgColor;
        toast.style.opacity = '1';

        if (isTemporary) {
            toastTimer = setTimeout(() => {
                toast.style.opacity = '0';
            }, CONFIG.toastDuration);
        }
    }

    // 存储高亮元素的引用，用于后续清除
    let highlightedElements = [];

    /**
     * 清除之前的高亮标记
     * 将高亮span替换回普通文本节点，恢复页面原始状态
     */
    function clearHighlights() {
        highlightedElements.forEach(el => {
            if (el.parentNode) {
                const parent = el.parentNode;
                parent.replaceChild(document.createTextNode(el.textContent), el);
                parent.normalize();
            }
        });
        highlightedElements = [];
    }

    /**
     * 高亮文本节点
     * 将匹配的关键词用金色背景的高亮span包裹，实现类似Ctrl+F的视觉定位效果
     * @param {Text} textNode - 要处理的文本节点
     * @param {string} keyword - 要匹配的关键词
     * @returns {DocumentFragment|null} - 包含高亮元素的文档片段
     */
    function highlightTextNode(textNode, keyword) {
        const span = document.createElement('span');
        // 使用金黄色渐变背景模拟浏览器默认的搜索高亮效果
        span.style.cssText = 'background: linear-gradient(120deg, #ffd700 0%, #ffed4e 100%); color: #000; padding: 2px 4px; border-radius: 3px; box-shadow: 0 2px 4px rgba(0,0,0,0.2); font-weight: bold;';
        span.className = 'cb-search-highlight';
        
        const text = textNode.textContent;
        const index = text.indexOf(keyword);
        
        if (index === -1) return null;
        
        // 分割文本：匹配词之前、匹配词本身、匹配词之后
        const before = text.substring(0, index);
        const match = text.substring(index, index + keyword.length);
        const after = text.substring(index + keyword.length);
        
        // 构建新的DOM结构，将匹配的关键词替换为带样式的高亮span
        const fragment = document.createDocumentFragment();
        if (before) fragment.appendChild(document.createTextNode(before));
        
        span.textContent = match;
        fragment.appendChild(span);
        highlightedElements.push(span);
        
        if (after) fragment.appendChild(document.createTextNode(after));
        
        return fragment;
    }

    /**
     * 优化后的搜索流程
     * 新增功能：找到关键词后自动高亮并平滑滚动到目标位置
     */
    function performSearch() {
        // 1. 清除之前的高亮，避免多次搜索时产生重叠高亮
        clearHighlights();
        
        // 2. 点击瞬间反馈，显示正在检索的提示
        showToast(CONFIG.searchingMsg, '#9ca3af', false);

        // 3. 异步执行搜索，防止 UI 阻塞
        setTimeout(() => {
            let foundKeyword = null;
            let foundNode = null;
            
            // 使用 TreeWalker 遍历页面所有文本节点
            const walker = document.createTreeWalker(
                document.body, 
                NodeFilter.SHOW_TEXT, 
                {
                    acceptNode: function(node) {
                        return node.textContent.trim().length > 0 ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
                    }
                }, 
                false
            );

            // 遍历所有文本节点，查找包含关键词的第一个可见节点
            let node;
            while (node = walker.nextNode()) {
                const text = node.textContent;
                const matchedKeyword = CONFIG.keywords.find(k => text.includes(k));
                if (matchedKeyword && isElementVisible(node.parentElement)) {
                    foundKeyword = matchedKeyword;
                    foundNode = node;
                    break;
                }
            }

            // 4. 处理搜索结果：高亮匹配文本并滚动到位置
            if (foundNode && foundKeyword) {
                // 高亮匹配的文本节点
                const fragment = highlightTextNode(foundNode, foundKeyword);
                if (fragment) {
                    foundNode.parentNode.replaceChild(fragment, foundNode);
                }
                
                // 平滑滚动到高亮元素的位置（居中显示）
                const highlightEl = highlightedElements[0];
                if (highlightEl) {
                    highlightEl.scrollIntoView({ 
                        behavior: 'smooth',   // 平滑滚动动画
                        block: 'center',      // 垂直居中
                        inline: 'nearest'     // 水平方向最近边缘
                    });
                }
                
                showToast(CONFIG.successMsg, '#10b981');
            } else {
                showToast(CONFIG.failMsg, '#ef4444');
            }
        }, 50); 
    }

    function createFloatingIcon() {
        if (document.getElementById('cb-floating-search-btn')) return;
        const btn = document.createElement('div');
        btn.id = 'cb-floating-search-btn';
        btn.innerHTML = '🔍';
        Object.assign(btn.style, {
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: '50px',
            height: '50px',
            backgroundColor: CONFIG.iconColor,
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
            zIndex: '2147483646',
            fontSize: '24px',
            userSelect: 'none',
            opacity: '0.7',
            transition: 'all 0.2s ease'
        });

        btn.onmouseover = () => {
            btn.style.opacity = '1';
            btn.style.transform = 'translate(-50%, -50%) scale(1.1)';
        };
        btn.onmouseout = () => {
            btn.style.opacity = '0.7';
            btn.style.transform = 'translate(-50%, -50%) scale(1)';
        };
        btn.onclick = performSearch;
        document.body.appendChild(btn);
    }

    if (document.readyState === 'complete') {
        createFloatingIcon();
    } else {
        window.addEventListener('load', createFloatingIcon);
    }
})();

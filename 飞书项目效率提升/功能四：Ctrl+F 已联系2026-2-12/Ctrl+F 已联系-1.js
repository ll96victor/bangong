// ==UserScript==
// @name         智能网页关键词检索助手 (全能版)
// @namespace    http://tampermonkey.net/
// @version      1.1
// @description  一键检索“已联系、已咨询”等关键词，图标居中显示，内存占用极低
// @author       CodeBuddy AI
// @match        *://*/*
// @grant        none
// ==/UserScript==

/**
 * 💡 编程新手指南：
 * 1. 安装油猴插件（Tampermonkey）。
 * 2. 点击“添加新脚本”。
 * 3. 删掉编辑器里所有内容，把这段代码全部粘贴进去。
 * 4. 按 Ctrl + S 保存。
 * 5. 打开任意网页，点击屏幕中心的 🔍 图标即可使用。
 */

(function() {
    'use strict';

    // ==========================================
    // 1. 配置中心 (后期你可以根据需要修改这里的文字)
    // ==========================================
    const CONFIG = {
        // 你要查找的关键词列表，可以随意增减
        keywords: ['已联系', '已咨询', '已告知', '已询问'],
        
        // 找到和没找到时的提示文字
        successMsg: '✅ 已联系',
        failMsg: '❌ 未联系',
        
        // 图标的颜色（紫色）
        iconColor: '#4f46e5',
        
        // 提示框显示的时长（2000毫秒 = 2秒）
        toastDuration: 2000
    };

    // ==========================================
    // 2. 核心搜索逻辑
    // ==========================================
    function performSearch() {
        /**
         * 逻辑原理：
         * 我们遍历配置中的 keywords 数组。
         * window.find 是浏览器原生的搜索功能（相当于模拟 Ctrl+F）。
         * 只要找到其中任何一个词，found 变量就会有值，随后停止后续搜索。
         */
        const found = CONFIG.keywords.find(keyword => {
            // 参数依次为：搜索词, 大小写敏感, 向后搜索, 循环搜索, 全词匹配, 搜索框架, 显示对话框
            return window.find(keyword, false, false, true, false, true, false);
        });

        // 根据搜索结果弹出不同的提示
        showToast(found ? CONFIG.successMsg : CONFIG.failMsg, found ? '#10b981' : '#ef4444');
    }

    // ==========================================
    // 3. UI 界面逻辑 (提示框)
    // ==========================================
    function showToast(message, bgColor) {
        let toast = document.getElementById('cb-search-toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'cb-search-toast';
            // 设置提示框的样式
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
                zIndex: '2147483647', // 确保显示在最最最顶层
                transition: 'opacity 0.3s',
                pointerEvents: 'none',
                boxShadow: '0 4px 12px rgba(0,0,0,0.2)'
            });
            document.body.appendChild(toast);
        }
        toast.textContent = message;
        toast.style.backgroundColor = bgColor;
        toast.style.opacity = '1';

        // 2秒后自动消失
        setTimeout(() => {
            toast.style.opacity = '0';
        }, CONFIG.toastDuration);
    }

    // ==========================================
    // 4. UI 界面逻辑 (屏幕正中心图标)
    // ==========================================
    function createFloatingIcon() {
        // 如果页面已经有这个图标了，就不重复创建
        if (document.getElementById('cb-floating-search-btn')) return;

        const btn = document.createElement('div');
        btn.id = 'cb-floating-search-btn';
        btn.innerHTML = '🔍';
        
        // 精确对齐屏幕中心点的样式
        Object.assign(btn.style, {
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)', // 核心代码：确保中心点重合
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

        // 交互效果：鼠标悬停时变亮并放大
        btn.onmouseover = () => {
            btn.style.opacity = '1';
            btn.style.transform = 'translate(-50%, -50%) scale(1.1)';
        };
        btn.onmouseout = () => {
            btn.style.opacity = '0.7';
            btn.style.transform = 'translate(-50%, -50%) scale(1)';
        };

        // 点击运行搜索
        btn.onclick = performSearch;

        document.body.appendChild(btn);
    }

    // ==========================================
    // 5. 启动开关
    // ==========================================
    // 确保在网页加载完成后再显示图标
    if (document.readyState === 'complete') {
        createFloatingIcon();
    } else {
        window.addEventListener('load', createFloatingIcon);
    }

})();

// ==UserScript==
// @name         飞书项目列表链接提取-悬浮窗版
// @namespace    https://tampermonkey.net/
// @version      2.1
// @description  提取飞书项目链接，自动剔除?及后面参数，点击时才执行，内存优化版
// @author       自定义
// @match        https://project.feishu.cn/*
// @grant        GM_setClipboard
// @run-at       document-end
// ==/UserScript==

(function() {
    'use strict';

    // ========== 轻量悬浮按钮（仅创建DOM，不执行任何逻辑） ==========
    const btn = document.createElement('div');
    btn.id = 'feishu-extract-btn';
    btn.innerHTML = '⚡';
    btn.title = '点击直接提取链接';
    
    // 样式（一次性设置）
    Object.assign(btn.style, {
        position: 'fixed',
        top: '80px',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: '99999999',
        width: '32px',
        height: '32px',
        borderRadius: '50%',
        background: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
        color: '#fff',
        fontSize: '16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        boxShadow: '0 4px 15px rgba(245, 87, 108, 0.5)',
        transition: 'transform 0.2s ease, box-shadow 0.2s ease',
        userSelect: 'none'
    });
    
    document.body.appendChild(btn);

    // ========== 拖拽相关变量（仅在需要时初始化） ==========
    let isDragging = false;
    let dragStartX = 0;
    let dragStartY = 0;
    let initialLeft = 0;
    let initialTop = 0;
    let onDragMove = null;
    let onDragEnd = null;

    // 悬浮效果
    btn.addEventListener('mouseenter', () => {
        if (!isDragging) {
            btn.style.transform = 'translateX(-50%) scale(1.1)';
            btn.style.boxShadow = '0 6px 20px rgba(245, 87, 108, 0.7)';
        }
    });
    btn.addEventListener('mouseleave', () => {
        btn.style.transform = 'translateX(-50%)';
        btn.style.boxShadow = '0 4px 15px rgba(245, 87, 108, 0.5)';
    });

    // 拖拽开始
    btn.addEventListener('mousedown', (e) => {
        isDragging = false;
        dragStartX = e.clientX;
        dragStartY = e.clientY;
        initialLeft = btn.offsetLeft;
        initialTop = btn.offsetTop;

        onDragMove = (moveEvent) => {
            const deltaX = Math.abs(moveEvent.clientX - dragStartX);
            const deltaY = Math.abs(moveEvent.clientY - dragStartY);

            if (deltaX > 5 || deltaY > 5) {
                isDragging = true;
            }

            if (isDragging) {
                let newX = initialLeft + (moveEvent.clientX - dragStartX);
                let newY = initialTop + (moveEvent.clientY - dragStartY);

                // 边界检测
                newX = Math.max(10, Math.min(newX, window.innerWidth - 42));
                newY = Math.max(10, Math.min(newY, window.innerHeight - 42));

                btn.style.left = newX + 'px';
                btn.style.top = newY + 'px';
                btn.style.transform = 'none';
            }
        };

        onDragEnd = () => {
            document.removeEventListener('mousemove', onDragMove);
            document.removeEventListener('mouseup', onDragEnd);
            
            if (!isDragging) {
                // 点击 - 执行提取
                handleExtract();
            }
            isDragging = false;
        };

        document.addEventListener('mousemove', onDragMove);
        document.addEventListener('mouseup', onDragEnd);
    });

    // ========== 提取功能（仅在点击时执行） ==========
    function handleExtract() {
        // 执行提取
        const linkList = extractLinks();

        // 显示结果
        showStatus(
            linkList.length === 0 
                ? '❌ 未找到链接！请确认列表已加载完成'
                : `✅ 提取成功！共 ${linkList.length} 个干净链接，已复制到剪贴板`,
            linkList.length === 0 ? 'error' : 'success'
        );

        if (linkList.length > 0) {
            GM_setClipboard(linkList.join('\n'));
        }

        // 2秒后清理
        setTimeout(cleanup, 2000);
    }

    // 提取链接（核心逻辑，仅在点击时执行）
    function extractLinks() {
        const links = new Set();
        const docs = [document];

        // 递归获取所有iframe文档
        function traverseFrames(win) {
            for (let i = 0; i < win.frames.length; i++) {
                try {
                    const frameDoc = win.frames[i].document;
                    if (frameDoc) {
                        docs.push(frameDoc);
                        traverseFrames(win.frames[i]);
                    }
                } catch (e) {}
            }
        }
        traverseFrames(window);

        // 提取链接
        docs.forEach(doc => {
            // a标签
            doc.querySelectorAll('a[href]').forEach(a => {
                const href = a.href.trim();
                if (href.includes('project.feishu.cn')) {
                    links.add(href.split('?')[0]);
                }
            });

            // data属性
            doc.querySelectorAll('[data-href], [data-url], [data-link]').forEach(el => {
                ['data-href', 'data-url', 'data-link'].forEach(attr => {
                    const val = el.getAttribute(attr);
                    if (val && val.includes('project.feishu.cn')) {
                        links.add(val.trim().split('?')[0]);
                    }
                });
            });
        });

        return Array.from(links);
    }

    // 显示状态
    function showStatus(message, type) {
        const status = document.createElement('div');
        Object.assign(status.style, {
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            zIndex: '99999999',
            padding: '12px 20px',
            borderRadius: '8px',
            fontSize: '14px',
            color: '#fff',
            backgroundColor: type === 'success' ? 'rgba(51, 204, 102, 0.95)' : 'rgba(255, 51, 51, 0.95)',
            boxShadow: '0 4px 15px rgba(0, 0, 0, 0.3)'
        });
        status.id = 'feishu-extract-status';
        status.innerText = message;
        document.body.appendChild(status);
    }

    // 清理所有DOM和引用
    function cleanup() {
        const btn = document.getElementById('feishu-extract-btn');
        const status = document.getElementById('feishu-extract-status');
        if (btn) btn.remove();
        if (status) status.remove();
    }
})();

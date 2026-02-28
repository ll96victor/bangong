// ==UserScript==
// @name         飞书项目列表链接提取
// @namespace    https://tampermonkey.net/
// @version      1.0
// @description  提取飞书项目链接，自动剔除?及后面参数，执行后自动清理释放内存
// @author       自定义
// @match        https://project.feishu.cn/*
// @grant        GM_setClipboard
// @run-at       document-end
// ==/UserScript==

(function() {
    'use strict';

    // 1. 创建顶部红色按钮
    const btn = document.createElement('button');
    btn.innerText = '✅ 一键提取飞书项目链接';
    btn.style.position = 'fixed';
    btn.style.top = '10px';
    btn.style.left = '50%';
    btn.style.transform = 'translateX(-50%)';
    btn.style.zIndex = '99999999';
    btn.style.padding = '12px 30px';
    btn.style.backgroundColor = '#ff3333';
    btn.style.color = '#fff';
    btn.style.border = 'none';
    btn.style.borderRadius = '8px';
    btn.style.fontSize = '16px';
    btn.style.fontWeight = 'bold';
    btn.style.cursor = 'pointer';
    btn.style.boxShadow = '0 4px 15px rgba(255,51,51,0.5)';
    document.body.appendChild(btn);

    // 2. 工具函数：递归遍历所有 iframe，获取里面的 document
    function getAllDocuments() {
        const docs = [document];
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
        return docs;
    }

    // 3. 工具函数：从字符串中提取飞书项目链接
    function extractFeishuLinksFromString(str) {
        const regex = /https?:\/\/project\.feishu\.cn\/[^\s"']+/g;
        return str.match(regex) || [];
    }

    // 4. 核心：提取并清理链接（剔除?及后面所有字符）
    function extractAndCleanLinks() {
        const links = new Set();
        const allDocs = getAllDocuments();

        allDocs.forEach(doc => {
            // 提取 a 标签 href
            doc.querySelectorAll('a[href]').forEach(a => {
                const href = a.href.trim();
                if (href.includes('project.feishu.cn')) {
                    links.add(href.split('?')[0]); // 剔除?及后面参数
                }
            });

            // 提取 data-* 属性链接
            doc.querySelectorAll('*').forEach(el => {
                Object.values(el.dataset).forEach(val => {
                    if (typeof val === 'string' && val.includes('project.feishu.cn')) {
                        links.add(val.trim().split('?')[0]);
                    }
                });
                ['data-href', 'data-url', 'data-link', 'href'].forEach(attr => {
                    const val = el.getAttribute(attr);
                    if (val && val.includes('project.feishu.cn')) {
                        links.add(val.trim().split('?')[0]);
                    }
                });
                // 提取 onclick 链接
                const onclick = el.getAttribute('onclick');
                if (onclick) {
                    extractFeishuLinksFromString(onclick).forEach(link => {
                        links.add(link.split('?')[0]);
                    });
                }
            });
        });

        return Array.from(links);
    }

    // 5. 点击按钮：提取+复制+自动清理脚本（释放内存）
    function handleClick() {
        // 先移除按钮点击事件，避免重复触发
        btn.removeEventListener('click', handleClick);

        const linkList = extractAndCleanLinks();
        if (linkList.length === 0) {
            alert('未找到链接！请确认列表已加载完成');
        } else {
            GM_setClipboard(linkList.join('\n'));
            alert(`✅ 提取成功！共 ${linkList.length} 个干净链接，已复制到剪贴板`);
        }

        // 自动清理：移除按钮，释放DOM和内存
        document.body.removeChild(btn);

        // 清理所有变量，断开引用，帮助GC回收
        Object.keys(window).forEach(key => {
            if (key.startsWith('btn') || key.startsWith('getAllDocuments') ||
                key.startsWith('extractFeishuLinksFromString') || key.startsWith('extractAndCleanLinks') ||
                key.startsWith('handleClick')) {
                delete window[key];
            }
        });
    }

    // 绑定点击事件
    btn.addEventListener('click', handleClick);
})();
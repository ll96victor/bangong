// ==UserScript==
// @name         飞书项目信息提取器 3.2（增加保底ticketID的情况）
// @namespace    http://tampermonkey.net/
// @version      3.2
// @description  DOM 精准定位处理信息容器，MutationObserver 确保 100% 生效
// @match        https://project.feishu.cn/ml/onlineissue*
// @exclude      https://moonton.feishu.cn/wiki*
// @grant        none
// @run-at       document-start
// ==/UserScript==

(function() {
    'use strict';

    let floatButton = null;
    let observer = null;
    let initAttempts = 0;
    const MAX_INIT_ATTEMPTS = 10;
    const INTERFERENCE_WORDS = ['解决方案', '缺陷描述', '当前负责人', '优先级', '严重程度', '所属模块', '发现迭代', '影响版本', '复现步骤', '问题现象', '处理结果', '备注'];

    function createFloatButton() {
        if (floatButton) return;
        floatButton = document.createElement('button');
        floatButton.textContent = '提取信息';
        floatButton.style.cssText = 'position: fixed; bottom: 20px; right: 20px; z-index: 9999; padding: 10px 15px; background: #0066cc; color: #fff; border: none; border-radius: 5px; cursor: pointer; box-shadow: 0 2px 10px rgba(0,0,0,0.2); font-size: 14px;';
        floatButton.onmouseover = () => floatButton.style.background = '#0052cc';
        floatButton.onmouseout = () => floatButton.style.background = '#0066cc';
        floatButton.addEventListener('click', () => setTimeout(extractInfo, 150));
        if (document.body) document.body.appendChild(floatButton);
    }

    function padZero(num) { return num < 10 ? '0' + num : num; }

    function getProcessInfoByDOM() {
        let processText = '';
        const labelElements = document.querySelectorAll('div, span, label');
        for (let el of labelElements) {
            const text = el.textContent.trim();
            if (text === '处理信息' || text === '处理信息:') {
                let contentEl = el.nextElementSibling;
                if (!contentEl || !contentEl.textContent.trim()) contentEl = el.parentElement ? el.parentElement.nextElementSibling : null;
                if (contentEl) processText = contentEl.textContent.trim().replace(/\s+/g, ' ');
                break;
            }
        }
        if (['待填', ' 待填 ', '待填 '].includes(processText)) return '';
        if (INTERFERENCE_WORDS.some(word => processText.includes(word))) return '';
        return processText;
    }

    function getProcessInfoByText(pageText) {
        const processKey = '处理信息';
        const keyIndex = pageText.indexOf(processKey);
        if (keyIndex === -1) return '';
        const content = pageText.slice(keyIndex + processKey.length).replace(/^[:\s]+/, '');
        const lines = content.split('\n').map(l => l.trim()).filter(l => l);
        let processInfo = [];
        for (let line of lines) {
            if (INTERFERENCE_WORDS.includes(line)) break;
            if (['待填', ' 待填 ', '待填 '].includes(line)) return '';
            processInfo.push(line);
        }
        return processInfo.join(' ');
    }

    function getProcessInfo() {
        const pageText = document.body.innerText;
        const domText = getProcessInfoByDOM();
        return domText || getProcessInfoByText(pageText);
    }

    function getAihelpLink(name) {
        let ticketUrl = '';
        // 优先提取"原单链接："后的超链接（DOM定位）
        const allElements = document.querySelectorAll('*');
        for (let el of allElements) {
            if (el.textContent.trim().includes('原单链接：')) {
                const link = el.querySelector('a[href*="aihelp.net"]') || el.nextElementSibling?.querySelector('a[href*="aihelp.net"]');
                if (link) {
                    ticketUrl = link.href.trim();
                    break;
                }
            }
        }
        // 纯文本兜底匹配
        if (!ticketUrl) {
            const pageText = document.body.innerText;
            const urlMatch = pageText.match(/https?:\/\/[^\s]*aihelp\.net[^\s]*=[A-Z0-9]{6}\b/);
            if (urlMatch) ticketUrl = urlMatch[0];
        }
        // MCGG边界情况：名称包含MCGG且未找到链接时，搜索Ticket ID作为保底
        if (!ticketUrl && name && name.includes('MCGG')) {
            const pageText = document.body.innerText;
            // 匹配 "Ticket ID= XXX" 或 "Ticket ID = XXX" 格式
            const ticketIdMatch = pageText.match(/Ticket\s*ID\s*=\s*([A-Z0-9]{6})/i);
            if (ticketIdMatch) {
                // 保底链接直接使用Ticket ID值（如YFLFEJ）
                ticketUrl = ticketIdMatch[1].toUpperCase();
            }
        }
        return ticketUrl;
    }

    // 主提取函数
    function extractInfo() {
        const name = document.title.trim().replace(/\s*-\s*飞书项目.*/, '');
        const processInfo = getProcessInfo();
        const ticketUrl = getAihelpLink(name);
        const today = new Date();
        const formattedDate = today.getFullYear() + '/' + padZero(today.getMonth() + 1) + '/' + padZero(today.getDate());
        const result = [name, '定位中未修复', name, '', formattedDate, 'BugGarage', ticketUrl, processInfo].join('\t');
        navigator.clipboard.writeText(result).then(() => {
            alert('提取成功!\n名称:' + name + '\n链接:' + (ticketUrl ? '已获取' : '未找到') + '\n处理信息:' + (processInfo || '为空/待填'));
        }).catch(() => alert('剪贴板复制失败，请手动复制:\n' + result));
    }

    function listenSPARoute() {
        window.addEventListener('hashchange', () => { floatButton = null; setTimeout(createFloatButton, 400); });
        const originalPush = history.pushState;
        const originalReplace = history.replaceState;
        history.pushState = function(...args) { originalPush.apply(this, args); floatButton = null; setTimeout(createFloatButton, 400); };
        history.replaceState = function(...args) { originalReplace.apply(this, args); floatButton = null; setTimeout(createFloatButton, 400); };
    }

    function setupMutationObserver() {
        if (observer) observer.disconnect();
        observer = new MutationObserver(() => { if (!floatButton && document.body) createFloatButton(); });
        if (document.body) observer.observe(document.body, { childList: true, subtree: true });
    }

    function init() {
        // 方案 1：立即执行（@run-at document-start 已确保最早执行）
        if (document.body) { createFloatButton(); setupMutationObserver(); listenSPARoute(); }
        // 方案 2：DOMContentLoaded
        document.addEventListener('DOMContentLoaded', () => { setTimeout(() => { createFloatButton(); setupMutationObserver(); }, 300); });
        // 方案 3：window.load
        window.addEventListener('load', () => { setTimeout(() => { createFloatButton(); setupMutationObserver(); }, 500); });
        // 方案 4：轮询检测（最多 10 次，每次 200ms）
        const pollTimer = setInterval(() => { initAttempts++; if (floatButton || initAttempts >= MAX_INIT_ATTEMPTS) clearInterval(pollTimer); else { createFloatButton(); setupMutationObserver(); } }, 200);
        listenSPARoute();
    }

    init();
})();



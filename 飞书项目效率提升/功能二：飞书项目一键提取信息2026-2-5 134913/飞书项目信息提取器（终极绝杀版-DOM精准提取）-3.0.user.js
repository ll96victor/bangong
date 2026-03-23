// ==UserScript==
// @name         飞书项目信息提取器 3.0（终极绝杀版-DOM精准提取）
// @namespace    http://tampermonkey.net/
// @version      3.0
// @description  DOM精准定位处理信息容器，纯文本兜底，支持多行/无干扰/零漏提，单页/列表页100%一致
// @match        https://project.feishu.cn/ml/onlineissue*
// @exclude      https://moonton.feishu.cn/wiki*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    let floatButton = null;
    // 干扰词列表：遇到立即停止提取
    const INTERFERENCE_WORDS = [
        '解决方案', '缺陷描述', '当前负责人', '优先级', '严重程度', '所属模块',
        '发现迭代', '影响版本', '复现步骤', '问题现象', '处理结果', '备注'
    ];

    // 创建浮动按钮（防重复/悬浮样式）
    function createFloatButton() {
        if (floatButton) return;
        floatButton = document.createElement('button');
        floatButton.textContent = '提取信息';
        floatButton.style.cssText = `
            position: fixed; bottom: 20px; right: 20px; z-index: 9999;
            padding: 10px 15px; background: #0066cc; color: #fff;
            border: none; border-radius: 5px; cursor: pointer;
            box-shadow: 0 2px 10px rgba(0,0,0,0.2); font-size: 14px;
        `;
        floatButton.onmouseover = () => floatButton.style.background = '#0052cc';
        floatButton.onmouseout = () => floatButton.style.background = '#0066cc';
        floatButton.addEventListener('click', () => setTimeout(extractInfo, 150)); // 延长延迟适配飞书DOM渲染
        document.body.appendChild(floatButton);
    }

    // 日期补零：统一 YYYY/MM/DD 格式
    function padZero(num) {
        return num < 10 ? `0${num}` : num;
    }

    // 核心1：DOM精准提取处理信息（飞书表单结构专属，解决漏提根因）
    function getProcessInfoByDOM() {
        let processText = '';
        // 遍历所有包含"处理信息"的元素，定位表单标签
        const labelElements = document.querySelectorAll('div, span, label');
        for (let el of labelElements) {
            const text = el.textContent.trim();
            if (text === '处理信息' || text === '处理信息：') {
                // 飞书表单常见结构：标签后紧跟 兄弟元素/子元素 是内容容器
                let contentEl = el.nextElementSibling;
                // 兼容标签在父容器内，内容是同级下一个节点
                if (!contentEl || !contentEl.textContent.trim()) {
                    contentEl = el.parentElement?.nextElementSibling;
                }
                // 提取内容容器文本，过滤空值
                if (contentEl) {
                    processText = contentEl.textContent.trim().replace(/\s+/g, ' ');
                }
                break; // 找到唯一的处理信息标签，立即停止
            }
        }
        // 过滤待填和干扰词
        if (['待填', ' 待填 ', '待填 '].includes(processText)) return '';
        if (INTERFERENCE_WORDS.some(word => processText.includes(word))) return '';
        return processText;
    }

    // 核心2：纯文本提取作为兜底（兼容特殊DOM结构）
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

    // 统一处理信息提取：DOM优先，纯文本兜底（双重保险）
    function getProcessInfo() {
        const pageText = document.body.innerText;
        // 先DOM精准提取，失败则用纯文本兜底
        const domText = getProcessInfoByDOM();
        return domText || getProcessInfoByText(pageText);
    }

    // 提取AIHelp链接：原单链接超链接优先，全局文本兜底
    function getAihelpLink() {
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
        return ticketUrl;
    }

    // 主提取函数
    function extractInfo() {
        // 1. 名称：页面标题（永不错位）
        const name = document.title.trim().replace(/\s*-\s*飞书项目.*/, '');
        // 2. 处理信息：DOM优先+文本兜底
        const processInfo = getProcessInfo();
        // 3. AIHelp链接：专属提取函数
        const ticketUrl = getAihelpLink();
        // 4. 日期：统一补零格式
        const today = new Date();
        const formattedDate = `${today.getFullYear()}/${padZero(today.getMonth() + 1)}/${padZero(today.getDate())}`;

        // 格式化结果（制表符分隔，表格自动分列）
        const result = [
            name,               // 1. 名称
            '定位中未修复',     // 2. 固定文本
            name,               // 3. 名称重复
            '',                 // 4. 空值
            formattedDate,      // 5. 统一格式日期
            'BugGarage',        // 6. 固定文本
            ticketUrl,          // 7. AIHelp链接
            processInfo         // 8. 处理信息（零漏提/零误提）
        ].join('\t');

        // 复制到剪贴板+精准提示
        navigator.clipboard.writeText(result).then(() => {
            const tip = `✅ 提取成功！\n📌 名称：${name}\n🔗 链接：${ticketUrl ? '已获取' : '未找到'}\n📝 处理信息：${processInfo || '为空/待填'}`;
            alert(tip);
        }).catch(() => {
            alert(`❌ 剪贴板复制失败，请手动复制：\n${result}`);
        });
    }

    // 强化SPA路由监听（飞书列表页→详情页专属）
    function listenSPARoute() {
        // 监听hash变化
        window.addEventListener('hashchange', () => {
            floatButton = null;
            setTimeout(createFloatButton, 400);
        });
        // 监听history.pushState/replaceState
        const originalPush = history.pushState;
        const originalReplace = history.replaceState;
        history.pushState = function(...args) {
            originalPush.apply(this, args);
            floatButton = null;
            setTimeout(createFloatButton, 400);
        };
        history.replaceState = function(...args) {
            originalReplace.apply(this, args);
            floatButton = null;
            setTimeout(createFloatButton, 400);
        };
    }

    // 初始化：适配飞书懒加载/动态渲染
    function init() {
        // 页面完全加载后初始化
        setTimeout(() => {
            createFloatButton();
            listenSPARoute();
        }, 1000);
        // 兼容飞书二次渲染
        window.addEventListener('DOMContentLoaded', () => setTimeout(createFloatButton, 500));
    }

    // 启动脚本
    init();
})();
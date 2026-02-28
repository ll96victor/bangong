// ==UserScript==
// @name         飞书项目信息提取器（根治版-轮询检测DOM）
// @namespace    http://tampermonkey.net/
// @version      4.0
// @description  轮询检测处理信息DOM节点，无需手动刷新，点击即提取，单页/列表页100%提取处理信息
// @match        https://project.feishu.cn/ml/onlineissue*
// @exclude      https://moonton.feishu.cn/wiki*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    let floatButton = null;
    // 干扰词列表
    const INTERFERENCE_WORDS = [
        '解决方案', '缺陷描述', '当前负责人', '优先级', '严重程度', '所属模块',
        '发现迭代', '影响版本', '复现步骤', '问题现象', '处理结果', '备注'
    ];
    // 轮询配置：适配飞书DOM渲染速度（可微调）
    const POLL_INTERVAL = 50;    // 每50ms检测一次DOM
    const POLL_TIMEOUT = 2000;   // 最多检测2秒，超时则停止

    // 创建浮动按钮
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
        // 点击直接触发提取（内部轮询检测DOM）
        floatButton.addEventListener('click', extractInfo);
        document.body.appendChild(floatButton);
    }

    // 日期补零：YYYY/MM/DD
    function padZero(num) {
        return num < 10 ? `0${num}` : num;
    }

    // 核心1：轮询检测DOM节点，直到加载完成/超时（根治漏提的关键）
    function pollDOM(selectorFunc) {
        return new Promise((resolve) => {
            const startTime = Date.now();
            // 定时检测
            const timer = setInterval(() => {
                const result = selectorFunc();
                // 检测成功（拿到内容）或超时，停止轮询
                if (result || Date.now() - startTime >= POLL_TIMEOUT) {
                    clearInterval(timer);
                    resolve(result || '');
                }
            }, POLL_INTERVAL);
        });
    }

    // 核心2：DOM提取处理信息（交给轮询检测）
    function getProcessInfoByDOM() {
        let processText = '';
        const labelElements = document.querySelectorAll('div, span, label');
        for (let el of labelElements) {
            const text = el.textContent.trim();
            if (text === '处理信息' || text === '处理信息：') {
                // 飞书表单核心结构：标签后紧跟兄弟/父级兄弟为内容容器
                let contentEl = el.nextElementSibling;
                if (!contentEl || !contentEl.textContent.trim()) {
                    contentEl = el.parentElement?.nextElementSibling;
                }
                // 提取有效文本，过滤多余空格
                if (contentEl) {
                    processText = contentEl.textContent.trim().replace(/\s+/g, ' ');
                }
                break;
            }
        }
        // 过滤待填和干扰词
        if (['待填', ' 待填 ', '待填 '].includes(processText)) return '';
        if (INTERFERENCE_WORDS.some(word => processText.includes(word))) return '';
        return processText;
    }

    // 核心3：纯文本兜底（轮询DOM失败后使用）
    function getProcessInfoByText() {
        const pageText = document.body.innerText;
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

    // 统一获取处理信息：轮询DOM优先，文本兜底
    async function getProcessInfo() {
        // 先轮询检测DOM节点，直到加载完成
        const domText = await pollDOM(getProcessInfoByDOM);
        // DOM提取失败，用纯文本兜底
        return domText || getProcessInfoByText();
    }

    // 提取AIHelp链接（保留原逻辑，稳定）
    function getAihelpLink() {
        let ticketUrl = '';
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
        if (!ticketUrl) {
            const urlMatch = document.body.innerText.match(/https?:\/\/[^\s]*aihelp\.net[^\s]*=[A-Z0-9]{6}\b/);
            if (urlMatch) ticketUrl = urlMatch[0];
        }
        return ticketUrl;
    }

    // 主提取函数（async适配轮询）
    async function extractInfo() {
        // 点击后按钮置灰，防止重复点击
        floatButton.disabled = true;
        floatButton.textContent = '提取中...';
        floatButton.style.background = '#6699cc';

        try {
            // 1. 名称：页面标题（永不错位）
            const name = document.title.trim().replace(/\s*-\s*飞书项目.*/, '');
            // 2. 处理信息：轮询DOM提取（核心）
            const processInfo = await getProcessInfo();
            // 3. AIHelp链接
            const ticketUrl = getAihelpLink();
            // 4. 统一日期格式
            const today = new Date();
            const formattedDate = `${today.getFullYear()}/${padZero(today.getMonth() + 1)}/${padZero(today.getDate())}`;

            // 格式化结果（制表符分隔）
            const result = [
                name, '定位中未修复', name, '', formattedDate, 'BugGarage', ticketUrl, processInfo
            ].join('\t');

            // 复制到剪贴板
            await navigator.clipboard.writeText(result);
            const tip = `✅ 提取成功！\n📌 名称：${name}\n🔗 链接：${ticketUrl ? '已获取' : '未找到'}\n📝 处理信息：${processInfo || '为空/待填'}`;
            alert(tip);
        } catch (err) {
            alert(`❌ 提取失败，请重试：\n${err.message || '未知错误'}`);
        } finally {
            // 恢复按钮状态
            floatButton.disabled = false;
            floatButton.textContent = '提取信息';
            floatButton.style.background = '#0066cc';
        }
    }

    // 强化SPA路由监听（适配飞书所有路由切换）
    function listenSPARoute() {
        // 监听hash/历史记录变化，重置按钮并重建
        const resetButton = () => {
            floatButton = null;
            setTimeout(createFloatButton, 200);
        };
        window.addEventListener('hashchange', resetButton);
        const originalPush = history.pushState;
        const originalReplace = history.replaceState;
        history.pushState = (...args) => { originalPush.apply(this, args); resetButton(); };
        history.replaceState = (...args) => { originalReplace.apply(this, args); resetButton(); };
    }

    // 初始化：适配飞书懒加载
    function init() {
        setTimeout(() => {
            createFloatButton();
            listenSPARoute();
        }, 800);
        // 兼容飞书二次渲染
        window.addEventListener('DOMContentLoaded', () => setTimeout(createFloatButton, 400));
    }

    // 启动脚本
    init();
})();
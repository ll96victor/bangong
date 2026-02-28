// ==UserScript==
// @name         飞书项目信息提取器（终极完美版-单页/列表页完全一致）
// @namespace    http://tampermonkey.net/
// @version      2.0
// @description  兼容飞书项目单页/列表页打开的详情页，处理信息精准提取无错位，日期格式统一，提取结果完全一致
// @match        https://project.feishu.cn/ml/onlineissue*
// @exclude      https://moonton.feishu.cn/wiki*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    let floatButton = null;
    // 干扰词列表：处理信息提取时直接排除
    const INTERFERENCE_WORDS = ['解决方案', '缺陷描述', '当前负责人', '优先级', '严重程度', '所属模块'];

    // 创建浮动按钮（防重复）
    function createFloatButton() {
        if (floatButton) return;
        floatButton = document.createElement('button');
        floatButton.textContent = '提取信息';
        floatButton.style.cssText = `
            position: fixed; bottom: 20px; right: 20px; z-index: 9999;
            padding: 10px 15px; background: #0066cc; color: white;
            border: none; border-radius: 5px; cursor: pointer;
            box-shadow: 0 2px 10px rgba(0,0,0,0.2); font-size: 14px;
            transition: background 0.2s;
        `;
        // 鼠标悬浮样式
        floatButton.onmouseover = () => floatButton.style.background = '#0052cc';
        floatButton.onmouseout = () => floatButton.style.background = '#0066cc';
        floatButton.addEventListener('click', () => {
            // 点击后延迟50ms，确保SPA页面文本完全加载（核心！）
            setTimeout(extractInfo, 50);
        });
        document.body.appendChild(floatButton);
    }

    // 工具函数：日期补零，统一格式 YYYY/MM/DD
    function formatDate(num) {
        return num < 10 ? `0${num}` : num;
    }

    // 核心：精准提取处理信息（彻底跳过干扰词）
    function getProcessInfo(pageText) {
        let processInfo = '';
        const processKey = '处理信息';
        const keyIndex = pageText.indexOf(processKey);
        if (keyIndex === -1) return '';

        // 从"处理信息"后开始截取，排除冒号/空格
        let content = pageText.slice(keyIndex + processKey.length).replace(/^[:\s]+/, '');
        // 按换行分割，遍历找第一个非干扰词的有效内容
        const contentLines = content.split('\n').map(l => l.trim()).filter(l => l);
        for (let line of contentLines) {
            // 不是干扰词 + 不是待填 → 取该内容；是待填 → 置空；是干扰词 → 跳过
            if (!INTERFERENCE_WORDS.includes(line)) {
                processInfo = line;
                break;
            }
        }
        // 过滤待填（含空格）
        if (['待填', ' 待填 ', '待填 '].includes(processInfo)) processInfo = '';
        return processInfo;
    }

    // 提取信息主函数
    function extractInfo() {
        // 每次都重新获取最新页面文本（SPA页面核心）
        const pageText = document.body.innerText;
        let name = '';
        let ticketUrl = '';
        let processInfo = '';

        // 1. 名称：页面标题（最稳定，统一单页/列表页）
        name = document.title.trim().replace(/\s*-\s*飞书项目.*/, '');

        // 2. 处理信息：调用精准提取函数，彻底排除干扰词
        processInfo = getProcessInfo(pageText);

        // 3. AIHelp链接：原单链接超链接优先 → 全局文本兜底（保留稳定逻辑）
        // 优先提取"原单链接："后的超链接
        const allElements = document.querySelectorAll('*');
        for (let el of allElements) {
            const text = el.textContent.trim();
            if (text.includes('原单链接：')) {
                const innerLink = el.querySelector('a[href*="aihelp.net"]');
                if (innerLink) {
                    ticketUrl = innerLink.href;
                    break;
                }
                let nextSibling = el.nextElementSibling;
                while (nextSibling) {
                    const siblingLink = nextSibling.querySelector('a[href*="aihelp.net"]');
                    if (siblingLink) {
                        ticketUrl = siblingLink.href;
                        break;
                    }
                    nextSibling = nextSibling.nextElementSibling;
                }
                if (ticketUrl) break;
            }
        }
        // 全局文本兜底匹配
        if (!ticketUrl) {
            const urlRegex = /https?:\/\/[^\s]*aihelp\.net[^\s]*=[A-Z0-9]{6}\b/g;
            const matchResult = pageText.match(urlRegex);
            if (matchResult && matchResult.length > 0) ticketUrl = matchResult[0];
        }

        // 4. 日期：统一格式 YYYY/MM/DD（补零，单页/列表页一致）
        const today = new Date();
        const formattedDate = `${today.getFullYear()}/${formatDate(today.getMonth() + 1)}/${formatDate(today.getDate())}`;

        // 5. 格式化结果：制表符分隔，粘贴自动分列
        const result = [
            name,               // 1. 名称
            '定位中未修复',     // 2. 固定文本
            name,               // 3. 名称（重复）
            '',                 // 4. 空值
            formattedDate,      // 5. 统一格式日期
            'BugGarage',        // 6. 固定文本
            ticketUrl,          // 7. AIHelp链接
            processInfo         // 8. 处理信息（无干扰、无待填）
        ].join('\t');

        // 复制到剪贴板+精准提示
        navigator.clipboard.writeText(result).then(() => {
            let tip = `✅ 复制成功！\n📌 名称：${name}\n`;
            tip += ticketUrl ? `🔗 AIHelp链接：${ticketUrl.slice(0, 50)}...\n` : '🔗 未找到AIHelp链接\n';
            tip += processInfo ? `📝 处理信息：${processInfo.slice(0, 60)}${processInfo.length>60?'...':''}` : '📝 处理信息为空/待填';
            alert(tip);
        }).catch(err => {
            console.error('复制失败：', err);
            alert(`❌ 复制失败，请手动复制：\n${result}`);
        });
    }

    // 监听SPA路由变化（飞书列表页→详情页核心）
    function listenSPARouteChange() {
        // 监听hash变化
        window.addEventListener('hashchange', () => {
            floatButton = null; // 重置按钮，重新创建
            setTimeout(createFloatButton, 300);
        });
        // 监听history.pushState/replaceState
        const originalPushState = history.pushState;
        const originalReplaceState = history.replaceState;
        history.pushState = function(...args) {
            originalPushState.apply(this, args);
            floatButton = null;
            setTimeout(createFloatButton, 300);
        };
        history.replaceState = function(...args) {
            originalReplaceState.apply(this, args);
            floatButton = null;
            setTimeout(createFloatButton, 300);
        };
    }

    // 初始化：页面加载+路由监听
    window.addEventListener('load', () => {
        // 延迟创建，确保飞书页面完全渲染
        setTimeout(() => {
            createFloatButton();
            listenSPARouteChange();
        }, 800);
    });
    // 兼容页面动态渲染（如飞书懒加载）
    window.addEventListener('DOMContentLoaded', createFloatButton);
})();
// ==UserScript==
// @name         飞书项目信息提取器（标题优先+终极兼容）
// @namespace    http://tampermonkey.net/
// @version      1.3
// @description  优先用页面标题当名称，处理信息精准过滤，兼容所有飞书项目详情页
// @match        https://project.feishu.cn/ml/onlineissue*
// @exclude      https://moonton.feishu.cn/wiki*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    let floatButton = null;

    // 创建浮动按钮
    function createFloatButton() {
        if (floatButton) return;
        floatButton = document.createElement('button');
        floatButton.textContent = '提取信息';
        floatButton.style.position = 'fixed';
        floatButton.style.bottom = '20px';
        floatButton.style.right = '20px';
        floatButton.style.zIndex = '9999';
        floatButton.style.padding = '10px 15px';
        floatButton.style.backgroundColor = '#0066cc';
        floatButton.style.color = 'white';
        floatButton.style.border = 'none';
        floatButton.style.borderRadius = '5px';
        floatButton.style.cursor = 'pointer';
        floatButton.style.boxShadow = '0 2px 10px rgba(0,0,0,0.2)';
        floatButton.style.fontSize = '14px';
        floatButton.addEventListener('click', extractInfo);
        document.body.appendChild(floatButton);
    }

    // 提取信息函数（标题优先+正则精准匹配）
    function extractInfo() {
        const pageText = document.body.innerText;
        const lines = pageText.split('\n');

        // 1. 【终极稳定】名称：优先用页面标题（飞书项目详情页title就是项目名，最准）
        let name = document.title.trim().replace(/\s*-\s*飞书项目.*/, ''); // 去掉飞书项目后缀

        // 2. 【精准过滤】处理信息：正则匹配，排除"缺陷描述""解决方案"干扰
        let processInfo = '';
        const processMatch = pageText.match(/处理信息[\s：]+([^\n]+?)(?=\n\s*(缺陷描述|解决方案|当前负责人|$))/);
        if (processMatch && processMatch[1]) {
            processInfo = processMatch[1].trim();
            // 过滤"待填"（含空格）
            if (['待填', ' 待填 ', '待填 '].includes(processInfo)) {
                processInfo = '';
            }
        }

        // 3. 链接提取（保留原有双逻辑，稳定）
        let ticketUrl = '';
        // 优先原单链接
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
        // 兜底全局搜索
        if (!ticketUrl) {
            const urlRegex = /https?:\/\/[^\s]*aihelp\.net[^\s]*=[A-Z0-9]{6}\b/g;
            const matchResult = pageText.match(urlRegex);
            if (matchResult && matchResult.length > 0) {
                ticketUrl = matchResult[0];
            }
        }

        // 日期格式化
        const today = new Date();
        const formattedDate = `${today.getFullYear()}/${today.getMonth() + 1}/${today.getDate()}`;

        // 最终结果（制表符分隔）
        const result = [
            name,
            '定位中未修复',
            name,
            '',
            formattedDate,
            'BugGarage',
            ticketUrl,
            processInfo
        ].join('\t');

        // 复制+提示
        navigator.clipboard.writeText(result).then(() => {
            let tip = `复制成功！\n✅ 名称（页面标题）：${name}`;
            tip += ticketUrl ? '\n✅ 已提取AIHelp链接' : '\n❌ 未找到AIHelp链接';
            tip += processInfo ? `\n✅ 处理信息：${processInfo}` : '\nℹ️ 处理信息为空/待填';
            alert(tip);
        }).catch(err => {
            console.error('复制失败:', err);
            alert('复制失败，手动复制：\n' + result);
        });
    }

    // 监听SPA路由变化
    function listenSPARouteChange() {
        window.addEventListener('hashchange', createFloatButton);
        const originalPushState = history.pushState;
        history.pushState = function(...args) {
            originalPushState.apply(this, args);
            createFloatButton();
        };
    }

    // 初始化
    window.addEventListener('load', () => {
        setTimeout(createFloatButton, 1000);
        listenSPARouteChange();
    });
})();
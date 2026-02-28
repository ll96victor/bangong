// ==UserScript==
// @name         飞书项目信息提取器（彻底修复版）
// @namespace    http://tampermonkey.net/
// @version      1.1
// @description  精准提取“名称”，过滤含空格的“待填”，保留所有原有逻辑
// @match        https://project.feishu.cn/ml/onlineissue*
// @exclude      https://moonton.feishu.cn/wiki*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // 创建浮动按钮
    function createFloatButton() {
        const button = document.createElement('button');
        button.textContent = '提取信息';
        button.style.position = 'fixed';
        button.style.bottom = '20px';
        button.style.right = '20px';
        button.style.zIndex = '9999';
        button.style.padding = '10px 15px';
        button.style.backgroundColor = '#0066cc';
        button.style.color = 'white';
        button.style.border = 'none';
        button.style.borderRadius = '5px';
        button.style.cursor = 'pointer';
        button.style.boxShadow = '0 2px 10px rgba(0,0,0,0.2)';
        button.style.fontSize = '14px';

        button.addEventListener('click', extractInfo);
        document.body.appendChild(button);
    }

    // 提取信息函数
    function extractInfo() {
        const pageText = document.body.innerText;
        const lines = pageText.split('\n');

        let name = '';
        let processInfo = '';
        let ticketUrl = '';

        // 1. 【修复1】精准提取名称：匹配纯“名称”标签行（排除含其他文字的行）
        const nameIndex = lines.findIndex(line => line.trim() === '名称' || line.trim().startsWith('名称：'));
        if (nameIndex !== -1 && nameIndex + 1 < lines.length) {
            name = lines[nameIndex + 1].trim(); // 确保取下一行的纯文本
        }

        // 2. 【修复2】提取处理信息+过滤“待填”（含空格也能识别）
        const processIndex = lines.findIndex(line => line.trim() === '处理信息' || line.trim().startsWith('处理信息：'));
        if (processIndex !== -1 && processIndex + 1 < lines.length) {
            processInfo = lines[processIndex + 1].trim();
            // 无论是否有空格，只要是“待填”就清空
            if (processInfo === '待填' || processInfo === ' 待填 ' || processInfo === '待填 ') {
                processInfo = '';
            }
        }

        // 3. 优先提取"原单链接："后的超链接（保留原有逻辑）
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

        // 4. 兜底：全局搜索aihelp.net+末尾=6位字符（保留原有逻辑）
        if (!ticketUrl) {
            const urlRegex = /https?:\/\/[^\s]*aihelp\.net[^\s]*=[A-Z0-9]{6}\b/g;
            const matchResult = pageText.match(urlRegex);
            if (matchResult && matchResult.length > 0) {
                ticketUrl = matchResult[0];
            }
        }

        // 5. 当天日期（格式：2026/2/5，保留原有逻辑）
        const today = new Date();
        const formattedDate = `${today.getFullYear()}/${today.getMonth() + 1}/${today.getDate()}`;

        // 格式化结果（制表符分隔，粘贴自动分列）
        const result = [
            name,               // 1. 精准提取的名称
            '定位中未修复',     // 2. 固定文本
            name,               // 3. 名称（重复）
            '',                 // 4. 空值
            formattedDate,      // 5. 当天日期
            'BugGarage',        // 6. 固定文本
            ticketUrl,          // 7. 链接（优先原单，次选全局，无则空）
            processInfo         // 8. 处理信息（“待填”→空，其他正常）
        ].join('\t');

        // 复制到剪贴板 + 明确提示
        navigator.clipboard.writeText(result).then(() => {
            let tip = '复制成功！\n';
            tip += name ? `✅ 名称已提取：${name}` : '❌ 未提取到名称';
            tip += ticketUrl ? `\n✅ 已提取AIHelp链接` : '\n❌ 未找到AIHelp链接，第七格为空';
            tip += processInfo ? `\n✅ 处理信息已提取` : `\nℹ️ 处理信息为空/待填，第八格为空`;
            tip += '\n直接选中表格首单元格粘贴，自动填满8格';
            alert(tip);
        }).catch(err => {
            console.error('复制失败:', err);
            alert('复制失败，手动复制：\n' + result);
        });
    }

    // 页面加载后创建按钮
    window.addEventListener('load', function() {
        setTimeout(createFloatButton, 1000);
    });
})();
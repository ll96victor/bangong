// ==UserScript==
// @name         飞书项目信息提取器（原单链接+全局搜索兜底）
// @namespace    http://tampermonkey.net/
// @version      0.8
// @description  优先提取"原单链接："后的aihelp超链接，无则全局搜索aihelp.net+末尾=6位字符链接，均无则第七格为空
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

        // 1. 提取名称
        const nameIndex = lines.findIndex(line => line.trim().includes('名称'));
        if (nameIndex !== -1 && nameIndex + 1 < lines.length) {
            name = lines[nameIndex + 1].trim();
        }

        // 2. 提取处理信息
        const processIndex = lines.findIndex(line => line.trim().includes('处理信息'));
        if (processIndex !== -1 && processIndex + 1 < lines.length) {
            processInfo = lines[processIndex + 1].trim();
        }

        // 3. 核心逻辑：优先提取"原单链接："后的超链接
        const allElements = document.querySelectorAll('*');
        for (let el of allElements) {
            const text = el.textContent.trim();
            if (text.includes('原单链接：')) {
                // 找当前元素内部的aihelp超链接
                const innerLink = el.querySelector('a[href*="aihelp.net"]');
                if (innerLink) {
                    ticketUrl = innerLink.href;
                    break;
                }
                // 找下一个兄弟元素里的aihelp超链接
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

        // 4. 兜底逻辑：无"原单链接"，则全局搜索aihelp.net+末尾=6位字符的链接
        if (!ticketUrl) {
            // 正则：匹配http/https开头，含aihelp.net，末尾=6位大写字母/数字（如=YU64QT）
            const urlRegex = /https?:\/\/[^\s]*aihelp\.net[^\s]*=[A-Z0-9]{6}\b/g;
            const matchResult = pageText.match(urlRegex);
            if (matchResult && matchResult.length > 0) {
                ticketUrl = matchResult[0]; // 取第一个符合规则的链接
            }
        }

        // 5. 当天日期（格式：2026/2/5）
        const today = new Date();
        const formattedDate = `${today.getFullYear()}/${today.getMonth() + 1}/${today.getDate()}`;

        // 格式化结果（制表符分隔，粘贴自动分列）
        const result = [
            name,               // 1. 名称
            '定位中未修复',     // 2. 固定文本
            name,               // 3. 名称（重复）
            '',                 // 4. 空值
            formattedDate,      // 5. 当天日期
            'BugGarage',        // 6. 固定文本
            ticketUrl,          // 7. 优先原单链接，次选全局搜索，均无则空
            processInfo         // 8. 处理信息
        ].join('\t');

        // 复制到剪贴板 + 明确提示
        navigator.clipboard.writeText(result).then(() => {
            let tip = '复制成功！\n';
            if (ticketUrl) {
                tip += ticketUrl.includes('原单链接') ? `✅ 已提取【原单链接】：${ticketUrl}` : `✅ 已提取【全局搜索】aihelp链接：${ticketUrl}`;
            } else {
                tip += '❌ 未找到任何符合规则的aihelp链接，第七格为空';
            }
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
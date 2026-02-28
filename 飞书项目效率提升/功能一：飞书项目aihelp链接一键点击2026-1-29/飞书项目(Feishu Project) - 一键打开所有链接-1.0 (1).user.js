// ==UserScript==
// @name         飞书项目(Feishu Project) - 一键打开所有链接
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  在project.feishu.cn页面添加悬浮球，点击后批量打开当前页面显示的有效链接（自动去重、排除图片/文件）。支持基本信息栏及评论栏。gemini优化
// @author       ll96victor
// @match        *://project.feishu.cn/*
// @grant        GM_openInTab
// @grant        GM_addStyle
// @run-at       document-end
// ==/UserScript==

(function() {
    'use strict';

    // 1. 配置项：需要排除的文件后缀 (不区分大小写)
    const EXCLUDE_EXTENSIONS = ['.bytes', '.jpg', '.png', '.jpeg'];

    // 2. 注入样式：创建一个简单、不占内存的悬浮球
    // 位置设定在右下角，避免遮挡主要内容
    GM_addStyle(`
        #feishu-link-opener-btn {
            position: fixed;
            bottom: 120px;
            right: 30px;
            width: 60px;
            height: 60px;
            background-color: #3370ff;
            color: white;
            border-radius: 50%;
            box-shadow: 0 4px 10px rgba(0,0,0,0.3);
            text-align: center;
            line-height: 1.2;
            font-size: 14px;
            cursor: pointer;
            z-index: 99999;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: transform 0.2s, background-color 0.2s;
            user-select: none;
            padding: 5px;
            box-sizing: border-box;
        }
        #feishu-link-opener-btn:hover {
            background-color: #285acc;
            transform: scale(1.05);
        }
        #feishu-link-opener-btn:active {
            transform: scale(0.95);
        }
        /* 简单的计数气泡样式（可选） */
        .opener-count-badge {
            display: none; /* 默认隐藏，点击计算后可显示，为了极简这里暂不实时显示 */
        }
    `);

    // 3. 核心功能函数
    function openValidLinks() {
        // 获取页面所有 <a> 标签
        const links = document.querySelectorAll('a');
        const validUrls = new Set(); // 使用 Set 自动去重

        links.forEach(link => {
            const url = link.href;

            // 基础检查：必须有链接且是 http/https 开头 (排除 javascript:; mailto: 等)
            if (!url || !url.startsWith('http')) return;

            // 排除检查：检查后缀
            // 使用 URL 对象解析 pathname，防止 url 参数(?ver=1.0) 干扰后缀判断
            let pathname = '';
            try {
                pathname = new URL(url).pathname.toLowerCase();
            } catch (e) {
                // 如果解析失败，直接用字符串匹配
                pathname = url.toLowerCase();
            }

            const isExcluded = EXCLUDE_EXTENSIONS.some(ext => pathname.endsWith(ext));

            if (isExcluded) return;

            // 添加到集合 (Set 会自动忽略重复值)
            validUrls.add(url);
        });

        // 执行操作
        if (validUrls.size === 0) {
            alert('当前视图未发现符合条件的链接。');
            return;
        }

        // 安全确认：防止一次性打开太多标签页导致浏览器卡死
        // 如果链接数量小于等于 3，直接打开；否则询问
        if (validUrls.size <= 3 || confirm(`检测到 ${validUrls.size} 个有效且不重复的链接。\n\n是否全部打开？`)) {
            validUrls.forEach(url => {
                // 使用 GM_openInTab 在后台打开，active: false 表示不立即跳转过去，以免打断当前操作
                GM_openInTab(url, { active: false, insert: true });
            });
        }
    }

    // 4. 创建 UI
    function createFloatingButton() {
        // 防止重复创建
        if (document.getElementById('feishu-link-opener-btn')) return;

        const btn = document.createElement('div');
        btn.id = 'feishu-link-opener-btn';
        btn.innerHTML = '打开<br>链接';
        btn.title = '点击打开当前视图中的所有链接 (自动过滤图片/文件)';

        // 绑定点击事件
        btn.onclick = function(e) {
            e.stopPropagation(); // 防止点击穿透
            openValidLinks();
        };

        document.body.appendChild(btn);
    }

    // 5. 初始化
    // 直接执行，因为脚本设置为 run-at document-end
    createFloatingButton();

    // 额外保险：Feishu 是单页应用(SPA)，虽然 body 通常不变，但以防万一
    // 如果页面发生剧烈重绘导致按钮消失，下面的观察者会把它加回来（极低频率触发，不影响性能）
    const observer = new MutationObserver(() => {
        if (!document.getElementById('feishu-link-opener-btn')) {
            createFloatingButton();
        }
    });
    observer.observe(document.body, { childList: true });

})();
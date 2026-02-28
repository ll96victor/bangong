// ==UserScript==
// @name         飞书项目(Feishu Project) - 智能链接打开助手 (含预览支持)
// @namespace    http://tampermonkey.net/
// @version      2.0
// @description  在project.feishu.cn添加悬浮球与快捷键(Alt+Q)。点击后批量打开当前页面(包括悬浮预览卡片)中包含'aihelp'且非图片/文件的链接。
// @author       You
// @match        *://project.feishu.cn/*
// @grant        GM_openInTab
// @grant        GM_addStyle
// @run-at       document-end
// ==/UserScript==

(function() {
    'use strict';

    // ================= 配置区域 =================
    // 1. 必须包含的关键词
    const REQUIRED_KEYWORD = 'aihelp';

    // 2. 需要排除的文件后缀 (不区分大小写)
    const EXCLUDE_EXTENSIONS = ['.bytes', '.jpg', '.png', '.jpeg', '.gif'];

    // 3. 快捷键配置 (Alt + Q) - 用于在鼠标悬停预览时触发
    const SHORTCUT_KEY = 'q';
    // ===========================================

    // 注入悬浮球样式
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
            box-shadow: 0 4px 15px rgba(51, 112, 255, 0.4);
            text-align: center;
            line-height: 1.2;
            font-size: 14px;
            cursor: pointer;
            z-index: 2147483647; /* 确保层级最高，覆盖飞书的弹窗 */
            display: flex;
            align-items: center;
            justify-content: center;
            transition: transform 0.2s, background-color 0.2s;
            user-select: none;
            padding: 5px;
            box-sizing: border-box;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
        }
        #feishu-link-opener-btn:hover {
            background-color: #285acc;
            transform: scale(1.05);
        }
        #feishu-link-opener-btn:active {
            transform: scale(0.95);
        }
        /* 添加一个小提示说明快捷键 */
        #feishu-link-opener-btn::after {
            content: 'Alt+Q';
            position: absolute;
            bottom: -20px;
            font-size: 10px;
            color: #666;
            background: rgba(255,255,255,0.8);
            padding: 2px 4px;
            border-radius: 4px;
            white-space: nowrap;
        }
    `);

    // 核心功能：扫描并打开链接
    function openValidLinks() {
        // 1. 扫描范围：整个文档（包括飞书动态生成的 Portal/Modal/Popover 弹窗层）
        const links = document.querySelectorAll('a');
        const validUrls = new Set();
        let scannedCount = 0;

        links.forEach(link => {
            const url = link.href;
            scannedCount++;

            // 基础检查：必须是 http/https
            if (!url || !url.startsWith('http')) return;

            // 需求 A: 必须包含 'aihelp'
            if (!url.includes(REQUIRED_KEYWORD)) return;

            // 需求 B: 排除特定后缀
            let pathname = '';
            try {
                pathname = new URL(url).pathname.toLowerCase();
            } catch (e) {
                pathname = url.toLowerCase();
            }
            const isExcluded = EXCLUDE_EXTENSIONS.some(ext => pathname.endsWith(ext));
            if (isExcluded) return;

            // 存入 Set 去重
            validUrls.add(url);
        });

        // 执行反馈
        if (validUrls.size === 0) {
            // 使用简易提示而不是alert，避免打断操作流（可选）
            showToast(`未发现包含 "${REQUIRED_KEYWORD}" 的有效链接`);
            return;
        }

        // 阈值判断：如果只有1-5个链接，直接打开；太多了则确认一下防止卡死
        if (validUrls.size <= 5 || confirm(`检测到 ${validUrls.size} 个包含 "${REQUIRED_KEYWORD}" 的链接。\n\n是否全部打开？`)) {
            let openedCount = 0;
            validUrls.forEach(url => {
                openedCount++;
                // 稍微错开一点时间打开，虽然 GM_openInTab 是异步的，但为了浏览器稳定性
                setTimeout(() => {
                    GM_openInTab(url, { active: false, insert: true });
                }, openedCount * 100);
            });
            showToast(`正在后台打开 ${validUrls.size} 个链接...`);
        }
    }

    // 辅助功能：简单的屏幕提示 (Toast)
    function showToast(msg) {
        const toast = document.createElement('div');
        toast.textContent = msg;
        toast.style.cssText = `
            position: fixed; top: 20px; left: 50%; transform: translateX(-50%);
            background: rgba(0,0,0,0.7); color: #fff; padding: 10px 20px;
            border-radius: 4px; z-index: 2147483647; font-size: 14px;
            transition: opacity 0.5s; pointer-events: none;
        `;
        document.body.appendChild(toast);
        setTimeout(() => toast.style.opacity = '0', 2000);
        setTimeout(() => toast.remove(), 2500);
    }

    // 创建悬浮球
    function createFloatingButton() {
        if (document.getElementById('feishu-link-opener-btn')) return;

        const btn = document.createElement('div');
        btn.id = 'feishu-link-opener-btn';
        btn.innerHTML = '打开<br>链接';
        btn.title = `点击或按 Alt+${SHORTCUT_KEY.toUpperCase()} 打开当前可见的 aihelp 链接`;

        btn.onclick = function(e) {
            e.stopPropagation();
            openValidLinks();
        };

        document.body.appendChild(btn);
    }

    // 键盘事件监听 (快捷键功能)
    document.addEventListener('keydown', function(e) {
        // 判断是否按下 Alt + Q
        if (e.altKey && e.key.toLowerCase() === SHORTCUT_KEY) {
            // 阻止默认行为（如果有的话）
            e.preventDefault();
            openValidLinks();
        }
    });

    // 初始化
    createFloatingButton();

    // 观察器：防止飞书页面重绘导致按钮消失
    const observer = new MutationObserver(() => {
        if (!document.getElementById('feishu-link-opener-btn')) {
            createFloatingButton();
        }
    });
    observer.observe(document.body, { childList: true });

})();
// ==UserScript==
// @name         飞书项目(Feishu Project) - 智能链接助手 (完美版)
// @namespace    http://tampermonkey.net/
// @version      4.0
// @description  完美版：在project.feishu.cn添加悬浮球与快捷键(Alt+Q)。直接过滤 DOM 节点，批量打开包含 'aihelp' 的有效链接。已修复输入冲突与性能细节。
// @author       You
// @match        *://project.feishu.cn/*
// @grant        GM_openInTab
// @grant        GM_addStyle
// @run-at       document-end
// ==/UserScript==

(function() {
    'use strict';

    // ================= 配置区域 =================
    const CONFIG = {
        KEYWORD: 'aihelp',          // 必须包含的关键词
        SHORTCUT_KEY: 'q',          // 快捷键 Alt + Q
        LOCK_TIME: 1000,            // 防止误触的冷却时间(ms)
        CHECK_INTERVAL: 3000,       // 按钮保活检查间隔(ms)
        // 需要排除的文件后缀 (不区分大小写)
        EXCLUDE_EXTS: ['.bytes', '.jpg', '.png', '.jpeg', '.gif', '.svg', '.webp']
    };
    // ===========================================

    // 状态锁
    let isProcessing = false;

    // 注入样式
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
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            font-size: 14px;
            cursor: pointer;
            z-index: 2147483647;
            transition: transform 0.2s, background-color 0.2s;
            user-select: none;
            font-family: -apple-system, system-ui, sans-serif;
        }
        #feishu-link-opener-btn:hover { background-color: #285acc; transform: scale(1.05); }
        #feishu-link-opener-btn:active { transform: scale(0.95); }
        #feishu-link-opener-btn .btn-text { line-height: 1.2; font-weight: 500; }
        #feishu-link-opener-btn .btn-hint { font-size: 10px; opacity: 0.8; margin-top: 2px; }
        .fs-opener-toast {
            position: fixed; top: 30px; left: 50%; transform: translateX(-50%);
            background: rgba(0,0,0,0.8); color: #fff; padding: 8px 16px;
            border-radius: 6px; z-index: 2147483647; font-size: 14px;
            pointer-events: none; animation: fadeInOut 2.5s forwards;
        }
        @keyframes fadeInOut {
            0% { opacity: 0; transform: translate(-50%, -10px); }
            10% { opacity: 1; transform: translate(-50%, 0); }
            80% { opacity: 1; }
            100% { opacity: 0; }
        }
    `);

    // 核心逻辑
    function openValidLinks() {
        if (isProcessing) {
            showToast('操作过于频繁，请稍候...');
            return;
        }
        isProcessing = true;

        // 利用 CSS 选择器直接获取 (性能最佳)
        const links = document.querySelectorAll(`a[href*="${CONFIG.KEYWORD}"]`);
        const validUrls = new Set();

        for (const link of links) {
            const url = link.href;
            if (!url || !url.startsWith('http')) continue;

            try {
                const pathname = new URL(url).pathname.toLowerCase();
                const isExcluded = CONFIG.EXCLUDE_EXTS.some(ext => pathname.endsWith(ext));
                if (!isExcluded) validUrls.add(url);
            } catch (e) {
                continue;
            }
        }

        if (validUrls.size === 0) {
            showToast(`未发现包含 "${CONFIG.KEYWORD}" 的有效链接`);
            setTimeout(() => { isProcessing = false; }, 500); // 失败情况冷却时间短一点
            return;
        }

        // 交互确认
        if (validUrls.size <= 5 || confirm(`检测到 ${validUrls.size} 个有效链接。\n\n是否立即全部打开？`)) {
            // 直接遍历 Set，不需要额外的 count 变量
            validUrls.forEach(url => {
                GM_openInTab(url, { active: false, insert: true });
            });
            showToast(`已在后台打开 ${validUrls.size} 个链接`);
        } else {
            showToast('操作已取消');
        }

        // 释放锁
        setTimeout(() => { isProcessing = false; }, CONFIG.LOCK_TIME);
    }

    // Toast 提示
    function showToast(msg) {
        const oldToast = document.querySelector('.fs-opener-toast');
        if (oldToast) oldToast.remove();

        const toast = document.createElement('div');
        toast.className = 'fs-opener-toast';
        toast.textContent = msg;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 2600);
    }

    // 创建按钮
    function createFloatingButton() {
        if (document.getElementById('feishu-link-opener-btn')) return;

        const btn = document.createElement('div');
        btn.id = 'feishu-link-opener-btn';
        btn.innerHTML = `<span class="btn-text">打开<br>链接</span><span class="btn-hint">Alt+${CONFIG.SHORTCUT_KEY.toUpperCase()}</span>`;
        btn.title = `点击打开包含 "${CONFIG.KEYWORD}" 的链接`;
        btn.onclick = (e) => {
            e.stopPropagation();
            openValidLinks();
        };
        document.body.appendChild(btn);
    }

    // 键盘监听 (已优化：排除输入框)
    document.addEventListener('keydown', (e) => {
        // 1. 检查按键是否匹配
        if (!e.altKey || e.key.toLowerCase() !== CONFIG.SHORTCUT_KEY) return;

        // 2. 检查焦点是否在输入框内 (避免打字时误触)
        const target = e.target;
        const isInput = target.tagName === 'INPUT' || 
                        target.tagName === 'TEXTAREA' || 
                        target.isContentEditable;
        
        if (isInput) return;

        // 3. 执行逻辑
        e.preventDefault();
        e.stopPropagation();
        openValidLinks();
    });

    // 初始化
    createFloatingButton();

    // 资源优化后的保活机制：
    // 使用 setInterval 替代递归，且间隔设为 3秒。
    // 这在保证按钮由于页面重绘丢失后能重新出现的同时，将 CPU 占用降至忽略不计。
    setInterval(() => {
        if (!document.getElementById('feishu-link-opener-btn')) {
            createFloatingButton();
        }
    }, CONFIG.CHECK_INTERVAL);

})();
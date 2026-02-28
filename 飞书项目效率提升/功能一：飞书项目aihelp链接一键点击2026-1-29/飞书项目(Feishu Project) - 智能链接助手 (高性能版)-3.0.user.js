// ==UserScript==
// @name         飞书项目(Feishu Project) - 智能链接助手 (高性能版)
// @namespace    http://tampermonkey.net/
// @version      3.0
// @description  高性能版：在project.feishu.cn添加悬浮球与快捷键(Alt+Q)。直接过滤 DOM 节点，批量打开包含 'aihelp' 的有效链接。
// @author       You
// @match        *://project.feishu.cn/*
// @grant        GM_openInTab
// @grant        GM_addStyle
// @run-at       document-end
// ==/UserScript==

(function() {
    'use strict';

    // ================= 配置区域 =================
    const REQUIRED_KEYWORD = 'aihelp'; // 必须包含的关键词
    const SHORTCUT_KEY = 'q';          // 快捷键 Alt + Q
    // 需要排除的文件后缀 (不区分大小写)
    const EXCLUDE_EXTENSIONS = ['.bytes', '.jpg', '.png', '.jpeg', '.gif', '.svg', '.webp'];
    // ===========================================

    // 防抖与状态锁
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
            font-family: -apple-system, system-ui, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        }
        #feishu-link-opener-btn:hover { background-color: #285acc; transform: scale(1.05); }
        #feishu-link-opener-btn:active { transform: scale(0.95); }
        #feishu-link-opener-btn .btn-text { line-height: 1.2; font-weight: 500; }
        #feishu-link-opener-btn .btn-hint { font-size: 10px; opacity: 0.8; margin-top: 2px; }
        /* Toast 样式 */
        .fs-opener-toast {
            position: fixed; top: 30px; left: 50%; transform: translateX(-50%);
            background: rgba(0,0,0,0.8); color: #fff; padding: 8px 16px;
            border-radius: 6px; z-index: 2147483647; font-size: 14px;
            pointer-events: none; animation: fadeInOut 2.5s forwards;
            box-shadow: 0 2px 8px rgba(0,0,0,0.2);
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
        // 1. 防抖检查
        if (isProcessing) {
            showToast('操作过于频繁，请稍候...');
            return;
        }
        isProcessing = true;

        // 2. 性能优化：利用 CSS 选择器直接获取包含关键词的链接
        // 这比遍历所有 'a' 标签后再用 JS includes 判断要快得多
        const links = document.querySelectorAll(`a[href*="${REQUIRED_KEYWORD}"]`);
        const validUrls = new Set();

        // 3. 遍历与清洗
        for (const link of links) {
            const url = link.href;

            // 基础协议检查
            if (!url || !url.startsWith('http')) continue;

            // 后缀检查 (优雅的异常处理)
            try {
                // 使用 URL 对象解析，防止参数干扰 (?id=123.jpg)
                const pathname = new URL(url).pathname.toLowerCase();
                const isExcluded = EXCLUDE_EXTENSIONS.some(ext => pathname.endsWith(ext));

                if (!isExcluded) {
                    validUrls.add(url);
                }
            } catch (e) {
                // 如果 URL 解析失败，直接跳过该链接，保证脚本稳定性
                continue;
            }
        }

        // 4. 结果处理
        if (validUrls.size === 0) {
            showToast(`未发现包含 "${REQUIRED_KEYWORD}" 的有效链接`);
            resetLock();
            return;
        }

        // 5. 交互与执行
        // 阈值设为 5，少于等于 5 直接打开，无需打扰用户
        if (validUrls.size <= 5 || confirm(`检测到 ${validUrls.size} 个有效链接。\n\n是否立即全部打开？`)) {
            let count = 0;
            validUrls.forEach(url => {
                count++;
                // 直接调用，移除人为延迟，让浏览器自己调度
                GM_openInTab(url, { active: false, insert: true });
            });
            // 提示放在操作之后
            showToast(`已在后台打开 ${count} 个链接`);
        } else {
            // 用户取消操作
            showToast('操作已取消');
        }

        // 6. 释放锁 (设置短暂冷却时间，避免误触)
        setTimeout(resetLock, 1000);
    }

    function resetLock() {
        isProcessing = false;
    }

    // 辅助功能：Toast 提示
    function showToast(msg) {
        // 移除旧的 toast 防止堆叠
        const oldToast = document.querySelector('.fs-opener-toast');
        if (oldToast) oldToast.remove();

        const toast = document.createElement('div');
        toast.className = 'fs-opener-toast';
        toast.textContent = msg;
        document.body.appendChild(toast);

        // 动画结束后自动移除
        setTimeout(() => toast.remove(), 2600);
    }

    // 创建 UI
    function createFloatingButton() {
        // 简单检查 id 是否存在
        if (document.getElementById('feishu-link-opener-btn')) return;

        const btn = document.createElement('div');
        btn.id = 'feishu-link-opener-btn';
        btn.innerHTML = `<span class="btn-text">打开<br>链接</span><span class="btn-hint">Alt+${SHORTCUT_KEY.toUpperCase()}</span>`;
        btn.title = `点击打开当前视图中包含 "${REQUIRED_KEYWORD}" 的链接`;

        btn.onclick = (e) => {
            e.stopPropagation();
            openValidLinks();
        };

        document.body.appendChild(btn);
    }

    // 键盘监听 (快捷键)
    document.addEventListener('keydown', (e) => {
        // 只有当按键匹配且没有被锁定时才触发
        if (e.altKey && e.key.toLowerCase() === SHORTCUT_KEY) {
            e.preventDefault();
            e.stopPropagation();
            openValidLinks();
        }
    });

    // 初始化
    createFloatingButton();

    // 资源占用优化：
    // 使用 setInterval 替代 MutationObserver 监听整个 body
    // 2秒检查一次 UI 是否存在，开销几乎为 0
    setInterval(() => {
        if (!document.getElementById('feishu-link-opener-btn')) {
            createFloatingButton();
        }
    }, 2000);

})();
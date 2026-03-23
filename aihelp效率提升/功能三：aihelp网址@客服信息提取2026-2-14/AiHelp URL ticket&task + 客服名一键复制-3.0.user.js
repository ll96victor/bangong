// ==UserScript==
// @name         AiHelp URL + 客服名一键复制
// @namespace    http://tampermonkey.net/
// @version      3.0
// @description  点击右上角按钮一键复制：URL@客服名 (高度封装，易于合并)
// @author       Front-end Expert
// @match        https://ml-panel.aihelp.net/dashboard/*
// @match        https://ml.aihelp.net/dashboard/*
// @match        https://aihelp.net.cn/dashboard/*
// @match        https://aihelp.net/dashboard/*
// @grant        GM_setClipboard
// @grant        GM_addStyle
// ==/UserScript==

(function() {
    'use strict';

    // ==================== 核心业务逻辑封装 ====================
    /**
     * 【可复用函数】提取 AiHelp 页面中的客服名
     * 使用场景：可直接复制此函数到其他脚本中使用
     *
     * @param {Object} options - 配置选项
     * @param {number} options.topLimit - 页面顶部范围限制（默认 150px）
     * @param {Array<string>} options.prefixWhitelist - 前缀白名单（默认 ['IDP', 'XD', 'ID']）
     * @param {boolean} options.debug - 是否输出调试信息（默认 false）
     * @returns {string} 客服名（如 "Taufik"），失败返回空字符串
     *
     * @example
     * const name = extractAiHelpAgentName({ debug: true });
     * console.log(name); // "Taufik"
     */
    function extractAiHelpAgentName(options = {}) {
        const config = {
            topLimit: options.topLimit || 150,
            prefixWhitelist: options.prefixWhitelist || ['IDP', 'XD', 'ID'],
            debug: options.debug || false
        };

        try {
            if (config.debug) console.log('[AiHelp] 开始提取客服名...');

            const allButtons = document.querySelectorAll('button');
            const candidates = [];

            for (let btn of allButtons) {
                const rect = btn.getBoundingClientRect();
                const text = btn.innerText.trim();

                // 筛选：页面顶部 + 符合格式（如 IDP-Taufik）
                if (rect.top > 0 && rect.top < config.topLimit && text.includes('-')) {
                    const match = text.match(/([A-Z]{2,})-([A-Z][a-z]+)/);
                    if (match) {
                        candidates.push({
                            text: text,
                            prefix: match[1],
                            name: match[2],
                            top: rect.top
                        });
                    }
                }
            }

            if (config.debug) console.log('[AiHelp] 候选客服名:', candidates);

            // 优先返回白名单前缀
            for (let candidate of candidates) {
                if (config.prefixWhitelist.includes(candidate.prefix)) {
                    if (config.debug) console.log('[AiHelp] ✅ 提取成功:', candidate.name);
                    return candidate.name;
                }
            }

            // 兜底：返回第一个候选
            if (candidates.length > 0) {
                if (config.debug) console.log('[AiHelp] ✅ 兜底提取:', candidates[0].name);
                return candidates[0].name;
            }

            if (config.debug) console.warn('[AiHelp] ⚠️ 未找到客服名');
        } catch (error) {
            console.error('[AiHelp] 提取客服名失败:', error);
        }
        return '';
    }

    /**
     * 【可复用函数】生成复制文本（URL + @客服名）
     *
     * @param {string} url - 当前页面 URL
     * @param {string} agentName - 客服名
     * @returns {string} 格式化后的文本（如 "https://... @Taufik"）
     *
     * @example
     * const text = generateCopyText(window.location.href, 'Taufik');
     * // "https://ml.aihelp.net/dashboard/... @Taufik"
     */
    function generateCopyText(url, agentName) {
        return `${url} @${agentName || '未知客服'}`;
    }

    // ==================== UI 相关（如需合并可选择性保留）====================
    /**
     * 【UI 函数】初始化悬浮复制按钮
     * 位置：右上角九宫格左下角交线（top: 33.33%, right: 33.33%）
     */
    function initCopyButton() {
        // 样式注入
        GM_addStyle(`
            #aihelp-quick-copy {
                position: fixed;
                top: calc(33.33% - 20px);  /* 九宫格第一行下边界 */
                right: calc(33.33% - 20px); /* 九宫格第三列左边界 */
                z-index: 99999;
                padding: 10px 14px;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: #fff;
                font-size: 12px;
                font-weight: 600;
                cursor: pointer;
                border-radius: 6px;
                box-shadow: 0 2px 12px rgba(102, 126, 234, 0.4);
                user-select: none;
                transition: all 0.25s ease;
                opacity: 0.88;
            }
            #aihelp-quick-copy:hover {
                opacity: 1;
                transform: scale(1.05);
                box-shadow: 0 4px 16px rgba(102, 126, 234, 0.6);
            }
            #aihelp-quick-copy:active {
                transform: scale(0.95);
            }
            #aihelp-quick-copy.success {
                background: linear-gradient(135deg, #11998e 0%, #38ef7d 100%) !important;
            }
        `);

        // 创建按钮
        const copyButton = document.createElement('div');
        copyButton.id = 'aihelp-quick-copy';
        copyButton.innerText = '复制 URL@客服';
        copyButton.title = '点击复制：URL@客服名';

        // 点击事件
        copyButton.addEventListener('click', () => {
            const agentName = extractAiHelpAgentName({ debug: true });
            const copyText = generateCopyText(window.location.href, agentName);

            GM_setClipboard(copyText);
            console.log('[AiHelp] 已复制:', copyText);

            // 视觉反馈
            const originalText = copyButton.innerText;
            copyButton.innerText = '✓ 已复制';
            copyButton.classList.add('success');

            setTimeout(() => {
                copyButton.innerText = originalText;
                copyButton.classList.remove('success');
            }, 1200);
        });

        document.body.appendChild(copyButton);
    }

    // ==================== 启动入口 ====================
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initCopyButton);
    } else {
        initCopyButton();
    }

})();

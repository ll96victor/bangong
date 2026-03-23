// ==UserScript==
// @name         AiHelp Ticket 客服信息提取一键复制
// @namespace    http://tampermonkey.net/
// @version      3.0.5
// @description  专门针对 AiHelp Ticket (客诉) 页面。点击图标复制URL@客服，悬浮3秒显示提示。新增分组和打标签功能。
// @author       Front-end Expert
// @match        https://ml-panel.aihelp.net/*
// @match        https://ml-panel.aihelp.net.cn/*
// @match        https://ml-panel.aihelp.net/dashboard/#/manual/tickets/?queryType=3
// @match        https://ml.aihelp.net/*
// @match        https://aihelp.net.cn/*
// @match        https://aihelp.net/*
// @grant        GM_setClipboard
// @grant        GM_addStyle
// ==/UserScript==

/**
 * 更新日志：
 * v3.0.5 (2026-03-20)
 * - 优化：增加等待时间以应对网络波动（弹窗800ms、下拉框600ms、输入200ms）
 * - 新增：配置参数增加最大重试次数设置
 *
 * v3.0.4 (2026-03-20)
 * - 优化：三个按钮合并到一个容器，可一起拖动
 * - 新增：拖拽位置自动保存到 localStorage，刷新页面后恢复
 * - 优化：按钮点击与拖拽逻辑分离，操作更流畅
 *
 * v3.0.3 (2026-03-20)
 * - 优化：分组功能大幅减少等待时间，提升响应速度
 * - 优化：添加完整中文注释，符合规范要求
 * - 修复：分组选项使用 selected hover 类快速定位
 *
 * v3.0.2 (2026-03-20)
 * - 优化：分组功能减少等待时间，提升响应速度
 * - 优化：标签功能添加正确选择器 (.elp-cascader__suggestion-item)
 * - 新增：分组功能检测当前分组，如已是目标分组则跳过
 *
 * v3.0.1 (2026-03-20)
 * - 修复：油猴脚本沙箱环境中 MouseEvent 的 view 属性问题
 *
 * v3.0 (2026-03-20)
 * - 新增：更改分组功能（点击分组按钮→选择"CN 二线-BUG"→确认）
 * - 新增：打标签功能（自动检测并添加"BUG二綫 BUG Agents"标签）
 * - 优化：UI 改为双按钮布局，支持多功能入口
 *
 * v2.1 (2026-02-14)
 * - 原始功能：复制 URL@客服信息
 */

(function() {
    'use strict';

    /**
     * 判断当前页面是否为 Ticket 页面
     * @returns {boolean}
     */
    function isTicketPage() {
        return window.location.href.includes('ticket');
    }

    // 如果不是 Ticket 页面，直接退出脚本
    if (!isTicketPage()) return;

    // 调试模式开关
    const DEBUG = true;

    /**
     * 调试日志输出函数
     * @param {...any} args - 日志参数
     */
    function log(...args) {
        if (DEBUG) console.log('[AiHelp Ticket Debug]', ...args);
    }

    // 配置参数集中管理（针对网络波动优化）
    const CONFIG = {
        targetGroup: 'CN 二线-BUG',      // 目标分组名称
        targetTag: 'BUG二綫 BUG Agents',  // 目标标签名称
        dialogWaitTime: 800,              // 弹窗等待时间（毫秒）- 增加以应对网络波动
        dropdownWaitTime: 600,            // 下拉框等待时间（毫秒）
        inputWaitTime: 200,               // 输入等待时间（毫秒）
        maxRetries: 3                     // 最大重试次数
    };

    /**
     * 异步等待函数
     * @param {number} ms - 等待毫秒数
     * @returns {Promise<void>}
     */
    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * 检查元素是否可用（可见且未禁用）
     * @param {HTMLElement} el - 要检查的元素
     * @returns {boolean}
     */
    function isElementAvailable(el) {
        if (!el) return false;
        try {
            const style = window.getComputedStyle(el);
            return style.display !== 'none' &&
                   style.visibility !== 'hidden' &&
                   style.opacity !== '0' &&
                   el.offsetParent !== null &&
                   !el.disabled;
        } catch (e) {
            return false;
        }
    }

    /**
     * 模拟输入值（解决 Vue/React 双向绑定问题）
     * 必须使用原生 setter 才能触发框架的响应式更新
     * @param {HTMLInputElement} element - 输入框元素
     * @param {string} value - 要输入的值
     * @returns {boolean} - 是否成功
     */
    function simulateInputValue(element, value) {
        if (!element) return false;
        try {
            element.focus();
            // 核心：使用原生属性 setter 突破框架绑定
            const nativeSetter = Object.getOwnPropertyDescriptor(
                window.HTMLInputElement.prototype, 'value'
            ).set;
            nativeSetter.call(element, value);
            // 触发完整的事件链
            const events = ['input', 'change', 'keydown', 'keyup'];
            events.forEach(eventType => {
                element.dispatchEvent(new Event(eventType, { bubbles: true }));
            });
            // 触发中文输入相关事件
            element.dispatchEvent(new Event('compositionstart', { bubbles: true }));
            element.dispatchEvent(new Event('compositionend', { bubbles: true }));
            return true;
        } catch (e) {
            console.error('[模拟输入失败]', e);
            return false;
        }
    }

    /**
     * 触发完整的点击事件序列
     * ElementUI 需要完整的事件序列才能正确响应
     * @param {HTMLElement} element - 要点击的元素
     * @returns {boolean} - 是否成功
     */
    function triggerClick(element) {
        if (!element) return false;
        element.focus();
        const rect = element.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        // 按顺序触发 mousedown → mouseup → click
        ['mousedown', 'mouseup', 'click'].forEach(type => {
            element.dispatchEvent(new MouseEvent(type, {
                bubbles: true,
                cancelable: true,
                clientX: cx,
                clientY: cy,
                button: 0
            }));
        });
        return true;
    }

    /**
     * 等待元素出现（带超时机制）
     * @param {string} selector - CSS 选择器
     * @param {number} timeout - 超时时间（毫秒）
     * @param {boolean} checkAvailable - 是否检查元素可用性
     * @returns {Promise<HTMLElement|null>}
     */
    function waitForElement(selector, timeout = 10000, checkAvailable = true) {
        return new Promise((resolve, reject) => {
            // 先检查是否已存在
            const existing = document.querySelector(selector);
            if (existing && (!checkAvailable || isElementAvailable(existing))) {
                return resolve(existing);
            }

            // 使用 MutationObserver 监听 DOM 变化
            const observer = new MutationObserver(() => {
                const el = document.querySelector(selector);
                if (el && (!checkAvailable || isElementAvailable(el))) {
                    observer.disconnect();
                    resolve(el);
                }
            });

            observer.observe(document.body, {
                childList: true,
                subtree: true,
                attributes: true,
                attributeFilter: ['style', 'class', 'disabled']
            });

            // 超时处理
            setTimeout(() => {
                observer.disconnect();
                reject(new Error('等待超时: ' + selector));
            }, timeout);
        });
    }

    /**
     * 提取 Ticket 页面的客服信息
     * @returns {Object|null} - 包含 prefix 和 name 的对象
     */
    function extractTicketAgentInfo() {
        try {
            const allButtons = document.querySelectorAll('button');
            const candidates = [];
            for (let btn of allButtons) {
                const rect = btn.getBoundingClientRect();
                const text = btn.innerText.trim();
                // 查找页面顶部的客服名称按钮（格式如 "CN-xxx"）
                if (rect.top > 0 && rect.top < 150 && text.includes('-')) {
                    const match = text.match(/([A-Z]+)-([A-Za-z0-9_]+)/);
                    if (match) {
                        candidates.push({ prefix: match[1], name: match[2] });
                    }
                }
            }
            return candidates.length > 0 ? candidates[0] : null;
        } catch (e) {
            console.error('Ticket 提取失败:', e);
        }
        return null;
    }

    /**
     * 提取飞书单信息
     * @returns {string|null} - 飞书单信息文本
     */
    function extractFeishuOrder() {
        try {
            log('开始提取飞书单...');

            let feishuLink = null;
            const allLinks = document.querySelectorAll('a');
            log('页面总链接数量:', allLinks.length);

            // 查找飞书链接
            for (const link of allLinks) {
                const href = link.getAttribute('href') || '';
                if (href.includes('feishu.cn')) {
                    feishuLink = link;
                    log('找到飞书链接:', href);
                    break;
                }
            }

            // 如果没找到链接，尝试从文本中查找
            if (!feishuLink) {
                log('未找到飞书链接，尝试搜索文本...');
                const allDivs = document.querySelectorAll('div');
                for (const div of allDivs) {
                    if (div.innerText && div.innerText.includes('飞书单：')) {
                        log('找到包含飞书单的div:', div.innerText.substring(0, 100));
                        const linkInDiv = div.querySelector('a');
                        if (linkInDiv) {
                            feishuLink = linkInDiv;
                            log('在div中找到链接');
                            break;
                        }
                    }
                }
            }

            if (!feishuLink) {
                log('仍未找到飞书链接');
                return null;
            }

            // 清理链接地址
            let linkHref = feishuLink.getAttribute('href') || '';
            linkHref = linkHref.replace(/[`\s]/g, '').trim();
            log('飞书链接(清理后):', linkHref);

            // 提取时间信息
            let timeText = '';
            let parent = feishuLink.parentElement;
            for (let i = 0; i < 10 && parent; i++) {
                const timeSpan = parent.querySelector('.note-time');
                if (timeSpan) {
                    const fullTimeText = timeSpan.textContent.trim();
                    log('时间文本:', fullTimeText);
                    const pipeIndex = fullTimeText.indexOf('|');
                    timeText = pipeIndex !== -1 ? fullTimeText.substring(0, pipeIndex).trim() : fullTimeText;
                    break;
                }
                parent = parent.parentElement;
            }

            // 如果没找到时间，尝试全局查找
            if (!timeText) {
                const timeSpan = document.querySelector('.note-time');
                if (timeSpan) {
                    const fullTimeText = timeSpan.textContent.trim();
                    log('全局时间文本:', fullTimeText);
                    const pipeIndex = fullTimeText.indexOf('|');
                    timeText = pipeIndex !== -1 ? fullTimeText.substring(0, pipeIndex).trim() : fullTimeText;
                }
            }

            const feishuOrder = `飞书单：${linkHref} 的子单`;
            if (timeText) {
                log('提取成功:', `${feishuOrder}\n${timeText}`);
                return `${feishuOrder}\n${timeText}`;
            }
            log('提取成功(无时间):', feishuOrder);
            return feishuOrder;
        } catch (e) {
            console.error('飞书单提取失败:', e);
        }
        return null;
    }

    /**
     * 处理复制操作
     * @param {HTMLElement} button - 触发按钮
     */
    function handleCopyAction(button) {
        try {
            const agentInfo = extractTicketAgentInfo();
            const finalAgentName = agentInfo ? agentInfo.name : '未知客服';
            const finalPrefix = agentInfo ? agentInfo.prefix : '';

            let copyText;
            if (finalAgentName === '未知客服') {
                const feishuOrder = extractFeishuOrder();
                if (feishuOrder) {
                    copyText = `${window.location.href}\n${feishuOrder}`;
                } else {
                    copyText = `${window.location.href} @${finalAgentName}`;
                }
            } else {
                copyText = `${window.location.href} @${finalAgentName}`;
            }

            GM_setClipboard(copyText);
            showFeedback(button, finalPrefix || '✓', 'success');
        } catch (e) {
            showFeedback(button, '✗', 'error');
        }
    }

    /**
     * 显示操作反馈
     * @param {HTMLElement} btn - 按钮元素
     * @param {string} text - 显示文本
     * @param {string} type - 类型：success/error
     */
    function showFeedback(btn, text, type) {
        const iconSpan = btn.querySelector('.ai-icon-symbol');
        const originalText = iconSpan ? iconSpan.textContent : '📋';

        if (iconSpan) {
            iconSpan.textContent = text;
        }

        if (type === 'success') {
            btn.classList.add('ai-icon-success');
        }
        if (type === 'error') {
            btn.classList.add('ai-icon-error');
        }

        // 1.5秒后恢复原状
        setTimeout(() => {
            if (iconSpan) {
                iconSpan.textContent = originalText;
            }
            btn.classList.remove('ai-icon-success', 'ai-icon-error');
        }, 1500);
    }

    /**
     * 处理更改分组功能
     * 流程：检查当前分组 → 点击分组按钮 → 输入目标分组 → 选择选项 → 确认
     * @param {HTMLElement} button - 触发按钮
     */
    async function handleChangeGroup(button) {
        log('开始执行更改分组功能...');
        try {
            // 步骤1：查找分组按钮
            const groupBtn = findGroupButton();
            if (!groupBtn) {
                log('未找到分组按钮');
                showFeedback(button, '✗', 'error');
                return;
            }

            // 步骤2：检查当前分组是否已是目标分组
            const currentGroupText = groupBtn.textContent.trim();
            if (currentGroupText === CONFIG.targetGroup) {
                log('当前分组已是目标分组:', currentGroupText);
                showFeedback(button, '✓', 'success');
                return;
            }

            // 步骤3：点击分组按钮，打开分配界面
            log('找到分组按钮，点击...');
            triggerClick(groupBtn);
            await sleep(CONFIG.dialogWaitTime);

            // 步骤4：查找客诉队列输入框
            const queueInput = await waitForQueueInput();
            if (!queueInput) {
                log('未找到客诉队列输入框');
                showFeedback(button, '✗', 'error');
                return;
            }

            // 步骤5：点击输入框并输入目标分组
            log('找到客诉队列输入框，点击并输入...');
            triggerClick(queueInput);
            await sleep(CONFIG.inputWaitTime);

            log('直接在输入框输入目标分组:', CONFIG.targetGroup);
            simulateInputValue(queueInput, CONFIG.targetGroup);
            await sleep(CONFIG.dropdownWaitTime);

            // 步骤6：查找并点击目标选项（优先使用 selected hover 类）
            const targetOption = await findDropdownOptionFast(CONFIG.targetGroup);
            if (!targetOption) {
                log('未找到目标分组选项');
                showFeedback(button, '✗', 'error');
                return;
            }

            log('点击目标分组选项');
            triggerClick(targetOption);
            await sleep(CONFIG.inputWaitTime);

            // 步骤7：查找并点击确认按钮
            const confirmBtn = await findConfirmButton();
            if (!confirmBtn) {
                log('未找到确认按钮');
                showFeedback(button, '✗', 'error');
                return;
            }

            log('点击确认按钮');
            triggerClick(confirmBtn);
            await sleep(CONFIG.inputWaitTime);

            log('更改分组成功');
            showFeedback(button, '✓', 'success');
        } catch (e) {
            console.error('[更改分组失败]', e);
            showFeedback(button, '✗', 'error');
        }
    }

    /**
     * 查找分组按钮
     * 通过 icon-ai-group 图标类名定位，不依赖文本内容
     * @returns {HTMLElement|null}
     */
    function findGroupButton() {
        const allButtons = document.querySelectorAll('button');
        for (const btn of allButtons) {
            const svg = btn.querySelector('svg.icon-ai-group');
            if (svg && isElementAvailable(btn)) {
                const rect = btn.getBoundingClientRect();
                // 只查找页面顶部的按钮
                if (rect.top > 0 && rect.top < 200) {
                    log('找到分组按钮，文本:', btn.textContent.trim());
                    return btn;
                }
            }
        }
        return null;
    }

    /**
     * 等待客诉队列输入框出现
     * @param {number} timeout - 超时时间（毫秒）
     * @returns {Promise<HTMLElement|null>}
     */
    async function waitForQueueInput(timeout = 3000) {
        const startTime = Date.now();
        while (Date.now() - startTime < timeout) {
            const dialog = document.querySelector('.ai-distribute-ticket-wrap');
            if (dialog) {
                const inputs = dialog.querySelectorAll('input.el-input__inner');
                for (const input of inputs) {
                    const placeholder = input.getAttribute('placeholder') || '';
                    // 匹配"请选择客诉队列"或包含"客诉队列"的输入框
                    if (placeholder.includes('请选择客诉队列') || placeholder.includes('客诉队列')) {
                        if (isElementAvailable(input)) {
                            log('找到客诉队列输入框，placeholder:', placeholder);
                            return input;
                        }
                    }
                }
            }
            await sleep(100);
        }
        return null;
    }

    /**
     * 快速查找下拉选项（优先使用 selected hover 类）
     * 当输入内容后，匹配的选项会有 selected hover 类
     * @param {string} targetText - 目标文本
     * @returns {Promise<HTMLElement|null>}
     */
    async function findDropdownOptionFast(targetText) {
        const startTime = Date.now();
        while (Date.now() - startTime < 2000) {
            // 优先查找带有 selected hover 类的选项（已匹配的选项）
            const selectedOption = document.querySelector('.el-select-dropdown__item.selected.hover');
            if (selectedOption && isElementAvailable(selectedOption)) {
                log('找到已选中的选项:', selectedOption.textContent.trim());
                return selectedOption;
            }

            // 备用：遍历所有选项查找
            const options = document.querySelectorAll('.el-select-dropdown__item');
            for (const option of options) {
                const text = option.textContent.trim();
                if (text.includes(targetText) || text === targetText) {
                    if (isElementAvailable(option)) {
                        log('找到目标选项:', text);
                        return option;
                    }
                }
            }
            await sleep(50);
        }
        return null;
    }

    /**
     * 查找确认按钮
     * @param {number} timeout - 超时时间（毫秒）
     * @returns {Promise<HTMLElement|null>}
     */
    async function findConfirmButton(timeout = 2000) {
        const startTime = Date.now();
        while (Date.now() - startTime < timeout) {
            const buttons = document.querySelectorAll('button.el-button--primary');
            for (const btn of buttons) {
                const text = btn.textContent.trim();
                if (text === '确认' && isElementAvailable(btn)) {
                    log('找到确认按钮');
                    return btn;
                }
            }
            await sleep(50);
        }
        return null;
    }

    /**
     * 处理打标签功能
     * 流程：检查标签是否存在 → 点击输入框 → 输入标签 → 选择选项
     * @param {HTMLElement} button - 触发按钮
     */
    async function handleAddTag(button) {
        log('开始执行打标签功能...');
        try {
            // 步骤1：查找标签容器
            const tagContainer = findTagContainer();
            if (!tagContainer) {
                log('未找到标签容器');
                showFeedback(button, '✗', 'error');
                return;
            }

            // 步骤2：检查标签是否已存在
            const showtags = tagContainer.getAttribute('showtags') || '';
            if (showtags.includes(CONFIG.targetTag)) {
                log('标签已存在，无需添加');
                showFeedback(button, '✓', 'success');
                return;
            }

            // 步骤3：查找标签输入框
            log('标签不存在，开始添加...');
            const searchInput = tagContainer.querySelector('.elp-cascader__search-input');
            if (!searchInput) {
                log('未找到标签搜索输入框');
                showFeedback(button, '✗', 'error');
                return;
            }

            // 步骤4：点击输入框
            log('点击标签输入框...');
            triggerClick(searchInput);
            await sleep(CONFIG.dropdownWaitTime);

            // 步骤5：输入目标标签
            log('输入目标标签:', CONFIG.targetTag);
            simulateInputValue(searchInput, CONFIG.targetTag);
            await sleep(CONFIG.dropdownWaitTime);

            // 步骤6：查找并点击标签选项
            const tagOption = await findTagOption(CONFIG.targetTag);
            if (!tagOption) {
                log('未找到目标标签选项');
                showFeedback(button, '✗', 'error');
                return;
            }

            log('点击目标标签选项');
            triggerClick(tagOption);
            await sleep(CONFIG.inputWaitTime);

            log('打标签成功');
            showFeedback(button, '✓', 'success');
        } catch (e) {
            console.error('[打标签失败]', e);
            showFeedback(button, '✗', 'error');
        }
    }

    /**
     * 查找标签容器
     * @returns {HTMLElement|null}
     */
    function findTagContainer() {
        const containers = document.querySelectorAll('.ai-select-tag.elp-cascader');
        for (const container of containers) {
            if (isElementAvailable(container)) {
                log('找到标签容器');
                return container;
            }
        }
        return null;
    }

    /**
     * 查找标签选项
     * @param {string} targetText - 目标文本
     * @returns {Promise<HTMLElement|null>}
     */
    async function findTagOption(targetText) {
        const startTime = Date.now();
        while (Date.now() - startTime < 2000) {
            // 标签选项使用 elp-cascader__suggestion-item 类
            const options = document.querySelectorAll('.elp-cascader__suggestion-item, .el-cascader-node__label, .el-select-dropdown__item');
            for (const option of options) {
                const text = option.textContent.trim();
                if (text.includes(targetText) || text === targetText) {
                    if (isElementAvailable(option)) {
                        log('找到目标标签选项:', text);
                        return option;
                    }
                }
            }
            await sleep(50);
        }
        return null;
    }

    // 注入 CSS 样式
    GM_addStyle(`
        /* 主容器样式 - 包含所有按钮，可一起拖动 */
        .ai-btn-main-container {
            position: fixed;
            top: 0px;
            right: 400px;
            z-index: 99999;
            display: flex;
            gap: 8px;
            padding: 4px;
            user-select: none;
        }

        /* 主复制按钮样式 */
        .ai-copy-icon-btn {
            width: 36px;
            height: 36px;
            border-radius: 50%;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: #fff;
            font-size: 16px;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            box-shadow: 0 2px 8px rgba(102, 126, 234, 0.35);
            transition: transform 0.2s ease, box-shadow 0.2s ease, opacity 0.2s ease;
            opacity: 0.85;
            user-select: none;
            overflow: visible;
        }

        .ai-copy-icon-btn:hover {
            opacity: 1;
            transform: scale(1.08);
            box-shadow: 0 4px 16px rgba(102, 126, 234, 0.5);
        }

        .ai-copy-icon-btn:active {
            transform: scale(0.95);
        }

        /* 成功状态 - 绿色渐变 */
        .ai-copy-icon-btn.ai-icon-success {
            background: linear-gradient(135deg, #11998e 0%, #38ef7d 100%) !important;
        }

        /* 错误状态 - 红色渐变 */
        .ai-copy-icon-btn.ai-icon-error {
            background: linear-gradient(135deg, #e53e3e 0%, #fc8181 100%) !important;
        }

        /* 功能按钮基础样式 */
        .ai-action-btn {
            width: 36px;
            height: 36px;
            border-radius: 50%;
            color: #fff;
            font-size: 14px;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
            transition: transform 0.2s ease, box-shadow 0.2s ease, opacity 0.2s ease;
            opacity: 0.85;
            user-select: none;
            overflow: visible;
        }

        .ai-action-btn:hover {
            opacity: 1;
            transform: scale(1.08);
            box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
        }

        .ai-action-btn:active {
            transform: scale(0.95);
        }

        /* 分组按钮 - 粉红色渐变 */
        .ai-action-btn.ai-btn-group {
            background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
        }

        /* 标签按钮 - 蓝色渐变 */
        .ai-action-btn.ai-btn-tag {
            background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%);
        }

        .ai-action-btn.ai-icon-success {
            background: linear-gradient(135deg, #11998e 0%, #38ef7d 100%) !important;
        }

        .ai-action-btn.ai-icon-error {
            background: linear-gradient(135deg, #e53e3e 0%, #fc8181 100%) !important;
        }

        /* 延迟提示框样式 */
        .ai-delayed-tooltip {
            position: absolute;
            left: 50%;
            bottom: calc(100% + 10px);
            transform: translateX(-50%) translateY(5px);
            background: rgba(30, 30, 30, 0.95);
            color: #fff;
            padding: 8px 14px;
            border-radius: 6px;
            font-size: 13px;
            white-space: nowrap;
            opacity: 0;
            pointer-events: none;
            transition: opacity 0.25s ease, transform 0.25s ease;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
            z-index: 100001;
        }

        .ai-delayed-tooltip::after {
            content: '';
            position: absolute;
            top: 100%;
            left: 50%;
            transform: translateX(-50%);
            border: 6px solid transparent;
            border-top-color: rgba(30, 30, 30, 0.95);
        }

        .ai-delayed-tooltip.visible {
            opacity: 1;
            transform: translateX(-50%) translateY(0);
        }

        .ai-tooltip-title {
            font-weight: 600;
            margin-bottom: 2px;
        }

        .ai-tooltip-desc {
            font-size: 11px;
            opacity: 0.8;
        }
    `);

    /**
     * 创建带延迟提示的按钮
     * @param {string} id - 按钮 ID
     * @param {string} className - CSS 类名
     * @param {string} symbol - 显示符号
     * @param {string} tooltipTitle - 提示标题
     * @param {string} tooltipDesc - 提示描述
     * @param {Function} clickHandler - 点击回调函数
     * @returns {HTMLElement}
     */
    function createButtonWithTooltip(id, className, symbol, tooltipTitle, tooltipDesc, clickHandler) {
        const btn = document.createElement('div');
        btn.id = id;
        btn.className = className;
        btn.innerHTML = `<span class="ai-icon-symbol">${symbol}</span>`;

        // 创建延迟提示框
        const tooltip = document.createElement('div');
        tooltip.className = 'ai-delayed-tooltip';
        tooltip.innerHTML = `
            <div class="ai-tooltip-title">${tooltipTitle}</div>
            <div class="ai-tooltip-desc">${tooltipDesc}</div>
        `;
        btn.appendChild(tooltip);

        let hoverTimer = null;
        const TIP_DELAY = 3000; // 3秒延迟显示提示

        // 拖拽相关变量
        let isDragging = false;
        let mouseDownPos = { x: 0, y: 0 };
        let btnStartPos = { x: 0, y: 0 };

        // 鼠标进入：启动延迟提示计时器
        btn.addEventListener('mouseenter', () => {
            if (hoverTimer) {
                clearTimeout(hoverTimer);
            }
            hoverTimer = setTimeout(() => {
                tooltip.classList.add('visible');
            }, TIP_DELAY);
        });

        // 鼠标离开：取消计时器并隐藏提示
        btn.addEventListener('mouseleave', () => {
            if (hoverTimer) {
                clearTimeout(hoverTimer);
                hoverTimer = null;
            }
            tooltip.classList.remove('visible');
        });

        // 鼠标按下：开始拖拽或点击检测
        btn.addEventListener('mousedown', (e) => {
            if (e.button !== 0) return; // 只处理左键

            isDragging = false;
            mouseDownPos = { x: e.clientX, y: e.clientY };

            const rect = btn.getBoundingClientRect();
            btnStartPos = {
                x: e.clientX - rect.left,
                y: e.clientY - rect.top
            };

            // 隐藏提示
            if (hoverTimer) {
                clearTimeout(hoverTimer);
                hoverTimer = null;
            }
            tooltip.classList.remove('visible');

            // 鼠标移动处理
            const handleMouseMove = (moveEvent) => {
                const dx = moveEvent.clientX - mouseDownPos.x;
                const dy = moveEvent.clientY - mouseDownPos.y;

                // 超过5px才视为拖拽
                if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
                    isDragging = true;

                    let newX = moveEvent.clientX - btnStartPos.x;
                    let newY = moveEvent.clientY - btnStartPos.y;

                    // 限制在可视区域内
                    newX = Math.max(0, Math.min(newX, window.innerWidth - 36));
                    newY = Math.max(0, Math.min(newY, window.innerHeight - 36));

                    btn.style.left = newX + 'px';
                    btn.style.top = newY + 'px';
                    btn.style.right = 'auto';
                }
            };

            // 鼠标释放处理
            const handleMouseUp = (upEvent) => {
                document.removeEventListener('mousemove', handleMouseMove);
                document.removeEventListener('mouseup', handleMouseUp);

                // 如果不是拖拽，则触发点击
                if (!isDragging) {
                    clickHandler(btn);
                }
            };

            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
        });

        return btn;
    }

    /**
     * 初始化所有按钮
     */
    function initButtons() {
        // 创建主容器（包含所有按钮，可一起拖动）
        const mainContainer = document.createElement('div');
        mainContainer.id = 'ai-btn-main-container';
        mainContainer.className = 'ai-btn-main-container';

        // 创建复制按钮
        const copyButton = document.createElement('div');
        copyButton.id = 'ai-copy-btn';
        copyButton.className = 'ai-copy-icon-btn';
        copyButton.innerHTML = '<span class="ai-icon-symbol">📋</span>';
        copyButton.addEventListener('click', () => handleCopyAction(copyButton));

        // 创建分组按钮
        const groupButton = document.createElement('div');
        groupButton.id = 'ai-group-btn';
        groupButton.className = 'ai-action-btn ai-btn-group';
        groupButton.innerHTML = '<span class="ai-icon-symbol">📁</span>';
        groupButton.addEventListener('click', () => handleChangeGroup(groupButton));

        // 创建标签按钮
        const tagButton = document.createElement('div');
        tagButton.id = 'ai-tag-btn';
        tagButton.className = 'ai-action-btn ai-btn-tag';
        tagButton.innerHTML = '<span class="ai-icon-symbol">🏷️</span>';
        tagButton.addEventListener('click', () => handleAddTag(tagButton));

        // 将所有按钮添加到主容器
        mainContainer.appendChild(groupButton);
        mainContainer.appendChild(tagButton);
        mainContainer.appendChild(copyButton);

        // 绑定拖拽逻辑到主容器
        setupDraggable(mainContainer);

        document.body.appendChild(mainContainer);
    }

    /**
     * 设置元素可拖拽
     * @param {HTMLElement} element - 要设置拖拽的元素
     */
    function setupDraggable(element) {
        let isDragging = false;
        let startX, startY;
        let offsetX, offsetY;

        element.addEventListener('mousedown', (e) => {
            // 如果点击的是按钮本身，不触发拖拽
            if (e.target.closest('.ai-copy-icon-btn, .ai-action-btn')) {
                return;
            }

            isDragging = true;
            startX = e.clientX;
            startY = e.clientY;

            const rect = element.getBoundingClientRect();
            offsetX = e.clientX - rect.left;
            offsetY = e.clientY - rect.top;

            element.style.cursor = 'grabbing';

            e.preventDefault();
        });

        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;

            let newX = e.clientX - offsetX;
            let newY = e.clientY - offsetY;

            // 限制在可视区域内
            const containerWidth = element.offsetWidth;
            const containerHeight = element.offsetHeight;
            newX = Math.max(0, Math.min(newX, window.innerWidth - containerWidth));
            newY = Math.max(0, Math.min(newY, window.innerHeight - containerHeight));

            element.style.left = newX + 'px';
            element.style.top = newY + 'px';
            element.style.right = 'auto';
        });

        document.addEventListener('mouseup', () => {
            if (isDragging) {
                isDragging = false;
                element.style.cursor = 'grab';

                // 保存位置到 localStorage
                const rect = element.getBoundingClientRect();
                localStorage.setItem('ai-btn-container-position', JSON.stringify({
                    left: rect.left,
                    top: rect.top
                }));
            }
        });

        // 恢复保存的位置
        const savedPosition = localStorage.getItem('ai-btn-container-position');
        if (savedPosition) {
            try {
                const pos = JSON.parse(savedPosition);
                if (pos.left !== undefined && pos.top !== undefined) {
                    element.style.left = pos.left + 'px';
                    element.style.top = pos.top + 'px';
                    element.style.right = 'auto';
                }
            } catch (e) {
                console.error('[恢复位置失败]', e);
            }
        }

        element.style.cursor = 'grab';
    }

    // 启动脚本
    initButtons();
})();

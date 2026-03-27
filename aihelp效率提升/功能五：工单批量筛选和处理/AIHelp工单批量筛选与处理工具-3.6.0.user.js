// ==UserScript==
// @name         AIHelp工单批量筛选与处理工具
// @namespace    http://tampermonkey.net/
// @version      3.6.0
// @description  AIHelp工单批量筛选与批量处理工具，提供一键快捷操作，新增BUG自动解决功能，全面优化点击速度
// @author       ll96victor
// @match        https://ml-panel.aihelp.net/dashboard/*
// @exclude      *://*/ticket*
// @grant        none
// @run-at       document-end
// ==/UserScript==

(function() {
    'use strict';

    /**
     * 3.6.0 鏇存柊璇存槑锛?
     * 1. 灏嗘偓娴皬鍥炬爣鐐瑰嚮鍚庣殑灞曞紑闈㈡澘鏀逛负鈥滄寜閽尯 + 鏃ュ織鍖衡€濅竴浣撳睍绀猴紝灞曞紑鏃堕殣钘忓皬鍥炬爣
     * 2. 缁熶竴闈㈡澘缁х画鏀寔鎷栧姩鍜岃皟鏁村ぇ灏忥紝鏃ュ織淇℃伅涓嶅啀闇€瑕侀澶栫偣鍑绘墠鑳界湅鍒?
     * 3. 鍒犻櫎鈥滅瓫閫塀UG鈥濆崟鐙叆鍙ｏ紝淇濈暀鈥淏J鈥濊嚜鍔ㄨВ鍐冲叆鍙?
     * 4. 鏂板鈥滄壒閲忚涓哄凡瑙ｅ喅骞跺彂宸茬煡閭欢鈥濓紝閭欢閫夐」鎸?8 Noticed.mail" 鍞竴鍖归厤
     * 5. 鎵归噺鍒嗛厤鍜屾壒閲忚В鍐虫敼涓衡€滅瓑鍏冪礌灏辩华缁€濓紝鍑忓皯鍥哄畾闀跨瓑寰呭甫鏉ョ殑鎱㈤€熸劅
     *
     * 3.5.3 更新说明：
     *
     * 【Bug修复】
     * 1. 修复批量分配功能中点击输入框后下拉框未出现的问题
     *    - 原因：普通 click() 在某些 Vue/ElementUI 组件上无法正确触发下拉框
     *    - 解决：使用完整的事件序列（mousedown → mouseup → click）触发下拉框
     *    - 参考：rules.md 事件模拟规范
     * 2. 移除提交按钮的 fastClick，改用普通 click()
     *
     * 3.5.2 更新说明：
     *
     * 【Bug修复】
     * 1. 修复批量分配功能中快速点击导致下拉框未出现的问题
     *    - 原因：fastClick 快速点击模式在某些情况下无法正确触发下拉框
     *    - 解决：改用普通 click() 方法，增加等待时间确保下拉框渲染
     *    - 影响范围：L/N/W/X 四个分配按钮
     *
     * 3.5.1 更新说明：
     *
     * 【Bug修复】
     * 1. 修复批量分配功能中点击X按钮时选项匹配错误的问题
     *    - 原因：使用 includes 进行模糊匹配可能匹配到错误的选项
     *    - 解决：优先使用精确匹配，找不到时再使用包含匹配
     *    - 影响范围：L/N/W/X 四个分配按钮
     *
     * 3.5.0 更新说明：
     *
     * 【Bug修复】
     * 1. 修复BUG自动解决功能中内部回复输入到错误位置的问题
     *    - 原因：查找 TinyMCE 编辑器时直接查找第一个可见的编辑器
     *    - 解决：通过 el-form-item 的 label 精确定位"内部回复"对应的编辑器
     *    - 采用三级查找策略：label精确定位 -> contentEditable回退 -> 全局TinyMCE回退
     *
     * 3.4.9 更新说明：
     *
     * 【Bug修复】
     * 1. 修复快速点击模式下"批量处理"功能点击工单状态输入框后下拉框未出现的问题
     *    - 原因：快速点击工单状态输入框后，下拉框未完全渲染就开始查找搜索框
     *    - 解决：点击工单状态输入框后，统一等待800ms确保下拉框完全渲染
     * 2. 同步修复"BUG自动解决"功能中相同的问题
     *
     * 3.4.8 更新说明：
     *
     * 【Bug修复】
     * 1. 修复快速点击模式下"批量处理"功能点击发送奖励后邮件选项未找到的问题
     *    - 原因：快速点击发送奖励输入框后，下拉框未完全渲染就开始查找邮件选项
     *    - 解决：点击发送奖励输入框后，统一等待800ms确保下拉框完全渲染
     * 2. 同步修复"BUG自动解决"功能中相同的问题
     *
     * 3.4.7 更新说明：
     *
     * 【Bug修复】
     * 1. 修复快速点击模式下"批量分配受理人"功能下拉框未正确显示的问题
     *    - 原因：快速点击成功后只等待500ms，下拉框未完全渲染
     *    - 解决：统一使用800ms等待时间，确保下拉框完全渲染后再进行后续操作
     * 2. 同步修复"批量解决"功能中相同的问题
     *
     * 3.4.6 更新说明：
     *
     * 【Bug修复】
     * 1. 修复快速点击模式下"AI识别为BUG"逻辑输入到错误位置的问题
     *    - 原因：快速点击时选中了"描述"而非"内部回复"下的编辑器
     *    - 解决：通过 el-form-item 的 label 精确定位"内部回复"输入框
     *
     * 3.4.5 更新说明：
     *
     * 【Bug修复】
     * 1. 修复 fastClick 函数回退逻辑缺失的问题
     *    - 快速点击失败后，现在会等待并再次尝试点击
     *    - 新增 useFallback 参数控制是否使用回退逻辑
     * 2. 修复点击输入框后等待时间不足的问题
     *    - 快速点击成功后，额外等待500ms让下拉框出现
     *
     * 3.4.4 更新说明：
     *
     * 【Bug修复】
     * 1. 修复快速点击函数日志面板同步缺失的问题
     *    - 为 fastClick、fastFindAndClick、fastClickByText 添加 logger 参数支持
     *    - 所有调用处已传入 logger 参数，日志同步到面板
     * 2. 为 ActionA 和 ActionE 添加日志面板支持
     *    - ActionA（筛选BUG标签）现在有日志输出
     *    - ActionE（批量处理）现在有日志输出
     *
     * 3.4.3 更新说明：
     *
     * 【性能优化】
     * 1. 全面优化所有点击操作，添加快速点击机制
     *    - 新增 fastClick() 函数：立即尝试点击，失败后使用原等待逻辑
     *    - 新增 fastFindAndClick() 函数：快速查找并点击
     *    - 新增 fastClickByText() 函数：快速查找文本并点击
     * 2. 优化范围：
     *    - createAssignAction()：批量分配功能
     *    - createResolveAction()：批量解决功能
     *    - createAutoResolveAction()：BUG自动解决功能
     *    - ActionA：筛选BUG标签功能
     *    - ActionE：批量处理功能
     * 3. 等待时间优化：
     *    - 快速模式：100ms
     *    - 回退模式：保持原等待时间（300-800ms）
     *
     * 3.4.2 更新说明：
     *
     * 【性能优化】
     * 1. 新增快速点击机制，提升自动化操作速度
     *    - 立即尝试点击元素，失败后再使用等待逻辑
     *    - 优化等待时间，减少不必要的延迟
     *    - 添加智能等待函数，动态检测元素是否出现
     *
     * 3.4.1 更新说明：
     *
     * 【Bug修复】
     * 1. 修复内部回复输入框查找失败的问题
     *    - 原因：批量编辑弹窗是 el-popover 而非 el-dialog，iframe 不在对话框内
     *    - 解决：直接通过 .tox.tox-tinymce 类名查找 TinyMCE 编辑器容器
     *
     * 3.4.0 更新说明：
     *
     * 【新增功能】
     * 1. 新增BUG自动解决功能（"BJ"按钮）
     *    - 一键完成筛选BUG标签工单并自动解决
     *    - 自动设置状态为"已解决"
     *    - 自动填写内部回复
     *    - 自动发送奖励邮件
     * 2. 新增AI识别为BUG自动解决模块日志标签样式
     *
     * 【UI变更】
     * 1. 面板布局保持3x4网格，新增第12个按钮
     * 2. "BJ"按钮放在第1行第1列，其他按钮位置依次后移
     *
     * 【配置项】
     * 1. 内部回复内容可通过 AUTO_RESOLVE_CONFIG.internalReply 配置
     *
     * 3.3.0 更新说明：
     *
     * 【新增功能】
     * 1. 新增批量工单解决功能（"解"按钮）
     * 2. 新增工单已解决模块日志标签样式
     *
     * 【UI变更】
     * 1. 面板布局保持3x4网格，新增第11个按钮
     *
     * 3.2.0 更新说明：
     *
     * 【新增功能】
     * 1. 新增批量分配受理人功能（L/N/W/X四个按钮）
     * 2. 新增受理人模块日志标签样式
     *
     * 【UI变更】
     * 1. 面板布局从3x2扩展为3x4网格
     * 2. 面板宽度从132px调整为176px
     *
     * 【描述更新】
     * 1. 批量处理功能描述优化
     *
     * 3.1.0 更新说明：
     *
     * 【日志面板优化】
     * 1. 新增延迟提示机制（3秒延迟显示详细提示）
     * 2. 新增日志类型样式（info/success/warn/error）
     * 3. 新增模块标签样式（不同颜色区分）
     * 4. 新增日志自动清理机制
     * 5. 新增调整大小拖拽手柄
     * 6. 新增展开/收起平滑动画
     * 7. 优化日志面板拖拽逻辑
     *
     * 【技术改进】
     * - 参考油猴脚本状态栏规范2026-2-27.md
     * - 参考工单助手与Task客服信息提取合并版 6.4.1 日志面板实现
     */

    // ==================== 最优先：URL检查 - 快速退出机制 ====================
    const currentUrl = window.location.href;
    if (currentUrl.includes('ticket')) {
        console.log('[AIHelp工单工具] URL包含ticket，跳过脚本加载');
        return;
    }

    if (!currentUrl.includes('tasks?searchType')) {
        console.log('[AIHelp工单工具] 非目标页面，跳过脚本加载');
        return;
    }

    console.log('[AIHelp工单工具] 目标页面，开始加载脚本');

    // ==================== 常量定义 ====================
    const STYLE_ID = 'aihelp-task-toolbar-styles';
    const FLOAT_ICON_ID = 'aihelp-float-icon';
    const FLOAT_PANEL_ID = 'aihelp-float-panel';
    const LOG_PANEL_ID = 'aihelp-log-panel';
    const STORAGE_KEYS = {
        FLOAT_ICON_POSITION: 'aihelp_tools_float_icon_position',
        LOG_PANEL_POSITION: 'aihelp_tools_log_panel_position',
        LOG_PANEL_SIZE: 'aihelp_tools_log_panel_size'
    };
    const LOG_CONFIG = {
        maxLogLines: 100,
        logCleanupInterval: 60000,
        tipDelay: 3000,
        defaultLogPanelSize: { width: 360, height: 420 },
        minLogPanelSize: { width: 250, height: 180 }
    };

    // ==================== 受理人配置 ====================
    const ASSIGNEE_CONFIG = {
        L: { id: 'CN-Lianglei', name: 'L', displayName: 'CN-Lianglei' },
        N: { id: 'CN-Niao', name: 'N', displayName: 'CN-Niao' },
        W: { id: 'CN-Wumengru', name: 'W', displayName: 'CN-Wumengru' },
        X: { id: 'CN-Xutingting', name: 'X', displayName: 'CN-Xutingting' }
    };

    // ==================== 状态配置 ====================
    const RESOLVE_CONFIG = {
        status: '已解决',
        name: '解',
        displayName: '已解决'
    };

    // ==================== BUG自动解决配置 ====================
    const AUTO_RESOLVE_CONFIG = {
        filterTag: 'AI识别为BUG bug identified by ai',
        status: '已解决',
        internalReply: '3 | AI识别为BUG bug identified by ai',
        reward: '15 ProjectCreated.mail',
        name: 'BJ',
        logModule: 'AI识别为BUG自动解决'
    };

    // ==================== 全局状态锁 ====================
    const RESOLVE_WITH_KNOWN_MAIL_CONFIG = {
        status: '\u5df2\u89e3\u51b3',
        reward: '8 Noticed.mail',
        name: 'KM',
        displayName: '\u5df2\u89e3\u51b3\u5e76\u53d1\u5df2\u77e5\u90ae\u4ef6',
        logModule: 'resolve-mail'
    };

    class ScriptState {
        constructor() { this.isProcessing = false; }
        reset() { this.isProcessing = false; }
        async withLock(asyncFn) {
            if (this.isProcessing) {
                console.log('[AIHelp工单工具] 操作正在执行中，请稍候');
                return null;
            }
            this.isProcessing = true;
            try {
                return await asyncFn();
            } finally {
                this.isProcessing = false;
            }
        }
    }
    const scriptState = new ScriptState();

    // ==================== 工具函数 ====================
    const ToolUtil = {
        fastFindElement(selector) {
            const el = document.querySelector(selector);
            if (el && this.isElementAvailable(el)) {
                return el;
            }
            return null;
        },

        fastFindAllElements(selector) {
            const els = document.querySelectorAll(selector);
            const result = [];
            for (const el of els) {
                if (this.isElementAvailable(el)) {
                    result.push(el);
                }
            }
            return result;
        },

        async smartWait(condition, options = {}) {
            const { timeout = 5000, interval = 50 } = options;

            if (condition()) {
                return true;
            }

            const startTime = Date.now();
            while (Date.now() - startTime < timeout) {
                await this.sleep(interval);
                if (condition()) {
                    return true;
                }
            }

            return false;
        },

        async fastClick(element, options = {}) {
            const { needScroll = false, fastDelay = 100, fallbackDelay = 300, logger = null, useFallback = true } = options;

            if (element && this.isElementAvailable(element)) {
                console.log('[快速点击] 元素已存在，立即点击');
                if (logger) logger.log('快速点击成功');
                if (needScroll) {
                    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    await this.sleep(100);
                }
                element.click();
                await this.sleep(fastDelay);
                return true;
            }

            // 快速点击失败，执行回退逻辑
            console.log('[快速点击] 元素不可用，等待后重试');
            if (logger) logger.log('快速点击失败，使用回退逻辑');

            if (useFallback) {
                await this.sleep(fallbackDelay);
                // 再次检查元素是否可用
                if (element && this.isElementAvailable(element)) {
                    console.log('[回退点击] 元素已可用，执行点击');
                    if (logger) logger.log('回退点击成功');
                    if (needScroll) {
                        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        await this.sleep(100);
                    }
                    element.click();
                    await this.sleep(fallbackDelay);
                    return true;
                }
            }

            return false;
        },

        async fastFindAndClick(selector, options = {}) {
            const { needScroll = false, timeout = 5000, fastDelay = 100, fallbackDelay = 300, logger = null } = options;

            // 快速尝试
            const el = this.fastFindElement(selector);
            if (el) {
                console.log('[快速点击] 立即找到元素:', selector);
                if (logger) logger.log('快速点击成功');
                if (needScroll) {
                    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    await this.sleep(100);
                }
                el.click();
                await this.sleep(fastDelay);
                return el;
            }

            // 回退逻辑
            console.log('[快速点击] 未立即找到元素，进入等待逻辑:', selector);
            if (logger) logger.log('等待后重试点击');
            const waitEl = await this.waitForElement(selector, timeout);
            if (needScroll) {
                waitEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                await this.sleep(fallbackDelay);
            }
            waitEl.click();
            await this.sleep(fallbackDelay);
            return waitEl;
        },

        async fastClickByText(text, options = {}) {
            const { selectors = ['button', 'span', 'li'], needScroll = false, fastDelay = 100, fallbackDelay = 300, logger = null } = options;

            // 快速尝试
            for (const selector of selectors) {
                const els = this.fastFindAllElements(selector);
                for (const el of els) {
                    if (el.textContent.trim().includes(text)) {
                        console.log('[快速点击] 立即找到文本元素:', text);
                        if (logger) logger.log('快速点击成功');
                        if (needScroll) {
                            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            await this.sleep(100);
                        }
                        el.click();
                        await this.sleep(fastDelay);
                        return el;
                    }
                }
            }

            // 回退逻辑
            console.log('[快速点击] 未立即找到文本元素，进入等待逻辑:', text);
            if (logger) logger.log('等待后重试点击');
            return await this.clickByText(selectors, text, { needScroll, timeout: 5000 });
        },

        waitForElement(selector, timeout = 5000) {
            return new Promise((resolve, reject) => {
                const el = document.querySelector(selector);
                if (el && this.isElementAvailable(el)) return resolve(el);

                const observer = new MutationObserver(() => {
                    const el = document.querySelector(selector);
                    if (el && this.isElementAvailable(el)) {
                        observer.disconnect();
                        resolve(el);
                    }
                });

                observer.observe(document.body, { childList: true, subtree: true });

                setTimeout(() => {
                    observer.disconnect();
                    reject(new Error(`Timeout waiting for element: ${selector}`));
                }, timeout);
            });
        },

        isElementAvailable(el) {
            if (!el) return false;
            const style = window.getComputedStyle(el);
            return style.display !== 'none' &&
                   style.visibility !== 'hidden' &&
                   style.opacity !== '0' &&
                   el.offsetParent !== null &&
                   !el.disabled;
        },

        async clickElement(selector, options = {}) {
            const { timeout = 5000, needScroll = false } = options;

            // 快速尝试
            const fastEl = this.fastFindElement(selector);
            if (fastEl) {
                console.log('[快速点击] 立即找到元素:', selector);
                if (needScroll) {
                    fastEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    await this.sleep(100);
                }
                fastEl.click();
                await this.sleep(100);
                return fastEl;
            }

            // 快速尝试失败，使用原来的等待逻辑（保持原来的等待时间）
            console.log('[快速点击] 未立即找到元素，进入等待逻辑:', selector);
            const el = await this.waitForElement(selector, timeout);
            if (needScroll) {
                el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                await this.sleep(300);
            }
            el.click();
            await this.sleep(300);
            return el;
        },

        async clickByText(selectors, text, options = {}) {
            const { timeout = 5000, needScroll = false } = options;
            const selectorList = Array.isArray(selectors) ? selectors : [selectors];

            console.log(`[AIHelp工单工具] clickByText: 查找文本 "${text}"`);

            // 快速尝试
            for (const selector of selectorList) {
                const els = this.fastFindAllElements(selector);
                for (const el of els) {
                    const elText = el.textContent.trim();
                    if (elText.includes(text)) {
                        console.log(`[快速点击] 立即找到文本元素: "${elText.substring(0, 30)}"`);
                        if (needScroll) {
                            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            await this.sleep(100);
                        }
                        el.click();
                        console.log(`[AIHelp工单工具] 已点击元素`);
                        await this.sleep(100);
                        return el;
                    }
                }
            }

            // 快速尝试失败，使用原来的等待逻辑
            console.log(`[快速点击] 未立即找到文本元素，进入等待逻辑: "${text}"`);

            for (const selector of selectorList) {
                try {
                    const els = await this.waitForAll(selector, timeout);
                    console.log(`[AIHelp工单工具] 找到 ${selector} 元素数量: ${els.length}`);

                    for (const el of els) {
                        const elText = el.textContent.trim();
                        if (elText.includes(text) && this.isElementAvailable(el)) {
                            console.log(`[AIHelp工单工具] 找到匹配元素: "${elText.substring(0, 30)}"`);
                            if (needScroll) {
                                el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                await this.sleep(200);
                            }
                            el.click();
                            console.log(`[AIHelp工单工具] 已点击元素`);
                            await this.sleep(200);
                            return el;
                        }
                    }
                } catch (e) {
                    console.log(`[AIHelp工单工具] 选择器 ${selector} 查找失败: ${e.message}`);
                    continue;
                }
            }
            throw new Error(`Element with text "${text}" not found`);
        },


        setNativeInputValue(input, value) {
            if (!input) return false;

            const prototype = input.tagName === 'TEXTAREA'
                ? window.HTMLTextAreaElement.prototype
                : window.HTMLInputElement.prototype;
            const descriptor = Object.getOwnPropertyDescriptor(prototype, 'value');
            if (!descriptor || typeof descriptor.set !== 'function') {
                return false;
            }

            descriptor.set.call(input, value);
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
            return true;
        },

        findFormInputByLabel(labelText, options = {}) {
            const { fallbackSelector = '' } = options;
            const normalizedLabel = (labelText || '').trim();

            for (const item of document.querySelectorAll('.el-form-item')) {
                const labelEl = item.querySelector('.el-form-item__label');
                if (!labelEl || !(labelEl.textContent || '').includes(normalizedLabel)) {
                    continue;
                }

                const input = item.querySelector('input');
                if (input && this.isElementAvailable(input)) {
                    return input;
                }
            }

            return fallbackSelector ? this.fastFindElement(fallbackSelector) : null;
        },

        async waitForCondition(getter, options = {}) {
            const { timeout = 2000, interval = 50 } = options;
            const startTime = Date.now();

            while (Date.now() - startTime < timeout) {
                const result = getter();
                if (result) {
                    return result;
                }
                await this.sleep(interval);
            }

            return null;
        },

        findNearestVisibleSearchInput(anchorInput) {
            if (!anchorInput) return null;

            const anchorRect = anchorInput.getBoundingClientRect();
            let nearest = null;
            let minDistance = Infinity;

            for (const input of document.querySelectorAll('input[placeholder="\u641c\u7d22"]')) {
                if (!this.isElementAvailable(input)) continue;
                const rect = input.getBoundingClientRect();
                const distance = Math.abs(rect.top - anchorRect.top) + Math.abs(rect.left - anchorRect.left);
                if (distance < minDistance) {
                    minDistance = distance;
                    nearest = input;
                }
            }

            return nearest;
        },

        async waitForNearestVisibleSearchInput(anchorInput, timeout = 2000) {
            return this.waitForCondition(() => this.findNearestVisibleSearchInput(anchorInput), { timeout });
        },

        async openDropdownAndGetSearchInput(anchorInput, logger = null, timeout = 2000) {
            if (!anchorInput) {
                throw new Error('Dropdown input not found');
            }

            anchorInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
            await this.sleep(80);
            anchorInput.focus();

            const rect = anchorInput.getBoundingClientRect();
            const cx = rect.left + rect.width / 2;
            const cy = rect.top + rect.height / 2;
            ['mousedown', 'mouseup', 'click'].forEach(type => {
                anchorInput.dispatchEvent(new MouseEvent(type, {
                    bubbles: true,
                    cancelable: true,
                    view: window,
                    clientX: cx,
                    clientY: cy,
                    button: 0
                }));
            });

            const searchInput = await this.waitForNearestVisibleSearchInput(anchorInput, timeout);
            if (!searchInput) {
                if (logger) logger.error('Search input not found');
                throw new Error('Search input not found');
            }

            return searchInput;
        },

        findNearestVisibleOption(optionText, anchorInput, options = {}) {
            const {
                selectors = ['li', 'span'],
                exactFirst = true
            } = options;
            const normalizedTarget = (optionText || '').trim();
            const anchorRect = anchorInput
                ? anchorInput.getBoundingClientRect()
                : { top: 0, left: 0 };
            const candidates = [];

            selectors.forEach(selector => {
                document.querySelectorAll(selector).forEach(el => {
                    if (!this.isElementAvailable(el)) return;
                    const text = (el.textContent || '').trim();
                    if (!text) return;
                    if (text === normalizedTarget || text.includes(normalizedTarget)) {
                        const rect = el.getBoundingClientRect();
                        const distance = Math.abs(rect.top - anchorRect.top) + Math.abs(rect.left - anchorRect.left);
                        candidates.push({ el, exact: text === normalizedTarget, distance });
                    }
                });
            });

            if (candidates.length === 0) return null;

            candidates.sort((a, b) => {
                if (exactFirst && a.exact !== b.exact) {
                    return a.exact ? -1 : 1;
                }
                return a.distance - b.distance;
            });

            return candidates[0].el;
        },

        async waitForNearestVisibleOption(optionText, anchorInput, options = {}) {
            const { timeout = 2000 } = options;
            return this.waitForCondition(
                () => this.findNearestVisibleOption(optionText, anchorInput, options),
                { timeout }
            );
        },

        async selectDropdownOption(anchorInput, searchText, optionText, logger = null, options = {}) {
            const {
                optionSelectors = ['li'],
                searchTimeout = 2000,
                optionTimeout = 2000
            } = options;

            const searchInput = await this.openDropdownAndGetSearchInput(anchorInput, logger, searchTimeout);
            searchInput.focus();
            await this.sleep(80);

            if (!this.setNativeInputValue(searchInput, searchText)) {
                throw new Error('Search input write failed');
            }

            const option = await this.waitForNearestVisibleOption(optionText || searchText, searchInput, {
                selectors: optionSelectors,
                timeout: optionTimeout,
                exactFirst: true
            });

            if (!option) {
                if (logger) logger.error(`Option not found: ${optionText || searchText}`);
                throw new Error(`Option not found: ${optionText || searchText}`);
            }

            option.scrollIntoView({ behavior: 'smooth', block: 'center' });
            await this.fastClick(option, { fastDelay: 80, fallbackDelay: 200, logger });
            return option;
        },

        findSubmitButton(buttonTexts = ['\u63d0\u4ea4', '\u786e\u8ba4']) {
            const groups = [
                '.el-popover button',
                '.el-message-box button',
                '.el-dialog__wrapper button',
                '.el-dialog button',
                'button'
            ];

            for (const selector of groups) {
                for (const btn of document.querySelectorAll(selector)) {
                    if (!this.isElementAvailable(btn)) continue;
                    const text = (btn.textContent || '').trim();
                    if (buttonTexts.includes(text)) {
                        return btn;
                    }
                }
            }

            return null;
        },

        async clickSubmitButton(logger = null, buttonTexts = ['\u63d0\u4ea4', '\u786e\u8ba4']) {
            const submitBtn = await this.waitForCondition(
                () => this.findSubmitButton(buttonTexts),
                { timeout: 2000 }
            );
            if (!submitBtn) {
                if (logger) logger.error('Submit button not found');
                throw new Error('Submit button not found');
            }

            submitBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
            await this.fastClick(submitBtn, { fastDelay: 80, fallbackDelay: 200, logger });
            return submitBtn;
        },

        waitForAll(selector, timeout = 5000) {

            return new Promise((resolve, reject) => {
                console.log(`[AIHelp工单工具] waitForAll: 查找选择器 "${selector}"`);

                const check = () => document.querySelectorAll(selector);

                const result = check();
                if (result.length > 0) {
                    console.log(`[AIHelp工单工具] 立即找到元素: ${result.length} 个`);
                    return resolve(result);
                }

                const observer = new MutationObserver(() => {
                    const result = check();
                    if (result.length > 0) {
                        observer.disconnect();
                        console.log(`[AIHelp工单工具] 通过观察器找到元素: ${result.length} 个`);
                        resolve(result);
                    }
                });

                observer.observe(document.body, { childList: true, subtree: true });

                setTimeout(() => {
                    observer.disconnect();
                    console.log(`[AIHelp工单工具] 等待超时: ${selector}`);
                    reject(new Error(`Timeout waiting for elements: ${selector}`));
                }, timeout);
            });
        },

        async inputText(selector, text, options = {}) {
            const { timeout = 5000, clearFirst = true } = options;
            const el = await this.waitForElement(selector, timeout);

            const nativeSetter = Object.getOwnPropertyDescriptor(
                window.HTMLInputElement.prototype, 'value'
            ).set;

            if (clearFirst) {
                nativeSetter.call(el, '');
                el.dispatchEvent(new Event('input', { bubbles: true }));
            }

            nativeSetter.call(el, text);
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
            await this.sleep(300);
            return el;
        },

        sleep(ms) {
            return new Promise(resolve => setTimeout(resolve, ms));
        },

        savePosition(key, element) {
            try {
                const rect = element.getBoundingClientRect();
                const position = {
                    left: Math.round(rect.left) + 'px',
                    top: Math.round(rect.top) + 'px'
                };
                localStorage.setItem(key, JSON.stringify(position));
            } catch (e) {
                console.error('[AIHelp工单工具] 保存位置失败:', e.message);
            }
        },

        loadPosition(key, element) {
            try {
                const saved = localStorage.getItem(key);
                if (saved) {
                    const pos = JSON.parse(saved);
                    if (pos.left !== undefined && pos.top !== undefined) {
                        element.style.position = 'fixed';
                        element.style.left = pos.left;
                        element.style.top = pos.top;
                        element.style.right = 'auto';
                        element.style.bottom = 'auto';
                        return true;
                    }
                }
            } catch (e) {
                console.error('[AIHelp工单工具] 读取位置失败:', e.message);
            }
            return false;
        },

        saveSize(key, element) {
            try {
                const rect = element.getBoundingClientRect();
                const size = {
                    width: Math.round(rect.width) + 'px',
                    height: Math.round(rect.height) + 'px'
                };
                localStorage.setItem(key, JSON.stringify(size));
            } catch (e) {
                console.error('[AIHelp工单工具] 保存大小失败:', e.message);
            }
        },

        loadSize(key, element) {
            try {
                const saved = localStorage.getItem(key);
                if (saved) {
                    const size = JSON.parse(saved);
                    if (size.width !== undefined && size.height !== undefined) {
                        element.style.width = size.width;
                        element.style.height = size.height;
                        return true;
                    }
                }
            } catch (e) {
                console.error('[AIHelp工单工具] 读取大小失败:', e.message);
            }
            return false;
        },

        async clickFilterButton() {
            console.log('[AIHelp工单工具] 开始查找筛选按钮...');

            // 快速尝试：直接查找可见的筛选按钮
            const allButtons = document.querySelectorAll('button');
            const visibleFilterBtns = [];

            for (const btn of allButtons) {
                const text = btn.textContent.trim();
                if (text === '筛选') {
                    const rect = btn.getBoundingClientRect();
                    if (rect.width > 0 && rect.height > 0 && rect.top > 0) {
                        visibleFilterBtns.push({ btn, rect });
                    }
                }
            }

            if (visibleFilterBtns.length > 0) {
                visibleFilterBtns.sort((a, b) => b.rect.top - a.rect.top);
                const targetBtn = visibleFilterBtns[0].btn;
                console.log('[快速点击] 立即找到筛选按钮');
                targetBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
                await this.sleep(100);
                targetBtn.click();
                console.log('[AIHelp工单工具] ✅ 已点击筛选按钮(快速模式)');
                await this.sleep(200);
                return targetBtn;
            }

            // 快速尝试失败，使用原来的等待逻辑
            console.log('[快速点击] 未立即找到筛选按钮，进入等待逻辑...');
            await this.sleep(300);

            const dialogs = document.querySelectorAll('.el-dialog__wrapper, .el-drawer__wrapper, .el-dialog, .el-drawer');
            console.log('[AIHelp工单工具] 找到弹窗数量:', dialogs.length);

            for (const dialog of dialogs) {
                const style = window.getComputedStyle(dialog);
                if (style.display === 'none' || style.visibility === 'hidden') {
                    console.log('[AIHelp工单工具] 弹窗不可见，跳过');
                    continue;
                }

                const buttons = dialog.querySelectorAll('button');
                console.log('[AIHelp工单工具] 弹窗内按钮数量:', buttons.length);

                for (const btn of buttons) {
                    const text = btn.textContent.trim();
                    console.log('[AIHelp工单工具] 检查按钮:', text, 'class:', btn.className);
                    if (text === '筛选') {
                        console.log('[AIHelp工单工具] 找到筛选按钮，准备点击');
                        btn.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        await this.sleep(200);
                        btn.click();
                        console.log('[AIHelp工单工具] ✅ 已点击弹窗筛选按钮');
                        await this.sleep(300);
                        return btn;
                    }
                }

                const spans = dialog.querySelectorAll('span');
                for (const span of spans) {
                    if (span.textContent.trim() === '筛选' && span.closest('button')) {
                        const btn = span.closest('button');
                        console.log('[AIHelp工单工具] 通过span找到筛选按钮');
                        btn.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        await this.sleep(200);
                        btn.click();
                        console.log('[AIHelp工单工具] ✅ 已点击筛选按钮(span定位)');
                        await this.sleep(300);
                        return btn;
                    }
                }
            }

            throw new Error('未找到筛选按钮');
        }
    };

    // ==================== 批量分配功能工厂 ====================
    function createAssignAction(assigneeKey) {
        const config = ASSIGNEE_CONFIG[assigneeKey];
        if (!config) {
            throw new Error(`未知的受理人标识: ${assigneeKey}`);
        }

        return {
            name: `分配给${config.name}`,
            icon: config.name,
            shortTip: `分配给 ${config.displayName}`,
            detailTip: `将选中工单批量分配给 ${config.displayName}`,
            assigneeId: config.id,
            async execute() {
                console.log(`=== 开始执行批量分配给 ${config.displayName} ===`);
                const logger = createLogChannel('受理人');
                logger.log(`开始批量分配给 ${config.displayName}`);

                // Step 1: 点击编辑按钮
                console.log('Step 1: 点击编辑按钮');
                logger.log('点击编辑按钮');
                try {
                    await ToolUtil.clickByText(['button', 'span'], '编辑');
                } catch (e) {
                    logger.error('未找到编辑按钮，请先勾选工单');
                    throw new Error('未找到编辑按钮，请先勾选工单');
                }
                await ToolUtil.sleep(1500);

                // Step 2: 查找工单受理人输入框
                console.log('Step 2: 查找工单受理人输入框');
                logger.log('查找工单受理人输入框');

                let assigneeInput = null;
                const allFormItems = document.querySelectorAll('.el-form-item');
                for (const item of allFormItems) {
                    const labelEl = item.querySelector('.el-form-item__label');
                    if (labelEl && labelEl.textContent.includes('工单受理人')) {
                        const input = item.querySelector('input');
                        if (input) {
                            const rect = input.getBoundingClientRect();
                            if (rect.width > 0 && rect.height > 0) {
                                assigneeInput = input;
                                console.log('通过label找到工单受理人输入框，位置:', rect.top, rect.left);
                                break;
                            }
                        }
                    }
                }

                if (!assigneeInput) {
                    logger.error('未找到工单受理人输入框');
                    throw new Error('未找到工单受理人输入框');
                }

                // Step 3: 点击工单受理人输入框
                console.log('Step 3: 点击工单受理人输入框');
                logger.log('点击工单受理人输入框');
                assigneeInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
                await ToolUtil.sleep(300);
                assigneeInput.focus();

                // 使用完整的事件序列触发下拉框
                const rect = assigneeInput.getBoundingClientRect();
                const cx = rect.left + rect.width / 2;
                const cy = rect.top + rect.height / 2;
                ['mousedown', 'mouseup', 'click'].forEach(type => {
                    assigneeInput.dispatchEvent(new MouseEvent(type, {
                        bubbles: true,
                        cancelable: true,
                        view: window,
                        clientX: cx,
                        clientY: cy,
                        button: 0
                    }));
                });
                console.log('已点击工单受理人输入框（完整事件序列）');

                // 点击后等待下拉框出现
                await ToolUtil.sleep(1200);

                // Step 4: 在搜索框输入受理人名称
                console.log(`Step 4: 在搜索框输入 ${config.id}`);
                logger.log(`选择受理人：${config.id}`);

                const allSearchInputs = document.querySelectorAll('input[placeholder="搜索"]');
                console.log('找到搜索框数量:', allSearchInputs.length);

                const inputRect = assigneeInput.getBoundingClientRect();
                let searchInput = null;
                let minDistance = Infinity;

                for (const input of allSearchInputs) {
                    const rect = input.getBoundingClientRect();
                    if (rect.width > 0 && rect.height > 0) {
                        const distance = Math.abs(rect.top - inputRect.top);
                        console.log('搜索框位置:', rect.top, rect.left, '距离:', distance);
                        if (distance < minDistance) {
                            minDistance = distance;
                            searchInput = input;
                        }
                    }
                }

                console.log('选择的搜索框距离:', minDistance);

                if (searchInput) {
                    searchInput.focus();
                    await ToolUtil.sleep(200);

                    const nativeSetter = Object.getOwnPropertyDescriptor(
                        window.HTMLInputElement.prototype, 'value'
                    ).set;
                    nativeSetter.call(searchInput, config.id);
                    searchInput.dispatchEvent(new Event('input', { bubbles: true }));
                    searchInput.dispatchEvent(new Event('change', { bubbles: true }));
                    console.log(`已在搜索框输入 ${config.id}`);
                } else {
                    logger.error('未找到搜索框');
                    throw new Error('未找到搜索框');
                }
                await ToolUtil.sleep(800);

                // Step 5: 点击下拉选项
                console.log(`Step 5: 点击下拉选项 ${config.id}`);
                await ToolUtil.sleep(300);

                const assigneeOptions = document.querySelectorAll('li');
                let foundOption = null;
                let minOptionDistance = Infinity;
                const searchRect = searchInput.getBoundingClientRect();

                for (const li of assigneeOptions) {
                    const text = li.textContent.trim();
                    const rect = li.getBoundingClientRect();
                    if (rect.width > 0 && rect.height > 0 && text.includes(config.id)) {
                        const distance = Math.abs(rect.top - searchRect.top);
                        console.log('找到选项, 文本:', text, '位置:', rect.top, rect.left, '距离:', distance);
                        if (distance < minOptionDistance) {
                            minOptionDistance = distance;
                            foundOption = li;
                        }
                    }
                }

                if (foundOption) {
                    console.log('选择距离最近的选项, 距离:', minOptionDistance);
                    foundOption.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    await ToolUtil.sleep(200);
                    foundOption.click();
                    console.log(`已选择 ${config.id}`);
                } else {
                    logger.error(`未找到受理人选项: ${config.id}`);
                    throw new Error(`未找到受理人选项: ${config.id}`);
                }

                // Step 6: 点击提交按钮
                console.log('Step 6: 点击提交按钮');
                logger.log('点击提交按钮');

                let submitBtn = null;

                // 方法1: 查找el-popover中的提交按钮
                const popovers = document.querySelectorAll('.el-popover, .el-message-box');
                for (const popover of popovers) {
                    const style = window.getComputedStyle(popover);
                    if (style.display === 'none' || style.visibility === 'hidden') continue;

                    const buttons = popover.querySelectorAll('button');
                    for (const btn of buttons) {
                        const text = btn.textContent.trim();
                        if (text === '提交' || text === '确认') {
                            const rect = btn.getBoundingClientRect();
                            if (rect.width > 0 && rect.height > 0) {
                                submitBtn = btn;
                                console.log('在popover找到按钮:', text);
                                break;
                            }
                        }
                    }
                    if (submitBtn) break;
                }

                // 方法2: 查找弹窗内的提交按钮
                if (!submitBtn) {
                    const dialogs = document.querySelectorAll('.el-dialog__wrapper, .el-dialog');
                    for (const dialog of dialogs) {
                        const style = window.getComputedStyle(dialog);
                        if (style.display === 'none' || style.visibility === 'hidden') continue;

                        const buttons = dialog.querySelectorAll('button');
                        for (const btn of buttons) {
                            const text = btn.textContent.trim();
                            if (text === '提交') {
                                const rect = btn.getBoundingClientRect();
                                if (rect.width > 0 && rect.height > 0) {
                                    submitBtn = btn;
                                    console.log('在dialog找到提交按钮');
                                    break;
                                }
                            }
                        }
                        if (submitBtn) break;
                    }
                }

                // 方法3: 全局搜索
                if (!submitBtn) {
                    const allButtons = document.querySelectorAll('button');
                    for (const btn of allButtons) {
                        const text = btn.textContent.trim();
                        if (text === '提交') {
                            const rect = btn.getBoundingClientRect();
                            if (rect.width > 0 && rect.height > 0) {
                                submitBtn = btn;
                                console.log('找到提交按钮(全局搜索)');
                                break;
                            }
                        }
                    }
                }

                if (submitBtn) {
                    submitBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    await ToolUtil.sleep(200);
                    submitBtn.click();
                    console.log('已点击提交按钮');
                } else {
                    logger.error('未找到提交按钮');
                    throw new Error('未找到提交按钮');
                }

                logger.success(`批量分配给 ${config.displayName} 完成`);
                console.log(`=== 批量分配给 ${config.displayName} 完成 ===`);
                return { success: true, message: `批量分配给 ${config.displayName} 完成` };
            }
        };
    }

    // ==================== 批量解决功能工厂 ====================
    function createResolveAction() {
        const config = RESOLVE_CONFIG;

        return {
            name: '批量解决',
            icon: config.name,
            shortTip: '批量设为已解决',
            detailTip: '将选中工单状态批量改为"已解决"',
            async execute() {
                console.log(`=== 开始执行批量解决 ===`);
                const logger = createLogChannel('工单已解决');
                logger.log('开始批量设置工单状态为"已解决"');

                // Step 1: 点击编辑按钮
                console.log('Step 1: 点击编辑按钮');
                logger.log('点击编辑按钮');
                try {
                    await ToolUtil.clickByText(['button', 'span'], '编辑');
                } catch (e) {
                    logger.error('未找到编辑按钮，请先勾选工单');
                    throw new Error('未找到编辑按钮，请先勾选工单');
                }
                await ToolUtil.sleep(1500);

                // Step 2: 查找工单状态输入框
                console.log('Step 2: 查找工单状态输入框');
                logger.log('查找工单状态输入框');

                let statusInput = null;
                const allFormItems = document.querySelectorAll('.el-form-item');
                for (const item of allFormItems) {
                    const labelEl = item.querySelector('.el-form-item__label');
                    if (labelEl && labelEl.textContent.includes('工单状态')) {
                        const input = item.querySelector('input');
                        if (input) {
                            const rect = input.getBoundingClientRect();
                            if (rect.width > 0 && rect.height > 0) {
                                statusInput = input;
                                console.log('通过label找到工单状态输入框，位置:', rect.top, rect.left);
                                break;
                            }
                        }
                    }
                }

                if (!statusInput) {
                    logger.error('未找到工单状态输入框');
                    throw new Error('未找到工单状态输入框');
                }

                // Step 3: 点击工单状态输入框
                console.log('Step 3: 点击工单状态输入框');
                statusInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
                await ToolUtil.sleep(100);
                statusInput.focus();
                await ToolUtil.fastClick(statusInput, { fastDelay: 100, fallbackDelay: 800, logger });
                console.log('已点击工单状态输入框');

                // 点击后等待下拉框出现 - 统一使用较长等待时间确保下拉框完全渲染
                await ToolUtil.sleep(800);

                // Step 4: 在搜索框输入"已解决"
                console.log(`Step 4: 在搜索框输入 ${config.status}`);
                logger.log(`选择状态：${config.status}`);

                const allSearchInputs = document.querySelectorAll('input[placeholder="搜索"]');
                console.log('找到搜索框数量:', allSearchInputs.length);

                const inputRect = statusInput.getBoundingClientRect();
                let searchInput = null;
                let minDistance = Infinity;

                for (const input of allSearchInputs) {
                    const rect = input.getBoundingClientRect();
                    if (rect.width > 0 && rect.height > 0) {
                        const distance = Math.abs(rect.top - inputRect.top);
                        console.log('搜索框位置:', rect.top, rect.left, '距离:', distance);
                        if (distance < minDistance) {
                            minDistance = distance;
                            searchInput = input;
                        }
                    }
                }

                console.log('选择的搜索框距离:', minDistance);

                if (searchInput) {
                    searchInput.focus();
                    await ToolUtil.sleep(200);

                    const nativeSetter = Object.getOwnPropertyDescriptor(
                        window.HTMLInputElement.prototype, 'value'
                    ).set;
                    nativeSetter.call(searchInput, config.status);
                    searchInput.dispatchEvent(new Event('input', { bubbles: true }));
                    searchInput.dispatchEvent(new Event('change', { bubbles: true }));
                    console.log(`已在搜索框输入 ${config.status}`);
                } else {
                    logger.error('未找到搜索框');
                    throw new Error('未找到搜索框');
                }
                await ToolUtil.sleep(800);

                // Step 5: 点击下拉选项
                console.log(`Step 5: 点击下拉选项 ${config.status}`);
                await ToolUtil.sleep(300);

                const statusOptions = document.querySelectorAll('li');
                let foundOption = null;
                let minOptionDistance = Infinity;
                const searchRect = searchInput.getBoundingClientRect();

                for (const li of statusOptions) {
                    const text = li.textContent.trim();
                    const rect = li.getBoundingClientRect();
                    if (rect.width > 0 && rect.height > 0 && text.includes(config.status)) {
                        const distance = Math.abs(rect.top - searchRect.top);
                        console.log('找到选项, 文本:', text, '位置:', rect.top, rect.left, '距离:', distance);
                        if (distance < minOptionDistance) {
                            minOptionDistance = distance;
                            foundOption = li;
                        }
                    }
                }

                if (foundOption) {
                    console.log('选择距离最近的选项, 距离:', minOptionDistance);
                    foundOption.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    await ToolUtil.fastClick(foundOption, { fastDelay: 100, fallbackDelay: 500, logger });
                    console.log(`已选择 ${config.status}`);
                } else {
                    logger.error(`未找到状态选项: ${config.status}`);
                    throw new Error(`未找到状态选项: ${config.status}`);
                }

                // Step 6: 点击提交按钮
                console.log('Step 6: 点击提交按钮');
                logger.log('点击提交按钮');

                let submitBtn = null;

                // 方法1: 查找el-popover中的提交按钮
                const popovers = document.querySelectorAll('.el-popover, .el-message-box');
                for (const popover of popovers) {
                    const style = window.getComputedStyle(popover);
                    if (style.display === 'none' || style.visibility === 'hidden') continue;

                    const buttons = popover.querySelectorAll('button');
                    for (const btn of buttons) {
                        const text = btn.textContent.trim();
                        if (text === '提交' || text === '确认') {
                            const rect = btn.getBoundingClientRect();
                            if (rect.width > 0 && rect.height > 0) {
                                submitBtn = btn;
                                console.log('在popover找到按钮:', text);
                                break;
                            }
                        }
                    }
                    if (submitBtn) break;
                }

                // 方法2: 查找弹窗内的提交按钮
                if (!submitBtn) {
                    const dialogs = document.querySelectorAll('.el-dialog__wrapper, .el-dialog');
                    for (const dialog of dialogs) {
                        const style = window.getComputedStyle(dialog);
                        if (style.display === 'none' || style.visibility === 'hidden') continue;

                        const buttons = dialog.querySelectorAll('button');
                        for (const btn of buttons) {
                            const text = btn.textContent.trim();
                            if (text === '提交') {
                                const rect = btn.getBoundingClientRect();
                                if (rect.width > 0 && rect.height > 0) {
                                    submitBtn = btn;
                                    console.log('在dialog找到提交按钮');
                                    break;
                                }
                            }
                        }
                        if (submitBtn) break;
                    }
                }

                // 方法3: 全局搜索
                if (!submitBtn) {
                    const allButtons = document.querySelectorAll('button');
                    for (const btn of allButtons) {
                        const text = btn.textContent.trim();
                        if (text === '提交') {
                            const rect = btn.getBoundingClientRect();
                            if (rect.width > 0 && rect.height > 0) {
                                submitBtn = btn;
                                console.log('找到提交按钮(全局搜索)');
                                break;
                            }
                        }
                    }
                }

                if (submitBtn) {
                    submitBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    await ToolUtil.fastClick(submitBtn, { fastDelay: 100, fallbackDelay: 500, logger });
                    console.log('已点击提交按钮');
                } else {
                    logger.error('未找到提交按钮');
                    throw new Error('未找到提交按钮');
                }

                logger.success('批量解决完成');
                console.log('=== 批量解决完成 ===');
                return { success: true, message: '批量解决完成' };
            }
        };
    }

    // ==================== BUG自动解决功能工厂 ====================
    function createAutoResolveAction() {
        const config = AUTO_RESOLVE_CONFIG;

        return {
            name: 'BUG自动解决',
            icon: config.name,
            shortTip: 'BUG自动解决',
            detailTip: '筛选AI识别为BUG的工单并自动解决，发送奖励邮件',
            async execute() {
                console.log(`=== 开始执行BUG自动解决 ===`);
                const logger = createLogChannel(config.logModule);
                logger.log('开始执行BUG自动解决流程');

                // ==================== 第一阶段：筛选BUG标签工单 ====================
                logger.log('筛选BUG标签工单');
                console.log('第一阶段：筛选BUG标签工单');

                // Step 1: 点击筛选按钮
                console.log('Step 1: 点击筛选按钮');
                const filterBtns = document.querySelectorAll('button');
                for (const btn of filterBtns) {
                    if (btn.textContent.includes('筛选') && btn.querySelector('i.el-icon-search')) {
                        await ToolUtil.fastClick(btn, { fastDelay: 100, fallbackDelay: 800, logger });
                        break;
                    }
                }

                // Step 2: 点击重置按钮
                console.log('Step 2: 点击重置按钮');
                const resetBtns = document.querySelectorAll('button');
                for (const btn of resetBtns) {
                    if (btn.textContent.trim() === '重置') {
                        await ToolUtil.fastClick(btn, { fastDelay: 100, fallbackDelay: 500, logger });
                        break;
                    }
                }

                // Step 3: 滚动弹窗到底部
                console.log('Step 3: 滚动弹窗到底部');
                const scrollContainers = document.querySelectorAll('.el-dialog__body, .el-drawer__body, .el-scrollbar__wrap');
                for (const container of scrollContainers) {
                    if (container.scrollHeight > container.clientHeight) {
                        container.scrollTop = container.scrollHeight;
                        await ToolUtil.sleep(200);
                        container.scrollTop = container.scrollHeight;
                    }
                }
                await ToolUtil.sleep(500);

                // Step 4: 查找标签输入框
                console.log('Step 4: 查找标签输入框');
                const allInputs = document.querySelectorAll('input[placeholder="请选择标签"]');
                let targetInput = null;

                for (let i = 0; i < allInputs.length; i++) {
                    const input = allInputs[i];
                    let labelText = '';
                    let parent = input.closest('.el-form-item');
                    if (parent) {
                        const labelEl = parent.querySelector('.el-form-item__label');
                        if (labelEl) {
                            labelText = labelEl.textContent.trim();
                        }
                    }
                    if (labelText.includes('包含其中任一标签') && !labelText.includes('不包含')) {
                        targetInput = input;
                        break;
                    }
                }

                if (!targetInput) {
                    logger.error('未找到"包含其中任一标签"输入框');
                    throw new Error('未找到"包含其中任一标签"输入框');
                }

                // Step 5: 点击输入框
                console.log('Step 5: 点击输入框');
                targetInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
                await ToolUtil.sleep(100);
                targetInput.focus();
                await ToolUtil.fastClick(targetInput, { fastDelay: 100, fallbackDelay: 500, logger });

                // Step 6: 输入标签
                console.log('Step 6: 输入标签');
                const nativeSetter = Object.getOwnPropertyDescriptor(
                    window.HTMLInputElement.prototype, 'value'
                ).set;
                nativeSetter.call(targetInput, config.filterTag);
                targetInput.dispatchEvent(new Event('input', { bubbles: true }));
                targetInput.dispatchEvent(new Event('change', { bubbles: true }));
                await ToolUtil.sleep(800);

                // Step 7: 点击下拉选项
                console.log('Step 7: 点击下拉选项');
                const listItems = document.querySelectorAll('li.elp-cascader-node, li');
                let foundOption = null;
                for (const li of listItems) {
                    const text = li.textContent || '';
                    const rect = li.getBoundingClientRect();
                    if (rect.width > 0 && rect.height > 0) {
                        if (text.includes('AI识别为BUG') || text.includes('bug identified by ai')) {
                            foundOption = li;
                        }
                    }
                }
                if (foundOption) {
                    targetInput.focus();
                    await ToolUtil.fastClick(foundOption, { fastDelay: 100, fallbackDelay: 500, logger });
                }

                // Step 8: 点击筛选按钮
                console.log('Step 8: 点击筛选按钮');
                await ToolUtil.clickFilterButton();
                await ToolUtil.sleep(1000);

                // ==================== 第二阶段：自动解决流程 ====================
                logger.log('开始自动解决流程');
                console.log('第二阶段：自动解决流程');

                // Step 9: 全选工单
                console.log('Step 9: 全选工单');
                logger.log('全选工单');
                await ToolUtil.clickElement('span.el-checkbox__inner');
                await ToolUtil.sleep(800);

                // Step 10: 点击编辑按钮
                console.log('Step 10: 点击编辑按钮');
                logger.log('点击编辑按钮');
                try {
                    await ToolUtil.clickByText(['button', 'span'], '编辑');
                } catch (e) {
                    logger.error('未找到编辑按钮，可能没有工单');
                    throw new Error('未找到编辑按钮，可能没有工单');
                }
                await ToolUtil.sleep(1500);

                // Step 11: 查找工单状态输入框
                console.log('Step 11: 查找工单状态输入框');
                logger.log('设置状态：已解决');

                let statusInput = null;
                const allFormItems = document.querySelectorAll('.el-form-item');
                for (const item of allFormItems) {
                    const labelEl = item.querySelector('.el-form-item__label');
                    if (labelEl && labelEl.textContent.includes('工单状态')) {
                        const input = item.querySelector('input');
                        if (input) {
                            const rect = input.getBoundingClientRect();
                            if (rect.width > 0 && rect.height > 0) {
                                statusInput = input;
                                break;
                            }
                        }
                    }
                }

                if (!statusInput) {
                    logger.error('未找到工单状态输入框');
                    throw new Error('未找到工单状态输入框');
                }

                // Step 12: 点击工单状态输入框
                console.log('Step 12: 点击工单状态输入框');
                statusInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
                await ToolUtil.sleep(100);
                statusInput.focus();
                await ToolUtil.fastClick(statusInput, { fastDelay: 100, fallbackDelay: 800, logger });

                // 点击后等待下拉框出现 - 统一使用较长等待时间确保下拉框完全渲染
                await ToolUtil.sleep(800);

                // Step 13: 在搜索框输入"已解决"
                console.log('Step 13: 在搜索框输入已解决');
                const allSearchInputs = document.querySelectorAll('input[placeholder="搜索"]');
                const statusRect = statusInput.getBoundingClientRect();
                let searchInput = null;
                let minDistance = Infinity;

                for (const input of allSearchInputs) {
                    const rect = input.getBoundingClientRect();
                    if (rect.width > 0 && rect.height > 0) {
                        const distance = Math.abs(rect.top - statusRect.top);
                        if (distance < minDistance) {
                            minDistance = distance;
                            searchInput = input;
                        }
                    }
                }

                if (searchInput) {
                    searchInput.focus();
                    await ToolUtil.sleep(200);
                    nativeSetter.call(searchInput, config.status);
                    searchInput.dispatchEvent(new Event('input', { bubbles: true }));
                    searchInput.dispatchEvent(new Event('change', { bubbles: true }));
                } else {
                    logger.error('未找到搜索框');
                    throw new Error('未找到搜索框');
                }
                await ToolUtil.sleep(800);

                // Step 14: 点击下拉选项
                console.log('Step 14: 点击下拉选项');
                const statusOptions = document.querySelectorAll('li');
                let foundStatusOption = null;
                let minOptionDistance = Infinity;
                const searchRect = searchInput.getBoundingClientRect();

                for (const li of statusOptions) {
                    const text = li.textContent.trim();
                    const rect = li.getBoundingClientRect();
                    if (rect.width > 0 && rect.height > 0 && text.includes(config.status)) {
                        const distance = Math.abs(rect.top - searchRect.top);
                        if (distance < minOptionDistance) {
                            minOptionDistance = distance;
                            foundStatusOption = li;
                        }
                    }
                }

                if (foundStatusOption) {
                    foundStatusOption.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    await ToolUtil.fastClick(foundStatusOption, { fastDelay: 100, fallbackDelay: 500, logger });
                } else {
                    logger.error(`未找到状态选项: ${config.status}`);
                    throw new Error(`未找到状态选项: ${config.status}`);
                }

                // Step 15: 填写内部回复
                console.log('Step 15: 填写内部回复');
                logger.log('填写内部回复');

                // 滚动弹窗到底部
                const scrollContainers2 = document.querySelectorAll('.el-dialog__body, .el-drawer__body, .el-scrollbar__wrap');
                for (const container of scrollContainers2) {
                    if (container.scrollHeight > container.clientHeight) {
                        container.scrollTop = container.scrollHeight;
                        await ToolUtil.sleep(200);
                    }
                }
                await ToolUtil.sleep(500);

                // 查找内部回复输入框 - 通过 el-form-item 的 label 精确定位
                let internalReplyInput = null;
                let attempts = 0;
                const maxAttempts = 10;

                while (!internalReplyInput && attempts < maxAttempts) {
                    attempts++;
                    console.log(`第 ${attempts} 次尝试查找内部回复输入框...`);

                    // 方法1：通过 el-form-item 的 label 精确定位"内部回复"
                    const allFormItems = document.querySelectorAll('.el-form-item');
                    for (const item of allFormItems) {
                        const labelEl = item.querySelector('.el-form-item__label');
                        if (labelEl && labelEl.textContent.includes('内部回复')) {
                            console.log('找到"内部回复"表单项');

                            // 在该表单项内查找 TinyMCE 编辑器容器
                            const tinymceContainer = item.querySelector('.tox.tox-tinymce');
                            if (tinymceContainer) {
                                const rect = tinymceContainer.getBoundingClientRect();
                                if (rect.width > 0 && rect.height > 0) {
                                    console.log('在"内部回复"表单项内找到 TinyMCE 编辑器容器');

                                    const iframe = tinymceContainer.querySelector('iframe');
                                    if (iframe) {
                                        try {
                                            const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
                                            if (iframeDoc && iframeDoc.body) {
                                                const body = iframeDoc.body;
                                                if (body.id === 'tinymce' || body.contentEditable === 'true') {
                                                    internalReplyInput = body;
                                                    console.log('找到"内部回复"对应的 TinyMCE iframe body');
                                                    break;
                                                }
                                            }
                                        } catch (e) {
                                            console.log('无法访问 iframe 内容:', e.message);
                                        }
                                    }
                                }
                            }
                        }
                    }

                    // 方法2：如果方法1没找到，尝试查找表单项内的 contentEditable 元素
                    if (!internalReplyInput) {
                        for (const item of allFormItems) {
                            const labelEl = item.querySelector('.el-form-item__label');
                            if (labelEl && labelEl.textContent.includes('内部回复')) {
                                const editables = item.querySelectorAll('[contenteditable="true"]');
                                for (const el of editables) {
                                    const rect = el.getBoundingClientRect();
                                    if (rect.width > 0 && rect.height > 0) {
                                        internalReplyInput = el;
                                        console.log('找到"内部回复"表单项内的 contentEditable 元素');
                                        break;
                                    }
                                }
                                if (internalReplyInput) break;
                            }
                        }
                    }

                    // 方法3：回退逻辑 - 查找所有可见的 TinyMCE 编辑器（保持兼容性）
                    if (!internalReplyInput) {
                        console.log('使用回退逻辑查找 TinyMCE 编辑器...');
                        const tinymceContainers = document.querySelectorAll('.tox.tox-tinymce');
                        console.log(`找到 ${tinymceContainers.length} 个 TinyMCE 编辑器容器`);

                        for (const container of tinymceContainers) {
                            const rect = container.getBoundingClientRect();
                            if (rect.width === 0 || rect.height === 0) {
                                continue;
                            }

                            const iframe = container.querySelector('iframe');
                            if (iframe) {
                                try {
                                    const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
                                    if (iframeDoc && iframeDoc.body) {
                                        const body = iframeDoc.body;
                                        if (body.id === 'tinymce' || body.contentEditable === 'true') {
                                            internalReplyInput = body;
                                            console.log('通过回退逻辑找到 TinyMCE body');
                                            break;
                                        }
                                    }
                                } catch (e) {
                                    console.log('无法访问 iframe 内容:', e.message);
                                }
                            }
                        }
                    }

                    if (!internalReplyInput) {
                        console.log(`第 ${attempts} 次尝试未找到，等待 300ms 后重试...`);
                        await ToolUtil.sleep(300);
                    }
                }

                if (internalReplyInput) {
                    internalReplyInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    await ToolUtil.sleep(300);
                    internalReplyInput.focus();
                    await ToolUtil.sleep(200);

                    if (internalReplyInput.tagName === 'TEXTAREA' || internalReplyInput.tagName === 'INPUT') {
                        nativeSetter.call(internalReplyInput, config.internalReply);
                        internalReplyInput.dispatchEvent(new Event('input', { bubbles: true }));
                        internalReplyInput.dispatchEvent(new Event('change', { bubbles: true }));
                    } else {
                        // 富文本编辑器（TinyMCE body 或 contentEditable 元素）
                        internalReplyInput.innerHTML = '<p>' + config.internalReply + '</p>';
                        internalReplyInput.focus();

                        const inputEvent = new InputEvent('input', {
                            bubbles: true,
                            cancelable: true,
                            data: config.internalReply,
                            inputType: 'insertText'
                        });
                        internalReplyInput.dispatchEvent(inputEvent);

                        const keydownEvent = new KeyboardEvent('keydown', { bubbles: true });
                        internalReplyInput.dispatchEvent(keydownEvent);
                        const keyupEvent = new KeyboardEvent('keyup', { bubbles: true });
                        internalReplyInput.dispatchEvent(keyupEvent);
                    }
                    console.log('已填写内部回复');
                    logger.log('内部回复填写成功');
                } else {
                    console.log('未找到内部回复输入框，跳过此步骤');
                    logger.warn('未找到内部回复输入框');
                }
                await ToolUtil.sleep(500);

                // Step 16: 点击发送奖励输入框
                console.log('Step 16: 点击发送奖励输入框');
                logger.log('选择发送奖励');

                const rewardInputs = document.querySelectorAll('input[placeholder="请选择"]');
                let rewardInput = null;
                for (const input of rewardInputs) {
                    const rect = input.getBoundingClientRect();
                    if (rect.width > 0 && rect.height > 0) {
                        let parent = input.closest('.el-form-item');
                        if (parent) {
                            const labelEl = parent.querySelector('.el-form-item__label');
                            if (labelEl && labelEl.textContent.includes('发送奖励')) {
                                rewardInput = input;
                                break;
                            }
                        }
                    }
                }

                if (rewardInput) {
                    rewardInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    await ToolUtil.fastClick(rewardInput, { fastDelay: 100, fallbackDelay: 800, logger });
                    console.log('已点击发送奖励输入框');

                    // 点击后等待下拉框出现 - 统一使用较长等待时间确保下拉框完全渲染
                    await ToolUtil.sleep(800);
                } else {
                    logger.error('未找到发送奖励输入框');
                    throw new Error('未找到发送奖励输入框');
                }

                // Step 17: 点击奖励选项
                console.log('Step 17: 点击奖励选项');
                const spans = document.querySelectorAll('span');
                let mailItem = null;
                for (const span of spans) {
                    if (span.textContent.includes(config.reward) && ToolUtil.isElementAvailable(span)) {
                        mailItem = span;
                        break;
                    }
                }
                if (mailItem) {
                    mailItem.scrollIntoView({ behavior: 'smooth', block: 'end' });
                    await ToolUtil.fastClick(mailItem, { fastDelay: 100, fallbackDelay: 500, logger });
                    console.log('已点击奖励选项');
                } else {
                    logger.error(`未找到奖励选项: ${config.reward}`);
                    throw new Error(`未找到奖励选项: ${config.reward}`);
                }

                // Step 18: 点击提交按钮
                console.log('Step 18: 点击提交按钮');
                logger.log('点击提交按钮');

                let submitBtn = null;

                // 方法1: 查找el-popover中的提交按钮
                const popovers = document.querySelectorAll('.el-popover, .el-message-box');
                for (const popover of popovers) {
                    const style = window.getComputedStyle(popover);
                    if (style.display === 'none' || style.visibility === 'hidden') continue;
                    const buttons = popover.querySelectorAll('button');
                    for (const btn of buttons) {
                        const text = btn.textContent.trim();
                        if (text === '提交' || text === '确认') {
                            const rect = btn.getBoundingClientRect();
                            if (rect.width > 0 && rect.height > 0) {
                                submitBtn = btn;
                                break;
                            }
                        }
                    }
                    if (submitBtn) break;
                }

                // 方法2: 查找弹窗内的提交按钮
                if (!submitBtn) {
                    const dialogs = document.querySelectorAll('.el-dialog__wrapper, .el-dialog');
                    for (const dialog of dialogs) {
                        const style = window.getComputedStyle(dialog);
                        if (style.display === 'none' || style.visibility === 'hidden') continue;
                        const buttons = dialog.querySelectorAll('button');
                        for (const btn of buttons) {
                            const text = btn.textContent.trim();
                            if (text === '提交') {
                                const rect = btn.getBoundingClientRect();
                                if (rect.width > 0 && rect.height > 0) {
                                    submitBtn = btn;
                                    break;
                                }
                            }
                        }
                        if (submitBtn) break;
                    }
                }

                // 方法3: 全局搜索
                if (!submitBtn) {
                    const allButtons = document.querySelectorAll('button');
                    for (const btn of allButtons) {
                        const text = btn.textContent.trim();
                        if (text === '提交') {
                            const rect = btn.getBoundingClientRect();
                            if (rect.width > 0 && rect.height > 0) {
                                submitBtn = btn;
                                break;
                            }
                        }
                    }
                }

                if (submitBtn) {
                    submitBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    await ToolUtil.fastClick(submitBtn, { fastDelay: 100, fallbackDelay: 500, logger });
                    console.log('已点击提交按钮');
                } else {
                    logger.error('未找到提交按钮');
                    throw new Error('未找到提交按钮');
                }

                logger.success('BUG自动解决完成');
                console.log('=== BUG自动解决完成 ===');
                return { success: true, message: 'BUG自动解决完成' };
            }
        };
    }

    // ==================== 功能模块 ====================
    const ActionA = {
        name: '筛选BUG标签',
        icon: '🐛',
        shortTip: '筛选AI识别为BUG的工单',
        detailTip: '筛选包含"AI识别为BUG bug identified by ai"标签的工单',
        async execute() {
            console.log('=== 开始执行筛选BUG标签 ===');
            const logger = createLogChannel('筛选BUG标签');
            logger.log('开始筛选BUG标签工单');

            console.log('Step 1: 点击筛选按钮');
            const filterBtns = document.querySelectorAll('button');
            for (const btn of filterBtns) {
                if (btn.textContent.includes('筛选') && btn.querySelector('i.el-icon-search')) {
                    await ToolUtil.fastClick(btn, { fastDelay: 100, fallbackDelay: 800, logger });
                    break;
                }
            }

            console.log('Step 2: 点击重置按钮');
            const resetBtns = document.querySelectorAll('button');
            for (const btn of resetBtns) {
                if (btn.textContent.trim() === '重置') {
                    await ToolUtil.fastClick(btn, { fastDelay: 100, fallbackDelay: 500, logger });
                    break;
                }
            }

            console.log('Step 3: 滚动弹窗到底部');
            const scrollContainers = document.querySelectorAll('.el-dialog__body, .el-drawer__body, .el-scrollbar__wrap');
            for (const container of scrollContainers) {
                if (container.scrollHeight > container.clientHeight) {
                    container.scrollTop = container.scrollHeight;
                    await ToolUtil.sleep(200);
                    container.scrollTop = container.scrollHeight;
                }
            }
            await ToolUtil.sleep(500);

            console.log('Step 4: 查找标签输入框');
            const allInputs = document.querySelectorAll('input[placeholder="请选择标签"]');
            console.log('找到标签输入框数量:', allInputs.length);

            let targetInput = null;

            for (let i = 0; i < allInputs.length; i++) {
                const input = allInputs[i];
                const rect = input.getBoundingClientRect();

                let labelText = '';
                let parent = input.closest('.el-form-item');
                if (parent) {
                    const labelEl = parent.querySelector('.el-form-item__label');
                    if (labelEl) {
                        labelText = labelEl.textContent.trim();
                    }
                }

                console.log(`输入框${i}: top=${rect.top}, label="${labelText}"`);

                if (labelText.includes('包含其中任一标签') && !labelText.includes('不包含')) {
                    targetInput = input;
                    console.log(`  -> 选择此输入框 (匹配"包含其中任一标签")`);
                    break;
                }
            }

            if (!targetInput) {
                throw new Error('未找到"包含其中任一标签"输入框');
            }

            console.log('最终选择的输入框位置:', targetInput.getBoundingClientRect().top);

            console.log('Step 5: 点击输入框');
            targetInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
            await ToolUtil.sleep(100);

            targetInput.focus();
            await ToolUtil.fastClick(targetInput, { fastDelay: 100, fallbackDelay: 500, logger });
            console.log('已点击目标输入框');

            console.log('Step 6: 在目标输入框输入');

            const nativeSetter = Object.getOwnPropertyDescriptor(
                window.HTMLInputElement.prototype, 'value'
            ).set;
            nativeSetter.call(targetInput, 'AI识别为BUG bug identified by ai');
            targetInput.dispatchEvent(new Event('input', { bubbles: true }));
            targetInput.dispatchEvent(new Event('change', { bubbles: true }));
            console.log('已在目标输入框输入');
            await ToolUtil.sleep(800);

            console.log('Step 7: 点击下拉选项');

            const listItems = document.querySelectorAll('li.elp-cascader-node, li');
            console.log('找到下拉选项数量:', listItems.length);

            let foundOption = null;
            for (const li of listItems) {
                const text = li.textContent || '';
                const rect = li.getBoundingClientRect();
                if (rect.width > 0 && rect.height > 0) {
                    console.log('下拉选项:', text.substring(0, 30).trim());
                    if (text.includes('AI识别为BUG') || text.includes('bug identified by ai')) {
                        foundOption = li;
                    }
                }
            }

            if (foundOption) {
                targetInput.focus();
                await ToolUtil.fastClick(foundOption, { fastDelay: 100, fallbackDelay: 500, logger });
                console.log('已点击下拉选项');
            } else {
                console.log('未找到下拉选项');
            }

            console.log('Step 8: 点击筛选按钮');
            await ToolUtil.clickFilterButton();
            await ToolUtil.sleep(500);

            console.log('=== 筛选BUG标签完成 ===');
            logger.success('筛选BUG标签完成');
            return { success: true, message: 'BUG标签筛选完成' };
        }
    };

    const ActionB = {
        name: '筛选MCGG标题',
        icon: '📝',
        shortTip: '筛选标题包含【MCGG】的工单',
        detailTip: '筛选工单标题中包含"【MCGG】"的工单',
        async execute() {
            await ToolUtil.clickByText(['button', 'span', 'i'], '筛选');
            await ToolUtil.sleep(500);

            await ToolUtil.clickByText(['button', 'span'], '重置');
            await ToolUtil.sleep(500);

            await ToolUtil.clickElement('input[placeholder="请输入工单标题"]');
            await ToolUtil.sleep(300);

            await ToolUtil.inputText('input[placeholder="请输入工单标题"]', '【MCGG】');
            await ToolUtil.sleep(500);

            await ToolUtil.clickFilterButton();
            await ToolUtil.sleep(500);

            return { success: true, message: 'MCGG标题筛选完成' };
        }
    };

    const ActionC = {
        name: '筛选s57描述',
        icon: '📄',
        shortTip: '筛选描述包含s57的工单',
        detailTip: '筛选工单描述中包含"s57"的工单',
        async execute() {
            await ToolUtil.clickByText(['button', 'span', 'i'], '筛选');
            await ToolUtil.sleep(500);

            await ToolUtil.clickByText(['button', 'span'], '重置');
            await ToolUtil.sleep(500);

            await ToolUtil.clickElement('input[placeholder="请输入描述"]');
            await ToolUtil.sleep(300);

            await ToolUtil.inputText('input[placeholder="请输入描述"]', 's57');
            await ToolUtil.sleep(500);

            await ToolUtil.clickFilterButton();
            await ToolUtil.sleep(500);

            return { success: true, message: 's57描述筛选完成' };
        }
    };

    const ActionD = {
        name: '清除筛选',
        icon: '🗑️',
        shortTip: '清除所有筛选条件',
        detailTip: '清除所有筛选条件，显示全部工单',
        async execute() {
            await ToolUtil.clickByText(['button', 'span', 'i'], '筛选');
            await ToolUtil.sleep(500);

            await ToolUtil.clickByText(['button', 'span'], '重置');
            await ToolUtil.sleep(500);

            await ToolUtil.clickFilterButton();
            await ToolUtil.sleep(500);

            return { success: true, message: '已清除所有筛选条件' };
        }
    };

    const ActionE = {
        name: '批量处理',
        icon: '⚡',
        shortTip: '批量改状态并发送邮件',
        detailTip: '一键批量当前页面所有工单，将状态改为=QA并发送15邮件',
        async execute() {
            console.log('=== 开始执行批量处理 ===');
            const logger = createLogChannel('批量处理');
            logger.log('开始批量处理工单');

            console.log('Step 1: 全选工单');
            logger.log('全选工单');
            await ToolUtil.clickElement('span.el-checkbox__inner');
            await ToolUtil.sleep(800);

            console.log('Step 2: 点击编辑按钮');
            logger.log('点击编辑按钮');
            await ToolUtil.clickByText(['button', 'span'], '编辑');
            await ToolUtil.sleep(1500);

            console.log('Step 3: 查找工单状态输入框');

            let statusInput = null;

            const allFormItems = document.querySelectorAll('.el-form-item');
            for (const item of allFormItems) {
                const labelEl = item.querySelector('.el-form-item__label');
                if (labelEl && labelEl.textContent.includes('工单状态')) {
                    const input = item.querySelector('input');
                    if (input) {
                        const rect = input.getBoundingClientRect();
                        if (rect.width > 0 && rect.height > 0) {
                            statusInput = input;
                            console.log('通过label找到工单状态输入框，位置:', rect.top, rect.left);
                            break;
                        }
                    }
                }
            }

            if (!statusInput) {
                statusInput = document.querySelector('input[placeholder="请输入工单状态"]');
                if (statusInput) {
                    console.log('通过placeholder找到工单状态输入框');
                }
            }

            console.log('Step 4: 点击工单状态输入框');
            if (statusInput) {
                statusInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
                await ToolUtil.sleep(100);
                statusInput.focus();
                await ToolUtil.fastClick(statusInput, { fastDelay: 100, fallbackDelay: 800, logger });
                console.log('已点击工单状态输入框');

                // 点击后等待下拉框出现 - 统一使用较长等待时间确保下拉框完全渲染
                await ToolUtil.sleep(800);
            } else {
                throw new Error('未找到工单状态输入框');
            }

            console.log('Step 5: 在搜索框输入"= QA"');

            const allSearchInputs = document.querySelectorAll('input[placeholder="搜索"]');
            console.log('找到搜索框数量:', allSearchInputs.length);

            const statusRect = statusInput.getBoundingClientRect();
            let searchInput = null;
            let minDistance = Infinity;

            for (const input of allSearchInputs) {
                const rect = input.getBoundingClientRect();
                if (rect.width > 0 && rect.height > 0) {
                    const distance = Math.abs(rect.top - statusRect.top);
                    console.log('搜索框位置:', rect.top, rect.left, '距离:', distance);
                    if (distance < minDistance) {
                        minDistance = distance;
                        searchInput = input;
                    }
                }
            }

            console.log('选择的搜索框距离:', minDistance);

            if (searchInput) {
                searchInput.focus();
                await ToolUtil.sleep(200);

                const nativeSetter = Object.getOwnPropertyDescriptor(
                    window.HTMLInputElement.prototype, 'value'
                ).set;
                nativeSetter.call(searchInput, '= QA');
                searchInput.dispatchEvent(new Event('input', { bubbles: true }));
                searchInput.dispatchEvent(new Event('change', { bubbles: true }));
                console.log('已在搜索框输入"= QA"');
            } else {
                throw new Error('未找到搜索框');
            }
            await ToolUtil.sleep(800);

            console.log('Step 5.1: 点击下拉选项"= QA"');
            await ToolUtil.sleep(300);

            const statusOptions = document.querySelectorAll('li');
            let foundQA = null;
            let minOptionDistance = Infinity;
            const searchRect = searchInput.getBoundingClientRect();
            console.log('搜索框位置:', searchRect.top, searchRect.left);

            for (const li of statusOptions) {
                const text = li.textContent.trim();
                const rect = li.getBoundingClientRect();
                if (rect.width > 0 && rect.height > 0 && text.includes('= QA')) {
                    const distance = Math.abs(rect.top - searchRect.top);
                    console.log('找到"= QA"选项, 文本:', text, '位置:', rect.top, rect.left, '距离:', distance);
                    if (distance < minOptionDistance) {
                        minOptionDistance = distance;
                        foundQA = li;
                    }
                }
            }

            if (foundQA) {
                console.log('选择距离最近的选项, 距离:', minOptionDistance);
                foundQA.scrollIntoView({ behavior: 'smooth', block: 'center' });
                await ToolUtil.fastClick(foundQA, { fastDelay: 100, fallbackDelay: 500, logger });
                console.log('已选择"= QA"');
            } else {
                console.log('未找到"= QA"选项');
            }

            console.log('Step 6: 再次滚动弹窗');
            const scrollContainers = document.querySelectorAll('.el-dialog__body, .el-drawer__body, .el-scrollbar__wrap');
            for (const container of scrollContainers) {
                if (container.scrollHeight > container.clientHeight) {
                    container.scrollTop = container.scrollHeight;
                    await ToolUtil.sleep(200);
                }
            }
            await ToolUtil.sleep(500);

            console.log('Step 7: 点击发送奖励输入框');
            const rewardInputs = document.querySelectorAll('input[placeholder="请选择"]');
            console.log('找到"请选择"输入框数量:', rewardInputs.length);

            let rewardInput = null;
            for (const input of rewardInputs) {
                const rect = input.getBoundingClientRect();
                if (rect.width > 0 && rect.height > 0) {
                    let parent = input.closest('.el-form-item');
                    if (parent) {
                        const labelEl = parent.querySelector('.el-form-item__label');
                        if (labelEl && labelEl.textContent.includes('发送奖励')) {
                            rewardInput = input;
                            console.log('找到发送奖励输入框');
                            break;
                        }
                    }
                }
            }

            if (!rewardInput && rewardInputs.length > 0) {
                for (const input of rewardInputs) {
                    const rect = input.getBoundingClientRect();
                    if (rect.width > 0 && rect.height > 0) {
                        rewardInput = input;
                    }
                }
            }

            if (rewardInput) {
                rewardInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
                await ToolUtil.fastClick(rewardInput, { fastDelay: 100, fallbackDelay: 800, logger });
                console.log('已点击发送奖励输入框');

                // 点击后等待下拉框出现 - 统一使用较长等待时间确保下拉框完全渲染
                await ToolUtil.sleep(800);
            } else {
                throw new Error('未找到发送奖励输入框');
            }

            console.log('Step 8: 查找邮件选项');
            const spans = document.querySelectorAll('span');
            let mailItem = null;
            for (const span of spans) {
                if (span.textContent.includes('15 ProjectCreated.mail') && ToolUtil.isElementAvailable(span)) {
                    mailItem = span;
                    console.log('找到邮件选项');
                    break;
                }
            }
            if (mailItem) {
                mailItem.scrollIntoView({ behavior: 'smooth', block: 'end' });
                await ToolUtil.fastClick(mailItem, { fastDelay: 100, fallbackDelay: 500, logger });
                console.log('已点击邮件选项');
            } else {
                throw new Error('未找到邮件选项: 15 ProjectCreated.mail');
            }

            console.log('Step 9: 点击提交按钮');

            const popovers = document.querySelectorAll('.el-popover, .el-message-box');
            let submitBtn = null;

            for (const popover of popovers) {
                const style = window.getComputedStyle(popover);
                if (style.display === 'none' || style.visibility === 'hidden') continue;

                const buttons = popover.querySelectorAll('button');
                for (const btn of buttons) {
                    const text = btn.textContent.trim();
                    if (text === '提交' || text === '确认') {
                        const rect = btn.getBoundingClientRect();
                        if (rect.width > 0 && rect.height > 0) {
                            submitBtn = btn;
                            console.log('在popover找到按钮:', text, '位置:', rect.top, rect.left);
                            break;
                        }
                    }
                }
                if (submitBtn) break;
            }

            if (!submitBtn) {
                const dialogs = document.querySelectorAll('.el-dialog__wrapper, .el-dialog');
                for (const dialog of dialogs) {
                    const style = window.getComputedStyle(dialog);
                    if (style.display === 'none' || style.visibility === 'hidden') continue;

                    const buttons = dialog.querySelectorAll('button');
                    for (const btn of buttons) {
                        const text = btn.textContent.trim();
                        if (text === '提交') {
                            const rect = btn.getBoundingClientRect();
                            if (rect.width > 0 && rect.height > 0) {
                                submitBtn = btn;
                                console.log('在dialog找到提交按钮, 位置:', rect.top, rect.left);
                                break;
                            }
                        }
                    }
                    if (submitBtn) break;
                }
            }

            if (!submitBtn) {
                const allButtons = document.querySelectorAll('button');
                for (const btn of allButtons) {
                    const text = btn.textContent.trim();
                    if (text === '提交') {
                        const rect = btn.getBoundingClientRect();
                        if (rect.width > 0 && rect.height > 0) {
                            submitBtn = btn;
                            console.log('找到提交按钮(全局搜索), 位置:', rect.top, rect.left);
                            break;
                        }
                    }
                }
            }

            if (submitBtn) {
                submitBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
                await ToolUtil.fastClick(submitBtn, { fastDelay: 100, fallbackDelay: 500, logger });
                console.log('已点击提交按钮');
            } else {
                console.log('未找到提交按钮');
            }
            await ToolUtil.sleep(500);

            console.log('=== 批量处理完成 ===');
            logger.success('批量处理完成');
            return { success: true, message: '批量处理完成' };
        }
    };

    async function openBatchEditAndFindField(labelText, logger, options = {}) {
        const { fallbackSelector = '' } = options;

        try {
            await ToolUtil.clickByText(['button', 'span'], '\u7f16\u8f91');
        } catch (e) {
            if (logger) logger.error('\u672a\u627e\u5230\u7f16\u8f91\u6309\u94ae\uff0c\u8bf7\u5148\u52fe\u9009\u5de5\u5355');
            throw new Error('\u672a\u627e\u5230\u7f16\u8f91\u6309\u94ae\uff0c\u8bf7\u5148\u52fe\u9009\u5de5\u5355');
        }

        const fieldInput = await ToolUtil.waitForCondition(
            () => ToolUtil.findFormInputByLabel(labelText, { fallbackSelector }),
            { timeout: 2200 }
        );
        if (!fieldInput) {
            if (logger) logger.error(`\u672a\u627e\u5230\u5b57\u6bb5\uff1a${labelText}`);
            throw new Error(`\u672a\u627e\u5230\u5b57\u6bb5\uff1a${labelText}`);
        }

        return fieldInput;
    }

    async function fillBatchFieldByLabel(labelText, searchText, optionText, logger, options = {}) {
        const { fallbackSelector = '', optionSelectors = ['li'] } = options;
        const fieldInput = ToolUtil.findFormInputByLabel(labelText, { fallbackSelector });
        if (!fieldInput) {
            if (logger) logger.error(`\u672a\u627e\u5230\u5b57\u6bb5\uff1a${labelText}`);
            throw new Error(`\u672a\u627e\u5230\u5b57\u6bb5\uff1a${labelText}`);
        }

        await ToolUtil.selectDropdownOption(fieldInput, searchText, optionText, logger, { optionSelectors });
        return fieldInput;
    }

    function createAssignAction(assigneeKey) {
        const config = ASSIGNEE_CONFIG[assigneeKey];
        if (!config) {
            throw new Error(`Unknown assignee: ${assigneeKey}`);
        }

        return {
            name: `\u5206\u914d\u7ed9${config.name}`,
            icon: config.name,
            shortTip: `\u5206\u914d\u7ed9${config.displayName}`,
            detailTip: `\u5c06\u9009\u4e2d\u5de5\u5355\u6279\u91cf\u5206\u914d\u7ed9${config.displayName}`,
            assigneeId: config.id,
            async execute() {
                const logger = createLogChannel('\u53d7\u7406\u4eba');
                logger.log(`\u5f00\u59cb\u6279\u91cf\u5206\u914d\u7ed9 ${config.displayName}`);

                const assigneeInput = await openBatchEditAndFindField('\u5de5\u5355\u53d7\u7406\u4eba', logger);
                await ToolUtil.selectDropdownOption(assigneeInput, config.id, config.id, logger, {
                    optionSelectors: ['li']
                });
                await ToolUtil.clickSubmitButton(logger, ['\u63d0\u4ea4', '\u786e\u8ba4']);

                logger.success(`\u6279\u91cf\u5206\u914d\u7ed9${config.displayName}\u5b8c\u6210`);
                return { success: true, message: `\u6279\u91cf\u5206\u914d\u7ed9${config.displayName}\u5b8c\u6210` };
            }
        };
    }

    function createResolveAction() {
        const statusText = '\u5df2\u89e3\u51b3';

        return {
            name: '\u6279\u91cf\u89e3\u51b3',
            icon: '\u89e3',
            shortTip: '\u6279\u91cf\u8bbe\u4e3a\u5df2\u89e3\u51b3',
            detailTip: '\u5c06\u9009\u4e2d\u5de5\u5355\u72b6\u6001\u6279\u91cf\u6539\u4e3a\u5df2\u89e3\u51b3',
            async execute() {
                const logger = createLogChannel('\u5de5\u5355\u5df2\u89e3\u51b3');
                logger.log('\u5f00\u59cb\u6279\u91cf\u8bbe\u7f6e\u5de5\u5355\u72b6\u6001\u4e3a\u5df2\u89e3\u51b3');

                const statusInput = await openBatchEditAndFindField('\u5de5\u5355\u72b6\u6001', logger);
                await ToolUtil.selectDropdownOption(statusInput, statusText, statusText, logger, {
                    optionSelectors: ['li']
                });
                await ToolUtil.clickSubmitButton(logger, ['\u63d0\u4ea4', '\u786e\u8ba4']);

                logger.success('\u6279\u91cf\u89e3\u51b3\u5b8c\u6210');
                return { success: true, message: '\u6279\u91cf\u89e3\u51b3\u5b8c\u6210' };
            }
        };
    }

    function createResolveWithKnownMailAction() {
        const statusText = '\u5df2\u89e3\u51b3';
        const knownMailText = '8 Noticed.mail';

        return {
            name: '\u6279\u91cf\u5df2\u89e3\u51b3\u5e76\u53d1\u5df2\u77e5\u90ae\u4ef6',
            icon: 'KM',
            shortTip: '\u6279\u91cf\u8bbe\u4e3a\u5df2\u89e3\u51b3\u5e76\u53d1\u5df2\u77e5\u90ae\u4ef6',
            detailTip: '\u5c06\u9009\u4e2d\u5de5\u5355\u6279\u91cf\u8bbe\u4e3a\u5df2\u89e3\u51b3\uff0c\u5e76\u53d1\u9001 8 Noticed.mail',
            async execute() {
                const logger = createLogChannel('resolve-mail');
                logger.log('\u5f00\u59cb\u6279\u91cf\u8bbe\u4e3a\u5df2\u89e3\u51b3\u5e76\u53d1\u5df2\u77e5\u90ae\u4ef6');

                const statusInput = await openBatchEditAndFindField('\u5de5\u5355\u72b6\u6001', logger);
                await ToolUtil.selectDropdownOption(statusInput, statusText, statusText, logger, {
                    optionSelectors: ['li']
                });
                await fillBatchFieldByLabel('\u53d1\u9001\u5956\u52b1', knownMailText, knownMailText, logger, {
                    fallbackSelector: 'input[placeholder="\u8bf7\u9009\u62e9"]',
                    optionSelectors: ['li', 'span']
                });
                await ToolUtil.clickSubmitButton(logger, ['\u63d0\u4ea4', '\u786e\u8ba4']);

                logger.success('\u6279\u91cf\u5df2\u89e3\u51b3\u5e76\u53d1\u5df2\u77e5\u90ae\u4ef6\u5b8c\u6210');
                return { success: true, message: '\u6279\u91cf\u5df2\u89e3\u51b3\u5e76\u53d1\u5df2\u77e5\u90ae\u4ef6\u5b8c\u6210' };
            }
        };
    }

    const ActionLog = {
        name: 'Log',
        icon: 'LG',
        shortTip: 'Log',
        detailTip: 'Log'
    };

    // ==================== ????????? ====================
    const ActionL = createAssignAction('L');
    const ActionN = createAssignAction('N');
    const ActionW = createAssignAction('W');
    const ActionX = createAssignAction('X');

    // ==================== 批量解决按钮 ====================
    const ActionResolve = createResolveAction();
    const ActionResolveWithKnownMail = createResolveWithKnownMailAction();

    // ==================== BUG自动解决按钮 ====================
    const ActionAutoResolve = createAutoResolveAction();

    // ==================== 按钮顺序配置 ====================
    // 新布局：BJ放在第一位，其他按钮依次后移
    // 位置1: BJ, 位置2: 🐛, 位置3: 📝, 位置4: 📄
    // 位置5: 🗑️, 位置6: ⚡, 位置7: 📋, 位置8: L
    // 位置9: N, 位置10: W, 位置11: X, 位置12: 解
    const actions = [ActionAutoResolve, ActionB, ActionC, ActionD, ActionE, ActionL, ActionN, ActionW, ActionX, ActionResolve, ActionResolveWithKnownMail];

    // ==================== 提示管理 ====================
    const TipManager = {
        shortTipTimer: null,
        detailTipTimer: null,
        currentTip: null,

        showShortTip(element, action, position) {
            this.hideTip();

            const tip = document.createElement('div');
            tip.className = 'aihelp-short-tip';
            tip.textContent = action.shortTip;
            tip.style.cssText = `
                position: fixed;
                left: ${position.left}px;
                top: ${position.top}px;
                background: rgba(0, 0, 0, 0.85);
                color: white;
                padding: 6px 10px;
                border-radius: 4px;
                font-size: 12px;
                white-space: nowrap;
                z-index: 1000001;
                pointer-events: none;
                box-shadow: 0 2px 8px rgba(0,0,0,0.2);
            `;
            document.body.appendChild(tip);
            this.currentTip = tip;

            this.detailTipTimer = setTimeout(() => {
                this.showDetailTip(element, action, position);
            }, LOG_CONFIG.tipDelay);
        },

        showDetailTip(element, action, position) {
            if (this.currentTip) {
                this.currentTip.remove();
            }

            const tip = document.createElement('div');
            tip.className = 'ai-delayed-tip';
            tip.innerHTML = `
                <div class="ai-delayed-tip-title">${action.shortTip}</div>
                <div class="ai-delayed-tip-desc">${action.detailTip}</div>
            `;
            tip.style.left = position.left + 'px';
            tip.style.top = position.top + 'px';
            document.body.appendChild(tip);

            requestAnimationFrame(() => {
                tip.classList.add('visible');
            });

            this.currentTip = tip;
        },

        hideTip() {
            if (this.shortTipTimer) {
                clearTimeout(this.shortTipTimer);
                this.shortTipTimer = null;
            }
            if (this.detailTipTimer) {
                clearTimeout(this.detailTipTimer);
                this.detailTipTimer = null;
            }
            if (this.currentTip) {
                this.currentTip.remove();
                this.currentTip = null;
            }
        }
    };

    // ==================== 日志管理 ====================
    const logs = [];
    let logCleanupTimer = null;

    function addLog(actionName, result, moduleTag = '') {
        const timestamp = new Date().toLocaleTimeString([], { hour12: false });
        const type = result.success ? 'success' : 'error';
        logs.unshift({ time: timestamp, action: actionName, result, type, moduleTag });

        if (logs.length > LOG_CONFIG.maxLogLines * 1.5) {
            logs.splice(LOG_CONFIG.maxLogLines);
        }

        updateLogPanel();
    }

    function addLogEntry(msg, type = 'info', moduleTag = '') {
        const timestamp = new Date().toLocaleTimeString([], { hour12: false });
        logs.unshift({ time: timestamp, action: msg, result: { success: type !== 'error', message: '' }, type, moduleTag, isEntry: true });

        if (logs.length > LOG_CONFIG.maxLogLines * 1.5) {
            logs.splice(LOG_CONFIG.maxLogLines);
        }

        updateLogPanel();
    }

    function updateLogPanel() {
        const panel = document.getElementById(LOG_PANEL_ID);
        if (!panel) return;

        const content = panel.querySelector('.log-content');

        if (logs.length === 0) {
            content.innerHTML = '<div class="log-empty">暂无日志记录</div>';
            return;
        }

        content.innerHTML = logs.map(log => {
            if (log.isEntry) {
                const tagClass = log.moduleTag ? `ai-log-module-${log.moduleTag}` : '';
                const tagHtml = log.moduleTag ? `<span class="${tagClass}">[${log.moduleTag}]</span> ` : '';
                return `
                    <div class="log-item ai-log-${log.type}">
                        ${tagHtml}<span class="log-time">${log.time}</span> ${log.action}
                    </div>
                `;
            }
            return `
                <div class="log-item">
                    <div class="log-time">${log.time}</div>
                    <div class="log-action">${log.action}</div>
                    <div class="log-result ${log.result.success ? '' : 'error'}">${log.result.message}</div>
                </div>
            `;
        }).join('');

        content.scrollTop = 0;
    }

    function cleanupOldLogs() {
        const panel = document.getElementById(LOG_PANEL_ID);
        if (!panel) return;

        const content = panel.querySelector('.log-content');
        if (!content) return;

        const currentCount = content.children.length;
        if (currentCount > LOG_CONFIG.maxLogLines * 0.8) {
            const removeCount = Math.floor(currentCount * 0.3);
            for (let i = 0; i < removeCount; i++) {
                if (content.lastChild) {
                    content.removeChild(content.lastChild);
                }
            }
            console.log('[AIHelp工单工具] 日志清理：移除了', removeCount, '条旧日志');
        }

        if (logs.length > LOG_CONFIG.maxLogLines) {
            logs.splice(LOG_CONFIG.maxLogLines);
        }
    }

    function startLogCleanupTimer() {
        if (logCleanupTimer) {
            clearInterval(logCleanupTimer);
        }

        logCleanupTimer = setInterval(() => {
            cleanupOldLogs();
        }, LOG_CONFIG.logCleanupInterval);
    }

    function createLogChannel(moduleName) {
        return {
            log: (msg) => addLogEntry(msg, 'info', moduleName),
            error: (msg) => addLogEntry(msg, 'error', moduleName),
            warn: (msg) => addLogEntry(msg, 'warn', moduleName),
            success: (msg) => addLogEntry(msg, 'success', moduleName)
        };
    }

    // ==================== 样式注入 ====================
    function createStyles() {
        if (document.getElementById(STYLE_ID)) return;

        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = `
            #${FLOAT_ICON_ID} {
                position: fixed;
                width: 44px;
                height: 44px;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 20px;
                cursor: pointer;
                z-index: 1000000;
                box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4);
                transition: transform 0.2s ease, box-shadow 0.2s ease;
                user-select: none;
            }

            #${FLOAT_ICON_ID}:hover {
                transform: scale(1.1);
                box-shadow: 0 6px 20px rgba(102, 126, 234, 0.5);
            }

            #${FLOAT_ICON_ID}:active {
                transform: scale(0.95);
            }

            #${FLOAT_PANEL_ID} {
                position: fixed;
                width: 176px;
                background: white;
                border-radius: 12px;
                box-shadow: 0 8px 30px rgba(0, 0, 0, 0.15);
                z-index: 999999;
                display: none;
                padding: 8px;
                overflow: visible;
            }

            #${FLOAT_PANEL_ID}.visible {
                display: block;
                animation: fadeIn 0.2s ease;
            }

            @keyframes fadeIn {
                from { opacity: 0; transform: scale(0.9); }
                to { opacity: 1; transform: scale(1); }
            }

            .aihelp-zone-grid {
                display: grid;
                grid-template-columns: repeat(4, 1fr);
                grid-template-rows: repeat(3, 1fr);
                gap: 6px;
            }

            .aihelp-zone-btn {
                width: 36px;
                height: 36px;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 18px;
                background: #f5f7fa;
                border-radius: 8px;
                cursor: pointer;
                transition: all 0.2s ease;
                position: relative;
                overflow: visible;
            }

            .aihelp-zone-btn:hover {
                background: #e8ecf1;
                transform: translateY(-2px);
            }

            .aihelp-zone-btn:active {
                transform: translateY(0);
            }

            .aihelp-zone-btn.loading {
                opacity: 0.6;
                pointer-events: none;
            }

            .aihelp-zone-btn.success {
                background: #67c23a !important;
            }

            #${LOG_PANEL_ID} {
                position: fixed;
                width: 360px;
                height: 420px;
                min-width: 250px;
                min-height: 180px;
                background: rgba(255, 255, 255, 0.98);
                backdrop-filter: blur(10px);
                border-radius: 12px;
                box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
                z-index: 999998;
                display: none;
                flex-direction: column;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                border: 1px solid rgba(0, 0, 0, 0.05);
                overflow: hidden;
                transform-origin: top left;
            }

            #${LOG_PANEL_ID}.visible {
                display: flex;
                animation: panelFadeIn 0.3s ease;
            }

            @keyframes panelFadeIn {
                from { opacity: 0; transform: scale(0.95); }
                to { opacity: 1; transform: scale(1); }
            }

            #${LOG_PANEL_ID} .log-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 10px 12px;
                background: #f5f5f5;
                border-bottom: 1px solid #eee;
                cursor: move;
                flex-shrink: 0;
            }

            #${LOG_PANEL_ID} .log-header h3 {
                margin: 0;
                font-size: 13px;
                color: #333;
                font-weight: 600;
            }

            #${LOG_PANEL_ID} .log-header .close-btn {
                background: none;
                border: none;
                font-size: 16px;
                cursor: pointer;
                color: #999;
                line-height: 1;
                transition: color 0.2s;
            }

            #${LOG_PANEL_ID} .log-header .close-btn:hover {
                color: #333;
            }

            #${LOG_PANEL_ID} .tool-actions {
                padding: 10px 12px 0;
                flex-shrink: 0;
            }

            #${LOG_PANEL_ID} .tool-actions .aihelp-zone-grid {
                width: 100%;
                grid-template-columns: repeat(4, minmax(0, 1fr));
            }

            #${LOG_PANEL_ID} .tool-actions .aihelp-zone-btn {
                width: auto;
                min-height: 36px;
                font-size: 13px;
                border-radius: 8px;
            }

            #${LOG_PANEL_ID} .log-content {
                flex: 1;
                overflow-y: auto;
                padding: 8px;
                background: #f9f9f9;
                font-family: "SFMono-Regular", Consolas, "Liberation Mono", Meno, monospace;
                font-size: 11px;
                line-height: 1.5;
                user-select: text;
                -webkit-user-select: text;
                cursor: text;
            }

            #${LOG_PANEL_ID} .log-item {
                padding: 6px 8px;
                margin-bottom: 4px;
                background: white;
                border-radius: 4px;
                border: 1px solid rgba(0,0,0,0.03);
                word-break: break-all;
            }

            #${LOG_PANEL_ID} .log-item .log-time {
                color: #999;
                font-size: 10px;
            }

            #${LOG_PANEL_ID} .log-item .log-action {
                color: #333;
                font-weight: 500;
                margin: 3px 0;
            }

            #${LOG_PANEL_ID} .log-item .log-result {
                color: #52c41a;
            }

            #${LOG_PANEL_ID} .log-item .log-result.error {
                color: #ff4d4f;
            }

            #${LOG_PANEL_ID} .log-empty {
                text-align: center;
                color: #999;
                padding: 20px;
                font-size: 12px;
            }

            /* 日志类型样式 */
            .ai-log-info { color: #1d1d1f; }
            .ai-log-success { color: #52c41a; }
            .ai-log-warn { color: #faad14; }
            .ai-log-error { color: #ff4d4f; }

            /* 模块标签样式 */
            .ai-log-module-filter { color: #3370ff; font-weight: 600; }
            .ai-log-module-batch { color: #722ed1; font-weight: 600; }
            .ai-log-module-system { color: #f5a623; font-weight: 600; }
            .ai-log-module-resolve-mail { color: #fa8c16; font-weight: 600; }
            .ai-log-module-受理人 { color: #13c2c2; font-weight: 600; }
            .ai-log-module-工单已解决 { color: #52c41a; font-weight: 600; }
            .ai-log-module-AI识别为BUG自动解决 { color: #eb2f96; font-weight: 600; }

            /* 调整大小手柄 */
            .ai-resize-handle {
                position: absolute;
                right: 0;
                bottom: 0;
                width: 16px;
                height: 16px;
                cursor: se-resize;
                background: linear-gradient(135deg, transparent 50%, rgba(0, 0, 0, 0.2) 50%);
                border-radius: 0 0 12px 0;
                z-index: 10;
            }

            .ai-resize-handle:hover {
                background: linear-gradient(135deg, transparent 50%, rgba(51, 112, 255, 0.5) 50%);
            }

            /* 延迟提示框 */
            .ai-delayed-tip {
                position: fixed;
                background: rgba(0, 0, 0, 0.9);
                color: white;
                padding: 8px 12px;
                border-radius: 6px;
                font-size: 12px;
                line-height: 1.5;
                white-space: nowrap;
                pointer-events: none;
                opacity: 0;
                transform: translateY(5px);
                transition: opacity 0.3s ease, transform 0.3s ease;
                z-index: 1000001;
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
                max-width: 250px;
            }
            .ai-delayed-tip.visible {
                opacity: 1;
                transform: translateY(0);
            }
            .ai-delayed-tip-title {
                font-weight: 600;
                margin-bottom: 4px;
                color: #fff;
            }
            .ai-delayed-tip-desc {
                font-size: 11px;
                color: rgba(255, 255, 255, 0.85);
            }
        `;
        document.head.appendChild(style);
    }

    // ==================== 创建悬浮图标 ====================
    function createFloatIcon() {
        if (document.getElementById(FLOAT_ICON_ID)) return;

        const icon = document.createElement('div');
        icon.id = FLOAT_ICON_ID;
        icon.innerHTML = '⚡';

        document.body.appendChild(icon);

        const hasPosition = ToolUtil.loadPosition(STORAGE_KEYS.FLOAT_ICON_POSITION, icon);
        if (!hasPosition) {
            icon.style.top = '120px';
            icon.style.right = '20px';
        }

        let isDragging = false;
        let startX, startY, startLeft, startTop;
        let panel = null;

        icon.addEventListener('mousedown', (e) => {
            isDragging = false;
            startX = e.clientX;
            startY = e.clientY;
            const rect = icon.getBoundingClientRect();
            startLeft = rect.left;
            startTop = rect.top;

            const onMove = (ev) => {
                const dx = ev.clientX - startX;
                const dy = ev.clientY - startY;

                if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
                    isDragging = true;

                    let newLeft = startLeft + dx;
                    let newTop = startTop + dy;

                    newLeft = Math.max(0, Math.min(newLeft, window.innerWidth - icon.offsetWidth));
                    newTop = Math.max(0, Math.min(newTop, window.innerHeight - icon.offsetHeight));

                    icon.style.left = newLeft + 'px';
                    icon.style.top = newTop + 'px';
                    icon.style.right = 'auto';
                    icon.style.bottom = 'auto';

                    if (panel) {
                        updatePanelPosition(icon, panel);
                    }
                }
            };

            const onUp = () => {
                document.removeEventListener('mousemove', onMove);
                document.removeEventListener('mouseup', onUp);

                if (isDragging) {
                    ToolUtil.savePosition(STORAGE_KEYS.FLOAT_ICON_POSITION, icon);
                }
            };

            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', onUp);
        });

        icon.addEventListener('click', () => {
            if (isDragging) return;

            if (!panel) {
                panel = createFloatPanel(icon);
            }
            panel.classList.toggle('visible');
            if (panel.classList.contains('visible')) {
                updatePanelPosition(icon, panel);
            }
        });
    }

    // ==================== 更新面板位置 ====================
    function updatePanelPosition(icon, panel) {
        const iconRect = icon.getBoundingClientRect();
        const panelWidth = 176;
        const panelHeight = 150;

        let left = iconRect.left - panelWidth - 10;
        let top = iconRect.top + (iconRect.height / 2) - (panelHeight / 2);

        if (left < 10) {
            left = iconRect.right + 10;
        }

        if (top < 10) {
            top = 10;
        }
        if (top + panelHeight > window.innerHeight - 10) {
            top = window.innerHeight - panelHeight - 10;
        }

        panel.style.left = left + 'px';
        panel.style.top = top + 'px';
    }

    // ==================== 创建悬浮面板 ====================
    function createFloatPanel(icon) {
        const panel = document.createElement('div');
        panel.id = FLOAT_PANEL_ID;

        const grid = document.createElement('div');
        grid.className = 'aihelp-zone-grid';

        actions.forEach((action, index) => {
            const btn = document.createElement('div');
            btn.className = 'aihelp-zone-btn';
            btn.dataset.index = index;
            btn.innerHTML = action.icon;

            btn.addEventListener('mouseenter', (e) => {
                const rect = btn.getBoundingClientRect();
                const iconRect = icon.getBoundingClientRect();
                let tipLeft, tipTop;

                if (iconRect.left > 150) {
                    tipLeft = iconRect.left - 10;
                } else {
                    tipLeft = iconRect.right + 10;
                }
                tipTop = rect.top;

                TipManager.showShortTip(btn, action, { left: tipLeft, top: tipTop });
            });

            btn.addEventListener('mouseleave', () => {
                TipManager.hideTip();
            });

            btn.addEventListener('click', async (e) => {
                e.stopPropagation();

                if (index === LOG_ACTION_INDEX) {
                    const logPanel = document.getElementById(LOG_PANEL_ID);
                    if (logPanel) {
                        logPanel.classList.toggle('visible');
                        if (logPanel.classList.contains('visible')) {
                            const iconRect = icon.getBoundingClientRect();
                            let logLeft = iconRect.left - 330;
                            if (logLeft < 10) {
                                logLeft = iconRect.right + 10;
                            }
                            logPanel.style.left = logLeft + 'px';
                            logPanel.style.top = Math.max(10, iconRect.top - 100) + 'px';
                        }
                    }
                    return;
                }

                if (btn.classList.contains('loading')) return;

                btn.classList.add('loading');
                const originalContent = btn.innerHTML;
                btn.innerHTML = '⏳';

                const result = await scriptState.withLock(async () => {
                    try {
                        const result = await action.execute();
                        addLog(action.name, result);
                        console.log(`[AIHelp工具] ${action.name}:`, result);
                        return result;
                    } catch (error) {
                        addLog(action.name, { success: false, message: error.message });
                        console.error(`[AIHelp工具] ${action.name} 失败:`, error);
                        return { success: false, message: error.message };
                    }
                });

                btn.classList.remove('loading');
                if (result && result.success) {
                    btn.classList.add('success');
                    setTimeout(() => {
                        btn.classList.remove('success');
                    }, 1500);
                }
                btn.innerHTML = originalContent;
            });

            grid.appendChild(btn);
        });

        panel.appendChild(grid);
        document.body.appendChild(panel);

        return panel;
    }

    // ==================== 创建日志面板 ====================
    function createLogPanel() {
        if (document.getElementById(LOG_PANEL_ID)) return;

        const panel = document.createElement('div');
        panel.id = LOG_PANEL_ID;
        panel.innerHTML = `
            <div class="log-header">
                <h3>操作日志</h3>
                <button class="close-btn">×</button>
            </div>
            <div class="log-content">
                <div class="log-empty">暂无日志记录</div>
            </div>
            <div class="ai-resize-handle"></div>
        `;

        panel.querySelector('.close-btn').addEventListener('click', () => {
            panel.classList.remove('visible');
        });

        document.body.appendChild(panel);

        ToolUtil.loadPosition(STORAGE_KEYS.LOG_PANEL_POSITION, panel);

        const savedSize = ToolUtil.loadSize(STORAGE_KEYS.LOG_PANEL_SIZE, panel);
        if (!savedSize) {
            panel.style.width = LOG_CONFIG.defaultLogPanelSize.width + 'px';
            panel.style.height = LOG_CONFIG.defaultLogPanelSize.height + 'px';
        }

        const header = panel.querySelector('.log-header');
        let isDragging = false;
        let startX, startY, startLeft, startTop;

        header.addEventListener('mousedown', (e) => {
            if (e.target.closest('.close-btn')) return;

            isDragging = false;
            startX = e.clientX;
            startY = e.clientY;
            const rect = panel.getBoundingClientRect();
            startLeft = rect.left;
            startTop = rect.top;

            const onMove = (ev) => {
                const dx = ev.clientX - startX;
                const dy = ev.clientY - startY;

                if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
                    isDragging = true;

                    let newLeft = startLeft + dx;
                    let newTop = startTop + dy;

                    newLeft = Math.max(0, Math.min(newLeft, window.innerWidth - panel.offsetWidth));
                    newTop = Math.max(0, Math.min(newTop, window.innerHeight - panel.offsetHeight));

                    panel.style.left = newLeft + 'px';
                    panel.style.top = newTop + 'px';
                    panel.style.right = 'auto';
                    panel.style.bottom = 'auto';
                }
            };

            const onUp = () => {
                document.removeEventListener('mousemove', onMove);
                document.removeEventListener('mouseup', onUp);

                if (isDragging) {
                    ToolUtil.savePosition(STORAGE_KEYS.LOG_PANEL_POSITION, panel);
                }
            };

            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', onUp);
        });

        const resizeHandle = panel.querySelector('.ai-resize-handle');
        let isResizing = false;
        let resizeStartX, resizeStartY, resizeStartWidth, resizeStartHeight;

        resizeHandle.addEventListener('mousedown', (e) => {
            e.preventDefault();
            e.stopPropagation();

            isResizing = true;
            resizeStartX = e.clientX;
            resizeStartY = e.clientY;
            const rect = panel.getBoundingClientRect();
            resizeStartWidth = rect.width;
            resizeStartHeight = rect.height;

            const onResizeMove = (ev) => {
                if (!isResizing) return;

                const dx = ev.clientX - resizeStartX;
                const dy = ev.clientY - resizeStartY;

                let newWidth = resizeStartWidth + dx;
                let newHeight = resizeStartHeight + dy;

                newWidth = Math.max(LOG_CONFIG.minLogPanelSize.width, newWidth);
                newHeight = Math.max(LOG_CONFIG.minLogPanelSize.height, newHeight);

                newWidth = Math.min(newWidth, window.innerWidth - 50);
                newHeight = Math.min(newHeight, window.innerHeight - 50);

                panel.style.width = newWidth + 'px';
                panel.style.height = newHeight + 'px';
            };

            const onResizeUp = () => {
                document.removeEventListener('mousemove', onResizeMove);
                document.removeEventListener('mouseup', onResizeUp);

                if (isResizing) {
                    ToolUtil.saveSize(STORAGE_KEYS.LOG_PANEL_SIZE, panel);
                    ToolUtil.savePosition(STORAGE_KEYS.LOG_PANEL_POSITION, panel);
                }

                isResizing = false;
            };

            document.addEventListener('mousemove', onResizeMove);
            document.addEventListener('mouseup', onResizeUp);
        });

        startLogCleanupTimer();
    }

    // ==================== 路由变化监听 ====================
    function executeToolbarAction(action) {
        return scriptState.withLock(async () => {
            try {
                const result = await action.execute();
                addLog(action.name, result);
                return result;
            } catch (error) {
                addLog(action.name, { success: false, message: error.message });
                return { success: false, message: error.message };
            }
        });
    }

    function createActionButtons(container) {
        const grid = document.createElement('div');
        grid.className = 'aihelp-zone-grid';

        actions.forEach((action) => {
            const btn = document.createElement('div');
            btn.className = 'aihelp-zone-btn';
            btn.innerHTML = action.icon;

            btn.addEventListener('mouseenter', () => {
                const rect = btn.getBoundingClientRect();
                TipManager.showShortTip(btn, action, { left: rect.right + 10, top: rect.top });
            });

            btn.addEventListener('mouseleave', () => {
                TipManager.hideTip();
            });

            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                if (btn.classList.contains('loading')) return;

                btn.classList.add('loading');
                const originalContent = btn.innerHTML;
                btn.innerHTML = '...';

                const result = await executeToolbarAction(action);

                btn.classList.remove('loading');
                if (result && result.success) {
                    btn.classList.add('success');
                    setTimeout(() => btn.classList.remove('success'), 1500);
                }
                btn.innerHTML = originalContent;
            });

            grid.appendChild(btn);
        });

        container.innerHTML = '';
        container.appendChild(grid);
    }

    function hideUnifiedPanel() {
        const panel = document.getElementById(LOG_PANEL_ID);
        const icon = document.getElementById(FLOAT_ICON_ID);
        if (panel) panel.classList.remove('visible');
        if (icon) icon.style.display = 'flex';
    }

    function showUnifiedPanel(icon) {
        const panel = document.getElementById(LOG_PANEL_ID) || createLogPanel();
        panel.classList.add('visible');
        icon.style.display = 'none';

        if (!panel.dataset.positionInitialized) {
            updatePanelPosition(icon, panel);
            panel.dataset.positionInitialized = '1';
            ToolUtil.savePosition(STORAGE_KEYS.LOG_PANEL_POSITION, panel);
        }

        return panel;
    }

    function createFloatIcon() {
        if (document.getElementById(FLOAT_ICON_ID)) return;

        const icon = document.createElement('div');
        icon.id = FLOAT_ICON_ID;
        icon.innerHTML = '+';

        document.body.appendChild(icon);

        const hasPosition = ToolUtil.loadPosition(STORAGE_KEYS.FLOAT_ICON_POSITION, icon);
        if (!hasPosition) {
            icon.style.top = '120px';
            icon.style.right = '20px';
        }

        let isDragging = false;
        let startX, startY, startLeft, startTop;

        icon.addEventListener('mousedown', (e) => {
            isDragging = false;
            startX = e.clientX;
            startY = e.clientY;
            const rect = icon.getBoundingClientRect();
            startLeft = rect.left;
            startTop = rect.top;

            const onMove = (ev) => {
                const dx = ev.clientX - startX;
                const dy = ev.clientY - startY;

                if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
                    isDragging = true;
                    let newLeft = startLeft + dx;
                    let newTop = startTop + dy;

                    newLeft = Math.max(0, Math.min(newLeft, window.innerWidth - icon.offsetWidth));
                    newTop = Math.max(0, Math.min(newTop, window.innerHeight - icon.offsetHeight));

                    icon.style.left = newLeft + 'px';
                    icon.style.top = newTop + 'px';
                    icon.style.right = 'auto';
                    icon.style.bottom = 'auto';
                }
            };

            const onUp = () => {
                document.removeEventListener('mousemove', onMove);
                document.removeEventListener('mouseup', onUp);

                if (isDragging) {
                    ToolUtil.savePosition(STORAGE_KEYS.FLOAT_ICON_POSITION, icon);
                }
            };

            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', onUp);
        });

        icon.addEventListener('click', () => {
            if (isDragging) return;
            showUnifiedPanel(icon);
        });
    }

    function updatePanelPosition(icon, panel) {
        const iconRect = icon.getBoundingClientRect();
        const panelWidth = panel.offsetWidth || LOG_CONFIG.defaultLogPanelSize.width;
        const panelHeight = panel.offsetHeight || LOG_CONFIG.defaultLogPanelSize.height;

        let left = iconRect.left - panelWidth - 10;
        let top = iconRect.top + (iconRect.height / 2) - (panelHeight / 2);

        if (left < 10) {
            left = iconRect.right + 10;
        }
        if (top < 10) {
            top = 10;
        }
        if (top + panelHeight > window.innerHeight - 10) {
            top = window.innerHeight - panelHeight - 10;
        }

        panel.style.left = left + 'px';
        panel.style.top = top + 'px';
        panel.style.right = 'auto';
        panel.style.bottom = 'auto';
    }

    function createLogPanel() {
        const existing = document.getElementById(LOG_PANEL_ID);
        if (existing) return existing;

        const panel = document.createElement('div');
        panel.id = LOG_PANEL_ID;
        panel.innerHTML = `
            <div class="log-header">
                <h3>批量处理与日志</h3>
                <button class="close-btn">×</button>
            </div>
            <div class="tool-actions"></div>
            <div class="log-content">
                <div class="log-empty">暂无日志记录</div>
            </div>
            <div class="ai-resize-handle"></div>
        `;

        panel.querySelector('.close-btn').addEventListener('click', () => {
            hideUnifiedPanel();
        });

        createActionButtons(panel.querySelector('.tool-actions'));
        document.body.appendChild(panel);

        const hasSavedPosition = ToolUtil.loadPosition(STORAGE_KEYS.LOG_PANEL_POSITION, panel);
        panel.dataset.positionInitialized = hasSavedPosition ? '1' : '';

        const savedSize = ToolUtil.loadSize(STORAGE_KEYS.LOG_PANEL_SIZE, panel);
        if (!savedSize) {
            panel.style.width = LOG_CONFIG.defaultLogPanelSize.width + 'px';
            panel.style.height = LOG_CONFIG.defaultLogPanelSize.height + 'px';
        }

        const header = panel.querySelector('.log-header');
        let isDragging = false;
        let startX, startY, startLeft, startTop;

        header.addEventListener('mousedown', (e) => {
            if (e.target.closest('.close-btn')) return;
            isDragging = false;
            startX = e.clientX;
            startY = e.clientY;
            const rect = panel.getBoundingClientRect();
            startLeft = rect.left;
            startTop = rect.top;

            const onMove = (ev) => {
                const dx = ev.clientX - startX;
                const dy = ev.clientY - startY;

                if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
                    isDragging = true;
                    let newLeft = startLeft + dx;
                    let newTop = startTop + dy;

                    newLeft = Math.max(0, Math.min(newLeft, window.innerWidth - panel.offsetWidth));
                    newTop = Math.max(0, Math.min(newTop, window.innerHeight - panel.offsetHeight));

                    panel.style.left = newLeft + 'px';
                    panel.style.top = newTop + 'px';
                    panel.style.right = 'auto';
                    panel.style.bottom = 'auto';
                }
            };

            const onUp = () => {
                document.removeEventListener('mousemove', onMove);
                document.removeEventListener('mouseup', onUp);
                if (isDragging) {
                    ToolUtil.savePosition(STORAGE_KEYS.LOG_PANEL_POSITION, panel);
                }
            };

            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', onUp);
        });

        const resizeHandle = panel.querySelector('.ai-resize-handle');
        let isResizing = false;
        let resizeStartX, resizeStartY, resizeStartWidth, resizeStartHeight;

        resizeHandle.addEventListener('mousedown', (e) => {
            e.preventDefault();
            e.stopPropagation();
            isResizing = true;
            resizeStartX = e.clientX;
            resizeStartY = e.clientY;
            const rect = panel.getBoundingClientRect();
            resizeStartWidth = rect.width;
            resizeStartHeight = rect.height;

            const onResizeMove = (ev) => {
                if (!isResizing) return;
                const dx = ev.clientX - resizeStartX;
                const dy = ev.clientY - resizeStartY;
                let newWidth = resizeStartWidth + dx;
                let newHeight = resizeStartHeight + dy;

                newWidth = Math.max(LOG_CONFIG.minLogPanelSize.width, newWidth);
                newHeight = Math.max(LOG_CONFIG.minLogPanelSize.height, newHeight);
                newWidth = Math.min(newWidth, window.innerWidth - 50);
                newHeight = Math.min(newHeight, window.innerHeight - 50);

                panel.style.width = newWidth + 'px';
                panel.style.height = newHeight + 'px';
            };

            const onResizeUp = () => {
                document.removeEventListener('mousemove', onResizeMove);
                document.removeEventListener('mouseup', onResizeUp);
                if (isResizing) {
                    ToolUtil.saveSize(STORAGE_KEYS.LOG_PANEL_SIZE, panel);
                    ToolUtil.savePosition(STORAGE_KEYS.LOG_PANEL_POSITION, panel);
                }
                isResizing = false;
            };

            document.addEventListener('mousemove', onResizeMove);
            document.addEventListener('mouseup', onResizeUp);
        });

        startLogCleanupTimer();
        return panel;
    }

    function monitorRouteChange() {
        let lastUrl = window.location.href;

        setInterval(() => {
            const newUrl = window.location.href;
            if (newUrl !== lastUrl) {
                lastUrl = newUrl;
                console.log('[AIHelp工单工具] 路由变化:', newUrl);

                if (newUrl.includes('ticket')) {
                    console.log('[AIHelp工单工具] 路由包含ticket，移除UI');
                    const icon = document.getElementById(FLOAT_ICON_ID);
                    const panel = document.getElementById(FLOAT_PANEL_ID);
                    const logPanel = document.getElementById(LOG_PANEL_ID);
                    if (icon) icon.remove();
                    if (panel) panel.remove();
                    if (logPanel) logPanel.remove();
                } else if (newUrl.includes('tasks?searchType')) {
                    console.log('[AIHelp工单工具] 路由包含tasks，确保UI存在');
                    if (!document.getElementById(FLOAT_ICON_ID)) {
                        createFloatIcon();
                        createLogPanel();
                    }
                }
            }
        }, 500);
    }

    // ==================== 初始化 ====================
    function init() {
        createStyles();
        createFloatIcon();
        createLogPanel();
        monitorRouteChange();
        console.log('[AIHelp工单工具] 已加载 v3.6.0 - 点击悬浮图标展开批量处理与日志面板');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();

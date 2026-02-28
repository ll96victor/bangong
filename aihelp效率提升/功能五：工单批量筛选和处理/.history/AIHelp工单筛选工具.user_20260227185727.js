// ==UserScript==
// @name         AIHelp工单批量筛选与处理工具
// @namespace    http://tampermonkey.net/
// @version      3.0.1
// @description  AIHelp工单批量筛选与批量处理工具，提供一键快捷操作
// @author       YourName
// @match        https://ml-panel.aihelp.net/dashboard/*
// @exclude      *://*/ticket*
// @grant        none
// @run-at       document-end
// ==/UserScript==

(function() {
    'use strict';

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

    // ==================== 全局状态锁 ====================
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
                                await this.sleep(300);
                            }
                            el.click();
                            console.log(`[AIHelp工单工具] 已点击元素`);
                            await this.sleep(300);
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
            await this.sleep(500);
            
            // 方案1：查找弹窗内的筛选按钮（根据用户提供的HTML，是button内的span）
            const dialogs = document.querySelectorAll('.el-dialog__wrapper, .el-drawer__wrapper, .el-dialog, .el-drawer');
            console.log('[AIHelp工单工具] 找到弹窗数量:', dialogs.length);
            
            for (const dialog of dialogs) {
                const style = window.getComputedStyle(dialog);
                if (style.display === 'none' || style.visibility === 'hidden') {
                    console.log('[AIHelp工单工具] 弹窗不可见，跳过');
                    continue;
                }
                
                // 查找弹窗内的所有button
                const buttons = dialog.querySelectorAll('button');
                console.log('[AIHelp工单工具] 弹窗内按钮数量:', buttons.length);
                
                for (const btn of buttons) {
                    const text = btn.textContent.trim();
                    console.log('[AIHelp工单工具] 检查按钮:', text, 'class:', btn.className);
                    if (text === '筛选') {
                        console.log('[AIHelp工单工具] 找到筛选按钮，准备点击');
                        btn.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        await this.sleep(300);
                        btn.click();
                        console.log('[AIHelp工单工具] ✅ 已点击弹窗筛选按钮');
                        await this.sleep(500);
                        return btn;
                    }
                }
                
                // 也查找span元素
                const spans = dialog.querySelectorAll('span');
                for (const span of spans) {
                    if (span.textContent.trim() === '筛选' && span.closest('button')) {
                        const btn = span.closest('button');
                        console.log('[AIHelp工单工具] 通过span找到筛选按钮');
                        btn.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        await this.sleep(300);
                        btn.click();
                        console.log('[AIHelp工单工具] ✅ 已点击筛选按钮(span定位)');
                        await this.sleep(500);
                        return btn;
                    }
                }
            }
            
            // 方案2：查找所有可见的筛选按钮，选择最下方的
            const allButtons = document.querySelectorAll('button');
            const visibleFilterBtns = [];
            
            for (const btn of allButtons) {
                const text = btn.textContent.trim();
                if (text === '筛选') {
                    const rect = btn.getBoundingClientRect();
                    console.log('[AIHelp工单工具] 筛选按钮位置:', rect.top, rect.left, rect.width, rect.height);
                    if (rect.width > 0 && rect.height > 0 && rect.top > 0) {
                        visibleFilterBtns.push({ btn, rect });
                    }
                }
            }
            
            console.log('[AIHelp工单工具] 可见筛选按钮数量:', visibleFilterBtns.length);
            
            if (visibleFilterBtns.length > 0) {
                visibleFilterBtns.sort((a, b) => b.rect.top - a.rect.top);
                const targetBtn = visibleFilterBtns[0].btn;
                console.log('[AIHelp工单工具] 选择最下方的筛选按钮，位置:', visibleFilterBtns[0].rect);
                targetBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
                await this.sleep(300);
                targetBtn.click();
                console.log('[AIHelp工单工具] ✅ 已点击筛选按钮(位置最下方)');
                await this.sleep(500);
                return targetBtn;
            }
            
            throw new Error('未找到筛选按钮');
        }
    };

    // ==================== 功能模块 ====================
    const ActionA = {
        name: '筛选BUG标签',
        icon: '🐛',
        shortTip: '筛选AI识别为BUG的工单',
        detailTip: '筛选包含"AI识别为BUG bug identified by ai"标签的工单',
        async execute() {
            console.log('=== 开始执行筛选BUG标签 ===');
            
            // Step 1: 点击筛选按钮
            console.log('Step 1: 点击筛选按钮');
            const filterBtns = document.querySelectorAll('button');
            for (const btn of filterBtns) {
                if (btn.textContent.includes('筛选') && btn.querySelector('i.el-icon-search')) {
                    btn.click();
                    break;
                }
            }
            await ToolUtil.sleep(800);

            // Step 2: 点击重置按钮
            console.log('Step 2: 点击重置按钮');
            const resetBtns = document.querySelectorAll('button');
            for (const btn of resetBtns) {
                if (btn.textContent.trim() === '重置') {
                    btn.click();
                    break;
                }
            }
            await ToolUtil.sleep(500);

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

            // Step 4: 查找所有标签输入框并打印信息
            console.log('Step 4: 查找标签输入框');
            const allInputs = document.querySelectorAll('input[placeholder="请选择标签"]');
            console.log('找到标签输入框数量:', allInputs.length);
            
            let targetInput = null;
            
            for (let i = 0; i < allInputs.length; i++) {
                const input = allInputs[i];
                const rect = input.getBoundingClientRect();
                
                // 查找附近的标签文字
                let labelText = '';
                let parent = input.closest('.el-form-item');
                if (parent) {
                    const labelEl = parent.querySelector('.el-form-item__label');
                    if (labelEl) {
                        labelText = labelEl.textContent.trim();
                    }
                }
                
                console.log(`输入框${i}: top=${rect.top}, label="${labelText}"`);
                
                // 精确匹配"包含其中任一标签"，排除"不包含其中任一标签"
                if (labelText.includes('包含其中任一标签') && !labelText.includes('不包含')) {
                    targetInput = input;
                    console.log(`  -> 选择此输入框 (匹配"包含其中任一标签")`);
                    break; // 找到就退出，不再继续
                }
            }

            if (!targetInput) {
                throw new Error('未找到"包含其中任一标签"输入框');
            }
            
            console.log('最终选择的输入框位置:', targetInput.getBoundingClientRect().top);

            // Step 5: 点击输入框并输入
            console.log('Step 5: 点击输入框');
            targetInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
            await ToolUtil.sleep(300);
            
            // 先聚焦到输入框
            targetInput.focus();
            await ToolUtil.sleep(200);
            targetInput.click();
            console.log('已点击目标输入框');
            await ToolUtil.sleep(500);

            // Step 6: 直接在目标输入框输入（不使用搜索框）
            console.log('Step 6: 在目标输入框输入');
            
            // 使用原生setter直接设置值
            const nativeSetter = Object.getOwnPropertyDescriptor(
                window.HTMLInputElement.prototype, 'value'
            ).set;
            nativeSetter.call(targetInput, 'AI识别为BUG bug identified by ai');
            targetInput.dispatchEvent(new Event('input', { bubbles: true }));
            targetInput.dispatchEvent(new Event('change', { bubbles: true }));
            console.log('已在目标输入框输入');
            await ToolUtil.sleep(800);

            // Step 7: 点击下拉选项
            console.log('Step 7: 点击下拉选项');
            
            // 查找包含目标文字的下拉选项
            const listItems = document.querySelectorAll('li.elp-cascader-node, li');
            console.log('找到下拉选项数量:', listItems.length);
            
            let foundOption = null;
            for (const li of listItems) {
                const text = li.textContent || '';
                const rect = li.getBoundingClientRect();
                // 只检查可见的选项
                if (rect.width > 0 && rect.height > 0) {
                    console.log('下拉选项:', text.substring(0, 30).trim());
                    if (text.includes('AI识别为BUG') || text.includes('bug identified by ai')) {
                        foundOption = li;
                    }
                }
            }
            
            if (foundOption) {
                // 先确保焦点还在目标输入框上
                targetInput.focus();
                await ToolUtil.sleep(100);
                foundOption.click();
                console.log('已点击下拉选项');
            } else {
                console.log('未找到下拉选项');
            }
            await ToolUtil.sleep(500);

            // Step 8: 点击筛选按钮
            console.log('Step 8: 点击筛选按钮');
            await ToolUtil.clickFilterButton();
            await ToolUtil.sleep(500);

            console.log('=== 筛选BUG标签完成 ===');
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
        detailTip: '将选中工单状态改为"= QA"并发送"15 ProjectCreated.mail"奖励邮件',
        async execute() {
            console.log('=== 开始执行批量处理 ===');
            
            // Step 1: 全选工单
            console.log('Step 1: 全选工单');
            await ToolUtil.clickElement('span.el-checkbox__inner');
            await ToolUtil.sleep(800);

            // Step 2: 点击编辑按钮
            console.log('Step 2: 点击编辑按钮');
            await ToolUtil.clickByText(['button', 'span'], '编辑');
            await ToolUtil.sleep(1500); // 等待弹窗完全加载（UI有变化）

            // Step 3: 等待弹窗稳定后，查找工单状态输入框
            console.log('Step 3: 查找工单状态输入框');
            
            // 等待输入框出现并稳定
            let statusInput = null;
            for (let i = 0; i < 10; i++) {
                statusInput = document.querySelector('input[placeholder="请输入工单状态"]');
                if (statusInput) {
                    const rect = statusInput.getBoundingClientRect();
                    // 确保输入框位置稳定（宽高大于0）
                    if (rect.width > 0 && rect.height > 0) {
                        console.log('找到工单状态输入框，位置:', rect.top, rect.left);
                        break;
                    }
                }
                await ToolUtil.sleep(200);
            }

            // Step 4: 点击工单状态输入框
            console.log('Step 4: 点击工单状态输入框');
            if (statusInput) {
                statusInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
                await ToolUtil.sleep(300);
                statusInput.click();
                console.log('已点击工单状态输入框');
            } else {
                throw new Error('未找到工单状态输入框');
            }
            await ToolUtil.sleep(800); // 等待搜索框出现

            // Step 5: 在搜索框输入"= QA"并选择
            console.log('Step 5: 在搜索框输入"= QA"');
            const searchInput = document.querySelector('input[placeholder="搜索"]');
            console.log('搜索框是否存在:', !!searchInput);
            
            if (searchInput) {
                // 聚焦搜索框
                searchInput.focus();
                await ToolUtil.sleep(200);
                
                // 输入"= QA"
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
            await ToolUtil.sleep(800); // 等待下拉列表过滤

            // 点击下拉选项"= QA"
            console.log('Step 5.1: 点击下拉选项"= QA"');
            const statusOptions = document.querySelectorAll('li');
            let foundQA = false;
            for (const li of statusOptions) {
                const text = li.textContent.trim();
                const rect = li.getBoundingClientRect();
                // 只点击可见的选项
                if (rect.width > 0 && rect.height > 0 && text.includes('= QA')) {
                    console.log('找到"= QA"选项，准备点击');
                    li.click();
                    foundQA = true;
                    console.log('已选择"= QA"');
                    break;
                }
            }
            if (!foundQA) {
                console.log('未找到"= QA"选项');
            }
            await ToolUtil.sleep(500);

            // Step 6: 再次滚动，确保"发送奖励"可见
            console.log('Step 6: 再次滚动弹窗');
            for (const container of scrollContainers) {
                if (container.scrollHeight > container.clientHeight) {
                    container.scrollTop = container.scrollHeight;
                    await ToolUtil.sleep(200);
                }
            }
            await ToolUtil.sleep(500);

            // Step 7: 点击发送奖励输入框
            console.log('Step 7: 点击发送奖励输入框');
            const rewardInputs = document.querySelectorAll('input[placeholder="请选择"]');
            console.log('找到"请选择"输入框数量:', rewardInputs.length);
            
            let rewardInput = null;
            for (const input of rewardInputs) {
                const rect = input.getBoundingClientRect();
                // 查找可见的输入框
                if (rect.width > 0 && rect.height > 0) {
                    // 查找附近的标签文字
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
                // 备选：选择最后一个可见的
                for (const input of rewardInputs) {
                    const rect = input.getBoundingClientRect();
                    if (rect.width > 0 && rect.height > 0) {
                        rewardInput = input;
                    }
                }
            }
            
            if (rewardInput) {
                rewardInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
                await ToolUtil.sleep(300);
                rewardInput.click();
                console.log('已点击发送奖励输入框');
            } else {
                throw new Error('未找到发送奖励输入框');
            }
            await ToolUtil.sleep(800);

            // Step 8: 查找并点击"15 ProjectCreated.mail"
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
                await ToolUtil.sleep(500);
                mailItem.click();
                console.log('已点击邮件选项');
            } else {
                throw new Error('未找到邮件选项: 15 ProjectCreated.mail');
            }
            await ToolUtil.sleep(500);

            // Step 9: 点击提交按钮
            console.log('Step 9: 点击提交按钮');
            await ToolUtil.clickByText(['span', 'button'], '提交', { needScroll: true });
            await ToolUtil.sleep(500);

            console.log('=== 批量处理完成 ===');
            return { success: true, message: '批量处理完成' };
        }
    };

    const ActionLog = {
        name: '日志',
        icon: '📋',
        shortTip: '查看操作日志',
        detailTip: '显示所有筛选和批量操作的执行记录'
    };

    const actions = [ActionA, ActionB, ActionC, ActionD, ActionE, ActionLog];
    const logs = [];

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
            }, 2000);
        },

        showDetailTip(element, action, position) {
            if (this.currentTip) {
                this.currentTip.remove();
            }

            const tip = document.createElement('div');
            tip.className = 'aihelp-detail-tip';
            tip.innerHTML = `
                <div class="tip-title">${action.shortTip}</div>
                <div class="tip-desc">${action.detailTip}</div>
            `;
            tip.style.cssText = `
                position: fixed;
                left: ${position.left}px;
                top: ${position.top}px;
                background: rgba(0, 0, 0, 0.9);
                color: white;
                padding: 10px 14px;
                border-radius: 6px;
                font-size: 12px;
                z-index: 1000001;
                pointer-events: none;
                box-shadow: 0 4px 12px rgba(0,0,0,0.3);
                max-width: 250px;
            `;
            tip.querySelector('.tip-title').style.cssText = 'font-weight: bold; margin-bottom: 4px;';
            tip.querySelector('.tip-desc').style.cssText = 'color: #ccc; font-size: 11px; line-height: 1.4;';
            document.body.appendChild(tip);
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
    function addLog(actionName, result) {
        const timestamp = new Date().toLocaleTimeString();
        logs.unshift({ time: timestamp, action: actionName, result });
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

        content.innerHTML = logs.map(log => `
            <div class="log-item">
                <div class="log-time">${log.time}</div>
                <div class="log-action">${log.action}</div>
                <div class="log-result ${log.result.success ? '' : 'error'}">${log.result.message}</div>
            </div>
        `).join('');
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
                width: 132px;
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
                grid-template-columns: repeat(3, 1fr);
                grid-template-rows: repeat(2, 1fr);
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
                width: 320px;
                max-height: 350px;
                background: white;
                border-radius: 8px;
                box-shadow: 0 4px 20px rgba(0,0,0,0.15);
                z-index: 999998;
                display: none;
                overflow: hidden;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                resize: both;
                min-width: 250px;
                min-height: 180px;
            }

            #${LOG_PANEL_ID}.visible {
                display: block;
            }

            #${LOG_PANEL_ID} .log-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 10px 12px;
                background: #f5f5f5;
                border-bottom: 1px solid #eee;
                cursor: move;
            }

            #${LOG_PANEL_ID} .log-header h3 {
                margin: 0;
                font-size: 13px;
                color: #333;
            }

            #${LOG_PANEL_ID} .log-header .close-btn {
                background: none;
                border: none;
                font-size: 16px;
                cursor: pointer;
                color: #999;
                line-height: 1;
            }

            #${LOG_PANEL_ID} .log-content {
                max-height: calc(100% - 40px);
                overflow-y: auto;
                padding: 8px;
            }

            #${LOG_PANEL_ID} .log-item {
                padding: 6px 8px;
                margin-bottom: 6px;
                background: #f9f9f9;
                border-radius: 4px;
                font-size: 11px;
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
                color: #67c23a;
            }

            #${LOG_PANEL_ID} .log-item .log-result.error {
                color: #f56c6c;
            }

            #${LOG_PANEL_ID} .log-empty {
                text-align: center;
                color: #999;
                padding: 20px;
                font-size: 12px;
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
        const panelWidth = 132;
        const panelHeight = 100;

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

                if (index === 5) {
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
        `;

        panel.querySelector('.close-btn').addEventListener('click', () => {
            panel.classList.remove('visible');
        });

        document.body.appendChild(panel);

        ToolUtil.loadPosition(STORAGE_KEYS.LOG_PANEL_POSITION, panel);
        ToolUtil.loadSize(STORAGE_KEYS.LOG_PANEL_SIZE, panel);

        const header = panel.querySelector('.log-header');
        let isDragging = false;
        let startX, startY, startLeft, startTop;

        header.addEventListener('mousedown', (e) => {
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

        let resizeTimeout;
        const resizeObserver = new ResizeObserver(() => {
            clearTimeout(resizeTimeout);
            resizeTimeout = setTimeout(() => {
                ToolUtil.saveSize(STORAGE_KEYS.LOG_PANEL_SIZE, panel);
            }, 300);
        });
        resizeObserver.observe(panel);
    }

    // ==================== 路由变化监听 ====================
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
        console.log('[AIHelp工单工具] 已加载 - 点击悬浮图标执行筛选或批量操作');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();

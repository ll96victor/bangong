// ==UserScript==
// @name         标题替换v2.6
// @namespace    http://tampermonkey.net/
// @version      2.6
// @description  修复列表页不生效问题，支持无工单ID场景
// @author       ll96victor
// @match        https://ml-panel.aihelp.net/dashboard/*
// @match        https://ml.aihelp.net/dashboard/*
// @match        https://aihelp.net.cn/dashboard/*
// @match        https://aihelp.net/dashboard/*
// @exclude      *://*/dashboard/#/newpage-ticket*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // ==================== 用户配置区 ====================
    const CONFIG = {
        fullserver: "【2.1.40全服】：",
        testserver: "【40.2测服】：",
        debug: true,
        maxWaitTime: 3000,
        debounceDelay: 300
    };

    // ==================== 全局变量 ====================
    let currentOrderId = null;
    let isProcessing = false;
    let clickEventListener = null;
    let orderIdObserver = null;
    let processedInputs = new WeakSet();
    let processingTimeout = null;

    // ==================== 调试工具 ====================
    function log(...args) {
        if (CONFIG.debug) console.log('🔧 [工单脚本]', ...args);
    }
    function error(...args) {
        console.error('❌ [工单脚本]', ...args);
    }
    function warn(...args) {
        console.warn('⚠️ [工单脚本]', ...args);
    }

    // ==================== 核心工具函数 ====================

    /**
     * 检查元素是否可见
     */
    function isElementVisible(el) {
        if (!el) return false;
        try {
            const style = window.getComputedStyle(el);
            return style.display !== 'none' &&
                   style.visibility !== 'hidden' &&
                   style.opacity !== '0' &&
                   el.offsetParent !== null;
        } catch (e) {
            return false;
        }
    }

    /**
     * 查找输入框元素
     */
    function findInputElement(titleElement) {
        if (titleElement.tagName === 'LABEL') {
            const forAttr = titleElement.getAttribute('for');
            if (forAttr) {
                const input = document.getElementById(forAttr);
                if (input && (input.tagName === 'INPUT' || input.tagName === 'TEXTAREA')) {
                    return input;
                }
            }
        }

        let parent = titleElement.parentElement;
        for (let i = 0; i < 5 && parent; i++) {
            const inputs = parent.querySelectorAll('input, textarea');
            for (const input of inputs) {
                if (isElementVisible(input)) {
                    return input;
                }
            }
            parent = parent.parentElement;
        }

        let sibling = titleElement.nextElementSibling;
        while (sibling) {
            if (sibling.tagName === 'INPUT' || sibling.tagName === 'TEXTAREA') {
                if (isElementVisible(sibling)) {
                    return sibling;
                }
            }
            if (sibling.tagName === 'DIV') {
                const innerInput = sibling.querySelector('input, textarea');
                if (innerInput && isElementVisible(innerInput)) {
                    return innerInput;
                }
            }
            sibling = sibling.nextElementSibling;
        }

        return null;
    }

    /**
     * 查找任务标题元素
     */
    function findTaskTitleElement() {
        const walker = document.createTreeWalker(
            document.body,
            NodeFilter.SHOW_TEXT,
            null,
            false
        );

        let node;
        while (node = walker.nextNode()) {
            if (node.textContent.includes('任务标题')) {
                const parent = node.parentElement;
                if (isElementVisible(parent)) {
                    return parent;
                }
            }
        }
        return null;
    }

    /**
     * 查找任务标题输入框
     */
    function findTaskTitleInput() {
        const titleElement = findTaskTitleElement();
        if (!titleElement) return null;
        return findInputElement(titleElement);
    }

    /**
     * 查找描述内容
     */
    function findDescriptionContent() {
        const walker = document.createTreeWalker(
            document.body,
            NodeFilter.SHOW_TEXT,
            null,
            false
        );

        let node;
        while (node = walker.nextNode()) {
            if (node.textContent.includes('内部描述') || node.textContent.includes('ServerID')) {
                const parent = node.parentElement;
                if (parent && isElementVisible(parent)) {
                    const container = parent.closest('.el-form-item, div[class*="content"], td, .cell');
                    if (container) {
                        const text = container.textContent || '';
                        if (text.includes('ServerID') && text.length < 2000) {
                            return text;
                        }
                    }

                    const text = parent.textContent || '';
                    if (text.length < 1000) {
                        return text;
                    }
                }
            }
        }

        const bodyText = document.body.innerText || '';
        if (bodyText.includes('ServerID')) {
            const index = bodyText.indexOf('ServerID');
            const snippet = bodyText.substring(Math.max(0, index - 100), Math.min(bodyText.length, index + 200));
            return snippet;
        }
        return '';
    }

    /**
     * 检查URL是否匹配生效条件
     */
    function shouldScriptRun() {
        const url = window.location.href;
        if (url.includes('/newpage-ticket')) return false;
        if (url.includes('/newpage-task') || url.includes('/manual/tasks')) return true;
        return false;
    }

    /**
     * 获取当前工单ID
     */
    function getCurrentOrderId() {
        const url = window.location.href;
        const match = url.match(/orderCode=(\d{12,16})/);
        if (match) {
            log('从URL提取到工单ID:', match[1]);
            return match[1];
        }

        // 列表页尝试从行数据获取（如果有）
        const activeRow = document.querySelector('.el-table__row.current-row, .el-table__row:hover');
        if (activeRow) {
            const orderCell = activeRow.querySelector('td:nth-child(2), td:nth-child(3)');
            if (orderCell) {
                const text = orderCell.textContent || '';
                const match = text.match(/(\d{12,16})/);
                if (match) {
                    log('从列表行提取到工单ID:', match[1]);
                    return match[1];
                }
            }
        }

        return null;
    }

    /**
     * 清理处理状态（保留监听器）
     */
    function cleanupProcessingState() {
        log('清理处理状态');
        isProcessing = false;
        processedInputs = new WeakSet();
        if (processingTimeout) {
            clearTimeout(processingTimeout);
            processingTimeout = null;
        }
    }

    /**
     * 完全清理（包括监听器）
     */
    function cleanupAll() {
        log('完全清理资源');
        cleanupProcessingState();
        if (clickEventListener) {
            document.body.removeEventListener('click', clickEventListener, true);
            clickEventListener = null;
        }
        if (orderIdObserver) {
            orderIdObserver.disconnect();
            orderIdObserver = null;
        }
        currentOrderId = null;
    }

    /**
     * 从文本中提取ServerID
     */
    function extractServerId(text) {
        const regex = /ServerID\s*[=:：]\s*(\d{4,6})/gi;
        const matches = [];
        let match;
        while ((match = regex.exec(text)) !== null) {
            matches.push({
                fullMatch: match[0],
                value: match[1],
                index: match.index
            });
        }
        log(`找到 ${matches.length} 个ServerID:`, matches.map(m => m.value));
        return matches;
    }

    /**
     * 确定要使用的前缀
     */
    function determineLeftHeading(serverIdValue) {
        if (!serverIdValue || serverIdValue === '0') return null;
        if (serverIdValue.startsWith('57')) {
            log('使用测服前缀:', CONFIG.testserver);
            return CONFIG.testserver;
        } else {
            log('使用全服前缀:', CONFIG.fullserver);
            return CONFIG.fullserver;
        }
    }

    /**
     * 替换任务标题
     */
    function replaceTaskTitle(inputElement, leftheading) {
        try {
            if (processedInputs.has(inputElement)) {
                log('该输入框已在本次会话中处理过，跳过');
                return false;
            }

            const currentValue = inputElement.value || '';
            log('当前任务标题:', currentValue);

            if (!currentValue.trim()) {
                log('任务标题为空，不处理');
                return false;
            }

            if (currentValue.startsWith(leftheading)) {
                log('前缀已正确，无需修改');
                processedInputs.add(inputElement);
                return false;
            }

            if (currentValue.startsWith('【') && currentValue.includes('】：')) {
                const colonIndex = currentValue.indexOf('：');
                if (colonIndex !== -1) {
                    const oldContent = currentValue.substring(colonIndex + 1);
                    const newValue = leftheading + oldContent;
                    inputElement.value = newValue;
                    inputElement.dispatchEvent(new Event('input', { bubbles: true }));
                    inputElement.dispatchEvent(new Event('change', { bubbles: true }));
                    processedInputs.add(inputElement);
                    log('已更新前缀:', newValue);
                    return true;
                }
            }

            const colonIndex = currentValue.search(/[:：]/);
            if (colonIndex === -1) {
                log('任务标题中没有冒号，直接添加前缀');
                const newValue = leftheading + currentValue;
                inputElement.value = newValue;
                inputElement.dispatchEvent(new Event('input', { bubbles: true }));
                inputElement.dispatchEvent(new Event('change', { bubbles: true }));
                processedInputs.add(inputElement);
                return true;
            }

            const beforeColon = currentValue.substring(0, colonIndex);
            if (/mcgg/i.test(beforeColon)) {
                log('冒号前包含MCGG，不处理');
                return false;
            }

            const afterColon = currentValue.substring(colonIndex + 1);
            const newValue = leftheading + afterColon.trim();

            log(`替换:\n原值: ${currentValue}\n新值: ${newValue}`);

            inputElement.value = newValue;
            inputElement.dispatchEvent(new Event('input', { bubbles: true }));
            inputElement.dispatchEvent(new Event('change', { bubbles: true }));
            inputElement.dispatchEvent(new Event('blur', { bubbles: true }));

            processedInputs.add(inputElement);
            log('任务标题替换成功！');
            return true;
        } catch (err) {
            error('替换任务标题时出错:', err);
            return false;
        }
    }

    /**
     * 等待弹窗出现（事件驱动）
     */
    function waitForTaskInput(timeout = CONFIG.maxWaitTime) {
        return new Promise((resolve) => {
            const input = findTaskTitleInput();
            if (input) {
                resolve(input);
                return;
            }

            log('等待弹窗出现...');
            let resolved = false;

            const observer = new MutationObserver(() => {
                if (resolved) return;

                const input = findTaskTitleInput();
                if (input) {
                    resolved = true;
                    observer.disconnect();
                    clearTimeout(timer);
                    resolve(input);
                }
            });

            observer.observe(document.body, {
                childList: true,
                subtree: true
            });

            const timer = setTimeout(() => {
                if (resolved) return;
                resolved = true;
                observer.disconnect();
                warn('等待弹窗超时');
                resolve(null);
            }, timeout);
        });
    }

    /**
     * 主处理流程
     */
    async function mainProcessingFlow() {
        log('===== 开始主处理流程 =====');
        if (isProcessing) {
            log('脚本正在执行中，跳过');
            return;
        }

        isProcessing = true;

        try {
            const taskInput = await waitForTaskInput();

            if (!taskInput) {
                error('未找到任务标题输入框');
                return;
            }

            log('找到任务标题输入框，继续处理');

            if (taskInput.disabled || taskInput.readOnly) {
                log('输入框不可编辑，停止处理');
                return;
            }

            const description = findDescriptionContent();
            if (!description) {
                log('未找到描述内容，停止处理');
                return;
            }

            const serverIds = extractServerId(description);
            if (serverIds.length === 0) {
                log('未找到ServerID，停止处理');
                return;
            }

            if (serverIds.length > 1) {
                log(`找到多个ServerID (${serverIds.length})，停止处理`);
                return;
            }

            const serverIdValue = serverIds[0].value;
            const leftheading = determineLeftHeading(serverIdValue);

            if (!leftheading) {
                log('无法确定前缀，停止处理');
                return;
            }

            replaceTaskTitle(taskInput, leftheading);
            log('===== 处理流程完成 =====');

        } catch (err) {
            error('主处理流程出错:', err);
        } finally {
            isProcessing = false;
        }
    }

    /**
     * 检查点击目标是否为关联第三方图标
     */
    function isThirdPartyIcon(target) {
        if (!target) return false;
        let element = target;
        for (let i = 0; i < 6; i++) {
            if (!element) break;

            const text = element.textContent || '';
            const ariaLabel = element.getAttribute('aria-label') || '';
            const title = element.getAttribute('title') || '';
            const className = element.className || '';

            if (text.includes('关联第三方') ||
                ariaLabel.includes('关联第三方') ||
                title.includes('关联第三方') ||
                className.includes('third-party') ||
                className.includes('关联')) {
                log('点击了关联第三方图标');
                return true;
            }

            const style = window.getComputedStyle(element);
            if (element.tagName === 'BUTTON' ||
                element.tagName === 'I' ||
                element.tagName === 'SPAN' ||
                element.getAttribute('role') === 'button') {
                if (style.color.includes('64, 158, 255') ||
                    style.backgroundColor.includes('64, 158, 255')) {
                    if (text.includes('关联') || text.includes('第三方') || text.includes('link')) {
                        return true;
                    }
                }
            }

            element = element.parentElement;
        }
        return false;
    }

    /**
     * 点击事件处理
     */
    function handleClick(event) {
        if (isThirdPartyIcon(event.target)) {
            log('检测到关联第三方图标点击');
            // 短暂延迟确保DOM开始变化
            setTimeout(() => {
                mainProcessingFlow();
            }, 100);
        }
    }

    /**
     * 初始化脚本（关键修复：无论是否有工单ID都设置监听）
     */
    function initializeScript() {
        log('===== 初始化脚本 =====');

        if (!shouldScriptRun()) {
            log('脚本不适用于当前页面');
            cleanupAll();
            return;
        }

        const newOrderId = getCurrentOrderId();
        log(`当前工单ID: ${newOrderId}, 之前工单ID: ${currentOrderId}`);

        // 工单ID变化时清理处理状态（但保持监听器）
        if (newOrderId !== currentOrderId) {
            log(`工单ID变化: ${currentOrderId} -> ${newOrderId}`);
            cleanupProcessingState(); // 只清理状态，不清理监听器
            currentOrderId = newOrderId;
        }

        // 【关键修复】无论是否有工单ID，只要页面匹配就设置监听
        // 列表页没有orderCode，但有"关联第三方"按钮
        if (!clickEventListener) {
            document.body.addEventListener('click', handleClick, true);
            clickEventListener = handleClick;
            log('点击事件监听器已设置（列表页模式）');
        } else {
            log('监听器已存在，无需重复设置');
        }
    }

    /**
     * 设置DOM变化观察器
     */
    function setupMutationObserver() {
        log('设置DOM变化观察器');

        if (orderIdObserver) {
            orderIdObserver.disconnect();
        }

        orderIdObserver = new MutationObserver((mutations) => {
            // 检测URL变化（SPA路由）
            const url = window.location.href;

            // 如果URL不再匹配，清理所有资源
            if (!shouldScriptRun()) {
                log('页面不再匹配，清理资源');
                cleanupAll();
                return;
            }

            // 检测工单ID变化
            if (url.includes('orderCode=')) {
                const match = url.match(/orderCode=(\d{12,16})/);
                if (match && match[1] !== currentOrderId) {
                    log('检测到工单变化，重新初始化');
                    initializeScript();
                }
            }
        });

        orderIdObserver.observe(document.body, {
            childList: true,
            subtree: true
        });

        log('DOM观察器已启动');
    }

    /**
     * 主入口函数
     */
    function main() {
        log('===== 脚本开始执行（列表页修复版v2.6） =====');

        // 立即初始化
        initializeScript();

        // 设置观察器
        setupMutationObserver();

        // 监听路由变化
        window.addEventListener('hashchange', () => {
            log('检测到hash变化，重新初始化');
            setTimeout(initializeScript, 300);
        });

        // 定期保活检查（防止某些SPA框架移除监听器）
        setInterval(() => {
            if (shouldScriptRun() && !clickEventListener) {
                log('监听器丢失，重新设置');
                initializeScript();
            }
        }, 5000);

        // 全局测试函数
        window.testScript = function() {
            log('===== 手动测试开始 =====');
            log('当前URL:', window.location.href);
            log('当前工单ID:', currentOrderId);
            log('监听器状态:', clickEventListener ? '已设置' : '未设置');
            log('已处理输入框数量:', processedInputs.size || 'N/A');

            const titleEl = findTaskTitleElement();
            log('任务标题元素:', titleEl ? '找到' : '未找到');

            const taskInput = findTaskTitleInput();
            log('任务标题输入框:', taskInput ? '找到' : '未找到');

            if (taskInput) {
                log('当前值:', taskInput.value);
            }

            const description = findDescriptionContent();
            log('描述内容长度:', description?.length || 0);

            if (description) {
                const serverIds = extractServerId(description);
                log('找到的ServerID:', serverIds);
            }

            log('===== 手动测试结束 =====');
        };

        log('脚本初始化完成，输入 testScript() 进行手动测试');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', main);
    } else {
        setTimeout(main, 1000);
    }
})();
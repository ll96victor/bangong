// ==UserScript==
// @name         标题替换v2.7
// @namespace    http://tampermonkey.net/
// @version      2.7
// @description  支持Shadow DOM、Vue组件、异步渲染的修复版
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
        maxWaitTime: 5000,      // 增加等待时间
        debounceDelay: 300,
        retryInterval: 500,     // 重试间隔
        maxRetries: 10          // 最大重试次数
    };

    // ==================== 全局变量 ====================
    let currentOrderId = null;
    let isProcessing = false;
    let clickEventListener = null;
    let orderIdObserver = null;
    let processedInputs = new WeakSet();
    let processingTimeout = null;
    let retryCount = 0;

    // ==================== 调试工具 ====================
    function log(...args) {
        if (CONFIG.debug) console.log('🔧 [工单脚本v2.7]', ...args);
    }
    function error(...args) {
        console.error('❌ [工单脚本v2.7]', ...args);
    }
    function warn(...args) {
        console.warn('⚠️ [工单脚本v2.7]', ...args);
    }

    // ==================== 核心工具函数（增强版） ====================

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
     * 【新增】遍历 Shadow DOM 的 querySelector
     */
    function deepQuerySelector(selector, root = document) {
        // 先在当前根下查找
        let el = root.querySelector(selector);
        if (el) return el;

        // 遍历所有子元素，包括 shadow DOM
        const walker = document.createTreeWalker(
            root,
            NodeFilter.SHOW_ELEMENT,
            null,
            false
        );

        let node;
        while (node = walker.nextNode()) {
            if (node.shadowRoot) {
                el = deepQuerySelector(selector, node.shadowRoot);
                if (el) return el;
            }
        }
        return null;
    }

    /**
     * 【新增】查找所有可能的根（包括 shadow DOM）
     */
    function getAllRoots() {
        const roots = [document];
        const walker = document.createTreeWalker(
            document.body,
            NodeFilter.SHOW_ELEMENT,
            null,
            false
        );
        let node;
        while (node = walker.nextNode()) {
            if (node.shadowRoot) {
                roots.push(node.shadowRoot);
            }
        }
        return roots;
    }

    /**
     * 【增强】查找输入框元素 - 支持组件库封装
     */
    function findInputElement(titleElement) {
        if (!titleElement) return null;

        // 策略1: 通过 for 属性查找
        if (titleElement.tagName === 'LABEL') {
            const forAttr = titleElement.getAttribute('for');
            if (forAttr) {
                const input = document.getElementById(forAttr) ||
                             deepQuerySelector(`#${forAttr}`);
                if (input && (input.tagName === 'INPUT' || input.tagName === 'TEXTAREA')) {
                    return input;
                }
            }
        }

        // 策略2: 向上查找父级表单项，然后查找内部输入框
        let parent = titleElement.parentElement;
        for (let i = 0; i < 6 && parent; i++) {
            // 查找标准 input/textarea
            const inputs = parent.querySelectorAll('input, textarea');
            for (const input of inputs) {
                if (isElementVisible(input) && !input.disabled) {
                    return input;
                }
            }

            // 【新增】查找 Element UI / Ant Design 等组件库封装的输入框
            const elInputs = parent.querySelectorAll('.el-input__inner, .ant-input, .ivu-input');
            for (const input of elInputs) {
                if (isElementVisible(input) && !input.disabled) {
                    return input;
                }
            }

            parent = parent.parentElement;
        }

        // 策略3: 查找后续兄弟元素
        let sibling = titleElement.nextElementSibling;
        while (sibling) {
            if (sibling.tagName === 'INPUT' || sibling.tagName === 'TEXTAREA') {
                if (isElementVisible(sibling)) return sibling;
            }
            if (sibling.tagName === 'DIV') {
                // 查找组件库包装
                const innerInput = sibling.querySelector('input, textarea, .el-input__inner, .ant-input');
                if (innerInput && isElementVisible(innerInput)) {
                    return innerInput;
                }
            }
            sibling = sibling.nextElementSibling;
        }

        // 策略4: 在整个文档中查找 placeholder 包含"标题"的输入框
        const allInputs = document.querySelectorAll('input[placeholder*="标题"], input[placeholder*="title"], .el-input__inner');
        for (const input of allInputs) {
            if (isElementVisible(input) && !input.disabled) {
                // 检查是否与 titleElement 在同一表单区域内
                const inputFormItem = input.closest('.el-form-item, .ant-form-item, [class*="form-item"], [class*="form-group"]');
                const titleFormItem = titleElement.closest('.el-form-item, .ant-form-item, [class*="form-item"], [class*="form-group"]');

                if (inputFormItem && titleFormItem && inputFormItem === titleFormItem) {
                    return input;
                }
            }
        }

        return null;
    }

    /**
     * 【增强】查找任务标题元素 - 多种策略
     */
    function findTaskTitleElement() {
        // 策略1: 通过文本内容查找（原有逻辑）
        const walker = document.createTreeWalker(
            document.body,
            NodeFilter.SHOW_TEXT,
            null,
            false
        );

        let node;
        while (node = walker.nextNode()) {
            if (node.textContent.includes('任务标题') || node.textContent.includes('标题')) {
                const parent = node.parentElement;
                if (isElementVisible(parent)) {
                    return parent;
                }
            }
        }

        // 策略2: 通过常见 class 或属性查找
        const selectors = [
            '.el-form-item__label:contains("任务标题")',
            '[class*="task-title"]',
            '[class*="form-label"]:contains("标题")',
            'label:contains("任务标题")',
            '.form-item-label:contains("标题")'
        ];

        for (const selector of selectors) {
            try {
                // 支持 jQuery 风格的 :contains 需要自定义实现
                if (selector.includes(':contains')) {
                    const baseSelector = selector.split(':contains')[0];
                    const text = selector.match(/contains\("(.+)"\)/)?.[1];
                    const elements = document.querySelectorAll(baseSelector);
                    for (const el of elements) {
                        if (el.textContent.includes(text) && isElementVisible(el)) {
                            return el;
                        }
                    }
                } else {
                    const el = document.querySelector(selector);
                    if (el && isElementVisible(el)) return el;
                }
            } catch (e) {
                continue;
            }
        }

        // 策略3: 查找 placeholder 包含"任务标题"的输入框的 label
        const inputs = document.querySelectorAll('input[placeholder*="任务标题"], .el-input__inner[placeholder*="标题"]');
        for (const input of inputs) {
            const id = input.id;
            if (id) {
                const label = document.querySelector(`label[for="${id}"]`);
                if (label) return label;
            }
            // 查找父级 label
            let parent = input.parentElement;
            for (let i = 0; i < 3 && parent; i++) {
                if (parent.tagName === 'LABEL') return parent;
                parent = parent.parentElement;
            }
        }

        return null;
    }

    /**
     * 【增强】查找任务标题输入框
     */
    function findTaskTitleInput() {
        // 直接通过常见选择器查找
        const directSelectors = [
            'input[placeholder*="任务标题"]',
            'input[name*="title"]',
            'input[name*="task"]',
            '.el-input__inner[placeholder*="标题"]',
            '.task-title input',
            '[class*="task-title"] input'
        ];

        for (const selector of directSelectors) {
            const input = deepQuerySelector(selector);
            if (input && isElementVisible(input) && !input.disabled) {
                log('通过选择器找到输入框:', selector);
                return input;
            }
        }

        // 通过标题元素查找
        const titleElement = findTaskTitleElement();
        if (titleElement) {
            log('找到标题元素:', titleElement);
            return findInputElement(titleElement);
        }

        return null;
    }

    /**
     * 【增强】查找描述内容
     */
    function findDescriptionContent() {
        // 策略1: 查找包含 ServerID 的文本节点
        const walker = document.createTreeWalker(
            document.body,
            NodeFilter.SHOW_TEXT,
            null,
            false
        );

        let node;
        while (node = walker.nextNode()) {
            if (node.textContent.includes('ServerID') || node.textContent.includes('serverId')) {
                const parent = node.parentElement;
                if (parent && isElementVisible(parent)) {
                    const container = parent.closest('.el-form-item, div[class*="content"], td, .cell, [class*="description"], [class*="detail"]');
                    if (container) {
                        const text = container.textContent || '';
                        if (text.includes('ServerID') && text.length < 3000) {
                            return text;
                        }
                    }
                    const text = parent.textContent || '';
                    if (text.length < 2000) return text;
                }
            }
        }

        // 策略2: 在常见容器内查找
        const containers = document.querySelectorAll(
            '.el-form-item__content, .ant-form-item-control, [class*="content"], [class*="detail"], [class*="description"]'
        );

        for (const container of containers) {
            const text = container.textContent || '';
            if (text.includes('ServerID') && text.length < 3000) {
                return text;
            }
        }

        // 策略3: 全局文本搜索
        const bodyText = document.body.innerText || '';
        if (bodyText.includes('ServerID')) {
            const index = bodyText.indexOf('ServerID');
            const snippet = bodyText.substring(Math.max(0, index - 200), Math.min(bodyText.length, index + 300));
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

        // 列表页尝试从行数据获取
        const activeRow = document.querySelector('.el-table__row.current-row, .el-table__row:hover, .el-table__row--striped:hover');
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
     * 清理处理状态
     */
    function cleanupProcessingState() {
        log('清理处理状态');
        isProcessing = false;
        processedInputs = new WeakSet();
        retryCount = 0;
        if (processingTimeout) {
            clearTimeout(processingTimeout);
            processingTimeout = null;
        }
    }

    /**
     * 完全清理
     */
    function cleanupAll() {
        log('完全清理资源');
        cleanupProcessingState();
        if (clickEventListener) {
            document.body.removeEventListener('click', clickEventListener, true);
            document.body.removeEventListener('mousedown', clickEventListener, true);
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
     * 【增强】替换任务标题 - 支持组件库
     */
    function replaceTaskTitle(inputElement, leftheading) {
        try {
            if (processedInputs.has(inputElement)) {
                log('该输入框已在本次会话中处理过，跳过');
                return false;
            }

            // 处理 Element UI 等组件：如果输入框是 readonly，尝试查找实际输入框
            let targetInput = inputElement;
            if (inputElement.readOnly && inputElement.classList.contains('el-input__inner')) {
                // 可能是自动完成组件，尝试查找父级 input 或设置值
                const parent = inputElement.closest('.el-input');
                if (parent) {
                    const realInput = parent.querySelector('input:not(.el-input__inner)');
                    if (realInput) targetInput = realInput;
                }
            }

            const currentValue = targetInput.value || '';
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

            // 处理已有前缀的情况
            if (currentValue.startsWith('【') && currentValue.includes('】：')) {
                const colonIndex = currentValue.indexOf('：');
                if (colonIndex !== -1) {
                    const oldContent = currentValue.substring(colonIndex + 1);
                    const newValue = leftheading + oldContent;
                    setInputValue(targetInput, newValue);
                    processedInputs.add(inputElement);
                    log('已更新前缀:', newValue);
                    return true;
                }
            }

            // 处理冒号分隔的情况
            const colonIndex = currentValue.search(/[:：]/);
            if (colonIndex === -1) {
                log('任务标题中没有冒号，直接添加前缀');
                const newValue = leftheading + currentValue;
                setInputValue(targetInput, newValue);
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

            setInputValue(targetInput, newValue);
            processedInputs.add(inputElement);
            log('任务标题替换成功！');
            return true;
        } catch (err) {
            error('替换任务标题时出错:', err);
            return false;
        }
    }

    /**
     * 【新增】安全设置输入框值 - 触发 Vue/React 更新
     */
    function setInputValue(input, value) {
        // 设置值
        input.value = value;

        // 触发事件以通知框架
        const events = ['input', 'change', 'blur', 'keyup', 'compositionend'];
        events.forEach(eventType => {
            const event = new Event(eventType, {
                bubbles: true,
                cancelable: true
            });
            // 对于 React，需要设置 nativeEvent
            Object.defineProperty(event, 'target', {
                value: input,
                enumerable: true
            });
            Object.defineProperty(event, 'currentTarget', {
                value: input,
                enumerable: true
            });
            input.dispatchEvent(event);
        });

        // 特殊处理：如果输入框有 __vue__ 或 _value 属性（Vue）
        if (input.__vue__) {
            try {
                input.__vue__.$emit('input', value);
                input.__vue__.$emit('change', value);
            } catch (e) {
                // 忽略 Vue 特定错误
            }
        }
    }

    /**
     * 【增强】等待弹窗出现 - 带重试机制
     */
    function waitForTaskInput(timeout = CONFIG.maxWaitTime) {
        return new Promise((resolve) => {
            const startTime = Date.now();
            let resolved = false;

            const check = () => {
                if (resolved) return;

                const input = findTaskTitleInput();
                if (input) {
                    resolved = true;
                    log('找到输入框，耗时:', Date.now() - startTime, 'ms');
                    resolve(input);
                    return;
                }

                if (Date.now() - startTime > timeout) {
                    resolved = true;
                    warn('等待弹窗超时');
                    resolve(null);
                    return;
                }

                setTimeout(check, CONFIG.retryInterval);
            };

            // 立即检查一次
            check();

            // 同时设置 MutationObserver 以快速响应 DOM 变化
            const observer = new MutationObserver(() => {
                if (resolved) return;
                const input = findTaskTitleInput();
                if (input) {
                    resolved = true;
                    observer.disconnect();
                    log('通过 MutationObserver 找到输入框');
                    resolve(input);
                }
            });

            observer.observe(document.body, {
                childList: true,
                subtree: true,
                attributes: true,
                attributeFilter: ['class', 'style']
            });

            // 超时清理
            setTimeout(() => {
                if (!resolved) {
                    observer.disconnect();
                }
            }, timeout);
        });
    }

    /**
     * 【增强】主处理流程 - 带重试
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
                // 重试机制
                if (retryCount < CONFIG.maxRetries) {
                    retryCount++;
                    log(`第 ${retryCount} 次重试...`);
                    isProcessing = false;
                    setTimeout(mainProcessingFlow, CONFIG.retryInterval);
                }
                return;
            }

            retryCount = 0; // 重置重试计数

            if (taskInput.disabled || (taskInput.readOnly && !taskInput.classList.contains('el-input__inner'))) {
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
     * 【增强】检查点击目标是否为关联第三方图标
     */
    function isThirdPartyIcon(target) {
        if (!target) return false;
        let element = target;

        for (let i = 0; i < 8; i++) { // 增加层级检查
            if (!element) break;

            const text = element.textContent || '';
            const ariaLabel = element.getAttribute('aria-label') || '';
            const title = element.getAttribute('title') || '';
            const className = element.className || '';
            const id = element.id || '';

            // 检查文本内容
            if (text.includes('关联第三方') ||
                ariaLabel.includes('关联第三方') ||
                title.includes('关联第三方') ||
                className.includes('third-party') ||
                className.includes('关联') ||
                id.includes('third') ||
                id.includes('link')) {
                log('点击了关联第三方图标 (文本匹配)');
                return true;
            }

            // 检查图标类名（常见图标库）
            if (className.includes('icon-link') ||
                className.includes('icon-associate') ||
                className.includes('fa-link') ||
                className.includes('el-icon-link')) {
                log('点击了关联图标 (类名匹配)');
                return true;
            }

            // 检查按钮样式
            const style = window.getComputedStyle(element);
            if (element.tagName === 'BUTTON' ||
                element.tagName === 'I' ||
                element.tagName === 'SPAN' ||
                element.tagName === 'SVG' ||
                element.getAttribute('role') === 'button') {
                // 检查蓝色主题色（常见于"关联"按钮）
                if (style.color.includes('64, 158, 255') ||
                    style.backgroundColor.includes('64, 158, 255') ||
                    style.borderColor.includes('64, 158, 255')) {
                    if (text.includes('关联') || text.includes('第三方') || text.includes('link') || text.includes('连接')) {
                        log('点击了关联按钮 (样式匹配)');
                        return true;
                    }
                }
            }

            element = element.parentElement;
        }
        return false;
    }

    /**
     * 【增强】点击事件处理 - 使用捕获阶段
     */
    function handleClick(event) {
        if (isThirdPartyIcon(event.target)) {
            log('检测到关联第三方图标点击');
            // 延迟执行，确保 Vue/React 完成渲染
            setTimeout(() => {
                mainProcessingFlow();
            }, 200);

            // 二次尝试（应对异步加载）
            setTimeout(() => {
                if (!isProcessing) {
                    mainProcessingFlow();
                }
            }, 800);
        }
    }

    /**
     * 【增强】初始化脚本
     */
    function initializeScript() {
        log('===== 初始化脚本 v2.7 =====');

        if (!shouldScriptRun()) {
            log('脚本不适用于当前页面');
            cleanupAll();
            return;
        }

        const newOrderId = getCurrentOrderId();
        log(`当前工单ID: ${newOrderId}, 之前工单ID: ${currentOrderId}`);

        // 工单ID变化时清理处理状态
        if (newOrderId !== currentOrderId) {
            log(`工单ID变化: ${currentOrderId} -> ${newOrderId}`);
            cleanupProcessingState();
            currentOrderId = newOrderId;
        }

        // 设置事件监听（使用捕获阶段）
        if (!clickEventListener) {
            document.body.addEventListener('click', handleClick, true);
            document.body.addEventListener('mousedown', handleClick, true); // 新增 mousedown 提高响应速度
            clickEventListener = handleClick;
            log('点击事件监听器已设置（捕获阶段）');
        }
    }

    /**
     * 【增强】设置DOM变化观察器
     */
    function setupMutationObserver() {
        log('设置DOM变化观察器');

        if (orderIdObserver) {
            orderIdObserver.disconnect();
        }

        orderIdObserver = new MutationObserver((mutations) => {
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

            // 【新增】检测弹窗出现（通过 class 变化）
            for (const mutation of mutations) {
                if (mutation.type === 'childList' || mutation.type === 'attributes') {
                    // 检查是否有对话框或弹窗出现
                    const dialogs = document.querySelectorAll('.el-dialog, .ant-modal, [class*="dialog"], [class*="modal"]');
                    if (dialogs.length > 0) {
                        // 检查是否包含任务标题
                        for (const dialog of dialogs) {
                            if (dialog.textContent.includes('任务标题') && !isProcessing) {
                                log('检测到任务弹窗出现');
                                setTimeout(mainProcessingFlow, 300);
                                break;
                            }
                        }
                    }
                }
            }
        });

        orderIdObserver.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['class', 'style', 'id']
        });

        log('DOM观察器已启动（增强模式）');
    }

    /**
     * 主入口函数
     */
    function main() {
        log('===== 脚本开始执行（增强版v2.7） =====');

        // 立即初始化
        initializeScript();

        // 设置观察器
        setupMutationObserver();

        // 监听路由变化
        window.addEventListener('hashchange', () => {
            log('检测到hash变化，重新初始化');
            setTimeout(initializeScript, 300);
        });

        // 定期保活检查
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

            const titleEl = findTaskTitleElement();
            log('任务标题元素:', titleEl ? titleEl.outerHTML.substring(0, 200) : '未找到');

            const taskInput = findTaskTitleInput();
            log('任务标题输入框:', taskInput ? taskInput.outerHTML.substring(0, 200) : '未找到');

            if (taskInput) {
                log('当前值:', taskInput.value);
                log('是否禁用:', taskInput.disabled);
                log('是否只读:', taskInput.readOnly);
            }

            const description = findDescriptionContent();
            log('描述内容长度:', description?.length || 0);
            if (description) {
                log('描述内容前200字符:', description.substring(0, 200));
                const serverIds = extractServerId(description);
                log('找到的ServerID:', serverIds);
            }

            // 测试 Shadow DOM
            const roots = getAllRoots();
            log('发现的 DOM 根数量:', roots.length);

            log('===== 手动测试结束 =====');
        };

        log('脚本初始化完成，输入 testScript() 进行手动测试');
    }

    // 启动时机处理
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', main);
    } else {
        // 如果页面已加载，延迟执行以确保 Vue/React 已初始化
        setTimeout(main, 1500);
    }

    // 【新增】备用启动：如果 3 秒后还没启动，强制启动
    setTimeout(() => {
        if (!clickEventListener && shouldScriptRun()) {
            log('备用启动机制触发');
            main();
        }
    }, 3000);
})();
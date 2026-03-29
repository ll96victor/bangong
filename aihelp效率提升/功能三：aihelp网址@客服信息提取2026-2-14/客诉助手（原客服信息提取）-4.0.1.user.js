// ==UserScript==
// @name         客诉助手（原客服信息提取）
// @namespace    http://tampermonkey.net/
// @version      4.0.1
// @description  AiHelp Ticket（客诉）页面效率工具：复制URL@客服、改分组、打标签、翻译、AI辅助、日志面板，并支持整排按钮拖拽记忆。

// @author       Front-end Expert
// @match        https://ml-panel.aihelp.net/*
// @match        https://ml-panel.aihelp.net.cn/*
// @match        https://ml-panel.aihelp.net/dashboard/#/manual/tickets/?queryType=3
// @match        https://ml.aihelp.net/*
// @match        https://aihelp.net.cn/*
// @match        https://aihelp.net/*
// @grant        GM_setClipboard
// @grant        GM_addStyle
// @grant        GM_xmlhttpRequest
// @grant        GM_registerMenuCommand
// @grant        GM_setValue
// @grant        GM_getValue
// @connect      translate.googleapis.com
// @connect      open.bigmodel.cn
// @connect      *
// ==/UserScript==

/**
 * 更新日志：
 * v4.0.1 (2026-03-28)
 * - 优化：翻译面板支持直接粘贴自定义回复，再翻译为客诉目标语种
 * - 优化：AI 输出固定附带中文说明，便于理解小语种结果
 * - 优化：AI 面板新增“待优化回复”输入区，支持粘贴自定义回复后优化
 *
 * v4.0.0 (2026-03-28)
 * - 重命名：脚本名称更新为“客诉助手（原客服信息提取）”
 * - 新增：🌐 翻译按钮，自动识别语种并支持手动切换目标语种
 * - 新增：🤖 AI辅助按钮，支持推荐回复与优化当前客服回复
 * - 新增：📜 日志面板，便于排查翻译/AI/页面操作问题
 * - 新增：油猴菜单配置 GLM / MiMo 的 Key、Endpoint、模型与默认目标语种
 * - 优化：拖动任意一个按钮，整排按钮一起移动并自动记住位置
 *

 * v3.0.6 (2026-03-20)
 * - 优化：采用快速响应+重试机制，而非长时间等待
 * - 优化：等待时间恢复快速响应（弹窗300ms、下拉框200ms、输入100ms）
 * - 新增：失败时自动重试最多3次，每次间隔500ms
 * - 优化：网络波动时自动重试，不影响正常使用速度
 *
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

    function isTicketPage() {
        return window.location.href.includes('ticket');
    }

    if (!isTicketPage()) return;

    const DEBUG = true;
    const PANEL_IDS = {
        translate: 'ai-translate-panel',
        ai: 'ai-assistant-panel',
        log: 'ai-log-panel'
    };

    const STORAGE_KEYS = {
        buttonPosition: 'ai-btn-container-position',
        defaultTargetLang: 'aihelp_ticket_default_target_lang_v1',
        glmApiKey: 'aihelp_ticket_glm_api_key_v1',
        glmEndpoint: 'aihelp_ticket_glm_endpoint_v1',
        glmModel: 'aihelp_ticket_glm_model_v1',
        mimoApiKey: 'aihelp_ticket_mimo_api_key_v1',
        mimoEndpoint: 'aihelp_ticket_mimo_endpoint_v1',
        mimoModel: 'aihelp_ticket_mimo_model_v1'
    };

    const LANGUAGE_OPTIONS = [
        { value: 'en', label: 'English' },
        { value: 'zh-CN', label: '简体中文' },
        { value: 'es', label: 'Español' },
        { value: 'pt', label: 'Português' },
        { value: 'id', label: 'Bahasa Indonesia' },
        { value: 'th', label: 'ไทย' },
        { value: 'vi', label: 'Tiếng Việt' },
        { value: 'ar', label: 'العربية' },
        { value: 'ru', label: 'Русский' },
        { value: 'tr', label: 'Türkçe' },
        { value: 'ja', label: '日本語' },
        { value: 'ko', label: '한국어' },
        { value: 'fr', label: 'Français' },
        { value: 'de', label: 'Deutsch' }
    ];

    const LANGUAGE_LABEL_MAP = LANGUAGE_OPTIONS.reduce((acc, item) => {
        acc[item.value] = item.label;
        return acc;
    }, {});

    const CONFIG = {
        targetGroup: 'CN 二线-BUG',
        targetTag: 'BUG二綫 BUG Agents',
        dialogWaitTime: 300,
        dropdownWaitTime: 200,
        inputWaitTime: 100,
        maxRetries: 3,
        retryDelay: 500,
        maxContextMessages: 10,
        maxLogEntries: 200,
        translateTimeout: 10000,
        aiTimeout: 25000,
        defaultTargetLang: 'en',
        defaultGlmEndpoint: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
        defaultGlmModel: 'GLM-4.7-Flash',
        fallbackGlmModel: 'GLM-4-Flash-250414',
        defaultMimoModel: 'MiMo-V2-Pro',
        dragThreshold: 5
    };

    const STATE = {
        logs: [],
        panels: {},
        activePanelId: null,
        detectCache: new Map(),
        translateCache: new Map(),
        initialized: false
    };

    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    function formatLogValue(value) {
        if (value instanceof Error) return value.message;
        if (typeof value === 'string') return value;
        try {
            return JSON.stringify(value);
        } catch (e) {
            return String(value);
        }
    }

    function pushLog(level, ...args) {
        const text = args.map(formatLogValue).join(' ');
        const entry = {
            time: new Date().toLocaleTimeString('zh-CN', { hour12: false }),
            level,
            text
        };

        STATE.logs.push(entry);
        if (STATE.logs.length > CONFIG.maxLogEntries) {
            STATE.logs = STATE.logs.slice(-CONFIG.maxLogEntries);
        }

        const method = level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log';
        if (DEBUG || level !== 'info') {
            console[method]('[客诉助手]', ...args);
        }

        if (STATE.panels[PANEL_IDS.log]) {
            renderLogPanel(STATE.panels[PANEL_IDS.log].body);
        }
    }

    function log(...args) {
        pushLog('info', ...args);
    }

    function logWarn(...args) {
        pushLog('warn', ...args);
    }

    function logError(...args) {
        pushLog('error', ...args);
    }

    function maskSecret(secret) {
        if (!secret) return '未配置';
        if (secret.length <= 8) return '已配置';
        return `${secret.slice(0, 4)}****${secret.slice(-4)}`;
    }

    function normalizeWhitespace(text) {
        return (text || '').replace(/\r/g, '').replace(/\n{3,}/g, '\n\n').trim();
    }

    function truncateText(text, maxLength = 1200) {
        const clean = normalizeWhitespace(text);
        return clean.length > maxLength ? `${clean.slice(0, maxLength)}...` : clean;
    }

    function escapeHtml(text) {
        return String(text || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function copyTextToClipboard(text) {
        GM_setClipboard(text || '');
        log('文本已复制到剪贴板');
    }

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

    function simulateInputValue(element, value) {
        if (!element) return false;
        try {
            element.focus();
            const nativeSetter = Object.getOwnPropertyDescriptor(
                window.HTMLInputElement.prototype, 'value'
            ).set;
            nativeSetter.call(element, value);
            ['input', 'change', 'keydown', 'keyup'].forEach(eventType => {
                element.dispatchEvent(new Event(eventType, { bubbles: true }));
            });
            element.dispatchEvent(new Event('compositionstart', { bubbles: true }));
            element.dispatchEvent(new Event('compositionend', { bubbles: true }));
            return true;
        } catch (e) {
            logError('模拟输入失败:', e);
            return false;
        }
    }

    function triggerClick(element) {
        if (!element) return false;
        element.focus();
        const rect = element.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
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



    function getStoredValue(key, defaultValue = '') {
        const value = GM_getValue(key, defaultValue);
        return typeof value === 'string' ? value.trim() : value;
    }

    function setStoredValue(key, value) {
        GM_setValue(key, typeof value === 'string' ? value.trim() : value);
    }

    function normalizeLanguageCode(code) {
        const value = String(code || '').trim().toLowerCase();
        if (!value) return '';
        if (value.startsWith('zh')) return 'zh-CN';
        if (value.startsWith('en')) return 'en';
        if (value.startsWith('es')) return 'es';
        if (value.startsWith('pt')) return 'pt';
        if (value.startsWith('id')) return 'id';
        if (value.startsWith('th')) return 'th';
        if (value.startsWith('vi')) return 'vi';
        if (value.startsWith('ar')) return 'ar';
        if (value.startsWith('ru')) return 'ru';
        if (value.startsWith('tr')) return 'tr';
        if (value.startsWith('ja')) return 'ja';
        if (value.startsWith('ko')) return 'ko';
        if (value.startsWith('fr')) return 'fr';
        if (value.startsWith('de')) return 'de';
        return value;
    }

    function isSupportedLanguage(code) {
        return Boolean(LANGUAGE_LABEL_MAP[normalizeLanguageCode(code)]);
    }

    function getLanguageLabel(code) {
        const normalized = normalizeLanguageCode(code);
        return LANGUAGE_LABEL_MAP[normalized] || normalized || '未知语种';
    }

    function getDefaultTargetLang(fallback = '') {
        const stored = normalizeLanguageCode(getStoredValue(STORAGE_KEYS.defaultTargetLang, ''));
        if (stored && isSupportedLanguage(stored)) return stored;
        const safeFallback = normalizeLanguageCode(fallback);
        if (safeFallback && isSupportedLanguage(safeFallback)) return safeFallback;
        return CONFIG.defaultTargetLang;
    }

    function setDefaultTargetLang(language) {
        const normalized = normalizeLanguageCode(language);
        if (normalized && isSupportedLanguage(normalized)) {
            setStoredValue(STORAGE_KEYS.defaultTargetLang, normalized);
        }
    }

    function getPreferredTargetLanguage(detectedLang) {
        return getDefaultTargetLang(detectedLang);
    }

    function getGlmConfig() {
        return {
            apiKey: getStoredValue(STORAGE_KEYS.glmApiKey, ''),
            endpoint: getStoredValue(STORAGE_KEYS.glmEndpoint, CONFIG.defaultGlmEndpoint) || CONFIG.defaultGlmEndpoint,
            model: getStoredValue(STORAGE_KEYS.glmModel, CONFIG.defaultGlmModel) || CONFIG.defaultGlmModel
        };
    }

    function getMimoConfig() {
        return {
            apiKey: getStoredValue(STORAGE_KEYS.mimoApiKey, ''),
            endpoint: getStoredValue(STORAGE_KEYS.mimoEndpoint, ''),
            model: getStoredValue(STORAGE_KEYS.mimoModel, CONFIG.defaultMimoModel) || CONFIG.defaultMimoModel
        };
    }

    function showConfigSummary() {
        const glmConfig = getGlmConfig();
        const mimoConfig = getMimoConfig();
        alert([
            '客诉助手当前配置',
            '',
            `默认目标语种：${getLanguageLabel(getDefaultTargetLang())}`,
            `GLM API Key：${maskSecret(glmConfig.apiKey)}`,
            `GLM Endpoint：${glmConfig.endpoint || '未配置'}`,
            `GLM 模型：${glmConfig.model || '未配置'}`,
            `MiMo API Key：${maskSecret(mimoConfig.apiKey)}`,
            `MiMo Endpoint：${mimoConfig.endpoint || '未配置'}`,
            `MiMo 模型：${mimoConfig.model || '未配置'}`
        ].join('\n'));
    }

    function promptSecretSetting(title, key) {
        const current = getStoredValue(key, '');
        const message = current
            ? `${title}\n当前已配置。重新输入会覆盖，留空不会修改。`
            : `${title}\n请输入内容：`;
        const result = prompt(message, '');
        if (result === null) return;
        const value = String(result).trim();
        if (!value) return;
        setStoredValue(key, value);
        log(`${title} 已更新`);
    }

    function promptPlainSetting(title, key, defaultValue = '') {
        const current = getStoredValue(key, defaultValue) || defaultValue;
        const result = prompt(title, current);
        if (result === null) return;
        const value = String(result).trim();
        if (!value) return;
        setStoredValue(key, value);
        log(`${title} 已更新为:`, value);
    }

    function promptDefaultTargetLanguage() {
        const current = getDefaultTargetLang();
        const message = `请输入默认目标语种代码，例如：en / zh-CN / es / pt / id / th / vi / ar / ru / tr / ja / ko / fr / de\n当前值：${current}`;
        const result = prompt(message, current);
        if (result === null) return;
        const value = normalizeLanguageCode(result);
        if (!isSupportedLanguage(value)) {
            alert('语种代码不在内置列表中，请重新输入。');
            return;
        }
        setDefaultTargetLang(value);
        log('默认目标语种已更新为:', value);
    }

    function registerConfigMenus() {
        GM_registerMenuCommand('客诉助手：设置默认目标语种', promptDefaultTargetLanguage);
        GM_registerMenuCommand('客诉助手：设置 GLM API Key', () => promptSecretSetting('设置 GLM API Key', STORAGE_KEYS.glmApiKey));
        GM_registerMenuCommand('客诉助手：设置 GLM Endpoint', () => promptPlainSetting('设置 GLM Endpoint', STORAGE_KEYS.glmEndpoint, CONFIG.defaultGlmEndpoint));
        GM_registerMenuCommand('客诉助手：设置 GLM 模型', () => promptPlainSetting('设置 GLM 模型', STORAGE_KEYS.glmModel, CONFIG.defaultGlmModel));
        GM_registerMenuCommand('客诉助手：设置 MiMo API Key', () => promptSecretSetting('设置 MiMo API Key', STORAGE_KEYS.mimoApiKey));
        GM_registerMenuCommand('客诉助手：设置 MiMo Endpoint', () => promptPlainSetting('设置 MiMo 完整 Chat Completions Endpoint', STORAGE_KEYS.mimoEndpoint, ''));
        GM_registerMenuCommand('客诉助手：设置 MiMo 模型', () => promptPlainSetting('设置 MiMo 模型', STORAGE_KEYS.mimoModel, CONFIG.defaultMimoModel));
        GM_registerMenuCommand('客诉助手：查看当前配置', showConfigSummary);
    }

    function extractTicketAgentInfo() {
        try {
            const allButtons = document.querySelectorAll('button');
            const candidates = [];
            for (const btn of allButtons) {
                const rect = btn.getBoundingClientRect();
                const text = btn.innerText.trim();
                if (rect.top > 0 && rect.top < 150 && text.includes('-')) {
                    const match = text.match(/([A-Z]+)-([A-Za-z0-9_]+)/);
                    if (match) {
                        candidates.push({ prefix: match[1], name: match[2] });
                    }
                }
            }
            return candidates.length > 0 ? candidates[0] : null;
        } catch (e) {
            logError('Ticket 提取失败:', e);
        }
        return null;
    }

    function extractFeishuOrder() {
        try {
            log('开始提取飞书单...');
            let feishuLink = null;
            const allLinks = document.querySelectorAll('a');

            for (const link of allLinks) {
                const href = link.getAttribute('href') || '';
                if (href.includes('feishu.cn')) {
                    feishuLink = link;
                    break;
                }
            }

            if (!feishuLink) {
                const allDivs = document.querySelectorAll('div');
                for (const div of allDivs) {
                    if (div.innerText && div.innerText.includes('飞书单：')) {
                        const linkInDiv = div.querySelector('a');
                        if (linkInDiv) {
                            feishuLink = linkInDiv;
                            break;
                        }
                    }
                }
            }

            if (!feishuLink) {
                return null;
            }

            let linkHref = feishuLink.getAttribute('href') || '';
            linkHref = linkHref.replace(/[ `\s]/g, '').trim();

            let timeText = '';
            let parent = feishuLink.parentElement;
            for (let i = 0; i < 10 && parent; i++) {
                const timeSpan = parent.querySelector('.note-time');
                if (timeSpan) {
                    const fullTimeText = timeSpan.textContent.trim();
                    const pipeIndex = fullTimeText.indexOf('|');
                    timeText = pipeIndex !== -1 ? fullTimeText.substring(0, pipeIndex).trim() : fullTimeText;
                    break;
                }
                parent = parent.parentElement;
            }

            if (!timeText) {
                const timeSpan = document.querySelector('.note-time');
                if (timeSpan) {
                    const fullTimeText = timeSpan.textContent.trim();
                    const pipeIndex = fullTimeText.indexOf('|');
                    timeText = pipeIndex !== -1 ? fullTimeText.substring(0, pipeIndex).trim() : fullTimeText;
                }
            }

            const feishuOrder = `飞书单：${linkHref} 的子单`;
            return timeText ? `${feishuOrder}\n${timeText}` : feishuOrder;
        } catch (e) {
            logError('飞书单提取失败:', e);
        }
        return null;
    }

    function getChatRoot() {
        return document.querySelector('#chat-box, .chat-box') || document;
    }

    function extractTextFromMessage(messageEl) {
        if (!messageEl) return '';
        const clone = messageEl.cloneNode(true);
        clone.querySelectorAll('.date, .note-time, .chat-action-box, .note-operate-box, .note-fold, .note-edit-word, a.form-link, script, style').forEach(el => el.remove());
        const text = clone.innerText || clone.textContent || '';
        return normalizeWhitespace(text);
    }

    function extractLatestUserMessage() {
        const nodes = Array.from(getChatRoot().querySelectorAll('.msg.msg-left'));
        for (let i = nodes.length - 1; i >= 0; i--) {
            const text = extractTextFromMessage(nodes[i]);
            if (text) return text;
        }
        return '';
    }

    function extractLatestAgentMessage() {
        const nodes = Array.from(getChatRoot().querySelectorAll('[data-testid="agentMessageItem"].msg.msg-right'));
        for (let i = nodes.length - 1; i >= 0; i--) {
            const text = extractTextFromMessage(nodes[i]);
            if (text) return text;
        }
        return '';
    }

    function extractChatContext(limit = CONFIG.maxContextMessages) {
        const nodes = Array.from(getChatRoot().querySelectorAll('.msg.msg-left, [data-testid="agentMessageItem"].msg.msg-right'));
        const context = [];
        for (const node of nodes) {
            const isUser = node.matches('.msg.msg-left');
            const isAgent = node.matches('[data-testid="agentMessageItem"].msg.msg-right');
            if (!isUser && !isAgent) continue;
            const text = truncateText(extractTextFromMessage(node), 1600);
            if (!text) continue;
            context.push({ role: isUser ? 'user' : 'agent', text });
        }
        return context.slice(-limit);
    }

    function handleCopyAction(button) {
        try {
            const agentInfo = extractTicketAgentInfo();
            const finalAgentName = agentInfo ? agentInfo.name : '未知客服';
            const finalPrefix = agentInfo ? agentInfo.prefix : '';

            let copyText;
            if (finalAgentName === '未知客服') {
                const feishuOrder = extractFeishuOrder();
                copyText = feishuOrder ? `${window.location.href}\n${feishuOrder}` : `${window.location.href} @${finalAgentName}`;
            } else {
                copyText = `${window.location.href} @${finalAgentName}`;
            }

            copyTextToClipboard(copyText);
            showFeedback(button, finalPrefix || '✓', 'success');
        } catch (e) {
            logError('复制失败:', e);
            showFeedback(button, '✗', 'error');
        }
    }

    function showFeedback(btn, text, type) {
        if (!btn) return;
        const iconSpan = btn.querySelector('.ai-icon-symbol');
        const originalText = btn.dataset.originalSymbol || (iconSpan ? iconSpan.textContent : '✓');

        if (iconSpan) {
            iconSpan.textContent = text;
        }

        if (type === 'success') btn.classList.add('ai-icon-success');
        if (type === 'error') btn.classList.add('ai-icon-error');

        setTimeout(() => {
            if (iconSpan) {
                iconSpan.textContent = originalText;
            }
            btn.classList.remove('ai-icon-success', 'ai-icon-error');
        }, 1500);
    }

    async function handleChangeGroup(button) {
        log('开始执行更改分组功能...');
        const groupBtn = findGroupButton();
        if (!groupBtn) {
            logWarn('未找到分组按钮');
            showFeedback(button, '✗', 'error');
            return;
        }

        const currentGroupText = groupBtn.textContent.trim();
        if (currentGroupText === CONFIG.targetGroup) {
            log('当前分组已是目标分组:', currentGroupText);
            showFeedback(button, '✓', 'success');
            return;
        }

        for (let retry = 0; retry < CONFIG.maxRetries; retry++) {
            if (retry > 0) {
                log(`第 ${retry + 1} 次重试...`);
                await sleep(CONFIG.retryDelay);
            }

            try {
                triggerClick(groupBtn);
                await sleep(CONFIG.dialogWaitTime);

                const queueInput = await waitForQueueInput(1000);
                if (!queueInput) {
                    logWarn('未找到客诉队列输入框，准备重试');
                    continue;
                }

                triggerClick(queueInput);
                await sleep(CONFIG.inputWaitTime);
                simulateInputValue(queueInput, CONFIG.targetGroup);
                await sleep(CONFIG.dropdownWaitTime);

                const targetOption = await findDropdownOptionFast(CONFIG.targetGroup);
                if (!targetOption) {
                    logWarn('未找到目标分组选项，准备重试');
                    continue;
                }

                triggerClick(targetOption);
                await sleep(CONFIG.inputWaitTime);

                const confirmBtn = await findConfirmButton(1000);
                if (!confirmBtn) {
                    logWarn('未找到确认按钮，准备重试');
                    continue;
                }

                triggerClick(confirmBtn);
                await sleep(CONFIG.inputWaitTime);
                log('更改分组成功');
                showFeedback(button, '✓', 'success');
                return;
            } catch (e) {
                logError('更改分组异常:', e);
            }
        }

        logWarn('更改分组失败，已达到最大重试次数');
        showFeedback(button, '✗', 'error');
    }

    function findGroupButton() {
        const allButtons = document.querySelectorAll('button');
        for (const btn of allButtons) {
            const svg = btn.querySelector('svg.icon-ai-group');
            if (svg && isElementAvailable(btn)) {
                const rect = btn.getBoundingClientRect();
                if (rect.top > 0 && rect.top < 200) {
                    return btn;
                }
            }
        }
        return null;
    }

    async function waitForQueueInput(timeout = 3000) {
        const startTime = Date.now();
        while (Date.now() - startTime < timeout) {
            const dialog = document.querySelector('.ai-distribute-ticket-wrap');
            if (dialog) {
                const inputs = dialog.querySelectorAll('input.el-input__inner');
                for (const input of inputs) {
                    const placeholder = input.getAttribute('placeholder') || '';
                    if ((placeholder.includes('请选择客诉队列') || placeholder.includes('客诉队列')) && isElementAvailable(input)) {
                        return input;
                    }
                }
            }
            await sleep(100);
        }
        return null;
    }

    async function findDropdownOptionFast(targetText) {
        const startTime = Date.now();
        while (Date.now() - startTime < 2000) {
            const selectedOption = document.querySelector('.el-select-dropdown__item.selected.hover');
            if (selectedOption && isElementAvailable(selectedOption)) {
                return selectedOption;
            }

            const options = document.querySelectorAll('.el-select-dropdown__item');
            for (const option of options) {
                const text = option.textContent.trim();
                if ((text.includes(targetText) || text === targetText) && isElementAvailable(option)) {
                    return option;
                }
            }
            await sleep(50);
        }
        return null;
    }

    async function findConfirmButton(timeout = 2000) {
        const startTime = Date.now();
        while (Date.now() - startTime < timeout) {
            const buttons = document.querySelectorAll('button.el-button--primary');
            for (const btn of buttons) {
                const text = btn.textContent.trim();
                if (text === '确认' && isElementAvailable(btn)) {
                    return btn;
                }
            }
            await sleep(50);
        }
        return null;
    }

    async function handleAddTag(button) {
        log('开始执行打标签功能...');
        const tagContainer = findTagContainer();
        if (!tagContainer) {
            logWarn('未找到标签容器');
            showFeedback(button, '✗', 'error');
            return;
        }

        const showtags = tagContainer.getAttribute('showtags') || '';
        if (showtags.includes(CONFIG.targetTag)) {
            log('标签已存在，无需添加');
            showFeedback(button, '✓', 'success');
            return;
        }

        for (let retry = 0; retry < CONFIG.maxRetries; retry++) {
            if (retry > 0) {
                log(`第 ${retry + 1} 次重试...`);
                await sleep(CONFIG.retryDelay);
            }

            try {
                const searchInput = tagContainer.querySelector('.elp-cascader__search-input');
                if (!searchInput) {
                    logWarn('未找到标签搜索输入框，准备重试');
                    continue;
                }

                triggerClick(searchInput);
                await sleep(CONFIG.dropdownWaitTime);
                simulateInputValue(searchInput, CONFIG.targetTag);
                await sleep(CONFIG.dropdownWaitTime);

                const tagOption = await findTagOption(CONFIG.targetTag);
                if (!tagOption) {
                    logWarn('未找到目标标签选项，准备重试');
                    continue;
                }

                triggerClick(tagOption);
                await sleep(CONFIG.inputWaitTime);
                log('打标签成功');
                showFeedback(button, '✓', 'success');
                return;
            } catch (e) {
                logError('打标签异常:', e);
            }
        }

        logWarn('打标签失败，已达到最大重试次数');
        showFeedback(button, '✗', 'error');
    }

    function findTagContainer() {
        const containers = document.querySelectorAll('.ai-select-tag.elp-cascader');
        for (const container of containers) {
            if (isElementAvailable(container)) {
                return container;
            }
        }
        return null;
    }

    async function findTagOption(targetText) {
        const startTime = Date.now();
        while (Date.now() - startTime < 2000) {
            const options = document.querySelectorAll('.elp-cascader__suggestion-item, .el-cascader-node__label, .el-select-dropdown__item');
            for (const option of options) {
                const text = option.textContent.trim();
                if ((text.includes(targetText) || text === targetText) && isElementAvailable(option)) {
                    return option;
                }
            }
            await sleep(50);
        }
        return null;
    }

    function gmRequest(options) {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                timeout: CONFIG.aiTimeout,
                ...options,
                onload: (response) => {
                    if (response.status >= 200 && response.status < 300) {
                        resolve(response);
                    } else {
                        reject(new Error(`HTTP ${response.status}`));
                    }
                },
                onerror: (error) => reject(new Error(error?.error || '网络请求失败')),
                ontimeout: () => reject(new Error('请求超时'))
            });
        });
    }

    async function requestJson(options) {
        const response = await gmRequest(options);
        try {
            return JSON.parse(response.responseText);
        } catch (e) {
            throw new Error('接口返回不是有效 JSON');
        }
    }

    async function detectLanguage(text) {
        const source = normalizeWhitespace(text);
        if (!source) return CONFIG.defaultTargetLang;
        const cacheKey = `detect:${source}`;
        if (STATE.detectCache.has(cacheKey)) {
            return STATE.detectCache.get(cacheKey);
        }

        const result = await requestJson({
            method: 'GET',
            url: `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=en&dt=t&q=${encodeURIComponent(source)}`,
            timeout: CONFIG.translateTimeout
        });
        const detected = normalizeLanguageCode(result?.[2] || result?.[8]?.[0]?.[0] || CONFIG.defaultTargetLang) || CONFIG.defaultTargetLang;
        STATE.detectCache.set(cacheKey, detected);
        return detected;
    }

    async function translateText(text, targetLang) {
        const source = normalizeWhitespace(text);
        const normalizedTarget = normalizeLanguageCode(targetLang) || CONFIG.defaultTargetLang;
        const cacheKey = `translate:${normalizedTarget}:${source}`;
        if (STATE.translateCache.has(cacheKey)) {
            return STATE.translateCache.get(cacheKey);
        }

        const result = await requestJson({
            method: 'GET',
            url: `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${encodeURIComponent(normalizedTarget)}&dt=t&q=${encodeURIComponent(source)}`,
            timeout: CONFIG.translateTimeout
        });

        const translatedText = Array.isArray(result?.[0])
            ? result[0].map(item => item?.[0] || '').join('')
            : '';
        const payload = {
            detectedLang: normalizeLanguageCode(result?.[2] || CONFIG.defaultTargetLang) || CONFIG.defaultTargetLang,
            translatedText: normalizeWhitespace(translatedText) || source
        };
        STATE.translateCache.set(cacheKey, payload);
        return payload;
    }

    async function translateWithAutoDetection(text, targetLang, detectedLangHint = '') {
        const source = normalizeWhitespace(text);
        const detectedLang = normalizeLanguageCode(detectedLangHint) || await detectLanguage(source);
        const normalizedTarget = normalizeLanguageCode(targetLang) || CONFIG.defaultTargetLang;
        if (detectedLang === normalizedTarget) {
            return {
                detectedLang,
                translatedText: source,
                skipped: true
            };
        }
        const result = await translateText(source, normalizedTarget);
        return {
            detectedLang,
            translatedText: result.translatedText,
            skipped: false
        };
    }

    function buildLanguageOptionsHtml(selectedLang) {
        const normalized = normalizeLanguageCode(selectedLang) || CONFIG.defaultTargetLang;
        return LANGUAGE_OPTIONS.map(item => `
            <option value="${item.value}" ${item.value === normalized ? 'selected' : ''}>${escapeHtml(item.label)} (${item.value})</option>
        `).join('');
    }

    function hideAllTooltips() {
        document.querySelectorAll('.ai-delayed-tooltip.visible').forEach(el => el.classList.remove('visible'));
    }

    function closePanel(panelId) {
        const panel = STATE.panels[panelId];
        if (!panel) return;
        if (panel.element && panel.element.parentNode) {
            panel.element.parentNode.removeChild(panel.element);
        }
        delete STATE.panels[panelId];
        if (STATE.activePanelId === panelId) {
            STATE.activePanelId = null;
        }
    }

    function closeOtherPanels(exceptId = '') {
        Object.keys(STATE.panels).forEach(id => {
            if (id !== exceptId) {
                closePanel(id);
            }
        });
    }

    function ensurePanel(panelId, title) {
        closeOtherPanels(panelId);
        const existing = STATE.panels[panelId];
        if (existing) {
            STATE.activePanelId = panelId;
            return existing;
        }

        const panel = document.createElement('div');
        panel.id = panelId;
        panel.className = 'ai-floating-panel';
        panel.innerHTML = `
            <div class="ai-panel-header">
                <div class="ai-panel-title">${escapeHtml(title)}</div>
                <button type="button" class="ai-panel-close" aria-label="关闭">×</button>
            </div>
            <div class="ai-panel-body"></div>
        `;

        panel.querySelector('.ai-panel-close').addEventListener('click', () => closePanel(panelId));
        document.body.appendChild(panel);

        const payload = {
            element: panel,
            body: panel.querySelector('.ai-panel-body')
        };
        STATE.panels[panelId] = payload;
        STATE.activePanelId = panelId;
        return payload;
    }

    function buildContextText(context) {
        return context.map((item, index) => {
            const roleLabel = item.role === 'user' ? '用户' : '客服';
            return `[${index + 1}] ${roleLabel}：${truncateText(item.text, 1000)}`;
        }).join('\n\n');
    }

    function buildAiMessages({ mode, targetLang, contextText, latestUserMessage, latestAgentMessage, customReplyText }) {
        const targetLanguageName = getLanguageLabel(targetLang);
        const normalizedCustomReply = normalizeWhitespace(customReplyText);
        const effectiveReply = normalizedCustomReply || normalizeWhitespace(latestAgentMessage);
        const safeContextText = contextText || '暂无对话上下文';
        const systemPrompt = [
            '你是一名资深游戏客诉专家。',
            '请基于用户意图、上下文对话和当前客服回复，输出稳定、专业、可直接使用的结果。',
            '禁止夸大承诺，禁止编造未确认的信息，语气要清晰、克制、客服可直接复制。',
            `面向用户的话术必须使用：${targetLanguageName}。`,
            '你必须额外提供中文说明，帮助客服理解小语种内容；中文说明仅供内部理解，不要混入面向用户的话术。',
            '请使用 Markdown 输出。'
        ].join('\n');

        const modePrompt = mode === 'optimize'
            ? [
                '任务模式：优化当前客服回复。',
                `待优化回复：\n${effectiveReply || '暂无待优化回复，请基于上下文补出一版更稳妥的回复。'}`,
                '输出格式：',
                '## 用户意图（中文）',
                `## 面向用户的优化后回复（${targetLanguageName}）`,
                '## 中文说明'
            ].join('\n')
            : [
                '任务模式：推荐可直接发送的客服回复。',
                '输出格式：',
                '## 用户意图（中文）',
                `## 推荐回复一（${targetLanguageName}）`,
                `## 推荐回复二（${targetLanguageName}）`,
                `## 推荐回复三（${targetLanguageName}）`,
                '## 中文说明'
            ].join('\n');

        const userPrompt = [
            modePrompt,
            '',
            '对话上下文：',
            safeContextText,
            '',
            `最新用户消息：\n${latestUserMessage || '未提取到最新用户消息'}`,
            '',
            `当前客服回复：\n${latestAgentMessage || '未提取到当前客服回复'}`,
            normalizedCustomReply ? `\n用户手动粘贴的回复草稿：\n${normalizedCustomReply}` : '',
            '',
            '注意：如果上下文信息不足，请给出保守、稳妥、不越权的回复。面向用户的话术只能使用目标语种，中文说明用于客服自己理解。'
        ].filter(Boolean).join('\n');

        return [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
        ];
    }


    function extractAiTextFromResponse(result) {
        if (result?.error?.message) {
            throw new Error(result.error.message);
        }
        const content = result?.choices?.[0]?.message?.content;
        if (!content) {
            throw new Error('AI 返回内容为空');
        }
        return normalizeWhitespace(content);
    }

    async function callGlmApi(messages) {
        const config = getGlmConfig();
        if (!config.apiKey) {
            throw new Error('未配置 GLM API Key，请先在油猴菜单中设置');
        }

        const endpoint = config.endpoint || CONFIG.defaultGlmEndpoint;
        const primaryModel = config.model || CONFIG.defaultGlmModel;
        const modelQueue = primaryModel === CONFIG.fallbackGlmModel
            ? [primaryModel]
            : [primaryModel, CONFIG.fallbackGlmModel];
        const errors = [];

        for (const model of modelQueue) {
            try {
                const result = await requestJson({
                    method: 'POST',
                    url: endpoint,
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${config.apiKey}`
                    },
                    data: JSON.stringify({
                        model,
                        messages,
                        temperature: 0.4,
                        max_tokens: 1024
                    }),
                    timeout: CONFIG.aiTimeout
                });

                return extractAiTextFromResponse(result);
            } catch (e) {
                errors.push(`${model}: ${e.message}`);
            }
        }

        throw new Error(errors.join('；'));
    }


    async function callMimoApi(messages) {
        const config = getMimoConfig();
        if (!config.apiKey) {
            throw new Error('未配置 MiMo API Key，请先在油猴菜单中设置');
        }
        if (!config.endpoint) {
            throw new Error('未配置 MiMo Endpoint，请先在油猴菜单中设置完整 Chat Completions 地址');
        }

        const result = await requestJson({
            method: 'POST',
            url: config.endpoint,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${config.apiKey}`
            },
            data: JSON.stringify({
                model: config.model || CONFIG.defaultMimoModel,
                messages,
                temperature: 0.4,
                max_tokens: 1024
            }),
            timeout: CONFIG.aiTimeout
        });

        return extractAiTextFromResponse(result);
    }

    async function callAiWithFallback(preferredProvider, messages) {
        const providerOrder = preferredProvider === 'mimo' ? ['mimo', 'glm'] : ['glm', 'mimo'];
        const errors = [];

        for (const provider of providerOrder) {
            try {
                if (provider === 'glm') {
                    const content = await callGlmApi(messages);
                    return { provider: '智谱 GLM', content };
                }
                const content = await callMimoApi(messages);
                return { provider: '小米 MiMo', content };
            } catch (e) {
                errors.push(`${provider}: ${e.message}`);
                logWarn(`AI 提供方 ${provider} 调用失败:`, e.message);
            }
        }

        throw new Error(errors.join('；'));
    }

    async function runTranslatePanel(body, sourceText, targetLang, detectedLangHint = '', referenceTargetLang = '') {
        const normalizedSource = normalizeWhitespace(sourceText);
        if (!normalizedSource) {
            renderTranslatePanel(body, {
                sourceText: '',
                targetLang,
                detectedLang: detectedLangHint,
                translatedText: '',
                loading: false,
                status: '请先粘贴或保留待翻译内容后再翻译。',
                error: true,
                referenceTargetLang
            });
            return;
        }

        renderTranslatePanel(body, {
            sourceText: normalizedSource,
            targetLang,
            detectedLang: detectedLangHint,
            translatedText: '',
            loading: true,
            status: '翻译中，请稍候...',
            referenceTargetLang
        });

        try {
            const result = await translateWithAutoDetection(normalizedSource, targetLang, detectedLangHint);
            renderTranslatePanel(body, {
                sourceText: normalizedSource,
                targetLang,
                detectedLang: result.detectedLang,
                translatedText: result.translatedText,
                loading: false,
                status: result.skipped ? '检测到待翻译内容已是目标语种，已直接展示原文。' : '翻译完成，可直接复制使用。',
                referenceTargetLang
            });
        } catch (e) {
            logError('翻译失败:', e);
            renderTranslatePanel(body, {
                sourceText: normalizedSource,
                targetLang,
                detectedLang: detectedLangHint,
                translatedText: '',
                loading: false,
                status: `翻译失败：${e.message}`,
                error: true,
                referenceTargetLang
            });
        }
    }

    function renderTranslatePanel(body, panelState) {
        const detectedLabel = panelState.detectedLang ? getLanguageLabel(panelState.detectedLang) : '待翻译后识别';
        const targetHint = panelState.referenceTargetLang
            ? `已按客诉用户语种预选目标语种：${getLanguageLabel(panelState.referenceTargetLang)}，你也可以手动修改。`
            : '默认会翻译你准备发送的内容；也可以直接粘贴你自己的回复后再翻译。';
        const statusClass = panelState.error ? 'ai-panel-status ai-panel-status-error' : 'ai-panel-status';

        body.innerHTML = `
            <div class="ai-panel-field">
                <div class="ai-panel-label">使用说明</div>
                <div class="ai-panel-note">${escapeHtml(targetHint)}</div>
            </div>
            <div class="ai-panel-field">
                <div class="ai-panel-label">检测语种</div>
                <div class="ai-panel-note">${escapeHtml(detectedLabel)}</div>
            </div>
            <div class="ai-panel-field">
                <div class="ai-panel-label">目标语种</div>
                <select class="ai-panel-select" id="ai-translate-target-select">
                    ${buildLanguageOptionsHtml(panelState.targetLang)}
                </select>
            </div>
            <div class="ai-panel-field">
                <div class="ai-panel-label">待翻译内容（可粘贴你自己的回复）</div>
                <textarea class="ai-panel-textarea" id="ai-translate-source-input" placeholder="默认带出客服回复；也可以直接粘贴你自己要发送的内容">${escapeHtml(panelState.sourceText || '')}</textarea>
            </div>
            <div class="ai-panel-field">
                <div class="ai-panel-label">译文</div>
                <pre class="ai-panel-pre">${escapeHtml(panelState.translatedText || (panelState.loading ? '翻译中...' : '暂无译文'))}</pre>
            </div>
            <div class="ai-panel-actions">
                <button type="button" class="ai-panel-btn" id="ai-translate-refresh-btn">${panelState.loading ? '翻译中...' : '重新翻译'}</button>
                <button type="button" class="ai-panel-btn" id="ai-translate-copy-btn" ${panelState.translatedText ? '' : 'disabled'}>复制译文</button>
            </div>
            <div class="${statusClass}">${escapeHtml(panelState.status || '')}</div>
        `;

        const sourceInput = body.querySelector('#ai-translate-source-input');
        const targetSelect = body.querySelector('#ai-translate-target-select');
        const refreshBtn = body.querySelector('#ai-translate-refresh-btn');
        const copyBtn = body.querySelector('#ai-translate-copy-btn');
        const getSourceText = () => normalizeWhitespace(sourceInput ? sourceInput.value : panelState.sourceText || '');

        targetSelect.addEventListener('change', () => {
            const nextLang = normalizeLanguageCode(targetSelect.value) || CONFIG.defaultTargetLang;
            setDefaultTargetLang(nextLang);
            runTranslatePanel(body, getSourceText(), nextLang, '', panelState.referenceTargetLang || '');
        });

        refreshBtn.addEventListener('click', () => {
            const nextLang = normalizeLanguageCode(targetSelect.value) || CONFIG.defaultTargetLang;
            runTranslatePanel(body, getSourceText(), nextLang, '', panelState.referenceTargetLang || '');
        });

        if (copyBtn) {
            copyBtn.addEventListener('click', () => {
                copyTextToClipboard(panelState.translatedText || '');
            });
        }
    }

    async function handleTranslateAction(button) {
        const latestUserMessage = extractLatestUserMessage();
        const latestAgentMessage = extractLatestAgentMessage();
        let referenceTargetLang = '';

        try {
            referenceTargetLang = latestUserMessage ? await detectLanguage(latestUserMessage) : '';
        } catch (e) {
            logWarn('客诉目标语种识别失败，将使用默认目标语种:', e.message);
        }

        const panel = ensurePanel(PANEL_IDS.translate, '翻译助手');
        const initialTargetLang = referenceTargetLang ? getPreferredTargetLanguage(referenceTargetLang) : getDefaultTargetLang();
        const initialSourceText = latestAgentMessage || '';
        showFeedback(button, '✓', 'success');

        if (initialSourceText) {
            await runTranslatePanel(panel.body, initialSourceText, initialTargetLang, '', referenceTargetLang);
            return;
        }

        renderTranslatePanel(panel.body, {
            sourceText: '',
            targetLang: initialTargetLang,
            detectedLang: '',
            translatedText: '',
            loading: false,
            status: '未提取到客服回复，请直接粘贴你自己的回复内容后再翻译。',
            error: false,
            referenceTargetLang
        });
    }


    async function runAiPanel(body, panelState) {
        panelState.customReplyText = normalizeWhitespace(panelState.customReplyText);
        const hasContext = Array.isArray(panelState.context) && panelState.context.some(item => normalizeWhitespace(item.text));
        const hasUserMessage = Boolean(normalizeWhitespace(panelState.latestUserMessage));
        const hasReplyText = Boolean(panelState.customReplyText || normalizeWhitespace(panelState.latestAgentMessage));

        if (!hasContext && !hasUserMessage && !hasReplyText) {
            panelState.loading = false;
            panelState.resultText = '';
            panelState.status = '请先粘贴待优化回复，或确保页面里已有对话内容。';
            panelState.error = true;
            renderAiPanel(body, panelState);
            return;
        }

        panelState.loading = true;
        panelState.resultText = panelState.resultText || '';
        panelState.status = 'AI 生成中，请稍候...';
        panelState.error = false;
        renderAiPanel(body, panelState);

        try {
            const messages = buildAiMessages({
                mode: panelState.mode,
                targetLang: panelState.targetLang,
                contextText: buildContextText(panelState.context),
                latestUserMessage: panelState.latestUserMessage,
                latestAgentMessage: panelState.latestAgentMessage,
                customReplyText: panelState.customReplyText
            });
            const result = await callAiWithFallback(panelState.provider, messages);
            panelState.loading = false;
            panelState.resultText = result.content;
            panelState.status = `生成完成，实际使用：${result.provider}。结果已附中文说明，方便查看。`;
            panelState.error = false;
            renderAiPanel(body, panelState);
        } catch (e) {
            logError('AI 辅助失败:', e);
            panelState.loading = false;
            panelState.resultText = '';
            panelState.status = `AI 调用失败：${e.message}`;
            panelState.error = true;
            renderAiPanel(body, panelState);
        }
    }

    function renderAiPanel(body, panelState) {
        const statusClass = panelState.error ? 'ai-panel-status ai-panel-status-error' : 'ai-panel-status';

        body.innerHTML = `
            <div class="ai-panel-field">
                <div class="ai-panel-label">使用说明</div>
                <div class="ai-panel-note">AI 会输出面向用户的话术，并额外附上中文说明，方便你看懂小语种内容。若要优化你自己写的回复，请把内容粘贴到“待优化回复”里再生成。</div>
            </div>
            <div class="ai-panel-grid">
                <div class="ai-panel-field">
                    <div class="ai-panel-label">优先方案</div>
                    <select class="ai-panel-select" id="ai-provider-select">
                        <option value="glm" ${panelState.provider === 'glm' ? 'selected' : ''}>智谱 GLM</option>
                        <option value="mimo" ${panelState.provider === 'mimo' ? 'selected' : ''}>小米 MiMo</option>
                    </select>
                </div>
                <div class="ai-panel-field">
                    <div class="ai-panel-label">输出模式</div>
                    <select class="ai-panel-select" id="ai-mode-select">
                        <option value="recommend" ${panelState.mode === 'recommend' ? 'selected' : ''}>推荐回复</option>
                        <option value="optimize" ${panelState.mode === 'optimize' ? 'selected' : ''}>优化当前回复</option>
                    </select>
                </div>
            </div>
            <div class="ai-panel-field">
                <div class="ai-panel-label">目标语种</div>
                <select class="ai-panel-select" id="ai-target-select">
                    ${buildLanguageOptionsHtml(panelState.targetLang)}
                </select>
            </div>
            <div class="ai-panel-field">
                <div class="ai-panel-label">最新用户消息</div>
                <pre class="ai-panel-pre">${escapeHtml(panelState.latestUserMessage || '未提取到')}</pre>
            </div>
            <div class="ai-panel-field">
                <div class="ai-panel-label">提取到的当前客服回复</div>
                <pre class="ai-panel-pre">${escapeHtml(panelState.latestAgentMessage || '未提取到，AI 会基于上下文或你粘贴的回复给出建议')}</pre>
            </div>
            <div class="ai-panel-field">
                <div class="ai-panel-label">待优化回复（可粘贴你自己的回复）</div>
                <textarea class="ai-panel-textarea" id="ai-custom-reply-input" placeholder="需要优化你自己写的回复时，直接粘贴到这里；留空则使用上方提取到的客服回复">${escapeHtml(panelState.customReplyText || '')}</textarea>
            </div>
            <div class="ai-panel-field">
                <div class="ai-panel-label">AI 输出（含中文说明）</div>
                <pre class="ai-panel-pre ai-panel-pre-large">${escapeHtml(panelState.resultText || (panelState.loading ? 'AI 生成中...' : '点击“开始生成”后显示结果'))}</pre>
            </div>
            <div class="ai-panel-actions">
                <button type="button" class="ai-panel-btn" id="ai-generate-btn">${panelState.loading ? '生成中...' : '开始生成'}</button>
                <button type="button" class="ai-panel-btn" id="ai-copy-btn" ${panelState.resultText ? '' : 'disabled'}>复制结果</button>
            </div>
            <div class="${statusClass}">${escapeHtml(panelState.status || '')}</div>
        `;

        const providerSelect = body.querySelector('#ai-provider-select');
        const modeSelect = body.querySelector('#ai-mode-select');
        const targetSelect = body.querySelector('#ai-target-select');
        const customReplyInput = body.querySelector('#ai-custom-reply-input');
        const generateBtn = body.querySelector('#ai-generate-btn');
        const copyBtn = body.querySelector('#ai-copy-btn');

        providerSelect.addEventListener('change', () => {
            panelState.provider = providerSelect.value;
        });
        modeSelect.addEventListener('change', () => {
            panelState.mode = modeSelect.value;
        });
        targetSelect.addEventListener('change', () => {
            panelState.targetLang = normalizeLanguageCode(targetSelect.value) || CONFIG.defaultTargetLang;
            setDefaultTargetLang(panelState.targetLang);
        });
        if (customReplyInput) {
            customReplyInput.addEventListener('input', () => {
                panelState.customReplyText = customReplyInput.value;
            });
        }
        generateBtn.addEventListener('click', () => {
            panelState.customReplyText = customReplyInput ? customReplyInput.value : panelState.customReplyText;
            runAiPanel(body, panelState);
        });
        if (copyBtn) {
            copyBtn.addEventListener('click', () => {
                copyTextToClipboard(panelState.resultText || '');
            });
        }
    }

    async function handleAiAction(button) {
        const context = extractChatContext(CONFIG.maxContextMessages);
        if (!context.length) {
            logWarn('AI 辅助未提取到完整对话上下文，将允许手动粘贴回复继续处理');
        }

        const latestUserMessage = extractLatestUserMessage();
        const latestAgentMessage = extractLatestAgentMessage();
        let detectedLang = '';

        try {
            detectedLang = latestUserMessage ? await detectLanguage(latestUserMessage) : getDefaultTargetLang();
        } catch (e) {
            logWarn('语种识别失败，AI 输出将使用默认目标语种:', e.message);
            detectedLang = getDefaultTargetLang();
        }

        const panel = ensurePanel(PANEL_IDS.ai, 'AI辅助');
        const panelState = {
            provider: getGlmConfig().apiKey ? 'glm' : 'mimo',
            mode: latestAgentMessage ? 'optimize' : 'recommend',
            targetLang: getPreferredTargetLanguage(detectedLang),
            latestUserMessage,
            latestAgentMessage,
            customReplyText: latestAgentMessage || '',
            context,
            detectedLang,
            resultText: '',
            status: detectedLang ? `检测到用户语种：${getLanguageLabel(detectedLang)}；AI 输出会附中文说明。` : 'AI 输出会附中文说明。',
            loading: false,
            error: false
        };

        showFeedback(button, '✓', 'success');
        await runAiPanel(panel.body, panelState);
    }


    function renderLogPanel(body) {
        const logItems = STATE.logs.slice().reverse().map(entry => `
            <div class="ai-log-entry ai-log-entry-${entry.level}">
                <span class="ai-log-time">[${escapeHtml(entry.time)}]</span>
                <span class="ai-log-level">${escapeHtml(entry.level.toUpperCase())}</span>
                <span class="ai-log-text">${escapeHtml(entry.text)}</span>
            </div>
        `).join('');

        body.innerHTML = `
            <div class="ai-panel-actions ai-panel-actions-sticky">
                <button type="button" class="ai-panel-btn" id="ai-log-copy-btn" ${STATE.logs.length ? '' : 'disabled'}>复制日志</button>
                <button type="button" class="ai-panel-btn" id="ai-log-clear-btn" ${STATE.logs.length ? '' : 'disabled'}>清空日志</button>
            </div>
            <div class="ai-log-list">${logItems || '<div class="ai-panel-note">暂无日志</div>'}</div>
        `;

        const copyBtn = body.querySelector('#ai-log-copy-btn');
        const clearBtn = body.querySelector('#ai-log-clear-btn');

        if (copyBtn) {
            copyBtn.addEventListener('click', () => {
                const text = STATE.logs.map(item => `[${item.time}] [${item.level.toUpperCase()}] ${item.text}`).join('\n');
                copyTextToClipboard(text);
            });
        }

        if (clearBtn) {
            clearBtn.addEventListener('click', () => {
                STATE.logs = [];
                renderLogPanel(body);
            });
        }
    }

    function toggleLogPanel(button) {
        if (STATE.panels[PANEL_IDS.log]) {
            closePanel(PANEL_IDS.log);
            showFeedback(button, '✓', 'success');
            return;
        }
        const panel = ensurePanel(PANEL_IDS.log, '日志面板');
        renderLogPanel(panel.body);
        showFeedback(button, '✓', 'success');
    }

    GM_addStyle(`
        .ai-btn-main-container {
            position: fixed;
            top: 0;
            right: 400px;
            z-index: 99999;
            display: flex;
            gap: 8px;
            padding: 6px;
            user-select: none;
            align-items: center;
        }

        .ai-btn-main-container.ai-dragging,
        .ai-btn-main-container.ai-dragging .ai-tool-btn {
            cursor: grabbing !important;
        }

        .ai-tool-btn {
            width: 36px;
            height: 36px;
            border-radius: 50%;
            color: #fff;
            font-size: 15px;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
            transition: transform 0.2s ease, box-shadow 0.2s ease, opacity 0.2s ease;
            opacity: 0.88;
            overflow: visible;
            position: relative;
            flex-shrink: 0;
        }

        .ai-tool-btn:hover {
            opacity: 1;
            transform: scale(1.08);
            box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
        }

        .ai-tool-btn:active {
            transform: scale(0.95);
        }

        .ai-copy-icon-btn {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        }

        .ai-action-btn.ai-btn-group {
            background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
        }

        .ai-action-btn.ai-btn-tag {
            background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%);
        }

        .ai-action-btn.ai-btn-translate {
            background: linear-gradient(135deg, #43cea2 0%, #185a9d 100%);
        }

        .ai-action-btn.ai-btn-ai {
            background: linear-gradient(135deg, #8e2de2 0%, #4a00e0 100%);
        }

        .ai-action-btn.ai-btn-log {
            background: linear-gradient(135deg, #f7971e 0%, #ffd200 100%);
            color: #2d2d2d;
        }

        .ai-tool-btn.ai-icon-success {
            background: linear-gradient(135deg, #11998e 0%, #38ef7d 100%) !important;
            color: #fff !important;
        }

        .ai-tool-btn.ai-icon-error {
            background: linear-gradient(135deg, #e53e3e 0%, #fc8181 100%) !important;
            color: #fff !important;
        }

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
            opacity: 0.85;
        }

        .ai-floating-panel {
            position: fixed;
            top: 56px;
            right: 24px;
            width: 420px;
            max-width: calc(100vw - 32px);
            max-height: 72vh;
            background: rgba(15, 23, 42, 0.96);
            color: #f8fafc;
            border: 1px solid rgba(148, 163, 184, 0.22);
            border-radius: 14px;
            box-shadow: 0 18px 48px rgba(15, 23, 42, 0.38);
            z-index: 100000;
            display: flex;
            flex-direction: column;
            overflow: hidden;
            backdrop-filter: blur(12px);
        }

        .ai-panel-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 14px 16px;
            border-bottom: 1px solid rgba(148, 163, 184, 0.18);
            background: rgba(30, 41, 59, 0.95);
        }

        .ai-panel-title {
            font-size: 15px;
            font-weight: 700;
        }

        .ai-panel-close {
            border: none;
            background: transparent;
            color: #cbd5e1;
            font-size: 22px;
            line-height: 1;
            cursor: pointer;
            padding: 0 4px;
        }

        .ai-panel-body {
            padding: 14px 16px 16px;
            overflow: auto;
            display: flex;
            flex-direction: column;
            gap: 12px;
        }

        .ai-panel-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 12px;
        }

        .ai-panel-field {
            display: flex;
            flex-direction: column;
            gap: 6px;
        }

        .ai-panel-label {
            font-size: 12px;
            color: #cbd5e1;
            font-weight: 600;
        }

        .ai-panel-select,
        .ai-panel-textarea,
        .ai-panel-btn {
            border-radius: 10px;
            border: 1px solid rgba(148, 163, 184, 0.26);
            background: rgba(30, 41, 59, 0.96);
            color: #f8fafc;
            padding: 9px 10px;
            font-size: 13px;
        }

        .ai-panel-select,
        .ai-panel-textarea {
            outline: none;
        }

        .ai-panel-textarea {
            min-height: 96px;
            resize: vertical;
            line-height: 1.6;
            font-family: inherit;
        }


        .ai-panel-btn {
            cursor: pointer;
            font-weight: 600;
            transition: opacity 0.2s ease, transform 0.2s ease;
        }

        .ai-panel-btn:hover:not(:disabled) {
            opacity: 0.92;
            transform: translateY(-1px);
        }

        .ai-panel-btn:disabled {
            opacity: 0.45;
            cursor: not-allowed;
        }

        .ai-panel-actions {
            display: flex;
            gap: 10px;
            flex-wrap: wrap;
        }

        .ai-panel-actions-sticky {
            position: sticky;
            top: 0;
            background: rgba(15, 23, 42, 0.96);
            padding-bottom: 8px;
            z-index: 1;
        }

        .ai-panel-note,
        .ai-panel-status {
            font-size: 12px;
            line-height: 1.6;
            color: #cbd5e1;
        }

        .ai-panel-status {
            padding: 10px 12px;
            border-radius: 10px;
            background: rgba(30, 41, 59, 0.9);
        }

        .ai-panel-status-error {
            background: rgba(127, 29, 29, 0.4);
            color: #fecaca;
        }

        .ai-panel-pre {
            margin: 0;
            padding: 12px;
            border-radius: 10px;
            background: rgba(15, 23, 42, 0.75);
            border: 1px solid rgba(148, 163, 184, 0.16);
            color: #f8fafc;
            font-size: 12px;
            line-height: 1.6;
            white-space: pre-wrap;
            word-break: break-word;
            max-height: 160px;
            overflow: auto;
        }

        .ai-panel-pre-large {
            max-height: 260px;
        }

        .ai-log-list {
            display: flex;
            flex-direction: column;
            gap: 8px;
        }

        .ai-log-entry {
            padding: 10px 12px;
            border-radius: 10px;
            background: rgba(15, 23, 42, 0.7);
            border: 1px solid rgba(148, 163, 184, 0.12);
            font-size: 12px;
            line-height: 1.6;
            color: #e2e8f0;
            white-space: pre-wrap;
            word-break: break-word;
        }

        .ai-log-entry-warn {
            border-color: rgba(250, 204, 21, 0.25);
            background: rgba(113, 63, 18, 0.2);
        }

        .ai-log-entry-error {
            border-color: rgba(248, 113, 113, 0.28);
            background: rgba(127, 29, 29, 0.22);
        }

        .ai-log-time {
            color: #94a3b8;
            margin-right: 6px;
        }

        .ai-log-level {
            color: #38bdf8;
            font-weight: 700;
            margin-right: 8px;
        }
    `);

    function createActionButton({ id, className, symbol, title, desc, actionId }) {
        const btn = document.createElement('div');
        btn.id = id;
        btn.className = className;
        btn.dataset.aiActionId = actionId;
        btn.dataset.originalSymbol = symbol;
        btn.innerHTML = `<span class="ai-icon-symbol">${symbol}</span>`;

        const tooltip = document.createElement('div');
        tooltip.className = 'ai-delayed-tooltip';
        tooltip.innerHTML = `
            <div class="ai-tooltip-title">${escapeHtml(title)}</div>
            <div class="ai-tooltip-desc">${escapeHtml(desc)}</div>
        `;
        btn.appendChild(tooltip);

        let hoverTimer = null;
        btn.addEventListener('mouseenter', () => {
            hoverTimer = setTimeout(() => tooltip.classList.add('visible'), 3000);
        });
        btn.addEventListener('mouseleave', () => {
            if (hoverTimer) {
                clearTimeout(hoverTimer);
                hoverTimer = null;
            }
            tooltip.classList.remove('visible');
        });

        return btn;
    }

    function applySavedPosition(element) {
        const savedPosition = localStorage.getItem(STORAGE_KEYS.buttonPosition);
        if (!savedPosition) return;
        try {
            const pos = JSON.parse(savedPosition);
            if (pos.left !== undefined && pos.top !== undefined) {
                element.style.left = `${Math.round(pos.left)}px`;
                element.style.top = `${Math.round(pos.top)}px`;
                element.style.right = 'auto';
            }
        } catch (e) {
            logError('恢复位置失败:', e);
        }
    }

    function savePosition(element) {
        try {
            const rect = element.getBoundingClientRect();
            localStorage.setItem(STORAGE_KEYS.buttonPosition, JSON.stringify({
                left: Math.round(rect.left),
                top: Math.round(rect.top)
            }));
        } catch (e) {
            logError('保存位置失败:', e);
        }
    }

    const ACTION_HANDLERS = {
        group: handleChangeGroup,
        copy: handleCopyAction,
        tag: handleAddTag,
        translate: handleTranslateAction,
        ai: handleAiAction,
        log: toggleLogPanel
    };

    function setupDraggable(element) {
        let dragState = null;

        const handleMouseMove = (e) => {
            if (!dragState) return;

            const dx = e.clientX - dragState.startX;
            const dy = e.clientY - dragState.startY;

            if (!dragState.isDragging && (Math.abs(dx) > CONFIG.dragThreshold || Math.abs(dy) > CONFIG.dragThreshold)) {
                dragState.isDragging = true;
                element.classList.add('ai-dragging');
                hideAllTooltips();
            }

            if (!dragState.isDragging) return;

            let newX = e.clientX - dragState.offsetX;
            let newY = e.clientY - dragState.offsetY;
            const containerWidth = element.offsetWidth;
            const containerHeight = element.offsetHeight;

            newX = Math.max(0, Math.min(newX, window.innerWidth - containerWidth));
            newY = Math.max(0, Math.min(newY, window.innerHeight - containerHeight));

            element.style.left = `${newX}px`;
            element.style.top = `${newY}px`;
            element.style.right = 'auto';

            e.preventDefault();
        };

        const handleMouseUp = () => {
            if (!dragState) return;

            const currentState = dragState;
            dragState = null;
            element.classList.remove('ai-dragging');
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);

            if (currentState.isDragging) {
                savePosition(element);
                return;
            }

            if (currentState.buttonEl) {
                const actionId = currentState.buttonEl.dataset.aiActionId;
                const handler = ACTION_HANDLERS[actionId];
                if (typeof handler === 'function') {
                    handler(currentState.buttonEl);
                }
            }
        };

        element.addEventListener('mousedown', (e) => {
            if (e.button !== 0) return;
            const buttonEl = e.target.closest('[data-ai-action-id]');
            if (!buttonEl && !e.target.closest('#ai-btn-main-container')) return;

            const rect = element.getBoundingClientRect();
            dragState = {
                startX: e.clientX,
                startY: e.clientY,
                offsetX: e.clientX - rect.left,
                offsetY: e.clientY - rect.top,
                isDragging: false,
                buttonEl
            };

            hideAllTooltips();
            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
            e.preventDefault();
        });

        element.style.cursor = 'grab';
    }

    function initButtons() {
        if (document.getElementById('ai-btn-main-container')) return;

        const mainContainer = document.createElement('div');
        mainContainer.id = 'ai-btn-main-container';
        mainContainer.className = 'ai-btn-main-container';

        const buttons = [
            {
                id: 'ai-group-btn',
                className: 'ai-action-btn ai-tool-btn ai-btn-group',
                symbol: '📁',
                title: '更改分组',
                desc: '一键改成 CN 二线-BUG',
                actionId: 'group'
            },
            {
                id: 'ai-copy-btn',
                className: 'ai-copy-icon-btn ai-tool-btn',
                symbol: '📋',
                title: '复制客服信息',
                desc: '复制 URL + 客服名',
                actionId: 'copy'
            },
            {
                id: 'ai-tag-btn',
                className: 'ai-action-btn ai-tool-btn ai-btn-tag',
                symbol: '🏷️',
                title: '打标签',
                desc: '添加 BUG二綫 BUG Agents',
                actionId: 'tag'
            },
            {
                id: 'ai-translate-btn',
                className: 'ai-action-btn ai-tool-btn ai-btn-translate',
                symbol: '🌐',
                title: '翻译助手',
                desc: '识别语种并切换目标语种',
                actionId: 'translate'
            },
            {
                id: 'ai-assistant-btn',
                className: 'ai-action-btn ai-tool-btn ai-btn-ai',
                symbol: '🤖',
                title: 'AI辅助',
                desc: '推荐回复或优化当前话术',
                actionId: 'ai'
            },
            {
                id: 'ai-log-btn',
                className: 'ai-action-btn ai-tool-btn ai-btn-log',
                symbol: '📜',
                title: '日志面板',
                desc: '查看翻译 / AI / 调试日志',
                actionId: 'log'
            }
        ];

        buttons.forEach(item => mainContainer.appendChild(createActionButton(item)));
        document.body.appendChild(mainContainer);
        applySavedPosition(mainContainer);
        setupDraggable(mainContainer);
        log('按钮容器初始化完成');
    }

    function boot() {
        if (STATE.initialized) return;
        STATE.initialized = true;
        registerConfigMenus();
        initButtons();
        log('客诉助手已启动');
    }

    if (document.body) {
        boot();
    } else {
        window.addEventListener('DOMContentLoaded', boot, { once: true });
    }
})();

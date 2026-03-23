// ==UserScript==
// @name         工单助手 - 自动翻译和标记标题 v1.3
// @namespace    http://tampermonkey.net/
// @version      1.3
// @description  自动检测"任务标题"字段，翻译冒号后内容，并根据ServerID标记测服/全服
// @author       ll96victor
// @match        https://ml-panel.aihelp.net/dashboard/*
// @grant        GM_xmlhttpRequest
// @run-at       document-idle
// ==/UserScript==

(function() {
    'use strict';

    // 配置
    const CONFIG = {
        debug: false,
        translationService: 'google',
        checkInterval: 2000,
        maxRetries: 3
    };

    // 防抖函数
    function debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    // 简单的日志函数
    function log(...args) {
        if (CONFIG.debug) {
            console.log('[工单助手]', ...args);
        }
    }

    // 检查元素是否可见
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

    // 查找输入框元素
    function findInputElement(titleElement) {
        // 方法1: 通过label的for属性
        if (titleElement.tagName === 'LABEL') {
            const forAttr = titleElement.getAttribute('for');
            if (forAttr) {
                const input = document.getElementById(forAttr);
                if (input && (input.tagName === 'INPUT' || input.tagName === 'TEXTAREA')) {
                    return input;
                }
            }
        }

        // 方法2: 在父元素中查找
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

        // 方法3: 查找相邻的input
        let sibling = titleElement.nextElementSibling;
        while (sibling) {
            if (sibling.tagName === 'INPUT' || sibling.tagName === 'TEXTAREA') {
                if (isElementVisible(sibling)) {
                    return sibling;
                }
            }
            sibling = sibling.nextElementSibling;
        }

        return null;
    }

    // 使用免费的Google翻译
    function translateWithGoogle(text, retryCount = 0) {
        return new Promise((resolve, reject) => {
            // Google翻译的免费API端点
            const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=zh-CN&dt=t&q=${encodeURIComponent(text)}`;

            GM_xmlhttpRequest({
                method: 'GET',
                url: url,
                timeout: 10000,
                onload: function(response) {
                    try {
                        if (response.status === 200) {
                            const data = JSON.parse(response.responseText);
                            if (data && data[0] && data[0][0] && data[0][0][0]) {
                                const translatedText = data[0][0][0];
                                log('Google翻译成功:', text, '->', translatedText);
                                resolve(translatedText);
                            } else {
                                log('Google翻译返回格式异常');
                                resolve(text);
                            }
                        } else if (retryCount < CONFIG.maxRetries) {
                            log(`Google翻译失败，状态码: ${response.status}，重试 ${retryCount + 1}/${CONFIG.maxRetries}`);
                            setTimeout(() => {
                                translateWithGoogle(text, retryCount + 1)
                                    .then(resolve)
                                    .catch(() => resolve(text));
                            }, 1000);
                        } else {
                            log('Google翻译失败，返回原文本');
                            resolve(text);
                        }
                    } catch (e) {
                        log('解析翻译响应时出错:', e);
                        if (retryCount < CONFIG.maxRetries) {
                            setTimeout(() => {
                                translateWithGoogle(text, retryCount + 1)
                                    .then(resolve)
                                    .catch(() => resolve(text));
                            }, 1000);
                        } else {
                            resolve(text);
                        }
                    }
                },
                onerror: function(error) {
                    log('Google翻译请求出错:', error);
                    if (retryCount < CONFIG.maxRetries) {
                        setTimeout(() => {
                            translateWithGoogle(text, retryCount + 1)
                                .then(resolve)
                                .catch(() => resolve(text));
                        }, 1000);
                    } else {
                        resolve(text);
                    }
                },
                ontimeout: function() {
                    log('Google翻译请求超时');
                    if (retryCount < CONFIG.maxRetries) {
                        setTimeout(() => {
                            translateWithGoogle(text, retryCount + 1)
                                .then(resolve)
                                .catch(() => resolve(text));
                        }, 1000);
                    } else {
                        resolve(text);
                    }
                }
            });
        });
    }

    // 判断文本是否为中文
    function isChinese(text) {
        return /[\u4e00-\u9fff]/.test(text);
    }

    // 提取第一个冒号后的文本（优化点1：只考虑第一个冒号）
    function extractTextAfterFirstColon(text) {
        // 查找第一个冒号（中文或英文）的位置
        let colonIndex = -1;

        // 先找中文冒号
        const chineseColonIndex = text.indexOf('：');
        // 再找英文冒号
        const englishColonIndex = text.indexOf(':');

        // 取最先出现的冒号
        if (chineseColonIndex !== -1 && englishColonIndex !== -1) {
            colonIndex = Math.min(chineseColonIndex, englishColonIndex);
        } else if (chineseColonIndex !== -1) {
            colonIndex = chineseColonIndex;
        } else if (englishColonIndex !== -1) {
            colonIndex = englishColonIndex;
        }

        if (colonIndex === -1) {
            return '';
        }

        // 提取冒号后的文本（包含空格）
        const textAfterColon = text.substring(colonIndex + 1).trim();
        return textAfterColon;
    }

    // 提取第一个冒号前的文本
    function extractTextBeforeFirstColon(text) {
        // 查找第一个冒号（中文或英文）的位置
        let colonIndex = -1;

        // 先找中文冒号
        const chineseColonIndex = text.indexOf('：');
        // 再找英文冒号
        const englishColonIndex = text.indexOf(':');

        // 取最先出现的冒号
        if (chineseColonIndex !== -1 && englishColonIndex !== -1) {
            colonIndex = Math.min(chineseColonIndex, englishColonIndex);
        } else if (chineseColonIndex !== -1) {
            colonIndex = chineseColonIndex;
        } else if (englishColonIndex !== -1) {
            colonIndex = englishColonIndex;
        }

        if (colonIndex === -1) {
            return text;
        }

        // 提取冒号前的文本
        const textBeforeColon = text.substring(0, colonIndex).trim();
        return textBeforeColon;
    }

    // 检查是否已经处理过（避免重复处理）
    function isAlreadyProcessed(inputElement, serverInfo) {
        if (!inputElement) return true;

        const currentValue = inputElement.value || '';
        const expectedPrefix = serverInfo ? serverInfo.prefix : '';

        // 如果已经有我们添加的前缀，说明已经处理过
        if (expectedPrefix && currentValue.startsWith(expectedPrefix)) {
            return true;
        }

        return false;
    }

    // 查找ServerID并判断服务器类型
    function checkServerType() {
        // 尝试多种方式查找ServerID
        const pageText = document.body.innerText || document.body.textContent;
        const serverIdMatch = pageText.match(/ServerID\s*[=:]\s*(\d+)/i);

        if (serverIdMatch) {
            const serverId = serverIdMatch[1];
            log('找到ServerID:', serverId);

            if (serverId.startsWith('57')) {
                return {
                    type: 'test',
                    prefix: '【2.1.52测服】：',
                    serverId: serverId
                };
            } else {
                return {
                    type: 'full',
                    prefix: '【2.1.40全服】：',
                    serverId: serverId
                };
            }
        }

        log('未找到ServerID');
        return null;
    }

    // 处理标题翻译和更新
    async function processTitle(inputElement, serverInfo) {
        if (!inputElement || inputElement.disabled || inputElement.readOnly) {
            log('输入框不可编辑，跳过处理');
            return false;
        }

        const currentValue = inputElement.value || '';
        log('当前标题值:', currentValue);

        // 检查是否已经处理过
        if (isAlreadyProcessed(inputElement, serverInfo)) {
            log('标题已经处理过，跳过');
            return false;
        }

        // 提取第一个冒号后的文本（优化点1）
        const textAfterFirstColon = extractTextAfterFirstColon(currentValue);

        if (!textAfterFirstColon) {
            log('未找到冒号后的文本');
            // 如果没有冒号，直接用服务器前缀替换整个标题
            const newTitle = serverInfo ? serverInfo.prefix + currentValue : currentValue;
            if (inputElement.value !== newTitle) {
                inputElement.value = newTitle;
                inputElement.dispatchEvent(new Event('input', { bubbles: true }));
                inputElement.dispatchEvent(new Event('change', { bubbles: true }));
                log('已添加服务器前缀:', newTitle);
                return true;
            }
            return false;
        }

        // 优化点3：判断冒号后的文本是否包含中文
        const hasChineseInTextAfterColon = isChinese(textAfterFirstColon);

        let translatedText = textAfterFirstColon;

        // 如果冒号后的文本包含中文，则不翻译
        if (!hasChineseInTextAfterColon) {
            // 翻译冒号后的文本
            log('开始翻译冒号后文本:', textAfterFirstColon);
            translatedText = await translateText(textAfterFirstColon);
            log('翻译结果:', translatedText);
        } else {
            log('冒号后文本包含中文，不进行翻译');
        }

        // 构建新标题（优化点2：修正冒号问题）
        let newTitle;
        if (serverInfo) {
            // 格式：服务器前缀 + 翻译文本 + 原冒号后文本
            // 注意：服务器前缀已经包含了一个冒号，所以不需要额外添加冒号
            // 翻译文本直接接在服务器前缀后面，然后加上原冒号后文本
            newTitle = serverInfo.prefix + translatedText + ' ' + textAfterFirstColon;
        } else {
            // 如果没有服务器信息，提取冒号前的文本
            const textBeforeColon = extractTextBeforeFirstColon(currentValue);
            // 格式：原冒号前文本 + 冒号 + 翻译文本 + 原冒号后文本
            newTitle = textBeforeColon + '：' + translatedText + ' ' + textAfterFirstColon;
        }

        // 更新标题
        if (inputElement.value !== newTitle) {
            inputElement.value = newTitle;
            inputElement.dispatchEvent(new Event('input', { bubbles: true }));
            inputElement.dispatchEvent(new Event('change', { bubbles: true }));
            log('已更新标题:', newTitle);
            return true;
        }

        return false;
    }

    // 主翻译函数
    async function translateText(text) {
        if (!text || text.trim() === '') {
            return text;
        }

        // 尝试使用Google翻译
        try {
            return await translateWithGoogle(text);
        } catch (error) {
            log('翻译过程中出错:', error);
            return text;
        }
    }

    // 主处理函数
    async function processPage() {
        log('开始扫描页面...');

        // 检查ServerID
        const serverInfo = checkServerType();

        // 查找"任务标题 *"
        const titleElements = [];
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
                    titleElements.push(parent);
                }
            }
        }

        if (titleElements.length === 0) {
            log('未找到"任务标题"元素');
            return;
        }

        log(`找到${titleElements.length}个"任务标题"元素`);

        // 处理每个找到的标题元素
        let processedCount = 0;
        for (const titleElement of titleElements) {
            const inputElement = findInputElement(titleElement);
            if (!inputElement) {
                log('未找到对应的输入框');
                continue;
            }

            const wasProcessed = await processTitle(inputElement, serverInfo);
            if (wasProcessed) {
                processedCount++;
            }
        }

        if (processedCount > 0) {
            log(`成功处理了${processedCount}个标题`);
        }
    }

    // 创建状态指示器
    function createStatusIndicator() {
        const indicator = document.createElement('div');
        indicator.id = 'tm-task-helper-indicator';
        indicator.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            background: #4CAF50;
            color: white;
            padding: 8px 12px;
            border-radius: 4px;
            font-size: 12px;
            font-family: Arial, sans-serif;
            z-index: 999999;
            opacity: 0.9;
            box-shadow: 0 2px 10px rgba(0,0,0,0.2);
            cursor: pointer;
        `;
        indicator.innerHTML = '工单助手已启用';
        indicator.addEventListener('click', () => {
            processPage();
            indicator.style.background = '#2196F3';
            indicator.innerHTML = '正在处理...';
            setTimeout(() => {
                indicator.style.background = '#4CAF50';
                indicator.innerHTML = '工单助手已启用';
            }, 2000);
        });

        document.body.appendChild(indicator);
        return indicator;
    }

    // 监听DOM变化
    function observeDOMChanges() {
        const observer = new MutationObserver(debounce((mutations) => {
            let shouldProcess = false;

            for (const mutation of mutations) {
                if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                    shouldProcess = true;
                    break;
                }

                if (mutation.type === 'characterData' || mutation.type === 'attributes') {
                    const target = mutation.target;
                    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' ||
                        (target.parentElement && (target.parentElement.tagName === 'INPUT' || target.parentElement.tagName === 'TEXTAREA'))) {
                        shouldProcess = true;
                        break;
                    }
                }
            }

            if (shouldProcess) {
                processPage();
            }
        }, 1000));

        observer.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true,
            characterData: true,
            attributeFilter: ['value', 'placeholder', 'class', 'style']
        });

        log('已启动DOM变化监听');
        return observer;
    }

    // 初始化
    function init() {
        log('工单助手 v1.3 初始化...');

        // 创建状态指示器
        createStatusIndicator();

        // 初始处理
        setTimeout(() => {
            processPage();
        }, 1500);

        // 定期检查
        setInterval(() => {
            processPage();
        }, CONFIG.checkInterval);

        // 监听路由变化
        let lastUrl = location.href;
        setInterval(() => {
            if (location.href !== lastUrl) {
                lastUrl = location.href;
                setTimeout(() => {
                    processPage();
                }, 500);
            }
        }, 500);

        // 监听DOM变化
        observeDOMChanges();
    }

    // 等待页面加载
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        setTimeout(init, 1000);
    }
})();
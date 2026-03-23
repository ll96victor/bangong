// ==UserScript==
// @name         飞书搜索定位助手
// @namespace    http://tampermonkey.net/
// @version      2.0.0
// @description  点击按钮自动复制关键词并搜索定位到版本更新记录
// @author       You
// @match        *://moonton.feishu.cn/*
// @grant        none
// @license      MIT
// ==/UserScript==

(function() {
    'use strict';

    const ID_PREFIX = 'feishu_scroll_helper_';
    const CONTAINER_ID = ID_PREFIX + 'container';
    
    const CSS = `
        #${CONTAINER_ID} {
            position: fixed;
            right: 20px;
            bottom: 20px;
            z-index: 2147483647;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        }
        .${ID_PREFIX}btn {
            width: 50px;
            height: 50px;
            border-radius: 50%;
            background: rgba(0, 0, 0, 0.7);
            color: white;
            border: none;
            cursor: pointer;
            font-size: 20px;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: background 0.2s ease;
            user-select: none;
            box-shadow: 0 2px 8px rgba(0,0,0,0.3);
        }
        .${ID_PREFIX}btn:hover {
            background: rgba(0, 0, 0, 0.9);
        }
    `;

    let container = null;

    function injectStyles() {
        const style = document.createElement('style');
        style.textContent = CSS;
        document.head.appendChild(style);
    }

    function createButtons() {
        container = document.createElement('div');
        container.id = CONTAINER_ID;

        const searchBtn = document.createElement('button');
        searchBtn.className = ID_PREFIX + 'btn';
        searchBtn.textContent = '🔍';
        searchBtn.title = '点击搜索定位';
        searchBtn.addEventListener('click', doSearch);

        container.appendChild(searchBtn);
        document.body.appendChild(container);
    }

    function doSearch() {
        const keyword = '【Version Log】版本更新记录 NEXT UPDATE: ALL SERVER 2.1.40 ( estimated 2025 DEC 18 )';
        
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(keyword).then(function() {
                triggerSearch();
            }).catch(function() {
                fallbackCopy(keyword);
                triggerSearch();
            });
        } else {
            fallbackCopy(keyword);
            triggerSearch();
        }
    }
    
    function triggerSearch() {
        setTimeout(function() {
            const ctrlF = new KeyboardEvent('keydown', {
                key: 'f',
                code: 'KeyF',
                keyCode: 70,
                which: 70,
                ctrlKey: true,
                bubbles: true,
                cancelable: true
            });
            document.dispatchEvent(ctrlF);
            
            setTimeout(function() {
                const ctrlV = new KeyboardEvent('keydown', {
                    key: 'v',
                    code: 'KeyV',
                    keyCode: 86,
                    which: 86,
                    ctrlKey: true,
                    bubbles: true,
                    cancelable: true
                });
                document.dispatchEvent(ctrlV);
                
                setTimeout(function() {
                    const enter = new KeyboardEvent('keydown', {
                        key: 'Enter',
                        code: 'Enter',
                        keyCode: 13,
                        which: 13,
                        bubbles: true,
                        cancelable: true
                    });
                    document.dispatchEvent(enter);
                }, 300);
            }, 300);
        }, 200);
    }
    
    function fallbackCopy(text) {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.left = '-9999px';
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        
        try {
            document.execCommand('copy');
        } catch (err) {}
        
        document.body.removeChild(textarea);
    }

    function init() {
        injectStyles();
        createButtons();

        const observer = new MutationObserver(function() {
            if (!container || !document.body.contains(container)) {
                createButtons();
            }
        });

        observer.observe(document.body, { childList: true, subtree: true });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();

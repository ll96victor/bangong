// ==UserScript==
// @name         腾讯云文档表格 - 一键跳转顶部/底部 (修复版)
// @namespace    https://docs.qq.com/
// @version      2.0.0
// @description  在腾讯云文档（表格）中添加悬浮按钮，一键直达顶部或底部（多策略兼容）
// @author       Tabbit Expert
// @match        https://docs.qq.com/sheet/*
// @match        https://docs.qq.com/desktop/*
// @match        https://moonton.feishu.cn/wiki/*
// @grant        unsafeWindow
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  const win = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;

  // ─── 策略一：尝试调用腾讯文档内部暴露的 spreadsheet 实例 API ──────
  function tryInternalAPI(type) {
    try {
      // 腾讯文档在 window 上挂载了 TDAPP / sheets 等命名空间
      // 遍历常见路径寻找 spreadsheet 实例
      const candidates = [
        win.sheets,
        win.spreadsheet,
        win.sheetInstance,
        win.app && win.app.spreadsheet,
        win.TDApp && win.TDApp.spreadsheet,
      ].filter(Boolean);

      for (const inst of candidates) {
        // 尝试常见的跳转方法名
        if (type === 'top') {
          if (typeof inst.scrollToTop === 'function')    { inst.scrollToTop(); return true; }
          if (typeof inst.gotoCell === 'function')       { inst.gotoCell(0, 0); return true; }
          if (typeof inst.setCursor === 'function')      { inst.setCursor(0, 0); return true; }
        } else {
          if (typeof inst.scrollToBottom === 'function') { inst.scrollToBottom(); return true; }
          if (typeof inst.gotoEnd === 'function')        { inst.gotoEnd(); return true; }
        }
      }
    } catch (e) {}
    return false;
  }

  // ─── 策略二：通过 React Fiber 找到表格组件实例调用方法 ────────────
  function getFiberInstance(el) {
    if (!el) return null;
    const key = Object.keys(el).find(k =>
      k.startsWith('__reactFiber') || k.startsWith('__reactInternalInstance')
    );
    if (!key) return null;
    let fiber = el[key];
    while (fiber) {
      const inst = fiber.stateNode;
      if (inst && typeof inst === 'object') {
        if (typeof inst.scrollToTop === 'function' ||
            typeof inst.scrollToBottom === 'function' ||
            typeof inst.gotoCell === 'function') {
          return inst;
        }
      }
      fiber = fiber.return;
    }
    return null;
  }

  function tryReactFiber(type) {
    try {
      const canvas = document.querySelector('canvas');
      const container = canvas
        ? canvas.closest('[class*="sheet"], [class*="spread"], [class*="grid"]')
        : null;
      const targets = [canvas, container].filter(Boolean);

      for (const el of targets) {
        const inst = getFiberInstance(el);
        if (!inst) continue;
        if (type === 'top') {
          if (typeof inst.scrollToTop === 'function')  { inst.scrollToTop(); return true; }
          if (typeof inst.gotoCell === 'function')     { inst.gotoCell(0, 0); return true; }
        } else {
          if (typeof inst.scrollToBottom === 'function') { inst.scrollToBottom(); return true; }
          if (typeof inst.gotoEnd === 'function')        { inst.gotoEnd(); return true; }
        }
      }
    } catch (e) {}
    return false;
  }

  // ─── 策略三：精准模拟鼠标点击聚焦 Canvas + 键盘事件（修复版）──────
  // 关键修复：必须先 mousedown/mouseup/click 让 Canvas 真正获得焦点
  function tryKeyboardSimulate(type) {
    try {
      const canvas = document.querySelector('canvas');
      if (!canvas) return false;

      // 1. 先模拟点击 Canvas 中心，让其获得焦点
      const rect = canvas.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;

      ['mousedown', 'mouseup', 'click'].forEach(evtType => {
        canvas.dispatchEvent(new MouseEvent(evtType, {
          bubbles: true, cancelable: true,
          clientX: cx, clientY: cy,
          button: 0,
        }));
      });

      canvas.focus();

      // 2. 短暂延迟后再发送键盘事件（等待焦点生效）
      setTimeout(() => {
        const key  = type === 'top' ? 'Home' : 'End';
        const code = type === 'top' ? 'Home' : 'End';

        ['keydown', 'keypress', 'keyup'].forEach(evtType => {
          canvas.dispatchEvent(new KeyboardEvent(evtType, {
            key, code,
            ctrlKey: true,
            keyCode: type === 'top' ? 36 : 35,
            which:   type === 'top' ? 36 : 35,
            bubbles: true,
            cancelable: true,
            composed: true,
          }));
        });
      }, 80);

      return true;
    } catch (e) {}
    return false;
  }

  // ─── 策略四：暴力滚动所有可滚动容器 ────────────────────────────────
  function tryScrollAll(type) {
    try {
      // 收集所有可滚动元素（含 window）
      const scrollables = Array.from(document.querySelectorAll('*')).filter(el => {
        const { overflow, overflowY } = getComputedStyle(el);
        const scrollable = /(auto|scroll)/.test(overflow + overflowY);
        return scrollable && el.scrollHeight > el.clientHeight + 50;
      });

      // 按 scrollHeight 降序，优先滚动最大的容器
      scrollables
        .sort((a, b) => b.scrollHeight - a.scrollHeight)
        .slice(0, 3) // 只操作前3个最大的
        .forEach(el => {
          el.scrollTop = type === 'top' ? 0 : el.scrollHeight;
        });

      // 同时滚动 window
      window.scrollTo({ top: type === 'top' ? 0 : document.body.scrollHeight, behavior: 'smooth' });
      return true;
    } catch (e) {}
    return false;
  }

  // ─── 主跳转函数：依次尝试所有策略 ───────────────────────────────────
  function jump(type) {
    console.log(`[QQ Docs Jump] 尝试跳转: ${type}`);

    if (tryInternalAPI(type))        { console.log('[QQ Docs Jump] ✓ 策略一（内部API）成功'); return; }
    if (tryReactFiber(type))         { console.log('[QQ Docs Jump] ✓ 策略二（React Fiber）成功'); return; }
    if (tryKeyboardSimulate(type))   { console.log('[QQ Docs Jump] ✓ 策略三（键盘模拟）触发'); }
    tryScrollAll(type);              console.log('[QQ Docs Jump] ✓ 策略四（暴力滚动）触发');
  }

  // ─── 创建悬浮按钮 ────────────────────────────────────────────────────
  function createFloatButtons() {
    if (document.getElementById('qqsheet-jump-btns')) return;

    const wrapper = document.createElement('div');
    wrapper.id = 'qqsheet-jump-btns';
    Object.assign(wrapper.style, {
      position:      'fixed',
      right:         '24px',
      bottom:        '80px',
      zIndex:        '2147483647',
      display:       'flex',
      flexDirection: 'column',
      gap:           '10px',
      userSelect:    'none',
    });

    function makeBtn(label, title, type) {
      const btn = document.createElement('button');
      btn.innerHTML = label;
      btn.title = title;
      Object.assign(btn.style, {
        width:        '44px',
        height:       '44px',
        borderRadius: '50%',
        border:       '2px solid rgba(255,255,255,0.3)',
        background:   '#0052d9',
        color:        '#fff',
        fontSize:     '22px',
        lineHeight:   '40px',
        textAlign:    'center',
        cursor:       'pointer',
        boxShadow:    '0 3px 12px rgba(0,82,217,0.45)',
        transition:   'all 0.18s',
        padding:      '0',
        outline:      'none',
        display:      'block',
      });
      btn.addEventListener('mouseenter', () => {
        btn.style.background = '#003eb3';
        btn.style.transform  = 'scale(1.12)';
      });
      btn.addEventListener('mouseleave', () => {
        btn.style.background = '#0052d9';
        btn.style.transform  = 'scale(1)';
      });
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        jump(type);
      });
      return btn;
    }

    wrapper.appendChild(makeBtn('⇧', '跳转到顶部 (Ctrl+Home)', 'top'));
    wrapper.appendChild(makeBtn('⇩', '跳转到底部 (Ctrl+End)',  'bottom'));
    document.body.appendChild(wrapper);
    console.log('[QQ Docs Jump] 悬浮按钮注入成功');
  }

  // ─── 等待页面加载完成后注入 ──────────────────────────────────────────
  function init() {
    if (document.body) {
      createFloatButtons();
    } else {
      document.addEventListener('DOMContentLoaded', createFloatButtons);
    }

    // 腾讯文档是 SPA，路由切换后需重新注入
    const observer = new MutationObserver(() => {
      if (!document.getElementById('qqsheet-jump-btns')) {
        createFloatButtons();
      }
    });
    observer.observe(document.body, { childList: true, subtree: false });
  }

  // 延迟 2 秒等待腾讯文档 JS 框架初始化完毕
  setTimeout(init, 2000);

})();

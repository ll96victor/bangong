// ==UserScript==
// @name         平滑滚动导航器 v2（兼容SPA）
// @namespace    http://tampermonkey.net/
// @version      2.0.0
// @description  在网页显示可拖动的上下滚动按钮，兼容豆包/ChatGPT等SPA页面
// @author       Tabbit
// @match        *://*/*
// @grant        GM_addStyle
// ==/UserScript==

(function () {
  'use strict';

  GM_addStyle(`
    #scroll-navigator {
      position: fixed;
      right: 24px;
      bottom: 80px;
      z-index: 2147483647;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
      user-select: none;
      touch-action: none;
    }
    #scroll-navigator .scroll-btn {
      width: 42px;
      height: 42px;
      border-radius: 50%;
      background: rgba(30, 30, 40, 0.82);
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
      border: 1.5px solid rgba(255,255,255,0.15);
      color: #fff;
      font-size: 18px;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      box-shadow: 0 4px 16px rgba(0,0,0,0.28);
      transition: background 0.18s, transform 0.12s, box-shadow 0.18s;
    }
    #scroll-navigator .scroll-btn:hover {
      background: rgba(60,60,80,0.95);
      box-shadow: 0 6px 24px rgba(0,0,0,0.38);
      transform: scale(1.10);
    }
    #scroll-navigator .scroll-btn:active { transform: scale(0.95); }
    #scroll-navigator .scroll-btn.scrolling { background: rgba(80,120,220,0.90); }
    #scroll-navigator .drag-handle {
      width: 42px;
      height: 18px;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: grab;
      opacity: 0.45;
      transition: opacity 0.18s;
    }
    #scroll-navigator .drag-handle:active { cursor: grabbing; opacity: 0.85; }
  `);

  // ─── 创建 DOM ────────────────────────────────────────────────────
  const nav = document.createElement('div');
  nav.id = 'scroll-navigator';

  const handle = document.createElement('div');
  handle.className = 'drag-handle';
  handle.title = '拖动移动位置';
  handle.innerHTML = `<svg width="22" height="10" viewBox="0 0 22 10" fill="none">
    <rect x="2" y="1" width="18" height="2" rx="1" fill="white"/>
    <rect x="2" y="7" width="18" height="2" rx="1" fill="white"/>
  </svg>`;

  const btnUp = document.createElement('div');
  btnUp.className = 'scroll-btn';
  btnUp.title = '滚动到顶部';
  btnUp.innerHTML = `<svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <path d="M8 3L2 10h12L8 3z" fill="white"/>
    <rect x="3" y="12" width="10" height="2" rx="1" fill="white"/>
  </svg>`;

  const btnDown = document.createElement('div');
  btnDown.className = 'scroll-btn';
  btnDown.title = '滚动到底部';
  btnDown.innerHTML = `<svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <path d="M8 13L2 6h12L8 13z" fill="white"/>
    <rect x="3" y="2" width="10" height="2" rx="1" fill="white"/>
  </svg>`;

  nav.appendChild(handle);
  nav.appendChild(btnUp);
  nav.appendChild(btnDown);
  document.body.appendChild(nav);

  // ─── 核心：动态查找真正可滚动的元素 ─────────────────────────────
  /**
   * 遍历整个 DOM，找出 scrollHeight 最大且当前有溢出滚动的元素
   * 优先选取 overflow 为 auto/scroll、且内容比容器高的节点
   */
  function findBestScrollEl() {
    // 先检查 window 本身
    const winScrollable =
      document.documentElement.scrollHeight > window.innerHeight + 2;

    let best = null;
    let bestScore = 0;

    // 遍历所有可见元素
    const all = document.querySelectorAll('*');
    for (const el of all) {
      // 跳过脚本自身的面板
      if (el.id === 'scroll-navigator') continue;

      const style = window.getComputedStyle(el);
      const overflowY = style.overflowY;
      const isScrollable = overflowY === 'auto' || overflowY === 'scroll' ||
                           overflowY === 'overlay';
      if (!isScrollable) continue;

      const scrollable = el.scrollHeight - el.clientHeight;
      if (scrollable < 50) continue; // 太小忽略

      // 评分：可滚动距离越大越优先
      const score = scrollable;
      if (score > bestScore) {
        bestScore = score;
        best = el;
      }
    }

    // 如果找到了内部滚动容器，优先用它；否则降级用 window
    if (best) return best;
    if (winScrollable) return document.documentElement;
    return document.documentElement;
  }

  // ─── 平滑滚动 ────────────────────────────────────────────────────
  let rafId = null;

  function smoothScrollTo(direction) {
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }

    const el = findBestScrollEl();
    const isRoot = el === document.documentElement || el === document.body;

    const getY   = () => isRoot ? window.scrollY : el.scrollTop;
    const getMax = () => isRoot
      ? document.documentElement.scrollHeight - window.innerHeight
      : el.scrollHeight - el.clientHeight;

    const target = direction === 'top' ? 0 : getMax();
    const startY = getY();
    const distance = target - startY;

    if (Math.abs(distance) < 1) return;

    const duration = Math.min(1400, Math.max(300, Math.abs(distance) * 0.55));
    let startTime = null;

    btnUp.classList.toggle('scrolling', direction === 'top');
    btnDown.classList.toggle('scrolling', direction === 'bottom');

    // easeInOutCubic
    const ease = t => t < 0.5 ? 4*t*t*t : 1 - Math.pow(-2*t+2, 3)/2;

    function step(ts) {
      if (!startTime) startTime = ts;
      const p = Math.min((ts - startTime) / duration, 1);
      const y = startY + distance * ease(p);

      if (isRoot) window.scrollTo(0, y);
      else el.scrollTop = y;

      if (p < 1) {
        rafId = requestAnimationFrame(step);
      } else {
        rafId = null;
        btnUp.classList.remove('scrolling');
        btnDown.classList.remove('scrolling');
      }
    }

    rafId = requestAnimationFrame(step);
  }

  btnUp.addEventListener('click',   () => smoothScrollTo('top'));
  btnDown.addEventListener('click', () => smoothScrollTo('bottom'));

  // ─── 拖动逻辑 ────────────────────────────────────────────────────
  let dragging = false, dragOffX = 0, dragOffY = 0;

  handle.addEventListener('pointerdown', e => {
    dragging = true;
    handle.setPointerCapture(e.pointerId);
    const r = nav.getBoundingClientRect();
    dragOffX = e.clientX - r.left;
    dragOffY = e.clientY - r.top;
    e.preventDefault();
  });

  document.addEventListener('pointermove', e => {
    if (!dragging) return;
    const vw = window.innerWidth, vh = window.innerHeight;
    let l = Math.max(4, Math.min(vw - nav.offsetWidth  - 4, e.clientX - dragOffX));
    let t = Math.max(4, Math.min(vh - nav.offsetHeight - 4, e.clientY - dragOffY));
    nav.style.right  = 'unset';
    nav.style.bottom = 'unset';
    nav.style.left   = l + 'px';
    nav.style.top    = t + 'px';
  });

  document.addEventListener('pointerup', () => {
    if (!dragging) return;
    dragging = false;
    try {
      localStorage.setItem('__snav_pos', JSON.stringify({
        left: nav.style.left, top: nav.style.top
      }));
    } catch(_) {}
  });

  // ─── 恢复位置 ────────────────────────────────────────────────────
  try {
    const pos = JSON.parse(localStorage.getItem('__snav_pos') || 'null');
    if (pos && pos.left) {
      nav.style.right  = 'unset';
      nav.style.bottom = 'unset';
      nav.style.left   = pos.left;
      nav.style.top    = pos.top;
    }
  } catch(_) {}

})();

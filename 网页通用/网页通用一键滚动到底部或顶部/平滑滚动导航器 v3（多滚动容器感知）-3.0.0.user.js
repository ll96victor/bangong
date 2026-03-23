// ==UserScript==
// @name         平滑滚动导航器 v3（多滚动容器感知）
// @namespace    http://tampermonkey.net/
// @version      3.0.0
// @description  智能感知多滚动容器，优先滚动鼠标所在区域，支持手动锁定目标
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
    #scroll-navigator .scroll-btn.locked   { background: rgba(220,120,40,0.90); }
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

    /* 锁定目标时，在目标元素上显示高亮边框 */
    .__snav_locked_highlight {
      outline: 2px dashed rgba(220,120,40,0.75) !important;
      outline-offset: -2px !important;
    }
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
  btnUp.title = '滚动到顶部（基于鼠标位置）';
  btnUp.innerHTML = `<svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <path d="M8 3L2 10h12L8 3z" fill="white"/>
    <rect x="3" y="12" width="10" height="2" rx="1" fill="white"/>
  </svg>`;

  const btnDown = document.createElement('div');
  btnDown.className = 'scroll-btn';
  btnDown.title = '滚动到底部（基于鼠标位置）';
  btnDown.innerHTML = `<svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <path d="M8 13L2 6h12L8 13z" fill="white"/>
    <rect x="3" y="2" width="10" height="2" rx="1" fill="white"/>
  </svg>`;

  // 锁定按钮：点击后进入"选择模式"，再点击页面某处锁定该滚动容器
  const btnLock = document.createElement('div');
  btnLock.className = 'scroll-btn';
  btnLock.title = '锁定目标容器（点击后移动鼠标到目标区域再点击）';
  btnLock.innerHTML = `<svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <rect x="5" y="7" width="6" height="6" rx="1" fill="white"/>
    <path d="M5 7V5a3 3 0 0 1 6 0v2" stroke="white" stroke-width="1.5" fill="none"/>
  </svg>`;

  nav.appendChild(handle);
  nav.appendChild(btnUp);
  nav.appendChild(btnDown);
  nav.appendChild(btnLock);
  document.body.appendChild(nav);

  // ─── 状态 ────────────────────────────────────────────────────────
  let mouseX = window.innerWidth / 2;
  let mouseY = window.innerHeight / 2;
  let lockedEl = null;       // 手动锁定的滚动容器
  let pickMode = false;      // 是否处于"选择锁定目标"模式
  let hoverHighlight = null; // 选择模式下鼠标悬停高亮的元素

  // 持续追踪鼠标位置（排除导航器自身）
  document.addEventListener('mousemove', e => {
    if (!nav.contains(e.target)) {
      mouseX = e.clientX;
      mouseY = e.clientY;
    }
    if (pickMode) updatePickHighlight(e.clientX, e.clientY);
  }, true);

  // ─── 核心：从鼠标位置向上查找最近可滚动祖先 ─────────────────────

  /**
   * 判断元素是否可滚动（纵向）
   */
  function isScrollableY(el) {
    if (el === document.documentElement || el === document.body) return true;
    const style = window.getComputedStyle(el);
    const oy = style.overflowY;
    if (oy !== 'auto' && oy !== 'scroll' && oy !== 'overlay') return false;
    return el.scrollHeight - el.clientHeight > 4;
  }

  /**
   * 从指定坐标向上遍历 DOM，返回最近的可滚动祖先
   * 这是多容器场景下最精准的策略
   */
  function findScrollElAtPoint(x, y) {
    // elementFromPoint 返回最顶层可见元素
    let el = document.elementFromPoint(x, y);
    while (el && el !== document.documentElement) {
      if (isScrollableY(el)) return el;
      el = el.parentElement;
    }
    // 兜底：用可见面积加权的全局最优容器
    return findBestVisibleScrollEl();
  }

  /**
   * 兜底策略：遍历全部滚动容器，以"可滚动距离 × 视口可见面积"综合评分
   */
  function findBestVisibleScrollEl() {
    const vw = window.innerWidth, vh = window.innerHeight;
    let best = null, bestScore = 0;

    document.querySelectorAll('*').forEach(el => {
      if (el.id === 'scroll-navigator') return;
      if (!isScrollableY(el)) return;

      const scrollable = el.scrollHeight - el.clientHeight;
      if (scrollable < 50) return;

      // 计算在视口中的可见面积
      const r = el.getBoundingClientRect();
      const visW = Math.max(0, Math.min(r.right, vw)  - Math.max(r.left, 0));
      const visH = Math.max(0, Math.min(r.bottom, vh) - Math.max(r.top, 0));
      const visArea = visW * visH;
      if (visArea < 100) return; // 几乎不可见则忽略

      // 综合评分：可滚动量 × 可见面积（归一化）
      const score = scrollable * (visArea / (vw * vh));
      if (score > bestScore) { bestScore = score; best = el; }
    });

    return best || document.documentElement;
  }

  /**
   * 最终对外接口：优先返回锁定容器，其次鼠标位置感知
   */
  function getTargetEl() {
    if (lockedEl) {
      // 检查锁定容器是否仍然有效
      if (document.contains(lockedEl) && isScrollableY(lockedEl)) return lockedEl;
      clearLock(); // 失效则自动解锁
    }
    return findScrollElAtPoint(mouseX, mouseY);
  }

  // ─── 锁定模式 ────────────────────────────────────────────────────

  function clearLock() {
    if (lockedEl) lockedEl.classList.remove('__snav_locked_highlight');
    lockedEl = null;
    btnLock.classList.remove('locked');
    btnLock.title = '锁定目标容器（点击后移动鼠标到目标区域再点击）';
  }

  function enterPickMode() {
    pickMode = true;
    btnLock.classList.add('scrolling');
    btnLock.title = '请将鼠标移到目标滚动区域，然后单击确认';
    document.body.style.cursor = 'crosshair';
  }

  function exitPickMode() {
    pickMode = false;
    btnLock.classList.remove('scrolling');
    document.body.style.cursor = '';
    if (hoverHighlight) {
      hoverHighlight.classList.remove('__snav_locked_highlight');
      hoverHighlight = null;
    }
  }

  function updatePickHighlight(x, y) {
    const candidate = findScrollElAtPoint(x, y);
    if (candidate === hoverHighlight) return;
    if (hoverHighlight) hoverHighlight.classList.remove('__snav_locked_highlight');
    hoverHighlight = candidate;
    if (hoverHighlight && hoverHighlight !== document.documentElement) {
      hoverHighlight.classList.add('__snav_locked_highlight');
    }
  }

  btnLock.addEventListener('click', e => {
    e.stopPropagation();
    if (lockedEl) { clearLock(); return; }
    if (!pickMode) { enterPickMode(); return; }
  });

  // 选择模式下点击页面确认锁定
  document.addEventListener('click', e => {
    if (!pickMode) return;
    if (nav.contains(e.target)) return;
    e.stopPropagation();
    e.preventDefault();

    const target = findScrollElAtPoint(e.clientX, e.clientY);
    exitPickMode();

    if (target && target !== document.documentElement) {
      lockedEl = target;
      lockedEl.classList.add('__snav_locked_highlight');
      btnLock.classList.add('locked');
      btnLock.title = '已锁定目标容器（再次点击解锁）';
    }
  }, true);

  // ESC 退出选择模式
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && pickMode) exitPickMode();
  });

  // ─── 平滑滚动 ────────────────────────────────────────────────────
  let rafId = null;

  function smoothScrollTo(direction) {
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }

    const el = getTargetEl();
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

  btnUp.addEventListener('click',   e => { e.stopPropagation(); smoothScrollTo('top'); });
  btnDown.addEventListener('click', e => { e.stopPropagation(); smoothScrollTo('bottom'); });

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

// ==UserScript==
// @name         平滑滚动导航器 v3.2.0（多滚动容器感知）
// @namespace    http://tampermonkey.net/
// @version      3.2.0
// @description  智能感知多滚动容器，优先滚动鼠标所在区域，支持手动锁定目标
// @author       ll96victor
// @match        *://*/*
// @grant        GM_addStyle
// ==/UserScript==

(function () {
  'use strict';

  // ─── 配置常量 ──────────────────────────────────────────────────────
  const CONFIG = {
    MIN_SCROLL_DISTANCE: 4,
    MIN_SCROLLABLE: 50,
    MIN_VISIBLE_AREA: 100,
    SCROLL_DURATION_MIN: 300,
    SCROLL_DURATION_MAX: 1400
  };

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

    .__snav_locked_highlight {
      outline: 2px dashed rgba(220,120,40,0.75) !important;
      outline-offset: -2px !important;
    }
  `);

  // ─── 工具函数 ──────────────────────────────────────────────────────
  const Storage = {
    get(key, fallback = null) {
      try {
        const val = localStorage.getItem(key);
        return val ? JSON.parse(val) : fallback;
      } catch { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
    }
  };

  function isElementVisible(el) {
    if (!el || !document.contains(el)) return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  // ─── 创建 DOM ──────────────────────────────────────────────────────
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

  // ─── 状态 ──────────────────────────────────────────────────────────
  let mouseX = window.innerWidth / 2;
  let mouseY = window.innerHeight / 2;
  let lockedEl = null;
  let pickMode = false;
  let hoverHighlight = null;

  // ─── 鼠标位置追踪 ──────────────────────────────────────────────────
  document.addEventListener('mousemove', e => {
    if (!nav.contains(e.target)) {
      mouseX = e.clientX;
      mouseY = e.clientY;
    }
    if (pickMode) updatePickHighlight(e.clientX, e.clientY);
  }, true);

  // ─── 核心：滚动容器查找 ────────────────────────────────────────────

  /**
   * 判断元素是否为真正可滚动的根元素（html 或 body）。
   * 许多 SPA 网站将 html/body 设为 overflow:hidden，由内部 div 承担滚动，
   * 此时根元素不应被视为可滚动。
   */
  function isRootActuallyScrollable() {
    const de = document.documentElement;
    const bd = document.body;
    if (!bd) return false;

    const deStyle = window.getComputedStyle(de);
    const bdStyle = window.getComputedStyle(bd);

    const deOY = deStyle.overflowY;
    const bdOY = bdStyle.overflowY;

    // 如果两者都是 hidden/clip，根元素不可滚动
    const hiddenValues = ['hidden', 'clip'];
    if (hiddenValues.includes(deOY) && hiddenValues.includes(bdOY)) return false;

    // 实际可滚动距离检测
    const scrollable = Math.max(
      de.scrollHeight - de.clientHeight,
      bd.scrollHeight - bd.clientHeight
    );
    return scrollable > CONFIG.MIN_SCROLL_DISTANCE;
  }

  function isScrollableY(el) {
    if (el === document.documentElement || el === document.body) {
      return isRootActuallyScrollable();
    }
    const style = window.getComputedStyle(el);
    const oy = style.overflowY;
    if (oy !== 'auto' && oy !== 'scroll' && oy !== 'overlay') return false;
    return el.scrollHeight - el.clientHeight > CONFIG.MIN_SCROLL_DISTANCE;
  }

  /**
   * 从 elementFromPoint 开始向上遍历，同时穿透 Shadow DOM。
   */
  function findScrollElAtPoint(x, y) {
    let el = document.elementFromPoint(x, y);
    if (!el) return findBestVisibleScrollEl();

    // 穿透 Shadow DOM：如果命中的元素有 shadowRoot，递归深入
    let deepEl = el;
    while (deepEl && deepEl.shadowRoot) {
      const inner = deepEl.shadowRoot.elementFromPoint(x, y);
      if (!inner || inner === deepEl) break;
      deepEl = inner;
    }
    el = deepEl;

    // 向上遍历查找可滚动祖先（包括跨越 Shadow DOM 边界）
    while (el) {
      if (el === document.documentElement) break;
      if (el.id === 'scroll-navigator') { el = el.parentElement || el.parentNode; continue; }

      if (el !== document.body && el !== document.documentElement) {
        const style = window.getComputedStyle(el);
        const oy = style.overflowY;
        if ((oy === 'auto' || oy === 'scroll' || oy === 'overlay') &&
            el.scrollHeight - el.clientHeight > CONFIG.MIN_SCROLL_DISTANCE) {
          return el;
        }
      }

      // 跨越 Shadow DOM 边界：如果没有 parentElement，尝试通过 host 跳出
      if (el.parentElement) {
        el = el.parentElement;
      } else if (el.parentNode && el.parentNode.host) {
        el = el.parentNode.host;
      } else {
        break;
      }
    }

    // 检测根元素是否可滚动
    if (isRootActuallyScrollable()) return document.documentElement;

    return findBestVisibleScrollEl();
  }

  /**
   * 收集所有可滚动容器（含 Shadow DOM 内部）
   */
  function collectScrollables(root, result) {
    const els = root.querySelectorAll('*');
    for (let i = 0; i < els.length; i++) {
      const el = els[i];
      if (el.id === 'scroll-navigator') continue;
      if (el === document.documentElement || el === document.body) continue;

      const style = window.getComputedStyle(el);
      const oy = style.overflowY;
      if ((oy === 'auto' || oy === 'scroll' || oy === 'overlay') &&
          el.scrollHeight - el.clientHeight > CONFIG.MIN_SCROLLABLE) {
        result.push(el);
      }

      // 深入 Shadow DOM
      if (el.shadowRoot) {
        collectScrollables(el.shadowRoot, result);
      }
    }
  }

  function findBestVisibleScrollEl() {
    const vw = window.innerWidth, vh = window.innerHeight;
    let best = null, bestScore = 0;

    const candidates = [];
    collectScrollables(document, candidates);

    for (let i = 0; i < candidates.length; i++) {
      const el = candidates[i];
      const scrollable = el.scrollHeight - el.clientHeight;

      const r = el.getBoundingClientRect();
      const visW = Math.max(0, Math.min(r.right, vw) - Math.max(r.left, 0));
      const visH = Math.max(0, Math.min(r.bottom, vh) - Math.max(r.top, 0));
      const visArea = visW * visH;
      if (visArea < CONFIG.MIN_VISIBLE_AREA) continue;

      const score = scrollable * (visArea / (vw * vh));
      if (score > bestScore) {
        bestScore = score;
        best = el;
      }
    }

    if (best) return best;

    // 最终兜底：如果根元素可滚动就用根元素
    if (isRootActuallyScrollable()) return document.documentElement;

    return document.documentElement;
  }

  function getTargetEl() {
    if (lockedEl) {
      if (document.contains(lockedEl) && isScrollableY(lockedEl) && isElementVisible(lockedEl)) {
        return lockedEl;
      }
      // lockedEl 可能在 Shadow DOM 内，document.contains 检测不到
      try {
        if (lockedEl.getRootNode() && lockedEl.isConnected &&
            isScrollableY(lockedEl) && isElementVisible(lockedEl)) {
          return lockedEl;
        }
      } catch {}
      clearLock();
    }
    return findScrollElAtPoint(mouseX, mouseY);
  }

  // ─── 锁定模式 ──────────────────────────────────────────────────────

  function clearLock() {
    if (lockedEl) {
      try { lockedEl.classList.remove('__snav_locked_highlight'); } catch {}
    }
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
      try { hoverHighlight.classList.remove('__snav_locked_highlight'); } catch {}
      hoverHighlight = null;
    }
  }

  function updatePickHighlight(x, y) {
    const candidate = findScrollElAtPoint(x, y);
    if (candidate === hoverHighlight) return;
    if (hoverHighlight) {
      try { hoverHighlight.classList.remove('__snav_locked_highlight'); } catch {}
    }
    hoverHighlight = candidate;
    if (hoverHighlight && hoverHighlight !== document.documentElement) {
      try { hoverHighlight.classList.add('__snav_locked_highlight'); } catch {}
    }
  }

  btnLock.addEventListener('click', e => {
    e.stopPropagation();
    if (lockedEl) { clearLock(); return; }
    if (!pickMode) { enterPickMode(); return; }
  });

  document.addEventListener('click', e => {
    if (!pickMode) return;
    if (nav.contains(e.target)) return;
    e.stopPropagation();
    e.preventDefault();

    const target = findScrollElAtPoint(e.clientX, e.clientY);
    exitPickMode();

    if (target && target !== document.documentElement) {
      lockedEl = target;
      try { lockedEl.classList.add('__snav_locked_highlight'); } catch {}
      btnLock.classList.add('locked');
      btnLock.title = '已锁定目标容器（再次点击解锁）';
    }
  }, true);

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && pickMode) exitPickMode();

    if (e.altKey && e.key === 'ArrowUp') {
      e.preventDefault();
      smoothScrollTo('top');
    }
    if (e.altKey && e.key === 'ArrowDown') {
      e.preventDefault();
      smoothScrollTo('bottom');
    }
  });

  // ─── 平滑滚动 ──────────────────────────────────────────────────────
  let rafId = null;

  function smoothScrollTo(direction) {
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }

    const el = getTargetEl();
    const isRoot = el === document.documentElement || el === document.body;

    const getY = () => {
      if (!isRoot) return el.scrollTop;
      // 兼容不同浏览器和文档模式
      return window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0;
    };
    const getMax = () => {
      if (!isRoot) return el.scrollHeight - el.clientHeight;
      return Math.max(
        document.documentElement.scrollHeight,
        document.body.scrollHeight
      ) - window.innerHeight;
    };

    const startY = getY();

    // 对于"滚动到底部"，每帧重新计算 max 以适应懒加载/无限滚动页面
    const getTarget = () => direction === 'top' ? 0 : getMax();

    const initialTarget = getTarget();
    const initialDistance = initialTarget - startY;
    if (Math.abs(initialDistance) < 1) return;

    const duration = Math.min(
      CONFIG.SCROLL_DURATION_MAX,
      Math.max(CONFIG.SCROLL_DURATION_MIN, Math.abs(initialDistance) * 0.55)
    );
    let startTime = null;

    btnUp.classList.toggle('scrolling', direction === 'top');
    btnDown.classList.toggle('scrolling', direction === 'bottom');

    const ease = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

    const doScroll = (y) => {
      if (isRoot) {
        window.scrollTo(0, y);
        // 某些页面 window.scrollTo 不生效时的后备
        if (Math.abs(getY() - y) > 2) {
          document.documentElement.scrollTop = y;
          document.body.scrollTop = y;
        }
      } else {
        el.scrollTop = y;
      }
    };

    function step(ts) {
      if (!startTime) startTime = ts;
      const elapsed = ts - startTime;
      const p = Math.min(elapsed / duration, 1);

      // 每帧重新获取目标位置（适应动态内容）
      const currentTarget = getTarget();
      const distance = currentTarget - startY;
      const y = startY + distance * ease(p);

      doScroll(y);

      if (p < 1) {
        rafId = requestAnimationFrame(step);
      } else {
        // 最终确保精确到达目标
        doScroll(getTarget());
        rafId = null;
        btnUp.classList.remove('scrolling');
        btnDown.classList.remove('scrolling');
      }
    }
    rafId = requestAnimationFrame(step);
  }

  btnUp.addEventListener('click', e => { e.stopPropagation(); smoothScrollTo('top'); });
  btnDown.addEventListener('click', e => { e.stopPropagation(); smoothScrollTo('bottom'); });

  // ─── 拖动逻辑 ──────────────────────────────────────────────────────
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
    const navWidth = nav.offsetWidth || 42;
    const navHeight = nav.offsetHeight || 110;
    let l = Math.max(4, Math.min(vw - navWidth - 4, e.clientX - dragOffX));
    let t = Math.max(4, Math.min(vh - navHeight - 4, e.clientY - dragOffY));
    nav.style.right = 'unset';
    nav.style.bottom = 'unset';
    nav.style.left = l + 'px';
    nav.style.top = t + 'px';
  });

  document.addEventListener('pointerup', () => {
    if (!dragging) return;
    dragging = false;
    Storage.set('__snav_pos', { left: nav.style.left, top: nav.style.top });
  });

  // ─── 恢复位置 ──────────────────────────────────────────────────────
  const pos = Storage.get('__snav_pos');
  if (pos && pos.left) {
    nav.style.right = 'unset';
    nav.style.bottom = 'unset';
    nav.style.left = pos.left;
    nav.style.top = pos.top;
  }

})();

# Skills.md — 在线表格油猴脚本开发经验总结

## 一、在线表格渲染引擎类型判断（首要步骤）

在写任何脚本之前，必须先判断目标表格的渲染方式，不同渲染方式对应完全不同的技术方案。

```javascript
// 快速判断渲染类型
console.log(
  'canvas数量:', document.querySelectorAll('canvas').length,
  'iframe数量:', document.querySelectorAll('iframe').length
);
```

| 渲染类型 | 特征 | 代表产品 | 可操作性 |
|---------|------|---------|---------|
| Canvas 虚拟渲染 | canvas > 0，DOM 无行数据 | 腾讯云文档表格 | 中等，需模拟键盘事件 |
| DOM 虚拟滚动 | canvas = 0，有大量 absolute 定位行元素 | 早期飞书表格 | 较易，直接操作 scrollTop |
| Shadow DOM / 子框架隔离 | canvas = 0，iframe body 为空，bitable 容器内无子元素 | 飞书知识库内嵌多维表格 | 极难，外部 JS 无法穿透 |
| 普通 DOM 滚动 | canvas = 0，有明显 overflow:auto 容器 | 普通网页表格 | 最易，直接 scrollTop |

---

## 二、标准诊断流程（每次遇到新平台必跑）

按顺序执行，每步根据结果决定是否继续。

### Step 1：基础环境检测

```javascript
console.log(
  'canvas:', document.querySelectorAll('canvas').length,
  'iframe:', document.querySelectorAll('iframe').length
);
```

### Step 2：检测 iframe 是否同域且有内容

```javascript
const f = document.querySelector('iframe');
alert((() => {
  try {
    const d = f.contentDocument || f.contentWindow.document;
    return 'same-origin | canvas:' + d.querySelectorAll('canvas').length
      + ' | bodyH:' + d.body.scrollHeight;
  } catch(e) {
    return 'cross-origin: ' + e.message;
  }
})());
```

**判断逻辑：**
- `cross-origin` → iframe 跨域，无法操作，放弃 iframe 路线
- `same-origin | bodyH:0` → iframe 是空壳，真实内容在主页面
- `same-origin | bodyH:>0` → 真实内容在 iframe 内，后续操作 `f.contentDocument`

### Step 3：找真实滚动容器

```javascript
// 找所有可滚动容器（主页面）
const results = Array.from(document.querySelectorAll('*')).filter(el => {
  const s = getComputedStyle(el);
  return /(auto|scroll)/.test(s.overflowY + s.overflow)
    && el.scrollHeight > el.clientHeight + 100;
}).sort((a, b) => b.scrollHeight - a.scrollHeight);

alert(results.slice(0, 5).map((el, i) =>
  `[${i}] <${el.tagName}> class="${el.className.slice(0,60)}" scrollH=${el.scrollHeight} clientH=${el.clientHeight}`
).join('\n'));
```

**判断逻辑：**
- 有结果且 `scrollH >> clientH` → 找到真实滚动容器，记录 class 名，直接操作
- 所有结果 `scrollH === clientH` → 使用了非标准虚拟滚动，进入 Step 4

### Step 4：检测非标准虚拟滚动

```javascript
// 检测 transform 偏移型虚拟滚动
const transforms = Array.from(document.querySelectorAll('*')).filter(el => {
  const s = getComputedStyle(el);
  return s.transform !== 'none' && el.offsetHeight > 100;
}).slice(0, 5);
alert(transforms.map((el,i) =>
  `[${i}] <${el.tagName}> class="${el.className.slice(0,50)}" H=${el.offsetHeight} transform=${getComputedStyle(el).transform}`
).join('\n'));
```

### Step 5：检测 window 上挂载的内部实例

```javascript
// 找平台暴露的内部 API
const keys = Object.keys(window).filter(k =>
  /sheet|spread|grid|bitable|lark|table/i.test(k)
);
console.log('相关全局键:', keys.slice(0, 30));
```

### Step 6：检测 canvas 上挂载的渲染实例

```javascript
document.querySelectorAll('canvas').forEach((c, i) => {
  const keys = Object.keys(c).filter(k =>
    /instance|renderer|sheet|engine|editor|scroll/i.test(k)
  );
  console.log(`canvas[${i}] 自定义属性:`, keys);
});
```

---

## 三、各平台已验证的解决方案

### 腾讯云文档表格（`docs.qq.com/sheet/`）✅ 已验证可用

**渲染方式：** Canvas  
**有效方案：** 先模拟鼠标点击让 Canvas 获得焦点，再发送键盘事件

```javascript
function tencentJump(type) {
  const canvas = document.querySelector('canvas');
  if (!canvas) return;

  const rect = canvas.getBoundingClientRect();
  // 关键：必须先完整模拟鼠标序列，canvas.focus() 单独调用无效
  ['mousedown', 'mouseup', 'click'].forEach(t => {
    canvas.dispatchEvent(new MouseEvent(t, {
      bubbles: true, cancelable: true,
      clientX: rect.left + rect.width / 2,
      clientY: rect.top + rect.height / 2,
      button: 0,
    }));
  });
  canvas.focus();

  setTimeout(() => {
    const key = type === 'top' ? 'Home' : 'End';
    ['keydown', 'keypress', 'keyup'].forEach(t => {
      canvas.dispatchEvent(new KeyboardEvent(t, {
        key, code: key,
        ctrlKey: true,
        keyCode: type === 'top' ? 36 : 35,
        which:   type === 'top' ? 36 : 35,
        bubbles: true, cancelable: true, composed: true,
      }));
    });
  }, 80); // 必须延迟，等待焦点生效
}
```

**经验教训：**
- 单独调用 `canvas.focus()` 不够，浏览器安全策略要求必须有真实鼠标交互序列
- 键盘事件必须补全 `keyCode`、`which`、`composed` 字段，缺一不可
- 事件派发后必须延迟 80ms 再发键盘事件

### 飞书知识库内嵌多维表格（`feishu.cn/wiki/`）❌ 油猴脚本无法实现

**渲染方式：** Shadow DOM / 内部沙箱隔离  
**根本原因：** 表格渲染在完全隔离的上下文中，外部 JS 无法访问其滚动状态  
**替代方案：** 使用飞书原生快捷键 `Ctrl+Home` / `Ctrl+End`

---

## 四、可复用的工具函数库

### 通用滚动容器查找器

```javascript
function findScrollContainers(root = document, minDiff = 100, topN = 5) {
  return Array.from(root.querySelectorAll('*'))
    .filter(el => {
      const s = (root.defaultView || window).getComputedStyle(el);
      return /(auto|scroll)/.test(s.overflowY + s.overflow)
        && el.scrollHeight > el.clientHeight + minDiff;
    })
    .sort((a, b) => b.scrollHeight - a.scrollHeight)
    .slice(0, topN);
}
```

### SPA 路由变化监听（防止按钮消失）

```javascript
function watchSPA(onRouteChange) {
  // 方式一：监听 URL 变化
  let lastUrl = location.href;
  new MutationObserver(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      onRouteChange();
    }
  }).observe(document.body, { childList: true, subtree: false });

  // 方式二：监听 body 直接子节点变化（按钮被移除时重新注入）
  new MutationObserver(() => {
    if (!document.getElementById('your-btn-id')) onRouteChange();
  }).observe(document.body, { childList: true, subtree: false });
}
```

### 安全的 iframe 内容访问器

```javascript
function getIframeDoc(iframe) {
  try {
    const doc = iframe.contentDocument || iframe.contentWindow.document;
    // 验证不是空壳
    if (!doc || doc.body.scrollHeight === 0) return null;
    return doc;
  } catch (e) {
    // 跨域，无法访问
    return null;
  }
}
```

### 延迟重试执行器（等待动态加载的元素）

```javascript
function waitFor(selector, callback, maxTries = 20, interval = 500, root = document) {
  let tries = 0;
  const timer = setInterval(() => {
    const el = root.querySelector(selector);
    if (el) { clearInterval(timer); callback(el); }
    else if (++tries >= maxTries) clearInterval(timer);
  }, interval);
}
```

### 悬浮按钮标准模板

```javascript
function createFloatBtn({ id, buttons, bottom = '80px', right = '24px', color = '#0052d9' }) {
  if (document.getElementById(id)) return;
  const wrap = document.createElement('div');
  wrap.id = id;
  Object.assign(wrap.style, {
    position: 'fixed', right, bottom,
    zIndex: '2147483647', display: 'flex',
    flexDirection: 'column', gap: '10px', userSelect: 'none',
  });
  buttons.forEach(({ label, title, onClick }) => {
    const btn = document.createElement('button');
    btn.innerHTML = label;
    btn.title = title;
    Object.assign(btn.style, {
      width: '44px', height: '44px', borderRadius: '50%',
      border: '2px solid rgba(255,255,255,0.25)',
      background: color, color: '#fff', fontSize: '22px',
      lineHeight: '40px', textAlign: 'center', cursor: 'pointer',
      boxShadow: '0 3px 12px rgba(0,0,0,0.25)',
      transition: 'all 0.18s', padding: '0', outline: 'none',
    });
    btn.addEventListener('click', e => { e.stopPropagation(); e.preventDefault(); onClick(); });
    wrap.appendChild(btn);
  });
  document.body.appendChild(wrap);
}
```

---

## 五、经验教训与避坑指南

### 关于 Canvas 渲染的表格

Canvas 表格中没有任何 DOM 行元素，`querySelectorAll('tr')` 永远返回空。所有操作必须通过键盘事件或内部 API 实例完成，直接操作 DOM 是死路。

### 关于 `console.log` 的输出位置

控制台执行立即函数时，最后一行显示的 `undefined` 是**函数返回值**，不是 `console.log` 的输出。输出在 `undefined` 的**上方**。遇到调试困难时改用 `alert()` 更直观，因为 `alert` 无法被页面屏蔽或折叠。

### 关于 scrollHeight === clientHeight 的陷阱

捕获到的容器 `scrollHeight === clientHeight` 时，对其操作 `scrollTop` 完全无效，不会有任何报错但也不会有任何效果。必须在使用前验证 `scrollHeight > clientHeight + 50` 才是真正可滚动的容器。

### 关于 SPA 页面的按钮注入

飞书、腾讯文档都是 SPA，路由切换时 `document.body` 的直接子节点会被替换，注入的按钮会消失。必须用 `MutationObserver` 监听 body 子节点变化，在按钮消失时重新注入。

### 关于平台技术壁垒的判断边界

当诊断结果同时出现以下三条时，应立即停止尝试，转向替代方案，避免无效调试：

1. 所有容器 `scrollH === clientH`（无可操作滚动容器）
2. Canvas 数量为 0（无 Canvas 可注入事件）
3. 目标容器内部子元素为空（Shadow DOM 或沙箱隔离）
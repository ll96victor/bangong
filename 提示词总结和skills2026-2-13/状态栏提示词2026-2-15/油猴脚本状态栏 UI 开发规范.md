# 油猴脚本状态栏 UI 开发规范

你是一位专注于浏览器扩展和油猴脚本开发的高级工程师。你的任务是编写高质量、内存安全、交互流畅的状态栏 UI 代码。

## 1. 核心架构设计

代码必须采用 **类封装** 或 **模块化** 结构，避免全局变量污染。推荐使用 `class StatusbarUI` 封装所有逻辑。

### 1.1 配置项设计
代码应支持通过 `config` 对象进行配置，默认配置如下：
javascript
const defaultConfig = {
copySelectors: [], // 需提取内容的 CSS 选择器数组
targetLinks: [], // 快捷跳转链接数组
showLogPanelByDefault: false, // 是否默认展开日志面板
maxLogLines: 100, // 日志最大保留行数
iconCompact: “🔵”, // 紧凑模式图标
};


## 2. 双形态切换规范

状态栏必须支持以下两种形态，且保证功能解耦：

### 2.1 紧凑模式
*   **外观**：32x32 像素的圆形浮动按钮。
*   **交互**：
    *   `mouseenter` 或 `click` 触发展开。
    *   在此模式下，核心功能按钮不可见，但应保证快捷键或隐式交互可用（如需要）。

### 2.2 展开模式
*   **外观**：显示完整 UI（图标 + 文字 + 功能按钮 + 日志面板）。
*   **交互**：
    *   `mouseleave` 延迟隐藏（可选），或点击关闭按钮隐藏。
    *   功能按钮必须正确绑定事件，点击**复制**或**打开链接**不应触发状态栏的折叠逻辑。

### 2.3 切换逻辑约束
*   切换动画应流畅（建议 CSS `transition`）。
*   事件绑定需阻止冒泡，避免误触发页面原有事件。

## 3. 内存安全规范（强制执行）

为了防止长时间运行导致的页面崩溃，必须严格遵守以下规范：

1.  **日志限制**：日志输出函数必须包含清理逻辑。
    *   当日志节点数 > `maxLogLines` 时，必须删除 `firstChild`。
    *   禁止使用 `innerHTML +=` 的方式追加日志（这会重建整个 DOM 树，效率低且可能导致事件丢失），必须使用 `appendChild`。
    
2.  **事件解绑**：
    *   如果提供 `destroy()` 方法，必须移除所有事件监听器。
    *   拖拽事件在 `mouseup` 时应解绑 `mousemove`，避免常驻内存。
    
3. 内存安全规范（强制执行）
...
3. **对象引用清理**：
   - `destroy()` 方法应将 DOM 引用置为 null
   - 示例：
     javascript
     destroy() {
       this.container.remove();
       this.container = null;
       this.logContainer = null;
     }


## 4. 功能实现要求

### 4.1 点击复制功能
*   根据 `copySelectors` 查询 DOM。
*   若未找到元素，应在日志中输出 `Error: Element not found`。
*   使用 `navigator.clipboard.writeText()` API。
*   复制成功/失败需有视觉反馈（如按钮变色或 Tooltip 提示）。

### 4.2 快捷链接功能
*   按钮 `click` 事件触发 `window.open(url, '_blank')`。

### 4.3 拖拽功能
*   实现原生拖拽（监听 `mousedown`, `mousemove`, `mouseup`）。
*   拖拽过程中应禁止选中文本（`user-select: none`）。
*   边界检测：拖拽范围不应超出可视区域窗口。

### 4.4 日志面板结构要求
日志面板必须包含：
- 右上角关闭按钮（×），点击后折叠整个状态栏至紧凑模式
- 日志内容区域，使用 `overflow-y: auto` 支持滚动

### 4.5 事件冒泡处理
功能按钮点击事件必须阻止冒泡，避免触发容器的事件：
button.addEventListener('click', (e) => {
  e.stopPropagation(); // 阻止冒泡
  // 执行复制或打开链接逻辑
});


## 5. 代码模板示例
请参考以下结构编写代码：
javascript
class StatusbarUI {
constructor(config) {
this.config = { …defaultConfig, …config };
this.container = null;
this.logContainer = null;
this.init();
}

init() {
    this.createDOM();
    this.bindEvents();
    if (this.config.showLogPanelByDefault) this.expand();
}

createDOM() {
    // 创建主容器
    this.container = document.createElement('div');
    this.container.className = 'ai-status-bar-compact';
    // ... 构建 UI 结构 ...
    document.body.appendChild(this.container);
}

bindEvents() {
    // 1. 切换逻辑
    // 2. 拖拽逻辑 (this.startDrag, this.onDrag, this.endDrag)
    // 3. 功能按钮点击
}

addLog(msg) {
    // ... 参见第3节内存安全规范 ...
}

// ... 其他辅助方法 ...

}

### 5.1 DOM 结构模板
this.container 结构示例：
<div class="ai-status-bar-compact">
  <!-- 紧凑模式：仅显示图标 -->
  <div class="ai-status-icon">🔵</div>
  
  <!-- 展开模式：默认隐藏 -->
  <div class="ai-status-expanded" style="display:none">
    <div class="ai-status-header">
      <span class="ai-status-title">状态栏</span>
      <button class="ai-status-close">×</button>
    </div>
    <div class="ai-status-actions">
      <button class="ai-btn-copy">复制</button>
      <button class="ai-btn-link">打开链接</button>
    </div>
    <div class="ai-status-logs"></div>
  </div>
</div>

## 5.2 完整 DOM 结构模板

createDOM() {
  this.container = document.createElement('div');
  this.container.className = 'ai-status-bar-compact';
  
  // 紧凑模式图标
  const icon = document.createElement('div');
  icon.className = 'ai-status-icon';
  icon.textContent = this.config.iconCompact;
  
  // 展开模式容器
  const expanded = document.createElement('div');
  expanded.className = 'ai-status-expanded';
  expanded.style.display = 'none';
  
  // 头部（包含关闭按钮）
  const header = document.createElement('div');
  header.className = 'ai-status-header';
  header.innerHTML = `<span>状态栏</span><button class="ai-status-close">×</button>`;
  
  // 功能按钮区域
  const actions = document.createElement('div');
  actions.className = 'ai-status-actions';
  
  // 日志容器
  this.logContainer = document.createElement('div');
  this.logContainer.className = 'ai-status-logs';
  
  expanded.append(header, actions, this.logContainer);
  this.container.append(icon, expanded);
  document.body.appendChild(this.container);
}

## 5.3 addLog 方法完整实现

addLog(msg, type = 'info') {
  if (!this.logContainer) return;
  
  const logItem = document.createElement('div');
  logItem.className = `ai-log-item ai-log-${type}`;
  logItem.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
  
  this.logContainer.appendChild(logItem);
  
  // 内存安全：限制日志行数
  while (this.logContainer.children.length > this.config.maxLogLines) {
    this.logContainer.removeChild(this.logContainer.firstChild);
  }
  
  // 自动滚动到底部
  this.logContainer.scrollTop = this.logContainer.scrollHeight;
}


## 6. 样式注入
所有 CSS 必须通过 `<style>` 标签注入到 `<head>` 中，并在类名前添加唯一前缀（如 `ai-status-`），避免与原页面样式冲突。



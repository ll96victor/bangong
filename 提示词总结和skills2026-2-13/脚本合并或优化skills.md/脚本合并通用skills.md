# Role
你是一位资深的油猴脚本开发专家，精通前端工程化与代码重构。
# Task
我需要合并两个功能不同的脚本，它们运行在同一个目标网页上。请将它们合并为一个完整、健壮、互不干扰的脚本。
# Constraints (关键要求)
为了确保两个功能模块解耦且互不干扰，请严格遵守以下规范：
## 1. 作用域与数据隔离
- **代码隔离**：严禁使用全局变量。必须使用 **IIFE (立即执行函数)** 或独立的 `class` / `function` 块分别包裹两个脚本的逻辑。
- **存储隔离**：
  - 检查两个脚本是否使用了 `GM_setValue`、`GM_getValue` 或 `localStorage`。
  - 若存在数据存储，**必须**为键名添加唯一前缀（例如：`ScriptA_config`，`ScriptB_status`），防止数据覆盖。
  - 示例：`const key = 'scriptA_data'; GM_setValue(key, val);`
## 2. DOM 操作安全
- **ID/Class 唯一性**：为两个脚本添加的 DOM 元素分配具有唯一前缀的 ID 或 Class（例如：`scriptA-btn`，`scriptB-panel`）。
- **防重复插入**：在添加元素前，必须检查 `document.getElementById('...')` 是否已存在，避免重复生成 UI。
## 3. CSS 样式隔离
- **命名空间**：建议为每个脚本注入的 UI 容器添加一个唯一的父级类名（如 `.scriptA-root`），所有 CSS 规则必须基于该父级类名编写。
- **权重控制**：尽量降低 CSS 选择器权重，避免影响页面原生样式。推荐使用 `data-*` 属性作为选择器或使用 `:where()` 降权。
- **Shadow DOM (可选)**：如果样式冲突严重，建议将 UI 封装在 Shadow DOM 中以实现彻底隔离。
## 4. 执行顺序与性能优化
- **事件监听**：检查 `DOMContentLoaded` 或 `@run-at`。合理安排执行时机，避免事件覆盖。
- **MutationObserver 复用**：
  - 如果两个脚本都监听了页面 DOM 变化，请尝试合并监听器，或确保各自的监听范围互不重叠，避免性能浪费。
  - 建议使用 `debounce` (防抖) 处理高频回调。
- **ResizeObserver 使用**：
  - 对于需要监听元素大小变化的场景，使用 ResizeObserver API 替代 resize 事件，提高性能和准确性。
  - 示例：使用 ResizeObserver 监听面板大小变化并自动保存。
- **防抖与节流**：
  - 高频事件（scroll、resize、input）必须使用防抖或节流。
  - 防抖适用于连续触发只需执行一次的场景（如搜索建议）。
  - 节流适用于需要固定频率执行的场景（如滚动加载）。
## 5. 错误边界处理
- **独立崩溃**：在每个脚本的 IIFE 内部包裹 `try...catch` 块。
- **日志输出**：建议在 catch 中使用 `console.error('[ScriptA Error]', e)` 以区分错误来源。
- 确保即使脚本 A 执行崩溃，也不会阻塞脚本 B 的初始化。
## 6. 元数据合并细节
- **@grant**：声明需取并集并去重。
- **@require**：如果引入了同名但不同版本的库（如 jQuery 3.4 vs 3.6），请合并为高版本。若版本跨度大，需在注释中提示潜在风险。
- **@name / @version**：更新为新的标识，如 `Merged: ScriptA + ScriptB`。
## 7. 事件代理与冲突处理
- **命名空间**：如果两个脚本都监听了 `document` 的点击事件，需确保 `event.target` 判断逻辑精确，防止误触发。
- **事件停止**：谨慎使用 `event.stopPropagation()`，这可能会阻断另一个脚本对同一元素的监听。建议通过判断 `target` 类型来过滤，而非暴力阻断。

## 8. 位置和大小记忆功能
当合并的脚本包含可拖拽或可调整大小的 UI 元素时，应实现位置和大小记忆功能：

### 8.1 实现方案
- **存储方式**：使用 `localStorage` 存储位置和大小信息。
- **键名规范**：使用带有唯一前缀的键名（如 `merged_tools_status_bar_position`），避免与其他脚本冲突。
- **数据格式**：将位置和大小数据序列化为 JSON 格式存储。

### 8.2 核心实现
```javascript
// 存储键名规范
const STORAGE_KEYS = {
    STATUS_BAR_POSITION: 'merged_tools_status_bar_position',
    LOG_PANEL_POSITION: 'merged_tools_log_panel_position',
    LOG_PANEL_SIZE: 'merged_tools_log_panel_size'
};

// 读取保存的位置
const savedPosition = localStorage.getItem(STORAGE_KEYS.STATUS_BAR_POSITION);
if (savedPosition) {
    try {
        const pos = JSON.parse(savedPosition);
        if (pos.left !== undefined && pos.top !== undefined) {
            container.style.position = 'fixed';
            container.style.left = pos.left;
            container.style.top = pos.top;
            container.style.right = 'auto';
            container.style.bottom = 'auto';
        }
    } catch (e) {
        console.error('读取位置失败:', e.message);
    }
}

// 保存位置（在拖拽结束时）
if (isDragging) {
    const rect = container.getBoundingClientRect();
    const position = {
        left: Math.round(rect.left) + 'px',
        top: Math.round(rect.top) + 'px'
    };
    localStorage.setItem(STORAGE_KEYS.STATUS_BAR_POSITION, JSON.stringify(position));
}

// 监听大小变化并保存
const resizeObserver = new ResizeObserver(() => {
    const rect = panel.getBoundingClientRect();
    const size = {
        width: Math.round(rect.width) + 'px',
        height: Math.round(rect.height) + 'px'
    };
    localStorage.setItem(STORAGE_KEYS.LOG_PANEL_SIZE, JSON.stringify(size));
});
resizeObserver.observe(panel);
```

### 8.3 最佳实践
- **错误处理**：使用 try-catch 包裹存储操作，防止解析失败。
- **防抖处理**：对 resize 事件添加防抖，避免频繁存储。
- **四舍五入值**：对位置和大小值进行四舍五入，减少存储体积。
- **边界检查**：确保保存的位置在视口范围内，避免元素超出屏幕。

## 9. 智能关键词搜索功能合并

### 9.1 功能说明
智能关键词搜索功能允许用户在页面中搜索特定关键词，并在找到匹配项后自动高亮显示并跳转到对应位置，提供类似浏览器Ctrl+F的搜索体验。

### 9.2 合并策略
**核心原则：保持独立，统一入口。**

#### 9.2.1 代码隔离
- 将搜索逻辑封装在独立的IIFE中
- 使用独立的状态变量跟踪搜索状态
- 提供统一的搜索函数入口

#### 9.2.2 数据隔离
- 高亮元素存储使用独立的数组
- 搜索关键词配置可独立管理
- 日志记录使用统一的日志系统

### 9.3 实现模板
```javascript
// 存储高亮元素的引用
let highlightedElements = [];

// 清除之前的高亮标记
function clearHighlights() {
    highlightedElements.forEach(el => {
        if (el.parentNode) {
            const parent = el.parentNode;
            parent.replaceChild(document.createTextNode(el.textContent), el);
            parent.normalize();
        }
    });
    highlightedElements = [];
}

// 高亮文本节点
function highlightTextNode(textNode, keyword) {
    const span = document.createElement('span');
    span.style.cssText = 'background: linear-gradient(120deg, #ffd700 0%, #ffed4e 100%); color: #000; padding: 2px 4px; border-radius: 3px; box-shadow: 0 2px 4px rgba(0,0,0,0.2); font-weight: bold;';
    span.className = 'cb-search-highlight';
    
    const text = textNode.textContent;
    const index = text.indexOf(keyword);
    
    if (index === -1) return null;
    
    const before = text.substring(0, index);
    const match = text.substring(index, index + keyword.length);
    const after = text.substring(index + keyword.length);
    
    const fragment = document.createDocumentFragment();
    if (before) fragment.appendChild(document.createTextNode(before));
    
    span.textContent = match;
    fragment.appendChild(span);
    highlightedElements.push(span);
    
    if (after) fragment.appendChild(document.createTextNode(after));
    
    return fragment;
}

// 搜索函数
function searchKeywords(keywords) {
    if (moduleStates.searchKeyword.isProcessing) {
        showToast('操作过于频繁，请稍候...');
        return;
    }
    moduleStates.searchKeyword.isProcessing = true;

    // 清除之前的高亮
    clearHighlights();
    showToast('🔍 正在检索关键词...');

    setTimeout(() => {
        let foundKeyword = null;
        let foundNode = null;
        
        const walker = document.createTreeWalker(
            document.body,
            NodeFilter.SHOW_TEXT,
            {
                acceptNode: function(node) {
                    return node.textContent.trim().length > 0 ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
                }
            },
            false
        );

        let node;
        while (node = walker.nextNode()) {
            const text = node.textContent;
            const matchedKeyword = keywords.find(k => text.includes(k));
            if (matchedKeyword && isElementVisible(node.parentElement)) {
                foundKeyword = matchedKeyword;
                foundNode = node;
                break;
            }
        }

        if (foundNode && foundKeyword) {
            const fragment = highlightTextNode(foundNode, foundKeyword);
            if (fragment) {
                foundNode.parentNode.replaceChild(fragment, foundNode);
            }
            
            const highlightEl = highlightedElements[0];
            if (highlightEl) {
                highlightEl.scrollIntoView({ 
                    behavior: 'smooth',
                    block: 'center',
                    inline: 'nearest'
                });
            }
            
            showToast('✅ 已找到并跳转');
            log(1, '关键词检索成功', { keyword: foundKeyword });
        } else {
            showToast('❌ 未找到联系记录');
            log(1, '关键词检索未找到匹配');
        }
        
        moduleStates.searchKeyword.isProcessing = false;
    }, 50);
}
```

### 9.4 最佳实践

| 实践 | 说明 |
|------|------|
| 代码隔离 | 将搜索逻辑封装在独立的函数中，避免与其他功能冲突 |
| 状态管理 | 使用独立的状态变量跟踪搜索状态，防止重复执行 |
| 错误处理 | 添加适当的错误处理，确保搜索失败不会影响其他功能 |
| 日志记录 | 记录搜索结果和执行状态，便于调试和监控 |
| 用户体验 | 提供清晰的视觉反馈，包括搜索中、找到和未找到的状态提示 |
---
# UI 元素合并策略（重点：状态栏/悬浮窗）
如果两个脚本包含相似的 UI 组件（如状态栏、控制面板、悬浮窗），**必须**考虑以下策略：
## 1. 识别条件
- 组件位置相近（如都固定在右下角、右上角）。
- 功能相关或互补。
- 视觉风格可以统一。
## 2. 合并方案：融合式合并 (推荐)
**核心原则：容器融合，逻辑隔离。**
### A. DOM 结构设计
创建一个统一的父容器，内部使用 Flex 布局分割区域：
```html
<div id="myMergedUI-container" style="position: fixed; bottom: 10px; right: 10px; z-index: 9999; display: flex; flex-direction: column; gap: 5px;">
  <!-- 脚本 A 的区域 -->
  <div id="scriptA-section" class="ui-section">...</div>
  <!-- 脚本 B 的区域 -->
  <div id="scriptB-section" class="ui-section">...</div>
</div>
```
### B. 拖拽逻辑冲突处理 
- **问题描述**：如果原脚本包含拖拽功能，直接合并可能导致“拖拽 A 时带动整个容器移动”或“拖拽事件互相干扰”。
- **处理方案**：
  1. **统一拖拽**：将拖拽逻辑绑定在合并后的父容器 `#myMergedUI-container` 上，让整个面板作为一个整体移动。
  2. **独立拖拽**：如果两个模块需要独立移动，则不要合并容器，而是调整它们的初始位置（如 A 在左下，B 在右下），保持物理隔离。
  3. **事件限定**：在 mousedown 监听中，必须判断 `event.target` 是否为拖拽手柄，避免点击内部按钮时触发拖拽。
### C. z-index 层级管理
- **统一管控**：合并后的父容器设置一个较高的 `z-index`（如 9999）。
- **内部重置**：内部子元素的 `z-index` 应当相对于父容器复位或使用 `position: relative`，防止内部元素互相穿透。
## 3. 代码结构模板
```javascript
// ==UserScript==
// @name         Merged Script
// @grant        GM_setValue
// ...
// ==/UserScript==
(function() {
    'use strict';
    
    // --- 公共工具函数：创建共享容器 ---
    const initSharedUI = () => {
        if (document.getElementById('myMergedUI-container')) return;
        const container = document.createElement('div');
        container.id = 'myMergedUI-container';
        // 插入公共样式 (CSS)
        // 设置 z-index 和 定位
        document.body.appendChild(container);
        return container;
    };
    // --- 脚本 A 逻辑 ---
    try {
        (function ScriptA() {
            const container = initSharedUI();
            const sectionA = document.createElement('div');
            sectionA.className = 'scriptA-section';
            // ...脚本 A 的业务逻辑...
            container.appendChild(sectionA);
        })();
    } catch (e) {
        console.error('[ScriptA Error]', e);
    }
    // --- 脚本 B 逻辑 ---
    try {
        (function ScriptB() {
            const container = initSharedUI();
            const sectionB = document.createElement('div');
            sectionB.className = 'scriptB-section';
            // ...脚本 B 的业务逻辑...
            container.appendChild(sectionB);
        })();
    } catch (e) {
        console.error('[ScriptB Error]', e);
    }
})();

## 4. 状态栏合并增强策略

### A. 自动识别规则
- **位置检测**：两个fixed元素距离小于50px时考虑合并
- **功能检测**：都包含状态显示、操作按钮等相似元素
- **视觉检测**：背景色、边框样式等可协调统一

### B. 样式协调原则
- **变量统一**：提取公共CSS变量（颜色、字体、圆角）
- **间距规范**：统一内部元素间距和外部边距
- **响应式**：考虑合并后的宽度适配问题

### C. 交互协调
- **展开/收起**：如果都有展开功能，需协调展开方向
- **鼠标事件**：避免hover状态互相干扰
- **动画同步**：统一动画时长和缓动函数

```
---
# Input
以下是两个脚本的代码：
**脚本 A：**
[在这里粘贴脚本A的代码]
**脚本 B：**
[在这里粘贴脚本B的代码]
# Output
请输出合并后的完整代码，并在关键位置添加注释说明：
1. **UI 合并决策**：说明是否检测到相似 UI，为何选择合并或隔离。
2. **冲突处理**：说明如何解决了变量命名、存储键名、拖拽事件、z-index 等潜在冲突。
3. **代码注释**：在 IIFE 边界和关键融合点添加清晰注释。
```

# 飞书项目脚本开发经验总结

## 1. SPA抽屉详情页评论框调试案例

### 1.1 问题背景

在飞书项目列表页点击某行会弹出抽屉式详情页，需要在抽屉中实现自动评论功能。调试过程中遇到多个问题：

1. 脚本能找到评论框容器，但无法激活编辑器
2. 点击后文本框变淡，但富文本编辑器不出现
3. 激活成功后，输入评论失败

### 1.2 关键发现

#### 发现1：抽屉详情页需要限定搜索范围

**问题**：使用 `document.querySelector` 在整个页面搜索，可能找到列表页的元素而非抽屉中的元素。

**解决方案**：优先在抽屉容器内搜索
```javascript
let searchRoot = document;
const drawer = document.querySelector('.meego-drawer-content-wrapper');
if (drawer) {
    searchRoot = drawer;  // 限定在抽屉内搜索
}
const commentBoxes = searchRoot.querySelectorAll('.meego-comment.issue-comment-wrap');
```

#### 发现2：评论框激活前后DOM结构完全不同

**激活前**：
```html
<div class="story-edit-group">
    <div class="comment-placeholder">请输入评论（Enter 换行，Ctrl + Enter 发送）</div>
</div>
```

**激活后**：
```html
<div class="story-edit-group focused editing">
    <div class="rich-text">
        <div class="zone-container" data-slate-editor="true" contenteditable="true">
            <div class="ace-line" data-node="true">
                <span data-string="true" data-leaf="true">评论内容</span>
            </div>
        </div>
    </div>
</div>
```

**关键教训**：点击目标必须是激活前就存在的元素（`.comment-placeholder`），而不是激活后才出现的元素（`.zone-container`）。

#### 发现3：需要等待编辑器完全加载

激活后需要等待富文本编辑器内部元素加载完成：
```javascript
async function inputCommentText(text, commentBox) {
    for (let i = 0; i < RETRY_MAX; i++) {
        const storyEditGroup = commentBox.querySelector('.story-edit-group.focused.editing');
        const aceLine = storyEditGroup?.querySelector('.ace-line[data-node="true"]');
        const editor = storyEditGroup?.querySelector('.zone-container[data-slate-editor="true"]');
        
        // 必须同时满足：编辑器已激活 + 内部元素已加载
        if (storyEditGroup && aceLine && editor) {
            // 执行输入操作
            return true;
        }
        await sleep(RETRY_INTERVAL);
    }
    return false;
}
```

### 1.3 完整解决方案

```javascript
async function findAndActivateCommentBox() {
    for (let i = 0; i < RETRY_MAX; i++) {
        // 1. 限定搜索范围
        let searchRoot = document;
        const drawer = document.querySelector('.meego-drawer-content-wrapper');
        if (drawer) {
            searchRoot = drawer;
        }
        
        const commentBoxes = searchRoot.querySelectorAll('.meego-comment.issue-comment-wrap');
        
        // 2. 检查是否已激活
        for (const commentBox of commentBoxes) {
            const addScene = commentBox.querySelector('.add-scene');
            if (!addScene) continue;
            
            const storyEditGroup = commentBox.querySelector('.story-edit-group');
            if (!storyEditGroup) continue;
            
            if (storyEditGroup.classList.contains('focused') && 
                storyEditGroup.classList.contains('editing')) {
                return commentBox;  // 已激活，直接返回
            }
        }
        
        // 3. 尝试激活（点击激活前存在的元素）
        for (const commentBox of commentBoxes) {
            const storyEditGroup = commentBox.querySelector('.story-edit-group');
            if (!storyEditGroup) continue;
            
            if (!storyEditGroup.classList.contains('focused')) {
                // 优先点击 placeholder，这是激活前存在的元素
                const placeholder = storyEditGroup.querySelector('.comment-placeholder');
                if (placeholder) {
                    placeholder.click();
                } else {
                    storyEditGroup.click();  // 兜底
                }
                await sleep(RETRY_INTERVAL);
                
                if (storyEditGroup.classList.contains('focused') && 
                    storyEditGroup.classList.contains('editing')) {
                    return commentBox;
                }
            }
        }
        
        await sleep(RETRY_INTERVAL);
    }
    return null;
}
```

### 1.4 Console调试命令模板

当遇到DOM定位问题时，使用以下命令逐步验证：

```javascript
// 1. 确认容器存在
document.querySelector('.meego-drawer-content-wrapper') ? 'drawer存在' : 'drawer不存在'

// 2. 确认目标元素数量
document.querySelector('.meego-drawer-content-wrapper').querySelectorAll('.meego-comment').length

// 3. 检查元素状态
document.querySelector('.meego-drawer-content-wrapper .story-edit-group').classList

// 4. 查看内部结构
document.querySelector('.meego-drawer-content-wrapper .story-edit-group').innerHTML

// 5. 确认激活状态
document.querySelector('.meego-drawer-content-wrapper .story-edit-group').classList.contains('focused')
```

### 1.5 小白快速对比DOM变化的方法

当需要对比激活前后DOM结构差异时，可以使用以下方法：

#### 方法1：一键对比脚本（最推荐）

把下面代码粘贴到Console，它会自动对比点击前后的变化：

```javascript
(function() {
    const selector = '.story-edit-group';  // 改成你要检测的元素
    const el = document.querySelector(selector);
    
    if (!el) {
        console.log('未找到元素');
        return;
    }
    
    const before = {
        html: el.innerHTML,
        classList: [...el.classList],
        childCount: el.children.length
    };
    
    console.log('📌 激活前状态:');
    console.log('  classList:', before.classList.join(', '));
    console.log('  子元素数量:', before.childCount);
    console.log('  innerHTML长度:', before.html.length);
    console.log('  innerHTML:', before.html.substring(0, 200));
    
    console.log('\n👉 请手动点击激活元素，然后运行:');
    console.log('compareAfter()');
    
    window.compareAfter = function() {
        const after = {
            html: el.innerHTML,
            classList: [...el.classList],
            childCount: el.children.length
        };
        
        console.log('\n📌 激活后状态:');
        console.log('  classList:', after.classList.join(', '));
        console.log('  子元素数量:', after.childCount);
        console.log('  innerHTML长度:', after.html.length);
        console.log('  innerHTML:', after.html.substring(0, 200));
        
        console.log('\n🔍 变化对比:');
        console.log('  新增class:', after.classList.filter(c => !before.classList.includes(c)));
        console.log('  移除class:', before.classList.filter(c => !after.classList.includes(c)));
        console.log('  子元素变化:', after.childCount - before.childCount);
    };
})();
```

**使用步骤**：
1. 粘贴代码到Console，回车
2. 查看激活前状态
3. 手动点击激活元素
4. 输入 `compareAfter()` 回车
5. 查看对比结果

#### 方法2：手动复制对比

**步骤**：
1. 打开页面，按 `F12` 打开开发者工具
2. 点击左上角的"选择元素"图标（或按 `Ctrl+Shift+C`）
3. 点击目标元素
4. 右键选中的元素 → `Copy` → `Copy outerHTML`
5. 粘贴到记事本，标记为"激活前"
6. 手动操作激活元素（如点击评论框）
7. 再次复制HTML，标记为"激活后"
8. 对比两段HTML的差异

#### 方法对比

| 方法 | 难度 | 推荐场景 |
|------|------|----------|
| 方法1：一键对比脚本 | ⭐ | 最推荐，自动对比class和子元素变化 |
| 方法2：手动复制对比 | ⭐⭐⭐ | 需要详细对比完整HTML结构时 |

---

## 2. 避免修改错误元素的策略

### 2.1 问题场景

页面上存在多个相同结构的元素（如已发布的评论和评论输入框），使用全局选择器可能选中错误的元素。

### 2.2 解决方案

**方案1：限定搜索范围**
```javascript
// 错误：全局搜索，可能找到已发布评论
const aceLine = document.querySelector('.ace-line[data-node="true"]');

// 正确：在特定容器内搜索
const aceLine = commentBox.querySelector('.story-edit-group.focused.editing .ace-line[data-node="true"]');
```

**方案2：使用特征选择器**
```javascript
// 已发布评论的特征
const publishedComment = document.querySelector('.story-comment-item .ace-line');

// 输入框的特征（必须有 focused 和 editing 类）
const inputBox = document.querySelector('.story-edit-group.focused.editing .ace-line');
```

**方案3：传递上下文**
```javascript
// 将找到的容器传递给后续函数，避免重复全局搜索
async function handleAutoComment() {
    const commentBox = await findAndActivateCommentBox();
    if (!commentBox) return;
    
    // 所有后续操作都在 commentBox 范围内进行
    await inputCommentText(text, commentBox);
    await clickPublishButton(commentBox);
}
```

---

## 3. 富文本编辑器输入技巧

### 3.1 飞书富文本编辑器结构

```html
<div class="zone-container" data-slate-editor="true" contenteditable="true">
    <div class="ace-line" data-node="true">
        <span data-string="true" data-leaf="true">文本内容</span>
        <span data-string="true" data-enter="true" data-leaf="true">​</span>
    </div>
</div>
```

### 3.2 输入文本的正确方式

```javascript
function inputCommentText(text, storyEditGroup) {
    const aceLine = storyEditGroup.querySelector('.ace-line[data-node="true"]');
    if (!aceLine) return false;
    
    // 创建文本span
    const span = document.createElement('span');
    span.setAttribute('data-string', 'true');
    span.setAttribute('data-leaf', 'true');
    span.textContent = text;
    
    // 清空并插入
    aceLine.innerHTML = '';
    aceLine.appendChild(span);
    
    // 添加换行标记
    const enterSpan = document.createElement('span');
    enterSpan.setAttribute('data-string', 'true');
    enterSpan.setAttribute('data-enter', 'true');
    enterSpan.setAttribute('data-leaf', 'true');
    enterSpan.innerHTML = '\u200B';  // 零宽空格
    aceLine.appendChild(enterSpan);
    
    // 触发事件
    const editor = storyEditGroup.querySelector('.zone-container[data-slate-editor="true"]');
    if (editor) {
        editor.dispatchEvent(new Event('input', { bubbles: true }));
        editor.dispatchEvent(new Event('change', { bubbles: true }));
    }
    
    return true;
}
```

---

## 4. 调试方法论

### 4.1 问题定位流程

1. **确认元素存在** → 使用 `querySelector` 验证
2. **确认元素状态** → 检查 `classList`、属性等
3. **对比激活前后** → 手动操作后查看DOM变化
4. **逐步缩小范围** → 从容器到子元素逐层验证

### 4.2 日志输出规范

```javascript
// 好的日志：包含状态信息
autoCommentLogger.log(`找到 ${commentBoxes.length} 个评论框容器`);
autoCommentLogger.log(`检查编辑器状态: aceLine=${!!aceLine}, editor=${!!editor}`);

// 不好的日志：只有简单描述
autoCommentLogger.log('查找评论框');
```

### 4.3 版本迭代原则

每次修复一个问题就更新版本号，便于追踪：
- 2.0.1 → 2.0.2：新增功能
- 2.0.2 → 2.0.3：修复bug
- 2.0.3 → 2.0.4：支持新场景
- ...

---

## 5. 用户提示词建议

### 5.1 提供HTML结构时

**推荐格式**：
```
这是未激活时的HTML：
[粘贴HTML]

这是激活后的HTML：
[粘贴HTML]

这是操作成功后的HTML：
[粘贴HTML]
```

### 5.2 描述SPA页面时

**推荐格式**：
```
页面类型：SPA抽屉详情页 / 单一详情页
触发方式：点击列表行弹出抽屉
容器选择器：.meego-drawer-content-wrapper（如果是抽屉）
```

### 5.3 提供调试信息时

**推荐格式**：
```
Console命令结果：
document.querySelector('.xxx') → [结果]
document.querySelector('.yyy').classList → [结果]
```

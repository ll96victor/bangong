# 需求说明：MCGG 独立逻辑模块开发

## 一、需求背景

### 1.1 现有逻辑
原脚本中，如果标题中出现 `MCGG`（不区分大小写），则跳过处理，不执行任何操作。

### 1.2 新需求
当标题中出现 `MCGG` 时，执行一套**完全独立**的处理逻辑。该逻辑与原脚本的非 MCGG 逻辑**并行存在**，互不干扰。

---

## 二、核心设计原则（强制要求）

### 2.1 耦合性要求
- **模块隔离**：MCGG 相关的所有函数、状态变量、配置项必须独立定义，使用 `mcgg` 前缀命名
- **状态隔离**：MCGG 逻辑使用独立的状态对象 `mcggState`，不与原 `state` 对象混用
- **配置隔离**：MCGG 相关配置放入 `CONFIG` 对象中，使用 `mcgg` 前缀的键名
- **入口分流**：在主流程入口处通过 `isMCGGTitle()` 函数判断，决定走哪条逻辑分支

### 2.2 日志规范
- 所有 MCGG 相关日志使用统一前缀 `[MCGG模块]`
- 日志级别：`info`（常规信息）、`success`（成功）、`warn`（警告）、`error`（错误）
- 关键操作必须输出日志，包括但不限于：
  - 模块入口判断结果
  - 数据提取成功/失败
  - ServerID 识别结果
  - 下拉框填充结果
  - 标题处理结果

### 2.3 代码组织结构
```
├── 用户配置区
│   ├── 原有配置项
│   └── MCGG 配置项（新增）
│
├── 全局状态
│   ├── state（原有）
│   └── mcggState（新增，独立）
│
├── 核心功能模块
│   ├── 原有模块（内部描述提取、ServerID判断、翻译、下拉框填充）
│   └── MCGG 模块（新增，独立）
│       ├── extractMCGGInternalDescription()
│       ├── determineMCGGHeading()
│       ├── processMCGGTitle()
│       └── fillMCGGDropdowns()
│
└── 主流程
    └── processTicket()
        ├── 判断 isMCGGTitle()
        ├── 是 → 执行 MCGG 逻辑分支
        └── 否 → 执行原有逻辑分支
```

---

## 三、功能模块详细说明

### 3.1 MCGG 判断函数

**函数名**：`isMCGGTitle(titleValue)`

**功能**：判断标题是否包含 MCGG 标识

**参数**：
- `titleValue`: 当前标题输入框的值

**返回值**：
- `true`: 标题包含 MCGG（不区分大小写）
- `false`: 标题不包含 MCGG

**实现要点**：
```javascript
function isMCGGTitle(titleValue) {
    return /mcgg/i.test(titleValue || '');
}
```

**日志输出**：
- 判断结果：`[MCGG模块] 标题检测: 检测到MCGG标识` 或 `[MCGG模块] 标题检测: 未检测到MCGG标识`

---

### 3.2 MCGG 配置项

**位置**：在 `CONFIG` 对象中新增以下配置项

```javascript
// MCGG 相关配置
mcggfullServerLists: ["【MCGG】- 1.2.60：", "【MCGG】- 1.2.58：", "【MCGG】- 1.2.62：", "【MCGG】- 1.2.56："],
mcggtestServerLists: ["【MCGG】- 1.2.60：", "【MCGG】- 1.2.58：", "【MCGG】- 1.2.62：", "【MCGG】- 1.2.56："],
mcggfullServer: "【MCGG】- 1.2.60：",
mcggtestServer: "【MCGG】- 1.2.62：",
```

**说明**：
- 配置项命名遵循 `mcgg` 前缀规范
- 格式与原有配置项保持一致，便于理解和维护
- 用户可根据实际需求修改这些配置值

---

### 3.3 MCGG 状态对象

**对象名**：`mcggState`

**结构定义**：
```javascript
let mcggState = {
    currentTicketID: null,        // 当前工单ID
    copiedText: '',               // 提取的描述内容
    leftHeading: '',              // 标题前缀（如【MCGG】- 1.2.60：）
    versionNumber: '',            // 版本号
    channelText: '',              // 渠道文本（全服/测服）
    faxiandiedai: '',             // 发现迭代版本
    hasProcessedTitle: false,     // 是否已处理标题
    isProcessing: false,          // 处理锁
    channelFilled: false,         // 渠道是否已填充
    iterationFilled: false,       // 发现迭代是否已填充
    moduleFilled: false           // 功能模块是否已填充
};
```

**重置函数**：
```javascript
function resetMCGGState() {
    mcggState = {
        currentTicketID: null,
        copiedText: '',
        leftHeading: '',
        versionNumber: '',
        channelText: '',
        faxiandiedai: '',
        hasProcessedTitle: false,
        isProcessing: false,
        channelFilled: false,
        iterationFilled: false,
        moduleFilled: false
    };
}
```

---

### 3.4 核心功能：MCGG 内部描述提取

**函数名**：`extractMCGGInternalDescription()`

**功能**：提取"描述"下方文本框的所有文本内容

**与原逻辑的区别**：
| 对比项 | 原逻辑（内部描述提取） | MCGG 逻辑 |
|--------|------------------------|-----------|
| 提取范围 | "内部描述"与"描述"之间的文本 | "描述"下方文本框的所有文本 |
| 标签定位 | 查找"内部描述"标签 | 查找"描述"标签（不含"内部"） |
| 内容来源 | 标签后续兄弟元素 | "描述"标签对应的文本框/输入区域 |

**实现要点**：
1. 遍历 DOM 查找文本内容为"描述"或"描述*"的标签元素
2. 排除包含"内部"关键字的标签（避免与"内部描述"混淆）
3. 通过相对位置关系找到对应的文本框/内容区域
4. 提取文本框内的所有文本内容
5. 处理可能存在的图片链接（参考原脚本的 `extractContentWithImages` 函数）

**日志输出**：
- 开始提取：`[MCGG模块] 开始提取描述内容`
- 提取成功：`[MCGG模块] 描述内容提取成功，长度: ${length}`
- 未找到标签：`[MCGG模块] 未找到"描述"标签`
- 未找到内容：`[MCGG模块] 描述内容为空`

---

### 3.5 核心功能：MCGG ServerID 判断

**函数名**：`determineMCGGHeading(text)`

**功能**：根据 ServerID 判断服务器类型，确定标题前缀

**参数**：
- `text`: 从描述内容中提取的文本（包含 ServerID 信息）

**返回值**：
- `true`: 成功识别 ServerID 并设置相关状态
- `false`: 未找到有效的 ServerID

**实现逻辑**：
1. 使用正则表达式提取 ServerID（格式：`ServerID = XXXXX`）
2. 根据 ServerID 前缀判断服务器类型：
   - 以 `57` 开头 → 测试服
   - 其他 → 正式服/全服
3. 根据服务器类型选择对应的配置项：
   - 测试服 → `CONFIG.mcggtestServer` 或 `CONFIG.mcggtestServerLists`
   - 正式服 → `CONFIG.mcggfullServer` 或 `CONFIG.mcggfullServerLists`
4. 更新 `mcggState` 中的相关字段

**日志输出**：
- ServerID 匹配：`[MCGG模块] ServerID匹配结果: ${serverId}`
- 环境识别：`[MCGG模块] 识别环境: ${channelText}, 版本: ${versionNumber}`
- 未找到 ServerID：`[MCGG模块] 未找到有效ServerID`

---

### 3.6 核心功能：MCGG 标题处理

**函数名**：`processMCGGTitleWithRetry()`

**功能**：处理 MCGG 工单的标题，添加前缀

**处理规则**：
1. 查找任务标题输入框
2. 检查标题是否已包含 MCGG 前缀（避免重复处理）
3. 查找标题中的冒号位置
4. 替换冒号前的内容为 MCGG 前缀
5. 如果标题中没有冒号，直接在开头插入 MCGG 前缀

**翻译说明**：
- 当前阶段：MCGG 标题内容为中文，**暂不翻译**
- 预留扩展：代码结构需支持未来添加翻译功能，保持良好的扩展性

**实现要点**：
```javascript
async function processMCGGTitleWithRetry() {
    if (mcggState.hasProcessedTitle || mcggState.isTitleProcessing) {
        log('[MCGG模块] 标题已处理或正在处理中，跳过');
        return;
    }
    
    // ... 查找标题输入框逻辑
    
    const colonMatch = currentValue.match(/[：:]/);
    if (!colonMatch) {
        // 无冒号，直接插入前缀
        const newTitle = mcggState.leftHeading + currentValue;
        // ...
    } else {
        // 有冒号，替换冒号前内容
        const contentPart = currentValue.substring(colonMatch.index + 1).trim();
        const newTitle = mcggState.leftHeading + contentPart;
        // ...
    }
    
    // 预留翻译接口（当前跳过）
    // if (needTranslate && !hasChinese(contentPart)) {
    //     translatedContent = await translateText(contentPart);
    // }
}
```

**日志输出**：
- 开始处理：`[MCGG模块] 开始处理标题`
- 前缀已存在：`[MCGG模块] 标题前缀已存在，跳过`
- 处理成功：`[MCGG模块] 标题处理成功: ${newTitle}`
- 处理失败：`[MCGG模块] 标题处理失败`

---

### 3.7 MCGG 下拉框填充模块

**函数名**：`setupMCGGFocusListener()` 和相关填充函数

**功能**：自动填充三个下拉框字段

**需要填充的字段**：
| 字段名 | 填充内容 | 触发条件 |
|--------|----------|----------|
| 渠道 * | `mcggState.channelText`（全服/测服） | 输入框获得焦点 |
| 发现迭代 * | `mcggState.faxiandiedai`（版本号） | 输入框获得焦点 |
| 功能模块 * | "模式独立包" | 输入框获得焦点 |

**实现逻辑**：
1. 设置全局焦点监听器（`focusin` 事件）
2. 当输入框获得焦点时，通过标签文本识别字段类型
3. 调用对应的填充函数

**填充函数示例**：
```javascript
async function handleMCGGChannelFocus() {
    if (mcggState.channelFilled) return;
    log('[MCGG模块] 渠道输入框获得焦点，准备填充:', mcggState.channelText);
    const success = await fillDropdownSearch(mcggState.channelText);
    if (success) {
        mcggState.channelFilled = true;
        log('[MCGG模块] 渠道填充成功', 'success');
    }
}

async function handleMCGGModuleFocus() {
    if (mcggState.moduleFilled) return;
    log('[MCGG模块] 功能模块输入框获得焦点，准备填充: 模式独立包');
    const success = await fillDropdownSearch('模式独立包');
    if (success) {
        mcggState.moduleFilled = true;
        log('[MCGG模块] 功能模块填充成功', 'success');
    }
}
```

**日志输出**：
- 焦点触发：`[MCGG模块] ${字段名}输入框获得焦点，准备填充: ${值}`
- 填充成功：`[MCGG模块] ${字段名}填充成功`
- 填充失败：`[MCGG模块] ${字段名}填充失败`

---

## 四、主流程集成

### 4.1 入口分流逻辑

在 `processTicket()` 函数中添加 MCGG 判断分支：

```javascript
async function processTicket() {
    // ... 获取标题输入框的值
    
    // 判断是否为 MCGG 工单
    if (isMCGGTitle(currentTitleValue)) {
        log('[MCGG模块] 检测到MCGG标识，执行MCGG逻辑分支');
        await processMCGGTicket();  // 执行 MCGG 独立流程
        return;
    }
    
    // 原有逻辑继续执行
    // ...
}
```

### 4.2 MCGG 主流程函数

```javascript
async function processMCGGTicket() {
    if (mcggState.isProcessing) {
        log('[MCGG模块] 正在处理中，跳过重复执行');
        return;
    }
    
    mcggState.isProcessing = true;
    log('[MCGG模块] ========== 开始处理MCGG工单 ==========');
    
    try {
        // 1. 提取描述内容
        const description = await extractMCGGInternalDescriptionWithRetry();
        if (!description) {
            log('[MCGG模块] 未提取到描述内容，中止处理', 'error');
            return;
        }
        
        // 2. 判断 ServerID
        const hasValidServer = determineMCGGHeading(description);
        if (!hasValidServer) {
            log('[MCGG模块] ServerID验证失败，跳过标题处理', 'warn');
        }
        
        // 3. 处理标题
        await processMCGGTitleWithRetry();
        
        // 4. 设置下拉框监听
        setupMCGGFocusListener();
        
        log('[MCGG模块] ========== MCGG工单处理完成 ==========', 'success');
    } finally {
        mcggState.isProcessing = false;
    }
}
```

---

## 五、代码复用说明

### 5.1 可复用的工具函数
以下函数可被 MCGG 模块直接调用，无需重新实现：
- `isInputAvailable(el)` - 输入框可用性检查
- `simulateInputValue(element, text)` - 模拟输入值设置
- `fillDropdownSearch(text)` - 下拉框搜索填充
- `waitForDropdownSearchInput(timeout)` - 等待下拉框出现
- `hasChinese(text)` - 中文检测
- `extractVersion(text)` - 版本号提取
- `findTitleInputRobust()` - 标题输入框查找

### 5.2 需要独立实现的函数
以下函数需要为 MCGG 模块独立实现：
- `isMCGGTitle(titleValue)` - MCGG 标识判断
- `extractMCGGInternalDescription()` - MCGG 描述提取
- `determineMCGGHeading(text)` - MCGG ServerID 判断
- `processMCGGTitleWithRetry()` - MCGG 标题处理
- `setupMCGGFocusListener()` - MCGG 焦点监听
- `handleMCGGChannelFocus()` - MCGG 渠道填充
- `handleMCGGIterationFocus()` - MCGG 迭代填充
- `handleMCGGModuleFocus()` - MCGG 功能模块填充

---

## 六、测试检查清单

### 6.1 功能测试
- [ ] MCGG 标题检测正确（大小写不敏感）
- [ ] MCGG 工单走独立逻辑分支，不影响原逻辑
- [ ] 非 MCGG 工单继续走原逻辑，不受影响
- [ ] 描述内容正确提取
- [ ] ServerID 正确识别，前缀正确设置
- [ ] 标题前缀正确替换/插入
- [ ] 三个下拉框正确填充

### 6.2 耦合性测试
- [ ] 修改原配置项不影响 MCGG 配置
- [ ] 修改 MCGG 配置不影响原逻辑
- [ ] MCGG 状态与原状态完全隔离
- [ ] 两个逻辑分支可独立调试

### 6.3 日志测试
- [ ] 所有 MCGG 日志带有 `[MCGG模块]` 前缀
- [ ] 关键操作有日志输出
- [ ] 错误情况有明确的错误日志

---

## 七、注意事项

1. **状态重置**：工单切换时，需同时重置 `state` 和 `mcggState`
2. **处理锁**：MCGG 模块使用独立的 `isProcessing` 锁，避免与原逻辑冲突
3. **扩展性**：翻译功能预留接口，便于未来启用
4. **调试模式**：遵循原脚本的 `CONFIG.debug` 设置控制日志输出

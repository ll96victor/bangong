---
name: aihelp-ticket-v4-0-0-规划
overview: 为 `AiHelp Ticket 客服信息提取一键复制-3.0.user.js` 制定最小改动升级方案：保留现有复制/分组/标签主流程，新增翻译、AI辅助、日志面板、统一拖拽与配置输入，并同步脚本/文档更名。
todos:
  - id: recheck-scope
    content: 使用[subagent:code-explorer]复核入口与选择器
    status: completed
  - id: metadata-config
    content: 更新元数据并接入配置存储层
    status: completed
    dependencies:
      - recheck-scope
  - id: translate-ai-log
    content: 增量实现翻译、AI辅助与日志模块
    status: completed
    dependencies:
      - metadata-config
  - id: drag-buttons
    content: 改造按钮初始化与整排拖拽记忆
    status: completed
    dependencies:
      - translate-ai-log
  - id: docs-regression
    content: 同步文档并完成回归自查
    status: completed
    dependencies:
      - drag-buttons
---

## 用户需求

- 在现有客诉助手中保留复制、分组、标签能力，并在同一排按钮中新增翻译、AI辅助、日志入口。
- 翻译入口需要自动识别原文语种，并在浮动面板中展示结果；用户在粘贴或整理回复时，可手动切换目标语种。
- AI辅助需要结合用户问题、上下文对话和当前客服回复，生成推荐话术，或输出优化后的回复内容。
- 所有小图标默认横向排列，拖动任意一个时整排一起移动，刷新后保持上次位置。
- 脚本名称改为“客诉助手（原客服信息提取）”，维护文档同步更名并保持交接信息清晰。

## 产品概览

页面继续使用轻量悬浮工具条作为主要入口，新按钮加入后仍保持一排小图标的紧凑样式。点击翻译、AI辅助、日志时，分别以独立浮动面板展示结果、操作区和调试信息，不打断当前工单处理流程。

## 核心功能

- 语种识别与目标语种手动切换
- 推荐回复与回复优化
- 日志查看与错误定位
- 整排按钮拖拽与位置记忆
- 脚本与文档名称同步更新

## 技术栈选择

- 现状确认：该目录不是构建型前端工程，未发现 `package.json`、Vite、Webpack 或 TypeScript 配置。
- 实际交付入口：`c:/bangong/aihelp效率提升/功能三：aihelp网址@客服信息提取2026-2-14/AiHelp Ticket 客服信息提取一键复制-3.0.user.js`
- 延续现有方案：原生 JavaScript 单文件 Tampermonkey 脚本，复用已存在的 `GM_setClipboard`、`GM_addStyle`、`localStorage`、`MutationObserver`、`waitForElement()`、`simulateInputValue()`、`CONFIG` 集中配置模式。
- 需补充的元数据能力：`GM_xmlhttpRequest`、`GM_registerMenuCommand`、`GM_setValue`、`GM_getValue`，以及已在文档中明确的 `@connect translate.googleapis.com`；GLM 与 MiMo 的 `@connect` 按最终确认的实际接口域名补充，不先写死未经验证地址。

## 实施方案

### 实现策略

在现有单文件 IIFE 中做增量扩展，不拆工程、不改现有复制/分组/标签主流程，只新增四层能力：配置存储层、翻译模块、AI辅助模块、日志模块，并把新按钮接入现有 `initButtons()` 与主容器拖拽体系。

### 关键技术决策

- **翻译方案**：按现有交接文档，优先使用 Google 免费翻译端点完成自动识别加目标语种翻译，避免占用 AI 文本额度；手动目标语种选择放在翻译面板内完成。
- **AI方案**：主用 `GLM-4.7-Flash`，备援 `MiMo-V2-Pro`，与交接文档一致；不采用视觉、多模态、图片或视频模型，避免性能浪费与不相关能力。
- **配置存储方案**：结合当前脚本形态与已确认文档，最稳妥做法是 `GM_registerMenuCommand` 录入配置，`GM_setValue/GM_getValue` 持久化；这满足“用户手动输入、脚本不硬编码”的要求，同时避免引入额外配置页机制。
- **拖拽方案**：改造 `setupDraggable()`，允许在任意按钮按下后触发整条容器拖动，使用 5px 阈值区分拖拽与点击；拖拽结束后只保存位置，不误触按钮动作。
- **面板方案**：翻译、AI、日志共用轻量浮层管理逻辑，一次只显示一个面板，避免重叠与状态冲突。

### 性能与可靠性

- **对话提取复杂度**：按点击触发进行，复杂度为 O(k)，k 为扫描到的消息节点数；按文档建议截断到最近 10 条上下文，限制 token 与 DOM 遍历成本。
- **网络请求瓶颈**：主要开销来自外部接口延迟；通过统一超时、错误提示、主备回退控制失败范围，避免阻塞其他按钮功能。
- **UI 开销控制**：页面初始仅创建按钮条与必要样式，翻译/AI/日志面板在点击时创建或复用，避免常驻重型 DOM。
- **稳定性优先**：不引入高频 `setInterval` 全局轮询，继续优先使用现有 `waitForElement()`、按需查询和轻量去重检查。

## 实施说明

- 复用现有 `ai-` 前缀样式命名，避免污染页面原生样式。
- 保留现有 `ai-btn-container-position` 位置存储键，兼容用户已保存的按钮位置；新增面板相关存储键使用独立前缀，避免互相覆盖。
- 现有 `log()` 建议升级为统一日志入口，并同步写入控制台与日志面板；日志内容禁止输出 API Key 或完整敏感报文。
- 在新增按钮、面板、菜单命令前做存在性检查，防止 SPA 场景下重复插入。
- AI上下文提取依据已确认的页面结构：用户消息使用 `.msg.msg-left`，客服消息优先使用 `data-testid="agentMessageItem"`，必要时再回退到已记录的右侧消息结构。
- 面板关闭、请求失败、配置缺失都要有明确提示，但不能影响复制、分组、标签三项既有能力。

## 架构设计

### 单文件增量结构

- **元数据与配置区**：更新 `@name`、`@description`、`@version`、`@grant`、`@connect`，扩展 `CONFIG` 与存储键常量。
- **基础工具区**：继续承载 `sleep()`、`isElementAvailable()`、`waitForElement()`、`simulateInputValue()`、`triggerClick()`，新增统一请求封装、统一日志入口、配置读取函数。
- **既有业务区**：`extractTicketAgentInfo()`、`handleCopyAction()`、`handleChangeGroup()`、`handleAddTag()` 保持主逻辑不重构，只做必要接线。
- **新增服务区**：新增翻译调用、AI调用、上下文提取、配置菜单注册等函数。
- **新增 UI 区**：新增翻译面板、AI面板、日志面板，以及单面板切换控制。
- **初始化区**：在 `initButtons()` 中追加三个按钮，在 `setupDraggable()` 中统一整排拖拽。

### 数据关系

- **按钮位置**：继续使用 `localStorage`
- **API Key 与端点配置**：使用 `GM_setValue/GM_getValue`
- **运行日志**：内存中维护限长数组，面板打开时渲染
- **对话上下文**：点击 AI 按钮时即时提取，不做常驻缓存

## 目录结构

### 目录结构摘要

本次方案保持现有单文件脚本交付方式，不新增构建目录，修改集中在主脚本与同步文档。

- `[MODIFY] c:/bangong/aihelp效率提升/功能三：aihelp网址@客服信息提取2026-2-14/AiHelp Ticket 客服信息提取一键复制-3.0.user.js`
- **目的**：当前唯一交付入口与主实现文件。
- **功能**：更新元数据；新增配置菜单、翻译、AI辅助、日志面板；扩展 `initButtons()`；把拖拽改为拖任意按钮整排移动；保持复制、分组、标签原功能不被破坏。
- **实现要求**：复用现有工具函数与样式命名；新增跨域请求和配置存储；外部请求带超时、失败提示和回退；新增 UI 必须防重复注入。

- `[MODIFY] c:/bangong/aihelp效率提升/功能三：aihelp网址@客服信息提取2026-2-14/交接与维护文档.md`
- **目的**：作为主维护文档，同步记录新名称、新按钮、新配置入口、风险与自查项。
- **功能**：补齐元数据变化、按钮布局、配置说明、接口主备关系、常见故障排查、回归验证范围。
- **实现要求**：内容与脚本行为保持一致，尤其是按钮数量、配置入口、模型选择与排错指引。

- `[MODIFY] c:/bangong/aihelp效率提升/功能三：aihelp网址@客服信息提取2026-2-14/维护文档.md`
- **目的**：兼容旧引用并说明文档更名关系，避免历史链接或旧使用习惯失效。
- **功能**：补充“已迁移至交接与维护文档”的说明，必要时同步核心能力摘要和版本指向。
- **实现要求**：不重复维护大段分叉内容，优先作为兼容入口和历史说明。

## Agent Extensions

### SubAgent

- **code-explorer**
- **Purpose**: 在实施前复核主脚本函数边界、页面选择器、元数据变更点和文档联动范围。
- **Expected outcome**: 输出精确的修改清单、受影响函数列表与回归检查范围，降低误改和漏改风险。
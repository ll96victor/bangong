---
name: feishu-2.1.11-rollback
overview: 在 2.1.11 脚本中，保留新增的"点击搜索框"功能，其余所有改动回退到 2.1.10 的原始实现。
todos:
  - id: revert-search-keywords
    content: 修改 2.1.11.user.js：更新 v2.1.11 日志描述，回退 searchKeywords 函数，删除 keywordSearchState 变量和 highlightAndJumpToCurrentKeywordMatch 函数
    status: completed
---

## 用户需求

对目标文件 `飞书项目效率提升\功能四三二一合并版2026-2-22\飞书项目工具集 (状态栏版) 2.1.11.user.js` 进行精准的局部回退：

- **保留**：2.1.11 新增的搜索框点击激活功能（全部相关代码不变）
- **回退**：`searchKeywords()`（"已联系"检索）函数恢复为 2.1.10 的简单版本
- **删除**：`keywordSearchState` 状态变量 和 `highlightAndJumpToCurrentKeywordMatch()` 函数
- **修改**：头部更新日志中 `v2.1.11` 的描述，改为"新增：搜索框功能"

## 产品概述

保持脚本版本号 `2.1.11` 不变，仅将"已联系"关键词检索逻辑从"连续点击查找下一个"的复杂状态机实现，回退为"找到第一个即停止"的简单实现，同时保留搜索框激活功能的所有新增代码完整无损。

## 核心改动点

| 区域 | 操作 |
| --- | --- |
| 更新日志 v2.1.11 描述（第45行） | 修改为"新增：搜索框功能" |
| `keywordSearchState` 变量（第653-658行） | 删除 |
| `searchKeywords()` 函数（第660-736行） | 替换为 2.1.10 的简单版本 |
| `highlightAndJumpToCurrentKeywordMatch()` 函数（第738-772行） | 删除 |


## 技术方案

### 修改策略

直接在 `2.1.11.user.js` 文件上做精准的三处改动，不涉及任何其他行：

1. **第45行**：将 v2.1.11 的更新说明由`"优化："已联系"检索功能也支持了连续点击查找下一个匹配项的功能，并会按预设关键词数组的顺序依次查找展示。"`改为`"新增：搜索框功能"`

2. **第653-772行（keywordSearchState 变量 + searchKeywords 新版本 + highlightAndJumpToCurrentKeywordMatch 函数）**：整段替换为 2.1.10 的 `searchKeywords()` 简单版本（仅保留函数本身，无前置状态变量，无后置辅助函数）

### 精确行号范围（基于文件探索确认）

- `keywordSearchState` 变量：第653-658行
- `searchKeywords()` 新版函数体：第660-736行
- `highlightAndJumpToCurrentKeywordMatch()` 函数：第738-772行

上述第653行到第772行，整段替换为 2.1.10 版本的 `searchKeywords()` 函数（第605-677行内容）。

### 实现注意事项

- 替换后第774行开始的 `// 智能网页 @ 检索功能` 及其后代码保持完全不变
- 2.1.10 的 `searchKeywords()` 内部调用了 `showZoneSuccess('search')`，该函数在 2.1.11 中同样存在，无依赖缺失问题
- `searchLogger` 变量在 2.1.11 中位于第651行，保持不变，2.1.10 版本函数体内可以直接引用

## 目录结构

```
飞书项目效率提升/功能四三二一合并版2026-2-22/
└── 飞书项目工具集 (状态栏版) 2.1.11.user.js  # [MODIFY] 目标文件
    ├── 第45行：v2.1.11 更新日志描述 → 改为"新增：搜索框功能"
    └── 第653-772行：删除 keywordSearchState 变量、替换 searchKeywords()、删除 highlightAndJumpToCurrentKeywordMatch()
```
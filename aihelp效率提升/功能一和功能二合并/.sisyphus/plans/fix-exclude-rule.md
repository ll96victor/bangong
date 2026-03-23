# 修复 Tampermonkey 排除规则问题

## TL;DR

> **Quick Summary**: 修复v5.9.8版本的排除规则，确保脚本在 `newpage-ticket` 页面不生效
>
> **Deliverables**:
> - 修改 `@exclude` 规则为 `*://*/*#*newpage-ticket*`
>
> **Estimated Effort**: Quick
> **Parallel Execution**: NO - sequential
> **Critical Path**: 单行修改

---

## Context

### Original Request
v5.9.8版本的脚本在以下页面错误地生效了：
```
https://ml-panel.aihelp.net/dashboard/#/newpage-ticket/?queryType=11&tId=YUKLQQ
```

### Interview Summary
**Key Discussions**:
- 用户已尝试修改排除规则为包含 `#` 的形式，但仍不生效
- 问题是Tampermonkey对哈希片段的匹配处理机制

**Research Findings**:
- Tampermonkey的 `@exclude` 规则对哈希片段（`#`之后）的处理有特殊性
- 通配符 `*` 可以匹配哈希内容，但需要正确的语法
- URL中 `#/newpage-ticket/` 是哈希路径，不是实际路径

### Metis Review
**Identified Gaps** (addressed):
- 排除规则语法问题：需要使用 `*://*/*#*newpage-ticket*` 而不是 `*://*/dashboard/#/newpage-ticket*`

---

## Work Objectives

### Core Objective
修复排除规则，确保脚本在所有包含 `newpage-ticket` 的页面都不执行。

### Concrete Deliverables
- 修改第11-12行的排除规则

### Definition of Done
- 排除规则能够正确匹配 `https://ml-panel.aihelp.net/dashboard/#/newpage-ticket/*` 这类URL
- 脚本在该页面不执行

### Must Have
- 排除规则必须生效
- 不影响其他正常页面的功能

### Must NOT Have (Guardrails)
- 不能影响其他dashboard页面的正常匹配
- 不能删除任何现有功能

---

## Verification Strategy

### Test Decision
- **Infrastructure exists**: NO
- **User wants tests**: NO - manual verification required
- **Framework**: none

### If Automated Verification Only (NO User Intervention)

用户需要手动验证：

1. 安装更新后的脚本
2. 访问 `https://ml-panel.aihelp.net/dashboard/#/newpage-ticket/?queryType=11&tId=YUKLQQ`
3. 打开浏览器控制台（F12）
4. 检查是否有 `[工单助手 v5.9.8]` 相关的日志输出
5. 确认页面右上角没有"效率"浮动按钮

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately):
├── Task 1: 修改排除规则

Critical Path: Task 1 (单步完成)
Parallel Speedup: N/A
```

---

## TODOs

- [ ] 1. 修改排除规则为正确的格式

  **What to do**:
  - 将第11-12行的排除规则合并为单行
  - 使用 `*://*/*#*newpage-ticket*` 模式

  **Must NOT do**:
  - 不要修改其他任何 `@match` 规则
  - 不要修改脚本功能代码

  **Recommended Agent Profile**:
  > Select category + skills based on task domain. Justify each choice.
  - **Category**: `quick`
    - Reason: 单行简单修改，无需复杂逻辑
  - **Skills**: `[]`
    - 无需特定技能

  **Skills Evaluated but Omitted**:
  - `git-master`: 不需要版本控制操作
  - `playwright`: 不需要浏览器测试

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential
  - **Blocks**: None
  - **Blocked By**: None (can start immediately)

  **References** (CRITICAL - Be Exhaustive):

  **Pattern References** (existing code to follow):
  - `工单助手 - 自动翻译与内部描述复制 v5.9.8 再次尝试修复排除规则 草稿版-5.9.8.user.js:1-18` - 当前的头文件格式和位置

  **API/Type References**:
  - N/A

  **Test References**:
  - N/A

  **Documentation References**:
  - Tampermonkey官方文档：`https://www.tampermonkey.net/documentation.php?ext=dhdg` - 关于 `@exclude` 规则的语法

  **External References**:
  - Tampermonkey URL匹配规则：`https://stackoverflow.com/questions/43392600/tampermonkey-match-include-exclude-with-hash` - 哈希片段匹配的讨论

  **WHY Each Reference Matters**:
  - 确保使用正确的 `@exclude` 语法，特别是哈希片段的匹配

  **Acceptance Criteria**:

  > **CRITICAL: AGENT-EXECUTABLE VERIFICATION ONLY**

  **Automated Verification** (using Bash):
  ```bash
  # Agent runs:
  grep -E "^// @exclude" "C:\A backup folder\家庭\我的坚果云\Python for everybody\aihelp和飞书项目效率提升\功能一和功能二合并\工单助手 - 自动翻译与内部描述复制 v5.9.8 再次尝试修复排除规则 草稿版-5.9.8.user.js"
  # Assert: 输出包含 `*://*/*#*newpage-ticket*`
  ```

  **Evidence to Capture**:
  - [ ] grep命令的输出结果

  **Commit**: NO

---

## Success Criteria

### Verification Commands
```bash
# 验证排除规则已修改
grep "@exclude" 工单助手*.user.js
```

### Final Checklist
- [ ] `@exclude` 规则已修改为 `*://*/*#*newpage-ticket*`
- [ ] 旧的排除规则已删除
- [ ] `@match` 规则未修改

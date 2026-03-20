# Python + Selenium 自动化脚本开发经验总结

> 本文档总结从油猴脚本转向 Python 自动化开发的经验，供后续类似项目参考。

---

## 1. 背景

用户一直使用油猴脚本进行网页自动化，本次首次尝试 Python + Selenium 方案，开发了一个"一键更新表工具"。

**开发周期**：约 4 小时（含多次调试和重构）

**最终效果**：
- 项目目录从 700MB 减少到 179KB
- 另一台电脑 git pull 后可直接使用
- chromedriver 自动下载，无需手动配置

---

## 2. 油猴脚本 vs Python + Selenium

| 对比项 | 油猴脚本 | Python + Selenium |
|--------|----------|-------------------|
| 运行环境 | 浏览器内 | 独立进程 |
| 跨域限制 | 需要 @grant | 无限制 |
| 文件操作 | 受限 | 完全自由 |
| 定时任务 | 需要页面打开 | 可后台运行 |
| 分发方式 | 安装油猴扩展 | 提供脚本 + 依赖 |
| 调试难度 | 中等 | 较低（有完整日志） |

**选择建议**：
- 需要实时响应页面变化 → 油猴脚本
- 需要批量处理、文件操作、定时任务 → Python + Selenium

---

## 3. 核心经验总结

### 3.1 chromedriver 是最大痛点

**问题**：
- 不同电脑 Chrome 版本不同
- chromedriver 版本必须匹配
- 手动下载对小白用户不友好

**解决方案**：自动检测 + 自动下载

```python
# 1. 获取 Chrome 版本
# 2. 获取对应 chromedriver 下载链接
# 3. 下载到系统目录（%LOCALAPPDATA%）
# 4. 版本匹配检测（主版本号对比）
```

### 3.2 大文件不要放项目目录

**问题**：
- chromedriver.exe 约 21MB
- Chrome User Data 约 700MB
- 影响 git 同步

**解决方案**：
```
chromedriver → %LOCALAPPDATA%\chromedriver_feishu\
Chrome User Data → %TEMP%\chrome_feishu_debug\
```

### 3.3 远程调试模式是最佳实践

**优点**：
- 复用已有 Chrome，登录状态保留
- 用户可以在 Chrome 中操作
- 脚本结束后 Chrome 继续使用

**启动命令**：
```batch
chrome.exe --remote-debugging-port=9222 --user-data-dir="%TEMP%\chrome_feishu_debug"
```

**连接代码**：
```python
options.add_experimental_option("debuggerAddress", "127.0.0.1:9222")
```

### 3.4 不要主动检测登录状态

**问题**：
- 脚本主动访问页面检测登录
- 干扰用户正常登录流程
- 导致登录卡住

**解决方案**：
- 让用户在 Chrome 中完成登录
- 只在检测到登录页面时提示

### 3.5 提供清晰的启动脚本

**两步走模式**：
1. `启动Chrome调试模式.bat` - 启动调试 Chrome
2. `运行脚本.bat` - 运行 Python 脚本

**优点**：
- 用户清楚每一步在做什么
- 出错时容易定位问题

---

## 4. 需求收集模板

当用户提出 Python + Selenium 自动化需求时，AI 应引导用户提供以下信息：

```
# 需求：[工具名称]

## 功能描述
[工具要实现的核心功能]

## 目标页面
[目标网站 URL 示例]

## 操作步骤（按顺序）
[例如：打开页面 → 等待加载 → 提取信息 → 保存结果]

## 技术要求
1. Python + Selenium 连接远程调试模式 Chrome（端口 9222）
2. chromedriver 自动检测版本并下载到系统目录（%LOCALAPPDATA%）
3. 项目目录不要生成大文件（chromedriver、Chrome User Data 放系统目录）
4. 另一台电脑 git pull 后只需安装依赖即可使用

## 用户体验要求
1. 小白用户友好，尽量自动化
2. 提供清晰的 .bat 启动脚本
3. 失败时自动重试
```

**AI 行动指南**：
1. 如果用户需求模糊，主动询问上述信息
2. 重点确认操作流程和关键 HTML 选择器
3. 按照模板收集需求后再开始编码
4. 确保输出包含：主脚本、.bat 启动脚本、requirements.txt、使用说明

---

## 5. 常见问题速查表

| 问题 | 解决方案 |
|------|----------|
| chromedriver 版本不匹配 | 自动检测并下载，无需用户操作 |
| 项目目录体积大 | chromedriver 放 %LOCALAPPDATA%，Chrome User Data 放 %TEMP% |
| 另一台电脑无法运行 | 自动下载 chromedriver + 提供完整 requirements.txt |
| 登录卡住 | 不要主动检测登录状态，让用户在 Chrome 中操作 |
| 粘贴多个链接识别不全 | `raw_text.replace('https://', '\nhttps://')` |
| 提取失败无重试 | 等待 + 刷新 + 重试机制 |

---

## 6. 文件结构模板

```
项目目录/
├── main_script.py               # 主脚本
├── 启动Chrome调试模式.bat        # 第一步
├── 运行脚本.bat                  # 第二步
├── requirements.txt             # Python 依赖
├── 使用说明.md                   # 用户文档
├── 维护文档.md                   # 开发者文档
└── output/                      # 输出目录

系统目录（不在项目中）：
%LOCALAPPDATA%\chromedriver_[项目名]\chromedriver.exe
%TEMP%\chrome_[项目名]_debug\
```

---

## 7. 与油猴脚本的协同

Python 脚本可以和油猴脚本协同工作：

| 场景 | 油猴脚本 | Python 脚本 |
|------|----------|-------------|
| 页面实时响应 | ✅ 处理 | ❌ 不适合 |
| 批量数据处理 | ❌ 不适合 | ✅ 处理 |
| 文件读写 | ❌ 受限 | ✅ 完全自由 |
| 定时任务 | ❌ 需页面打开 | ✅ 后台运行 |
| 跨域请求 | 需要 @grant | ✅ 无限制 |

**协同模式**：
1. 油猴脚本提供页面交互入口（如"导出"按钮）
2. Python 脚本处理批量数据和文件操作

---

## 8. 后续优化方向

1. **GUI 界面**：使用 tkinter 或 PyQt 提供图形界面
2. **配置文件**：支持 YAML/JSON 配置，避免修改代码
3. **日志系统**：结构化日志，支持日志轮转
4. **错误通知**：失败时发送通知（邮件/钉钉）
5. **并发处理**：多标签页并行处理提升效率

---

## 9. 相关文档

- `rules.md`：AI 编程规范（包含 Python + Selenium 规范）
- `飞书项目skills.md`：飞书相关开发经验
- 项目维护文档：各项目的 `维护文档.md`

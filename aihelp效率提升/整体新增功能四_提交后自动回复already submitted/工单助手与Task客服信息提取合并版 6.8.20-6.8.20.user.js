// ==UserScript==
// @name         工单助手与Task客服信息提取合并版 6.8.20
// @namespace    http://tampermonkey.net/
// @version      6.8.20
// @description  优化工单识别性能，并增强标题翻译、飞书搜索稳定性与复制链路
// @author       ll96victor
// @match        https://ml-panel.aihelp.net/*
// @match        https://ml.aihelp.net/*
// @match        https://aihelp.net.cn/*
// @match        https://aihelp.net/*
// @match        https://project.feishu.cn/ml/workObjectView/onlineissue/Cot68m5vg
// @match        https://project.feishu.cn/ml/workObjectView/onlineissue/Cot68m5vg?*
// @match        https://gm.moba.youngjoygame.com:8090/*
// @exclude      *://*/dashboard/#/newpage-ticket*
// @exclude      *://*/dashboard/#/newpage-ticket/*
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @grant        GM_setClipboard
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @grant        GM_openInTab
// @grant        GM_registerMenuCommand
// @connect      translate.googleapis.com
// @connect      api.mymemory.translated.net
// @connect      open.bigmodel.cn
// @connect      tmt.tencentcloudapi.com
// @connect      project.feishu.cn
// @connect      gm.moba.youngjoygame.com
// @run-at       document-end
// ==/UserScript==

/**
 * v6.8.20 (2026-03-24) 模块A/MCGG：切单后先清理旧关联第三方下拉弹层，避免旧搜索词串到新工单
 *
 * 【变更摘要】
 *   - SharedUtils：新增关联第三方下拉弹层清理逻辑，打开新字段前先关闭并清空旧弹层搜索框
 *   - 模块 A / MCGG：工单切换重置时同步清理旧的关联第三方下拉，减少上一单搜索词残留
 *   - 模块 A / MCGG：发现迭代再次打开下拉前会优先清场，避免把上一单的 `2.1.60` / `2.1.66` / `模式独立包` 串到当前单
 *
 * v6.8.19 (2026-03-24) 模块A/MCGG：收紧发现迭代唯一候选误点，工单切换后终止旧自动填充链路
 *
 * 【变更摘要】
 *   - 模块 A / MCGG：发现迭代不再使用“唯一候选”兜底，避免候选尚未刷新时误点旧值
 *   - 模块 A / MCGG：关联第三方自动填充增加工单上下文校验，工单切换后终止旧链路，避免旧工单残留动作串到新工单
 *   - 模块 A / MCGG：标题处理在工单切换后不再继续回填，降低旧异步流程干扰新工单的概率
 *
 * v6.8.18 (2026-03-24) 模块A/MCGG：修复发现迭代旧值残留
 *
 * 【变更摘要】
 *   - 模块 A / MCGG：发现迭代改回稳妥链路，使用正常候选等待并补最终字段值确认
 *   - 模块 A / MCGG：兼容 `2.1.66(非C#)` 这类扩展文本，避免页面继续残留旧值 `2.1.60`
 *   - 模块 A / MCGG：失败日志补充当前字段值，便于区分“候选未刷新”和“页面仍保留旧值”
 *
 * v6.8.17 (2026-03-24) 模块A/MCGG：发现迭代回退到 6.8.15 确认逻辑
 *
 * 【变更摘要】
 *   - 模块 A / MCGG：发现迭代自动填充成功判定回退到 6.8.15 风格，只按 legacy 选择结果记成功
 *   - 移除 6.8.16 新增的发现迭代专用确认链路，避免再次出现重试和误报失败
 *
 * v6.8.16 (2026-03-24) 模块A/MCGG：发现迭代误报修正，MCGG 翻译链路对齐模块 A
 *
 * 【变更摘要】
 *   - 模块 A / MCGG：发现迭代在旧下拉链路成功触发后，改为兼容扩展文本确认，修正“实际成功但日志失败”
 *   - 模块 B / MCGG：标题翻译、多源面板、中文保留面板与可编辑替换逻辑对齐模块 A
 *
 * v6.8.15 (2026-03-24) 模块A/MCGG：发现迭代回退到 6.8.11 风格逻辑
 *
 * 【变更摘要】
 *   - 模块 A / MCGG：发现迭代改回 6.8.11 风格，恢复“实际填充优先，允许日志不准”的旧行为
 *   - 发现迭代专用下拉链路恢复为 1200ms 搜索等待 + 精确/模糊匹配，不再使用唯一候选、二次等待和最终字段值兜底
 *   - 普通工单与 MCGG 的发现迭代焦点触发/自动处理，均恢复为只按旧链路返回值判定成功
 *
 * v6.8.14 (2026-03-23) 模块A/MCGG：发现迭代改为最终字段值优先判定，避免“实际成功但日志失败”
 *
 * 【变更摘要】
 *   - 模块 A / MCGG：发现迭代在下拉搜索返回失败后，继续按字段最终值做确认；只要值已生效，就按成功处理
 *   - 模块 A / MCGG：发现迭代确认等待时间放宽到 2.6 秒，降低异步回填稍慢导致的误判
 *   - 模块 MCGG：发现迭代成功判定从严格全等改为兼容扩展文本，避免已选中 `1.2.60(非C#)` 仍判失败
 *
 * v6.8.13 (2026-03-23) 模块A：唯一候选兜底点击、翻译面板增量展示、无ServerID继续翻译
 *
 * 【变更摘要】
 *   - 模块 A：下拉搜索在精确/模糊匹配之外新增“唯一候选”点击兜底，并增加二次等待，优先保证发现迭代自动填充成功
 *   - 模块 A：多源翻译面板改为先展示已返回结果，再增量补齐后续结果，不再等待全部翻译源结束
 *   - 模块 A：未识别到 ServerID 时，仅跳过发现迭代/渠道自动处理，标题翻译与多源面板继续执行
 *   - 模块 A：普通工单模块内所有 MCGG 排除判断统一收紧为只识别 `【MCGG】`
 *
 * v6.8.12 (2026-03-23) 模块A：多源面板提速、发现迭代成功判定放宽、腾讯翻译配置简化
 *
 * 【变更摘要】
 *   - 模块 A：多源面板改为渠道稳定后 100ms 展示，渠道阶段超过 2 秒直接强制展示
 *   - 模块 A：普通工单「发现迭代」成功判定放宽，兼容 `2.1.60` 命中 `2.1.60(非C#)`，并收敛重复失败日志
 *   - 模块 A：腾讯翻译仅保留 SecretId / SecretKey 菜单配置，Region 默认 `ap-beijing`，ProjectId 默认 `0`
 *
 * v6.8.10 (2026-03-22) Fix mail reward click confirmation chain and add fallback recovery for normal-ticket iteration/channel autofill
 *
 * v6.8.9 (2026-03-22) 优化了飞书页的逻辑，MCGG工单的“功能模块”自动处理，发送邮件未识别的问题
 *
 * v6.8.8 (2026-03-22) 创建人自动填充；下拉选中项误点修复；翻译面板可编辑；邮件一键发送模块 H
 *
 * 【变更摘要】
 *   - 模块 A：关联第三方「创建人*」在标题处理后、发现迭代前自动选「梁磊」
 *   - selectDropdownOption：不再用当前「已选中」项作为回退，避免渠道需从「全服」改「测服」时误点全服
 *   - 翻译交互面板：强制可编辑（user-select / pointer-events），避免受状态栏 user-select:none 影响
 *   - 模块 H：状态栏「邮」+ 展开「发送邮件」，按邮件类型字典走 更多→发送奖励→…→解决 流程（独立 IIFE）
 *
 * v6.8.7 (2026-03-22) 飞书搜索日志 requestId；维护文档与回归清单同步（见仓库维护与交接文档）
 *
 * 【变更摘要】
 *   - 飞书：每次触发搜索生成 `searchRequestId`（形如 fs_<时间戳>_<随机>），写入 pending，AIHelp/飞书端控制台与面板日志带同一前缀便于对照
 *
 * v6.8.6 (2026-03-22) 内部回复二段点击；关联第三方下拉定位增强
 *
 * 【变更摘要】
 *   - 模块 G：若已存在标题为「内部回复」的对话框，则点击底部「回复」；否则仍点工具栏「内部回复」
 *   - 关联第三方：优先识别 `.custom-down-select-search` 弹出层；展开时依次尝试 input / 箭头 / 合成事件；填充链路带 `preferThirdLink`
 *   - 关联第三方行标题匹配放宽（含「发现迭代*」等）；自动处理前短暂等待 DOM 就绪
 *
 * v6.8.5 (2026-03-22) 关联第三方：发现迭代/渠道自动选择修复与 MCGG 对齐
 *
 * 【变更摘要】
 *   - 修复油猴环境下 MouseEvent 传入 view 导致下拉无法展开（关联第三方自动填充失效）
 *   - 「关联第三方」内按 tabDetail-item.thirdLink + 标题定位，点击 el-select 后搜索并点击匹配项
 *   - 「渠道」若当前展示值已与 ServerID 推断一致则跳过，避免重复操作
 *   - MCGG 工单在标题处理完成后同样自动处理发现迭代与渠道
 *   - 飞书 not_logged_in 提示增加「后台已开标签页」说明，减轻误报困扰
 *
 * v6.8.3 (2026-03-21) 第二批中风险优化：工单ID识别收敛
 *
 * 【优化内容】
 *   - `getCurrentTicketID` 改为 URL 直取优先、局部容器优先、全局扫描兜底
 *   - 减少 500ms 轮询时的大范围 DOM 遍历，降低页面扫描开销
 *   - 保持原有容错能力，避免直接缩窄选择器导致漏识别
 *
 * v6.8.2 (2026-03-21) 翻译链路、飞书搜索与状态栏视觉优化
 *
 * 【优化内容】
 *   - 恢复各模块调试日志默认开启，保留日志面板可观测性
 *   - 标题无冒号时也走翻译流程，繁体中文支持转简体候选
 *   - 中文标题保留交互面板，不再因跳过外部翻译而丢失候选面板
 *   - 飞书搜索仅作用于目标页面，增加心跳复用并在返回结果后自动刷新目标页
 *   - 重绘六宫格状态栏配色与层次，移除 MCGG 紫色方案
 *
 * v6.8.1 (2026-03-21) 低风险清理与日志门控整理
 *
 * 【优化内容】
 *   - 统一 AIHelp 目标页判断逻辑，减少重复代码
 *   - 删除未使用的翻译源实现与失效的 DOM 选择器
 *   - 修正状态栏六区域注释，避免维护时混淆
 *   - 收紧调试日志开关，减少生产环境控制台噪音
 *
 * 【历史更新】
 * v6.8.0 (2026-03-19) 新增内部回复快捷按钮功能（模块G）
 *
 * 【新增功能 - 模块G：内部回复】
 * 需求来源：用户需求新增"内部回复"按钮
 * 功能说明：
 *   - 在主脚本小图标新增"内"区域（第6格），替换原来的空白格
 *   - 展开面板中新增"内部回复"按钮
 *   - 用户点击后，自动查找并模拟点击工单界面的"内部回复"或"内部备注"按钮
 * 实现机制：
 *   - 纯前端DOM操作模拟点击，快速响应
 * 耦合性：完全独立模块
 *
 * 【历史更新】
 * v6.7.0 (2026-03-19) 新增清除头像冷却时间功能（模块F）
 *
 * 【新增功能 - 模块F：清除头像冷却时间】
 * 需求来源：gm工具\清除头像\清除头像冷却时间-1.1.0-新增日志面板同步.user.js
 * 功能说明：
 *   - 在主脚本小图标新增"清"区域（第5格），点击后提取当前工单的UID和ServerID
 *   - 自动以弹窗方式打开GM工具页面（https://gm.moba.youngjoygame.com:8090/#/customer/banTool）
 *   - GM工具页面自动选择服务器、输入UID、点击执行，完成清除操作
 *   - GM工具页面执行日志通过GM_setValue跨域同步到主脚本日志面板
 *   - 展开面板中新增"清除头像"按钮，与"清"图标功能相同
 * 实现机制：
 *   - AIHelp端（模块F-AIHelp）：提取UID/ServerID → GM_setValue写入 → window.open弹窗
 *   - GM工具端（模块F-GM，独立IIFE）：读取任务 → 自动操作 → 日志写入GM存储
 *   - AIHelp端轮询 GM_getValue 获取GM工具日志并实时显示在日志面板
 * 耦合性：模块完全独立封装，不干扰现有功能；图标与展开面板均已集成
 *
 * 【历史更新】
 * v6.6.2: 飞书端修复搜索功能稳定性
 * v6.6.0 (2026-03-18): 新增飞书项目 Ticket ID 搜索功能（模块E）
 * v6.5.7: 翻译源精简与延迟优化，移除不稳定源(DeepLX/Popcat)，保留三大核心稳定源
 * v6.5.6: 增强 DeepLX 和 Popcat 稳定性（已在 v6.5.7 移除）
 * v6.5.5: 修复谷歌翻译超时问题（恢复为 6 秒超时）
 */

(function() {
    'use strict';

    // ===================== 最优先：URL检查 =====================
    // 参考脚本：AiHelp Task 信息提取一键复制.user
    // 如果URL包含ticket，直接退出整个脚本，不执行任何代码
    const currentUrl = window.location.href;
    if (currentUrl.includes('ticket')) {
        console.log('[工单助手] URL包含ticket，跳过脚本加载');
        return;
    }

    // 判定当前页面是否为目标页面
    function isTargetAIHelpPage() {
        return currentUrl.includes('task?orderId') || currentUrl.includes('tasks?searchType');
    }

    function isTargetPage() {
        return isTargetAIHelpPage();
    }

    if (!isTargetPage()) {
        console.log('[工单助手] 非目标页面，跳过脚本加载');
        return;
    }

    console.log('[工单助手] 目标页面，开始加载脚本');

    // ===================== 公共区域：页面判定逻辑 =====================

    /**
     * 判断是否应该运行普通工单模块
     */
    function shouldRunNormalModule() {
        return isTargetAIHelpPage();
    }

    /**
     * 判断是否应该运行Task模块
     */
    function shouldRunTaskModule() {
        return isTargetAIHelpPage();
    }

    // ===================== 公共区域：状态栏 UI 类 (六区域图标版) =====================
    // 注意：UI始终创建，各模块根据URL决定是否运行

    /**
     * 状态栏UI类 - 七区域图标版（含「邮」）
     * 小图标分为七个独立可点击区域，支持拖拽
     * 支持日志面板可拖拽、可调整大小、位置和大小记忆
     */
    class StatusbarUI {
        static STORAGE_KEYS = {
            STATUS_BAR_POSITION: 'feishu_tools_status_bar_position_v1',
            LOG_PANEL_POSITION: 'feishu_tools_log_panel_position_v1',
            LOG_PANEL_SIZE: 'feishu_tools_log_panel_size_v1'
        };

        constructor(config = {}) {
            this.config = {
                maxLogLines: 100,
                initialPosition: { top: '120px', right: '320px' },
                tipDelay: 3000,
                logCleanupInterval: 60000,
                defaultLogPanelSize: { width: 420, height: 350 },
                minLogPanelSize: { width: 120, height: 200 },
                ...config
            };
            this.container = null;
            this.iconElement = null;
            this.expandedElement = null;
            this.logContainer = null;
            this.isDragging = false;
            this.dragStartPos = { x: 0, y: 0 };
            this.isExpanded = false;
            this.actionCallbacks = {
                normal: null,
                mcgg: null,
                task: null,
                clear: null,   // [模块F] 清除头像冷却时间
                reply: null,   // [模块G] 内部回复
                mail: null,    // [模块H] 邮件一键发送
                expand: null
            };
            this.delayedTipTimers = {};
            this.delayedTipElements = {};
            this.zoneTips = {
                normal: { title: '普通工单', desc: '复制内部描述，自动翻译标题' },
                mcgg: { title: 'MCGG工单', desc: '复制描述，MCGG标题处理' },
                task: { title: 'Task信息', desc: '提取客服信息并复制链接' },
                clear: { title: '清除头像', desc: '提取信息并清除头像冷却' }, // [模块F]
                reply: { title: '内部回复', desc: '点击工单界面的内部回复按钮' }, // [模块G]
                mail: { title: '发送邮件', desc: '按类型自动：更多→发送奖励→选择奖励→解决' }, // [模块H]
                expand: { title: '展开面板', desc: '查看日志和更多选项' }
            };
            // [模块F] 跨域日志轮询相关（GM工具页面 → 主脚本日志面板）
            this.clearAvatarLogPollingTimer = null;
            this.clearAvatarLastLogTimestamp = 0;
            this.clearAvatarLogPollingInterval = 500;
            this.logData = [];
            this.logCleanupTimer = null;
            this.isPanelDragging = false;
            this.panelDragStartPos = { x: 0, y: 0 };
            this.panelOffset = { x: 0, y: 0 };
            this.isResizing = false;
            this.resizeStartPos = { x: 0, y: 0 };
            this.resizeStartSize = { width: 0, height: 0 };
            this.resizeObserver = null;
            this.saveSizeTimeout = null;

            this.init();
        }

        saveToStorage(key, data) {
            try {
                localStorage.setItem(key, JSON.stringify(data));
            } catch (e) {
                console.error('[UI] 存储数据失败:', key, e.message);
            }
        }

        loadFromStorage(key, defaultValue = null) {
            try {
                const data = localStorage.getItem(key);
                if (data) {
                    return JSON.parse(data);
                }
            } catch (e) {
                console.error('[UI] 读取存储数据失败:', key, e.message);
            }
            return defaultValue;
        }

        saveStatusBarPosition() {
            if (!this.container) return;
            try {
                const rect = this.container.getBoundingClientRect();
                const position = {
                    left: Math.round(rect.left),
                    top: Math.round(rect.top)
                };
                this.saveToStorage(StatusbarUI.STORAGE_KEYS.STATUS_BAR_POSITION, position);
            } catch (e) {
                console.error('[UI] 保存状态栏位置失败:', e.message);
            }
        }

        loadStatusBarPosition() {
            const position = this.loadFromStorage(StatusbarUI.STORAGE_KEYS.STATUS_BAR_POSITION);
            if (position && typeof position.left === 'number' && typeof position.top === 'number') {
                return position;
            }
            return null;
        }

        saveLogPanelPosition() {
            if (!this.expandedElement) return;
            try {
                const rect = this.expandedElement.getBoundingClientRect();
                const position = {
                    left: Math.round(rect.left),
                    top: Math.round(rect.top)
                };
                this.saveToStorage(StatusbarUI.STORAGE_KEYS.LOG_PANEL_POSITION, position);
            } catch (e) {
                console.error('[UI] 保存日志面板位置失败:', e.message);
            }
        }

        loadLogPanelPosition() {
            const position = this.loadFromStorage(StatusbarUI.STORAGE_KEYS.LOG_PANEL_POSITION);
            if (position && typeof position.left === 'number' && typeof position.top === 'number') {
                return position;
            }
            return null;
        }

        saveLogPanelSize() {
            if (!this.expandedElement) return;
            try {
                const rect = this.expandedElement.getBoundingClientRect();
                const size = {
                    width: Math.round(rect.width),
                    height: Math.round(rect.height)
                };
                this.saveToStorage(StatusbarUI.STORAGE_KEYS.LOG_PANEL_SIZE, size);
            } catch (e) {
                console.error('[UI] 保存日志面板大小失败:', e.message);
            }
        }

        loadLogPanelSize() {
            const size = this.loadFromStorage(StatusbarUI.STORAGE_KEYS.LOG_PANEL_SIZE);
            if (size && typeof size.width === 'number' && typeof size.height === 'number') {
                return size;
            }
            return this.config.defaultLogPanelSize;
        }

        init() {
            this.injectStyles();
            this.createDOM();
            this.bindEvents();
            this.startLogCleanupTimer();
        }

        injectStyles() {
            GM_addStyle(`
                .ai-status-bar-container {
                    position: fixed;
                    z-index: 999999;
                    font-family: "Trebuchet MS", "Avenir Next", "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
                    user-select: none;
                }

                /* 七区域图标容器（2列×4行，末行「邮」跨两列） */
                .ai-status-icon {
                    width: 44px;
                    height: 88px;
                    border-radius: 12px;
                    background: linear-gradient(180deg, #ffffff 0%, #eef3f9 100%);
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    grid-template-rows: 1fr 1fr 1fr 1fr;
                    box-shadow: 0 10px 26px rgba(15, 23, 42, 0.18);
                    cursor: move;
                    border: 1px solid rgba(148, 163, 184, 0.28);
                    transition: transform 0.2s, box-shadow 0.2s;
                }
                .ai-status-icon:hover {
                    box-shadow: 0 14px 32px rgba(15, 23, 42, 0.24);
                }
                .ai-status-icon.dragging {
                    cursor: grabbing;
                    box-shadow: 0 16px 36px rgba(15, 23, 42, 0.3);
                }

                /* 六个功能区域 */
                .ai-icon-zone {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 13px;
                    font-weight: 700;
                    cursor: pointer;
                    transition: background 0.15s ease, opacity 0.15s ease, transform 0.15s ease;
                    position: relative;
                    width: 22px;
                    height: 22px;
                    flex-shrink: 0;
                    overflow: visible;
                    text-shadow: 0 1px 1px rgba(0, 0, 0, 0.16);
                }
                .ai-icon-zone:hover {
                    transform: translateY(-1px);
                }

                /* 区域1：普通工单 - 左上 - 蓝色 */
                .ai-icon-zone-normal {
                    background: linear-gradient(135deg, #3370ff 0%, #4e8cff 100%);
                    color: white;
                    border-radius: 6px 0 0 0;
                }
                .ai-icon-zone-normal:hover {
                    background: linear-gradient(135deg, #285acc 0%, #3d6fd9 100%);
                }
                .ai-icon-zone-normal:active {
                    opacity: 0.7;
                }

                /* 区域2：MCGG - 右上 - 青绿色 */
                .ai-icon-zone-mcgg {
                    background: linear-gradient(135deg, #0f9b8e 0%, #22c7b8 100%);
                    color: white;
                    border-radius: 0 6px 0 0;
                }
                .ai-icon-zone-mcgg:hover {
                    background: linear-gradient(135deg, #0b7f74 0%, #19a99b 100%);
                }
                .ai-icon-zone-mcgg:active {
                    opacity: 0.7;
                }

                /* 区域3：Task - 左中 - 暖金色 */
                .ai-icon-zone-task {
                    background: linear-gradient(135deg, #f3b63f 0%, #f28b54 100%);
                    color: white;
                    border-radius: 0;
                }
                .ai-icon-zone-task:hover {
                    background: linear-gradient(135deg, #df9d1c 0%, #ea7235 100%);
                }
                .ai-icon-zone-task:active {
                    opacity: 0.7;
                }

                /* 区域4：展开面板 - 右中 - 石板蓝 */
                .ai-icon-zone-expand {
                    background: linear-gradient(135deg, #4765a8 0%, #5f7cc0 100%);
                    color: white;
                    border-radius: 0;
                }
                .ai-icon-zone-expand:hover {
                    background: linear-gradient(135deg, #35518f 0%, #4968ad 100%);
                }
                .ai-icon-zone-expand:active {
                    opacity: 0.7;
                }

                /* [模块F] 区域5：清除头像 - 左下 - 绿色 */
                .ai-icon-zone-clear {
                    background: linear-gradient(135deg, #52c41a 0%, #73d13d 100%);
                    color: white;
                    border-radius: 0 0 0 6px;
                }
                .ai-icon-zone-clear:hover {
                    background: linear-gradient(135deg, #3fad0a 0%, #5cb82d 100%);
                }
                .ai-icon-zone-clear:active {
                    opacity: 0.7;
                }

                /* [模块G] 区域6：内部回复 - 右下 - 橙色 */
                .ai-icon-zone-reply {
                    background: linear-gradient(135deg, #fa8c16 0%, #ffa940 100%);
                    color: white;
                    border-radius: 0;
                }
                .ai-icon-zone-reply:hover {
                    background: linear-gradient(135deg, #d46b08 0%, #e8922d 100%);
                }
                .ai-icon-zone-reply:active {
                    opacity: 0.7;
                }

                /* [模块H] 区域7：发送邮件 - 底行通栏 - 紫色 */
                .ai-icon-zone-mail {
                    grid-column: 1 / -1;
                    width: 100%;
                    min-width: 0;
                    background: linear-gradient(135deg, #722ed1 0%, #9254de 100%);
                    color: white;
                    border-radius: 0 0 6px 6px;
                    font-size: 12px;
                }
                .ai-icon-zone-mail:hover {
                    background: linear-gradient(135deg, #531dab 0%, #722ed1 100%);
                }
                .ai-icon-zone-mail:active {
                    opacity: 0.7;
                }

                .btn-mail { background: linear-gradient(135deg, #722ed1 0%, #9254de 100%); color: white; }
                .btn-mail:hover { opacity: 0.92; transform: translateY(-1px); }
                .btn-mail.success { background: linear-gradient(135deg, #531dab 0%, #722ed1 100%) !important; }

                /* 成功状态 */
                .ai-icon-zone.success {
                    background: linear-gradient(135deg, #52c41a 0%, #73d13d 100%) !important;
                }

                /* 处理中状态 */
                .ai-icon-zone.processing {
                    opacity: 0.6;
                }

                /* zone文本容器 */
                .ai-zone-text {
                    pointer-events: none;
                }

                /* 展开面板 */
                .ai-status-expanded {
                    position: fixed;
                    top: 100px;
                    left: 100px;
                    width: 420px;
                    height: 350px;
                    min-width: 120px;
                    min-height: 200px;
                    background: linear-gradient(180deg, rgba(255, 255, 255, 0.98) 0%, rgba(246, 250, 253, 0.96) 100%);
                    backdrop-filter: blur(10px);
                    border-radius: 14px;
                    box-shadow: 0 20px 44px rgba(15, 23, 42, 0.18);
                    padding: 12px;
                    border: 1px solid rgba(148, 163, 184, 0.24);
                    display: flex;
                    flex-direction: column;
                    gap: 10px;
                    transform-origin: top left;
                    overflow: auto;
                }

                .ai-status-expanded.dragging {
                    cursor: move;
                    user-select: none;
                }

                .ai-status-expanded.resizing {
                    user-select: none;
                }

                .ai-panel-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    border-bottom: 1px solid rgba(0, 0, 0, 0.05);
                    padding-bottom: 8px;
                    cursor: move;
                    flex-shrink: 0;
                }

                .ai-panel-header:active {
                    cursor: grabbing;
                }

                .ai-resize-handle {
                    position: absolute;
                    right: 0;
                    bottom: 0;
                    width: 20px;
                    height: 20px;
                    cursor: se-resize;
                    background: linear-gradient(135deg, transparent 50%, rgba(0, 0, 0, 0.25) 50%);
                    border-radius: 0 0 12px 0;
                    z-index: 10;
                }

                .ai-resize-handle:hover {
                    background: linear-gradient(135deg, transparent 50%, rgba(51, 112, 255, 0.5) 50%);
                }

                .ai-resize-handle:active {
                    background: linear-gradient(135deg, transparent 50%, rgba(51, 112, 255, 0.7) 50%);
                }

                .ai-status-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    border-bottom: 1px solid rgba(0, 0, 0, 0.05);
                    padding-bottom: 8px;
                    flex-shrink: 0;
                }
                .ai-status-title {
                    font-size: 13px;
                    font-weight: 600;
                    color: #1d1d1f;
                }
                .ai-status-close {
                    border: none;
                    background: #f5f5f7;
                    width: 20px;
                    height: 20px;
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    cursor: pointer;
                    color: #86868b;
                    font-size: 14px;
                    transition: background 0.2s;
                }
                .ai-status-close:hover { background: #e5e5e7; color: #1d1d1f; }

                .ai-status-actions {
                    display: flex;
                    flex-wrap: wrap;
                    gap: 8px;
                }
                .ai-status-actions button {
                    padding: 6px 12px;
                    border: none;
                    border-radius: 6px;
                    font-size: 12px;
                    font-weight: 500;
                    cursor: pointer;
                    transition: all 0.2s;
                    display: flex;
                    align-items: center;
                    gap: 4px;
                }

                .btn-normal { background: #3370ff; color: white; }
                .btn-normal:hover { background: #285acc; transform: translateY(-1px); }
                .btn-normal.success { background: #52c41a !important; }

                .btn-mcgg { background: linear-gradient(135deg, #0f9b8e 0%, #22c7b8 100%); color: white; }
                .btn-mcgg:hover { opacity: 0.9; transform: translateY(-1px); }
                .btn-mcgg.success { background: linear-gradient(135deg, #11998e 0%, #38ef7d 100%) !important; }

                .btn-task { background: linear-gradient(135deg, #f6d365 0%, #fda085 100%); color: white; }
                .btn-task:hover { opacity: 0.9; transform: translateY(-1px); }
                .btn-task.success { background: linear-gradient(135deg, #11998e 0%, #38ef7d 100%) !important; }

                /* [模块F] 清除头像按钮样式 */
                .btn-clear { background: linear-gradient(135deg, #52c41a 0%, #73d13d 100%); color: white; }
                .btn-clear:hover { background: linear-gradient(135deg, #3fad0a 0%, #5cb82d 100%); transform: translateY(-1px); }
                .btn-clear.success { background: linear-gradient(135deg, #52c41a 0%, #73d13d 100%) !important; }

                /* [模块F] GM工具日志模块标签 */
                .ai-log-module-clear { color: #52c41a; font-weight: 600; }

                /* [模块G] 内部回复按钮样式 */
                .btn-reply { background: linear-gradient(135deg, #fa8c16 0%, #ffa940 100%); color: white; }
                .btn-reply:hover { background: linear-gradient(135deg, #d46b08 0%, #e8922d 100%); transform: translateY(-1px); }
                .btn-reply.success { background: linear-gradient(135deg, #fa8c16 0%, #ffa940 100%) !important; }

                /* [模块G] 内部回复日志模块标签 */
                .ai-log-module-reply { color: #fa8c16; font-weight: 600; }

                .ai-status-logs {
                    flex: 1;
                    min-height: 80px;
                    overflow-y: auto;
                    background: #f9f9f9;
                    border-radius: 6px;
                    padding: 8px;
                    font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;
                    font-size: 11px;
                    line-height: 1.5;
                    border: 1px solid rgba(0,0,0,0.03);
                    user-select: text;
                    -webkit-user-select: text;
                    -moz-user-select: text;
                    cursor: text;
                }
                .ai-log-item { margin-bottom: 4px; padding-bottom: 2px; border-bottom: 1px solid rgba(0,0,0,0.02); word-break: break-all; }
                .ai-log-info { color: #1d1d1f; }
                .ai-log-success { color: #52c41a; }
                .ai-log-warn { color: #faad14; }
                .ai-log-error { color: #ff4d4f; }

                .ai-log-module-normal { color: #3370ff; font-weight: 600; }
                .ai-log-module-mcgg { color: #0f9b8e; font-weight: 600; }
                .ai-log-module-task { color: #f5a623; font-weight: 600; }
                .ai-log-module-mail { color: #722ed1; font-weight: 600; }

                /* 多源翻译面板：避免继承状态栏 user-select:none 导致输入框无法编辑 */
                #ai-merged-statusbar .ai-translation-panel,
                #ai-merged-statusbar .ai-translation-panel input,
                #ai-merged-statusbar .ai-translation-panel button {
                    user-select: text !important;
                    -webkit-user-select: text !important;
                    pointer-events: auto !important;
                }

                /* 5秒延迟详细提示 */
                .ai-delayed-tip {
                    position: absolute;
                    background: rgba(0, 0, 0, 0.9);
                    color: white;
                    padding: 8px 12px;
                    border-radius: 6px;
                    font-size: 12px;
                    line-height: 1.5;
                    white-space: nowrap;
                    pointer-events: none;
                    opacity: 0;
                    transform: translateX(-50%) translateY(5px);
                    transition: opacity 0.3s ease, transform 0.3s ease;
                    z-index: 1001;
                    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
                    max-width: 200px;
                }
                .ai-delayed-tip.visible {
                    opacity: 1;
                    transform: translateX(-50%) translateY(0);
                }
                .ai-delayed-tip-title {
                    font-weight: 600;
                    margin-bottom: 4px;
                    color: #fff;
                }
                .ai-delayed-tip-desc {
                    font-size: 11px;
                    color: rgba(255, 255, 255, 0.85);
                }
            `);
        }

        createDOM() {
            this.container = document.createElement('div');
            this.container.id = 'ai-merged-statusbar';
            this.container.className = 'ai-status-bar-container';

            const savedPosition = this.loadStatusBarPosition();
            if (savedPosition) {
                this.container.style.left = savedPosition.left + 'px';
                this.container.style.top = savedPosition.top + 'px';
                this.container.style.right = 'auto';
            } else {
                Object.assign(this.container.style, this.config.initialPosition);
            }

            this.iconElement = document.createElement('div');
            this.iconElement.className = 'ai-status-icon';

            const zoneNormal = document.createElement('div');
            zoneNormal.className = 'ai-icon-zone ai-icon-zone-normal';
            zoneNormal.innerHTML = '<span class="ai-zone-text">N</span>';
            zoneNormal.dataset.zone = 'normal';

            const zoneMcgg = document.createElement('div');
            zoneMcgg.className = 'ai-icon-zone ai-icon-zone-mcgg';
            zoneMcgg.innerHTML = '<span class="ai-zone-text">M</span>';
            zoneMcgg.dataset.zone = 'mcgg';

            const zoneTask = document.createElement('div');
            zoneTask.className = 'ai-icon-zone ai-icon-zone-task';
            zoneTask.innerHTML = '<span class="ai-zone-text">T</span>';
            zoneTask.dataset.zone = 'task';

            const zoneExpand = document.createElement('div');
            zoneExpand.className = 'ai-icon-zone ai-icon-zone-expand';
            zoneExpand.innerHTML = '<span class="ai-zone-text">⚡</span>';
            zoneExpand.dataset.zone = 'expand';

            // [模块F] 新增"清除头像"图标区域（第5格，左中位置）
            const zoneClear = document.createElement('div');
            zoneClear.className = 'ai-icon-zone ai-icon-zone-clear';
            zoneClear.innerHTML = '<span class="ai-zone-text">清</span>';
            zoneClear.dataset.zone = 'clear';

            // 组装图标容器（7 格 2 列×4 行：N/M/T/⚡/清/内 + 底行「邮」通栏）
            // 第1行：N（普通）、M（MCGG）
            // 第2行：T（Task）、⚡（展开）
            // 第3行：清（清除头像）、内（内部回复）
            // 第4行：邮（发送邮件，跨两列）
            const zoneReply = document.createElement('div');
            zoneReply.className = 'ai-icon-zone ai-icon-zone-reply';
            zoneReply.innerHTML = '<span class="ai-zone-text">内</span>';
            zoneReply.dataset.zone = 'reply';

            const zoneMail = document.createElement('div');
            zoneMail.className = 'ai-icon-zone ai-icon-zone-mail';
            zoneMail.innerHTML = '<span class="ai-zone-text">邮</span>';
            zoneMail.dataset.zone = 'mail';

            this.iconElement.append(zoneNormal, zoneMcgg, zoneTask, zoneExpand, zoneClear, zoneReply, zoneMail);
            this.zones = { normal: zoneNormal, mcgg: zoneMcgg, task: zoneTask, expand: zoneExpand, clear: zoneClear, reply: zoneReply, mail: zoneMail };

            this.expandedElement = document.createElement('div');
            this.expandedElement.className = 'ai-status-expanded';
            this.expandedElement.style.display = 'none';
            this.expandedElement.style.transform = 'scale(0.8)';
            this.expandedElement.style.opacity = '0';

            const savedSize = this.loadLogPanelSize();
            this.expandedElement.style.width = savedSize.width + 'px';
            this.expandedElement.style.height = savedSize.height + 'px';

            const header = document.createElement('div');
            header.className = 'ai-panel-header';
            header.innerHTML = `
                <span class="ai-status-title">工单助手 & Task 复制</span>
                <button class="ai-status-close">×</button>
            `;

            this.actionContainer = document.createElement('div');
            this.actionContainer.className = 'ai-status-actions';
            this.actionContainer.style.flexShrink = '0';

            this.logContainer = document.createElement('div');
            this.logContainer.className = 'ai-status-logs';

            const resizeHandle = document.createElement('div');
            resizeHandle.className = 'ai-resize-handle';

            this.expandedElement.append(header, this.actionContainer, this.logContainer, resizeHandle);
            this.container.append(this.iconElement, this.expandedElement);
            document.body.appendChild(this.container);
        }

        bindEvents() {
            let mouseDownTime = 0;
            let mouseDownPos = { x: 0, y: 0 };
            let hasMoved = false;

            const handleMouseDown = (e) => {
                if (e.button !== 0) return;
                mouseDownTime = Date.now();
                mouseDownPos = { x: e.clientX, y: e.clientY };
                hasMoved = false;
                this.isDragging = false;

                const rect = this.container.getBoundingClientRect();
                const offset = { x: e.clientX - rect.left, y: e.clientY - rect.top };

                const handleMouseMove = (moveEvent) => {
                    const dx = moveEvent.clientX - mouseDownPos.x;
                    const dy = moveEvent.clientY - mouseDownPos.y;

                    if (!hasMoved && (Math.abs(dx) > 5 || Math.abs(dy) > 5)) {
                        hasMoved = true;
                        this.isDragging = true;
                        this.iconElement.classList.add('dragging');
                        this.container.style.transition = 'none';
                        this.hideAllDelayedTips();
                    }

                    if (this.isDragging) {
                        let newX = moveEvent.clientX - offset.x;
                        let newY = moveEvent.clientY - offset.y;
                        newX = Math.max(0, Math.min(newX, window.innerWidth - 44));
                        newY = Math.max(0, Math.min(newY, window.innerHeight - 88)); // 图标高度 88px（2列×4 行含「邮」）
                        this.container.style.left = newX + 'px';
                        this.container.style.top = newY + 'px';
                        this.container.style.right = 'auto';
                        this.container.style.bottom = 'auto';
                    }
                };

                const handleMouseUp = (upEvent) => {
                    document.removeEventListener('mousemove', handleMouseMove);
                    document.removeEventListener('mouseup', handleMouseUp);

                    this.iconElement.classList.remove('dragging');

                    if (this.isDragging) {
                        this.container.style.transition = 'all 0.3s cubic-bezier(0.18, 0.89, 0.32, 1.28)';
                        this.saveStatusBarPosition();
                    } else {
                        const target = upEvent.target.closest('.ai-icon-zone');
                        if (target) {
                            const zone = target.dataset.zone;
                            this.handleZoneClick(zone, target);
                        }
                    }

                    this.isDragging = false;
                };

                document.addEventListener('mousemove', handleMouseMove);
                document.addEventListener('mouseup', handleMouseUp);
            };

            this.iconElement.addEventListener('mousedown', handleMouseDown);

            Object.keys(this.zones).forEach(zoneName => {
                const zone = this.zones[zoneName];

                zone.addEventListener('mouseenter', () => {
                    this.startDelayedTipTimer(zoneName);
                });

                zone.addEventListener('mouseleave', () => {
                    this.cancelDelayedTipTimer(zoneName);
                    this.hideDelayedTip(zoneName);
                });

                zone.addEventListener('mousemove', () => {
                    this.cancelDelayedTipTimer(zoneName);
                    this.startDelayedTipTimer(zoneName);
                });
            });

            this.expandedElement.querySelector('.ai-status-close').addEventListener('click', (e) => {
                e.stopPropagation();
                this.collapse();
            });

            this.bindPanelDragEvents();
            this.bindPanelResizeEvents();
        }

        bindPanelDragEvents() {
            const header = this.expandedElement.querySelector('.ai-panel-header');
            if (!header) return;

            let panelMouseDownPos = { x: 0, y: 0 };
            let panelHasMoved = false;

            const handlePanelMouseDown = (e) => {
                if (e.button !== 0) return;
                if (e.target.closest('.ai-status-close')) return;

                this.isPanelDragging = false;
                panelHasMoved = false;
                panelMouseDownPos = { x: e.clientX, y: e.clientY };

                const rect = this.expandedElement.getBoundingClientRect();
                this.panelOffset = {
                    x: e.clientX - rect.left,
                    y: e.clientY - rect.top
                };

                this.expandedElement.classList.add('dragging');

                const handlePanelMouseMove = (moveEvent) => {
                    const dx = moveEvent.clientX - panelMouseDownPos.x;
                    const dy = moveEvent.clientY - panelMouseDownPos.y;

                    if (!panelHasMoved && (Math.abs(dx) > 3 || Math.abs(dy) > 3)) {
                        panelHasMoved = true;
                        this.isPanelDragging = true;
                    }

                    if (this.isPanelDragging) {
                        let newX = moveEvent.clientX - this.panelOffset.x;
                        let newY = moveEvent.clientY - this.panelOffset.y;
                        newX = Math.max(0, Math.min(newX, window.innerWidth - 100));
                        newY = Math.max(0, Math.min(newY, window.innerHeight - 50));

                        this.expandedElement.style.left = newX + 'px';
                        this.expandedElement.style.top = newY + 'px';
                    }
                };

                const handlePanelMouseUp = () => {
                    document.removeEventListener('mousemove', handlePanelMouseMove);
                    document.removeEventListener('mouseup', handlePanelMouseUp);

                    this.expandedElement.classList.remove('dragging');

                    if (this.isPanelDragging) {
                        this.saveLogPanelPosition();
                    }

                    this.isPanelDragging = false;
                };

                document.addEventListener('mousemove', handlePanelMouseMove);
                document.addEventListener('mouseup', handlePanelMouseUp);
            };

            header.addEventListener('mousedown', handlePanelMouseDown);
        }

        bindPanelResizeEvents() {
            const resizeHandle = this.expandedElement.querySelector('.ai-resize-handle');
            if (!resizeHandle) return;

            const handleResizeMouseDown = (e) => {
                if (e.button !== 0) return;
                e.preventDefault();
                e.stopPropagation();

                this.isResizing = true;
                this.resizeStartPos = { x: e.clientX, y: e.clientY };

                const rect = this.expandedElement.getBoundingClientRect();
                this.resizeStartSize = {
                    width: rect.width,
                    height: rect.height
                };

                this.expandedElement.classList.add('resizing');

                const handleResizeMouseMove = (moveEvent) => {
                    if (!this.isResizing) return;

                    const dx = moveEvent.clientX - this.resizeStartPos.x;
                    const dy = moveEvent.clientY - this.resizeStartPos.y;

                    let newWidth = this.resizeStartSize.width + dx;
                    let newHeight = this.resizeStartSize.height + dy;

                    newWidth = Math.max(this.config.minLogPanelSize.width, newWidth);
                    newHeight = Math.max(this.config.minLogPanelSize.height, newHeight);

                    newWidth = Math.min(newWidth, window.innerWidth - 50);
                    newHeight = Math.min(newHeight, window.innerHeight - 50);

                    this.expandedElement.style.width = newWidth + 'px';
                    this.expandedElement.style.height = newHeight + 'px';
                };

                const handleResizeMouseUp = () => {
                    document.removeEventListener('mousemove', handleResizeMouseMove);
                    document.removeEventListener('mouseup', handleResizeMouseUp);

                    this.expandedElement.classList.remove('resizing');

                    if (this.isResizing) {
                        this.saveLogPanelSize();
                        this.saveLogPanelPosition();
                    }

                    this.isResizing = false;
                };

                document.addEventListener('mousemove', handleResizeMouseMove);
                document.addEventListener('mouseup', handleResizeMouseUp);
            };

            resizeHandle.addEventListener('mousedown', handleResizeMouseDown);
        }

        startDelayedTipTimer(zoneName) {
            if (this.delayedTipTimers[zoneName]) {
                clearTimeout(this.delayedTipTimers[zoneName]);
            }

            this.delayedTipTimers[zoneName] = setTimeout(() => {
                console.log('[UI] 显示延迟提示:', zoneName);
                this.showDelayedTip(zoneName);
            }, this.config.tipDelay);
        }

        cancelDelayedTipTimer(zoneName) {
            if (this.delayedTipTimers[zoneName]) {
                clearTimeout(this.delayedTipTimers[zoneName]);
                this.delayedTipTimers[zoneName] = null;
            }
        }

        showDelayedTip(zoneName) {
            const zone = this.zones[zoneName];
            if (!zone) {
                console.warn('[UI] 未找到zone:', zoneName);
                return;
            }

            let tipEl = this.delayedTipElements[zoneName];
            if (!tipEl) {
                tipEl = document.createElement('div');
                tipEl.className = 'ai-delayed-tip';
                const tipInfo = this.zoneTips[zoneName] || { title: '', desc: '' };
                tipEl.innerHTML = `
                    <div class="ai-delayed-tip-title">${tipInfo.title}</div>
                    <div class="ai-delayed-tip-desc">${tipInfo.desc}</div>
                `;
                zone.appendChild(tipEl);
                this.delayedTipElements[zoneName] = tipEl;
                console.log('[UI] 创建延迟提示元素:', zoneName, tipInfo);
            }

            // 设置位置（第1行：normal/mcgg 提示显示在上方；第2/3行：task/expand/clear 提示显示在下方）
            const isTop = zoneName === 'normal' || zoneName === 'mcgg' || zoneName === 'mail';
            if (isTop) {
                tipEl.style.top = '-50px';
                tipEl.style.bottom = 'auto';
            } else {
                tipEl.style.bottom = '-50px';
                tipEl.style.top = 'auto';
            }
            tipEl.style.left = '50%';

            // 触发重排后添加visible类
            requestAnimationFrame(() => {
                tipEl.classList.add('visible');
                console.log('[UI] 延迟提示已显示:', zoneName);
            });
        }

        hideDelayedTip(zoneName) {
            const tipEl = this.delayedTipElements[zoneName];
            if (tipEl) {
                tipEl.classList.remove('visible');
            }
        }

        hideAllDelayedTips() {
            Object.keys(this.delayedTipElements).forEach(zoneName => {
                this.hideDelayedTip(zoneName);
            });
        }

        handleZoneClick(zone, element) {
            if (zone === 'expand') {
                if (this.isExpanded) {
                    this.collapse();
                } else {
                    this.expand();
                }
            } else if (this.actionCallbacks[zone]) {
                this.actionCallbacks[zone](element);
            }
        }
        /**
         * 注册区域点击回调
         * @param {string} zone - 区域名称 (normal/mcgg/task)
         * @param {Function} callback - 点击回调函数
         */
        registerZoneCallback(zone, callback) {
            this.actionCallbacks[zone] = callback;
        }

        expand() {
            this.isExpanded = true;

            const savedPosition = this.loadLogPanelPosition();
            const savedSize = this.loadLogPanelSize();

            if (savedPosition) {
                let left = savedPosition.left;
                let top = savedPosition.top;

                if (left + savedSize.width > window.innerWidth) {
                    left = window.innerWidth - savedSize.width - 10;
                }
                if (top + savedSize.height > window.innerHeight) {
                    top = window.innerHeight - savedSize.height - 10;
                }
                left = Math.max(10, left);
                top = Math.max(10, top);

                this.expandedElement.style.left = left + 'px';
                this.expandedElement.style.top = top + 'px';
            } else {
                const rect = this.container.getBoundingClientRect();
                let left = rect.left + 50;
                let top = rect.top + 50;

                if (left + savedSize.width > window.innerWidth) {
                    left = window.innerWidth - savedSize.width - 10;
                }
                if (top + savedSize.height > window.innerHeight) {
                    top = window.innerHeight - savedSize.height - 10;
                }
                left = Math.max(10, left);
                top = Math.max(10, top);

                this.expandedElement.style.left = left + 'px';
                this.expandedElement.style.top = top + 'px';
            }

            this.expandedElement.style.width = savedSize.width + 'px';
            this.expandedElement.style.height = savedSize.height + 'px';

            this.iconElement.style.display = 'none';
            this.expandedElement.style.display = 'flex';
            this.expandedElement.offsetHeight;
            this.expandedElement.style.transform = 'scale(1)';
            this.expandedElement.style.opacity = '1';
        }

        collapse() {
            this.isExpanded = false;
            this.expandedElement.style.transform = 'scale(0.8)';
            this.expandedElement.style.opacity = '0';
            setTimeout(() => {
                if (!this.isExpanded) {
                    this.expandedElement.style.display = 'none';
                    this.iconElement.style.display = 'grid';
                    Object.values(this.zones).forEach(zone => {
                        zone.style.transform = '';
                    });
                }
            }, 300);
        }

        addButton(text, className, onClick) {
            const btn = document.createElement('button');
            btn.textContent = text;
            btn.className = className;
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                onClick(btn);
            });
            this.actionContainer.appendChild(btn);
            return btn;
        }

        addLog(msg, type = 'info', moduleTag = '') {
            if (!this.logContainer) return;
            const logItem = document.createElement('div');
            logItem.className = `ai-log-item ai-log-${type}`;

            const time = new Date().toLocaleTimeString([], { hour12: false });

            if (typeof msg === 'string') {
                if (moduleTag) {
                    const tagClass = `ai-log-module-${moduleTag}`;
                    logItem.innerHTML = `<span class="${tagClass}">[${moduleTag}]</span> [${time}] ${msg}`;
                } else {
                    logItem.textContent = `[${time}] ${msg}`;
                }
            } else if (msg instanceof HTMLElement) {
                if (moduleTag) {
                    const tagClass = `ai-log-module-${moduleTag}`;
                    const prefix = document.createElement('span');
                    prefix.innerHTML = `<span class="${tagClass}">[${moduleTag}]</span> [${time}] `;
                    logItem.appendChild(prefix);
                } else {
                    const prefix = document.createElement('span');
                    prefix.textContent = `[${time}] `;
                    logItem.appendChild(prefix);
                }
                logItem.appendChild(msg);
            }

            this.logContainer.appendChild(logItem);

            this.logData.push({ time, msg: (typeof msg === 'string' ? msg : 'DOM Element'), type, moduleTag });
            if (this.logData.length > this.config.maxLogLines * 1.5) {
                this.logData = this.logData.slice(-this.config.maxLogLines);
            }

            while (this.logContainer.children.length > this.config.maxLogLines) {
                this.logContainer.removeChild(this.logContainer.firstChild);
            }

            this.logContainer.scrollTop = this.logContainer.scrollHeight;
        }

        startLogCleanupTimer() {
            if (this.logCleanupTimer) {
                clearInterval(this.logCleanupTimer);
            }

            this.logCleanupTimer = setInterval(() => {
                this.cleanupOldLogs();
            }, this.config.logCleanupInterval);
        }

        cleanupOldLogs() {
            if (!this.logContainer) return;

            const currentCount = this.logContainer.children.length;
            if (currentCount > this.config.maxLogLines * 0.8) {
                const removeCount = Math.floor(currentCount * 0.3);
                for (let i = 0; i < removeCount; i++) {
                    if (this.logContainer.firstChild) {
                        this.logContainer.removeChild(this.logContainer.firstChild);
                    }
                }
                console.log('[UI] 日志清理：移除了', removeCount, '条旧日志');
            }

            if (this.logData.length > this.config.maxLogLines) {
                this.logData = this.logData.slice(-this.config.maxLogLines);
            }
        }

        clearAllLogs() {
            if (this.logContainer) {
                this.logContainer.innerHTML = '';
            }
            this.logData = [];
        }

        createLogChannel(moduleName) {
            const self = this;
            return {
                log: (msg) => self.addLog(msg, 'info', moduleName),
                error: (msg) => self.addLog(msg, 'error', moduleName),
                warn: (msg) => self.addLog(msg, 'warn', moduleName),
                success: (msg) => self.addLog(msg, 'success', moduleName),
                custom: (el) => self.addLog(el, 'info', moduleName)
            };
        }

        showZoneSuccess(zone) {
            if (this.zones[zone]) {
                this.zones[zone].classList.add('success');
                setTimeout(() => {
                    this.zones[zone].classList.remove('success');
                }, 1500);
            }
        }

        showZoneProcessing(zone, isProcessing) {
            if (this.zones[zone]) {
                if (isProcessing) {
                    this.zones[zone].classList.add('processing');
                } else {
                    this.zones[zone].classList.remove('processing');
                }
            }
        }

        setZoneText(zone, text) {
            if (this.zones[zone]) {
                const textEl = this.zones[zone].querySelector('.ai-zone-text');
                if (textEl) {
                    textEl.textContent = text;
                }
            }
        }

        resetZoneText(zone) {
            const defaultTexts = {
                normal: 'N',
                mcgg: 'M',
                task: 'T',
                expand: '⚡',
                clear: '清',   // [模块F]
                reply: '内',   // [模块G]
                mail: '邮'     // [模块H]
            };
            if (this.zones[zone]) {
                const textEl = this.zones[zone].querySelector('.ai-zone-text');
                if (textEl) {
                    textEl.textContent = defaultTexts[zone] || '';
                }
            }
        }

        // ==================== [模块F] 跨域日志轮询方法 ====================

        /**
         * 启动清除头像跨域日志轮询
         * 从 GM 存储读取 GM 工具页面写入的日志，并显示在主面板
         * @param {string} storageKey - GM存储键名
         */
        startClearAvatarLogPolling(storageKey) {
            if (this.clearAvatarLogPollingTimer) return;
            console.log('[模块F] 启动清除头像跨域日志轮询...');
            this.clearAvatarLogPollingTimer = setInterval(() => {
                this._pollClearAvatarLogs(storageKey);
            }, this.clearAvatarLogPollingInterval);
        }

        /**
         * 停止清除头像跨域日志轮询
         */
        stopClearAvatarLogPolling() {
            if (this.clearAvatarLogPollingTimer) {
                clearInterval(this.clearAvatarLogPollingTimer);
                this.clearAvatarLogPollingTimer = null;
                console.log('[模块F] 清除头像跨域日志轮询已停止');
            }
        }

        /**
         * 内部：轮询读取跨域日志
         * @param {string} storageKey - GM存储键名
         */
        _pollClearAvatarLogs(storageKey) {
            try {
                const rawData = GM_getValue(storageKey, null);
                if (!rawData) return;
                let logData;
                try { logData = typeof rawData === 'string' ? JSON.parse(rawData) : rawData; } catch (e) { return; }
                if (!Array.isArray(logData) || logData.length === 0) return;

                const newLogs = logData.filter(entry => entry.timestamp && entry.timestamp > this.clearAvatarLastLogTimestamp);
                if (newLogs.length === 0) return;

                newLogs.sort((a, b) => a.timestamp - b.timestamp);
                for (const entry of newLogs) {
                    this.addLog('[GM] ' + entry.msg, entry.type || 'info', 'clear');
                }
                this.clearAvatarLastLogTimestamp = newLogs[newLogs.length - 1].timestamp;
            } catch (e) {
                console.error('[模块F] 轮询跨域日志失败:', e);
            }
        }

        /**
         * 重置清除头像跨域日志时间戳（开始新任务时清除旧日志记录）
         */
        resetClearAvatarLogTimestamp() {
            this.clearAvatarLastLogTimestamp = 0;
        }
    }

    // ===================== 创建 UI =====================
    // @run-at document-end 意味着 DOM 已准备好，直接同步创建
    let UI = null;
    try {
        UI = new StatusbarUI();
        console.log('[工单助手] UI 创建成功');
    } catch (e) {
        console.error('[工单助手] UI 创建失败:', e);
    }

    // ===================== 公共工具函数 =====================

    /**
     * MCGG工单判断配置
     * 集中管理MCGG工单的判断规则，便于后期修改
     */
    const MCGG_CONFIG = {
        patterns: ['【MCGG】'],
        caseSensitive: false
    };

    const SharedUtils = {
        activePickerDropdown: null,

        isInputAvailable(el) {
            if (!el) return false;
            try {
                const style = window.getComputedStyle(el);
                return style.display !== 'none' &&
                    style.visibility !== 'hidden' &&
                    style.opacity !== '0' &&
                    el.offsetParent !== null &&
                    !el.disabled;
            } catch (e) {
                return false;
            }
        },

        extractVersion(text) {
            const match = text.match(/(\d+(?:\.\d+)+)/);
            return match ? match[1] : '';
        },

        hasChinese(text) {
            return /[\u4e00-\u9fa5]/.test(text);
        },

        hasTraditionalChinese(text) {
            return /[\u7E41\u9AD4\u81FA\u7063\u8207\u70BA\u9019\u500B\u4F86\u5F8C\u6703\u9EDE\u8AAA\u767C\u8B93\u9E97\u89F8\u89C0\u8A2D\u8A08\u8A73\u8AA4\u9084\u908A\u9078\u9054\u958B\u95DC\u96E3]/.test(text);
        },

        /**
         * 判断标题是否为MCGG工单
         * @param {string} titleValue - 标题文本
         * @param {object} options - 选项 { silent: true/false }
         * @returns {boolean} - 是否为MCGG工单
         *
         * 判断规则（可在MCGG_CONFIG中修改）：
         * - 标题必须包含"【MCGG】"（精确匹配，包含中文方括号）
         * - 仅包含"MCGG"而没有"【MCGG】"不算MCGG工单
         */
        isMCGGTitle(titleValue, options = {}) {
            if (!titleValue) return false;
            const text = MCGG_CONFIG.caseSensitive ? titleValue : titleValue.toLowerCase();
            for (const pattern of MCGG_CONFIG.patterns) {
                const searchPattern = MCGG_CONFIG.caseSensitive ? pattern : pattern.toLowerCase();
                if (text.includes(searchPattern)) {
                    if (!options.silent) {
                        console.log('[MCGG判断] 检测到MCGG标识:', pattern);
                    }
                    return true;
                }
            }
            return false;
        },

        getVisibleText(el) {
            if (!el) return '';
            const text = typeof el.innerText === 'string' ? el.innerText : el.textContent;
            return (text || '').trim();
        },

        findTicketIdInRoot(root) {
            if (!root || !root.querySelectorAll) return null;

            const elements = root.querySelectorAll('p, span, div');
            for (const el of elements) {
                if (el.children.length > 0) continue;
                const text = this.getVisibleText(el);
                if (/^\d{14}$/.test(text)) {
                    return text;
                }
            }

            return null;
        },

        getCurrentTicketID() {
            const urlMatch = currentUrl.match(/[?&]orderId=(\d{14})(?:&|$)/);
            if (urlMatch && urlMatch[1]) {
                return urlMatch[1];
            }

            const roots = [];
            const seen = new Set();
            const pushRoot = (root) => {
                if (!root || seen.has(root)) return;
                seen.add(root);
                roots.push(root);
            };

            const titleInput = document.querySelector('input[placeholder="请输入任务标题"]');
            pushRoot(titleInput ? titleInput.closest('.el-form-item') : null);
            pushRoot(titleInput ? titleInput.closest('.el-form') : null);
            pushRoot(document.querySelector('.title-of-work-order'));
            pushRoot(document.querySelector('.title-of-work-order')?.closest('.el-form-item, .el-form, .el-card, .el-main, .el-row'));
            pushRoot(document.querySelector('.el-page-header'));
            pushRoot(document.querySelector('.el-card'));
            pushRoot(document.querySelector('.el-main'));

            for (const root of roots) {
                const ticketId = this.findTicketIdInRoot(root);
                if (ticketId) {
                    return ticketId;
                }
            }

            return this.findTicketIdInRoot(document.body);
        },

        findTitleInputRobust() {
            const byPlaceholder = document.querySelector('input[placeholder="请输入任务标题"]');
            if (byPlaceholder && this.isInputAvailable(byPlaceholder)) {
                return byPlaceholder;
            }

            const walker = document.createTreeWalker(
                document.body,
                NodeFilter.SHOW_TEXT,
                null,
                false
            );

            let node;
            while (node = walker.nextNode()) {
                const text = node.textContent.trim();
                if (text === '任务标题') {
                    const parent = node.parentElement;
                    if (parent) {
                        let container = parent.parentElement;
                        if (container) {
                            let sibling = container.nextElementSibling;
                            while (sibling) {
                                if (sibling.classList && sibling.classList.contains('detail')) {
                                    const input = sibling.querySelector('input');
                                    if (input && this.isInputAvailable(input)) {
                                        return input;
                                    }
                                }
                                sibling = sibling.nextElementSibling;
                            }
                            const fallback = container.querySelector('input');
                            if (fallback && this.isInputAvailable(fallback)) {
                                return fallback;
                            }
                        }
                    }
                }
            }
            return null;
        },

        simulateInputValue(element, text) {
            if (!element) return false;
            try {
                element.focus();
                const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
                nativeSetter.call(element, text);

                const events = ['input', 'change', 'keydown', 'keyup'];
                events.forEach(eventType => {
                    element.dispatchEvent(new Event(eventType, { bubbles: true }));
                });

                element.dispatchEvent(new Event('compositionstart', { bubbles: true }));
                element.dispatchEvent(new Event('compositionend', { bubbles: true }));
                return true;
            } catch (e) {
                console.error('模拟输入失败:', e);
                return false;
            }
        },

        findVisibleDropdown() {
            const dropdowns = document.querySelectorAll('.el-select-dropdown');
            const visible = [];
            for (const dropdown of dropdowns) {
                try {
                    const style = window.getComputedStyle(dropdown);
                    if (style.display !== 'none' && style.visibility !== 'hidden') {
                        visible.push(dropdown);
                    }
                } catch (e) {
                    continue;
                }
            }
            if (visible.length === 0) return null;
            if (visible.length === 1) return visible[0];
            const preferred = visible.find(d => d.classList.contains('custom-down-select-search'));
            return preferred || visible[visible.length - 1];
        },

        isDropdownVisible(dropdown) {
            if (!dropdown) return false;
            try {
                const style = window.getComputedStyle(dropdown);
                return style.display !== 'none' && style.visibility !== 'hidden';
            } catch (e) {
                return false;
            }
        },

        resetActivePickerDropdown() {
            if (!this.isDropdownVisible(this.activePickerDropdown)) {
                this.activePickerDropdown = null;
            }
        },

        getVisibleDropdowns(options = {}) {
            const { preferThirdLink = false } = options;
            const selector = preferThirdLink
                ? '.el-select-dropdown.custom-down-select-search'
                : '.el-select-dropdown';
            return Array.from(document.querySelectorAll(selector)).filter(dropdown => this.isDropdownVisible(dropdown));
        },

        async closeVisibleDropdowns(options = {}) {
            const visibleDropdowns = this.getVisibleDropdowns(options);
            if (visibleDropdowns.length === 0) {
                this.activePickerDropdown = null;
                return;
            }

            visibleDropdowns.forEach(dropdown => {
                const input = dropdown.querySelector('input[type="text"]');
                if (input) {
                    try {
                        const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
                        nativeSetter.call(input, '');
                        input.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
                        input.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
                        input.blur();
                    } catch (e) {
                        // ignore cleanup failures and continue with close attempts
                    }
                }
            });

            const escapeTarget = document.activeElement && document.activeElement !== document.body
                ? document.activeElement
                : document.body;
            ['keydown', 'keyup'].forEach(eventType => {
                escapeTarget.dispatchEvent(new KeyboardEvent(eventType, {
                    bubbles: true,
                    cancelable: true,
                    key: 'Escape'
                }));
            });

            document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
            document.body.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
            document.body.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

            await new Promise(resolve => setTimeout(resolve, 80));
            this.activePickerDropdown = null;
        },

        findVisibleThirdLinkDropdown() {
            this.resetActivePickerDropdown();
            if (this.isDropdownVisible(this.activePickerDropdown) &&
                this.activePickerDropdown.classList.contains('custom-down-select-search')) {
                return this.activePickerDropdown;
            }

            const visible = this.getVisibleDropdowns({ preferThirdLink: true });
            return visible[0] || null;
        },

        findDropdownForPicker(options = {}) {
            this.resetActivePickerDropdown();
            if (this.isDropdownVisible(options.lockedDropdown)) {
                return options.lockedDropdown;
            }
            if (options.preferThirdLink) {
                const d = this.findVisibleThirdLinkDropdown();
                if (d) return d;
            }
            return this.findVisibleDropdown();
        },

        waitForDropdownSearchInput(timeout = 1200, options = {}) {
            return new Promise(resolve => {
                const startTime = Date.now();
                const check = () => {
                    const dropdown = this.findDropdownForPicker(options);
                    if (dropdown) {
                        const input = dropdown.querySelector('input[type="text"]');
                        if (input) {
                            this.activePickerDropdown = dropdown;
                            resolve(input);
                            return;
                        }
                    }

                    if (Date.now() - startTime < timeout) {
                        setTimeout(check, 50);
                    } else {
                        resolve(null);
                    }
                };
                check();
            });
        },

        getSelectableDropdownItems(dropdown) {
            if (!dropdown) return [];
            return Array.from(dropdown.querySelectorAll('.el-select-dropdown__item')).filter(item => {
                try {
                    const style = window.getComputedStyle(item);
                    return !item.classList.contains('disabled') &&
                        !item.classList.contains('is-disabled') &&
                        style.display !== 'none' &&
                        style.visibility !== 'hidden';
                } catch (e) {
                    return false;
                }
            });
        },

        findDropdownCandidate(items = [], text = '', options = {}) {
            const normalizedTarget = this.normalizeFieldLabel(text).toLowerCase();
            if (!normalizedTarget || items.length === 0) return null;

            const exactMatch = items.find(item => this.normalizeFieldLabel(item.textContent).toLowerCase() === normalizedTarget);
            if (exactMatch) {
                return { item: exactMatch, reason: 'exact' };
            }

            const partialMatch = items.find(item => {
                const normalizedText = this.normalizeFieldLabel(item.textContent).toLowerCase();
                return normalizedText.includes(normalizedTarget) || normalizedTarget.includes(normalizedText);
            });
            if (partialMatch) {
                return { item: partialMatch, reason: 'partial' };
            }

            if (options.allowSingleCandidateFallback !== false && items.length === 1) {
                return { item: items[0], reason: 'single' };
            }

            return null;
        },

        clickDropdownCandidate(candidate, logger) {
            if (!candidate || !candidate.item) return false;
            candidate.item.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            candidate.item.click();
            if (logger) {
                const suffix = candidate.reason === 'single' ? '（唯一候选）' : '';
                logger.success('选择下拉选项' + suffix + ': ' + candidate.item.textContent.trim());
            }
            return true;
        },

        async selectDropdownOption(text, logger, timeout = 2200, options = {}) {
            const startTime = Date.now();

            while (Date.now() - startTime < timeout) {
                const dropdown = this.findDropdownForPicker(options);
                if (dropdown) {
                    const items = this.getSelectableDropdownItems(dropdown);
                    const candidate = this.findDropdownCandidate(items, text, options);
                    if (candidate) {
                        return this.clickDropdownCandidate(candidate, logger);
                    }
                }

                await new Promise(resolve => setTimeout(resolve, 80));
            }

            if (logger) logger.warn('候选尚未刷新，准备二次等待: ' + text);
            await new Promise(resolve => setTimeout(resolve, 350));

            const retryDeadline = Date.now() + 900;
            while (Date.now() < retryDeadline) {
                const dropdown = this.findDropdownForPicker(options);
                if (dropdown) {
                    const items = this.getSelectableDropdownItems(dropdown);
                    const candidate = this.findDropdownCandidate(items, text, options);
                    if (candidate) {
                        return this.clickDropdownCandidate(candidate, logger);
                    }
                }
                await new Promise(resolve => setTimeout(resolve, 80));
            }

            if (logger) logger.warn('二次等待后仍无候选: ' + text);
            return false;
        },

        async selectDropdownOptionLegacy(text, logger, timeout = 1200, options = {}) {
            const startTime = Date.now();

            while (Date.now() - startTime < timeout) {
                const dropdown = this.findDropdownForPicker(options);
                if (dropdown) {
                    const items = this.getSelectableDropdownItems(dropdown);
                    if (items.length > 0) {
                        const normalizedTarget = this.normalizeFieldLabel(text).toLowerCase();
                        const exactMatch = items.find(item => this.normalizeFieldLabel(item.textContent).toLowerCase() === normalizedTarget);
                        const partialMatch = items.find(item => {
                            const normalizedText = this.normalizeFieldLabel(item.textContent).toLowerCase();
                            return normalizedText.includes(normalizedTarget) || normalizedTarget.includes(normalizedText);
                        });
                        const candidate = exactMatch || partialMatch;
                        if (candidate) {
                            candidate.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                            candidate.click();
                            if (logger) logger.success('选择下拉选项: ' + candidate.textContent.trim());
                            return true;
                        }
                    }
                }

                await new Promise(resolve => setTimeout(resolve, 80));
            }

            if (logger) logger.warn('未找到可点击的下拉选项: ' + text);
            return false;
        },

        async fillDropdownSearch(text, logger, delay = 100, options = {}) {
            const searchInput = await this.waitForDropdownSearchInput(1800, options);
            if (!searchInput) {
                if (logger) logger.warn('未找到下拉搜索框');
                return false;
            }

            try {
                searchInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
                searchInput.focus();
                await new Promise(resolve => setTimeout(resolve, delay));

                const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
                nativeSetter.call(searchInput, text);

                searchInput.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
                searchInput.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));

                searchInput.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: text[0] || 'a' }));
                searchInput.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: text[text.length - 1] || 'a' }));

                await new Promise(resolve => setTimeout(resolve, delay));
                const selected = await this.selectDropdownOption(text, logger, 2200, options);
                if (selected && logger) logger.success('填充下拉框: ' + text);
                return selected;
            } catch (e) {
                if (logger) logger.error('下拉框填充失败: ' + e.message);
                return false;
            }
        },

        async fillDropdownSearchLegacy(text, logger, delay = 100, options = {}) {
            const searchInput = await this.waitForDropdownSearchInput(1200, options);
            if (!searchInput) {
                if (logger) logger.warn('未找到下拉搜索框');
                return false;
            }

            try {
                searchInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
                searchInput.focus();
                await new Promise(resolve => setTimeout(resolve, delay));

                const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
                nativeSetter.call(searchInput, text);

                searchInput.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
                searchInput.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));

                searchInput.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: text[0] || 'a' }));
                searchInput.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: text[text.length - 1] || 'a' }));

                await new Promise(resolve => setTimeout(resolve, delay));
                const selected = await this.selectDropdownOptionLegacy(text, logger, 1200, options);
                if (selected && logger) logger.success('填充下拉框: ' + text);
                return selected;
            } catch (e) {
                if (logger) logger.error('下拉框填充失败: ' + e.message);
                return false;
            }
        },

        findLabelText(targetInput) {
            let formItem = targetInput.closest('.el-form-item');
            if (formItem) {
                const labelSpan = formItem.querySelector('.el-form-item__label__content');
                if (labelSpan) {
                    return labelSpan.textContent.trim();
                }
            }

            let parent = targetInput;
            let maxDepth = 6;
            while (parent && parent !== document.body && maxDepth > 0) {
                if (parent.classList && parent.classList.contains('detail')) {
                    let sibling = parent.previousElementSibling;
                    while (sibling) {
                        if (sibling.classList && sibling.classList.contains('title-of-work-order')) {
                            return sibling.textContent.trim();
                        }
                        sibling = sibling.previousElementSibling;
                    }
                    break;
                }
                parent = parent.parentElement;
                maxDepth--;
            }
            return '';
        },

        extractContentWithImages(element, options = {}) {
            const {
                stripLabelPattern = /^(内部描述[\*\s]*[：:]?\s*)/i
            } = options;

            const clone = element.cloneNode(true);
            const lineBreakTags = clone.querySelectorAll('br');
            lineBreakTags.forEach(br => {
                br.parentNode.replaceChild(document.createTextNode('\n'), br);
            });

            const images = clone.querySelectorAll('img');
            images.forEach(img => {
                const src = img.src || img.getAttribute('data-src');
                if (src) {
                    const linkText = document.createTextNode('  ' + src + ' ');
                    img.parentNode.replaceChild(linkText, img);
                } else {
                    img.remove();
                }
            });

            const walker = document.createTreeWalker(
                clone,
                NodeFilter.SHOW_TEXT,
                null,
                false
            );

            const textParts = [];
            let node;
            while (node = walker.nextNode()) {
                const text = node.textContent.trim();
                if (text) {
                    textParts.push(text);
                }
            }

            let text = textParts.join('\n');
            if (stripLabelPattern) {
                text = text.replace(stripLabelPattern, '');
            }
            return text.trim();
        },

        normalizeFieldLabel(text) {
            return (text || '').replace(/\s+/g, '').trim();
        },

        findThirdLinkFieldRow(labelTexts = []) {
            const normalizedTargets = labelTexts.map(label => this.normalizeFieldLabel(label));
            const thirdLinkSection = document.querySelector('.tabDetail-item.thirdLink');
            if (!thirdLinkSection) return null;

            const rows = thirdLinkSection.querySelectorAll('.tabDetail-item-in');
            for (const row of rows) {
                const titleNode = row.querySelector('.title-of-work-order');
                const titleText = this.normalizeFieldLabel(titleNode ? titleNode.textContent : '');
                if (!titleText) continue;
                const hit = normalizedTargets.some(t => titleText === t || titleText.startsWith(t.replace(/\*+$/, '')));
                if (hit) {
                    return row;
                }
            }
            return null;
        },

        findThirdLinkFieldInput(labelTexts = []) {
            const row = this.findThirdLinkFieldRow(labelTexts);
            if (!row) return null;
            return row.querySelector('.detail input.el-input__inner, .detail input[type="text"], .detail input');
        },

        getThirdLinkFieldDisplayValue(labelTexts = []) {
            const input = this.findThirdLinkFieldInput(labelTexts);
            if (!input) return '';
            const v = (input.value || '').trim();
            if (v) return v;
            const ph = (input.getAttribute('placeholder') || '').trim();
            if (ph && ph !== '请选择') return ph;
            return '';
        },

        channelDisplayMatchesDesired(displayValue, desiredChannel) {
            const d = this.normalizeFieldLabel(desiredChannel || '');
            const c = this.normalizeFieldLabel(displayValue || '');
            if (!d) return true;
            if (!c || c === '请选择') return false;
            const wantFull = d.includes('全服');
            const wantTest = d.includes('测服');
            const curFull = c.includes('全服');
            const curTest = c.includes('测服');
            if (wantFull || wantTest) {
                if (wantFull && curFull) return true;
                if (wantTest && curTest) return true;
                return false;
            }
            return c === d;
        },

        isThirdLinkFieldValueApplied(labelTexts = [], expectedValue = '', options = {}) {
            const currentValue = this.getThirdLinkFieldDisplayValue(labelTexts);
            if (options.channelMatch) {
                return this.channelDisplayMatchesDesired(currentValue, expectedValue);
            }

            const expected = this.normalizeFieldLabel(expectedValue || '').toLowerCase();
            const current = this.normalizeFieldLabel(currentValue || '').toLowerCase();
            if (!expected || !current || current === '请选择' || current === '???') {
                return false;
            }

            if (options.allowPartial === false) {
                return current === expected;
            }

            return current.includes(expected) || expected.includes(current);
        },

        waitForThirdLinkFieldValue(labelTexts = [], expectedValue = '', timeout = 1500, options = {}) {
            return new Promise(resolve => {
                const startTime = Date.now();
                const check = () => {
                    if (this.isThirdLinkFieldValueApplied(labelTexts, expectedValue, options)) {
                        resolve(true);
                        return;
                    }

                    if (Date.now() - startTime < timeout) {
                        setTimeout(check, 80);
                    } else {
                        resolve(false);
                    }
                };
                check();
            });
        },

        async confirmThirdLinkFieldApplied(labelTexts = [], expectedValue = '', timeout = 1500, options = {}) {
            const applied = await this.waitForThirdLinkFieldValue(labelTexts, expectedValue, timeout, options);
            if (applied) return true;

            const currentValue = this.getThirdLinkFieldDisplayValue(labelTexts);
            const normalizedCurrent = this.normalizeFieldLabel(currentValue || '').toLowerCase();
            const normalizedExpected = this.normalizeFieldLabel(expectedValue || '').toLowerCase();
            if (!normalizedExpected || !normalizedCurrent || normalizedCurrent === '请选择' || normalizedCurrent === '???') {
                return false;
            }

            return normalizedCurrent.includes(normalizedExpected) || normalizedExpected.includes(normalizedCurrent);
        },

        async openThirdLinkElSelectDropdown(labelTexts, fieldName, logFn) {
            const maxAttempts = 4;
            const log = typeof logFn === 'function' ? logFn : () => {};
            const pickerOpts = { preferThirdLink: true };

            for (let attempt = 1; attempt <= maxAttempts; attempt++) {
                const input = this.findThirdLinkFieldInput(labelTexts);
                if (!input) {
                    await new Promise(resolve => setTimeout(resolve, 300));
                    continue;
                }

                await this.closeVisibleDropdowns({ preferThirdLink: true });
                const selectEl = input.closest('.el-select');
                const scrollTarget = selectEl || input;
                scrollTarget.scrollIntoView({ behavior: 'smooth', block: 'center' });
                await new Promise(resolve => setTimeout(resolve, 100));

                const waitOpen = () => this.waitForDropdownSearchInput(1500, pickerOpts);

                input.click();
                let opened = await waitOpen();
                if (!opened && selectEl) {
                    const caret = selectEl.querySelector('.el-select__caret');
                    if (caret) {
                        caret.click();
                        opened = await waitOpen();
                    }
                }
                if (!opened) {
                    const clickable = selectEl || input.closest('.el-input') || input;
                    ['mousedown', 'mouseup', 'click'].forEach(eventType => {
                        clickable.dispatchEvent(new MouseEvent(eventType, { bubbles: true, cancelable: true }));
                    });
                    input.focus();
                    opened = await waitOpen();
                }

                if (opened) {
                    log(fieldName + ' 下拉框已展开');
                    return true;
                }

                log(fieldName + ' 下拉框未展开，重试 ' + attempt + '/' + maxAttempts);
                await new Promise(resolve => setTimeout(resolve, 250));
            }

            return false;
        },

        findFormItemByLabels(labelTexts = []) {
            if (!Array.isArray(labelTexts) || labelTexts.length === 0) return null;
            const expected = labelTexts.map(label => this.normalizeFieldLabel(label));
            const formItems = document.querySelectorAll('.el-form-item');

            for (const formItem of formItems) {
                const labelNode = formItem.querySelector('.el-form-item__label, label');
                const labelText = this.normalizeFieldLabel(labelNode ? labelNode.textContent : '');
                if (labelText && expected.includes(labelText)) {
                    return formItem;
                }
            }

            return null;
        },

        extractTextFromOuterHTMLRoot(rootElement, options = {}) {
            if (!rootElement) return '';

            const {
                contentSelectors = [],
                stripLabelPattern = null,
                minLength = 3
            } = options;

            const html = rootElement.outerHTML || rootElement.innerHTML || '';
            if (!html) return '';

            try {
                const parser = new DOMParser();
                const doc = parser.parseFromString(html, 'text/html');
                const scope = doc.body;

                const candidateRoots = [];
                for (const selector of contentSelectors) {
                    const found = scope.querySelector(selector);
                    if (found) {
                        candidateRoots.push(found);
                    }
                }

                if (candidateRoots.length === 0 && scope.firstElementChild) {
                    candidateRoots.push(scope.firstElementChild);
                }

                for (const candidate of candidateRoots) {
                    const text = this.extractContentWithImages(candidate, { stripLabelPattern });
                    if (text && text.length >= minLength) {
                        return text;
                    }
                }
            } catch (e) {
                console.error('[SharedUtils] outerHTML 提取失败:', e);
            }

            return '';
        },

        extractTextByFormLabels(labelTexts = [], options = {}) {
            const formItem = this.findFormItemByLabels(labelTexts);
            if (!formItem) return '';

            const roots = [
                formItem.closest('.el-col'),
                formItem,
                formItem.querySelector('.el-form-item__content'),
                formItem.querySelector('.show-info'),
                formItem.querySelector('.text')
            ].filter(Boolean);

            for (const root of roots) {
                const extracted = this.extractTextFromOuterHTMLRoot(root, options);
                if (extracted) {
                    return extracted;
                }
            }

            return '';
        },

        async copyText(text) {
            if (!text) return false;

            try {
                await navigator.clipboard.writeText(text);
                return true;
            } catch (e) {
                console.warn('[SharedUtils] navigator.clipboard 复制失败，尝试 GM_setClipboard:', e.message);
            }

            try {
                GM_setClipboard(text);
                return true;
            } catch (e) {
                console.error('[SharedUtils] GM_setClipboard 复制失败:', e);
                return false;
            }
        }
    };

    const TranslationService = {
        translateViaGoogle(text, timeout = 6000) {
            return new Promise((resolve, reject) => {
                GM_xmlhttpRequest({
                    method: 'GET',
                    url: `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=zh-CN&dt=t&q=${encodeURIComponent(text)}`,
                    timeout,
                    onload: (response) => {
                        try {
                            const result = JSON.parse(response.responseText);
                            if (result && result[0] && result[0][0] && result[0][0][0]) {
                                resolve(result[0][0][0]);
                            } else {
                                reject(new Error('Google API format error'));
                            }
                        } catch (e) {
                            reject(e);
                        }
                    },
                    onerror: reject,
                    ontimeout: reject
                });
            });
        },

        translateViaMyMemory(text, timeout = 6000) {
            return new Promise((resolve, reject) => {
                GM_xmlhttpRequest({
                    method: 'GET',
                    url: 'https://api.mymemory.translated.net/get?q=' + encodeURIComponent(text) + '&langpair=en|zh',
                    timeout,
                    onload: (response) => {
                        try {
                            const result = JSON.parse(response.responseText);
                            resolve(result.responseData.translatedText);
                        } catch (e) {
                            reject(e);
                        }
                    },
                    onerror: reject,
                    ontimeout: reject
                });
            });
        },

        translateViaGLM4Flash(text, timeout = 6000) {
            return new Promise((resolve, reject) => {
                const apiKey = GM_getValue('glm_api_key_v1', '');
                const modelVersion = GM_getValue('glm_model_version_v1', 'glm-4-flash-250414');

                if (!apiKey) {
                    return reject(new Error('未配置智谱API Key (请在油猴菜单中设置)'));
                }

                GM_xmlhttpRequest({
                    method: 'POST',
                    url: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${apiKey}`
                    },
                    data: JSON.stringify({
                        model: modelVersion,
                        messages: [
                            { role: 'system', content: '你是一个专业翻译引擎。用户会给出原文和目标语言，你只输出译文，不要解释，不要添加额外内容。' },
                            { role: 'user', content: `请将下面文本翻译成中文：\n\n"${text}"` }
                        ],
                        temperature: 0.3,
                        max_tokens: 512
                    }),
                    timeout,
                    onload: (response) => {
                        try {
                            const result = JSON.parse(response.responseText);
                            if (result.error) {
                                reject(new Error(result.error.message || 'GLM API error'));
                            } else if (result.choices && result.choices[0] && result.choices[0].message) {
                                let content = result.choices[0].message.content.trim();
                                content = content.replace(/^["“'‘]+|["”'’]+$/g, '');
                                resolve(content);
                            } else {
                                reject(new Error('GLM API format error'));
                            }
                        } catch (e) {
                            reject(e);
                        }
                    },
                    onerror: reject,
                    ontimeout: reject
                });
            });
        },

        getTencentTranslateConfig() {
            return {
                secretId: (GM_getValue('tencent_translate_secret_id_v1', '') || '').trim(),
                secretKey: (GM_getValue('tencent_translate_secret_key_v1', '') || '').trim(),
                region: 'ap-beijing',
                projectId: '0'
            };
        },

        bufferToHex(buffer) {
            return Array.from(new Uint8Array(buffer)).map(b => b.toString(16).padStart(2, '0')).join('');
        },

        async sha256Hex(message) {
            const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(message));
            return this.bufferToHex(digest);
        },

        async hmacSha256Raw(key, message) {
            const rawKey = typeof key === 'string' ? new TextEncoder().encode(key) : key;
            const cryptoKey = await crypto.subtle.importKey('raw', rawKey, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
            const signature = await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(message));
            return new Uint8Array(signature);
        },

        async hmacSha256Hex(key, message) {
            return this.bufferToHex(await this.hmacSha256Raw(key, message));
        },

        async translateViaTencent(text, timeout = 6000) {
            const config = this.getTencentTranslateConfig();
            if (!config.secretId || !config.secretKey) {
                throw new Error('未配置腾讯翻译 SecretId / SecretKey（请在油猴菜单中设置）');
            }
            if (!crypto || !crypto.subtle) {
                throw new Error('当前环境缺少 Web Crypto，无法调用腾讯翻译');
            }

            const host = 'tmt.tencentcloudapi.com';
            const service = 'tmt';
            const action = 'TextTranslate';
            const version = '2018-03-21';
            const timestamp = Math.floor(Date.now() / 1000);
            const date = new Date(timestamp * 1000).toISOString().slice(0, 10);
            const payload = JSON.stringify({
                SourceText: text,
                Source: 'auto',
                Target: 'zh',
                ProjectId: Number.parseInt(config.projectId || '0', 10) || 0
            });

            const canonicalHeaders = 'content-type:application/json; charset=utf-8\n' +
                'host:' + host + '\n' +
                'x-tc-action:' + action.toLowerCase() + '\n';
            const signedHeaders = 'content-type;host;x-tc-action';
            const hashedPayload = await this.sha256Hex(payload);
            const canonicalRequest = [
                'POST',
                '/',
                '',
                canonicalHeaders,
                signedHeaders,
                hashedPayload
            ].join('\n');

            const credentialScope = date + '/' + service + '/tc3_request';
            const stringToSign = [
                'TC3-HMAC-SHA256',
                String(timestamp),
                credentialScope,
                await this.sha256Hex(canonicalRequest)
            ].join('\n');

            const secretDate = await this.hmacSha256Raw('TC3' + config.secretKey, date);
            const secretService = await this.hmacSha256Raw(secretDate, service);
            const secretSigning = await this.hmacSha256Raw(secretService, 'tc3_request');
            const signature = await this.hmacSha256Hex(secretSigning, stringToSign);
            const authorization = 'TC3-HMAC-SHA256 ' +
                'Credential=' + config.secretId + '/' + credentialScope + ', ' +
                'SignedHeaders=' + signedHeaders + ', ' +
                'Signature=' + signature;

            return new Promise((resolve, reject) => {
                GM_xmlhttpRequest({
                    method: 'POST',
                    url: 'https://' + host,
                    headers: {
                        'Authorization': authorization,
                        'Content-Type': 'application/json; charset=utf-8',
                        'Host': host,
                        'X-TC-Action': action,
                        'X-TC-Timestamp': String(timestamp),
                        'X-TC-Version': version,
                        'X-TC-Region': config.region
                    },
                    data: payload,
                    timeout,
                    onload: (response) => {
                        try {
                            const result = JSON.parse(response.responseText);
                            const body = result && result.Response ? result.Response : null;
                            if (!body) {
                                reject(new Error('Tencent API format error'));
                                return;
                            }
                            if (body.Error) {
                                reject(new Error(body.Error.Message || body.Error.Code || 'Tencent API error'));
                                return;
                            }
                            if (body.TargetText) {
                                resolve(String(body.TargetText).trim());
                                return;
                            }
                            reject(new Error('Tencent API missing TargetText'));
                        } catch (e) {
                            reject(e);
                        }
                    },
                    onerror: reject,
                    ontimeout: reject
                });
            });
        }
    };

    // =========================================================================
    // 模块 A：普通工单助手 - 自动翻译与内部描述复制（完全独立）
    // =========================================================================
    (function() {
        'use strict';

        if (!shouldRunNormalModule()) return;

        const CONFIG = {
            translateDailyLimit: 150,
            translateTimeoutGoogle: 6000, // 恢复谷歌翻译超时时间为 6 秒，国内网络环境下 2 秒确实太短容易误判
            translateTimeoutOther: 6000,
            checkInterval: 500,
            titleRetryDelay: 1000,
            titleMaxWaitTime: 100000,
            internalDescRetryDelay: 3000,
            internalDescMaxRetries: 5,
            removeTrailingPunctuation: true,
            debug: true,
            fullServerLists: ["【2.1.40全服】：", "【2.1.18全服】：", "【40.2全服】：", "【18.2全服】："],
            testServerLists: ["【40.2测服】：", "【2.1.52测服】：", "【1.9.88测服】：", "【2.1.50测服】："],
            fullServer: "【2.1.60全服】：",
            testServer: "【2.1.68测服】：",
            debounceDelay: 300,
            translationPanelDelayAfterChannelMs: 100,
            translationPanelForceDelayMs: 2000,
            thirdLinkStepGap: 120,
            thirdLinkConfirmTimeout: 1500,
            thirdLinkMaxFillAttempts: 2,
            /** 关联第三方「创建人*」自动选择的目标姓名 */
            thirdLinkCreatorName: '梁磊'
        };

        let state = {
            currentTicketID: null,
            ticketFlowToken: 0,
            copiedText: '',
            leftHeading: '',
            versionNumber: '',
            channelText: '',
            faxiandiedai: '',
            hasProcessedTitle: false,
            translateCount: 0,
            isProcessing: false,
            isTitleProcessing: false,
            channelFilled: false,
            creatorFilled: false,
            iterationFilled: false,
            focusListenersAttached: false,
            abnormalLoadRetries: 0,
            lastExtractedLength: 0,
            lastProcessTime: 0,
            processDebounceTimer: null,
            pendingTranslationPanel: null,
            translationPanelDelayTimer: null,
            translationPanelForceTimer: null,
            translationPanelView: null,
            channelDecisionStartedAt: 0,
            channelDecisionResolvedAt: 0
        };

        let focusinHandler = null;

        const logger = UI ? UI.createLogChannel('normal') : { log: console.log, error: console.error, warn: console.warn, success: console.log };

        function log(...args) {
            if (CONFIG.debug) {
                const msg = args.join(' ');
                console.log('[普通工单]', ...args);
                logger.log(msg);
            }
        }

        function logError(...args) {
            const msg = args.join(' ');
            console.error('[普通工单 错误]', ...args);
            logger.error(msg);
        }

        function getTicketContext() {
            return {
                ticketId: state.currentTicketID,
                token: state.ticketFlowToken
            };
        }

        function isTicketContextStale(ticketContext) {
            if (!ticketContext) return false;
            if (ticketContext.token !== state.ticketFlowToken) return true;
            if (!ticketContext.ticketId || !state.currentTicketID) return false;
            return ticketContext.ticketId !== state.currentTicketID;
        }

        function ensureTicketContextActive(ticketContext, stage = '') {
            if (!ticketContext || !isTicketContextStale(ticketContext)) {
                return true;
            }

            const prefix = stage ? (stage + '：') : '';
            log(prefix + '检测到工单已切换，终止旧自动处理链路');
            return false;
        }

        function extractFaxiandiedai(heading) {
            const match = heading.match(/【(.+?)全服】|【(.+?)测服】/);
            return match ? (match[1] || match[2] || '') : '';
        }

        function extractInternalDescription() {
            const outerHtmlExtracted = SharedUtils.extractTextByFormLabels(
                ['内部描述', '内部描述*'],
                {
                    contentSelectors: [
                        '.el-form-item__content .show-info .text',
                        '.el-form-item__content .show-info',
                        '.el-form-item__content .text',
                        '.el-form-item__content',
                        '.show-info .text',
                        '.show-info',
                        '.text',
                        'p'
                    ],
                    stripLabelPattern: /^(内部描述[\*\s]*[：:]?\s*)/i
                }
            );

            if (outerHtmlExtracted) {
                state.copiedText = outerHtmlExtracted;
                state.lastExtractedLength = outerHtmlExtracted.length;
                if (CONFIG.debug) {
                    console.log('[普通工单] 通过 outerHTML 提取内部描述成功，长度:', outerHtmlExtracted.length);
                }
                logger.success('通过 outerHTML 提取内部描述成功，长度: ' + outerHtmlExtracted.length);
                return outerHtmlExtracted;
            }

            const allElements = document.querySelectorAll('p, div, span, label');
            let internalDescEl = null;
            let descEl = null;

            for (const el of allElements) {
                const text = el.textContent.trim();
                if (text === '内部描述' || text === '内部描述*') {
                    internalDescEl = el;
                }
                if ((text === '描述' || text === '描述*') && !text.includes('内部')) {
                    descEl = el;
                }
            }

            if (!internalDescEl) {
                log('未找到"内部描述"标签');
                return '';
            }

            let contentEl = null;
            const parent = internalDescEl.parentElement;
            if (parent) {
                let sibling = parent.nextElementSibling;
                let tempContainer = document.createElement('div');

                while (sibling) {
                    if (descEl && sibling.contains(descEl)) break;
                    tempContainer.appendChild(sibling.cloneNode(true));
                    sibling = sibling.nextElementSibling;
                }

                if (tempContainer.childNodes.length > 0) {
                    contentEl = tempContainer;
                    log('通过临时容器收集到', tempContainer.childNodes.length, '个节点');
                }
            }

            if (!contentEl) {
                let sibling = internalDescEl.nextElementSibling;
                while (sibling) {
                    if (descEl && sibling.contains(descEl)) break;
                    const text = sibling.textContent.trim();
                    if (text && text !== '内部描述') {
                        contentEl = sibling;
                        break;
                    }
                    sibling = sibling.nextElementSibling;
                }
            }

            if (!contentEl) {
                log('主提取方式失败，尝试备用方式');
                return extractViaInnerText();
            }

            const extracted = SharedUtils.extractContentWithImages(contentEl, {
                stripLabelPattern: /^(内部描述[\*\s]*[：:]?\s*)/i
            });
            state.copiedText = extracted;
            state.lastExtractedLength = extracted.length;
            log('提取内部描述成功，长度:', extracted.length);
            logger.success('提取内部描述成功，长度: ' + extracted.length);

            if (extracted.length < 3) {
                log('警告：提取内容长度异常（<3），尝试备用提取方式');
                logger.warn('提取内容长度异常（' + extracted.length + '），尝试备用方式');
                const fallbackResult = extractViaInnerText();
                if (fallbackResult && fallbackResult.length >= 3) {
                    log('备用方式提取成功，长度:', fallbackResult.length);
                    return fallbackResult;
                }
                return '';
            }

            return extracted;
        }

        function isAbnormalLoad(extractedLength) {
            return extractedLength > 0 && extractedLength < 3;
        }

        async function extractInternalDescriptionWithRetry() {
            let result = extractInternalDescription();

            if (result && result.length >= 3) return result;

            if (result && isAbnormalLoad(result.length)) {
                log('检测到异常加载（长度=' + result.length + '），将触发重新提取');
                logger.warn('检测到异常加载，触发重新提取...');
            }

            const maxRetries = Math.max(1, CONFIG.internalDescMaxRetries || 5);
            for (let i = 0; i < maxRetries; i++) {
                log('内部描述未就绪，' + CONFIG.internalDescRetryDelay + 'ms 后重试 (' + (i + 1) + '/' + maxRetries + ')');
                logger.log('等待内容加载... (' + (i + 1) + '/' + maxRetries + ')');
                await new Promise(resolve => setTimeout(resolve, CONFIG.internalDescRetryDelay));
                result = extractInternalDescription();
                if (result && result.length >= 3) return result;

                if (result && isAbnormalLoad(result.length)) {
                    log('重试后仍检测到异常加载（长度=' + result.length + '）');
                    logger.warn('重试后仍异常，长度=' + result.length);
                }
            }
            return '';
        }

        function extractViaInnerText() {
            const bodyText = document.body.innerText;
            const startIdx = bodyText.indexOf('内部描述');
            if (startIdx === -1) {
                log('未找到"内部描述"文本');
                return '';
            }

            const searchStart = startIdx + 4;
            const endIdx = bodyText.indexOf('描述', searchStart);
            if (endIdx === -1) {
                log('未找到"描述"结束标记');
                return '';
            }

            let extracted = bodyText.slice(searchStart, endIdx).trim();
            extracted = extracted.replace(/^[：:\s]+/, '');

            if (extracted.length < 3) {
                log('innerText提取结果过短，尝试查找DOM内容区域');
                return extractViaDOMQuery();
            }

            state.copiedText = extracted;
            log('通过innerText提取内部描述成功，长度:', extracted.length);
            return extracted;
        }

        function extractViaDOMQuery() {
            log('尝试通过DOM选择器提取');

            const selectors = [
                '[class*="internal-desc"]',
                '[class*="internalDescription"]',
                '.ql-editor',
                '.markdown-body',
                '.rich-text-content',
                '.editor-content'
            ];

            for (const selector of selectors) {
                try {
                    const elements = document.querySelectorAll(selector);
                    for (const el of elements) {
                        const text = el.textContent.trim();
                        if (text && text.length > 10 && !text.startsWith('内部描述')) {
                            const cleaned = text.replace(/^[\s：:]+/, '').trim();
                            if (cleaned.length >= 3) {
                                state.copiedText = cleaned;
                                log('通过DOM选择器提取成功，长度:', cleaned.length);
                                return cleaned;
                            }
                        }
                    }
                } catch (e) {
                    continue;
                }
            }

            log('DOM选择器提取失败');
            return '';
        }

        function determineHeading(text) {
            if (!text) {
                log('传入的文本为空，无法判断ServerID');
                return false;
            }

            const serverIdPattern = /ServerID\s*=\s*(\d{4,5})\s*,?/gi;
            const matches = [];
            let match;

            while ((match = serverIdPattern.exec(text)) !== null) {
                matches.push(match[1]);
            }

            log('ServerID匹配结果:', matches);

            if (matches.length === 0) {
                log('未找到ServerID');
                logger.warn('未找到ServerID');
                return false;
            }

            const serverID = matches[0];
            if (matches.length > 1) {
                log('警告：检测到多个ServerID，使用第一个: ' + serverID);
                logger.warn('检测到多个ServerID(' + matches.length + '个)，使用第一个');
            }

            log('提取到ServerID:', serverID);
            const isTestServer = serverID.startsWith('57');
            state.leftHeading = isTestServer ? CONFIG.testServer : CONFIG.fullServer;
            state.versionNumber = SharedUtils.extractVersion(state.leftHeading);
            state.channelText = isTestServer ? '测服' : '全服';
            state.faxiandiedai = extractFaxiandiedai(state.leftHeading);

            log('ServerID:', serverID, '| 类型:', state.channelText, '| 版本:', state.versionNumber, '| 迭代:', state.faxiandiedai);
            logger.success('识别环境: ' + state.channelText + ', 版本: ' + state.versionNumber + ', 迭代: ' + state.faxiandiedai);
            return true;
        }

        function translateViaGoogle(text) {
            return new Promise((resolve, reject) => {
                // 更换为更稳定的国内可访问节点
                const googleDomains = [
                    'translate.googleapis.com',
                    'translate.google.com'
                ];

                // 尝试第一个域名
                GM_xmlhttpRequest({
                    method: 'GET',
                    url: `https://${googleDomains[0]}/translate_a/single?client=gtx&sl=auto&tl=zh-CN&dt=t&q=${encodeURIComponent(text)}`,
                    timeout: CONFIG.translateTimeoutGoogle, // 恢复合理的超时时间
                    onload: (response) => {
                        try {
                            const result = JSON.parse(response.responseText);
                            if (result && result[0] && result[0][0] && result[0][0][0]) {
                                resolve(result[0][0][0]);
                            } else {
                                reject(new Error('Google API format error'));
                            }
                        } catch (e) {
                            reject(e);
                        }
                    },
                    onerror: reject,
                    ontimeout: reject
                });
            });
        }

        function translateViaMyMemory(text) {
            return new Promise((resolve, reject) => {
                GM_xmlhttpRequest({
                    method: 'GET',
                    url: 'https://api.mymemory.translated.net/get?q=' + encodeURIComponent(text) + '&langpair=en|zh',
                    timeout: CONFIG.translateTimeoutOther,
                    onload: (response) => {
                        try {
                            const result = JSON.parse(response.responseText);
                            resolve(result.responseData.translatedText);
                        } catch (e) {
                            reject(e);
                        }
                    },
                    onerror: reject,
                    ontimeout: reject
                });
            });
        }

        function translateViaGLM4Flash(text) {
            return new Promise((resolve, reject) => {
                let apiKey = GM_getValue('glm_api_key_v1', '');
                // 默认使用官方推荐的速度优先模型 glm-4-flash-250414
                let modelVersion = GM_getValue('glm_model_version_v1', 'glm-4-flash-250414');

                if (!apiKey) {
                    return reject(new Error('未配置智谱API Key (请在油猴菜单中设置)'));
                }

                GM_xmlhttpRequest({
                    method: 'POST',
                    url: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${apiKey}`
                    },
                    data: JSON.stringify({
                        model: modelVersion,
                        messages: [
                            { role: "system", content: "你是一个专业翻译引擎。用户会给出原文和目标语言，你只输出译文，不要解释，不要添加额外内容。" },
                            { role: "user", content: `请将下面文本翻译成中文：\n\n"${text}"` }
                        ],
                        temperature: 0.3,
                        max_tokens: 512
                    }),
                    timeout: CONFIG.translateTimeoutOther,
                    onload: (response) => {
                        try {
                            const result = JSON.parse(response.responseText);
                            if (result.error) {
                                reject(new Error(result.error.message || 'GLM API error'));
                            } else if (result.choices && result.choices[0] && result.choices[0].message) {
                                let content = result.choices[0].message.content.trim();
                                // 去除可能存在的首尾引号（包括中文和英文引号）
                                content = content.replace(/^["“'‘]+|["”'’]+$/g, '');
                                resolve(content);
                            } else {
                                reject(new Error('GLM API format error'));
                            }
                        } catch (e) {
                            reject(e);
                        }
                    },
                    onerror: reject,
                    ontimeout: reject
                });
            });
        }

        function getTencentTranslateConfig() {
            return {
                secretId: (GM_getValue('tencent_translate_secret_id_v1', '') || '').trim(),
                secretKey: (GM_getValue('tencent_translate_secret_key_v1', '') || '').trim(),
                region: 'ap-beijing',
                projectId: '0'
            };
        }

        function bufferToHex(buffer) {
            return Array.from(new Uint8Array(buffer)).map(b => b.toString(16).padStart(2, '0')).join('');
        }

        async function sha256Hex(message) {
            const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(message));
            return bufferToHex(digest);
        }

        async function hmacSha256Raw(key, message) {
            const rawKey = typeof key === 'string' ? new TextEncoder().encode(key) : key;
            const cryptoKey = await crypto.subtle.importKey('raw', rawKey, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
            const signature = await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(message));
            return new Uint8Array(signature);
        }

        async function hmacSha256Hex(key, message) {
            return bufferToHex(await hmacSha256Raw(key, message));
        }

        async function translateViaTencent(text) {
            const config = getTencentTranslateConfig();
            if (!config.secretId || !config.secretKey) {
                throw new Error('未配置腾讯翻译 SecretId / SecretKey（请在油猴菜单中设置）');
            }
            if (!crypto || !crypto.subtle) {
                throw new Error('当前环境缺少 Web Crypto，无法调用腾讯翻译');
            }

            const host = 'tmt.tencentcloudapi.com';
            const service = 'tmt';
            const action = 'TextTranslate';
            const version = '2018-03-21';
            const timestamp = Math.floor(Date.now() / 1000);
            const date = new Date(timestamp * 1000).toISOString().slice(0, 10);
            const payload = JSON.stringify({
                SourceText: text,
                Source: 'auto',
                Target: 'zh',
                ProjectId: Number.parseInt(config.projectId || '0', 10) || 0
            });

            const canonicalHeaders = 'content-type:application/json; charset=utf-8\n' +
                'host:' + host + '\n' +
                'x-tc-action:' + action.toLowerCase() + '\n';
            const signedHeaders = 'content-type;host;x-tc-action';
            const hashedPayload = await sha256Hex(payload);
            const canonicalRequest = [
                'POST',
                '/',
                '',
                canonicalHeaders,
                signedHeaders,
                hashedPayload
            ].join('\n');

            const credentialScope = date + '/' + service + '/tc3_request';
            const stringToSign = [
                'TC3-HMAC-SHA256',
                String(timestamp),
                credentialScope,
                await sha256Hex(canonicalRequest)
            ].join('\n');

            const secretDate = await hmacSha256Raw('TC3' + config.secretKey, date);
            const secretService = await hmacSha256Raw(secretDate, service);
            const secretSigning = await hmacSha256Raw(secretService, 'tc3_request');
            const signature = await hmacSha256Hex(secretSigning, stringToSign);
            const authorization = 'TC3-HMAC-SHA256 ' +
                'Credential=' + config.secretId + '/' + credentialScope + ', ' +
                'SignedHeaders=' + signedHeaders + ', ' +
                'Signature=' + signature;

            return new Promise((resolve, reject) => {
                GM_xmlhttpRequest({
                    method: 'POST',
                    url: 'https://' + host,
                    headers: {
                        'Authorization': authorization,
                        'Content-Type': 'application/json; charset=utf-8',
                        'Host': host,
                        'X-TC-Action': action,
                        'X-TC-Timestamp': String(timestamp),
                        'X-TC-Version': version,
                        'X-TC-Region': config.region
                    },
                    data: payload,
                    timeout: CONFIG.translateTimeoutOther,
                    onload: (response) => {
                        try {
                            const result = JSON.parse(response.responseText);
                            const body = result && result.Response ? result.Response : null;
                            if (!body) {
                                reject(new Error('Tencent API format error'));
                                return;
                            }
                            if (body.Error) {
                                reject(new Error(body.Error.Message || body.Error.Code || 'Tencent API error'));
                                return;
                            }
                            if (body.TargetText) {
                                resolve(String(body.TargetText).trim());
                                return;
                            }
                            reject(new Error('Tencent API missing TargetText'));
                        } catch (e) {
                            reject(e);
                        }
                    },
                    onerror: reject,
                    ontimeout: reject
                });
            });
        }

        function clearTranslationPanelTimingState() {
            if (state.translationPanelDelayTimer) {
                clearTimeout(state.translationPanelDelayTimer);
                state.translationPanelDelayTimer = null;
            }
            if (state.translationPanelForceTimer) {
                clearTimeout(state.translationPanelForceTimer);
                state.translationPanelForceTimer = null;
            }
            state.channelDecisionStartedAt = 0;
            state.channelDecisionResolvedAt = 0;
            state.pendingTranslationPanel = null;
        }

        function resetTranslationPanelView() {
            state.translationPanelView = null;
        }

        function showQueuedTranslationPanel(reason = '') {
            const payload = state.pendingTranslationPanel;
            if (!payload) return;
            if (payload.ticketId && state.currentTicketID && payload.ticketId !== state.currentTicketID) {
                state.pendingTranslationPanel = null;
                return;
            }
            if (state.translationPanelDelayTimer) {
                clearTimeout(state.translationPanelDelayTimer);
                state.translationPanelDelayTimer = null;
            }
            if (state.translationPanelForceTimer) {
                clearTimeout(state.translationPanelForceTimer);
                state.translationPanelForceTimer = null;
            }
            state.pendingTranslationPanel = null;
            if (reason) {
                log(reason);
            }
            log('渲染多源翻译面板');
            renderTranslationLogPanel(payload.originalText, payload.panelData, payload.ticketId);
        }

        function queueTranslationPanel(originalText, panelData, ticketId = state.currentTicketID) {
            if (!panelData || panelData.length === 0) {
                log('No translation panel data to render');
                return;
            }

            state.pendingTranslationPanel = { originalText, panelData, ticketId };

            if (state.translationPanelDelayTimer) {
                clearTimeout(state.translationPanelDelayTimer);
                state.translationPanelDelayTimer = null;
            }

                if (state.channelDecisionResolvedAt > 0) {
                    const elapsed = Date.now() - state.channelDecisionResolvedAt;
                    const waitMs = Math.max(0, CONFIG.translationPanelDelayAfterChannelMs - elapsed);
                    state.translationPanelDelayTimer = setTimeout(() => {
                        showQueuedTranslationPanel('渠道处理已稳定，展示多源面板');
                    }, waitMs);
                    return;
                }

            if (state.channelDecisionStartedAt > 0) {
                const elapsed = Date.now() - state.channelDecisionStartedAt;
                if (elapsed >= CONFIG.translationPanelForceDelayMs) {
                    showQueuedTranslationPanel('渠道处理超过 2 秒未稳定，直接展示多源面板');
                } else {
                    log('多源面板已排队，等待渠道处理稳定');
                }
                return;
            }

            log('多源面板已排队，等待进入渠道处理阶段');
        }

        function markChannelDecisionStarted(ticketContext = null) {
            if (!ensureTicketContextActive(ticketContext, '渠道处理开始')) {
                return;
            }
            state.channelDecisionStartedAt = Date.now();
            state.channelDecisionResolvedAt = 0;
            if (state.translationPanelForceTimer) {
                clearTimeout(state.translationPanelForceTimer);
            }
            state.translationPanelForceTimer = setTimeout(() => {
                if (!ensureTicketContextActive(ticketContext, '渠道处理超时展示')) {
                    return;
                }
                showQueuedTranslationPanel('渠道处理超过 2 秒未稳定，直接展示多源面板');
            }, CONFIG.translationPanelForceDelayMs);
        }

        function markChannelDecisionResolved(ticketContext = null) {
            if (!ensureTicketContextActive(ticketContext, '渠道处理完成')) {
                return;
            }
            state.channelDecisionResolvedAt = Date.now();
            if (state.translationPanelForceTimer) {
                clearTimeout(state.translationPanelForceTimer);
                state.translationPanelForceTimer = null;
            }

            if (!state.pendingTranslationPanel) {
                return;
            }

            if (state.translationPanelDelayTimer) {
                clearTimeout(state.translationPanelDelayTimer);
            }
            state.translationPanelDelayTimer = setTimeout(() => {
                showQueuedTranslationPanel('渠道处理完成，100ms 后展示多源面板');
            }, CONFIG.translationPanelDelayAfterChannelMs);
        }

        function renderTranslationLogPanel(originalText, results, ticketId = state.currentTicketID) {
            if (!UI) return;

            let view = state.translationPanelView;
            const shouldCreateNew = !view ||
                view.ticketId !== ticketId ||
                view.originalText !== originalText ||
                !view.container ||
                !view.container.isConnected;

            if (shouldCreateNew) {
                const container = document.createElement('div');
                container.className = 'ai-translation-panel';
                container.style.cssText = 'margin-top: 6px; padding: 8px; background: #fff; border-radius: 6px; border: 1px solid #e8e8e8; box-shadow: 0 2px 8px rgba(0,0,0,0.04);';

                const origDiv = document.createElement('div');
                origDiv.style.cssText = 'font-size: 11px; color: #86868b; margin-bottom: 8px; word-break: break-all; border-bottom: 1px dashed #f0f0f0; padding-bottom: 4px;';
                container.appendChild(origDiv);

                const resultsDiv = document.createElement('div');
                resultsDiv.style.cssText = 'display: flex; flex-direction: column; gap: 6px; margin-bottom: 10px;';
                container.appendChild(resultsDiv);

                const editRow = document.createElement('div');
                editRow.style.cssText = 'display: flex; gap: 6px; align-items: center; border-top: 1px solid #f0f0f0; padding-top: 8px;';

                const editInput = document.createElement('input');
                editInput.type = 'text';
                editInput.autocomplete = 'off';
                editInput.spellcheck = false;
                editInput.disabled = false;
                editInput.readOnly = false;
                editInput.removeAttribute('readonly');
                editInput.removeAttribute('disabled');
                editInput.setAttribute('data-ai-translation-input', '1');
                editInput.style.cssText = 'flex: 1; padding: 4px 8px; border: 1px solid #d9d9d9; border-radius: 4px; font-size: 11px; outline: none; pointer-events: auto; background: #fff; color: #1d1d1f;';
                editInput.onfocus = () => editInput.style.borderColor = '#3370ff';
                editInput.onblur = () => editInput.style.borderColor = '#d9d9d9';
                editInput.addEventListener('mousedown', (e) => e.stopPropagation());
                editInput.addEventListener('click', (e) => e.stopPropagation());
                editInput.addEventListener('keydown', (e) => e.stopPropagation());

                const replaceBtn = document.createElement('button');
                replaceBtn.textContent = '修改并替换标题';
                replaceBtn.style.cssText = 'padding: 4px 10px; background: #3370ff; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 11px; font-weight: 500; transition: background 0.2s;';
                replaceBtn.onmouseover = () => replaceBtn.style.background = '#285acc';
                replaceBtn.onmouseout = () => replaceBtn.style.background = '#3370ff';

                editRow.appendChild(editInput);
                editRow.appendChild(replaceBtn);
                container.appendChild(editRow);

                logger.custom(container);
                view = {
                    ticketId,
                    originalText,
                    container,
                    origDiv,
                    resultsDiv,
                    editInput,
                    replaceBtn,
                    selectedText: ''
                };
                state.translationPanelView = view;
            }

            // 优先选择第一个成功的结果
            const firstSuccess = results.find(r => r.success);
            if (!view.selectedText && firstSuccess) {
                view.selectedText = firstSuccess.text;
            }

            view.origDiv.textContent = `原文: ${originalText}`;
            view.resultsDiv.innerHTML = '';

            results.forEach((r, idx) => {
                const row = document.createElement('div');
                row.style.cssText = 'display: flex; align-items: center; gap: 6px; margin-bottom: 4px;';

                const label = document.createElement('span');
                label.style.cssText = 'font-weight: 600; color: #3370ff; width: 75px; flex-shrink: 0; font-size: 10px; text-align: right;';
                label.textContent = r.name + ':';

                if (r.success) {
                    const radio = document.createElement('input');
                    radio.type = 'radio';
                    radio.name = `trans_${ticketId || 'pending'}`;
                    radio.value = r.text;
                    radio.checked = view.selectedText ? view.selectedText === r.text : (r === firstSuccess);
                    radio.style.margin = '0';
                    radio.onchange = () => {
                        view.selectedText = r.text;
                        view.editInput.value = r.text;
                    };

                    const textSpan = document.createElement('span');
                    textSpan.style.cssText = 'flex: 1; word-break: break-all; cursor: pointer; font-size: 11px; color: #1d1d1f;';
                    textSpan.textContent = r.text;
                    textSpan.onclick = () => { radio.checked = true; radio.onchange(); };

                    const copyBtn = document.createElement('button');
                    copyBtn.textContent = '复制';
                    copyBtn.style.cssText = 'padding: 2px 6px; font-size: 10px; border-radius: 4px; border: 1px solid #d9d9d9; background: #f5f5f7; cursor: pointer; color: #1d1d1f;';
                    copyBtn.onclick = () => {
                        navigator.clipboard.writeText(r.text);
                        const oldText = copyBtn.textContent;
                        copyBtn.textContent = '已复制';
                        copyBtn.style.background = '#e6f7ff';
                        copyBtn.style.borderColor = '#91d5ff';
                        copyBtn.style.color = '#1890ff';
                        setTimeout(() => {
                            copyBtn.textContent = oldText;
                            copyBtn.style.background = '#f5f5f7';
                            copyBtn.style.borderColor = '#d9d9d9';
                            copyBtn.style.color = '#1d1d1f';
                        }, 1000);
                    };

                    row.appendChild(radio);
                    row.appendChild(label);
                    row.appendChild(textSpan);
                    row.appendChild(copyBtn);
                } else {
                    // 失败状态显示
                    const errorSpan = document.createElement('span');
                    errorSpan.style.cssText = 'flex: 1; font-size: 10px; color: #ff4d4f; font-style: italic;';
                    errorSpan.textContent = `失败: ${r.error || 'unknown error'}`;

                    row.appendChild(document.createElement('span')); // 占位 radio
                    row.children[0].style.width = '13px'; // 保持对齐
                    row.children[0].style.display = 'inline-block';

                    row.appendChild(label);
                    row.appendChild(errorSpan);
                }
                view.resultsDiv.appendChild(row);
            });

            if (!view.selectedText && firstSuccess) {
                view.selectedText = firstSuccess.text;
            }
            view.editInput.value = view.selectedText || '';
            view.editInput.oninput = () => { view.selectedText = view.editInput.value; };

            view.replaceBtn.onclick = () => {
                const input = SharedUtils.findTitleInputRobust();
                if (input) {
                    const editedText = normalizeTranslatedText(view.editInput.value.trim()) || normalizeTranslatedText(originalText);
                    const newTitle = SharedUtils.hasChinese(originalText)
                        ? (state.leftHeading + editedText)
                        : buildTitleFromContent(originalText, editedText);

                    const success = SharedUtils.simulateInputValue(input, newTitle);
                    if (success) {
                        const oldText = view.replaceBtn.textContent;
                        view.replaceBtn.textContent = '替换成功!';
                        view.replaceBtn.style.background = '#52c41a';
                        setTimeout(() => {
                            view.replaceBtn.textContent = oldText;
                            view.replaceBtn.style.background = '#3370ff';
                        }, 1500);
                    } else {
                        view.replaceBtn.textContent = '替换失败';
                        view.replaceBtn.style.background = '#ff4d4f';
                    }
                } else {
                    alert('未找到标题输入框');
                }
            };
        }

        function normalizeTranslatedText(text) {
            let normalized = (text || '').trim();
            if (!normalized) return '';
            if (CONFIG.removeTrailingPunctuation) {
                normalized = normalized.replace(/[。.!?！？]+$/, '');
            }
            return normalized.replace(/^["“'‘]+|["”'’]+$/g, '').trim();
        }

        function buildTitleFromContent(contentText, translatedText = '', options = {}) {
            const original = (contentText || '').trim();
            const translated = normalizeTranslatedText(translatedText);
            const prefix = typeof options.prefix === 'string' ? options.prefix : state.leftHeading;

            if (!original) {
                return prefix + translated;
            }

            if (SharedUtils.hasChinese(original)) {
                return prefix + (translated || original);
            }

            if (!translated || translated === original) {
                return prefix + original;
            }

            return prefix + translated + ' ' + original;
        }

        function buildTranslationPanelData(originalText, successfulResults = [], failedResults = [], options = {}) {
            const {
                includeOriginal = false,
                originalLabel = '原文保留'
            } = options;

            const panelData = [];
            const seen = new Set();

            const pushSuccessRow = (name, text) => {
                const cleaned = normalizeTranslatedText(text);
                if (!cleaned || seen.has(cleaned)) return;
                seen.add(cleaned);
                panelData.push({ name, success: true, text: cleaned });
            };

            if (includeOriginal) {
                pushSuccessRow(originalLabel, originalText);
            }

            for (const result of successfulResults) {
                pushSuccessRow(result.name, result.text);
            }

            for (const result of failedResults) {
                panelData.push({ name: result.name, success: false, error: result.error });
            }

            return panelData;
        }

        async function translateText(text) {
            const sourceText = (text || '').trim();
            if (!sourceText) return '';

            const containsChinese = SharedUtils.hasChinese(sourceText);
            const containsTraditionalChinese = SharedUtils.hasTraditionalChinese(sourceText);
            const ticketIdSnapshot = state.currentTicketID;

            if (state.translateCount >= CONFIG.translateDailyLimit) {
                log('已达翻译次数上限');
                queueTranslationPanel(sourceText, buildTranslationPanelData(sourceText, [], [], {
                    includeOriginal: true,
                    originalLabel: '\u539f\u6587\u4fdd\u7559'
                }), ticketIdSnapshot);
                return sourceText;
            }

            if (containsChinese && !containsTraditionalChinese) {
                log('文本已包含简体中文，跳过外部翻译但保留交互面板');
                queueTranslationPanel(sourceText, buildTranslationPanelData(sourceText, [], [], {
                    includeOriginal: true,
                    originalLabel: '\u539f\u6587\u4fdd\u7559'
                }), ticketIdSnapshot);
                return sourceText;
            }

            const translators = [
                { name: 'Google', fn: translateViaGoogle, timeout: CONFIG.translateTimeoutGoogle },
                { name: 'MyMemory', fn: translateViaMyMemory, timeout: CONFIG.translateTimeoutOther },
                { name: 'Tencent', fn: translateViaTencent, timeout: CONFIG.translateTimeoutOther },
                { name: 'GLM', fn: translateViaGLM4Flash, timeout: CONFIG.translateTimeoutOther }
            ];

            const collectedResults = new Map();
            const failedResults = new Map();
            let hasCountedTranslate = false;

            const syncTranslationPanel = () => {
                const successful = Array.from(collectedResults.values()).filter(r => r.text && normalizeTranslatedText(r.text) !== sourceText);
                const failed = Array.from(failedResults.values());

                if (successful.length > 0 && !hasCountedTranslate) {
                    state.translateCount++;
                    hasCountedTranslate = true;
                }

                const panelData = buildTranslationPanelData(sourceText, successful, failed, {
                    includeOriginal: containsTraditionalChinese || successful.length === 0,
                    originalLabel: containsTraditionalChinese ? '\u539f\u6587\u7e41\u4e2d' : '\u539f\u6587\u4fdd\u7559'
                });

                queueTranslationPanel(sourceText, panelData, ticketIdSnapshot);
            };

            const promises = translators.map(t => {
                return new Promise((resolve) => {
                    const timer = setTimeout(() => resolve({ name: t.name, success: false, error: 'timeout' }), t.timeout);
                    Promise.resolve(t.fn(sourceText)).then(res => {
                        clearTimeout(timer);
                        const result = { name: t.name, success: true, text: res };
                        collectedResults.set(t.name, result);
                        failedResults.delete(t.name);
                        syncTranslationPanel();
                        resolve(result);
                    }).catch(err => {
                        clearTimeout(timer);
                        const result = { name: t.name, success: false, error: err.message };
                        failedResults.set(t.name, result);
                        syncTranslationPanel();
                        resolve(result);
                    });
                });
            });

            let fastestResult = null;

            const firstSuccessPromise = new Promise((resolve) => {
                let pending = promises.length;
                promises.forEach(p => {
                    p.then(r => {
                        if (r.success && !fastestResult) {
                            fastestResult = r.text;
                            resolve(r.text);
                        }
                        pending--;
                        if (pending === 0 && !fastestResult) {
                            resolve(null);
                        }
                    });
                });
            });

            Promise.all(promises).then(() => {
                syncTranslationPanel();
            });

            const bestText = await firstSuccessPromise;

            if (bestText) {
                return normalizeTranslatedText(bestText);
            }
            return sourceText;
        }

        async function processTitleWithRetry(ticketContext = getTicketContext()) {
            if (state.hasProcessedTitle || state.isTitleProcessing) {
                log('标题已处理过或正在处理中，跳过');
                return;
            }
            state.isTitleProcessing = true;

            const startTime = Date.now();
            log('开始等待任务标题输入框变为可用状态...');

            try {
                while (Date.now() - startTime < CONFIG.titleMaxWaitTime) {
                    if (!ensureTicketContextActive(ticketContext, '标题处理')) {
                        return;
                    }

                    const input = SharedUtils.findTitleInputRobust();
                    if (input) {
                        const currentValue = input.value || '';

                        if (SharedUtils.isMCGGTitle(currentValue)) {
                            log('检测到【MCGG】标识，普通工单模块跳过，应由MCGG模块处理');
                            state.hasProcessedTitle = true;
                            return;
                        }

                        const colonMatch = currentValue.match(/[：:]/);
                        if (!colonMatch) {
                            const contentPart = currentValue.trim();
                            let translatedContent = '';
                            if (contentPart) {
                                log('标题中未找到冒号，按完整标题内容进入翻译流程:', contentPart);
                                translatedContent = await translateText(contentPart);
                                if (!ensureTicketContextActive(ticketContext, '标题翻译回填')) {
                                    return;
                                }
                            }
                            const newTitle = buildTitleFromContent(contentPart, translatedContent);
                            log('标题中未找到冒号，应用新标题:', newTitle);
                            const success = SharedUtils.simulateInputValue(input, newTitle);
                            if (success) {
                                state.hasProcessedTitle = true;
                                log('✓ 标题处理成功');
                                logger.success('标题处理成功');
                                return;
                            }
                        } else {
                            const colonIndex = colonMatch.index;
                            const prefixPart = currentValue.substring(0, colonIndex);

                            if (SharedUtils.isMCGGTitle(prefixPart)) {
                                log('标题包含【MCGG】，不处理');
                                state.hasProcessedTitle = true;
                                return;
                            }

                            const prefixPattern = /^【[\d.]+[^】]*(?:全服|测服)】：?$/;
                            const isOldPrefix = prefixPattern.test(prefixPart);
                            const hasServerHeading = !!state.leftHeading;

                            if (hasServerHeading && currentValue.startsWith(state.leftHeading) && !isOldPrefix) {
                                log('标题前缀已是最新版本，跳过');
                                state.hasProcessedTitle = true;
                                return;
                            }

                            const contentPart = currentValue.substring(colonIndex + 1).trim();
                            let translatedContent = '';

                            if (contentPart) {
                                log('开始翻译标题内容:', contentPart);
                                translatedContent = await translateText(contentPart);
                                if (!ensureTicketContextActive(ticketContext, '标题翻译回填')) {
                                    return;
                                }
                            } else {
                                log('标题内容为空，跳过翻译');
                            }

                            const newTitle = hasServerHeading
                                ? buildTitleFromContent(contentPart, translatedContent)
                                : (prefixPart.trim()
                                    ? (prefixPart.trim() + '：' + buildTitleFromContent(contentPart, translatedContent, { prefix: '' }))
                                    : buildTitleFromContent(contentPart, translatedContent, { prefix: '' }));

                            log('应用新标题:', newTitle);
                            if (hasServerHeading && isOldPrefix) {
                                log('检测到旧版本前缀，将替换: ' + prefixPart + ' -> ' + state.leftHeading);
                                logger.log('更新标题前缀: ' + prefixPart + ' → ' + state.leftHeading);
                            } else if (!hasServerHeading) {
                                log('未识别到 ServerID，保留原标题前缀，仅翻译冒号后内容');
                            }

                            const success = SharedUtils.simulateInputValue(input, newTitle);
                            if (success) {
                                state.hasProcessedTitle = true;
                                log('✓ 标题处理成功');
                                logger.success('标题处理成功');
                                return;
                            }
                        }
                    }
                    await new Promise(resolve => setTimeout(resolve, CONFIG.titleRetryDelay));
                }
            } finally {
                state.isTitleProcessing = false;
            }

            log('等待超时，未能处理标题');
        }

        async function handleChannelFocus(ticketContext = getTicketContext()) {
            if (state.channelFilled) return;
            if (!ensureTicketContextActive(ticketContext, '渠道焦点兜底')) return;
            log('渠道输入框获得焦点，准备填充:', state.channelText);
            const success = await SharedUtils.fillDropdownSearch(state.channelText, logger);
            if (!ensureTicketContextActive(ticketContext, '渠道焦点兜底')) return;
            if (success) state.channelFilled = true;
        }

        async function handleIterationFocus(ticketContext = getTicketContext()) {
            if (state.iterationFilled) return;
            if (!ensureTicketContextActive(ticketContext, '发现迭代焦点兜底')) return;
            log('发现迭代输入框获得焦点，准备填充:', state.faxiandiedai);
            const success = await SharedUtils.fillDropdownSearch(state.faxiandiedai, logger, 150, {
                preferThirdLink: true,
                allowSingleCandidateFallback: false
            });
            if (!ensureTicketContextActive(ticketContext, '发现迭代焦点兜底')) return;
            const applied = await SharedUtils.confirmThirdLinkFieldApplied(
                ['发现迭代', '发现迭代*'],
                state.faxiandiedai,
                Math.max(CONFIG.thirdLinkConfirmTimeout, 2600)
            );
            if (!ensureTicketContextActive(ticketContext, '发现迭代焦点兜底')) return;
            if (applied) {
                state.iterationFilled = true;
                if (!success) {
                    log('发现迭代字段值已生效，按成功处理');
                    logger.success('发现迭代字段值已生效，按成功处理');
                }
                return;
            }

            const currentValue = SharedUtils.getThirdLinkFieldDisplayValue(['发现迭代', '发现迭代*']);
            logger.warn('发现迭代填充失败，当前字段值: ' + (currentValue || '(空)'));
        }

        async function handleCreatorFocus(ticketContext = getTicketContext()) {
            if (state.creatorFilled) return;
            if (!ensureTicketContextActive(ticketContext, '创建人焦点兜底')) return;
            const name = CONFIG.thirdLinkCreatorName;
            log('创建人输入框获得焦点，准备填充:', name);
            const success = await SharedUtils.fillDropdownSearch(name, logger, 150, { preferThirdLink: true });
            if (!ensureTicketContextActive(ticketContext, '创建人焦点兜底')) return;
            if (success) state.creatorFilled = true;
        }

        async function autoFillThirdLinkField(labelTexts = [], value = '', stateKey = '', fieldName = '', options = {}) {
            if (!value) {
                log(fieldName + ' \u7f3a\u5c11\u76ee\u6807\u503c\uff0c\u8df3\u8fc7\u81ea\u52a8\u5904\u7406');
                return false;
            }

            if (state[stateKey]) {
                return true;
            }

            const ticketContext = options.ticketContext || null;
            const confirmOptions = { ...options };
            delete confirmOptions.ticketContext;
            const maxAttempts = CONFIG.thirdLinkMaxFillAttempts || 2;
            for (let attempt = 1; attempt <= maxAttempts; attempt++) {
                if (!ensureTicketContextActive(ticketContext, fieldName + ' 自动填充')) {
                    return false;
                }
                const opened = await SharedUtils.openThirdLinkElSelectDropdown(labelTexts, fieldName, (msg) => {
                    log(msg);
                });
                if (!ensureTicketContextActive(ticketContext, fieldName + ' 自动填充')) {
                    return false;
                }
                if (!opened) {
                    log(fieldName + ' \u4e0b\u62c9\u6846\u81ea\u52a8\u5c55\u5f00\u5931\u8d25\uff0c\u4fdd\u7559\u7126\u70b9\u76d1\u542c\u515c\u5e95');
                } else {
                    const isIterationField = stateKey === 'iterationFilled';
                    const success = await SharedUtils.fillDropdownSearch(value, logger, 150, {
                        preferThirdLink: true,
                        allowSingleCandidateFallback: !isIterationField
                    });
                    if (!ensureTicketContextActive(ticketContext, fieldName + ' 自动填充')) {
                        return false;
                    }
                    const confirmTimeout = isIterationField
                        ? Math.max(CONFIG.thirdLinkConfirmTimeout, 2600)
                        : CONFIG.thirdLinkConfirmTimeout;
                    const applied = await SharedUtils.confirmThirdLinkFieldApplied(labelTexts, value, confirmTimeout, confirmOptions);
                    if (!ensureTicketContextActive(ticketContext, fieldName + ' 自动填充')) {
                        return false;
                    }
                    if (applied) {
                        state[stateKey] = true;
                        if (!success) {
                            log(fieldName + ' 字段值已生效，按成功处理:', value);
                            logger.success(fieldName + ' 字段值已生效，按成功处理: ' + value);
                        } else {
                            log(fieldName + ' \u81ea\u52a8\u586b\u5145\u6210\u529f:', value);
                            logger.success(fieldName + ' \u81ea\u52a8\u586b\u5145\u6210\u529f: ' + value);
                        }
                        return true;
                    }

                    if (attempt < maxAttempts) {
                        if (isIterationField) {
                            const currentValue = SharedUtils.getThirdLinkFieldDisplayValue(labelTexts);
                            logger.warn(fieldName + ' 本次尝试后仍未生效，当前字段值: ' + (currentValue || '(空)') + '，准备重试 ' + attempt + '/' + maxAttempts);
                        } else {
                            log(fieldName + ' \u672c\u6b21\u5c1d\u8bd5\u540e\u4ecd\u672a\u786e\u8ba4\u751f\u6548\uff0c\u51c6\u5907\u91cd\u8bd5 ' + attempt + '/' + maxAttempts);
                        }
                    }
                }

                if (attempt < maxAttempts) {
                    await new Promise(resolve => setTimeout(resolve, CONFIG.thirdLinkStepGap));
                }
            }

            const currentValue = stateKey === 'iterationFilled'
                ? SharedUtils.getThirdLinkFieldDisplayValue(labelTexts)
                : '';
            const failMsg = stateKey === 'iterationFilled'
                ? fieldName + ' \u81ea\u52a8\u586b\u5145\u5931\u8d25\uff0c\u5f53\u524d\u5b57\u6bb5\u503c: ' + (currentValue || '(空)') + '\uff0c\u4fdd\u7559\u7126\u70b9\u76d1\u542c\u515c\u5e95'
                : fieldName + ' \u81ea\u52a8\u586b\u5145\u5931\u8d25\uff0c\u4fdd\u7559\u7126\u70b9\u76d1\u542c\u515c\u5e95';
            console.warn('[普通工单]', failMsg);
            logger.warn(failMsg);
            return false;
        }

        function ensureNormalThirdLinkTargetsReady() {
            if (!state.faxiandiedai) {
                const fallbackIteration = state.versionNumber || SharedUtils.extractVersion(state.leftHeading);
                if (fallbackIteration) {
                    state.faxiandiedai = fallbackIteration;
                    log('\u53d1\u73b0\u8fed\u4ee3\u76ee\u6807\u503c\u7f3a\u5931\uff0c\u5df2\u6309\u7248\u672c\u53f7\u56de\u586b:', state.faxiandiedai);
                    logger.warn('\u53d1\u73b0\u8fed\u4ee3\u76ee\u6807\u503c\u7f3a\u5931\uff0c\u6309\u7248\u672c\u53f7\u56de\u586b: ' + state.faxiandiedai);
                }
            }

            if (!state.channelText && state.leftHeading) {
                if (state.leftHeading.includes('\u6d4b\u670d')) {
                    state.channelText = '\u6d4b\u670d';
                } else if (state.leftHeading.includes('\u5168\u670d')) {
                    state.channelText = '\u5168\u670d';
                }

                if (state.channelText) {
                    log('\u6e20\u9053\u76ee\u6807\u503c\u7f3a\u5931\uff0c\u5df2\u6309\u6807\u9898\u524d\u7f00\u56de\u586b:', state.channelText);
                    logger.warn('\u6e20\u9053\u76ee\u6807\u503c\u7f3a\u5931\uff0c\u6309\u6807\u9898\u524d\u7f00\u56de\u586b: ' + state.channelText);
                }
            }
        }

        async function processThirdLinkFields(options = {}) {
            const { skipServerDependentFields = false, ticketContext = getTicketContext() } = options;
            if (!ensureTicketContextActive(ticketContext, '关联第三方自动处理')) {
                return;
            }
            ensureNormalThirdLinkTargetsReady();
            await new Promise(resolve => setTimeout(resolve, 400));
            if (!ensureTicketContextActive(ticketContext, '关联第三方自动处理')) {
                return;
            }
            await autoFillThirdLinkField(['\u521b\u5efa\u4eba', '\u521b\u5efa\u4eba*'], CONFIG.thirdLinkCreatorName, 'creatorFilled', '\u521b\u5efa\u4eba', {
                allowPartial: false,
                ticketContext
            });
            if (skipServerDependentFields) {
                return;
            }
            await new Promise(resolve => setTimeout(resolve, CONFIG.thirdLinkStepGap));
            if (!ensureTicketContextActive(ticketContext, '关联第三方自动处理')) {
                return;
            }
            await autoFillThirdLinkField(['\u53d1\u73b0\u8fed\u4ee3', '\u53d1\u73b0\u8fed\u4ee3*'], state.faxiandiedai, 'iterationFilled', '\u53d1\u73b0\u8fed\u4ee3', {
                ticketContext
            });
            await new Promise(resolve => setTimeout(resolve, CONFIG.thirdLinkStepGap));

            if (!ensureTicketContextActive(ticketContext, '渠道自动处理')) {
                return;
            }
            markChannelDecisionStarted(ticketContext);
            try {
                const desiredCh = state.channelText;
                const currentCh = SharedUtils.getThirdLinkFieldDisplayValue(['\u6e20\u9053', '\u6e20\u9053*']);
                if (desiredCh && SharedUtils.channelDisplayMatchesDesired(currentCh, desiredCh)) {
                    log('\u6e20\u9053\u5df2\u662f\u76ee\u6807\u503c\uff0c\u8df3\u8fc7\u81ea\u52a8\u9009\u62e9:', desiredCh, '(\u5f53\u524d:', currentCh || '\u7a7a', ')');
                    logger.log('\u6e20\u9053\u5df2\u662f\u76ee\u6807\u503c\uff0c\u8df3\u8fc7: ' + desiredCh);
                    state.channelFilled = true;
                } else {
                    await autoFillThirdLinkField(['\u6e20\u9053', '\u6e20\u9053*'], state.channelText, 'channelFilled', '\u6e20\u9053', {
                        channelMatch: true,
                        ticketContext
                    });
                }
            } finally {
                markChannelDecisionResolved(ticketContext);
            }
        }

        function setupFocusListener() {
            if (state.focusListenersAttached) return;
            log('设置普通工单焦点监听器');

            focusinHandler = async (e) => {
                const target = e.target;
                if (!target || target.tagName !== 'INPUT') return;

                const titleInput = SharedUtils.findTitleInputRobust();
                const titleValue = titleInput ? titleInput.value || '' : '';
                if (SharedUtils.isMCGGTitle(titleValue, { silent: true })) return;

                const labelText = SharedUtils.findLabelText(target);
                const ticketContext = getTicketContext();
                if (labelText.includes('渠道')) {
                    await handleChannelFocus(ticketContext);
                } else if (labelText.includes('创建人')) {
                    await handleCreatorFocus(ticketContext);
                } else if (labelText.includes('发现迭代')) {
                    await handleIterationFocus(ticketContext);
                }
            };

            document.addEventListener('focusin', focusinHandler, true);
            state.focusListenersAttached = true;
            log('✓ 普通工单焦点监听器已设置');
        }

        function removeFocusListener() {
            if (focusinHandler) {
                document.removeEventListener('focusin', focusinHandler, true);
                focusinHandler = null;
            }
            state.focusListenersAttached = false;
        }

        function resetState() {
            removeFocusListener();
            clearTranslationPanelTimingState();
            resetTranslationPanelView();
            SharedUtils.closeVisibleDropdowns({ preferThirdLink: true }).catch(() => {});
            state.ticketFlowToken += 1;
            state.isProcessing = false;
            state.isTitleProcessing = false;
            state.hasProcessedTitle = false;
            state.channelFilled = false;
            state.creatorFilled = false;
            state.iterationFilled = false;
            state.copiedText = '';
            state.leftHeading = '';
            state.versionNumber = '';
            state.channelText = '';
            state.faxiandiedai = '';
            state.abnormalLoadRetries = 0;
            state.lastExtractedLength = 0;
            state.lastProcessTime = 0;
            if (state.processDebounceTimer) {
                clearTimeout(state.processDebounceTimer);
                state.processDebounceTimer = null;
            }
        }

        function shouldSkipProcess() {
            const now = Date.now();
            const timeSinceLastProcess = now - state.lastProcessTime;

            if (state.isProcessing) {
                log('跳过执行：正在处理中');
                return true;
            }

            if (timeSinceLastProcess < CONFIG.debounceDelay) {
                log('跳过执行：防抖间隔内（距上次' + timeSinceLastProcess + 'ms）');
                return true;
            }

            return false;
        }

        async function processTicket() {
            if (shouldSkipProcess()) {
                return;
            }

            const titleInput = SharedUtils.findTitleInputRobust();
            const titleValue = titleInput ? titleInput.value || '' : '';
            if (SharedUtils.isMCGGTitle(titleValue, { silent: true })) {
                log('检测到MCGG标识，普通工单模块跳过');
                return;
            }

            state.isProcessing = true;
            state.lastProcessTime = Date.now();
            log('========== 开始处理普通工单 ==========');
            const ticketContext = getTicketContext();

            try {
                const internalDesc = await extractInternalDescriptionWithRetry();
                if (!internalDesc) {
                    log('未提取到内部描述，中止处理');
                    state.isProcessing = false;
                    return;
                }

                const hasValidServer = determineHeading(internalDesc);
                if (!hasValidServer) {
                    log('未识别到 ServerID，跳过发现迭代/渠道自动处理');
                    logger.warn('未识别到 ServerID，跳过发现迭代/渠道自动处理');
                    log('标题翻译与多源面板继续执行');
                }

                await processTitleWithRetry(ticketContext);
                if (!ensureTicketContextActive(ticketContext, '普通工单主流程')) {
                    return;
                }
                await processThirdLinkFields({ skipServerDependentFields: !hasValidServer, ticketContext });
                if (!ensureTicketContextActive(ticketContext, '普通工单主流程')) {
                    return;
                }
                setupFocusListener();
                log('========== 普通工单处理完成 ==========');
            } catch (e) {
                logError('处理工单时发生异常:', e);
            } finally {
                state.isProcessing = false;
            }
        }

        async function handleNormalZoneClick(element) {
            const titleInput = SharedUtils.findTitleInputRobust();
            const titleValue = titleInput ? titleInput.value || '' : '';
            if (SharedUtils.isMCGGTitle(titleValue, { silent: true })) {
                log('当前工单为MCGG类型，请使用MCGG按钮');
                return;
            }

            let copyText = state.copiedText;
            if (!copyText) {
                copyText = await extractInternalDescriptionWithRetry();
            }

            if (!copyText) {
                log('无内容可复制');
                return;
            }

            SharedUtils.copyText(copyText).then(success => {
                if (!success) {
                    logError('复制失败: 剪贴板写入不可用');
                    return;
                }

                UI.showZoneSuccess('normal');
                log('内部描述已复制到剪贴板');

                let isExpandedBtn = element && element.tagName === 'BUTTON';
                if (isExpandedBtn) {
                    const originalText = element.textContent;
                    element.textContent = '已复制！';
                    element.classList.add('success');
                    setTimeout(() => {
                        element.textContent = originalText;
                        element.classList.remove('success');
                    }, 1500);
                }
            });
        }

        function initUI() {
            if (!UI) return;
            UI.addButton('复制普通工单', 'btn-normal', async (btn) => {
                handleNormalZoneClick(btn);
            });
            UI.registerZoneCallback('normal', handleNormalZoneClick);

            // 注册菜单命令：设置智谱 API Key
            // 这样用户可以随时更改 Key，而不需要修改代码
            GM_registerMenuCommand('设置智谱AI 翻译 API Key', () => {
                const currentKey = GM_getValue('glm_api_key_v1', '');
                const newKey = prompt('请输入智谱 API Key (永久免费，获取方式见智谱官网 open.bigmodel.cn):', currentKey);
                if (newKey !== null) {
                    GM_setValue('glm_api_key_v1', newKey.trim());
                    alert('API Key 已保存！下次翻译时生效。');
                }
            });

            // 注册菜单命令：选择智谱AI 翻译模型
            GM_registerMenuCommand('选择智谱AI 翻译模型', () => {
                const currentModel = GM_getValue('glm_model_version_v1', 'glm-4-flash-250414');
                const models = [
                    'glm-4-flash-250414',
                    'glm-4-flash',
                    'glm-4.7-flash',
                    'glm-4.6v-flash',
                    'glm-4.1v-thinking-flash',
                    'glm-4v-flash',
                    'cogview-3-flash',
                    'cogvideox-flash'
                ];

                let promptText = `当前模型: ${currentModel}\n请选择并输入模型名称 (输入数字序号或直接输入模型名):\n`;
                models.forEach((m, i) => promptText += `${i + 1}. ${m}${i === 0 ? ' (推荐:速度优先)' : ''}${i === 2 ? ' (推荐:质量优先)' : ''}\n`);

                const input = prompt(promptText, currentModel);
                if (input !== null) {
                    const trimmed = input.trim().toLowerCase();
                    let selectedModel = trimmed;

                    // 如果输入的是数字
                    if (/^\d+$/.test(trimmed)) {
                        const index = parseInt(trimmed) - 1;
                        if (index >= 0 && index < models.length) {
                            selectedModel = models[index];
                        }
                    }

                    GM_setValue('glm_model_version_v1', selectedModel);
                    alert(`模型已更新为: ${selectedModel}`);
                }
            });
            GM_registerMenuCommand('设置腾讯翻译 SecretId', () => {
                const currentValue = GM_getValue('tencent_translate_secret_id_v1', '');
                const input = prompt('请输入腾讯翻译 SecretId:', currentValue);
                if (input !== null) {
                    GM_setValue('tencent_translate_secret_id_v1', input.trim());
                    alert('Tencent SecretId 已保存！');
                }
            });

            GM_registerMenuCommand('设置腾讯翻译 SecretKey', () => {
                const currentValue = GM_getValue('tencent_translate_secret_key_v1', '');
                const input = prompt('请输入腾讯翻译 SecretKey (将保存在油猴脚本存储中):', currentValue);
                if (input !== null) {
                    GM_setValue('tencent_translate_secret_key_v1', input.trim());
                    alert('Tencent SecretKey 已保存！');
                }
            });
        }

        function monitorTicketChange() {
            setInterval(() => {
                const newTicketID = SharedUtils.getCurrentTicketID();
                if (newTicketID && newTicketID !== state.currentTicketID) {
                    log('工单切换: ' + (state.currentTicketID || '(无)') + ' -> ' + newTicketID);
                    logger.success('检测到新工单: ' + newTicketID);
                    resetState();
                    state.currentTicketID = newTicketID;
                    setTimeout(() => {
                        processTicket();
                    }, 500);
                }
            }, CONFIG.checkInterval);
        }

        function init() {
            log('========================================');
            log('普通工单模块 v6.2.8 已启动');
            log('调试模式:', CONFIG.debug);
            log('========================================');
            initUI();
            monitorTicketChange();
            setTimeout(() => {
                const ticketID = SharedUtils.getCurrentTicketID();
                if (ticketID) {
                    log('检测到工单:', ticketID);
                    state.currentTicketID = ticketID;
                    processTicket();
                } else {
                    log('未检测到工单ID');
                }
            }, 1000);
        }

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', init);
        } else {
            init();
        }
    })();

    // =========================================================================
    // 模块 B：MCGG工单助手（完全独立）
    // =========================================================================
    (function() {
        'use strict';

        if (!shouldRunNormalModule()) return;

        const CONFIG = {
            translateDailyLimit: 150,
            translateTimeoutGoogle: 6000,
            translateTimeoutOther: 6000,
            debug: true,
            checkInterval: 500,
            titleRetryDelay: 1000,
            titleMaxWaitTime: 100000,
            internalDescRetryDelay: 3000,
            internalDescMaxRetries: 5,
            removeTrailingPunctuation: true,
            mcggfullServerLists: ["【MCGG】- 1.2.60：", "【MCGG】- 1.2.58：", "【MCGG】- 1.2.62：", "【MCGG】- 1.2.56："],
            mcggtestServerLists: ["【MCGG】- 1.2.60：", "【MCGG】- 1.2.58：", "【MCGG】- 1.2.62：", "【MCGG】- 1.2.56："],
            mcggfullServer: "【MCGG】- 1.2.58：",
            mcggtestServer: "【MCGG】- 1.2.60：",
            debounceDelay: 300,
            translationPanelDelayAfterChannelMs: 100,
            translationPanelForceDelayMs: 2000,
            thirdLinkStepGap: 120,
            thirdLinkConfirmTimeout: 1500,
            thirdLinkMaxFillAttempts: 2,
            thirdLinkModuleName: '模式独立包（MC2/24年12月后）',
            thirdLinkCreatorName: '梁磊'
        };

        let state = {
            currentTicketID: null,
            ticketFlowToken: 0,
            copiedText: '',
            leftHeading: '',
            versionNumber: '',
            channelText: '',
            faxiandiedai: '',
            hasProcessedTitle: false,
            translateCount: 0,
            isProcessing: false,
            isTitleProcessing: false,
            channelFilled: false,
            creatorFilled: false,
            iterationFilled: false,
            moduleFilled: false,
            focusListenersAttached: false,
            lastProcessTime: 0,
            pendingTranslationPanel: null,
            translationPanelDelayTimer: null,
            translationPanelForceTimer: null,
            translationPanelView: null,
            channelDecisionStartedAt: 0,
            channelDecisionResolvedAt: 0,
            lastTitleTranslationContext: null
        };

        let mcggFocusinHandler = null;

        const logger = UI ? UI.createLogChannel('mcgg') : { log: console.log, error: console.error, warn: console.warn, success: console.log };

        function log(msg, type = 'info') {
            if (!CONFIG.debug) return;
            const text = msg;
            if (type === 'error') {
                console.error('[MCGG模块] ' + msg);
                logger.error(text);
            } else if (type === 'warn') {
                console.warn('[MCGG模块] ' + msg);
                logger.warn(text);
            } else if (type === 'success') {
                console.log('[MCGG模块] ' + msg);
                logger.success(text);
            } else {
                console.log('[MCGG模块] ' + msg);
                logger.log(text);
            }
        }

        function getTicketContext() {
            return {
                ticketId: state.currentTicketID,
                token: state.ticketFlowToken
            };
        }

        function isTicketContextStale(ticketContext) {
            if (!ticketContext) return false;
            if (ticketContext.token !== state.ticketFlowToken) return true;
            if (!ticketContext.ticketId || !state.currentTicketID) return false;
            return ticketContext.ticketId !== state.currentTicketID;
        }

        function ensureTicketContextActive(ticketContext, stage = '') {
            if (!ticketContext || !isTicketContextStale(ticketContext)) {
                return true;
            }

            const prefix = stage ? (stage + '：') : '';
            log(prefix + '检测到工单已切换，终止旧自动处理链路', 'warn');
            return false;
        }

        function isMCGGTitle(titleValue, options = {}) {
            return SharedUtils.isMCGGTitle(titleValue, options);
        }

        function resetState() {
            const currentTicketID = state.currentTicketID;
            const ticketFlowToken = state.ticketFlowToken + 1;
            const translateCount = state.translateCount;
            removeMCGGFocusListener();
            clearTranslationPanelTimingState();
            resetTranslationPanelView();
            SharedUtils.closeVisibleDropdowns({ preferThirdLink: true }).catch(() => {});
            state = {
                currentTicketID,
                ticketFlowToken,
                copiedText: '',
                leftHeading: '',
                versionNumber: '',
                channelText: '',
                faxiandiedai: '',
                hasProcessedTitle: false,
                translateCount,
                isProcessing: false,
                isTitleProcessing: false,
                channelFilled: false,
                creatorFilled: false,
                iterationFilled: false,
                moduleFilled: false,
                focusListenersAttached: false,
                pendingTranslationPanel: null,
                translationPanelDelayTimer: null,
                translationPanelForceTimer: null,
                translationPanelView: null,
                channelDecisionStartedAt: 0,
                channelDecisionResolvedAt: 0,
                lastTitleTranslationContext: null,
                lastProcessTime: 0
            };
        }

        function shouldSkipProcess() {
            const now = Date.now();
            const timeSinceLastProcess = now - state.lastProcessTime;

            if (state.isProcessing) {
                log('跳过执行：正在处理中');
                return true;
            }

            if (timeSinceLastProcess < CONFIG.debounceDelay) {
                log('跳过执行：防抖间隔内（距上次' + timeSinceLastProcess + 'ms）');
                return true;
            }

            return false;
        }

        async function processMCGGTicket() {
            if (shouldSkipProcess()) {
                return;
            }

            state.isProcessing = true;
            state.lastProcessTime = Date.now();
            log('========== 开始处理MCGG工单 ==========');
            const ticketContext = getTicketContext();

            try {
                const description = await extractMCGGInternalDescriptionWithRetry();
                if (!description) {
                    log('未提取到描述内容，中止处理', 'error');
                    return;
                }

                const hasValidServer = determineMCGGHeading(description);
                if (!hasValidServer) {
                    log('未识别到 ServerID，跳过发现迭代/渠道自动处理', 'warn');
                    log('标题翻译与多源面板继续执行', 'warn');
                }

                await processMCGGTitleWithRetry(ticketContext);
                if (!ensureTicketContextActive(ticketContext, 'MCGG 主流程')) {
                    return;
                }
                await processMCGGThirdLinkFields({ skipServerDependentFields: !hasValidServer, ticketContext });
                if (!ensureTicketContextActive(ticketContext, 'MCGG 主流程')) {
                    return;
                }
                setupMCGGFocusListener();
                log('========== MCGG工单处理完成 ==========', 'success');
            } finally {
                state.isProcessing = false;
            }
        }

        function extractTextFromElement(element) {
            if (!element) return '';
            if (element.tagName === 'TEXTAREA' || element.tagName === 'INPUT') {
                return (element.value || '').trim();
            }
            return SharedUtils.extractContentWithImages(element);
        }

        function extractMCGGInternalDescription() {
            log('开始提取描述内容');
            const outerHtmlExtracted = SharedUtils.extractTextByFormLabels(
                ['描述', '描述*'],
                {
                    contentSelectors: [
                        '.el-form-item__content .show-info .text',
                        '.el-form-item__content .show-info',
                        '.el-form-item__content .flex-column .text',
                        '.el-form-item__content .text',
                        '.el-form-item__content',
                        '.show-info .text',
                        '.show-info',
                        '.text',
                        'p'
                    ],
                    stripLabelPattern: /^(描述\*?[\s：:]*)/i
                }
            );

            if (outerHtmlExtracted) {
                state.copiedText = outerHtmlExtracted.trim();
                log('通过 outerHTML 提取描述内容成功，长度: ' + state.copiedText.length, 'success');
                return state.copiedText;
            }

            const allElements = document.querySelectorAll('p, div, span, label');
            let descLabel = null;

            for (const el of allElements) {
                const text = el.textContent.trim();
                if ((text === '描述' || text === '描述*') && !text.includes('内部')) {
                    descLabel = el;
                    break;
                }
            }

            if (!descLabel) {
                log('未找到"描述"标签', 'warn');
                return '';
            }

            const formItem = descLabel.closest('.el-form-item');
            let extracted = '';

            if (formItem) {
                const candidates = formItem.querySelectorAll(
                    '.el-form-item__content, .detail, .ql-editor, [contenteditable="true"], textarea, .el-textarea__inner, input[type="text"], .markdown-body, .editor-content, .rich-text, .text-content, .aihelp-editor, .editor, .editor-container, pre'
                );

                for (const candidate of candidates) {
                    const text = extractTextFromElement(candidate);
                    if (text) {
                        extracted = text.replace(/^描述\*?[\s：:]*/, '');
                        break;
                    }
                }
            }

            if (!extracted) {
                let sibling = formItem ? formItem.nextElementSibling : descLabel.parentElement?.nextElementSibling;
                const tempContainer = document.createElement('div');

                while (sibling) {
                    const siblingText = sibling.textContent.trim();
                    if (/(^|\s)(内部描述|描述|渠道|发现迭代|功能模块|任务标题)/.test(siblingText)) break;
                    tempContainer.appendChild(sibling.cloneNode(true));
                    sibling = sibling.nextElementSibling;
                }

                if (tempContainer.childNodes.length > 0) {
                    extracted = SharedUtils.extractContentWithImages(tempContainer).replace(/^描述\*?[\s：:]*/, '');
                }
            }

            if (!extracted) {
                log('未找到"描述"内容区域', 'warn');
                return '';
            }

            if (!extracted.trim()) {
                log('描述内容为空', 'warn');
                return '';
            }

            state.copiedText = extracted.trim();
            log('描述内容提取成功，长度: ' + state.copiedText.length, 'success');
            return state.copiedText;
        }

        async function extractMCGGInternalDescriptionWithRetry() {
            let result = extractMCGGInternalDescription();
            if (result) return result;

            const maxRetries = Math.max(1, CONFIG.internalDescMaxRetries || 0);
            for (let i = 0; i < maxRetries; i++) {
                log('描述未就绪，' + CONFIG.internalDescRetryDelay + 'ms 后重试 (' + (i + 1) + '/' + maxRetries + ')');
                await new Promise(resolve => setTimeout(resolve, CONFIG.internalDescRetryDelay));
                result = extractMCGGInternalDescription();
                if (result) return result;
            }
            return '';
        }

        function determineMCGGHeading(text) {
            if (!text) {
                log('传入的文本为空，无法判断ServerID', 'warn');
                return false;
            }

            const serverIdPattern = /ServerID\s*=\s*(\d{4,5})\s*,?/gi;
            const matches = [];
            let match;

            while ((match = serverIdPattern.exec(text)) !== null) {
                matches.push(match[1]);
            }

            log('ServerID匹配结果: ' + (matches.join(', ') || '无'));

            if (matches.length === 0) {
                log('未找到有效ServerID', 'warn');
                return false;
            }

            const serverID = matches[0];
            if (matches.length > 1) {
                log('检测到多个ServerID(' + matches.length + '个)，使用第一个: ' + serverID, 'warn');
            }

            const isTestServer = serverID.startsWith('57');
            state.leftHeading = isTestServer ? CONFIG.mcggtestServer : CONFIG.mcggfullServer;
            state.versionNumber = SharedUtils.extractVersion(state.leftHeading);
            state.channelText = isTestServer ? '测服' : '全服';
            state.faxiandiedai = SharedUtils.extractVersion(state.leftHeading);

            log('识别环境: ' + state.channelText + ', 版本: ' + state.versionNumber);
            return true;
        }

        function clearTranslationPanelTimingState() {
            if (state.translationPanelDelayTimer) {
                clearTimeout(state.translationPanelDelayTimer);
                state.translationPanelDelayTimer = null;
            }
            if (state.translationPanelForceTimer) {
                clearTimeout(state.translationPanelForceTimer);
                state.translationPanelForceTimer = null;
            }
            state.channelDecisionStartedAt = 0;
            state.channelDecisionResolvedAt = 0;
            state.pendingTranslationPanel = null;
        }

        function resetTranslationPanelView() {
            state.translationPanelView = null;
            state.lastTitleTranslationContext = null;
        }

        function getTitleContextKey(titleContext = null) {
            if (!titleContext) return '';
            return [
                titleContext.hasColon ? '1' : '0',
                titleContext.hasServerHeading ? '1' : '0',
                titleContext.targetPrefix || '',
                titleContext.prefixPart || '',
                titleContext.contentText || ''
            ].join('|');
        }

        function showQueuedTranslationPanel(reason = '') {
            const payload = state.pendingTranslationPanel;
            if (!payload) return;
            if (payload.ticketId && state.currentTicketID && payload.ticketId !== state.currentTicketID) {
                state.pendingTranslationPanel = null;
                return;
            }
            if (state.translationPanelDelayTimer) {
                clearTimeout(state.translationPanelDelayTimer);
                state.translationPanelDelayTimer = null;
            }
            if (state.translationPanelForceTimer) {
                clearTimeout(state.translationPanelForceTimer);
                state.translationPanelForceTimer = null;
            }
            state.pendingTranslationPanel = null;
            if (reason) {
                log(reason);
            }
            log('渲染 MCGG 多源翻译面板');
            renderTranslationLogPanel(payload.originalText, payload.panelData, payload.ticketId, payload.titleContext);
        }

        function queueTranslationPanel(originalText, panelData, ticketId = state.currentTicketID, titleContext = null) {
            if (!panelData || panelData.length === 0) {
                log('MCGG 无多源面板数据，跳过');
                return;
            }

            state.pendingTranslationPanel = {
                originalText,
                panelData,
                ticketId,
                titleContext: titleContext ? { ...titleContext } : null
            };

            if (state.translationPanelDelayTimer) {
                clearTimeout(state.translationPanelDelayTimer);
                state.translationPanelDelayTimer = null;
            }

            if (state.channelDecisionResolvedAt > 0) {
                const elapsed = Date.now() - state.channelDecisionResolvedAt;
                const waitMs = Math.max(0, CONFIG.translationPanelDelayAfterChannelMs - elapsed);
                state.translationPanelDelayTimer = setTimeout(() => {
                    showQueuedTranslationPanel('MCGG 渠道处理已稳定，展示多源面板');
                }, waitMs);
                return;
            }

            if (state.channelDecisionStartedAt > 0) {
                const elapsed = Date.now() - state.channelDecisionStartedAt;
                if (elapsed >= CONFIG.translationPanelForceDelayMs) {
                    showQueuedTranslationPanel('MCGG 渠道处理超过 2 秒未稳定，直接展示多源面板');
                } else {
                    log('MCGG 多源面板已排队，等待渠道处理稳定');
                }
                return;
            }

            log('MCGG 多源面板已排队，等待进入渠道处理阶段');
        }

        function markChannelDecisionStarted(ticketContext = null) {
            if (!ensureTicketContextActive(ticketContext, 'MCGG 渠道处理开始')) {
                return;
            }
            state.channelDecisionStartedAt = Date.now();
            state.channelDecisionResolvedAt = 0;
            if (state.translationPanelForceTimer) {
                clearTimeout(state.translationPanelForceTimer);
            }
            state.translationPanelForceTimer = setTimeout(() => {
                if (!ensureTicketContextActive(ticketContext, 'MCGG 渠道处理超时展示')) {
                    return;
                }
                showQueuedTranslationPanel('MCGG 渠道处理超过 2 秒未稳定，直接展示多源面板');
            }, CONFIG.translationPanelForceDelayMs);
        }

        function markChannelDecisionResolved(ticketContext = null) {
            if (!ensureTicketContextActive(ticketContext, 'MCGG 渠道处理完成')) {
                return;
            }
            state.channelDecisionResolvedAt = Date.now();
            if (state.translationPanelForceTimer) {
                clearTimeout(state.translationPanelForceTimer);
                state.translationPanelForceTimer = null;
            }

            if (!state.pendingTranslationPanel) {
                return;
            }

            if (state.translationPanelDelayTimer) {
                clearTimeout(state.translationPanelDelayTimer);
            }
            state.translationPanelDelayTimer = setTimeout(() => {
                showQueuedTranslationPanel('MCGG 渠道处理完成，100ms 后展示多源面板');
            }, CONFIG.translationPanelDelayAfterChannelMs);
        }

        function renderTranslationLogPanel(originalText, results, ticketId = state.currentTicketID, titleContext = null) {
            if (!UI) return;

            const contextKey = getTitleContextKey(titleContext);
            let view = state.translationPanelView;
            const shouldCreateNew = !view ||
                view.ticketId !== ticketId ||
                view.originalText !== originalText ||
                view.titleContextKey !== contextKey ||
                !view.container ||
                !view.container.isConnected;

            if (shouldCreateNew) {
                const container = document.createElement('div');
                container.className = 'ai-translation-panel';
                container.style.cssText = 'margin-top: 6px; padding: 8px; background: #fff; border-radius: 6px; border: 1px solid #e8e8e8; box-shadow: 0 2px 8px rgba(0,0,0,0.04);';

                const origDiv = document.createElement('div');
                origDiv.style.cssText = 'font-size: 11px; color: #86868b; margin-bottom: 8px; word-break: break-all; border-bottom: 1px dashed #f0f0f0; padding-bottom: 4px;';
                container.appendChild(origDiv);

                const resultsDiv = document.createElement('div');
                resultsDiv.style.cssText = 'display: flex; flex-direction: column; gap: 6px; margin-bottom: 10px;';
                container.appendChild(resultsDiv);

                const editRow = document.createElement('div');
                editRow.style.cssText = 'display: flex; gap: 6px; align-items: center; border-top: 1px solid #f0f0f0; padding-top: 8px;';

                const editInput = document.createElement('input');
                editInput.type = 'text';
                editInput.autocomplete = 'off';
                editInput.spellcheck = false;
                editInput.disabled = false;
                editInput.readOnly = false;
                editInput.removeAttribute('readonly');
                editInput.removeAttribute('disabled');
                editInput.setAttribute('data-ai-translation-input', '1');
                editInput.style.cssText = 'flex: 1; padding: 4px 8px; border: 1px solid #d9d9d9; border-radius: 4px; font-size: 11px; outline: none; pointer-events: auto; background: #fff; color: #1d1d1f;';
                editInput.onfocus = () => editInput.style.borderColor = '#3370ff';
                editInput.onblur = () => editInput.style.borderColor = '#d9d9d9';
                editInput.addEventListener('mousedown', (e) => e.stopPropagation());
                editInput.addEventListener('click', (e) => e.stopPropagation());
                editInput.addEventListener('keydown', (e) => e.stopPropagation());

                const replaceBtn = document.createElement('button');
                replaceBtn.textContent = '修改并替换标题';
                replaceBtn.style.cssText = 'padding: 4px 10px; background: #3370ff; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 11px; font-weight: 500; transition: background 0.2s;';
                replaceBtn.onmouseover = () => replaceBtn.style.background = '#285acc';
                replaceBtn.onmouseout = () => replaceBtn.style.background = '#3370ff';

                editRow.appendChild(editInput);
                editRow.appendChild(replaceBtn);
                container.appendChild(editRow);

                logger.custom(container);
                view = {
                    ticketId,
                    originalText,
                    titleContextKey: contextKey,
                    titleContext,
                    container,
                    origDiv,
                    resultsDiv,
                    editInput,
                    replaceBtn,
                    selectedText: ''
                };
                state.translationPanelView = view;
            } else {
                view.titleContext = titleContext || view.titleContext;
                view.titleContextKey = contextKey;
            }

            const firstSuccess = results.find(r => r.success);
            if (!view.selectedText && firstSuccess) {
                view.selectedText = firstSuccess.text;
            }

            view.origDiv.textContent = `原文: ${originalText}`;
            view.resultsDiv.innerHTML = '';

            results.forEach((r) => {
                const row = document.createElement('div');
                row.style.cssText = 'display: flex; align-items: center; gap: 6px; margin-bottom: 4px;';

                const label = document.createElement('span');
                label.style.cssText = 'font-weight: 600; color: #0f9b8e; width: 75px; flex-shrink: 0; font-size: 10px; text-align: right;';
                label.textContent = r.name + ':';

                if (r.success) {
                    const radio = document.createElement('input');
                    radio.type = 'radio';
                    radio.name = `mcgg_trans_${ticketId || 'pending'}`;
                    radio.value = r.text;
                    radio.checked = view.selectedText ? view.selectedText === r.text : (r === firstSuccess);
                    radio.style.margin = '0';
                    radio.onchange = () => {
                        view.selectedText = r.text;
                        view.editInput.value = r.text;
                    };

                    const textSpan = document.createElement('span');
                    textSpan.style.cssText = 'flex: 1; word-break: break-all; cursor: pointer; font-size: 11px; color: #1d1d1f;';
                    textSpan.textContent = r.text;
                    textSpan.onclick = () => { radio.checked = true; radio.onchange(); };

                    const copyBtn = document.createElement('button');
                    copyBtn.textContent = '复制';
                    copyBtn.style.cssText = 'padding: 2px 6px; font-size: 10px; border-radius: 4px; border: 1px solid #d9d9d9; background: #f5f5f7; cursor: pointer; color: #1d1d1f;';
                    copyBtn.onclick = async () => {
                        await SharedUtils.copyText(r.text);
                        const oldText = copyBtn.textContent;
                        copyBtn.textContent = '已复制';
                        copyBtn.style.background = '#e6f7ff';
                        copyBtn.style.borderColor = '#91d5ff';
                        copyBtn.style.color = '#1890ff';
                        setTimeout(() => {
                            copyBtn.textContent = oldText;
                            copyBtn.style.background = '#f5f5f7';
                            copyBtn.style.borderColor = '#d9d9d9';
                            copyBtn.style.color = '#1d1d1f';
                        }, 1000);
                    };

                    row.appendChild(radio);
                    row.appendChild(label);
                    row.appendChild(textSpan);
                    row.appendChild(copyBtn);
                } else {
                    const errorSpan = document.createElement('span');
                    errorSpan.style.cssText = 'flex: 1; font-size: 10px; color: #ff4d4f; font-style: italic;';
                    errorSpan.textContent = `失败: ${r.error || 'unknown error'}`;

                    row.appendChild(document.createElement('span'));
                    row.children[0].style.width = '13px';
                    row.children[0].style.display = 'inline-block';
                    row.appendChild(label);
                    row.appendChild(errorSpan);
                }

                view.resultsDiv.appendChild(row);
            });

            if (!view.selectedText && firstSuccess) {
                view.selectedText = firstSuccess.text;
            }
            view.editInput.value = view.selectedText || '';
            view.editInput.oninput = () => { view.selectedText = view.editInput.value; };

            view.replaceBtn.onclick = () => {
                const input = SharedUtils.findTitleInputRobust();
                if (!input) {
                    alert('未找到标题输入框');
                    return;
                }

                const editedText = normalizeTranslatedText(view.editInput.value.trim()) || normalizeTranslatedText(originalText);
                const newTitle = buildMCGGFinalTitle(originalText, editedText, view.titleContext);
                const success = SharedUtils.simulateInputValue(input, newTitle);

                if (success) {
                    const oldText = view.replaceBtn.textContent;
                    view.replaceBtn.textContent = '替换成功!';
                    view.replaceBtn.style.background = '#52c41a';
                    setTimeout(() => {
                        view.replaceBtn.textContent = oldText;
                        view.replaceBtn.style.background = '#3370ff';
                    }, 1500);
                } else {
                    view.replaceBtn.textContent = '替换失败';
                    view.replaceBtn.style.background = '#ff4d4f';
                }
            };
        }

        function normalizeTranslatedText(text) {
            let normalized = (text || '').trim();
            if (!normalized) return '';
            if (CONFIG.removeTrailingPunctuation) {
                normalized = normalized.replace(/[。.!?！？]+$/, '');
            }
            return normalized.replace(/^["“'‘]+|["”'’]+$/g, '').trim();
        }

        function buildMCGGTitleFromContent(contentText, translatedText = '', options = {}) {
            const original = (contentText || '').trim();
            const translated = normalizeTranslatedText(translatedText);
            const prefix = typeof options.prefix === 'string' ? options.prefix : state.leftHeading;

            if (!original) {
                return prefix + translated;
            }

            if (SharedUtils.hasChinese(original)) {
                return prefix + (translated || original);
            }

            if (!translated || translated === original) {
                return prefix + original;
            }

            return prefix + translated + ' ' + original;
        }

        function buildMCGGFinalTitle(originalText, translatedText = '', titleContext = null) {
            const context = titleContext || state.lastTitleTranslationContext || null;
            const contentText = context && typeof context.contentText === 'string' ? context.contentText : originalText;

            if (context && context.hasServerHeading) {
                return buildMCGGTitleFromContent(contentText, translatedText, { prefix: context.targetPrefix || state.leftHeading });
            }

            if (context && context.hasColon) {
                const preservedPrefix = (context.prefixPart || '').trim();
                const translatedBody = buildMCGGTitleFromContent(contentText, translatedText, { prefix: '' });
                return preservedPrefix ? (preservedPrefix + '：' + translatedBody) : translatedBody;
            }

            return buildMCGGTitleFromContent(contentText, translatedText, { prefix: '' });
        }

        function buildTranslationPanelData(originalText, successfulResults = [], failedResults = [], options = {}) {
            const {
                includeOriginal = false,
                originalLabel = '原文保留'
            } = options;

            const panelData = [];
            const seen = new Set();

            const pushSuccessRow = (name, text) => {
                const cleaned = normalizeTranslatedText(text);
                if (!cleaned || seen.has(cleaned)) return;
                seen.add(cleaned);
                panelData.push({ name, success: true, text: cleaned });
            };

            if (includeOriginal) {
                pushSuccessRow(originalLabel, originalText);
            }

            for (const result of successfulResults) {
                pushSuccessRow(result.name, result.text);
            }

            for (const result of failedResults) {
                panelData.push({ name: result.name, success: false, error: result.error });
            }

            return panelData;
        }

        async function translateText(text, titleContext = null) {
            const sourceText = (text || '').trim();
            if (!sourceText) return '';

            const containsChinese = SharedUtils.hasChinese(sourceText);
            const containsTraditionalChinese = SharedUtils.hasTraditionalChinese(sourceText);
            const ticketIdSnapshot = state.currentTicketID;
            const titleContextSnapshot = titleContext ? { ...titleContext } : null;

            if (state.translateCount >= CONFIG.translateDailyLimit) {
                log('已达翻译次数上限', 'warn');
                queueTranslationPanel(sourceText, buildTranslationPanelData(sourceText, [], [], {
                    includeOriginal: true,
                    originalLabel: '原文保留'
                }), ticketIdSnapshot, titleContextSnapshot);
                return sourceText;
            }

            if (containsChinese && !containsTraditionalChinese) {
                log('MCGG 标题已包含简体中文，跳过外部翻译但保留交互面板');
                queueTranslationPanel(sourceText, buildTranslationPanelData(sourceText, [], [], {
                    includeOriginal: true,
                    originalLabel: '原文保留'
                }), ticketIdSnapshot, titleContextSnapshot);
                return sourceText;
            }

            const translators = [
                { name: 'Google', fn: (value) => TranslationService.translateViaGoogle(value, CONFIG.translateTimeoutGoogle), timeout: CONFIG.translateTimeoutGoogle },
                { name: 'MyMemory', fn: (value) => TranslationService.translateViaMyMemory(value, CONFIG.translateTimeoutOther), timeout: CONFIG.translateTimeoutOther },
                { name: 'Tencent', fn: (value) => TranslationService.translateViaTencent(value, CONFIG.translateTimeoutOther), timeout: CONFIG.translateTimeoutOther },
                { name: 'GLM', fn: (value) => TranslationService.translateViaGLM4Flash(value, CONFIG.translateTimeoutOther), timeout: CONFIG.translateTimeoutOther }
            ];

            const collectedResults = new Map();
            const failedResults = new Map();
            let hasCountedTranslate = false;

            const syncTranslationPanel = () => {
                const successful = Array.from(collectedResults.values()).filter(r => r.text && normalizeTranslatedText(r.text) !== sourceText);
                const failed = Array.from(failedResults.values());

                if (successful.length > 0 && !hasCountedTranslate) {
                    state.translateCount++;
                    hasCountedTranslate = true;
                }

                const panelData = buildTranslationPanelData(sourceText, successful, failed, {
                    includeOriginal: containsTraditionalChinese || successful.length === 0,
                    originalLabel: containsTraditionalChinese ? '原文繁中' : '原文保留'
                });

                queueTranslationPanel(sourceText, panelData, ticketIdSnapshot, titleContextSnapshot);
            };

            const promises = translators.map(t => {
                return new Promise((resolve) => {
                    const timer = setTimeout(() => resolve({ name: t.name, success: false, error: 'timeout' }), t.timeout);
                    Promise.resolve(t.fn(sourceText)).then(res => {
                        clearTimeout(timer);
                        const result = { name: t.name, success: true, text: res };
                        collectedResults.set(t.name, result);
                        failedResults.delete(t.name);
                        syncTranslationPanel();
                        resolve(result);
                    }).catch(err => {
                        clearTimeout(timer);
                        const result = { name: t.name, success: false, error: err.message };
                        failedResults.set(t.name, result);
                        syncTranslationPanel();
                        resolve(result);
                    });
                });
            });

            let fastestResult = null;
            const firstSuccessPromise = new Promise((resolve) => {
                let pending = promises.length;
                promises.forEach(p => {
                    p.then(r => {
                        if (r.success && !fastestResult) {
                            fastestResult = r.text;
                            resolve(r.text);
                        }
                        pending--;
                        if (pending === 0 && !fastestResult) {
                            resolve(null);
                        }
                    });
                });
            });

            Promise.all(promises).then(() => {
                syncTranslationPanel();
            });

            const bestText = await firstSuccessPromise;
            if (bestText) {
                return normalizeTranslatedText(bestText);
            }
            return sourceText;
        }

        async function processMCGGTitleWithRetry(ticketContext = getTicketContext()) {
            if (state.hasProcessedTitle || state.isTitleProcessing) {
                log('标题已处理或正在处理中，跳过');
                return;
            }

            state.isTitleProcessing = true;
            const startTime = Date.now();
            log('开始等待任务标题输入框变为可用状态...');

            try {
                while (Date.now() - startTime < CONFIG.titleMaxWaitTime) {
                    if (!ensureTicketContextActive(ticketContext, 'MCGG 标题处理')) {
                        return;
                    }

                    const input = SharedUtils.findTitleInputRobust();
                    if (input) {
                        const currentValue = input.value || '';
                        const hasServerHeading = !!state.leftHeading;

                        if (hasServerHeading && currentValue.startsWith(state.leftHeading)) {
                            log('MCGG 标题前缀已是最新版本，跳过');
                            state.hasProcessedTitle = true;
                            return;
                        }

                        const colonMatch = currentValue.match(/[：:]/);
                        const prefixPart = colonMatch ? currentValue.substring(0, colonMatch.index).trim() : '';
                        const contentPart = colonMatch ? currentValue.substring(colonMatch.index + 1).trim() : currentValue.trim();
                        const titleContext = {
                            hasColon: !!colonMatch,
                            prefixPart,
                            contentText: contentPart,
                            hasServerHeading,
                            targetPrefix: hasServerHeading ? state.leftHeading : ''
                        };
                        state.lastTitleTranslationContext = { ...titleContext };

                        let translatedContent = '';
                        if (contentPart) {
                            if (colonMatch) {
                                log('开始翻译 MCGG 标题内容: ' + contentPart);
                            } else {
                                log('MCGG 标题中未找到冒号，按完整标题内容进入翻译流程: ' + contentPart);
                            }
                            translatedContent = await translateText(contentPart, titleContext);
                            if (!ensureTicketContextActive(ticketContext, 'MCGG 标题翻译回填')) {
                                return;
                            }
                        } else {
                            log('MCGG 标题内容为空，跳过翻译');
                        }

                        const newTitle = buildMCGGFinalTitle(contentPart, translatedContent, titleContext);
                        log('应用 MCGG 新标题: ' + newTitle);
                        if (!hasServerHeading && colonMatch) {
                            log('未识别到 ServerID，保留原标题前缀，仅翻译冒号后内容', 'warn');
                        }

                        const success = SharedUtils.simulateInputValue(input, newTitle);
                        if (success) {
                            state.hasProcessedTitle = true;
                            log('MCGG 标题处理成功: ' + newTitle, 'success');
                            return;
                        }
                    }
                    await new Promise(resolve => setTimeout(resolve, CONFIG.titleRetryDelay));
                }
            } finally {
                state.isTitleProcessing = false;
            }

            log('等待超时，未能处理 MCGG 标题', 'warn');
        }

        async function handleMCGGChannelFocus(ticketContext = getTicketContext()) {
            if (state.channelFilled) return;
            if (!ensureTicketContextActive(ticketContext, 'MCGG 渠道焦点兜底')) return;
            log('渠道输入框获得焦点，准备填充: ' + state.channelText);
            const success = await SharedUtils.fillDropdownSearch(state.channelText, logger);
            if (!ensureTicketContextActive(ticketContext, 'MCGG 渠道焦点兜底')) return;
            if (success) {
                state.channelFilled = true;
                log('渠道填充成功', 'success');
            } else {
                log('渠道填充失败', 'warn');
            }
        }

        async function handleMCGGIterationFocus(ticketContext = getTicketContext()) {
            if (state.iterationFilled) return;
            if (!ensureTicketContextActive(ticketContext, 'MCGG 发现迭代焦点兜底')) return;
            log('发现迭代输入框获得焦点，准备填充: ' + state.faxiandiedai);
            const success = await SharedUtils.fillDropdownSearch(state.faxiandiedai, logger, 150, {
                preferThirdLink: true,
                allowSingleCandidateFallback: false
            });
            if (!ensureTicketContextActive(ticketContext, 'MCGG 发现迭代焦点兜底')) return;
            const applied = await SharedUtils.confirmThirdLinkFieldApplied(
                ['发现迭代', '发现迭代*'],
                state.faxiandiedai,
                Math.max(CONFIG.thirdLinkConfirmTimeout, 2600)
            );
            if (!ensureTicketContextActive(ticketContext, 'MCGG 发现迭代焦点兜底')) return;
            if (applied) {
                state.iterationFilled = true;
                if (!success) {
                    log('发现迭代字段值已生效，按成功处理', 'success');
                } else {
                    log('发现迭代填充成功', 'success');
                }
            } else {
                const currentValue = SharedUtils.getThirdLinkFieldDisplayValue(['发现迭代', '发现迭代*']);
                log('发现迭代填充失败，当前字段值: ' + (currentValue || '(空)'), 'warn');
            }
        }

        async function handleMCGGCreatorFocus(ticketContext = getTicketContext()) {
            if (state.creatorFilled) return;
            if (!ensureTicketContextActive(ticketContext, 'MCGG 创建人焦点兜底')) return;
            const name = CONFIG.thirdLinkCreatorName;
            log('创建人输入框获得焦点，准备填充: ' + name);
            const success = await SharedUtils.fillDropdownSearch(name, logger, 150, { preferThirdLink: true });
            if (!ensureTicketContextActive(ticketContext, 'MCGG 创建人焦点兜底')) return;
            if (success) {
                state.creatorFilled = true;
                log('创建人填充成功', 'success');
            } else {
                log('创建人填充失败', 'warn');
            }
        }

        async function handleMCGGModuleFocus(ticketContext = getTicketContext()) {
            if (state.moduleFilled) return;
            if (!ensureTicketContextActive(ticketContext, 'MCGG 功能模块焦点兜底')) return;
            log('功能模块输入框获得焦点，准备填充: ' + CONFIG.thirdLinkModuleName);
            const success = await SharedUtils.fillDropdownSearch(CONFIG.thirdLinkModuleName, logger, 100, { preferThirdLink: true });
            if (!ensureTicketContextActive(ticketContext, 'MCGG 功能模块焦点兜底')) return;
            if (success) {
                state.moduleFilled = true;
                log('功能模块填充成功', 'success');
            } else {
                log('功能模块填充失败', 'warn');
            }
        }

        async function autoFillMCGGThirdLinkField(labelTexts = [], value = '', stateKey = '', fieldName = '', options = {}) {
            if (!value) {
                log(fieldName + ' \u7f3a\u5c11\u76ee\u6807\u503c\uff0c\u8df3\u8fc7\u81ea\u52a8\u5904\u7406', 'warn');
                return false;
            }

            if (state[stateKey]) {
                return true;
            }

            const ticketContext = options.ticketContext || null;
            const confirmOptions = { ...options };
            delete confirmOptions.ticketContext;
            const maxAttempts = CONFIG.thirdLinkMaxFillAttempts || 2;
            for (let attempt = 1; attempt <= maxAttempts; attempt++) {
                if (!ensureTicketContextActive(ticketContext, fieldName + ' 自动填充')) {
                    return false;
                }
                const opened = await SharedUtils.openThirdLinkElSelectDropdown(labelTexts, fieldName, (msg) => log(msg));
                if (!ensureTicketContextActive(ticketContext, fieldName + ' 自动填充')) {
                    return false;
                }
                if (!opened) {
                    log(fieldName + ' \u4e0b\u62c9\u6846\u81ea\u52a8\u5c55\u5f00\u5931\u8d25\uff0c\u4fdd\u7559\u7126\u70b9\u76d1\u542c\u515c\u5e95', 'warn');
                } else {
                    const isIterationField = stateKey === 'iterationFilled';
                    const success = await SharedUtils.fillDropdownSearch(value, logger, 150, {
                        preferThirdLink: true,
                        allowSingleCandidateFallback: !isIterationField
                    });
                    if (!ensureTicketContextActive(ticketContext, fieldName + ' 自动填充')) {
                        return false;
                    }
                    const confirmTimeout = isIterationField
                        ? Math.max(CONFIG.thirdLinkConfirmTimeout, 2600)
                        : CONFIG.thirdLinkConfirmTimeout;
                    const applied = await SharedUtils.confirmThirdLinkFieldApplied(labelTexts, value, confirmTimeout, confirmOptions);
                    if (!ensureTicketContextActive(ticketContext, fieldName + ' 自动填充')) {
                        return false;
                    }
                    if (applied) {
                        state[stateKey] = true;
                        if (!success) {
                            log(fieldName + ' 字段值已生效，按成功处理: ' + value, 'success');
                        } else {
                            log(fieldName + ' \u81ea\u52a8\u586b\u5145\u6210\u529f: ' + value, 'success');
                        }
                        return true;
                    }

                    if (attempt < maxAttempts) {
                        if (isIterationField) {
                            const currentValue = SharedUtils.getThirdLinkFieldDisplayValue(labelTexts);
                            log(fieldName + ' 本次尝试后仍未生效，当前字段值: ' + (currentValue || '(空)') + '，准备重试 ' + attempt + '/' + maxAttempts, 'warn');
                        } else {
                            log(fieldName + ' \u672c\u6b21\u5c1d\u8bd5\u540e\u4ecd\u672a\u786e\u8ba4\u751f\u6548\uff0c\u51c6\u5907\u91cd\u8bd5 ' + attempt + '/' + maxAttempts, 'warn');
                        }
                    }
                }

                if (attempt < maxAttempts) {
                    await new Promise(resolve => setTimeout(resolve, CONFIG.thirdLinkStepGap));
                }
            }

            const currentValue = stateKey === 'iterationFilled'
                ? SharedUtils.getThirdLinkFieldDisplayValue(labelTexts)
                : '';
            const failMsg = stateKey === 'iterationFilled'
                ? fieldName + ' \u81ea\u52a8\u586b\u5145\u5931\u8d25\uff0c\u5f53\u524d\u5b57\u6bb5\u503c: ' + (currentValue || '(空)') + '\uff0c\u4fdd\u7559\u7126\u70b9\u76d1\u542c\u515c\u5e95'
                : fieldName + ' \u81ea\u52a8\u586b\u5145\u5931\u8d25\uff0c\u4fdd\u7559\u7126\u70b9\u76d1\u542c\u515c\u5e95';
            log(failMsg, 'warn');
            return false;
        }

        async function processMCGGThirdLinkFields(options = {}) {
            const { skipServerDependentFields = false, ticketContext = getTicketContext() } = options;
            if (!ensureTicketContextActive(ticketContext, 'MCGG 关联第三方自动处理')) {
                return;
            }
            await new Promise(resolve => setTimeout(resolve, 400));
            if (!ensureTicketContextActive(ticketContext, 'MCGG 关联第三方自动处理')) {
                return;
            }
            await autoFillMCGGThirdLinkField(['\u521b\u5efa\u4eba', '\u521b\u5efa\u4eba*'], CONFIG.thirdLinkCreatorName, 'creatorFilled', '\u521b\u5efa\u4eba', {
                allowPartial: false,
                ticketContext
            });
            if (!skipServerDependentFields) {
                await new Promise(resolve => setTimeout(resolve, CONFIG.thirdLinkStepGap));
                if (!ensureTicketContextActive(ticketContext, 'MCGG 关联第三方自动处理')) {
                    return;
                }
                await autoFillMCGGThirdLinkField(['\u53d1\u73b0\u8fed\u4ee3', '\u53d1\u73b0\u8fed\u4ee3*'], state.faxiandiedai, 'iterationFilled', '\u53d1\u73b0\u8fed\u4ee3', {
                    ticketContext
                });
            }
            await new Promise(resolve => setTimeout(resolve, CONFIG.thirdLinkStepGap));

            const desiredModule = CONFIG.thirdLinkModuleName;
            const currentModule = SharedUtils.getThirdLinkFieldDisplayValue(['\u529f\u80fd\u6a21\u5757', '\u529f\u80fd\u6a21\u5757*']);
            const normalizedDesiredModule = SharedUtils.normalizeFieldLabel(desiredModule).toLowerCase();
            const normalizedCurrentModule = SharedUtils.normalizeFieldLabel(currentModule).toLowerCase();
            if (normalizedDesiredModule && normalizedCurrentModule &&
                (normalizedCurrentModule.includes(normalizedDesiredModule) || normalizedDesiredModule.includes(normalizedCurrentModule))) {
                log('\u529f\u80fd\u6a21\u5757\u5df2\u662f\u76ee\u6807\u503c\uff0c\u8df3\u8fc7\u81ea\u52a8\u9009\u62e9: ' + desiredModule + ' (\u5f53\u524d: ' + (currentModule || '\u7a7a') + ')', 'success');
                state.moduleFilled = true;
            } else {
                if (!ensureTicketContextActive(ticketContext, 'MCGG 功能模块自动处理')) {
                    return;
                }
                await autoFillMCGGThirdLinkField(['\u529f\u80fd\u6a21\u5757', '\u529f\u80fd\u6a21\u5757*'], desiredModule, 'moduleFilled', '\u529f\u80fd\u6a21\u5757', {
                    ticketContext
                });
            }
            if (skipServerDependentFields) {
                log('未识别到 ServerID，跳过 MCGG 发现迭代与渠道自动处理', 'warn');
                markChannelDecisionStarted(ticketContext);
                markChannelDecisionResolved(ticketContext);
                return;
            }

            await new Promise(resolve => setTimeout(resolve, CONFIG.thirdLinkStepGap));
            if (!ensureTicketContextActive(ticketContext, 'MCGG 渠道自动处理')) {
                return;
            }
            markChannelDecisionStarted(ticketContext);
            try {
                const desiredCh = state.channelText;
                const currentCh = SharedUtils.getThirdLinkFieldDisplayValue(['\u6e20\u9053', '\u6e20\u9053*']);
                if (desiredCh && SharedUtils.channelDisplayMatchesDesired(currentCh, desiredCh)) {
                    log('\u6e20\u9053\u5df2\u662f\u76ee\u6807\u503c\uff0c\u8df3\u8fc7\u81ea\u52a8\u9009\u62e9: ' + desiredCh + ' (\u5f53\u524d: ' + (currentCh || '\u7a7a') + ')', 'success');
                    state.channelFilled = true;
                } else {
                    await autoFillMCGGThirdLinkField(['\u6e20\u9053', '\u6e20\u9053*'], state.channelText, 'channelFilled', '\u6e20\u9053', {
                        channelMatch: true,
                        ticketContext
                    });
                }
            } finally {
                markChannelDecisionResolved(ticketContext);
            }
        }

        function setupMCGGFocusListener() {
            if (state.focusListenersAttached) return;
            log('设置 MCGG 焦点监听器');

            mcggFocusinHandler = async (e) => {
                const target = e.target;
                if (!target || target.tagName !== 'INPUT') return;

                const titleInput = SharedUtils.findTitleInputRobust();
                const titleValue = titleInput ? titleInput.value || '' : '';
                if (!isMCGGTitle(titleValue, { silent: true })) return;

                const labelText = SharedUtils.findLabelText(target);
                const ticketContext = getTicketContext();
                if (labelText.includes('渠道')) {
                    await handleMCGGChannelFocus(ticketContext);
                } else if (labelText.includes('创建人')) {
                    await handleMCGGCreatorFocus(ticketContext);
                } else if (labelText.includes('发现迭代')) {
                    await handleMCGGIterationFocus(ticketContext);
                } else if (labelText.includes('功能模块')) {
                    await handleMCGGModuleFocus(ticketContext);
                }
            };

            document.addEventListener('focusin', mcggFocusinHandler, true);
            state.focusListenersAttached = true;
            log('MCGG 焦点监听器已设置', 'success');
        }

        function removeMCGGFocusListener() {
            if (mcggFocusinHandler) {
                document.removeEventListener('focusin', mcggFocusinHandler, true);
                mcggFocusinHandler = null;
            }
            state.focusListenersAttached = false;
        }

        async function handleMcggZoneClick(element) {
            const titleInput = SharedUtils.findTitleInputRobust();
            const titleValue = titleInput ? titleInput.value || '' : '';
            if (!isMCGGTitle(titleValue, { silent: true }) && !state.copiedText && !state.leftHeading) {
                log('当前工单不是MCGG类型，请使用普通工单按钮', 'warn');
                return;
            }

            let copyText = state.copiedText || await extractMCGGInternalDescriptionWithRetry();
            if (!copyText) {
                log('无内容可复制', 'warn');
                return;
            }

            SharedUtils.copyText(copyText).then(success => {
                if (!success) {
                    log('复制失败: 剪贴板写入不可用', 'error');
                    return;
                }

                UI.showZoneSuccess('mcgg');
                log('描述已复制到剪贴板', 'success');

                let isExpandedBtn = element && element.tagName === 'BUTTON';
                if (isExpandedBtn) {
                    const originalText = element.textContent;
                    element.textContent = '已复制！';
                    element.classList.add('success');
                    setTimeout(() => {
                        element.textContent = originalText;
                        element.classList.remove('success');
                    }, 1500);
                }
            });
        }

        function initUI() {
            if (!UI) return;
            UI.addButton('复制MCGG工单', 'btn-mcgg', async (btn) => {
                handleMcggZoneClick(btn);
            });
            UI.registerZoneCallback('mcgg', handleMcggZoneClick);
        }

        function monitorTicketChange() {
            setInterval(() => {
                const newTicketID = SharedUtils.getCurrentTicketID();
                if (newTicketID && newTicketID !== state.currentTicketID) {
                    resetState();
                    state.currentTicketID = newTicketID;
                    setTimeout(() => {
                        const titleInput = SharedUtils.findTitleInputRobust();
                        const titleValue = titleInput ? titleInput.value || '' : '';
                        if (isMCGGTitle(titleValue, { silent: true })) {
                            log('检测到MCGG工单切换: ' + newTicketID);
                            logger.success('检测到MCGG工单: ' + newTicketID);
                            processMCGGTicket();
                        }
                    }, 500);
                }
            }, CONFIG.checkInterval);
        }

        function init() {
            log('========================================');
            log('MCGG工单模块 v6.2.9 已启动');
            log('调试模式:', CONFIG.debug);
            log('========================================');
            initUI();
            monitorTicketChange();
            setTimeout(() => {
                const ticketID = SharedUtils.getCurrentTicketID();
                if (ticketID) {
                    state.currentTicketID = ticketID;
                    const titleInput = SharedUtils.findTitleInputRobust();
                    const titleValue = titleInput ? titleInput.value || '' : '';
                    if (isMCGGTitle(titleValue, { silent: true })) {
                        log('检测到MCGG工单:', ticketID);
                        logger.success('检测到MCGG工单: ' + ticketID);
                        processMCGGTicket();
                    }
                }
            }, 1000);
        }

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', init);
        } else {
            init();
        }
    })();

    // =========================================================================
    // 模块 C：Task客服信息提取（完全独立）
    // =========================================================================
    (function() {
        'use strict';

        if (!shouldRunTaskModule()) return;

        const CONFIG = {
            debug: true,
            maxRetries: 12,
            retryInterval: 500
        };

        const logger = UI ? UI.createLogChannel('task') : { log: console.log, error: console.error, warn: console.warn, success: console.log };

        function log(...args) {
            if (CONFIG.debug) {
                const msg = args.join(' ');
                console.log('[Task模块]', ...args);
                logger.log(msg);
            }
        }

        function extractTaskInfo() {
            let extractedUrl = '';
            let agentName = '';
            let agentPrefix = '';

            log('--- 开始提取 Task 信息 ---');

            try {
                const bodyText = document.body.innerText;
                const urlRegex = /[【\[]\s*(https?:\/\/[^】\]\s]+)\s*[】\]]/;
                const urlMatch = bodyText.match(urlRegex);

                if (urlMatch) {
                    extractedUrl = urlMatch[1];
                } else {
                    const anyUrlMatch = bodyText.match(/https?:\/\/[\w\-\.]+\.aihelp\.net\/[^\s【】\[\]]+/);
                    if (anyUrlMatch) extractedUrl = anyUrlMatch[0];
                }

                const creatorXPath = "//*[contains(text(), '工单创建人')]";
                const result = document.evaluate(creatorXPath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
                const creatorNode = result.singleNodeValue;

                if (creatorNode) {
                    const namePattern = /([A-Z]+)-([A-Za-z0-9_]+)/;
                    const checkText = (text) => {
                        if (!text) return null;
                        const m = text.match(namePattern);
                        return m ? { prefix: m[1], name: m[2] } : null;
                    };

                    let res = checkText(creatorNode.innerText) || (creatorNode.parentElement ? checkText(creatorNode.parentElement.innerText) : null);
                    if (!res) {
                        let sib = creatorNode.nextElementSibling;
                        while (sib) {
                            res = checkText(sib.innerText);
                            if (res) break;
                            sib = sib.nextElementSibling;
                        }
                    }
                    if (!res && creatorNode.parentElement) {
                        let parentSib = creatorNode.parentElement.nextElementSibling;
                        while (parentSib) {
                            res = checkText(parentSib.innerText);
                            if (res) break;
                            parentSib = parentSib.nextElementSibling;
                        }
                    }

                    if (res) {
                        agentPrefix = res.prefix;
                        agentName = res.name;
                    }
                }
            } catch (error) {
                console.error('提取失败:', error);
            }

            return { url: extractedUrl, agentName: agentName, agentPrefix: agentPrefix };
        }

        async function retryTaskExtraction(maxRetries = CONFIG.maxRetries, interval = CONFIG.retryInterval) {
            for (let i = 0; i < maxRetries; i++) {
                const result = extractTaskInfo();
                if (result.agentName) return result;
                await new Promise(r => setTimeout(r, interval));
            }
            return extractTaskInfo();
        }

        async function handleTaskZoneClick(element) {
            UI.showZoneProcessing('task', true);

            let isExpandedBtn = element && element.tagName === 'BUTTON';
            let originalText = isExpandedBtn ? element.textContent : '';
            if (isExpandedBtn) {
                element.textContent = '提取中...';
                element.style.opacity = '0.7';
            }

            try {
                const taskInfo = await retryTaskExtraction();
                const finalUrl = taskInfo.url || window.location.href;
                const finalAgentName = taskInfo.agentName;
                const finalPrefix = taskInfo.agentPrefix;

                if (!finalAgentName) {
                    UI.setZoneText('task', '?');
                    if (isExpandedBtn) {
                        element.textContent = '未找到客服信息';
                        element.style.opacity = '1';
                    }
                    setTimeout(() => {
                        UI.resetZoneText('task');
                        UI.showZoneProcessing('task', false);
                        if (isExpandedBtn) {
                            element.textContent = originalText;
                        }
                    }, 1500);
                } else {
                    const copyText = finalUrl + ' @' + finalAgentName;
                    GM_setClipboard(copyText);
                    UI.showZoneSuccess('task');
                    log('Task信息已复制: ' + copyText);
                    UI.setZoneText('task', finalPrefix || 'OK');

                    if (isExpandedBtn) {
                        element.textContent = (finalPrefix || 'OK') + ' 已复制';
                        element.classList.add('success');
                        element.style.opacity = '1';
                    }

                    setTimeout(() => {
                        UI.resetZoneText('task');
                        UI.showZoneProcessing('task', false);
                        if (isExpandedBtn) {
                            element.textContent = originalText;
                            element.classList.remove('success');
                        }
                    }, 1500);
                }
            } catch (e) {
                UI.setZoneText('task', 'X');
                if (isExpandedBtn) {
                    element.textContent = '提取失败';
                    element.style.opacity = '1';
                }
                setTimeout(() => {
                    UI.resetZoneText('task');
                    UI.showZoneProcessing('task', false);
                    if (isExpandedBtn) {
                        element.textContent = originalText;
                    }
                }, 1500);
            }
        }

        function initUI() {
            if (!UI) return;
            UI.addButton('提取客服信息', 'btn-task', (btn) => {
                handleTaskZoneClick(btn);
            });
            UI.registerZoneCallback('task', handleTaskZoneClick);
        }

        function init() {
            log('========================================');
            log('Task模块 v6.2.8 已启动');
            log('调试模式:', CONFIG.debug);
            log('========================================');
            initUI();
        }

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', init);
        } else {
            init();
        }
    })();

    // =========================================================================
    // 模块 D：提交后自动回复 "already submitted"（完全独立）
    // 功能：监听"确定"按钮状态变化，自动点击"内部回复"并填充固定文本
    // =========================================================================
    (function() {
        'use strict';

        // 简单的URL检查：如果URL包含ticket，直接跳过
        const currentUrl = window.location.href;
        if (currentUrl.includes('ticket')) {
            console.log('[自动回复模块] URL包含ticket，跳过模块加载');
            return;
        }

        if (!shouldRunNormalModule()) return;

        const AUTO_REPLY_CONFIG = {
            debug: true,
            replyText: 'already submitted',
            dialogLoadDelay: 1500,
            dialogLoadDelayMax: 2000,
            elementFindTimeout: 5000,
            checkInterval: 500,
            debounceDelay: 300
        };

        const autoReplyState = {
            isProcessing: false,
            confirmButtonObserver: null,
            lastProcessTime: 0,
            currentTicketID: null,
            hasTriggered: false
        };

        const autoReplyLogger = UI ? UI.createLogChannel('autoReply') : {
            log: console.log,
            error: console.error,
            warn: console.warn,
            success: console.log
        };

        function autoReplyLog(...args) {
            if (AUTO_REPLY_CONFIG.debug) {
                const msg = args.join(' ');
                console.log('[自动回复模块]', ...args);
                autoReplyLogger.log(msg);
            }
        }

        function autoReplyLogError(...args) {
            const msg = args.join(' ');
            console.error('[自动回复模块 错误]', ...args);
            autoReplyLogger.error(msg);
        }

        function autoReplyLogSuccess(...args) {
            const msg = args.join(' ');
            console.log('[自动回复模块]', ...args);
            autoReplyLogger.success(msg);
        }

        function autoReplyLogWarn(...args) {
            const msg = args.join(' ');
            console.warn('[自动回复模块 警告]', ...args);
            autoReplyLogger.warn(msg);
        }

        function waitForElement(selector, options = {}) {
            const {
                timeout = AUTO_REPLY_CONFIG.elementFindTimeout,
                condition = null,
                parent = document.body
            } = options;

            return new Promise((resolve) => {
                const startTime = Date.now();

                const check = () => {
                    const elements = parent.querySelectorAll(selector);
                    for (const el of elements) {
                        if (condition ? condition(el) : SharedUtils.isInputAvailable(el)) {
                            resolve(el);
                            return;
                        }
                    }

                    if (Date.now() - startTime < timeout) {
                        setTimeout(check, 100);
                    } else {
                        resolve(null);
                    }
                };

                check();
            });
        }

        function waitForElementWithObserver(selector, options = {}) {
            const {
                timeout = AUTO_REPLY_CONFIG.elementFindTimeout,
                condition = null,
                parent = document.body
            } = options;

            return new Promise((resolve) => {
                const startTime = Date.now();
                let observer = null;
                let timeoutId = null;

                const cleanup = () => {
                    if (observer) {
                        observer.disconnect();
                        observer = null;
                    }
                    if (timeoutId) {
                        clearTimeout(timeoutId);
                        timeoutId = null;
                    }
                };

                const check = () => {
                    const elements = parent.querySelectorAll(selector);
                    for (const el of elements) {
                        if (condition ? condition(el) : SharedUtils.isInputAvailable(el)) {
                            cleanup();
                            resolve(el);
                            return true;
                        }
                    }
                    return false;
                };

                if (check()) return;

                observer = new MutationObserver(() => {
                    if (check()) return;

                    if (Date.now() - startTime >= timeout) {
                        cleanup();
                        resolve(null);
                    }
                });

                observer.observe(parent, {
                    childList: true,
                    subtree: true,
                    attributes: true,
                    attributeFilter: ['style', 'class', 'disabled']
                });

                timeoutId = setTimeout(() => {
                    cleanup();
                    resolve(null);
                }, timeout);
            });
        }

        async function safeClick(element, description = '') {
            if (!element) {
                autoReplyLogWarn(`safeClick: 元素不存在 ${description}`);
                return false;
            }

            try {
                if (element.disabled) {
                    autoReplyLogWarn(`safeClick: 元素已禁用 ${description}`);
                    return false;
                }

                element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                await new Promise(resolve => setTimeout(resolve, 100));

                element.click();
                autoReplyLog(`safeClick: 点击成功 ${description}`);
                return true;
            } catch (e) {
                autoReplyLogError(`safeClick: 点击失败 ${description}`, e.message);
                return false;
            }
        }

        function findInternalReplyButton() {
            const selectors = [
                'button:has(.el-icon-chat-dot-round)',
                'button:has(.el-icon-chat-line-round)',
                'button:has(.el-icon-chat-square)',
                '.internal-reply-btn',
                '[class*="internal-reply"]',
                '[class*="InternalReply"]'
            ];

            for (const selector of selectors) {
                try {
                    const buttons = document.querySelectorAll('button');
                    for (const btn of buttons) {
                        const text = (btn.textContent || '').trim();
                        if (text.includes('内部回复') || text.includes('内部备注')) {
                            return btn;
                        }
                    }
                } catch (e) {
                    continue;
                }
            }

            const allButtons = document.querySelectorAll('button');
            for (const btn of allButtons) {
                const text = (btn.textContent || '').trim();
                if (text.includes('内部回复') || text.includes('内部备注')) {
                    return btn;
                }
            }

            return null;
        }

        function findReplyTextarea(dialog) {
            if (!dialog) return null;

            const selectors = [
                'textarea.el-textarea__inner',
                'textarea[placeholder*="工单回复"]',
                'textarea[placeholder*="回复"]',
                'textarea[placeholder*="内部"]',
                '.ql-editor[contenteditable="true"]',
                'div[contenteditable="true"]',
                'textarea'
            ];

            for (const selector of selectors) {
                const textarea = dialog.querySelector(selector);
                if (textarea && SharedUtils.isInputAvailable(textarea)) {
                    return textarea;
                }
            }

            return null;
        }

        function findReplyDialog() {
            const selectors = [
                '.el-dialog:has(textarea)',
                '.el-dialog:has(.ql-editor)',
                '.el-dialog:has([contenteditable="true"])',
                '.el-dialog__wrapper:has(textarea)',
                '[class*="reply-dialog"]',
                '[class*="ReplyDialog"]'
            ];

            for (const selector of selectors) {
                try {
                    const dialogs = document.querySelectorAll('.el-dialog, .el-dialog__wrapper');
                    for (const dialog of dialogs) {
                        const style = window.getComputedStyle(dialog);
                        if (style.display !== 'none' && style.visibility !== 'hidden') {
                            const textarea = findReplyTextarea(dialog);
                            if (textarea) {
                                return dialog;
                            }
                        }
                    }
                } catch (e) {
                    continue;
                }
            }

            return null;
        }

        async function fillTextarea(textarea, text) {
            if (!textarea) {
                autoReplyLogWarn('fillTextarea: 文本框不存在');
                return false;
            }

            try {
                autoReplyLog('fillTextarea: 元素类型', textarea.tagName, 'nodeName', textarea.nodeName);

                textarea.focus();
                await new Promise(resolve => setTimeout(resolve, 100));

                if (textarea.tagName === 'TEXTAREA' || textarea.tagName === 'INPUT') {
                    const nativeSetter = Object.getOwnPropertyDescriptor(
                        window.HTMLTextAreaElement.prototype || window.HTMLInputElement.prototype,
                        'value'
                    ).set;
                    nativeSetter.call(textarea, text);
                    textarea.dispatchEvent(new Event('input', { bubbles: true }));
                    textarea.dispatchEvent(new Event('change', { bubbles: true }));
                } else if (textarea.tagName === 'BODY' || textarea.contentEditable === 'true') {
                    textarea.innerHTML = '<p>' + text + '</p>';
                    textarea.focus();

                    const inputEvent = new InputEvent('input', {
                        bubbles: true,
                        cancelable: true,
                        data: text,
                        inputType: 'insertText'
                    });
                    textarea.dispatchEvent(inputEvent);

                    const keydownEvent = new KeyboardEvent('keydown', { bubbles: true });
                    textarea.dispatchEvent(keydownEvent);
                    const keyupEvent = new KeyboardEvent('keyup', { bubbles: true });
                    textarea.dispatchEvent(keyupEvent);
                } else {
                    textarea.textContent = text;
                    textarea.dispatchEvent(new Event('input', { bubbles: true }));
                }

                autoReplyLogSuccess(`fillTextarea: 填充成功 "${text}"`);
                return true;
            } catch (e) {
                autoReplyLogError('fillTextarea: 填充失败', e.message);
                return false;
            }
        }

        async function executeAutoReply() {
            if (autoReplyState.isProcessing) {
                autoReplyLog('已在处理中，跳过');
                return;
            }

            const now = Date.now();
            if (now - autoReplyState.lastProcessTime < AUTO_REPLY_CONFIG.debounceDelay) {
                autoReplyLog('防抖间隔内，跳过');
                return;
            }

            autoReplyState.isProcessing = true;
            autoReplyState.lastProcessTime = now;

            autoReplyLog('========== 开始执行自动回复流程 ==========');

            try {
                const delay = AUTO_REPLY_CONFIG.dialogLoadDelay +
                    Math.random() * (AUTO_REPLY_CONFIG.dialogLoadDelayMax - AUTO_REPLY_CONFIG.dialogLoadDelay);

                autoReplyLog(`等待 ${(delay/1000).toFixed(1)} 秒让对话框加载...`);
                await new Promise(resolve => setTimeout(resolve, delay));

                autoReplyLog('查找"内部回复"按钮...');
                const internalReplyBtn = await waitForElementWithObserver('button', {
                    timeout: AUTO_REPLY_CONFIG.elementFindTimeout,
                    condition: (el) => {
                        const text = (el.textContent || '').trim();
                        return text.includes('内部回复') || text.includes('内部备注');
                    }
                });

                if (!internalReplyBtn) {
                    autoReplyLogWarn('未找到"内部回复"按钮，流程终止');
                    autoReplyState.isProcessing = false;
                    return;
                }

                autoReplyLog('找到"内部回复"按钮，准备点击...');
                const clickSuccess = await safeClick(internalReplyBtn, '"内部回复"按钮');

                if (!clickSuccess) {
                    autoReplyLogWarn('点击"内部回复"按钮失败，流程终止');
                    autoReplyState.isProcessing = false;
                    return;
                }

                autoReplyLog('等待回复对话框加载...');
                await new Promise(resolve => setTimeout(resolve, 1500));

                let dialog = null;
                let attempts = 0;
                const maxAttempts = 10;

                while (!dialog && attempts < maxAttempts) {
                    attempts++;
                    const allDialogs = document.querySelectorAll('.el-dialog, .el-dialog__wrapper, [class*="dialog"], [class*="modal"]');

                    for (const d of allDialogs) {
                        const style = window.getComputedStyle(d);
                        if (style.display !== 'none' && style.visibility !== 'hidden') {
                            const text = d.textContent || '';
                            if (text.includes('工单回复') || text.includes('内部回复') || text.includes('内部备注')) {
                                dialog = d;
                                autoReplyLog('找到"内部回复"对话框');
                                break;
                            }
                        }
                    }

                    if (!dialog) {
                        autoReplyLog('第', attempts, '次尝试未找到对话框，等待中...');
                        await new Promise(resolve => setTimeout(resolve, 500));
                    }
                }

                if (!dialog) {
                    autoReplyLogWarn('未找到"内部回复"对话框，流程终止');
                    autoReplyState.isProcessing = false;
                    return;
                }

                autoReplyLog('对话框内容预览:', dialog.textContent.slice(0, 100));

                autoReplyLog('查找工单回复文本框...');

                let textarea = null;
                let textareaAttempts = 0;
                const maxTextareaAttempts = 10;

                while (!textarea && textareaAttempts < maxTextareaAttempts) {
                    textareaAttempts++;
                    autoReplyLog('第', textareaAttempts, '次尝试查找文本框...');

                    await new Promise(resolve => setTimeout(resolve, 300));

                    const iframe = dialog.querySelector('iframe.tox-edit-area__iframe, iframe[class*="edit-area"]');
                    if (iframe) {
                        autoReplyLog('找到TinyMCE iframe，尝试访问内部文档...');
                        try {
                            const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
                            if (iframeDoc && iframeDoc.body) {
                                textarea = iframeDoc.body;
                                autoReplyLog('找到iframe内的body元素');
                                break;
                            }
                        } catch (e) {
                            autoReplyLog('无法访问iframe内容:', e.message);
                        }
                    }

                    if (!textarea) {
                        const allElements = dialog.querySelectorAll('*');
                        for (const el of allElements) {
                            if (el.contentEditable === 'true') {
                                textarea = el;
                                autoReplyLog('找到contentEditable元素:', el.tagName, el.className);
                                break;
                            }
                        }
                    }

                    if (!textarea) {
                        const allElements = dialog.querySelectorAll('*');
                        for (const el of allElements) {
                            if (el.tagName === 'TEXTAREA') {
                                textarea = el;
                                autoReplyLog('找到TEXTAREA元素:', el.className);
                                break;
                            }
                        }
                    }
                }

                if (!textarea) {
                    autoReplyLogWarn('未找到工单回复文本框，流程终止');
                    autoReplyState.isProcessing = false;
                    return;
                }

                autoReplyLog('找到文本框，先点击激活...');
                try {
                    textarea.click();
                    await new Promise(resolve => setTimeout(resolve, 200));
                    textarea.focus();
                    await new Promise(resolve => setTimeout(resolve, 100));
                } catch (e) {
                    autoReplyLog('点击激活失败，继续尝试填充');
                }

                autoReplyLog('准备填充内容...');
                const fillSuccess = await fillTextarea(textarea, AUTO_REPLY_CONFIG.replyText);

                if (fillSuccess) {
                    autoReplyLogSuccess(`文本填充成功: "${AUTO_REPLY_CONFIG.replyText}"`);

                    autoReplyLog('等待1秒后点击回复按钮...');
                    await new Promise(resolve => setTimeout(resolve, 1000));

                    const replyButtons = dialog.querySelectorAll('button');
                    let replyBtn = null;

                    for (const btn of replyButtons) {
                        const btnText = (btn.textContent || '').trim();
                        if (btnText === '回复') {
                            replyBtn = btn;
                            autoReplyLog('找到"回复"按钮');
                            break;
                        }
                    }

                    if (replyBtn) {
                        const btnClickSuccess = await safeClick(replyBtn, '"回复"按钮');
                        if (btnClickSuccess) {
                            autoReplyLogSuccess('========== 自动回复流程完成 ==========');
                        } else {
                            autoReplyLogWarn('点击"回复"按钮失败');
                        }
                    } else {
                        autoReplyLogWarn('未找到"回复"按钮');
                    }
                } else {
                    autoReplyLogWarn('自动回复填充失败');
                }

            } catch (e) {
                autoReplyLogError('自动回复流程异常:', e.message);
            } finally {
                autoReplyState.isProcessing = false;
            }
        }

        function setupConfirmButtonObserver() {
            document.addEventListener('click', function(e) {
                const target = e.target;
                const clickableEl = target.closest('button, .el-button, [role="button"], span.el-button, a, [class*="btn"], span');

                if (clickableEl) {
                    const el = clickableEl;
                    const elText = (el.textContent || el.innerText || '').trim();
                    const normalizedText = elText.replace(/\s+/g, '');

                    if (normalizedText !== '确认' && normalizedText !== '确定') return;

                    // ===================== 批量处理模式检测 =====================
                    // 检测方式：通过检测"已选择"和"选择全部"文本
                    // 这两个文本只有在用户全选工单进行批量处理时才会同时出现
                    const bodyText = document.body.innerText || '';
                    const hasSelectedText = bodyText.includes('已选择');
                    const hasSelectAllText = bodyText.includes('选择全部');

                    if (hasSelectedText && hasSelectAllText) {
                        autoReplyLog('检测到"已选择"和"选择全部"文本，跳过自动回复（批量处理模式）');
                        return;
                    }

                    // ===================== 批量筛选模式检测 =====================
                    // 检测方式：检测是否存在两个名称为"编辑筛选项"但尺寸不同的按钮
                    // 批量筛选模式下会出现两个"编辑筛选项"按钮，一个大一个小
                    const allButtons = document.querySelectorAll('button, span');
                    const editFilterButtons = [];

                    for (const btn of allButtons) {
                        const btnText = (btn.textContent || '').trim();
                        if (btnText === '编辑筛选项') {
                            const rect = btn.getBoundingClientRect();
                            const style = window.getComputedStyle(btn);
                            if (style.display !== 'none' && style.visibility !== 'hidden') {
                                editFilterButtons.push({
                                    element: btn,
                                    width: rect.width,
                                    height: rect.height
                                });
                            }
                        }
                    }

                    // 如果找到两个"编辑筛选项"按钮，检查它们的尺寸是否不同
                    if (editFilterButtons.length >= 2) {
                        const btn1 = editFilterButtons[0];
                        const btn2 = editFilterButtons[1];
                        // 比较尺寸差异（宽度和高度至少有一个不同）
                        const hasSizeDifference =
                            Math.abs(btn1.width - btn2.width) > 2 ||
                            Math.abs(btn1.height - btn2.height) > 2;

                        if (hasSizeDifference) {
                            autoReplyLog('检测到两个尺寸不同的"编辑筛选项"按钮，跳过自动回复（批量筛选模式）');
                            return;
                        }
                    }

                    autoReplyLog('检测到"确认"按钮点击, 文本:', elText);

                    const ticketID = SharedUtils.getCurrentTicketID();
                    if (!ticketID) {
                        autoReplyLog('未检测到当前工单ID，跳过（可能是批量处理场景）');
                        return;
                    }

                    let foundInternalReply = false;
                    document.querySelectorAll('button').forEach(btn => {
                        const text = (btn.textContent || '').trim();
                        if (text.includes('内部回复') || text.includes('内部备注')) {
                            foundInternalReply = true;
                        }
                    });
                    if (!foundInternalReply) {
                        autoReplyLog('页面上没有"内部回复"按钮，跳过（可能是批量处理场景）');
                        return;
                    }

                    if (autoReplyState.hasTriggered) {
                        autoReplyLog('当前工单已触发过，跳过');
                        return;
                    }

                    autoReplyState.hasTriggered = true;

                    setTimeout(() => {
                        executeAutoReply();
                    }, 500);
                }
            }, true);

            autoReplyLog('已设置全局点击监听器（事件委托模式）');
        }

        function monitorTicketChangeForAutoReply() {
            setInterval(() => {
                const newTicketID = SharedUtils.getCurrentTicketID();
                if (newTicketID && newTicketID !== autoReplyState.currentTicketID) {
                    autoReplyLog('工单切换: ' + (autoReplyState.currentTicketID || '(无)') + ' -> ' + newTicketID);
                    autoReplyState.currentTicketID = newTicketID;
                    autoReplyState.hasTriggered = false;
                    autoReplyState.isProcessing = false;
                }
            }, AUTO_REPLY_CONFIG.checkInterval);
        }

        function initAutoReplyModule() {
            autoReplyLog('========================================');
            autoReplyLog('自动回复模块 v6.3.1 已启动');
            autoReplyLog('调试模式:', AUTO_REPLY_CONFIG.debug);
            autoReplyLog('回复文本:', AUTO_REPLY_CONFIG.replyText);
            autoReplyLog('========================================');

            setupConfirmButtonObserver();
            monitorTicketChangeForAutoReply();

            const ticketID = SharedUtils.getCurrentTicketID();
            if (ticketID) {
                autoReplyState.currentTicketID = ticketID;
                autoReplyLog('检测到工单:', ticketID);
            }
        }

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', initAutoReplyModule);
        } else {
            initAutoReplyModule();
        }
    })();

    // =========================================================================
    // 模块 E-AIHelp端：飞书 Ticket ID 搜索触发器（完全独立）
    //
    // 需求来源：提示词总结和skills2026-2-13\通用提示词模版.md
    // 功能：
    //   - 每次工单ID变化时，从工单内部描述中提取 Ticket ID 值
    //     （匹配格式：Ticket ID= XXXXXX 或 Ticket ID : XXXXXX 等常见写法）
    //   - 将 Ticket ID 写入 GM_setValue，开后台标签页让飞书端模块执行搜索
    //   - 轮询 GM_getValue 获取飞书端的搜索结果，更新日志面板
    //   - 若找到结果：日志面板红色显示；若未找到：普通样式提示
    //   - 若用户未登录飞书：日志面板提示用户登录
    // =========================================================================
    (function() {
        'use strict';

        // 仅在 AIHelp 页面运行（非飞书页面）
        const currentUrl = window.location.href;
        if (currentUrl.includes('feishu.cn')) return;
        if (currentUrl.includes('ticket')) return;
        if (!shouldRunNormalModule()) return;

        // ---- 配置区 ----
        const FEISHU_SEARCH_CONFIG = {
            debug: true,
            // 飞书项目目标页面 URL
            feishuTargetUrl: 'https://project.feishu.cn/ml/workObjectView/onlineissue/Cot68m5vg?scope=workspaces&node=28514456',
            // Ticket ID 提取正则
            // 匹配 "Ticket ID= Y372U8" / "Ticket ID : Y372U8" / "Ticket ID=Y372U8" 等格式
            ticketIdPattern: /Ticket\s*ID\s*[=:：]\s*([A-Za-z0-9_\-]+)/i,
            // 轮询结果的间隔（毫秒）
            pollInterval: 500,
            // 轮询最大等待时间（毫秒），飞书重型应用页面加载慢，留足够时间
            pollMaxWait: 90000,
            // GM_setValue 存储键名（带唯一前缀，避免冲突）
            storageKeyPending: 'feishu_ticket_search_pending_v1',   // AIHelp端写入：待搜索的 Ticket ID
            storageKeyResult: 'feishu_ticket_search_result_v1',      // 飞书端写入：搜索结果
            storageKeyResultTs: 'feishu_ticket_search_result_ts_v1', // 结果时间戳，防止读取旧结果
            storageKeyHeartbeat: 'feishu_ticket_search_heartbeat_v1', // ?????????????????
            heartbeatFreshMs: 20000,
            targetPageSeenGraceMs: 1800000,
            openLockFreshMs: 45000,
            checkInterval: 500
        };

        // ---- 状态区 ----
        const feishuSearchState = {
            currentTicketID: null,      // 当前 AIHelp 工单 ID
            lastExtractedId: null,      // 上次提取的 Ticket ID（避免重复搜索）
            pollTimer: null,            // 轮询定时器
            pollStartTime: 0,           // 轮询开始时间
            feishuTabRef: null          // 后台标签页引用
        };

        // ---- 日志通道 ----
        // 注意：此模块的日志使用独立标签 'feishu'
        const feishuLogger = UI ? UI.createLogChannel('feishu') : {
            log: console.log,
            error: console.error,
            warn: console.warn,
            success: console.log
        };

        // 注册飞书模块日志样式（蓝绿色标识，区别其他模块）
        if (UI && UI.logContainer) {
            // 通过 GM_addStyle 补充 feishu 模块标签颜色
            GM_addStyle('.ai-log-module-feishu { color: #13c2c2; font-weight: 600; }');
        }

        function feishuLog(...args) {
            if (FEISHU_SEARCH_CONFIG.debug) {
                const msg = args.join(' ');
                console.log('[飞书搜索]', ...args);
                feishuLogger.log(msg);
            }
        }

        function feishuLogError(...args) {
            const msg = args.join(' ');
            console.error('[飞书搜索 错误]', ...args);
            feishuLogger.error(msg);
        }

        function feishuSearchFmtReq(searchRequestId, message) {
            if (!searchRequestId) return message;
            return '[' + searchRequestId + '] ' + message;
        }

        function clearFeishuPendingRequest() {
            try {
                GM_deleteValue(FEISHU_SEARCH_CONFIG.storageKeyPending);
            } catch (e) {
                feishuLogError('清理飞书待搜索任务失败:', e.message);
            }
        }

        function getFeishuOpenLock() {
            try {
                return GM_getValue('feishu_ticket_search_open_lock_v1', null);
            } catch (e) {
                feishuLogError('读取飞书目标页打开锁失败:', e.message);
                return null;
            }
        }

        function setFeishuOpenLock(data) {
            try {
                GM_setValue('feishu_ticket_search_open_lock_v1', data);
            } catch (e) {
                feishuLogError('写入飞书目标页打开锁失败:', e.message);
            }
        }

        function clearFeishuOpenLock() {
            try {
                GM_deleteValue('feishu_ticket_search_open_lock_v1');
            } catch (e) {
                feishuLogError('清理飞书目标页打开锁失败:', e.message);
            }
        }

        function hasFreshFeishuOpenLock() {
            const lockData = getFeishuOpenLock();
            if (!lockData || typeof lockData.ts !== 'number') return false;
            return (Date.now() - lockData.ts) < FEISHU_SEARCH_CONFIG.openLockFreshMs;
        }

        function isFeishuTargetPageAlive() {
            try {
                const heartbeat = GM_getValue(FEISHU_SEARCH_CONFIG.storageKeyHeartbeat, 0);
                return typeof heartbeat === 'number' && heartbeat > 0 &&
                    (Date.now() - heartbeat) < FEISHU_SEARCH_CONFIG.heartbeatFreshMs;
            } catch (e) {
                feishuLogError('???????????:', e.message);
                return false;
            }
        }

        function isFeishuTargetPageRecentlySeen() {
            try {
                const heartbeat = GM_getValue(FEISHU_SEARCH_CONFIG.storageKeyHeartbeat, 0);
                return typeof heartbeat === 'number' && heartbeat > 0 &&
                    (Date.now() - heartbeat) < FEISHU_SEARCH_CONFIG.targetPageSeenGraceMs;
            } catch (e) {
                feishuLogError('读取飞书目标页最近活动时间失败:', e.message);
                return false;
            }
        }

        function openFeishuTargetPageInBackground(searchRequestId) {
            const reqPrefix = feishuSearchFmtReq(searchRequestId, '');
            if (typeof GM_openInTab === 'function') {
                try {
                    feishuSearchState.feishuTabRef = GM_openInTab(FEISHU_SEARCH_CONFIG.feishuTargetUrl, {
                        active: false,
                        insert: true,
                        setParent: true
                    });
                    feishuLog(reqPrefix + '已通过 GM_openInTab 在后台拉起飞书目标页');
                    return true;
                } catch (e) {
                    feishuLogError(reqPrefix + 'GM_openInTab 后台打开失败: ' + e.message);
                }
            }

            feishuSearchState.feishuTabRef = window.open(
                FEISHU_SEARCH_CONFIG.feishuTargetUrl,
                'feishu_ticket_search_tab'
            );
            feishuLog(reqPrefix + 'GM_openInTab 不可用，已退回 window.open 唤起目标页');
            return true;
        }

        /**
         * 从工单内部描述文本中提取 Ticket ID 值
         * 需求：匹配 "Ticket ID= Y372U8" 格式，提取 "Y372U8"
         * 防御性处理：内部描述可能未加载，返回 null 代表未找到
         * @returns {string|null}
         */
        function extractTicketId() {
            // 从页面文本直接搜索，覆盖内部描述、其他字段
            const bodyText = document.body.innerText || '';
            const match = bodyText.match(FEISHU_SEARCH_CONFIG.ticketIdPattern);
            if (match && match[1]) {
                const id = match[1].trim();
                feishuLog('提取到 Ticket ID:', id);
                return id;
            }
            feishuLog('未在页面文本中找到 Ticket ID');
            return null;
        }

        /**
         * 显示搜索结果到日志面板
         * 需求：找到结果用红色显示，未找到用普通样式
         * @param {string} ticketId - 搜索的 Ticket ID
         * @param {string} status - 'found' | 'notfound' | 'not_logged_in' | 'error' | 'searching'
         * @param {string} [detail] - 额外说明
         */
        function showSearchResultInLog(ticketId, status, detail) {
            if (!UI) return;

            const container = document.createElement('div');
            container.style.cssText = 'margin-top: 4px; padding: 6px 8px; border-radius: 5px; font-size: 11px; line-height: 1.6;';

            if (status === 'found') {
                // 需求：找到结果用红色显示
                container.style.cssText += 'background: #fff1f0; border: 1px solid #ffccc7; color: #cf1322;';
                container.innerHTML = `<strong style="color:#cf1322;">🔴 在飞书项目中搜索到 Ticket ID：${ticketId}</strong>`;
            } else if (status === 'notfound') {
                container.style.cssText += 'background: #f6ffed; border: 1px solid #b7eb8f; color: #389e0d;';
                container.innerHTML = `✅ 未在飞书项目中搜到 Ticket ID：<strong>${ticketId}</strong>`;
            } else if (status === 'not_logged_in') {
                container.style.cssText += 'background: #fffbe6; border: 1px solid #ffe58f; color: #d46b08;';
                container.innerHTML = `⚠️ 飞书未登录，请先<a href="${FEISHU_SEARCH_CONFIG.feishuTargetUrl}" target="_blank" style="color:#d46b08;text-decoration:underline;">登录飞书</a>后重试。<span style="display:block;margin-top:4px;color:#8c8c8c;font-size:10px;">若已在后台打开目标项目页，请切换到该标签页待页面加载完成；误报时可忽略本提示。</span>`;
            } else if (status === 'searching') {
                container.style.cssText += 'background: #e6f4ff; border: 1px solid #91caff; color: #0958d9;';
                container.textContent = `🔍 正在飞书项目中搜索 Ticket ID：${ticketId}...`;
            } else if (status === 'error') {
                container.style.cssText += 'background: #fff2f0; border: 1px solid #ffb3a7; color: #a8071a;';
                container.textContent = `❌ 飞书搜索出错：${detail || '未知错误'}`;
            } else {
                container.textContent = detail || '';
            }

            // 使用日志通道的 custom 方法（支持 HTMLElement）
            if (feishuLogger.custom) {
                feishuLogger.custom(container);
            } else {
                feishuLogger.log(container.textContent);
            }
        }

        /**
         * 停止当前的结果轮询
         */
        function stopPollResult() {
            if (feishuSearchState.pollTimer) {
                clearInterval(feishuSearchState.pollTimer);
                feishuSearchState.pollTimer = null;
            }
        }

        /**
         * 开始轮询 GM_getValue 等待飞书端的搜索结果
         * @param {string} ticketId - 正在搜索的 Ticket ID
         * @param {number} requestTs - 本次搜索请求的时间戳（用于过滤旧结果）
         */
        function startPollResult(ticketId, requestTs, searchRequestId) {
            stopPollResult();
            feishuSearchState.pollStartTime = Date.now();

            feishuLog(feishuSearchFmtReq(searchRequestId, '开始轮询飞书搜索结果，Ticket ID: ' + ticketId + ' | reqTs: ' + requestTs));

            feishuSearchState.pollTimer = setInterval(() => {
                try {
                    const resultTs = GM_getValue(FEISHU_SEARCH_CONFIG.storageKeyResultTs, 0);
                    // 只接受本次请求之后写入的结果，防止读到上次的旧结果
                    if (resultTs < requestTs) {
                        // 检查是否超时
                        if (Date.now() - feishuSearchState.pollStartTime > FEISHU_SEARCH_CONFIG.pollMaxWait) {
                            stopPollResult();
                            clearFeishuOpenLock();
                            feishuLogError(feishuSearchFmtReq(searchRequestId, '等待飞书搜索结果超时（' + (FEISHU_SEARCH_CONFIG.pollMaxWait / 1000) + '秒）'));
                            showSearchResultInLog(ticketId, 'error', '等待超时，请检查飞书标签页是否正常加载');
                        }
                        return;
                    }

                    // 有新结果
                    stopPollResult();
                    const result = GM_getValue(FEISHU_SEARCH_CONFIG.storageKeyResult, null);
                    clearFeishuPendingRequest();
                    clearFeishuOpenLock();
                    feishuLog(feishuSearchFmtReq(searchRequestId, '收到飞书搜索结果: ' + JSON.stringify(result)));

                    if (!result) {
                        showSearchResultInLog(ticketId, 'error', '结果数据为空');
                        return;
                    }

                    if (result.status === 'found') {
                        showSearchResultInLog(ticketId, 'found');
                    } else if (result.status === 'notfound') {
                        showSearchResultInLog(ticketId, 'notfound');
                    } else if (result.status === 'not_logged_in') {
                        showSearchResultInLog(ticketId, 'not_logged_in');
                    } else {
                        showSearchResultInLog(ticketId, 'error', result.detail || '未知状态');
                    }
                } catch (e) {
                    stopPollResult();
                    feishuLogError(feishuSearchFmtReq(searchRequestId, '轮询结果异常: ' + e.message));
                }
            }, FEISHU_SEARCH_CONFIG.pollInterval);
        }

        /**
         * 触发飞书搜索：写入待搜索 Ticket ID，打开后台标签页
         * 需求：飞书页面在后台显示，不打扰当前页面操作
         * @param {string} ticketId - 要搜索的 Ticket ID
         */
        function triggerFeishuSearch(ticketId) {
            if (!ticketId) return;

            if (feishuSearchState.pollTimer && ticketId === feishuSearchState.lastExtractedId) {
                feishuLog('相同 Ticket ID 已在搜索中，跳过重复触发:', ticketId);
                return;
            }

            const requestTs = Date.now();
            const searchRequestId = 'fs_' + requestTs + '_' + Math.random().toString(36).slice(2, 10);

            feishuLog(feishuSearchFmtReq(searchRequestId, '触发飞书搜索，Ticket ID: ' + ticketId + ' | reqTs: ' + requestTs));

            // 1. 写入待搜索的 Ticket ID、时间戳与请求 ID（与飞书端控制台日志对照）
            GM_setValue(FEISHU_SEARCH_CONFIG.storageKeyPending, {
                ticketId: ticketId,
                requestTs: requestTs,
                searchRequestId: searchRequestId
            });

            // 2. 显示"正在搜索"状态
            showSearchResultInLog(ticketId, 'searching');

            // 3. 优先复用已有目标页，只有心跳超时才尝试拉起目标页
            try {
                if (isFeishuTargetPageAlive()) {
                    feishuLog(feishuSearchFmtReq(searchRequestId, '飞书目标页心跳有效，复用现有页'));
                } else if (isFeishuTargetPageRecentlySeen()) {
                    feishuLog(feishuSearchFmtReq(searchRequestId, '飞书目标页近期活跃，先不重复打开'));
                } else if (hasFreshFeishuOpenLock()) {
                    feishuLog(feishuSearchFmtReq(searchRequestId, '飞书目标页正在拉起，复用本次动作'));
                } else {
                    setFeishuOpenLock({ ts: requestTs, ticketId, searchRequestId });
                    openFeishuTargetPageInBackground(searchRequestId);
                    feishuLog(feishuSearchFmtReq(searchRequestId, '已尝试在后台唤起飞书目标页'));
                }
            } catch (e) {
                clearFeishuOpenLock();
                feishuLogError(feishuSearchFmtReq(searchRequestId, '打开飞书标签页失败: ' + e.message));
                showSearchResultInLog(ticketId, 'error', '无法打开飞书页面：' + e.message);
                return;
            }

            // 4. 开始轮询等待结果
            startPollResult(ticketId, requestTs, searchRequestId);
        }

        /**
         * 监控工单ID变化，触发 Ticket ID 提取与飞书搜索
         * 与现有模块的工单监控独立运行，互不干扰
         */
        function monitorTicketForFeishuSearch() {
            setInterval(() => {
                try {
                    const newTicketID = SharedUtils.getCurrentTicketID();
                    if (!newTicketID || newTicketID === feishuSearchState.currentTicketID) return;

                    feishuLog('工单切换: ' + (feishuSearchState.currentTicketID || '(无)') + ' -> ' + newTicketID);
                    feishuSearchState.currentTicketID = newTicketID;

                    // 停止上一次的轮询
                    stopPollResult();
                    feishuSearchState.lastExtractedId = null;

                    // 延迟提取（等待内部描述内容加载完毕，参考现有模块延迟策略）
                    setTimeout(() => {
                        const ticketId = extractTicketId();
                        if (!ticketId) {
                            feishuLog('工单 ' + newTicketID + ' 中未找到 Ticket ID，跳过飞书搜索');
                            return;
                        }

                        if (ticketId === feishuSearchState.lastExtractedId) {
                            feishuLog('Ticket ID 未变化，跳过重复搜索:', ticketId);
                            return;
                        }

                        feishuSearchState.lastExtractedId = ticketId;
                        triggerFeishuSearch(ticketId);
                    }, 2000); // 等待 2 秒让内部描述加载完毕
                } catch (e) {
                    feishuLogError('工单监控异常:', e.message);
                }
            }, FEISHU_SEARCH_CONFIG.checkInterval);
        }

        function initFeishuSearchAIHelpModule() {
            feishuLog('========================================');
            feishuLog('飞书 Ticket ID 搜索模块（AIHelp端）v6.6.0 已启动');
            feishuLog('目标飞书页面:', FEISHU_SEARCH_CONFIG.feishuTargetUrl);
            feishuLog('========================================');

            monitorTicketForFeishuSearch();

            // 初始检查：如果当前已有工单，立即尝试提取
            setTimeout(() => {
                const ticketID = SharedUtils.getCurrentTicketID();
                if (ticketID) {
                    feishuSearchState.currentTicketID = ticketID;
                    const ticketId = extractTicketId();
                    if (ticketId) {
                        feishuSearchState.lastExtractedId = ticketId;
                        triggerFeishuSearch(ticketId);
                    }
                }
            }, 1500);
        }

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', initFeishuSearchAIHelpModule);
        } else {
            initFeishuSearchAIHelpModule();
        }
    })();

    // =========================================================================
    // 模块 F-AIHelp端：清除头像冷却时间（在 AIHelp 工单页面运行）
    //
    // 功能：
    //   - 在主脚本状态栏图标新增"清"区域，点击后提取 UID 和 ServerID
    //   - 自动以弹窗方式打开 GM 工具页面执行清除操作
    //   - 通过 GM_setValue 跨域存储传递任务数据给 GM 工具端
    //   - 轮询 GM_getValue 获取 GM 工具端的执行日志并同步到主面板
    //   - 展开面板中添加"清除头像"快捷按钮
    // 耦合性：完全独立的 IIFE，崩溃不影响其他模块
    // =========================================================================
    (function() {
        'use strict';

        // 仅在工单页面运行
        if (!currentUrl.includes('ml-panel.aihelp.net')) return;

        console.log('[模块F-AIHelp] 清除头像模块初始化...');

        // ==================== 配置区 ====================
        const CLEAR_AVATAR_CONFIG = {
            // GM 工具页面地址
            GM_TOOL_URL: 'https://gm.moba.youngjoygame.com:8090/#/customer/banTool',

            // 存储键名前缀（避免与其他模块冲突）
            STORAGE_PREFIX: 'clear_avatar_',

            // 调试模式
            DEBUG: true,

            // 最大日志行数
            MAX_LOG_LINES: 100
        };

        // ==================== 存储键名 ====================
        const CA_STORAGE_KEYS = {
            // 待处理的清除任务数据（传递给 GM 工具端）
            PENDING_TASK: CLEAR_AVATAR_CONFIG.STORAGE_PREFIX + 'pending_task',

            // 弹窗模式标记（用于 GM 工具端执行完成后关闭弹窗）
            POPUP_MODE: CLEAR_AVATAR_CONFIG.STORAGE_PREFIX + 'popup_mode',

            // 跨域日志数据（GM 工具页面写入，AIHelp 端轮询读取）
            LOG_DATA: CLEAR_AVATAR_CONFIG.STORAGE_PREFIX + 'log_data'
        };

        // ==================== 日志工具 ====================
        // 复用主脚本 UI 的日志通道
        const caLogger = UI ? UI.createLogChannel('clear') : {
            log: (msg) => console.log('[清除头像]', msg),
            error: (msg) => console.error('[清除头像]', msg),
            warn: (msg) => console.warn('[清除头像]', msg),
            success: (msg) => console.log('[清除头像] ✓', msg)
        };

        function caLog(msg) {
            if (!CLEAR_AVATAR_CONFIG.DEBUG) return;
            console.log('[模块F-AIHelp]', msg);
            caLogger.log(msg);
        }

        function caLogError(msg) {
            console.error('[模块F-AIHelp]', msg);
            caLogger.error(msg);
        }

        function caLogSuccess(msg) {
            if (!CLEAR_AVATAR_CONFIG.DEBUG) return;
            console.log('[模块F-AIHelp] ✓', msg);
            caLogger.success(msg);
        }

        // ==================== 信息提取 ====================

        /**
         * 从工单页面提取账号信息（UID 和 ServerID）
         * 从页面内部描述区域提取，格式如 "UID = 1186053970"、"ServerID = 13814"
         * @returns {{uid: string, serverId: string}|null}
         */
        function extractClearAvatarInfo() {
            caLog('开始提取账号信息...');
            const bodyText = document.body.innerText;

            const uidMatch = bodyText.match(/UID\s*=\s*(\d+)/i);
            const serverIdMatch = bodyText.match(/ServerID\s*=\s*(\d{4,5})/i);

            if (!uidMatch || !serverIdMatch) {
                caLogError('未找到UID或ServerID，请确认已打开工单详情');
                return null;
            }

            const uid = uidMatch[1];
            const serverId = serverIdMatch[1];
            caLogSuccess('提取成功 - UID: ' + uid + ', ServerID: ' + serverId);
            return { uid, serverId };
        }

        // ==================== 跨域数据操作 ====================

        /**
         * 保存数据到 GM 存储（支持跨域读取）
         */
        function caSaveGM(key, data) {
            try {
                GM_setValue(key, JSON.stringify(data));
            } catch (e) {
                caLogError('GM存储写入失败: ' + e.message);
            }
        }

        /**
         * 从 GM 存储读取数据
         */
        function caLoadGM(key, defaultVal = null) {
            try {
                const raw = GM_getValue(key, null);
                if (raw !== null && raw !== undefined) {
                    return typeof raw === 'string' ? JSON.parse(raw) : raw;
                }
            } catch (e) {
                caLogError('GM存储读取失败: ' + e.message);
            }
            return defaultVal;
        }

        /**
         * 删除 GM 存储中的数据
         */
        function caDeleteGM(key) {
            try {
                GM_deleteValue(key);
            } catch (e) {
                caLogError('GM存储删除失败: ' + e.message);
            }
        }

        // ==================== 清除头像主逻辑 ====================

        /**
         * 执行清除头像操作
         * 提取账号信息 → 保存到 GM 存储 → 打开 GM 工具弹窗
         * @param {Element} zoneElement - 被点击的图标区域元素（可选）
         */
        async function doClearAvatar(zoneElement) {
            caLog('开始清除头像流程...');

            // 显示处理中状态
            if (UI) {
                UI.showZoneProcessing('clear', true);
                UI.setZoneText('clear', '...');
            }

            try {
                // 1. 重置跨域日志时间戳（确保只显示本次操作的日志）
                if (UI) {
                    UI.resetClearAvatarLogTimestamp();
                    // 清除旧的跨域日志数据
                    caDeleteGM(CA_STORAGE_KEYS.LOG_DATA);
                }

                // 2. 提取账号信息
                const accountInfo = extractClearAvatarInfo();
                if (!accountInfo) {
                    if (UI) {
                        UI.showZoneProcessing('clear', false);
                        UI.resetZoneText('clear');
                    }
                    return;
                }

                // 3. 保存任务数据到 GM 跨域存储
                caSaveGM(CA_STORAGE_KEYS.PENDING_TASK, accountInfo);
                caSaveGM(CA_STORAGE_KEYS.POPUP_MODE, true);
                caLog('任务数据已保存，准备打开GM工具弹窗...');

                // 4. 显示成功状态，恢复图标文字
                if (UI) {
                    UI.showZoneSuccess('clear');
                    UI.showZoneProcessing('clear', false);
                    UI.resetZoneText('clear');
                }

                // 5. 以最大化弹窗方式打开 GM 工具页面
                const popupWidth = window.screen.availWidth;
                const popupHeight = window.screen.availHeight;
                const popupFeatures = [
                    'width=' + popupWidth,
                    'height=' + popupHeight,
                    'left=0',
                    'top=0',
                    'resizable=yes',
                    'scrollbars=yes',
                    'status=yes',
                    'menubar=no',
                    'toolbar=no',
                    'location=yes'
                ].join(',');

                const popupWindow = window.open(CLEAR_AVATAR_CONFIG.GM_TOOL_URL, 'GM_Tool_ClearAvatar', popupFeatures);

                if (popupWindow) {
                    caLogSuccess('GM工具弹窗已打开，等待执行结果...');
                    // 启动跨域日志轮询，实时同步GM工具执行日志到主面板
                    if (UI) {
                        UI.startClearAvatarLogPolling(CA_STORAGE_KEYS.LOG_DATA);
                    }
                } else {
                    caLogError('弹窗被浏览器拦截，请允许弹窗或手动打开GM工具页面');
                    // 清除弹窗模式标记（因为弹窗未打开，GM端不会自动关闭）
                    caDeleteGM(CA_STORAGE_KEYS.POPUP_MODE);
                }

            } catch (e) {
                caLogError('清除头像流程异常: ' + e.message);
                console.error('[模块F-AIHelp] 详细错误:', e);
                if (UI) {
                    UI.showZoneProcessing('clear', false);
                    UI.resetZoneText('clear');
                }
            }
        }

        // ==================== 初始化 ====================

        /**
         * 初始化模块F-AIHelp端
         * 注册"清"图标区域的点击回调，在展开面板中添加按钮
         */
        function initClearAvatarAIHelpModule() {
            if (!UI) {
                caLogError('UI未初始化，模块F跳过');
                return;
            }

            // 注册"清"图标区域点击回调
            UI.registerZoneCallback('clear', (el) => {
                doClearAvatar(el);
            });

            // 在展开面板中添加"清除头像"快捷按钮
            UI.addButton('清除头像', 'btn-clear', (btn) => {
                doClearAvatar(null);
            });

            caLogSuccess('模块F-AIHelp端初始化完成');
        }

        // 延迟初始化（等待UI就绪）
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => setTimeout(initClearAvatarAIHelpModule, 500));
        } else {
            setTimeout(initClearAvatarAIHelpModule, 500);
        }

    })();

    // =========================================================================
    // 模块 G-AIHelp端：内部回复（在 AIHelp 工单页面运行）
    //
    // 功能：
    //   - 在主脚本状态栏图标新增"内"区域
    //   - 展开面板中添加"内部回复"快捷按钮
    //   - 无内部回复对话框时：模拟点击工具栏「内部回复」
    //   - 已有内部回复对话框时：模拟点击对话框底部「回复」
    // =========================================================================
    (function() {
        'use strict';

        // 仅在工单页面运行
        if (!currentUrl.includes('ml-panel.aihelp.net')) return;

        console.log('[模块G-AIHelp] 内部回复模块初始化...');

        // 复用主脚本 UI 的日志通道
        const replyLogger = UI ? UI.createLogChannel('reply') : {
            log: (msg) => console.log('[内部回复]', msg),
            error: (msg) => console.error('[内部回复]', msg),
            warn: (msg) => console.warn('[内部回复]', msg),
            success: (msg) => console.log('[内部回复] ✓', msg)
        };

        function replyLog(msg) {
            replyLogger.log(msg);
        }

        function replyLogError(msg) {
            replyLogger.error(msg);
        }

        function replyLogWarn(msg) {
            replyLogger.warn(msg);
        }

        function findInternalReplyDialogRoot() {
            const headers = document.querySelectorAll('.cusHeader');
            for (const h of headers) {
                const t = (h.textContent || '').replace(/\s+/g, '').trim();
                if (t !== '内部回复') continue;
                if (h.offsetParent === null) continue;
                const dlg = h.closest('.el-dialog');
                if (dlg && dlg.offsetParent !== null) {
                    return dlg;
                }
            }
            return null;
        }

        function findDialogFooterReplyButton(dialog) {
            if (!dialog) return null;
            const footer = dialog.querySelector('.el-dialog__footer');
            const scope = footer || dialog;
            const buttons = scope.querySelectorAll('button');
            for (const btn of buttons) {
                const norm = (btn.textContent || '').replace(/\s+/g, '').trim();
                if (norm === '回复') {
                    return btn;
                }
            }
            for (const btn of buttons) {
                const norm = (btn.textContent || '').replace(/\s+/g, '').trim();
                if (norm.includes('回复') && !norm.includes('内部回复')) {
                    return btn;
                }
            }
            return null;
        }

        /**
         * 无对话框时点击工具栏「内部回复」；已有「内部回复」对话框时点击底部「回复」
         */
        function doInternalReply(zoneElement) {
            if (UI) {
                UI.showZoneProcessing('reply', true);
                UI.setZoneText('reply', '...');
            }

            try {
                const dialog = findInternalReplyDialogRoot();
                if (dialog) {
                    replyLog('检测到「内部回复」对话框已打开，准备点击「回复」...');
                    const replyBtn = findDialogFooterReplyButton(dialog);
                    if (!replyBtn) {
                        replyLogWarn('对话框内未找到「回复」按钮');
                        if (UI) {
                            UI.showZoneProcessing('reply', false);
                            UI.resetZoneText('reply');
                        }
                        return;
                    }
                    if (replyBtn.disabled) {
                        replyLogWarn('「回复」按钮当前为禁用状态（需先填写工单回复等内容后才会生效）');
                    }
                    replyBtn.click();
                    replyLog('已成功点击「回复」按钮');
                    if (UI) {
                        UI.showZoneSuccess('reply');
                        UI.showZoneProcessing('reply', false);
                        UI.resetZoneText('reply');
                    }
                    return;
                }

                replyLog('准备点击工具栏「内部回复」...');
                const buttons = Array.from(document.querySelectorAll('button'));
                const targetBtn = buttons.find(el => {
                    const text = (el.textContent || '').trim();
                    return text.includes('内部回复') || text.includes('内部备注');
                });

                if (targetBtn) {
                    if (targetBtn.disabled) {
                        replyLogWarn('"内部回复"按钮已被禁用');
                        if (UI) {
                            UI.showZoneProcessing('reply', false);
                            UI.resetZoneText('reply');
                        }
                        return;
                    }
                    targetBtn.click();
                    replyLog('已成功点击"内部回复"按钮');

                    if (UI) {
                        UI.showZoneSuccess('reply');
                        UI.showZoneProcessing('reply', false);
                        UI.resetZoneText('reply');
                    }
                } else {
                    replyLogWarn('未找到"内部回复"按钮');
                    if (UI) {
                        UI.showZoneProcessing('reply', false);
                        UI.resetZoneText('reply');
                    }
                }
            } catch (e) {
                replyLogError('内部回复快捷操作异常: ' + e.message);
                if (UI) {
                    UI.showZoneProcessing('reply', false);
                    UI.resetZoneText('reply');
                }
            }
        }

        /**
         * 初始化模块G-AIHelp端
         */
        function initInternalReplyModule() {
            if (!UI) {
                replyLogError('UI未初始化，模块G跳过');
                return;
            }

            // 注册"内"图标区域点击回调
            UI.registerZoneCallback('reply', (el) => {
                doInternalReply(el);
            });

            // 在展开面板中添加"内部回复"快捷按钮
            UI.addButton('内部回复', 'btn-reply', (btn) => {
                doInternalReply(null);
            });

            replyLog('模块G-AIHelp端初始化完成');
        }

        // 延迟初始化（等待UI就绪）
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => setTimeout(initInternalReplyModule, 600));
        } else {
            setTimeout(initInternalReplyModule, 600);
        }

    })();

    // =========================================================================
    // 模块 H-AIHelp端：邮件一键发送（独立 IIFE，仅依赖 UI / SharedUtils）
    // 流程：更多 → 发送奖励 → 选择奖励 → 保存 → 解决 → 解决原因（选原因）→ 聚焦「解决原因」弹窗内「内部回复」的 textarea
    // 注意：最后一步的「内部回复」textarea 属于「解决原因」对话框，与工单工具栏「内部回复」按钮不是同一处
    // =========================================================================
    (function() {
        'use strict';

        if (!currentUrl.includes('ml-panel.aihelp.net')) return;

        const mailLogger = UI ? UI.createLogChannel('mail') : {
            log: (m) => console.log('[邮件]', m),
            error: (m) => console.error('[邮件]', m),
            warn: (m) => console.warn('[邮件]', m),
            success: (m) => console.log('[邮件] ✓', m)
        };

        /** 键：选择奖励弹窗中输入/匹配用；值：「解决原因」下拉里搜索用的中文（键值对值） */
        const MAIL_TYPE_MAP = {
            '9 Design': '设计如此',
            '10 Needinfo': '不予解决/无法复现',
            '8 Noticed': '已知，会修',
            '5 Fixed': '线上已解决',
            '7 FixNex': '下版本修复'
        };

        /** 与「选择奖励」下拉列表项文案一致（用于点击唯一匹配项） */
        const MAIL_REWARD_LINE_TEXT = {
            '9 Design': '9 Design.mail',
            '10 Needinfo': '10 Needinfo.mail',
            '8 Noticed': '8 Noticed.mail（test server 10D)）',
            '5 Fixed': '5 Fixed.mail',
            '7 FixNex': '7 FixNextUpdate.mail（test server 10D)）'
        };

        function sleep(ms) {
            return new Promise(r => setTimeout(r, ms));
        }

        function isVisibleElement(el) {
            if (!el) return false;
            try {
                const style = window.getComputedStyle(el);
                return style.display !== 'none' &&
                    style.visibility !== 'hidden' &&
                    style.opacity !== '0' &&
                    el.offsetParent !== null;
            } catch (e) {
                return false;
            }
        }

        function normalizeUiText(text) {
            return (text || '').replace(/\s+/g, '').trim();
        }

        function findMoreButtonCandidates() {
            const scopes = [document.querySelector('.new-top'), document.body].filter(Boolean);
            const candidates = [];
            const seen = new Set();

            const pushCandidate = (el) => {
                const clickable = el && (el.closest('button, [role="button"], .el-dropdown-selfdefine') || el);
                if (!clickable || seen.has(clickable) || !isVisibleElement(clickable)) return;
                seen.add(clickable);
                candidates.push(clickable);
            };

            for (const scope of scopes) {
                scope.querySelectorAll('button.el-button.more, button.el-dropdown-selfdefine, button.el-button').forEach(pushCandidate);
                scope.querySelectorAll('span').forEach(span => {
                    if (normalizeUiText(span.textContent) === '更多') {
                        pushCandidate(span);
                    }
                });
            }

            return candidates.filter(candidate => normalizeUiText(candidate.textContent).includes('更多'));
        }

        function findVisibleDropdownMenuItem(targetText) {
            const normalizedTarget = normalizeUiText(targetText);
            const menus = Array.from(document.querySelectorAll('.el-dropdown-menu')).filter(isVisibleElement);
            for (let i = menus.length - 1; i >= 0; i--) {
                const menu = menus[i];
                const items = Array.from(menu.querySelectorAll('li.el-dropdown-menu__item')).filter(isVisibleElement);
                const target = items.find(item => normalizeUiText(item.textContent).includes(normalizedTarget));
                if (target) {
                    return target;
                }
            }
            return null;
        }

        async function triggerUiClick(el, options = {}) {
            if (!el) return;
            const { hoverOnly = false } = options;
            el.scrollIntoView({ block: 'center', behavior: 'smooth' });
            await sleep(120);
            ['mouseenter', 'mouseover', 'mousemove'].forEach(eventType => {
                el.dispatchEvent(new MouseEvent(eventType, {
                    bubbles: true,
                    cancelable: true
                }));
            });
            if (typeof el.focus === 'function') {
                el.focus();
            }
            if (hoverOnly) {
                return;
            }
            ['mousedown', 'mouseup', 'click'].forEach(eventType => {
                el.dispatchEvent(new MouseEvent(eventType, {
                    bubbles: true,
                    cancelable: true
                }));
            });
            if (typeof el.click === 'function') {
                el.click();
            }
        }

        function showMailTypePicker(onSelect) {
            const wrap = document.createElement('div');
            wrap.style.cssText = 'position:fixed;inset:0;z-index:10000000;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;';
            const box = document.createElement('div');
            box.style.cssText = 'background:#fff;padding:16px 18px;border-radius:10px;max-width:400px;min-width:280px;box-shadow:0 8px 32px rgba(0,0,0,.2);';
            const title = document.createElement('div');
            title.textContent = '选择邮件类型';
            title.style.cssText = 'font-weight:600;margin-bottom:12px;font-size:14px;color:#1d1d1f;';
            box.appendChild(title);
            Object.keys(MAIL_TYPE_MAP).forEach((k) => {
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.textContent = k + ' → ' + MAIL_TYPE_MAP[k];
                btn.style.cssText = 'display:block;width:100%;margin:6px 0;padding:8px 10px;text-align:left;cursor:pointer;border:1px solid #e8e8e8;border-radius:6px;background:#fafafa;font-size:12px;';
                btn.onmouseover = () => { btn.style.background = '#eef3ff'; btn.style.borderColor = '#adc6ff'; };
                btn.onmouseout = () => { btn.style.background = '#fafafa'; btn.style.borderColor = '#e8e8e8'; };
                btn.onclick = () => {
                    wrap.remove();
                    onSelect(k);
                };
                box.appendChild(btn);
            });
            const cancel = document.createElement('button');
            cancel.type = 'button';
            cancel.textContent = '取消';
            cancel.style.cssText = 'margin-top:10px;padding:6px 14px;cursor:pointer;border-radius:6px;border:1px solid #d9d9d9;background:#fff;';
            cancel.onclick = () => wrap.remove();
            box.appendChild(cancel);
            wrap.appendChild(box);
            wrap.addEventListener('click', (e) => {
                if (e.target === wrap) wrap.remove();
            });
            document.body.appendChild(wrap);
        }

        async function waitForDialogByHeader(headerText, timeout = 10000) {
            const start = Date.now();
            const compact = (headerText || '').replace(/\s+/g, '');
            while (Date.now() - start < timeout) {
                const headers = document.querySelectorAll('.cusHeader');
                for (const h of headers) {
                    const t = (h.textContent || '').replace(/\s+/g, '').trim();
                    if (t === compact || t.includes(compact)) {
                        const dlg = h.closest('.el-dialog');
                        if (dlg) {
                            try {
                                if (dlg.offsetParent !== null && window.getComputedStyle(dlg).display !== 'none') {
                                    return dlg;
                                }
                            } catch (e) {
                                return dlg;
                            }
                        }
                    }
                }
                await sleep(80);
            }
            return null;
        }

        async function clickMoreButton() {
            const candidates = findMoreButtonCandidates();
            if (candidates.length === 0) {
                mailLogger.warn('\u672a\u627e\u5230\u300c\u66f4\u591a\u300d\u6309\u94ae');
                return false;
            }

            for (const candidate of candidates) {
                await triggerUiClick(candidate, { hoverOnly: true });
                for (let i = 0; i < 8; i++) {
                    if (findVisibleDropdownMenuItem('\u53d1\u9001\u5956\u52b1')) {
                        return true;
                    }
                    await sleep(80);
                }

                await triggerUiClick(candidate);
                for (let i = 0; i < 6; i++) {
                    if (findVisibleDropdownMenuItem('\u53d1\u9001\u5956\u52b1')) {
                        return true;
                    }
                    await sleep(80);
                }
            }

            mailLogger.warn('\u70b9\u51fb\u6216\u60ac\u6d6e\u300c\u66f4\u591a\u300d\u540e\u672a\u51fa\u73b0\u53ef\u89c1\u83dc\u5355');
            return false;
        }

        async function clickSendRewardMenuItem() {
            let target = null;
            for (let i = 0; i < 10; i++) {
                target = findVisibleDropdownMenuItem('\u53d1\u9001\u5956\u52b1');
                if (target) break;
                await sleep(80);
            }
            if (!target) {
                mailLogger.warn('\u672a\u627e\u5230\u300c\u53d1\u9001\u5956\u52b1\u300d\u83dc\u5355\u9879');
                return false;
            }

            const clickTargets = [];
            const contentNode = target.querySelector('div');
            if (contentNode) clickTargets.push(contentNode);
            clickTargets.push(target);

            for (const clickTarget of clickTargets) {
                await triggerUiClick(target, { hoverOnly: true });
                if (clickTarget !== target) {
                    await triggerUiClick(clickTarget, { hoverOnly: true });
                }
                await sleep(80);
                await triggerUiClick(clickTarget);

                const rewardDialog = await waitForDialogByHeader('\u9009\u62e9\u5956\u52b1', 2000);
                if (rewardDialog) {
                    return true;
                }

                await sleep(120);
            }

            mailLogger.warn('\u5df2\u89e6\u53d1\u300c\u53d1\u9001\u5956\u52b1\u300d\u83dc\u5355\u9879\uff0c\u4f46\u672a\u62c9\u8d77\u300c\u9009\u62e9\u5956\u52b1\u300d\u5bf9\u8bdd\u6846');
            return false;
        }

        async function runSelectRewardDialog(mailKey) {
            const dialog = await waitForDialogByHeader('选择奖励', 12000);
            if (!dialog) {
                mailLogger.error('未出现「选择奖励」对话框');
                return false;
            }

            const input = dialog.querySelector('input[placeholder="选择奖励"]') ||
                dialog.querySelector('.ai-dialog-content .el-select input.el-input__inner');
            if (!input) {
                mailLogger.error('选择奖励：未找到输入框');
                return false;
            }
            input.click();
            await sleep(200);
            const typeKey = mailKey;
            SharedUtils.simulateInputValue(input, typeKey);
            await sleep(220);

            const lineText = MAIL_REWARD_LINE_TEXT[mailKey];
            if (!lineText) {
                mailLogger.error('未配置该类型的奖励模板行: ' + mailKey);
                return false;
            }
            let picked = await SharedUtils.selectDropdownOption(lineText, mailLogger, 2500, {});
            if (!picked) {
                picked = await SharedUtils.selectDropdownOption(typeKey, mailLogger, 2500, {});
            }
            if (!picked) {
                mailLogger.warn('未点到「选择奖励」选项，请手动选择');
                return false;
            }

            const saveBtn = dialog.querySelector('.el-dialog__footer button.el-button--primary');
            if (!saveBtn) {
                mailLogger.warn('未找到「保存」按钮');
                return false;
            }
            for (let i = 0; i < 40; i++) {
                if (!saveBtn.disabled && !saveBtn.classList.contains('is-disabled')) break;
                await sleep(100);
            }
            if (saveBtn.disabled) {
                mailLogger.warn('「保存」仍为禁用，请检查是否已选择奖励');
                return false;
            }
            saveBtn.click();
            await sleep(450);
            return true;
        }

        async function clickSolveButton() {
            const newTop = document.querySelector('.new-top');
            if (!newTop) {
                mailLogger.warn('未找到 .new-top 区域');
                return false;
            }
            const btns = Array.from(newTop.querySelectorAll('button.el-button'));
            const solve = btns.find(b => (b.textContent || '').replace(/\s+/g, '').trim() === '解决');
            if (!solve) {
                mailLogger.warn('未找到「解决」按钮');
                return false;
            }
            solve.scrollIntoView({ block: 'center', behavior: 'smooth' });
            await sleep(120);
            solve.click();
            await sleep(400);
            return true;
        }

        /**
         * 在「解决原因」对话框中：先选「解决原因」下拉（输入 MAIL_TYPE_MAP 的值），
         * 再聚焦「内部回复」表单项下的 textarea（此为「解决原因」弹窗内的内部回复，非工具栏「内部回复」）
         */
        async function runCloseReasonDialog(reasonSearchText) {
            const dialog = await waitForDialogByHeader('解决原因', 12000);
            if (!dialog) {
                mailLogger.error('未出现「解决原因」对话框');
                return false;
            }

            const reasonInput = dialog.querySelector('.el-form-item input[placeholder="请选择"]') ||
                dialog.querySelector('input[placeholder="请选择"]');
            if (reasonInput) {
                reasonInput.click();
                await sleep(200);
                const filled = await SharedUtils.fillDropdownSearch(reasonSearchText, mailLogger, 150, { preferThirdLink: true });
                if (!filled) {
                    mailLogger.warn('「解决原因」下拉选择可能失败，请手动确认');
                }
            } else {
                mailLogger.warn('未找到「解决原因」下拉输入框');
            }

            await sleep(200);
            const labels = dialog.querySelectorAll('.el-form-item__label');
            let internalReplyTextarea = null;
            for (const lbl of labels) {
                const lt = (lbl.textContent || '').trim();
                if (lt.includes('内部回复')) {
                    const fi = lbl.closest('.el-form-item');
                    internalReplyTextarea = fi && fi.querySelector('textarea.el-textarea__inner');
                    if (internalReplyTextarea) break;
                }
            }
            if (internalReplyTextarea) {
                internalReplyTextarea.focus();
                internalReplyTextarea.click();
                mailLogger.log('已聚焦「解决原因」弹窗内的「内部回复」文本框（请填写后自行提交对话框）');
            } else {
                mailLogger.warn('未找到「解决原因」弹窗内的「内部回复」文本框');
            }
            return true;
        }

        async function runMailFlow(mailKey) {
            if (!MAIL_TYPE_MAP[mailKey]) {
                mailLogger.warn('未知邮件类型: ' + mailKey);
                return;
            }
            if (UI) {
                UI.showZoneProcessing('mail', true);
                UI.setZoneText('mail', '...');
            }
            try {
                mailLogger.log('开始邮件流程，类型键: ' + mailKey);
                if (!(await clickMoreButton())) throw new Error('更多');
                if (!(await clickSendRewardMenuItem())) throw new Error('发送奖励');
                if (!(await runSelectRewardDialog(mailKey))) throw new Error('选择奖励');
                if (!(await clickSolveButton())) throw new Error('解决');
                await runCloseReasonDialog(MAIL_TYPE_MAP[mailKey]);
                mailLogger.success('邮件自动化步骤已完成（请补充「内部回复」并确认关闭对话框）');
                if (UI) UI.showZoneSuccess('mail');
            } catch (e) {
                mailLogger.error('邮件流程中断: ' + (e && e.message ? e.message : e));
            } finally {
                if (UI) {
                    UI.showZoneProcessing('mail', false);
                    UI.resetZoneText('mail');
                }
            }
        }

        function startMailFromUi() {
            showMailTypePicker((key) => {
                runMailFlow(key).catch(() => {});
            });
        }

        function initMailModule() {
            if (!UI) {
                mailLogger.error('UI 未初始化，模块 H 跳过');
                return;
            }
            UI.registerZoneCallback('mail', () => startMailFromUi());
            UI.addButton('发送邮件', 'btn-mail', () => startMailFromUi());
            mailLogger.log('模块 H-AIHelp端（邮件一键发送）初始化完成');
        }

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => setTimeout(initMailModule, 650));
        } else {
            setTimeout(initMailModule, 650);
        }

    })();

})(); // ← 外层主 IIFE 结束

// =========================================================================
// 模块 E-飞书端：飞书项目 Ticket ID 搜索执行器（顶层独立 IIFE，不依赖外层）
//
// 需求来源：提示词总结和skills2026-2-13\通用提示词模版.md
// 功能：
//   - 仅在飞书项目目标页面运行
//   - 读取 GM_getValue 中的待搜索 Ticket ID
//   - 先点击"查找"按钮展开搜索框，再输入 Ticket ID
//   - 等待搜索结果列表更新，检测是否有结果
//   - 将搜索结果写入 GM_setValue，由 AIHelp端模块读取并展示
//   - 若页面处于未登录状态，写入 not_logged_in 状态
// 技术要点（来自 rules.md / AIHelp skills）：
//   - 飞书是重型 SPA，初始化需等待 3000ms
//   - 搜索框是 React 组件，需使用原生 setter + 完整事件链
//   - 使用 MutationObserver 检测搜索结果变化
// =========================================================================
(function() {
        'use strict';

        // 仅在飞书目标页面运行
        const currentUrl = window.location.href;
        const FEISHU_TARGET_PAGE_REGEX = /^https:\/\/project\.feishu\.cn\/ml\/workObjectView\/onlineissue\/Cot68m5vg(?:\?.*)?$/;
        if (!FEISHU_TARGET_PAGE_REGEX.test(currentUrl)) return;

        // ---- 配置区（与 AIHelp 端保持同步的存储键名）----
        const FEISHU_EXEC_CONFIG = {
            debug: true,
            storageKeyPending: 'feishu_ticket_search_pending_v1',
            storageKeyResult: 'feishu_ticket_search_result_v1',
            storageKeyResultTs: 'feishu_ticket_search_result_ts_v1',
            storageKeyHeartbeat: 'feishu_ticket_search_heartbeat_v1',
            storageKeyOpenLock: 'feishu_ticket_search_open_lock_v1',
            // 飞书重型应用，初始化等待时间（来自 rules.md 动态页面处理规范）
            initDelay: 3000,
            // 搜索结果等待超时（毫秒）
            searchResultTimeout: 15000,
            // 轮询待搜索 ID 的间隔（毫秒）：页面加载后持续检测新任务
            pollPendingInterval: 1000,
            heartbeatInterval: 4000,
            reloadDelayAfterResult: 1200
        };

        // ---- 状态区 ----
        const feishuExecState = {
            isSearching: false,         // 防止并发搜索
            lastSearchedId: null,       // 上次搜索的 Ticket ID（防重复）
            lastRequestTs: 0,           // 上次请求的时间戳
            isInitialized: false,       // 是否已完成初始化
            reloadTimer: null
        };

        function feishuExecLog(...args) {
            if (FEISHU_EXEC_CONFIG.debug) {
                console.log('[飞书搜索执行器]', ...args);
            }
        }

        function feishuExecLogError(...args) {
            console.error('[飞书搜索执行器 错误]', ...args);
        }

        function feishuExecRp(searchRequestId) {
            return typeof searchRequestId === 'string' && searchRequestId ? ('[' + searchRequestId + '] ') : '';
        }

        function writeHeartbeat() {
            try {
                GM_setValue(FEISHU_EXEC_CONFIG.storageKeyHeartbeat, Date.now());
            } catch (e) {
                feishuExecLogError('写入目标页心跳失败:', e.message);
            }
        }

        function startHeartbeat() {
            writeHeartbeat();
            setInterval(writeHeartbeat, FEISHU_EXEC_CONFIG.heartbeatInterval);
        }

        function clearOpenLock() {
            try {
                GM_deleteValue(FEISHU_EXEC_CONFIG.storageKeyOpenLock);
            } catch (e) {
                feishuExecLogError('清理目标页打开锁失败:', e.message);
            }
        }

        function clearPendingSearchRequest() {
            try {
                GM_deleteValue(FEISHU_EXEC_CONFIG.storageKeyPending);
            } catch (e) {
                feishuExecLogError('清理待搜索任务失败:', e.message);
            }
        }

        function refreshTargetPageAfterResult() {
            if (feishuExecState.reloadTimer) {
                clearTimeout(feishuExecState.reloadTimer);
            }

            feishuExecState.reloadTimer = setTimeout(() => {
                feishuExecLog('搜索结果已返回，刷新目标页以便下次搜索');
                window.location.reload();
            }, FEISHU_EXEC_CONFIG.reloadDelayAfterResult);
        }

        /**
         * 检测飞书页面是否已登录
         * 登录判断依据：页面存在用户相关元素，或不存在登录引导文本
         * @returns {boolean}
         */
        function isFeishuLoggedIn() {
            const bodyText = document.body.innerText || '';
            // 飞书未登录时页面内容极少，且通常包含登录引导文字
            if (bodyText.length < 200) return false; // 页面内容太少，还在加载或未登录
            if (bodyText.includes('请登录') || bodyText.includes('立即登录') || bodyText.includes('扫码登录')) return false;
            if (bodyText.includes('登录') && bodyText.includes('账号') && bodyText.length < 800) return false;
            return true; // 页面内容正常，视为已登录
        }

        /**
         * 等待指定选择器的元素出现并可用
         * 来自 rules.md 动态页面处理规范中的 waitFor 模板
         * @param {string} selector
         * @param {number} timeout
         * @returns {Promise<Element|null>}
         */
        function waitForElement(selector, timeout = 10000) {
            return new Promise((resolve) => {
                // 先检查是否已存在
                const existing = document.querySelector(selector);
                if (existing) {
                    const style = window.getComputedStyle(existing);
                    if (style.display !== 'none' && style.visibility !== 'hidden') {
                        return resolve(existing);
                    }
                }

                const observer = new MutationObserver(() => {
                    const el = document.querySelector(selector);
                    if (el) {
                        const style = window.getComputedStyle(el);
                        if (style.display !== 'none' && style.visibility !== 'hidden') {
                            observer.disconnect();
                            resolve(el);
                        }
                    }
                });

                observer.observe(document.body, {
                    childList: true,
                    subtree: true,
                    attributes: true,
                    attributeFilter: ['style', 'class']
                });

                setTimeout(() => {
                    observer.disconnect();
                    resolve(null);
                }, timeout);
            });
        }

        /**
         * 使用原生 setter 向 React/SPA 框架中的 input 设置值并触发事件
         * 需求：飞书搜索框是 React 组件，直接赋值无效
         * 来自 rules.md SPA架构适配规范 - 框架双向绑定突破
         * @param {HTMLInputElement} input
         * @param {string} value
         */
        function simulateSearchInput(input, value) {
            try {
                input.focus();
                // 先清空旧值
                const nativeSetter = Object.getOwnPropertyDescriptor(
                    window.HTMLInputElement.prototype, 'value'
                ).set;
                nativeSetter.call(input, '');
                input.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));

                // 再写入新值，使用原生 setter 绕过 React 的 proxy
                nativeSetter.call(input, value);

                // 触发完整事件链，确保 React 状态同步
                input.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true, inputType: 'insertText', data: value }));
                input.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));

                // 模拟最后一个字符的键盘事件（部分 React 版本依赖 keydown 触发过滤）
                if (value.length > 0) {
                    const lastChar = value[value.length - 1];
                    input.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, composed: true, key: lastChar }));
                    input.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, cancelable: true, composed: true, key: lastChar }));
                }

                feishuExecLog('搜索框已输入:', value);

                // 发送 Enter 键触发搜索（飞书搜索框需要 Enter 才会执行搜索，不是输入即搜索）
                setTimeout(() => {
                    input.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, composed: true, key: 'Enter', keyCode: 13, which: 13 }));
                    input.dispatchEvent(new KeyboardEvent('keypress', { bubbles: true, cancelable: true, composed: true, key: 'Enter', keyCode: 13, which: 13 }));
                    input.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, cancelable: true, composed: true, key: 'Enter', keyCode: 13, which: 13 }));
                    feishuExecLog('已发送 Enter 键触发搜索');
                }, 200);

                return true;
            } catch (e) {
                feishuExecLogError('模拟搜索输入失败:', e.message);
                return false;
            }
        }

        /**
         * 检测搜索结果：等待列表项变化，判断是否有搜索结果
         * 策略：MutationObserver 监听列表容器变化 + 超时保底
         * @returns {Promise<'found'|'notfound'>}
         */
        function detectSearchResult() {
            return new Promise((resolve) => {
                let observer = null;
                let timeoutId = null;

                function cleanup() {
                    if (observer) { observer.disconnect(); observer = null; }
                    if (timeoutId) { clearTimeout(timeoutId); timeoutId = null; }
                }

                function checkResult() {
                    const bodyText = document.body.innerText || '';

                    // 策略1：识别飞书搜索过滤后的 X/X 计数（如"0/0"表示无结果，"1/12"表示有结果）
                    // 飞书过滤后会在搜索框附近显示 "当前结果/总数" 格式
                    const countMatch = bodyText.match(/(\d+)\/(\d+)/);
                    if (countMatch) {
                        const matched = parseInt(countMatch[1], 10);
                        feishuExecLog('检测到计数:', countMatch[0], '→ matched =', matched);
                        if (matched === 0) return 'notfound';
                        if (matched > 0) return 'found';
                    }

                    // 策略2：检查空结果标记（飞书常见的空状态文本）
                    const emptyTexts = ['暂无数据', '没有找到', '无搜索结果', 'No data', '暂无内容', 'No results', '未找到'];
                    const hasEmptyState = emptyTexts.some(t => bodyText.includes(t));

                    // 策略3：检查是否有工作项列表行（飞书项目多种可能的列表行选择器）
                    const listRows = document.querySelectorAll([
                        'tr.story-list-table-row',
                        '[class*="story-row"]',
                        '[class*="work-item-row"]',
                        '[class*="listItem"]',
                        '[class*="storyItem"]',
                        '[class*="issueItem"]',
                        '[data-testid*="story"]',
                        '.story-list-table tbody tr',
                        '[class*="StoryItem"]',
                        '[class*="WorkItem"]'
                    ].join(', '));

                    if (hasEmptyState && listRows.length === 0) {
                        return 'notfound';
                    }
                    return null; // 还在加载中，等待计数出现
                }

                // 先检查一次
                const immediate = checkResult();
                if (immediate) {
                    resolve(immediate);
                    return;
                }

                // 监听 DOM 变化
                observer = new MutationObserver(() => {
                    const result = checkResult();
                    if (result) {
                        cleanup();
                        resolve(result);
                    }
                });

                observer.observe(document.body, {
                    childList: true,
                    subtree: true
                });

                // 超时保底：等待足够时间后再次检查
                timeoutId = setTimeout(() => {
                    cleanup();
                    // 超时时再做一次最终判断
                    const finalResult = checkResult();
                    if (finalResult) {
                        resolve(finalResult);
                    } else {
                        // 无法明确判断：以"未找到"处理（保守策略）
                        feishuExecLog('检测搜索结果超时，默认返回 notfound');
                        resolve('notfound');
                    }
                }, FEISHU_EXEC_CONFIG.searchResultTimeout);
            });
        }

        /**
         * 写入搜索结果到 GM_setValue，供 AIHelp 端轮询读取
         * @param {'found'|'notfound'|'not_logged_in'|'error'} status
         * @param {string} [detail]
         */
        function writeSearchResult(status, detail) {
            try {
                GM_setValue(FEISHU_EXEC_CONFIG.storageKeyResult, { status, detail: detail || '' });
                GM_setValue(FEISHU_EXEC_CONFIG.storageKeyResultTs, Date.now());
                feishuExecLog('搜索结果已写入:', status, detail || '');
            } catch (e) {
                feishuExecLogError('写入搜索结果失败:', e.message);
            }
        }

        /**
         * 执行一次 Ticket ID 搜索的完整流程
         * @param {string} ticketId - 要搜索的 Ticket ID
         * @param {number} requestTs - 本次请求的时间戳（用于结果标记）
         * @param {string} [searchRequestId] - 与 AIHelp 端日志对齐的请求 ID
         */
        async function executeFeishuSearch(ticketId, requestTs, searchRequestId) {
            if (feishuExecState.isSearching) {
                feishuExecLog('正在搜索中，跳过重复请求');
                return;
            }

            const rp = feishuExecRp(searchRequestId);

            feishuExecState.isSearching = true;
            feishuExecState.lastRequestTs = requestTs;
            feishuExecState.lastSearchedId = ticketId;
            feishuExecLog(rp + '========== 开始飞书搜索 ==========');
            feishuExecLog(rp + 'Ticket ID: ' + ticketId + ' | 请求时间: ' + new Date(requestTs).toLocaleTimeString());

            try {
                // 1. 检查登录状态
                if (!isFeishuLoggedIn()) {
                    feishuExecLog(rp + '飞书未登录，返回 not_logged_in 状态');
                    clearOpenLock();
                    writeSearchResult('not_logged_in');
                    return;
                }

                // 2. 先点击"查找"图标按钮，展开搜索输入框
                //    飞书搜索框默认折叠，必须先点击查找图标才会显示 input
                //    查找图标特征：按钮内包含"查找"文字的 span
                feishuExecLog(rp + '等待查找图标按钮出现...');

                // 等待查找按钮所在的容器加载完成
                await waitForElement(
                    '#story-view-search-container, [id*="search-container"]',
                    FEISHU_EXEC_CONFIG.searchResultTimeout
                );

                // 多种选择器尝试定位查找按钮
                function findSearchButton() {
                    // 优先：通过容器 ID 下的按钮
                    const container = document.getElementById('story-view-search-container');
                    if (container) {
                        const btn = container.querySelector('button');
                        if (btn) return btn;
                    }
                    // 备用：找包含"查找"文字的按钮
                    const allBtns = document.querySelectorAll('button');
                    for (const btn of allBtns) {
                        if (btn.innerText && btn.innerText.trim() === '查找') return btn;
                    }
                    // 备用：找包含"查找" span 的按钮
                    const spans = document.querySelectorAll('.semi-button-content-right span');
                    for (const span of spans) {
                        if (span.innerText && span.innerText.trim() === '查找') {
                            return span.closest('button');
                        }
                    }
                    return null;
                }

                const queryBtn = findSearchButton();
                if (!queryBtn) {
                    feishuExecLogError(rp + '未找到查找图标按钮，页面可能未加载完成或结构已变化');
                    clearOpenLock();
                    if (!isFeishuLoggedIn()) {
                        writeSearchResult('not_logged_in');
                    } else {
                        writeSearchResult('error', '未找到查找按钮，请确认飞书页面已正常加载');
                    }
                    return;
                }

                feishuExecLog(rp + '找到查找按钮，模拟点击展开搜索框...');
                queryBtn.click();

                // 3. 等待搜索输入框展开（点击后动画/渲染需要短暂时间）
                feishuExecLog(rp + '等待搜索输入框出现...');
                const searchInput = await waitForElement(
                    'input[placeholder="按标题查找"], input.semi-input[placeholder*="查找"], #story-view-search-container input',
                    5000
                );

                if (!searchInput) {
                    feishuExecLogError(rp + '点击查找按钮后搜索输入框仍未出现');
                    clearOpenLock();
                    writeSearchResult('error', '搜索输入框未展开，请检查飞书页面');
                    return;
                }

                // 4. 向搜索框输入 Ticket ID
                feishuExecLog(rp + '搜索输入框已展开，开始输入 Ticket ID: ' + ticketId);
                const inputResult = simulateSearchInput(searchInput, ticketId);
                if (!inputResult) {
                    clearOpenLock();
                    writeSearchResult('error', '无法向搜索框输入内容');
                    return;
                }

                // 4. 等待 Enter 的 debounce，再点击"过滤"复选框
                //    飞书搜索框输入后需要点击"过滤"复选框才能真正按标题过滤
                //    结构：<span class="semi-checkbox-inner-display"></span>（在 meego-checkbox 内）
                feishuExecLog(rp + '等待过滤复选框出现...');
                await new Promise(resolve => setTimeout(resolve, 600));

                async function clickFilterCheckbox() {
                    // 优先：找包含"过滤"文字且未勾选的复选框
                    const checkboxes = document.querySelectorAll('.semi-checkbox');
                    for (const cb of checkboxes) {
                        const label = cb.querySelector('.meego-checkbox-label, .semi-checkbox-addon');
                        if (label && label.innerText && label.innerText.trim() === '过滤') {
                            const input = cb.querySelector('input[type="checkbox"]');
                            if (input && input.getAttribute('aria-checked') !== 'true') {
                                feishuExecLog(rp + '找到"过滤"复选框，模拟点击...');
                                // 点击 inner-display（视觉元素）
                                const display = cb.querySelector('.semi-checkbox-inner-display');
                                if (display) { display.click(); return true; }
                                // 备用：点击 input
                                input.click();
                                return true;
                            } else if (input && input.getAttribute('aria-checked') === 'true') {
                                feishuExecLog(rp + '"过滤"复选框已勾选，无需重复点击');
                                return true;
                            }
                        }
                    }
                    // 备用：直接找 semi-checkbox-inner-display，通过附近文字判断
                    const displays = document.querySelectorAll('.semi-checkbox-inner-display');
                    for (const d of displays) {
                        const parent = d.closest('.semi-checkbox');
                        if (parent) {
                            const text = parent.innerText || '';
                            if (text.includes('过滤')) {
                                feishuExecLog(rp + '备用：找到"过滤"复选框显示元素，模拟点击...');
                                d.click();
                                return true;
                            }
                        }
                    }
                    feishuExecLog(rp + '未找到"过滤"复选框，跳过（继续等待结果）');
                    return false;
                }

                const filterClicked = await clickFilterCheckbox();
                feishuExecLog(rp + '过滤复选框点击结果: ' + filterClicked);

                // 5. 等待过滤后搜索结果更新
                feishuExecLog(rp + '等待搜索结果...');
                await new Promise(resolve => setTimeout(resolve, 1500));

                // 6. 检测结果
                const result = await detectSearchResult();
                feishuExecLog(rp + '搜索结果: ' + result);

                // 7. 写入结果
                clearOpenLock();
                writeSearchResult(result);
                clearPendingSearchRequest();
                if (result === 'found' || result === 'notfound') {
                    refreshTargetPageAfterResult();
                }
                feishuExecLog(rp + '========== 飞书搜索完成 ==========');

            } catch (e) {
                feishuExecLogError(feishuExecRp(searchRequestId) + '飞书搜索执行异常: ' + e.message);
                clearOpenLock();
                writeSearchResult('error', e.message);
            } finally {
                feishuExecState.isSearching = false;
            }
        }

        /**
         * 轮询检查是否有新的 Ticket ID 搜索请求
         * 每次页面加载后持续检测，及时响应 AIHelp 端的搜索请求
         */
        function startPollPending() {
            feishuExecLog('开始轮询待搜索 Ticket ID...');

            setInterval(() => {
                try {
                    if (feishuExecState.isSearching) return;

                    const pending = GM_getValue(FEISHU_EXEC_CONFIG.storageKeyPending, null);
                    if (!pending || !pending.ticketId) return;

                    const { ticketId, requestTs, searchRequestId } = pending;

                    // 跳过已处理过的请求（通过时间戳区分）
                    if (requestTs <= feishuExecState.lastRequestTs) return;

                    feishuExecLog(feishuExecRp(searchRequestId) + '检测到新的搜索请求: ' + ticketId + ' | reqTs: ' + requestTs);
                    executeFeishuSearch(ticketId, requestTs, searchRequestId);
                } catch (e) {
                    feishuExecLogError('轮询异常:', e.message);
                }
            }, FEISHU_EXEC_CONFIG.pollPendingInterval);
        }

        function initFeishuExecModule() {
            feishuExecLog('========================================');
            feishuExecLog('飞书 Ticket ID 搜索执行器 v6.6.2 已启动');
            feishuExecLog('当前页面:', currentUrl.substring(0, 80));
            feishuExecLog('========================================');

            feishuExecState.isInitialized = true;
            clearOpenLock();
            startHeartbeat();

            // 页面加载后等待飞书 SPA 初始化完成（重型应用规范：3000ms）
            // 再开始轮询，避免搜索框还没渲染就执行
            setTimeout(() => {
                feishuExecLog('飞书 SPA 初始化等待完毕，开始工作...');
                startPollPending();

                // 检查是否有立即需要处理的任务（页面刚打开时）
                try {
                    const pending = GM_getValue(FEISHU_EXEC_CONFIG.storageKeyPending, null);
                    if (!feishuExecState.isSearching && pending && pending.ticketId && pending.requestTs > feishuExecState.lastRequestTs) {
                        feishuExecLog(feishuExecRp(pending.searchRequestId) + '发现页面打开时已有待搜索任务: ' + pending.ticketId);
                        executeFeishuSearch(pending.ticketId, pending.requestTs, pending.searchRequestId);
                    }
                } catch (e) {
                    feishuExecLogError('初始任务检查异常:', e.message);
                }
            }, FEISHU_EXEC_CONFIG.initDelay);
        }

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', initFeishuExecModule);
        } else {
            initFeishuExecModule();
        }
    })();

// =========================================================================
// 模块 F-GM端：清除头像冷却时间 - GM工具页面自动操作执行器（顶层独立 IIFE）
//
// 功能：
//   - 仅在 GM 工具页面（gm.moba.youngjoygame.com）运行
//   - 读取 AIHelp 端写入的任务数据（UID、ServerID）
//   - 自动在 banTool 页面：选择服务器 → 输入 UID → 点击执行
//   - 将执行日志写入 GM_setValue，供 AIHelp 端实时轮询显示
//   - 操作完成后自动关闭弹窗
// 技术要点：
//   - GM 工具为 Vue/Ant Design 框架，使用原生 setter 写入输入框
//   - 下拉框需通过 ant-select-selector 触发，等待下拉框展开后选择选项
//   - 日志同步通过 GM_setValue 写入 JSON 数组，AIHelp 端通过时间戳过滤
// =========================================================================
(function() {
    'use strict';

    // 仅在 GM 工具页面运行
    const gmCurrentUrl = window.location.href;
    if (!gmCurrentUrl.includes('gm.moba.youngjoygame.com')) return;

    console.log('[模块F-GM] GM工具端启动...');

    // ==================== 配置区（与 AIHelp 端保持同步）====================
    const GM_MODULE_CONFIG = {
        // 存储键名（与 AIHelp 端一致）
        STORAGE_PREFIX: 'clear_avatar_',
        MAX_LOG_LINES: 100,
        // banTool 页面 hash 标识
        BAN_TOOL_HASH: 'banTool',
        // 元素查找超时（ms）
        ELEMENT_TIMEOUT: 10000,
        // 重试间隔（ms）
        RETRY_INTERVAL: 500,
        // 最大重试次数
        MAX_RETRIES: 20
    };

    const GM_STORAGE_KEYS = {
        PENDING_TASK: GM_MODULE_CONFIG.STORAGE_PREFIX + 'pending_task',
        POPUP_MODE: GM_MODULE_CONFIG.STORAGE_PREFIX + 'popup_mode',
        LOG_DATA: GM_MODULE_CONFIG.STORAGE_PREFIX + 'log_data'
    };

    // ==================== 工具函数 ====================

    function gmSleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    function gmWaitForElement(selector, timeout) {
        timeout = timeout || GM_MODULE_CONFIG.ELEMENT_TIMEOUT;
        return new Promise(resolve => {
            const startTime = Date.now();
            const check = () => {
                const el = document.querySelector(selector);
                if (el) { resolve(el); return; }
                if (Date.now() - startTime >= timeout) { resolve(null); return; }
                setTimeout(check, GM_MODULE_CONFIG.RETRY_INTERVAL);
            };
            check();
        });
    }

    /**
     * 读取 GM 存储数据
     */
    function gmLoadData(key, defaultVal) {
        if (defaultVal === undefined) defaultVal = null;
        try {
            const raw = GM_getValue(key, null);
            if (raw !== null && raw !== undefined) {
                return typeof raw === 'string' ? JSON.parse(raw) : raw;
            }
        } catch (e) {
            console.error('[模块F-GM] GM存储读取失败:', key, e);
        }
        return defaultVal;
    }

    /**
     * 写入 GM 存储数据
     */
    function gmSaveData(key, data) {
        try {
            GM_setValue(key, JSON.stringify(data));
        } catch (e) {
            console.error('[模块F-GM] GM存储写入失败:', key, e);
        }
    }

    /**
     * 删除 GM 存储数据
     */
    function gmDeleteData(key) {
        try {
            GM_deleteValue(key);
        } catch (e) {
            console.error('[模块F-GM] GM存储删除失败:', key, e);
        }
    }

    // ==================== 跨域日志系统 ====================

    // GM 工具端日志悬浮层（显示在 GM 工具页面右上角）
    let gmLogDiv = null;

    /**
     * 创建 GM 工具页面的日志悬浮层
     */
    function createGMLogOverlay() {
        if (document.getElementById('gm-module-f-log')) return;
        gmLogDiv = document.createElement('div');
        gmLogDiv.id = 'gm-module-f-log';
        gmLogDiv.style.cssText = [
            'position:fixed',
            'top:10px',
            'right:10px',
            'width:320px',
            'max-height:220px',
            'overflow-y:auto',
            'background:rgba(0,0,0,0.82)',
            'color:#fff',
            'padding:10px 12px',
            'border-radius:8px',
            'font-size:12px',
            'font-family:monospace',
            'z-index:999999',
            'box-shadow:0 4px 12px rgba(0,0,0,0.3)',
            'line-height:1.6'
        ].join(';');
        document.body.appendChild(gmLogDiv);
    }

    /**
     * 输出日志（同时写入悬浮层 + 跨域 GM 存储 → 供 AIHelp 端读取）
     * @param {string} msg - 日志消息
     * @param {string} type - info / success / warn / error
     */
    function gmLog(msg, type) {
        type = type || 'info';
        const colors = { info: '#fff', success: '#73d13d', warn: '#faad14', error: '#ff4d4f' };
        const time = new Date().toLocaleTimeString([], { hour12: false });

        console.log('[模块F-GM]', msg);

        // 写入悬浮层
        if (gmLogDiv) {
            const div = document.createElement('div');
            div.style.color = colors[type] || '#fff';
            div.textContent = '[' + time + '] ' + msg;
            gmLogDiv.appendChild(div);
            gmLogDiv.scrollTop = gmLogDiv.scrollHeight;
        }

        // 同步到跨域 GM 存储（供 AIHelp 端轮询读取）
        try {
            let logData = gmLoadData(GM_STORAGE_KEYS.LOG_DATA, []);
            if (!Array.isArray(logData)) logData = [];
            logData.push({ time: time, msg: msg, type: type, timestamp: Date.now() });
            if (logData.length > GM_MODULE_CONFIG.MAX_LOG_LINES) {
                logData = logData.slice(-GM_MODULE_CONFIG.MAX_LOG_LINES);
            }
            gmSaveData(GM_STORAGE_KEYS.LOG_DATA, logData);
        } catch (e) {
            console.error('[模块F-GM] 跨域日志同步失败:', e);
        }
    }

    // ==================== 清除头像核心操作 ====================

    /**
     * 主操作流程：在 banTool 页面自动完成清除头像操作
     * 步骤：等待页面加载 → 选择ServerID → 输入UID → 点击执行 → 读取结果 → 关闭弹窗
     */
    async function executeClearAvatarOnGMTool() {
        gmLog('========== 开始清除头像操作 ==========');

        // 从 GM 存储获取任务数据
        const taskData = gmLoadData(GM_STORAGE_KEYS.PENDING_TASK);
        if (!taskData) {
            gmLog('没有待处理的任务', 'warn');
            return;
        }

        const { uid, serverId } = taskData;
        gmLog('待处理任务 - UID: ' + uid + ', ServerID: ' + serverId);

        // 确保在 banTool 页面
        if (!window.location.hash.includes(GM_MODULE_CONFIG.BAN_TOOL_HASH)) {
            gmLog('当前不在banTool页面，尝试跳转...', 'warn');
            window.location.hash = '/customer/banTool';
            await gmSleep(2000);
        }

        try {
            // ===== 步骤1：等待页面内容加载 =====
            gmLog('等待页面内容加载...');
            await gmSleep(2000);

            let pageReady = false;
            for (let i = 0; i < 20; i++) {
                if (document.querySelector('.ant-select-selector, .item, .el-input')) {
                    pageReady = true;
                    gmLog('页面内容已加载');
                    break;
                }
                gmLog('等待页面内容加载... (' + (i + 1) + '/20)');
                await gmSleep(500);
            }
            if (!pageReady) gmLog('页面加载超时，继续尝试...', 'warn');

            // ===== 步骤2：点击 ServerID 选择框 =====
            gmLog('查找ServerID选择框...');
            const serverIdSelector = await gmWaitForElement('.ant-select-selector', 10000);
            if (!serverIdSelector) {
                gmLog('未找到ServerID选择框，请检查页面是否正确加载', 'error');
                return;
            }

            serverIdSelector.scrollIntoView({ behavior: 'smooth', block: 'center' });
            await gmSleep(300);

            // 模拟鼠标事件触发下拉框
            ['mousedown', 'mouseup'].forEach(evType => {
                serverIdSelector.dispatchEvent(new MouseEvent(evType, { bubbles: true, cancelable: true }));
            });
            await gmSleep(100);
            serverIdSelector.click();
            gmLog('已点击ServerID选择框');
            await gmSleep(800);

            // ===== 步骤3：等待下拉框显示 =====
            gmLog('等待下拉框显示...');
            let dropdown = null;
            for (let i = 0; i < 15; i++) {
                dropdown = document.querySelector('.ant-select-dropdown:not(.ant-select-dropdown-hidden)');
                if (dropdown) break;
                gmLog('下拉框未显示，尝试再次点击...');
                serverIdSelector.click();
                await gmSleep(500);
            }
            if (!dropdown) gmLog('下拉框未能打开，尝试直接输入...', 'warn');
            else gmLog('下拉框已打开');

            // ===== 步骤4：输入 ServerID 搜索 =====
            gmLog('输入ServerID: ' + serverId);
            const searchInput = document.querySelector('.ant-select-selection-search-input');
            if (!searchInput) {
                gmLog('未找到搜索输入框', 'error');
                return;
            }

            searchInput.focus();
            await gmSleep(100);

            const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
            nativeSetter.call(searchInput, serverId);
            searchInput.dispatchEvent(new Event('input', { bubbles: true }));
            searchInput.dispatchEvent(new Event('change', { bubbles: true }));
            gmLog('已输入ServerID，等待选项加载...');
            await gmSleep(800);

            // ===== 步骤5：选择匹配的 ServerID 选项 =====
            gmLog('查找匹配的ServerID选项...');
            dropdown = document.querySelector('.ant-select-dropdown:not(.ant-select-dropdown-hidden)');
            if (!dropdown) {
                gmLog('下拉框已关闭', 'error');
                return;
            }

            const options = dropdown.querySelectorAll('.ant-select-item-option');
            gmLog('找到 ' + options.length + ' 个选项');

            let matchedOption = null;
            for (const option of options) {
                const title = option.getAttribute('title') || '';
                if (title.startsWith(serverId + '-') || title === serverId) {
                    matchedOption = option;
                    gmLog('找到匹配选项: ' + title, 'success');
                    break;
                }
            }

            if (matchedOption) {
                matchedOption.click();
                await gmSleep(500);
                gmLog('ServerID选择完成', 'success');
            } else {
                gmLog('未找到精确匹配，尝试选择第一个选项...', 'warn');
                if (options.length > 0) {
                    options[0].click();
                    await gmSleep(500);
                }
            }

            // ===== 步骤6：定位"清除上传头像倒计时"功能区域 =====
            gmLog('查找"清除上传头像倒计时"区域...');
            let targetSpan = null;
            for (const span of document.querySelectorAll('span')) {
                if (span.textContent.trim() === '清除上传头像倒计时') {
                    targetSpan = span;
                    break;
                }
            }

            if (!targetSpan) {
                gmLog('未找到"清除上传头像倒计时"区域', 'error');
                return;
            }

            const itemContainer = targetSpan.closest('.item');
            if (!itemContainer) {
                gmLog('未找到功能区域容器(.item)', 'error');
                return;
            }

            itemContainer.scrollIntoView({ behavior: 'smooth', block: 'center' });
            await gmSleep(500);
            gmLog('找到功能区域');

            // ===== 步骤7：输入 UID =====
            gmLog('查找UID输入框...');
            const uidInput = itemContainer.querySelector('input[placeholder="UID"]');
            if (!uidInput) {
                gmLog('未找到UID输入框', 'error');
                return;
            }

            uidInput.focus();
            await gmSleep(100);
            nativeSetter.call(uidInput, uid);
            uidInput.dispatchEvent(new Event('input', { bubbles: true }));
            uidInput.dispatchEvent(new Event('change', { bubbles: true }));
            uidInput.dispatchEvent(new Event('blur', { bubbles: true }));
            gmLog('UID输入完成: ' + uid, 'success');
            await gmSleep(300);

            // ===== 步骤8：点击执行按钮 =====
            gmLog('查找执行按钮...');
            const executeBtn = itemContainer.querySelector('.el-icon-video-play[title="运行"]');
            if (!executeBtn) {
                gmLog('未找到执行按钮(.el-icon-video-play[title="运行"])', 'error');
                return;
            }

            executeBtn.click();
            gmLog('已点击执行按钮', 'success');

            // ===== 步骤9：等待执行结果 =====
            gmLog('等待执行结果...');
            await gmSleep(2000);

            let resultFound = false;
            for (const el of document.querySelectorAll('*')) {
                const text = el.textContent || '';
                if (text.includes('Result:Ok') || text.includes('Result: Ok')) {
                    gmLog('清除头像冷却时间成功！', 'success');
                    resultFound = true;
                    break;
                } else if (text.includes('Result:Error') || text.includes('Result: Error')) {
                    gmLog('清除头像冷却时间失败，请检查参数', 'error');
                    resultFound = true;
                    break;
                }
            }
            if (!resultFound) {
                gmLog('操作已执行，请查看右侧结果栏确认', 'warn');
            }

            // ===== 步骤10：清除任务数据并关闭弹窗 =====
            gmDeleteData(GM_STORAGE_KEYS.PENDING_TASK);
            gmLog('任务完成，已清除待处理数据');

            const isPopupMode = gmLoadData(GM_STORAGE_KEYS.POPUP_MODE, false);
            if (isPopupMode) {
                gmDeleteData(GM_STORAGE_KEYS.POPUP_MODE);
                gmLog('3秒后自动关闭弹窗...');
                await gmSleep(2500);
                gmLog('正在关闭弹窗...', 'success');
                await gmSleep(500);
                window.close();
                gmLog('如果窗口未关闭，请手动关闭此页面', 'warn');
            } else {
                gmLog('非弹窗模式，请手动关闭此页面');
            }

        } catch (e) {
            gmLog('执行过程中发生错误: ' + e.message, 'error');
            console.error('[模块F-GM] 详细错误:', e);
        }
    }

    // ==================== 页面判断 ====================

    function isGMBanToolPage() {
        return (window.location.hash || '').includes(GM_MODULE_CONFIG.BAN_TOOL_HASH);
    }

    // ==================== 初始化 ====================

    /**
     * 初始化 GM 工具端模块
     * 在 banTool 页面且有待处理任务时自动执行清除操作
     */
    function initGMModuleF() {
        console.log('[模块F-GM] 初始化，当前hash:', window.location.hash);

        // 创建日志悬浮层
        createGMLogOverlay();

        const taskData = gmLoadData(GM_STORAGE_KEYS.PENDING_TASK);
        gmLog('任务数据: ' + JSON.stringify(taskData));

        if (taskData && isGMBanToolPage()) {
            gmLog('发现待处理任务，准备执行...', 'success');

            if (document.readyState === 'complete') {
                setTimeout(executeClearAvatarOnGMTool, 1500);
            } else {
                window.addEventListener('load', () => setTimeout(executeClearAvatarOnGMTool, 1500));
            }
        } else {
            gmLog('没有待处理任务 或 当前不在banTool页面');
        }

        // 监听 hash 变化（SPA路由），当切换到 banTool 页面时重新检查
        window.addEventListener('hashchange', () => {
            gmLog('hash变化: ' + window.location.hash);
            setTimeout(() => {
                const newTaskData = gmLoadData(GM_STORAGE_KEYS.PENDING_TASK);
                if (newTaskData && isGMBanToolPage()) {
                    gmLog('hash变化后检测到banTool页面，执行任务...', 'success');
                    setTimeout(executeClearAvatarOnGMTool, 500);
                }
            }, 500);
        });
    }

    // 启动模块
    gmLog('========== 模块F-GM工具端已加载 ==========');
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => setTimeout(initGMModuleF, 1000));
    } else {
        setTimeout(initGMModuleF, 1000);
    }

})();

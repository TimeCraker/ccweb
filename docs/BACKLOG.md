# ccweb 差距 Backlog(对照 dsh 源码逐项核实)

> 依据:子 agent 深读 deepseek-harness 源码提取的 120 项 UX 清单(dsh 实际目录 packages/client/*)。
> 分级:P0=本轮修 / P1=近期 / P2=远期。已完成项打勾。

## P0(本轮)

- [x] 回到底部浮动按钮 + 钉底跟随(24px 阈值判定,非钉底不跟随新内容)——dsh ChatView
- [x] 断线重连顶部通栏(重连退避进行中显示,连接中/空闲安静)——dsh ConnectionBanner
- [x] 代码块:语言标签 + 复制按钮(copy→1s 打勾)——dsh CodeBlock
- [x] turn 尾统计行:"Ran for 15s · TTFT 1.2s · 34 tok/s"(消息级,比全局底栏直观)——dsh TurnTailNodeView
- [x] 运行中状态行:≥15s 才出现的 turn 计时(aria-live)——dsh TurnStatus
- [x] 主题三态:Light/Dark/**System**(当前只有两态,设置里缺 System 跟随)——dsh AppearanceRow
- [x] 用户消息 `/命令` `@提及` chip 化装饰——dsh MessageItem projectUserText

## P1(近期)

- [x] 队列 dock:运行中可排队/插队消息(Enter 行为设置 Queue/Steer)——dsh QueueDock
- [x] 消息级 fork 按钮(从该消息分叉新会话;当前只有会话级 fork)——dsh MessageIconActions
- [x] 审批接管 composer 形态:琥珀条+模型理由+命令块键盘可达(当前浮卡形态可保留)——dsh ApprovalPanel
- [x] ANSI 转义渲染(终端输出着色)——dsh ansi.ts
- [x] 图片 Lightbox(点击放大)——dsh ImageLightbox
- [x] 会话拖拽排序(manual order)——dsh WorkspaceBrowser
- [x] 设置外观区独立(主题三态 + 密度)——dsh AppearanceRow
- [x] 分页加载更早历史 + 锚定保位(不跳视口)——dsh pagingAnchor
- [x] CJK 粗体渲染优化 + 代码字体栈去裸 monospace(Windows SimSun 问题)——dsh cjkFriendlyStrong
- [x] 增量 markdown 流式渲染(除尾部 2 块冻结缓存;流式期间代码围栏纯文本)——dsh incremental.ts

## P2(远期/评估)

- [x] Trajectory 第二视图(时间轴/台账搜索)——dsh ui-trajectory
- [x] 问题接管 composer(AskUserQuestion 多题步进/单选/跳过/最小化)——dsh QuestionComposer
- [x] 工具六卡片体系细分(DiffBlock 行号/ReadBlock 高亮/SearchBlock 分组/WebBlock 引用)——dsh ToolRow
- [x] 子调用递归树 + Inspect 跳转——dsh ToolCallTree
- [x] 模型自动重试行(倒计时/重试计数)——dsh ModelRetryItem
- [x] 压缩标记卡 + 上下文注入行——dsh CompactionItem
- [x] 消息点赞/点踩反馈——dsh MessageFeedbackActions
- [x] 上下文环形表点击开分解面板(system/tools/messages 三色)——dsh ContextMeter
- [x] composer 底部统计条(turns/steps/LLM 时间/工具时间/TTFT 均值)——dsh StatsLine
- [x] 设计令牌体系完整 alias 层(Figma 级)——dsh design-platform.css
- [x] 输入 undo/redo 事务(chip 感知)——dsh input machine
- [x] IME 组合守卫完善(keyCode 229/compositionend 10ms 延迟/Safari)——dsh InputBar

## 已对齐(不重做)

布局三栏/侧栏折叠/hero 空态/会话重命名删除fork/斜杠补全/图片附件(粘贴+拖放)/审批 diff/端点模板/Skills-Rules-CLAUDE.md/水位环形图/导出/命令面板/断线对账/虚拟滚动/reduced-motion/双语 UI/favicon/错误 Toast/页面标题

## 待修问题(2026-08-21 全链路回归后遗留)

- [ ] **上下文隔离端到端验证**:0.1.4 已实现 contextScope 三档(全量/仅项目/纯净,设置页模型 tab),UI 选中回路已验证;「仅项目/纯净」两档下模型侧确认无全局 CLAUDE.md/skills/hooks 注入的完整实测未做(需要一次模型问答对比),用户遇到跨工作区记忆时可先切「仅项目」验证
- [ ] **运行时设置不持久化**:contextScope/effort/model/workspace 等都是 server 内存态,重启 ccweb 后回到默认(全量/null);应落盘到本地配置文件(如 ~/.claude/ccweb-settings.json 或工作区 .ccwebrc)
- [ ] **生成时视口偶发不跟随**:长回复期间虚拟滚动未自动贴底,新内容在视口外(用户需手动滚底/点回到底部);复现路径:发长文任务后立刻切走再切回
- [ ] **AskUserQuestion 选项卡接管未实测**:代码在(C2),需要模型主动反问的场景构造
- [ ] **图片附件/Lightbox 端到端未测**:纯文本模型限制,粘贴/拖放入口 UI 在
- [ ] **ANSI 彩色输出 live 未触发**:解析器有 6 单测,真实 Bash 彩色输出场景未跑
- [ ] **会话拖拽排序无自动化测试**:纯前端 localStorage 逻辑
- [ ] **主 chunk 仍有余量**:297KB(gzip 95KB),diff/虚拟滚动等还可再拆

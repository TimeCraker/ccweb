# ccweb — Claude Code Web Console · Stage Spec

> 工作名 `ccweb`(npm 包名同),发布前可改。状态:**P0 进行中**。
> 定位:**企业级、可上市的本地 Web 控制台**——大厂开发工具的精度与体验,驱动真 Claude Code runtime。

---

## 1. 产品定义

**一句话**:`npx ccweb` 一条命令,在浏览器里获得一个专业级 Claude Code 控制台——会话管理、实时指标(轮数/TTFT/速度/缓存/上下文水位)、可视化审批、全可视化设置。

| 维度 | 决策 |
|------|------|
| 产品标准 | **可上市的企业级工具**:质量门逐期把守,非"先能用后打磨" |
| 第一优先 | **GUI 用户体验友好度**——所有取舍 UX 优先 |
| 目标用户 | Claude Code 开发者(多端点/中转用户、国内用户、团队) |
| 运行形态 | 本地 Node 服务(127.0.0.1:3477)+ 浏览器;不做云端托管 |
| 核心差异化 | ① 真 Claude Code runtime——`~/.claude` 的 memory/skills/rules/MCP 原样生效 ② 指标面板全面且口径权威 ③ 上下文水位可视化(CC 用户刚需)④ 端点/模型/权限全可视化配置 |
| 非目标 | 多用户/鉴权、云端部署、移动端(P4 前)、自研 agent runtime |

## 2. 技术架构

```
┌─ 浏览器 (React 18 + Vite + TypeScript + Tailwind + zustand)
│    左:会话侧边栏 │ 中:消息流 │ 右:上下文/指标面板 │ 底:输入区+指标条
│    全局:命令面板(Ctrl+K) · 审批弹窗 · 设置页 · Toast · 主题
│         ↕ WebSocket(JSON 双向,§4 协议;心跳+自动重连+断线重放)
└─ 本地服务 (Node 20+ / TS / Hono + ws)
     ├─ @anthropic-ai/claude-agent-sdk  ← query() 流式输入模式 + includePartialMessages
     │     · canUseTool 挂起 → WS 推浏览器 → 回执 resolve(断线缓存重放)
     │     · settingSources 默认全载(~/.claude 全套生效)
     │     · env: { ...process.env, ANTHROPIC_BASE_URL… } (整体替换,必须展开)
     │     · SDK 捆绑 claude.exe,用户无需本机安装 CLI
     ├─ 会话:listSessions / getSessionMessages / resume / forkSession / renameSession
     ├─ 上下文:getContextUsage() 实时水位
     └─ 设置:环境快照读写 + 端点模板(兼容 cc-toolkit/settings/*.json)
```

**分发**:pnpm monorepo(`apps/server` + `apps/web`);npm 包只发 server,内嵌 web 预构建产物 → `npx ccweb` 零构建。

**流式输入模式(prompt 传 AsyncGenerator)的理由**:软中断 `q.interrupt()` 仅此模式可用;多轮持续对话免重启 query;Web GUI 的"停止/继续"语义依赖它。

## 3. UI/UX 设计规范(企业级标准)

### 3.1 设计基调
- **Linear 系审美**(开发者工具公认高地):暗色为主、灰阶层次分明、单一 accent 色、1px 精细边框、轻玻璃态侧栏、120-200ms 微动效(cubic-bezier 平滑)、无花哨渐变
- 深浅色双主题跟随系统 + 手动切换;字号/间距 4pt 栅格;等宽字体代码区
- 信息密度可调(紧凑/舒适)

### 3.2 布局
```
┌──────┬──────────────────────────┬──────────┐
│会话栏 │  消息流(虚拟滚动)         │ 上下文面板 │
│      │  · 用户/助手/thinking折叠  │ ·水位环形图│
│      │  · 工具卡片(参数/结果/diff)│ ·todos    │
│      │  · 审批卡片内嵌            │ ·会话统计 │
│      ├──────────────────────────┴──────────┤
│      │  输入区(自适应高/文件拖放/@提及) + 指标条 │
└──────┴─────────────────────────────────────┘
```

### 3.3 交互模式(大厂工具标配,全量实现)
- **命令面板 Ctrl+K**:新建会话/切模型/切端点/开关主题/清屏/导出… 全功能可达
- **键盘优先**:Enter 发送 / Shift+Enter 换行 / **Esc 中断** / Ctrl+K 面板 / Ctrl+, 设置 / Ctrl+B 侧栏;输入框 `?` 提示快捷键
- **状态完整矩阵**:每个异步操作必有 loading(skeleton/spinner)→ 空态(引导文案+CTA)→ 错误态(可重试+详情折叠);禁止裸转圈
- **微交互**:打字机平滑(节流合帧)、指标条实时数字滚动、工具卡片展开动效、消息操作按钮(hover 显隐:复制/重发)
- **可信中断**:中断立即生效有反馈(interrupt 回执显示被取消/仍排队的消息)
- **审批体验**:diff 语法高亮、命令解释(高危标红)、"总是允许"持久化提示、批量审批
- Toast 通知(错误/完成);页面标题未读点

### 3.4 可靠性(产品级)
- WS 断线自动重连(指数退避)+ 重放 pending 审批;重连后状态对账(diff 补发)
- 会话崩溃/服务重启 → 自动恢复(servers 侧会话注册表持久化到磁盘)
- 长会话虚拟滚动;消息列表 memo 化;首屏 < 1s(本地资源)

### 3.5 质量门(每期必须过,非最后打磨)
| 门 | 标准 |
|----|------|
| 测试 | server 单测(vitest,覆盖协议/指标/审批状态机);web 组件测试;关键路径 e2e(Playwright) |
| 类型 | strict TS,零 any;CI lint+typecheck+test+build 四绿 |
| 无障碍 | 键盘全可达、焦点管理(弹窗陷阱)、对比度 AA、ARIA 标注 |
| i18n | UI 文案中英双语(默认跟随系统),zh-CN/en-US 资源包 |
| 性能 | 打字机无可感卡顿;10k 消息会话滚动 60fps;内存不随消息数线性涨 |

## 4. WebSocket 消息协议(v1)

```
C→S  { t:"prompt", sessionId?, text } | { t:"interrupt" } | { t:"abort" }
C→S  { t:"permission.resolve", requestId, allow, updatedInput?, always? }
C→S  { t:"session.new"|"list"|"open",id |"fork",id|"rename",id,title }
C→S  { t:"settings", patch }        // model/effort/permissionMode/endpoint
C→S  { t:"ping" }
S→C  { t:"init", sessionId, model, endpoint, mcpServers[], skills[], theme? }
S→C  { t:"delta", sessionId, kind:"text"|"thinking"|"tool_json", … }
S→C  { t:"message", sessionId, sdkMessage }          // 完整 SDK 消息
S→C  { t:"permission.ask", requestId, toolName, input, suggestions? }
S→C  { t:"metrics", sessionId, … }                    // §5 口径
S→C  { t:"context", sessionId, usage }                // getContextUsage 快照
S→C  { t:"sessions", list[] } | { t:"error", code, message, retry? }
```
协议原则:所有消息带 `seq` 序号支持重连对账;错误结构化(code/message/retry),前端据此渲染错误态。

## 5. 指标口径(全部来自已核实的 SDK 字段)

| 指标 | 来源 | 口径 |
|------|------|------|
| 轮数 | 会话内用户消息计数 | 简单计数 |
| 累计 token / 成本 | **result.modelUsage**(权威,含 subagent)+ total_cost_usd | 每轮 result 后覆盖更新 |
| 实时 token | assistant usage 四字段,**按 message.id 去重**(per-step output_tokens 是占位符,不用于累计) | 去重累加展示 |
| TTFT | stream_event `ttft_ms`(实时)/ result `ttft_ms`+`ttft_stream_ms`(终值) | 直接读字段 |
| tokens/s | output_tokens ÷(duration_ms − ttft_ms)× 1000 | 服务端计算 |
| 缓存命中率 | cache_read ÷(cache_read+cache_creation+input) | 服务端计算 |
| 上下文水位 | getContextUsage() | 环形图+剩余估算 |

## 6. 风险与对策

| 风险 | 对策 |
|------|------|
| 第三方端点兼容性(GLM 等) | env 透传是官方路径;P0 验收即测真实 GLM;不依赖已知不兼容点(tool search) |
| `env` 整体替换语义 | 统一 `buildAgentEnv()` 强制 `{ ...process.env, … }` |
| optional deps 被镜像/包管理器跳过 | 启动自检+友好报错;fallback `pathToClaudeCodeExecutable`;CI 矩阵覆盖 |
| per-step usage 陷阱 | 指标层只信 result.modelUsage |
| SDK 快速迭代 | 锁 minor;只用文档化 API;capabilities 字段做特性探测 |
| 审批挂起期间断线 | 服务端缓存 pending,重连重放;超时默认 deny(可配) |
| UX 范围蔓延 | 每期 UX 项列验收清单,未列项进 backlog 不进本期 |

## 7. 分期(每期过 §3.5 质量门后合并)

**P0 骨架走通** — monorepo 脚手架 + Hono/ws 服务 + Agent SDK 流式输入模式 + React 壳(布局/主题/输入区)+ 文本流式打字机 + Esc 中断。验收:GLM 端点真实跑通一轮对话,CI 四绿。
**P1 核心体验** — 工具卡片/thinking 折叠/审批弹窗(diff 高亮/总是允许)/底栏指标条/上下文水位面板/消息操作。验收:含工具调用+审批的真实任务全流程,组件测试覆盖。
**P2 会话管理** — 侧边栏(resume/fork/重命名/搜索)/历史回放/崩溃恢复/断线重连对账。验收:刷新+断网重连+杀进程重启三场景恢复。
**P3 设置与面板** — 命令面板 Ctrl+K/设置页(模型/effort/权限/端点模板)/MCP 状态/i18n 双语。验收:UI 内切端点下一轮生效;全键盘可达。
**P4 发布** — README 双语+GIF / MIT+商标声明 / Playwright e2e / npm publish / Win+macOS CI 矩阵。验收:全新环境 `npx ccweb` 冷启动成功。

估 5-8 个工作日(AI-coding 密集节奏 3-4 天)。

## 8. 决策记录

- 定位**企业级可上市**(2026-08-19 用户拍板,UX 友好度第一优先)
- 名字 `ccweb`(短、npx 友好、避开 Claude 商标);端口 3477
- 后端 Hono+ws;前端自建轻组件+Tailwind(Linear 系视觉),不引 shadcn 全家桶
- UI 实现阶段调用 design-skill / ui-ux-pro-max 查细则
- 单机体验做到极致;多用户/云端明确不做

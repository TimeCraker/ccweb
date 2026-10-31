# Claude Code 操作覆盖矩阵（Stage 6.7，持续验收）

基线 B = Windows x64 / SDK **0.3.314** / 随包 CLI **2.1.314**。本表所有行均绑定 B，不自动外推到全局 CLI、未来版本或其他账号。原生证据见 [12 组二进制帮助](audit/2026-10-31/runtime-capabilities.json)，由 `apps/server/scripts/capture-runtime.mjs` 生成。在线文档用于对照，可能含比 B 更新的能力。

状态「已实现」不等于真实验收通过；「未验」不等于原生不支持。源码、安装包、模拟协议、实际模型、人工授权分别记录。A–G 整包仍未关闭。

| 操作（均为 B） | 原生行为与 GUI 入口 | SDK / 原生承载 | 当前实现与证据 | 限制/待验 |
| --- | --- | --- | --- | --- |
| 提问、多轮 | 输入区、消息流 | streaming query | 源码真实 GLM-5.3 文件任务成功，刷新恢复 | 最终安装版待复验 |
| 文件引用 | 输入 @、文件搜索 | 工作区扫描、原生 Read | 既有 GUI；浏览器回归覆盖 | 非文本附件导入待专项 |
| 图片、粘贴、拖放 | 输入区附件与预览 | 原生 image block | 已实现；本轮未做视觉模型理解验收 | 模型支持不同 |
| 原生问答 | 对话内问题卡 | canUseTool / AskUserQuestion | 模拟问答浏览器通过 | 真实模型主动发起待验 |
| 手动/plan/auto/运行一切 | 输入卡模式、设置 | 原生 permissionMode / 回执 | 模拟采纳/拒绝/不支持及真实手动审批通过 | auto 真实成功、计划完整闭环待验，不能映射绕过审批 |
| 模型/effort | 输入区、连接设置、发现模型 | supportedModels/setModel/新会话 effort | 自定义模型真实任务通过；原生发现已接入 | 模型清单不是账号授权证明；effort 明示新会话 |
| 上下文/压缩 | 详情、/context；/compact 经已发现命令 | getContextUsage / query | 0/超限/缺失统一解析与单测 | 真实压缩待验；CLI transport 握手时间不可得 |
| 新建/清空 | 新会话、/clear | 新 SDK 会话；处理 conversation_reset | 原生周期重置模拟回归 | 不会删用户文件 |
| 恢复 | 会话栏、刷新附着 | resume/进程 registry | 真实任务刷新恢复；模拟断线/启动前刷新通过 | 服务重启不自动重跑 |
| 分叉 | 会话/消息入口 | forkSession | 已有会话末尾分叉 | 任意消息分叉仍待补；不冒称精确回退 |
| 文件回退 | 运行详情→任务与回退→预览/确认 | enableFileCheckpointing/rewindFiles | 新增 GUI，真实待验 | 只回退原生跟踪文件；Bash 写入与对话不在此操作内 |
| 对话回退 | 原生终端 /rewind | TUI | 原生承载已具备 | 已认证命令路径未验 |
| 后台任务/子代理 | 运行详情任务列表、停止 | task_* / stopTask | 新增 GUI，按 task/run 归属并忽略旧 run | 真实子代理、恢复持久任务待验 |
| 运行队列/停止 | 输入卡、队列卡 | 服务端队列/interrupt | 模拟暂停、撤销、失败恢复通过 | 并行工具耗时不简单相加为总时间 |
| Skills | 设置 Skills：来源、说明、调用名、正文/源码 | 原生文件及 Skill | CRUD/焦点/取消回归；支持可选元数据 | 新版本原生调用待验；发现不冒称已加载 |
| 自定义 Commands | 独立设置分类、嵌套调用 | 原生 .claude/commands | GUI 创建并调用模拟回归 | 最终真实调用待验 |
| 插件 | 插件来源只读资源；原生终端插件清单与 /plugin | 原生插件系统 | 清单入口已实现 | 安装/升级交互未验，不自动调用用户外部服务 |
| 指令/规则/记忆 | 设置→上下文与规则 | 用户/项目/父级/托管文件 | 父级只读及拒绝写入测试；保留未知字段 | 子目录/@ 引用按原生惰性加载；未实现完整实际上下文树 |
| MCP 配置 | 用户/项目 JSON 编辑、来源 | 原生文件，遮罩保留 | 配置冲突/未知字段/秘密不回传测试 | 托管/claude.ai 等账号来源由 native status 报告 |
| MCP 运行控制 | 状态、错误、工具、重连/启停 | mcpServerStatus/reconnect/toggle | 新增 GUI 与 SDK 契约测试 | 本地可控服务真集成待验 |
| MCP OAuth | 原生终端 /mcp（帮助含 mcp login） | 原生 TUI | 可留在 ccweb 授权 | 需用户登录；未授权执行，不计成功 |
| Hooks 配置/诊断 | 独立 Hooks 分类、事件状态/输出 | 文件 + hook_started/progress/response | 结构校验与 GUI 已实现 | 本地 Hook 成功/失败/取消待真集成 |
| 权限规则 | 设置→运行与权限；原生 /permissions | SDK 模式 + 原生 TUI | 模式有 GUI；规则编辑依赖 TUI | 细粒度权限规则 GUI 仍欠缺 |
| 工作目录/附加目录 | 侧栏目录选择；原生 /add-dir | cwd / TUI | 工作区切换和隔离有回归 | 附加目录 GUI 尚缺；TUI 状态不混入 SDK |
| 登录/登出/认证 | 原生终端操作选择器；TUI /logout | 固定随包 auth/TUI | auth 帮助实测；登录入口实现 | 外部登录由用户授权，真实未验 |
| 诊断 | 设置就绪检查、原生终端 doctor | 随包 --version / doctor | 二进制真实启动、帮助已验 | 原生诊断详情待真验 |
| 安装/升级 | 关于与更新、Dependabot/CI | 包管理器及锁定 SDK | 不替换当前进程，不调用全局 CLI | 本轮未发布/推送/远端 CI；自动升级安装 GUI 未实现 |
| 导出/导入 | Markdown 导出；原生 /import | 浏览器文件、原生 TUI | 导出已实现 | 对话 JSON 导入、完整脚本管道 GUI 未实现 |
| 终端键盘/IME/粘贴/尺寸 | 原生终端 xterm | node-pty / ConPTY | 真 TUI 菜单、按键、尺寸、取消 3/3 | 中文 IME 真实组合输入、粘贴和已认证快捷键仍待验 |
| 管道/脚本/print | 现有 WS prompt 可脚本调用；TUI 的 shell 模式 | SDK/原生 | 服务脚本协议已有 | 任意 CLI 参数和 stdin 管道尚无 GUI，未计覆盖 |
| 原生连接归属 | 顶栏原生终端；每标签页 sessionStorage 能力令牌 | 独立进程、固定二进制 | 非目标令牌拒绝；刷新恢复 | SDK/原生当前按工作区互斥；原生主动跨目录/附着后台需进一步约束 |
| 账号/平台能力 | 原生 TUI 展示实际可用命令 | 原生 runtime | 不伪造 Claude 订阅功能可用性 | 云评审/远程公开/共享/费用升级不为验收自动执行 |

官方对照：[CLI](https://code.claude.com/docs/en/cli-reference)、[会话命令](https://code.claude.com/docs/en/commands)、[Skills](https://code.claude.com/docs/en/skills)、[指令](https://code.claude.com/docs/en/memory)、[设置优先级](https://code.claude.com/docs/en/settings)、[Hooks](https://code.claude.com/docs/en/hooks)、[用量](https://code.claude.com/docs/en/agent-sdk/cost-tracking)。技术承载：[node-pty](https://github.com/microsoft/node-pty)、[xterm API](https://xtermjs.org/docs/api/terminal/classes/terminal/)。

# Claude Code 操作覆盖矩阵（Stage 6.7，持续验收）

基线 B = Windows x64 / SDK **0.3.314** / 随包 CLI **2.1.314**，业务代码 **8e59fcc**。本表所有行均绑定 B，不自动外推到全局 CLI、未来版本或其他账号。原生证据见 [15 组二进制帮助](audit/2026-10-31/runtime-capabilities.json)，由 `apps/server/scripts/capture-runtime.mjs` 生成。在线文档用于对照，可能含比 B 更新的能力。

状态「已实现」不等于真实验收通过；「未验」不等于原生不支持。源码、安装包、模拟协议、实际模型、人工授权分别记录。最终分层证据与未验项见 [验收报告](audit/2026-10-31/STAGE67_ACCEPTANCE.md)。

| 操作（均为 B） | 原生行为与 GUI 入口 | SDK / 原生承载 | 当前实现与证据 | 限制/待验 |
| --- | --- | --- | --- | --- |
| 提问、多轮 | 输入区、消息流 | streaming query | 安装版真实 GLM-5.3 多请求任务、审批、Node 测试 2/2、刷新恢复通过 | 估算费用不等于提供商账单 |
| 文件引用 | 输入 @、文件搜索 | 工作区扫描、原生 Read | 既有 GUI；浏览器回归覆盖 | 非文本附件导入待专项 |
| 图片、粘贴、拖放 | 输入区附件与预览 | 原生 image block | 上传/重试/恢复回归通过；原生记录与 PNG SHA256 一致 | **真实理解失败**：GLM 将纯红图回答蓝色，不计视觉模型能力通过 |
| 原生问答 | 对话内问题卡 | canUseTool / AskUserQuestion | 安装版实际问题卡选择→提交→模型继续成功 | 不代替用户作业务选择 |
| 手动/plan/auto/运行一切 | 输入卡模式、设置 | 原生 permissionMode / 回执 | 真实手动审批、auto 写入成功；626 字计划采纳前文件不变、采纳后实际写入且切回 default | 不支持错误路径为模拟契约；未换不可用账号强造真实拒绝；运行一切需明确确认 |
| 模型/effort | 输入区、连接设置、发现模型 | supportedModels/setModel/新会话 effort | 自定义模型真实任务通过；原生发现已接入 | 模型清单不是账号授权证明；effort 明示新会话 |
| 上下文/压缩 | 详情、/context；/compact 经已发现命令 | getContextUsage / query | 0/超限/缺失统一解析与单测；安装版 GUI 实际压缩 success，15831→3901 tokens、55356ms | CLI transport 握手时间不可得 |
| 新建/清空 | 新会话、/clear | 新 SDK 会话；处理 conversation_reset | 原生周期重置模拟回归 | 不会删用户文件 |
| 恢复 | 会话栏、刷新附着 | resume/进程 registry | 真实任务刷新恢复；模拟断线/启动前刷新通过 | 服务重启不自动重跑 |
| 分叉 | 会话/消息入口 | forkSession(upToMessageId) | 安装版 GUI 真实精确分叉，原生文件在选定用户消息处截断、之前工具记录保留、之后未复制；新旧 ID 不同 | SDK 明示分叉不复制文件 undo history |
| 文件回退 | 运行详情→任务与回退→预览/确认 | enableFileCheckpointing/rewindFiles | 安装版真实预览→确认执行，两文件 SHA256 恢复运行前基线 | 只回退原生跟踪文件；Bash 写入与对话不在此操作内 |
| 对话回退 | 原生终端 /rewind | TUI | 安装版恢复隔离分叉会话，选择并确认 Restore conversation，移除所选轮次、输入框保留待修改文字，未自动再提交 | 与 GUI 文件回退操作分开；分叉本身不复制文件 undo history |
| 后台任务/子代理 | 运行详情任务列表、停止 | task_* / stopTask | 实际 general-purpose 后台子代理完成 CHILD67_OK，task_notification 与刷新列表一致；实际后台 Bash 经 GUI 停止返回 stopped | 未暴露子流不造 Token 样本；后台进程跨服务重启恢复未验 |
| 运行队列/停止 | 输入卡、队列卡 | 服务端队列/interrupt | 模拟暂停、撤销、失败恢复通过 | 并行工具耗时不简单相加为总时间 |
| Skills | 设置 Skills：来源、说明、调用名、正文/源码 | 原生文件及 Skill | 安装版 GUI 新建并原生调用 e2e-proof；CRUD/焦点/取消回归 | 发现不冒称已加载 |
| 自定义 Commands | 独立设置分类、嵌套调用 | 原生 .claude/commands | 安装版 GUI 创建 e2e:integration，实际调用 Skill→MCP 成功 | 内置命令区分 GUI/SDK/TUI 承载 |
| 插件 | 插件来源只读资源；原生终端插件清单与 /plugin | 原生插件系统 | 安装版清单实际执行退出 0：No plugins installed | 安装/升级交互未验，不自动调用用户外部服务 |
| 指令/规则/记忆 | 设置→上下文与规则 | 用户/项目/父级/托管文件 | 父级只读及拒绝写入测试；保留未知字段 | 子目录/@ 引用按原生惰性加载；未实现完整实际上下文树 |
| MCP 配置 | 用户/项目 JSON 编辑、来源 | 原生文件，遮罩保留 | 配置冲突/未知字段/秘密不回传测试 | 托管/claude.ai 等账号来源由 native status 报告 |
| MCP 运行控制 | 状态、错误、工具、重连/启停 | mcpServerStatus/reconnect/toggle | 安装版本地 stdio echo 实际调用，connected→disabled→connected、重连通过；错误 Connection closed 实际显示 | 不自动触碰用户全部外部服务 |
| MCP OAuth | 原生终端 /mcp（帮助含 mcp login） | 原生 TUI | 可留在 ccweb 授权 | 需用户登录；未授权执行，不计成功 |
| Hooks 配置/诊断 | 独立 Hooks 分类、事件状态/输出 | 文件 + hook_started/progress/response | 安装版实际 success/0、error/2；30 秒 Hook 约 4.26 秒取消 | Hook 失败不篡改成模型失败，分别展示 |
| 权限规则 | 设置→运行与权限→编辑权限规则与附加目录 | permissions 分区 + 原生 TUI | allow/ask/deny 逐行 GUI 与共享源码草稿；只改分区、保留未知字段，浏览器回归 | 新会话生效；组织托管来源只读 |
| 工作目录/附加目录 | 侧栏目录选择；权限规则附加目录编辑 | cwd / additionalDirectories / TUI | GUI 已实现，切工作区和分区保存回归 | 不是安全沙箱；TUI 状态不混入 SDK |
| 登录/登出/认证 | 原生终端操作选择器；TUI /logout | 固定随包 auth/TUI | 安装版 auth status 实际报告继承第三方 Token（仅变量名，无秘密值）；登录入口实现 | 用户本轮明确暂不官方登录/OAuth，未验，不计成功 |
| 诊断 | 设置就绪检查/真实小型连通、原生终端 doctor | 随包 --version / doctor / bounded query | 安装版 doctor 退出 0、无安装问题；GUI GLM 连通 2600ms、未重试、未工具 | doctor 明示当前第三方端点、官方订阅未登录，Remote Control 无法核验 |
| 安装/升级 | 关于与更新、原生操作→独立安装维护、Dependabot/CI | 私有二进制副本执行 install；锁定 SDK 通过依赖升级 | 安装目标 GUI 与确认保护、maintenance help 安装版回归；SDK 不原地自改 | 未真实改全局 CLI；未发布/推送/远端 CI |
| 导出/导入 | Markdown 导出；原生 import/custom argv | 浏览器文件、原生 TUI | Markdown 导出已实现；实际 import 帮助核对：从 codex/gemini/cursor 导入配置，支持 dry-run | 不是通用对话 JSON 导入；配置导入写入与交互未验，不能仅凭承载算通过 |
| 终端键盘/IME/粘贴/尺寸 | 原生终端 xterm | node-pty / ConPTY | 安装版 TUI 进入 GLM 输入界面、中文文本、Ctrl+U/Ctrl+C、/help 命令页、/context、/permissions、尺寸变化和结束已操作；刷新重放回归 | 文本注入不等于物理中文 IME 组合输入；系统剪贴板粘贴未验 |
| 管道/脚本/print | 原生终端→高级参数与 stdin | 固定 CLI spawn pipe，不模拟 PTY EOF | 安装版真实 --print 中文 stdin 返回 PIPE67_OK 中文、退出 0 | 阻止在 SDK 二进制直接 install/update；其他副作用参数由用户明确选择 |
| 原生连接归属 | 顶栏原生终端；每标签页 sessionStorage 能力令牌 | 独立进程、固定二进制 | 非目标令牌拒绝、刷新恢复；服务整体互斥、agents 所有权检查 | 仅忽略本服务持有的 SDK PID，未知外部 PID 拒绝，不自动杀用户进程 |
| 账号/平台能力 | 原生 TUI 展示实际可用命令 | 原生 runtime | 不伪造 Claude 订阅功能可用性 | 云评审/远程公开/共享/费用升级不为验收自动执行 |

官方对照：[CLI](https://code.claude.com/docs/en/cli-reference)、[会话命令](https://code.claude.com/docs/en/commands)、[Skills](https://code.claude.com/docs/en/skills)、[指令](https://code.claude.com/docs/en/memory)、[设置优先级](https://code.claude.com/docs/en/settings)、[Hooks](https://code.claude.com/docs/en/hooks)、[用量](https://code.claude.com/docs/en/agent-sdk/cost-tracking)。技术承载：[node-pty](https://github.com/microsoft/node-pty)、[xterm API](https://xtermjs.org/docs/api/terminal/classes/terminal/)。

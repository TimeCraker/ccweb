# Stage 6.7 同版本验收与需求交付

业务版本 **8e59fcc**，Windows x64，SDK **0.3.314**，随包 Claude Code **2.1.314**。交接基线 3df8311，启动工作树干净；之后改动均保留。本报告和证据提交不会改变业务包内容。**不能据此宣称所有账号、所有 TUI 操作或未来版本完全等价。**

## 需求工作包

| 包 | 交付与验收 | 状态 |
| --- | --- | --- |
| A 配置 | 所有类型草稿保护、关闭/来源/分类切换确认、焦点返回、IME Escape 保护；原子分区保存、未知字段保留、磁盘冲突比较及显式基线；父级/托管/自动记忆/插件来源、Skill 可选原生字段；权限与附加目录 GUI；当前值与新会话默认值、原生认证隔离 | 本地验收关闭。浏览器资源 CRUD/中文逐字输入/取消/冲突/只读回归，真实 Skill/Command 调用。完整动态加载树由原生 /context 核对，文件发现不冒充已加载 |
| B 指标 | 请求级开启/首内容/结束/Token 样本、主子归属、原生 TTFT/API/轮次时间、等待分离、持久化；上下文统一支持零/超限/未知，失败与重置周期回归 | 本地验收关闭。真实审批等待 4253ms，显示速度 98.84449394403453 与主请求 Token/输出耗时独立计算一致；重启样本/Token 相同。原生没有暴露的子流和逐项工具耗时保持缺失 |
| C 审查与控制 | 结果终态/工具结果/独立验证分层，Write 原文与 MultiEdit 差异、审批期间外部变更保护；附件回执/重试/导航保护；计划/反问/队列/停止、精确消息分叉、文件回退、任务列表/停止 | 本地验收关闭。真实模型→审批→测试→审查→刷新/重启恢复；auto/计划/反问、后台子代理完成和后台进程停止、精确分叉、实际文件回退均有证据 |
| D 集成与首次使用 | GUI 连接/模型/认证来源/就绪检查/有限连通；MCP 来源/工具/错误/启停重连；Hooks 配置和真实执行诊断 | 本地验收关闭。安装版本地 MCP echo、Hook success/0、error/2、慢 Hook 取消；小型连通 2600ms、无工具、无持久会话、未重试 |
| E 原生覆盖 | 常用 GUI + 固定二进制 ConPTY/xterm，安全能力令牌、重放/刷新、尺寸/按键、中文文本、真实 stdin、高级参数、独立 CLI 维护；15 组实际帮助，逐项矩阵 | 实现及本地技术证据已交付，**整包不勾选**：Claude 官方账号登录/OAuth、订阅/远程能力、物理 IME 和个别原生操作未验，详见能力矩阵 |
| F UI/UX | 保留 TC、铜橙/石墨、深浅主题、对话优先；四种桌面宽度、空态/运行/审批/计划/反问/失败/配置/冲突回归；原生缩放 125%/150% | 技术验收已执行，**整包不勾选**：用户视觉认可、物理中文 IME 组合输入仍需人工，不能由 Agent 勾选代替 |
| G 分发与交付 | 同业务版本质量门→源码浏览器→真实 tarball 隔离安装浏览器→随包二进制→真实任务；精确版本升级约束、CI 与文档 | 本地交付关闭。远端 CI/升级 PR 未运行，未推送/发布；外部与未验项保留，不表示 E/F 全部通过 |

整包关闭 **5/7（A/B/C/D/G）**，E/F 留待人工与账号验收；实施完成、模型判断正确、技术通过、审美认可分别报告。

## 同版本验证

- `corepack pnpm check`：lint、TypeScript、57 项单元/协议测试（server 34 / web 23）、构建通过。
- Edge 源码 **30/30**，实际安装版 **30/30**，零 skipped/flaky/unexpected。大部分业务场景使用明确标注的模拟 SDK；native.spec 的 ConPTY/固定二进制路径实际运行。
- 真实 GLM-5.3 任务：两次 Write、一次 Bash 审批；实际 Node 测试 2/2，独立重跑 2/2；刷新恢复。结果截图中的“尚未执行独立验证”是产品记录边界，独立验证由本轮验收另行执行，未伪造回写产品状态。
- 回退：真实 `rewindFiles` 预览与确认执行，两文件 SHA256 恢复到写入前基线。仅文件，不回退对话，不保证 Bash 修改可追踪。
- 分叉：GUI 发出选定用户 UUID；原生新文件截到该用户消息，之前 3 个工具调用保留、之后调用未复制；新旧会话 ID 不同，没有启动模型。不能简单期待“零工具”，因为选中的是多轮历史中的第二个用户消息。
- 压缩：GUI `/compact` 实际收到 compact_result success / compact_boundary，原生 pre_tokens 15831、post_tokens 3901、duration_ms 55356，未执行文件修改。另在这个隔离分叉中用原生 TUI `/rewind` 选择并确认 Restore conversation，返回到该输入前，待恢复文字仅放在输入框，没有再次提交模型。
- 模式：auto 实际创建 `AUTO67_OK`；计划正文 626 字，采纳前两份业务文件未变，采纳后写入 `PLAN67_OK`，回执模式 default；AskUserQuestion 实际卡片提交并继续。
- 集成：GUI 创建 Skill、Command 和本地 MCP/Hook 配置；实际 Skill→ToolSearch→echo；MCP connected→disabled→connected，重连成功；Hook 成功退出 0、受控失败退出 2；慢 Hook 约 4259ms 停止，无模型完成结果。
- 后台：实际 general-purpose 子代理返回 CHILD67_OK，原生 completed 通知与刷新后的任务列表一致。另一次获批无操作 30 秒 Bash，经 GUI 停止收到原生 stopped；不把父轮次结束当作子任务完成。
- 重启：只终止本轮 3497 安装服务的已核实进程树；重启后恢复 4 张工具卡、845 输出 Token、2 份请求样本，不自动重跑。默认 3477 原用户进程保持原状，不计作新版本后端验收。
- 原生：安装版 TUI 实际进入 GLM 输入界面；中文文本经 xterm 输入至真实 TUI，Ctrl+U、Ctrl+C、/help、命令页、/context、/permissions、尺寸变化与结束进程已操作。中文文本注入不等于 Windows 物理 IME 组合输入通过。
- 原生诊断：auth/doctor/plugins/agents 实际运行，退出 0。doctor 明确报告第三方端点、Claude 订阅未登录及远程控制不可核验；无插件安装、agents 空清单。
- 管道：GUI 高级参数与真正 stdin pipe，实际 CLI `--print` 返回 PIPE67_OK 中文、退出 0；没有用 PTY 文本模拟 EOF。
- 原生缩放：隔离 Edge 扩展通过浏览器 `tabs.setZoom/getZoom` 设为 1/1.25/1.5；DPR 同步、innerWidth 1574/1259/1049、CSS zoom=1、visualViewport.scale=1；设置区无内部横向溢出，关闭按钮位于视口内。使用物理尺寸的 CDP 截图避免普通截图在 native zoom 下裁切。参考 [浏览器原生 API](https://developer.chrome.com/docs/extensions/reference/api/tabs#method-setZoom)。用户浏览器配置和扩展未修改。

原始分层结果、版本、包指纹和分叉边界：[最终 manifest](stage67-final-manifest.json)。真实事件 JSON 以 `stage67-final-*.json` 命名；较早 `stage67-source-*` 为增量证据，不能冒充最后业务版本。

## 已知失败、原生限制与未验

| 类别 | 实际结论与处理 |
| --- | --- |
| 真实失败：图片理解 | 上传 64×64 纯红 PNG，GLM 回答“蓝色 VISION67_OK”。原生会话记录中的图像 SHA256 与源文件完全一致（6e35e4c2…），附件上传/传输成功，**模型理解失败**。未盲重试、更换收费模型或把 result success 算理解正确。无法仅凭该样本确定服务商内部原因 |
| 外部账号 | Claude 官方登录、MCP OAuth 需本人登录授权；当前 GLM 不能证明订阅/组织托管/远程控制/平台账号功能可用。用户已明确选择“暂不登录，明确列为未验项”；未擅自登录、公开远程连接或提升费用 |
| Windows 人工输入 | Computer Use 先前无法可靠识别当前 URL，按技能“stop issuing app input”停止 Windows 窗口输入。技能：[SKILL.md](C:/Users/TimeCraker/.codex/plugins/cache/openai-bundled/computer-use/26.1027.30824/skills/computer-use/SKILL.md)。后来完成独立浏览器原生缩放，但未据此声称物理 IME 通过 |
| 人工视觉认可 | 已查看概念图、实际页面和新截图，保留既有设计；Agent 的技术验收不能替用户作审美认可 |
| 原生字段 | 子代理完成通知含 usage；本次 SDK 没给子代理 content stream Token/耗时配对，不填造子请求速度。恢复文件无 undo history 是 SDK 明示边界；TUI 状态与 SDK 快照分开 |
| 特定操作未验 | 配置导入写入、插件安装/升级、独立 CLI 全局安装未作副作用验收；入口/版本承载及帮助可用不等于这些交互已通过。配置导入是 CLI `import`（源 codex/gemini/cursor），不是通用对话 JSON 导入 |
| 平台/升级 | macOS/Linux、不同账号、未来 runtime、远端 CI 与 Dependabot 升级 PR 未验。升级必须维持精确 SDK manifest、重新跑契约/二进制/源码和安装浏览器，不在当前 SDK 二进制原地 update |

本轮排查并修复的最后业务缺陷：原生 agents 列表包含自己的空闲 SDK 进程，旧判断会误阻断新会话；现在按本服务持有的 PID 区分，未知外部写入者仍拒绝。另修复重新生成遗漏用户图片。两者均有回归；不终止用户进程解决误判。

## 分发、重现与截图

实际 tarball：`ccweb-console-0.1.4.tgz`，SHA256 **fd91f7096e0736ae768b18c5c7744a72020834b56b395f3e0c25a168bcacb7b8**；安装包 21 份 dist/public 文件逐字节与源码构建一致，精确 SDK 依赖 .3.314，随包 CLI 启动 2.1.314。

本地副本位于仓库忽略目录 `.ccweb-test/stage67-delivery/ccweb-console-0.1.4.tgz`。真实安装在仓库外临时隔离目录，不改用户全局 npm 安装和 Claude 配置。临时服务 3497；默认 3477 未重启。

核心可重现命令（PowerShell，先确认端口未占用，浏览器串行运行，不在测试中重建）：

```powershell
corepack pnpm install --frozen-lockfile
corepack pnpm check
corepack pnpm --filter ccweb-console test:runtime
node apps/server/scripts/capture-runtime.mjs docs/audit/2026-10-31/runtime-capabilities.json
$env:PLAYWRIGHT_CHANNEL = 'msedge'
$env:CCWEB_E2E_PORT = '3483'
corepack pnpm --filter @ccweb/web exec playwright test
# 在仓库外隔离安装实际 tgz；CCWEB_E2E_BIN 指向其 bin/ccweb.mjs，
# CCWEB_FIXTURE_ENTRY 指向源码 fixture-agent.js，再串行运行同一浏览器集。
# 真实模型测试需要已有合法连接；不能使用模拟数据替代模型结果。
git diff --check
```

关键实际截图：[结果审查](../../screenshots/stage67-installed-result.png)、[文件回退](../../screenshots/stage67-installed-rewind.png)、[计划采纳](../../screenshots/stage67-installed-plan.png)、[MCP](../../screenshots/stage67-installed-mcp.png)、[后台停止](../../screenshots/stage67-installed-task-stop.png)、[原生 TUI](../../screenshots/stage67-installed-tui.png)、[150% 原生缩放](../../screenshots/stage67-native-zoom-settings-1.5.png)、[图片失败](../../screenshots/stage67-installed-vision.png)、[重启恢复](../../screenshots/stage67-restart-after.png)。

**未推送、未公开发布、未运行远端 CI。** 后续先完成所需人工账号/IME/审美检查，再决定发布，不沿用历史“全部完成”。

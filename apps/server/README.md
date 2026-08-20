# ccweb

**Professional local web console for Claude Code** — 一个企业级的 Claude Code 浏览器控制台:会话管理、实时指标、可视化审批、全图形化设置。跑的是**真 Claude Code runtime**——你的 `~/.claude` 全套配置(memory / skills / rules / MCP)原样生效。

![ccweb main interface](https://raw.githubusercontent.com/TimeCraker/ccweb/main/docs/screenshots/main-dark.png)

![command palette (Ctrl+K)](https://raw.githubusercontent.com/TimeCraker/ccweb/main/docs/screenshots/palette.png)

---

## 中文

### 为什么

终端里的 Claude Code 很强,但缺少图形化的会话管理与观测。ccweb 用官方 **Claude Agent SDK** 驱动真正的 Claude Code 子进程,补上这一层:

- 🖥 **完整 GUI**:会话侧栏(搜索 / resume / fork / 删除 / 重命名 / 历史回放)、markdown + 代码高亮、工具调用卡片(命令输出默认展开)、thinking 折叠
- 📊 **实时指标条**:轮数 / TTFT / tokens/s / 缓存命中率 / 成本估算(口径以 SDK `result.modelUsage` 为权威)
- 🧭 **上下文水位**:环形图 + Token 构成三色条,高水位(>85%)主动警示
- 🛡 **可视化审批**:Edit 显示行级 diff(红删绿增)、高危命令标红、"总是允许"(会话级)
- ⚙️ **全图形设置**:模型热切换、effort、权限模式、**API 端点模板**(凭证不出本地)、Skills / 规则 / CLAUDE.md 查看
- 🖼 **图片支持**:粘贴 / 拖放 / 选择截图直接进对话(CC 视觉能力)
- 💾 对话一键导出 Markdown
- ⌨️ **键盘优先**:`Ctrl+K` 命令面板 · `Ctrl+N` 新建 · `Ctrl+B` 折叠侧栏 · `Esc` 中断 · `/` 斜杠命令补全
- 🌓 深浅双主题 · 中英双语 UI · 断线自动重连对账

### 快速开始

```bash
# 需要 Node.js 20+(SDK 自带 claude 二进制,无需单独安装 Claude Code CLI)
npx ccweb-console
# 或从源码
git clone https://github.com/TimeCraker/ccweb && cd ccweb
pnpm install && pnpm build && node apps/server/bin/ccweb.mjs
```

浏览器打开 `http://127.0.0.1:3477`。API 端点沿用你环境里的 `ANTHROPIC_BASE_URL` / `ANTHROPIC_AUTH_TOKEN`(或经设置页切换模板)。

---

## English

**ccweb** is a professional, open-source web console for Claude Code — built on the official **Claude Agent SDK**, it drives a real Claude Code runtime behind a full GUI: sessions, live metrics, visual approvals, and complete settings. Your entire `~/.claude` setup (memory / skills / rules / MCP) applies automatically.

- 🖥 **Full GUI** — session sidebar (search / resume / fork / delete / rename / history replay), markdown + syntax highlighting, tool-call cards (command output auto-expanded), collapsible thinking
- 📊 **Live metrics** — turns / TTFT / tokens-per-second / cache-hit rate / cost, sourced from SDK `result.modelUsage` (no estimates)
- 🧭 **Context gauge** — usage ring + token-composition bar, proactive warning above 85%
- 🛡 **Visual approvals** — line-level diffs for edits, dangerous commands flagged, session-scoped "always allow"
- ⚙️ **Everything configurable** — model hot-swap, effort, permission mode, endpoint templates (credentials never leave your machine), skills & rules & CLAUDE.md inspector
- 🖼 **Images** — paste, drag, or pick screenshots straight into the conversation
- 💾 One-click Markdown export
- ⌨️ **Keyboard-first** — `Ctrl+K` palette · `Ctrl+N` new session · `Ctrl+B` collapse sidebar · `Esc` interrupt · `/` slash-command autocomplete
- 🌓 Dark & light themes · bilingual UI · auto-reconnect with message reconciliation

### Quick start

```bash
npx ccweb-console   # Node 20+; bundles its own claude binary
```

Open `http://127.0.0.1:3477`. Endpoint credentials come from your environment (`ANTHROPIC_BASE_URL` / `ANTHROPIC_AUTH_TOKEN`) or any template in Settings.

---

## 架构 / Architecture

```
Browser (React 18 + Vite + Tailwind v4)
   ↕ WebSocket (seq 对账 + 自动重连)
Local server (Node ≥20 · Hono + ws)
   ↕ Claude Agent SDK — query() 流式输入模式
Claude Code runtime(继承 ~/.claude 全部配置)
```

- **软中断 / 多轮常驻**依赖 SDK 流式输入模式(`interrupt()` 仅此模式可用)
- 指标全部来自 SDK 原生字段(`ttft_ms` / `modelUsage` / `total_cost_usd`),零估算 hacks
- 会话历史经官方 `listSessions()` / `getSessionMessages()` API,server 重启天然恢复

## 开发 / Development

```bash
pnpm install
pnpm dev        # 并行起 server(3477) + web(5173, WS 代理)
pnpm check      # lint + typecheck + test + build 质量门
```

## License

MIT © TimeCraker

> 本项目为社区第三方工具,与 Anthropic 无关联;Claude 为 Anthropic 商标。

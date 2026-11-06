# ccweb 全面体验与生产力升级实施计划

> **目标**：将 ccweb 从单一对话控制台重塑为具备 IDE 级上下文掌控力、极致克制实用、全矢量 SVG 美术与双向强联动的专业桌面开发工作台。

---

## 阶段规划概览

- [x] Phase 1：生产力核心跃迁（并排双栏 Diff 视图 + Plan 计划双向持久化）
- [x] Phase 2：长对话高密度优化（密集工具链智能折叠链 + 上下文容量水位与纯矢量 SVG 重构）
- [x] Phase 3：输入效率与文件质感（常用 Prompt 模板胶囊 + 文件树 Git 状态彩点与路径复制）

---

### Phase 1：生产力核心跃迁

- [x] **1.1 DiffView 并排比对引擎 (Split Diff)**
  - 增强 `DiffView.tsx`，支持 `unified`（单列）与 `split`（左右并排）双模式渲染。
  - 左右分栏精确对齐：左列为原始代码/删除行，右列为最新代码/新增行；占位虚空行智能对齐，代码水平独立平滑滚动。
  - 伴侣抽屉宽度 $\ge 640\text{px}$ 时，在标头自动呈现极简 SVG 布局切换按钮（单栏/双栏），支持偏好记忆。
- [x] **1.2 Plan 计划跟踪器双向持久化 (Two-way Plan Sync)**
  - 服务端 `config-api.ts` 新增安全的 `/workspaces/write-plan` 原子写入端点，严格白名单限制目标文件（仅限 `implementation_plan.md`, `SPEC.md`, `task.md`, `todo.md`, `PLAN.md`），防路径穿越。
  - `PlanPanel.tsx` 绑定复选框点击事件：当用户勾选/取消勾选步骤时，精准替换对应 markdown 行中的 `- [ ]` / `- [x]` 并同步原子写回磁盘。
  - 操作即时反馈：提供非阻塞轻量 Toast 提示与进度动态更新。

---

### Phase 2：长对话高密度优化

- [x] **2.1 密集工具链智能折叠链 (Tool Chain Batching)**
  - 识别消息流中连续出现的工具调用卡片（$\ge 2$ 个连续工具）。
  - 默认聚合为紧凑状态折叠条，展示操作总数、主要工具名及总耗时；点击可平滑展开/收起完整卡片群。
  - 智能熔断保护：若其中有任何工具执行失败或报错，自动警示展开，杜绝关键异常被遮蔽。
- [x] **2.2 底部用量栏上下文容量水位 (Context Watermark Gauge)**
  - 在 `UsageBar.tsx` 增加上下文占用率指标（计算 prompt + output + cache 占上下文窗口比率，如 `42k / 128k · 32%`）。
  - 达到 80% 琥珀色预警，达到 90% 提示 `/compact`。
- [x] **2.3 全量图标去 Emoji 换纯矢量 SVG 重构**
  - 彻底清查用量栏及界面中散落的 emoji（如 ⏱、⚡、🔥、🧠、▶），统一替换为极简精致、视觉轻量的内联 SVG 矢量图标。

---

### Phase 3：输入效率与文件质感

- [x] **3.1 常用 Prompt 模板胶囊 (Prompt Snippets)**
  - 在 `Composer.tsx` 增设快捷模板菜单，内置高频开发者 Prompt（代码审查、边界单测、Conventional Commits 提交、精简汇报等），点击即填入。
  - 支持将当前输入框内容一键保存为自定义片段（存储在 localStorage）。
- [x] **3.2 文件树 Git 状态与路径快捷复制**
  - `FilesPanel.tsx` 支持在文件树右侧标注 Git 变动状态小彩点（绿点新增，黄点修改）。
  - 文件预览标头增加「复制相对路径」与「复制绝对路径」极简 SVG 按钮。

---

## 验收标准

1. **质量门禁**：运行 `cd ccweb; pnpm check`，TypeScript 0 error，ESLint 0 error，全部自动化测试 100% 通过，构建成功。
2. **浏览器实测**：通过 Playwright 进行全流程真实端到端走查（并排 Diff、Plan 勾选落盘、工具链折叠、无 Emoji 视觉验收）并保存截图证据。

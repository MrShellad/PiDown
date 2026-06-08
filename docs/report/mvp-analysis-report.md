# PiDown MVP 闭环与 BUG 分析报告

生成时间：2026-06-09  
范围：`src-tauri/src`、`frontend/src`、Tauri 配置、开发脚本、现有文档目录。  
验证命令：`cargo check`、`cargo test`、`npm.cmd run build`、`npm.cmd run lint`。

## 1. 结论摘要

当前 MVP 已经具备基础端到端能力：Tauri 后端能初始化数据库和 `gosh-dl` 引擎，前端能加载任务、分类、标签、设置，并通过事件接收下载速度与进度。`cargo check`、`cargo test`、`npm.cmd run build` 均通过，说明项目不是“无法启动/无法编译”的状态。

但 MVP 仍有几类明显未闭环问题：

- 任务状态存在后端数据库、下载引擎、前端 localStorage 三套来源，完成/删除/清空/启动恢复时容易漂移。
- 分类和标签规则在前后端各实现一套，新增任务预判、后端实际归类、侧栏筛选三者可能不一致。
- Tauri 一键开发/构建命令可能没有进入 `frontend` 目录，导致 `cargo tauri dev/build` 的 before command 找不到前端 `package.json`。
- SQLite schema 声明了外键和级联删除，但没有启用 `PRAGMA foreign_keys = ON`，删除分类/标签/任务后的关联清理不可靠。
- 前端 lint 当前失败 36 个 error，主要是 React Compiler/Hook 规则、`any` 类型和重复目录被 lint 扫入。

建议 MVP 收敛优先级：先统一任务状态源和启动命令，再统一分类规则判定，最后处理前端 lint 与组件目录重复。

## 2. 未闭环逻辑

### 2.1 任务持久化状态只在事件节点回写，进度过程不回写

证据：

- 后端列表会从引擎实时读取状态：`src-tauri/src/core/state/task_service.rs:218`
- 下载事件只在 Completed/Failed/Paused/Resumed 时更新数据库：`src-tauri/src/events/reporter.rs:13`
- ticker 每 100ms 只 emit 给前端，不写数据库：`src-tauri/src/events/ticker.rs:52`
- 启动恢复只在应用启动时跑一次：`src-tauri/src/core/state.rs:40`

影响：

- 运行中 UI 看到的是实时引擎状态，但 SQLite 中的 `completed_size/total_size/status` 可能长期停留在旧值。
- 应用异常退出或事件丢失时，数据库状态会落后；下一次启动只能依赖 `sync_on_startup` 尝试修正。
- `list_tasks()` 对完成任务在引擎状态不存在时才用 DB 兜底，容易出现“前端看起来完成，DB 还没完成”的边界情况。

建议：

- 明确单一事实源：下载运行态以引擎为准，持久态以 DB 为准，但需要周期性节流回写进度。
- 在 ticker 或独立后台任务中按 1s/2s 节流写入活跃任务进度，而不是 100ms 全量写库。
- 事件 reporter 保留状态终点写入，用于 Completed/Failed/Paused 的最终状态闭环。

### 2.2 前端任务 store 使用 localStorage 持久化，和后端 SQLite 形成双持久源

证据：

- `useDownloadStore` 使用 `persist`：`frontend/src/core/store/useDownloadStore.ts:117`
- 初始加载又从后端 `get_active_tasks` 拉取：`frontend/src/components/layout/ThemeProvider.tsx:46`
- 新建任务先本地 `addTask`，再异步 `fetchTasks`：`frontend/src/components/downloader/NewTaskModal.tsx:259`
- 删除任务即使后端删除失败，也会从前端状态移除：`frontend/src/core/store/useDownloadStore.ts:219`
- 清空已完成只清前端状态，不删除后端数据库：`frontend/src/core/store/useDownloadStore.ts:301`

影响：

- 刷新/重开应用时，前端 localStorage 和 SQLite 可能短暂或长期不一致。
- “清空已完成”只是 UI 清空，后端任务仍存在；下一次 `fetchTasks` 会重新出现。
- 删除失败也会在 UI 消失，用户会误以为任务已删除。

建议：

- MVP 阶段建议取消 `tasks` 的 localStorage 持久化，仅持久化 UI 偏好、主题、列宽。
- `clearCompleted` 应新增后端命令，批量删除 Completed 任务，或明确改名为“隐藏已完成”。
- 删除任务时，后端失败不要乐观移除；可以保留任务并显示 toast。

### 2.3 自动分类规则前端预判与后端实际判定不一致

证据：

- 后端规则判定包含 domain、extension、keyword、min/max size，并有默认扩展名分类兜底：`src-tauri/src/core/categories.rs:78`
- 新建弹窗复制了一套 `rulesMatch/inferCategory/inferTag`：`frontend/src/components/downloader/NewTaskModal.tsx:44`
- 前端新建弹窗的规则匹配没有处理 `min_size_bytes/max_size_bytes`：`frontend/src/components/downloader/NewTaskModal.tsx:44`
- 后端新增任务分类时传入 size 为 `None`：`src-tauri/src/core/state/task_service.rs:77`

影响：

- 用户在弹窗中看到的分类/标签/保存路径，只是前端预判；创建后后端可能分到其他分类。
- 用户配置了文件大小规则时，前端弹窗不会参与匹配；后端新增任务也没有使用 inspect 得到的大小，size 规则基本不能在新增任务时稳定生效。
- 侧栏筛选又有第三套规则匹配：`frontend/src/core/taskFilters.ts`，可能进一步扩大偏差。

建议：

- 把“预览分类结果”改成后端命令，例如 `preview_task_classification(url, filename, total_size)`。
- 新建任务时如果已 inspect 到 `total_size`，应传给后端归类逻辑。
- 前端只展示后端返回的分类结果，不再复制核心规则算法。

### 2.4 Tauri beforeDev/beforeBuild 命令可能没有进入 frontend 目录

证据：

- 前端 `package.json` 位于 `frontend/package.json`。
- `tauri.conf.json` 中配置为 `"beforeDevCommand": "npm run dev"`、`"beforeBuildCommand": "npm run build"`：`src-tauri/tauri.conf.json:9`
- 项目脚本安装依赖时进入了 `frontend`，但启动最终调用的是 `cargo tauri dev`：`dev.bat:76`、`dev.sh:62`

影响：

- 标准 Tauri 项目通常 root 有 `package.json`，但本项目 root 没有。
- 如果 Tauri CLI 在项目 root 或 `src-tauri` 执行 before command，`npm run dev/build` 会失败。
- 当前 `npm.cmd run build` 在 `frontend` 目录手动执行通过，不代表 `cargo tauri dev/build` 的 before command 闭环通过。

建议：

- 将 before command 改为带目录的命令，例如 `npm --prefix ../frontend run dev/build`，具体路径需按 Tauri 实际执行 cwd 验证。
- 或把前端 `package.json` 上移到项目 root，恢复标准 Tauri 目录约定。

### 2.5 Tauri capability 未显式声明 shell/open 权限，但后端直接调用系统打开

证据：

- `open_task_file/open_task_folder` 使用 Rust `std::process::Command` 调 `explorer/open/xdg-open`：`src-tauri/src/core/state/file_actions.rs:18`
- capability 只包含 core/window 权限：`src-tauri/capabilities/default.json`

影响：

- 这是后端原生进程调用，不走前端 shell plugin 权限，所以目前可能能工作。
- 但它绕开了 Tauri 权限模型，后续如果引入 shell plugin 或安全审计，会出现权限语义不一致。

建议：

- MVP 可暂时保留，但需要在安全设计里明确：打开文件/目录是后端受控能力，只允许 DB 中已有任务路径。
- 后续可用 Tauri opener/plugin 能力替代，并显式配置权限。

## 3. 重复造轮子与结构债

### 3.1 规则匹配逻辑重复三份

位置：

- 后端核心归类：`src-tauri/src/core/categories.rs:78`
- 新建弹窗预判：`frontend/src/components/downloader/NewTaskModal.tsx:44`
- 侧栏筛选：`frontend/src/core/taskFilters.ts`

风险：

- 每新增一种规则都要改三处。
- 当前已经出现 size 规则处理不一致。

建议：

- 后端提供统一 preview/filter metadata API。
- 前端筛选尽量基于任务已落库的 `category_id/tags`，不要重新推导规则。

### 3.2 速度、ETA、字节格式化重复实现

位置：

- `src-tauri/src/core/state/task_format.rs:1`
- `src-tauri/src/events/ticker.rs:25`
- `frontend/src/core/hooks/useTaskSpeed.ts:24`
- `frontend/src/components/downloader/NewTaskModal.tsx:81`

风险：

- UI 显示单位可能不一致，例如 KB/MB 与 KiB/MiB 混用。
- 修改展示格式要多处同步。

建议：

- 后端只返回数值，前端统一格式化；或后端统一返回格式化字段，前端不再二次格式化。
- MVP 更推荐“后端返回数值，前端统一展示”，便于国际化和主题 UI。

### 3.3 存在 `frontend/@` 旁路组件目录

证据：

- 目录存在：`frontend/@/components/ui/button.tsx`、`dialog.tsx`、`progress.tsx`、`frontend/@/lib/utils.ts`
- Vite alias `@` 指向 `frontend/src`：`frontend/vite.config.ts`
- TS include 只包含 `src`：`frontend/tsconfig.app.json`
- lint 会扫描 `frontend/@` 并报错：`npm.cmd run lint`

影响：

- 构建不用它，但 lint 会扫它，制造额外错误。
- 对开发者非常迷惑：看到两个 `@/components/ui/button.tsx`，但只有 `src` 下的会被真正引用。

建议：

- 删除 `frontend/@`，或加入明确的 lint ignore。
- 如果是 shadcn 生成残留，应统一迁移到 `frontend/src/components/ui`。

### 3.4 分类/标签 schema 混入 tag_groups，但 UI 并未形成分组闭环

证据：

- schema 有 `tag_groups` 表：`src-tauri/src/core/store/schema.rs:25`
- `tags` 同时有 `group_id` 和 `category_id`：`src-tauri/src/core/store/schema.rs:33`
- 插入标签时 `category_id` 和 `group_id` 都写同一个值：`src-tauri/src/core/store/classification.rs:99`
- 查询标签时用 `COALESCE(category_id, group_id)` 返回为 `category_id`：`src-tauri/src/core/store/classification.rs:75`

影响：

- “标签组”和“分类下标签”两个概念被混用。
- 如果未来真的启用 tag_groups，当前 `COALESCE` 会把 group id 当 category id 返回给前端，侧栏归属会错。

建议：

- MVP 先删除/冻结 `tag_groups` 概念，只保留 `category_id`。
- 或完善模型，前端区分 `group_id` 与 `category_id`，不要用 `COALESCE` 合并。

## 4. 明显 BUG / 高风险点

### 4.1 SQLite 外键声明没有实际启用

证据：

- 打开连接：`src-tauri/src/core/store.rs:26`
- schema 声明了 `ON DELETE SET NULL/CASCADE`：`src-tauri/src/core/store/schema.rs:33`、`src-tauri/src/core/store/schema.rs:83`
- 未看到 `PRAGMA foreign_keys = ON`。

影响：

- SQLite 默认外键约束关闭时，删除 tag 不会自动清理 `task_tags`。
- 删除 category 不一定会将任务/标签的 `category_id` 置空。
- 长期会产生悬空引用，任务侧栏和标签显示可能异常。

建议：

- `Connection::open` 后立即执行 `conn.execute_batch("PRAGMA foreign_keys = ON;")?;`
- 增加测试：删除 tag 后 `task_tags` 映射应消失；删除 category 后 task/category/tag 应按预期置空。

### 4.2 `cancel_task` 对已不在引擎中的任务会直接失败，导致历史任务无法删除

证据：

- `cancel_task` 一开始就要求 `DownloadId::from_gid` 有效：`src-tauri/src/core/state/task_service.rs:176`
- 后续无论任务状态都会调用 `engine.cancel`，最后才删 DB：`src-tauri/src/core/state/task_service.rs:185`
- 前端删除无论后端失败都会移除本地状态：`frontend/src/core/store/useDownloadStore.ts:219`

影响：

- 如果任务已完成、引擎重启后不再返回该 id、或 DB 中有历史任务，删除可能失败。
- 前端仍会移除本地任务；下一次从后端拉取可能又回来。

建议：

- 删除 DB 任务和取消引擎任务应解耦：如果引擎不存在该任务，仍允许删除 DB 记录。
- 前端只有后端成功后才移除，失败 toast。

### 4.3 “清空已完成”不清后端，刷新后会复活

证据：

- `clearCompleted` 只删除 zustand 中的 completed：`frontend/src/core/store/useDownloadStore.ts:301`
- 没有对应 Tauri command。

影响：

- 用户以为已清理，下一次 `fetchTasks` 或重启后任务重新出现。

建议：

- 新增后端命令 `clear_completed_tasks(delete_files?: bool)`。
- 或 UI 文案改为“隐藏已完成”，并持久化隐藏列表。

### 4.4 前端 lint 失败，React Compiler 规则已经指出潜在性能/状态问题

验证结果：

- `npm.cmd run lint` 失败：36 errors、2 warnings。

主要类型：

- `setState` 在 effect 中同步调用：`frontend/src/App.tsx:41`、`frontend/src/components/downloader/NewTaskModal.tsx:169`、`frontend/src/components/settings/SettingsWindow.tsx:113`
- render 内定义组件：`frontend/src/components/layout/WindowFrame.tsx:58`
- 大量 `no-explicit-any`：`frontend/src/core/bridge/tauri-commands.ts:117`
- UI 组件文件同时导出非组件对象导致 Fast Refresh 报错。

影响：

- build 当前能过，但 lint 不能作为 CI 闭环。
- React 19/Compiler 规则下，部分写法可能导致重复 render、状态重置或热更新异常。

建议：

- 先修业务组件的 Hook/Compiler 错误，再处理 UI primitives 的 Fast Refresh 导出策略。
- 为 Tauri 返回值定义类型，替换 `any`。
- lint exclude `frontend/@` 或删除旁路目录。

### 4.5 HTTP 元数据 inspect 失败后没有后端兜底分类 preview

证据：

- 新建弹窗 inspect 失败只 `console.warn`，继续使用前端 URL 推断：`frontend/src/components/downloader/NewTaskModal.tsx:201`
- 后端创建任务实际仍会重新推断分类：`src-tauri/src/core/state/task_service.rs:77`

影响：

- HEAD/metadata 不可用的网站上，用户看到的分类、文件名、大小预览都可能不准。
- 这不是阻断 BUG，但会影响 MVP 可信度。

建议：

- inspect 失败时调用后端轻量 preview，仅返回基于 URL/filename 的分类和保存路径。
- 创建成功后以 `fetchTasks` 返回的 DB 任务为准，不依赖本地 `addTask` 预写。

## 5. 验证结果

已执行：

- `cargo check`：通过。
- `cargo test`：通过，8 个测试全部成功。
- `npm.cmd run build`：通过，Vite 提示主 chunk 超过 500 kB。
- `npm.cmd run lint`：失败，36 errors、2 warnings。

未执行：

- 未启动 `cargo tauri dev`，因为它是长运行命令；报告中关于 before command 的问题基于配置和目录结构推断，建议后续用一次实际启动验证。
- 未进行真实下载任务测试；下载完成、失败、暂停、重启等运行态问题基于代码路径分析。

## 6. 建议修复优先级

P0：MVP 必修

- 修正 Tauri beforeDev/beforeBuild 命令，确保一键 dev/build 能启动前端。
- 启用 SQLite foreign keys，并补删除分类/标签/任务的关联测试。
- 调整删除任务和清空已完成逻辑，确保后端 DB 与前端 UI 不漂移。

P1：核心体验闭环

- 取消任务列表的前端 localStorage 持久化，任务以 SQLite/后端返回为准。
- 后端新增分类 preview API，统一规则匹配逻辑。
- 下载进度节流回写 DB，避免异常退出后进度丢失。

P2：质量债收敛

- 删除或忽略 `frontend/@` 旁路目录。
- 修复 `npm run lint` 的 React Compiler/Hook/any/Fast Refresh 问题。
- 合并速度、ETA、字节格式化实现。
- 明确 `tag_groups` 是否进入 MVP；不进入就从数据访问层移除混用逻辑。

## 7. 推荐的 MVP 闭环目标

一个下载任务在 MVP 中应形成这样的闭环：

1. 前端提交 URL。
2. 后端 inspect/preview 返回文件名、大小、分类、标签、保存路径。
3. 用户确认后，后端创建引擎任务并落库。
4. 运行中事件更新前端，并节流回写 DB。
5. 完成/失败/暂停事件最终落库。
6. 删除/清空操作以后端成功为准，前端只展示后端事实。
7. 重启应用后，`sync_on_startup` 能把 DB 和引擎恢复到一致状态。

目前第 1、3、4、5、7 步有基础实现，第 2、4 的持久化、第 6 的删除闭环还需要补齐。

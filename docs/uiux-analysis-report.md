# PiDownloader UI/UX 问题分析与重构建议报告

本报告针对 PiDownloader 前端项目进行深度 UI/UX 代码审计，主要分析在**设计规范合规性**、**安全边距执行**、**硬编码颜色**、**字体字号定义**以及 **`!important` 声明使用**等方面存在的问题，并给出具体的整改与重构建议。

---

## 一、 核心发现摘要

通过对项目核心 UI 代码（包括 `App.tsx`、`NavSidebar.tsx`、`TaskListDashboard.tsx`、`NewTaskBtForm.tsx`、`TaskDetailsDrawer.tsx`、`NewTaskWindow.tsx` 等）的静态分析，发现以下主要问题：

1. **未严格遵守设计规范 / 组件滥用**：
   - 多处绕过公共组件 `Checkbox`，直接使用原生 `<input type="checkbox">`。
   - 多处绕过公共组件 `ScrollArea`，直接使用原生 `overflow-y-auto` 并手动拼凑滚动条样式类。
   - 存在以 JS 手动管理 Hover 样式状态（通过 `onMouseEnter`/`onMouseLeave` 修改 inline style）的反模式。
2. **安全边距未严格执行**：
   - 核心布局（侧边栏与主控制台）的 Padding（`p-4`，即 `16px`）与全局 Design Token 定义的页面安全边距 `UI_TOKENS.content.pagePadding`（`1.5rem`，即 `24px`）不一致。
   - 独立窗口（如 `NewTaskWindow.tsx`）存在硬编码内边距（如 `px-8 py-6`）现象，导致窗口间视觉体验不统一。
3. **颜色硬编码**：
   - 多处使用硬编码 HEX 颜色值（如 `#8c8c8c`、`#3b82f6` 等）或 RGBA 颜色值，未接入 HSL/OKLCH 变量系统，无法完美适配亮暗主题切换。
4. **字号硬编码与超小字号滥用**：
   - 频繁使用 `text-[10px]` 和 `text-[11px]` 等任意硬编码超小字号，违反了“正文默认使用 `text-sm` 或 `text-base`”及字阶统一的设计规范，且可能引发无障碍视障阅读障碍。
5. **`!important` 滥用/合理使用分析**：
   - 发现 4 处 `!important`。除主题引擎动态样式注入和透明穿透视窗的窗口级声明属合理桌面端必要外，部分过渡动画或清除背景的声明可通过更优雅的 CSS 权重管理实现。

---

## 二、 详细问题分析与定位

### 1. 组件复用与设计规范不符 (Component Reuse Violations)

根据 [docs/AGENT-UIUX-GUIDELINES.md](file:///h:/VSCodeWork/PiDown/docs/AGENT-UIUX-GUIDELINES.md)，公共控件与滚动区域有严格复用要求。然而在实际代码中存在以下偏离：

*   **原生多选框滥用**：
    在 [NewTaskBtForm.tsx](file:///h:/VSCodeWork/PiDown/frontend/src/components/downloader/new-task/NewTaskBtForm.tsx) 中（行 272-280、315-320、367-376、388-392、416-421），全选、单选、视频筛选和顺序下载复选框均使用原生的 `<input type="checkbox">`，而不是统一的 `components/ui/checkbox.tsx` 中的 `<Checkbox>`。这导致多选框的视觉形态与系统整体的 Shadcn 风格脱节。
*   **原生滚动条重复定义**：
    规范指出：“*滚动区域统一使用公共 ScrollArea，不要在页面里直接重复写浏览器滚动条样式。*”
    但在多处核心展示组件中，使用了原生 `overflow-y-auto` 并混杂了 `scrollbar-interactive`、`scrollbar-overlay` 等底层类：
    - [NewTaskBtForm.tsx](file:///h:/VSCodeWork/PiDown/frontend/src/components/downloader/new-task/NewTaskBtForm.tsx#L402)：`className="p-2 h-[260px] overflow-y-auto scrollbar-thin scrollbar-thumb-border hover:scrollbar-thumb-muted"`
    - [TaskDetailsDrawer.tsx](file:///h:/VSCodeWork/PiDown/frontend/src/components/downloader/TaskDetailsDrawer.tsx#L315)：`className="flex-1 min-h-0 overflow-y-auto space-y-1 px-6 py-6 scrollbar-interactive scrollbar-overlay"`
    - [TaskDetailsDrawer.tsx](file:///h:/VSCodeWork/PiDown/frontend/src/components/downloader/TaskDetailsDrawer.tsx#L451-L587) 的多处文件/Tracker/Peer 列表面板。
    - [NewTaskWindow.tsx](file:///h:/VSCodeWork/PiDown/frontend/src/components/downloader/NewTaskWindow.tsx#L62)：`className="flex-1 min-h-0 overflow-y-auto px-8 py-6"`。
*   **JS 样式侵入与反模式**：
    在 [NavSidebar.tsx](file:///h:/VSCodeWork/PiDown/frontend/src/components/layout/NavSidebar.tsx#L122-L127) 中，侧边栏菜单项悬停效果使用 JS 事件监听实现：
    ```tsx
    onMouseEnter={(event) => {
      if (!isActive) event.currentTarget.style.background = "var(--secondary)";
    }}
    onMouseLeave={(event) => {
      if (!isActive) event.currentTarget.style.background = "transparent";
    }}
    ```
    这绕过了 CSS 的 `hover:` 伪类机制，降低了代码可维护性，导致主题色变化时切换生硬。
*   **硬编码行内样式阴影**：
    - [NewTaskWindow.tsx](file:///h:/VSCodeWork/PiDown/frontend/src/components/downloader/NewTaskWindow.tsx#L132) 和 [NewTaskModal.tsx](file:///h:/VSCodeWork/PiDown/frontend/src/components/downloader/NewTaskModal.tsx#L116) 中：`style={{ boxShadow: "var(--button-glow)" }}`。
    - 既然已经在 `index.css` 中定义了 `--shadow-button-glow: var(--button-glow);`，应直接使用 Tailwind 类 `shadow-button-glow`。

---

### 2. 安全边距执行不力 (Safety Margin Discrepancies)

在 [ui-tokens.ts](file:///h:/VSCodeWork/PiDown/frontend/src/core/ui-tokens.ts) 中，明确定义了内容安全边距：
```typescript
content: {
  pagePadding: "1.5rem", // 24px
  cardPadding: "1.25rem", // 20px
  ...
}
```

*   **主框架边距缩水**：
    - [NavSidebar.tsx](file:///h:/VSCodeWork/PiDown/frontend/src/components/layout/NavSidebar.tsx#L415) 使用了 `pt-4 pb-4 pl-4 pr-0`（即 `16px`）。
    - [TaskListDashboard.tsx](file:///h:/VSCodeWork/PiDown/frontend/src/components/downloader/TaskListDashboard.tsx#L477) 使用了 `pt-4 pb-4 pr-4 pl-4`（即 `16px`）。
    - 导致侧边栏与下载主控制台的边缘贴合过紧，未达到安全边距 `1.5rem`（`24px` / `p-6`）的标准，页面“呼吸感”不足。
*   **独立窗口边距不一致**：
    - [NewTaskWindow.tsx](file:///h:/VSCodeWork/PiDown/frontend/src/components/downloader/NewTaskWindow.tsx#L62) 边距硬编码为 `px-8 py-6`（`32px / 24px`），这使它在视觉展示上与其他页面和弹窗存在明显落差。
*   **抽屉及对话框内部边距硬编码**：
    - [TaskDetailsDrawer.tsx](file:///h:/VSCodeWork/PiDown/frontend/src/components/downloader/TaskDetailsDrawer.tsx#L244) 头部边距 `px-6 pt-5`，底部 `px-6 py-4`；宽度硬编码 `w-[500px] sm:w-[560px]`。
    - [NewTaskModal.tsx](file:///h:/VSCodeWork/PiDown/frontend/src/components/downloader/NewTaskModal.tsx#L47) 内部边距硬编码为 `px-8 py-5`。

---

### 3. 硬编码颜色问题 (Hardcoded Colors)

为了提供完美的亮暗主题切换，项目应尽量避免硬编码色值。审计中发现多处遗留硬编码颜色：

| 文件路径 | 行号 | 代码片段 | 问题描述 |
| :--- | :--- | :--- | :--- |
| [CategoryEditDialog.tsx](file:///h:/VSCodeWork/PiDown/frontend/src/components/common/CategoryEditDialog.tsx) | 33, 131, 136 | `color: "#8c8c8c"`, `color={draft.color \|\| "#8c8c8c"}` | 分类编辑弹窗中使用硬编码灰色，未走 muted-foreground 变量。 |
| [FloatDisc.tsx](file:///h:/VSCodeWork/PiDown/frontend/src/components/downloader/FloatDisc.tsx) | 360-367 | `stopColor="#3b82f6"`, `stopColor="#1d4ed8"`, `stopColor="#60a5fa"` | 悬浮窗 SVG 渐变背景色硬编码，无法随亮暗主题动态调节。 |
| [FloatDisc.tsx](file:///h:/VSCodeWork/PiDown/frontend/src/components/downloader/FloatDisc.tsx) | 379, 405 | `stroke="rgba(255, 255, 255, 0.15)"`, `stroke="rgba(255, 255, 255, 0.3)"` | SVG 边框线直接硬编码不透明白色，在亮色模式下对比度极差。 |
| [FloatDisc.tsx](file:///h:/VSCodeWork/PiDown/frontend/src/components/downloader/FloatDisc.tsx) | 455 | `className="... text-[#93c5fd] ..."` | 文本高亮色直接写死淡蓝色，在浅色背景主题下会无法识别。 |
| [NavSidebar.tsx](file:///h:/VSCodeWork/PiDown/frontend/src/components/layout/NavSidebar.tsx) | 155, 384 | `background: isActive ? "rgba(255,255,255,0.2)" : ...` | 未绑定设计系统中的活动状态背景变量。 |
| [ActiveBackground.tsx](file:///h:/VSCodeWork/PiDown/frontend/src/components/layout/ActiveBackground.tsx) | 46 | `const maskColor = ... \|\| "#000000"` | 遮罩默认色硬编码。 |
| [SettingsWindow.tsx](file:///h:/VSCodeWork/PiDown/frontend/src/components/settings/SettingsWindow.tsx) | 1962, 1976 | `value={draft.interface.background_mask_color \|\| "#000000"}` | 遮罩选择控件的备用值硬编码。 |

---

### 4. 字体大小与排版规范偏离 (Typography Violations)

规范要求：*“交互控件正文默认使用 `text-sm` 或 `text-base`，避免过小字号... 避免局部自定义造成节奏紊乱。”*

系统中存在大量直接使用 Tailwind 任意值声明的 `text-[10px]` 或 `text-[11px]`：
- [FloatDisc.tsx#L449](file:///h:/VSCodeWork/PiDown/frontend/src/components/downloader/FloatDisc.tsx#L449)：`text-[10px] text-white/70`
- [FloatDisc.tsx#L452](file:///h:/VSCodeWork/PiDown/frontend/src/components/downloader/FloatDisc.tsx#L452)：`text-[11px] font-extrabold`
- [TaskDetailsDrawer.tsx#L519](file:///h:/VSCodeWork/PiDown/frontend/src/components/downloader/TaskDetailsDrawer.tsx#L519)：`text-[10px] text-muted-foreground` (Peer 客户端描述)
- [NewTaskBtForm.tsx#L330](file:///h:/VSCodeWork/PiDown/frontend/src/components/downloader/new-task/NewTaskBtForm.tsx#L330)：`text-[10px]` (文件扩展名徽章)
- [NavSidebar.tsx#L510](file:///h:/VSCodeWork/PiDown/frontend/src/components/layout/NavSidebar.tsx#L510)：`text-[11px] text-muted-foreground`
- [SettingsWindow.tsx#L1504](file:///h:/VSCodeWork/PiDown/frontend/src/components/settings/SettingsWindow.tsx#L1504)：`text-[11px] font-semibold`
- [SettingsWindow.tsx#L1797](file:///h:/VSCodeWork/PiDown/frontend/src/components/settings/SettingsWindow.tsx#L1797) 等多处徽章字号。
- [switch.tsx#L158](file:///h:/VSCodeWork/PiDown/frontend/src/components/ui/switch.tsx#L158)：`text-[10px] font-bold` (开关指示文本)

此外，[App.css](file:///h:/VSCodeWork/PiDown/frontend/src/App.css#L2) 中硬编码了 `font-size: 16px` 和 `font-size: 16px;` (行 120)，绕过了 Tailwind 的 `text-base` 样式。

---

### 5. `!important` 声明审计

项目中全局搜索到 4 处 `!important`，对其合理性分析如下：

1.  **[useThemeStore.ts#L410](file:///h:/VSCodeWork/PiDown/frontend/src/core/store/useThemeStore.ts#L410)** (`${key}: ${value} !important;`)
    - **合理性**：**合理**。用于主题引擎导入自定义 zip 时，在运行态将样式动态覆盖注入到 document header 中。为了在 `:root` 级保证覆盖内置现代主题变量，此处使用 `!important` 是必要的底层手段。
2.  **[index.css#L363](file:///h:/VSCodeWork/PiDown/frontend/src/index.css#L363)** (`background-color: transparent !important;` on `body`)
    - **合理性**：**合理**。用于 Tauri 窗口在多背景、毛玻璃模式以及无边框透明穿透模式下的透明渲染，强行压制浏览器的默认白底，防止白屏闪烁。
3.  **[index.css#L532](file:///h:/VSCodeWork/PiDown/frontend/src/index.css#L532)** (`--task-progress-failed 400ms ease !important;`)
    - **合理性**：**不合理**。属于过渡属性变量优先级管理混乱。应当通过增加 CSS 选择器权重（如 `.theme-transitioning` 或在过渡引擎全局注入），而不是强行挂载全局最高优先级的 `!important`。
4.  **[index.css#L536](file:///h:/VSCodeWork/PiDown/frontend/src/index.css#L536)** (`pointer-events: auto !important;` on `.window-frame`)
    - **合理性**：**合理**。在透明穿透模式下，整个窗口背景会设置为 `pointer-events: none` 使得用户可以点击桌面，而顶部标题栏 `.window-frame` 必须强制设为 `pointer-events: auto` 以便接收拖动和最大化/关闭点击。

---

## 三、 重构建议与整改指南

### 1. 替换原生多选框为公共 Checkbox 组件
将 `NewTaskBtForm.tsx` 中的原生多选框 `<input type="checkbox">` 替换为公共的 `<Checkbox>` 组件。

**重构示例**：
```diff
-import { ChevronDown, ChevronRight, File, Folder, FolderOpen, HardDrive, Film, List } from "lucide-react"
+import { ChevronDown, ChevronRight, File, Folder, FolderOpen, HardDrive, Film, List } from "lucide-react"
+import { Checkbox } from "@/components/ui/checkbox"

...

-              <input
-                type="checkbox"
-                checked={selectState === "all"}
-                ref={(el) => {
-                  if (el) el.indeterminate = selectState === "some"
-                }}
-                onChange={(e) => handleFolderSelect(node, e.target.checked)}
-                className="size-4 rounded border-input text-primary focus:ring-primary/30"
-              />
+              <Checkbox
+                checked={selectState === "all" ? true : selectState === "some" ? "indeterminate" : false}
+                onCheckedChange={(checked) => handleFolderSelect(node, !!checked)}
+              />
```

### 2. 使用 ScrollArea 代替原生 overflow-y-auto
对页面上的长列表区域，应移除原生滚动条 class，用 `<ScrollArea>` 进行包裹，以维持系统滚动条样式与微动效的整体契合度。

**重构示例** (以 `TaskDetailsDrawer.tsx` 线程/Tracker 区域为例)：
```diff
-import { Button } from "@/components/ui/button"
+import { Button } from "@/components/ui/button"
+import { ScrollArea } from "@/components/ui/scroll-area"

...

-                          <div className="flex flex-col border border-border/80 rounded-xl bg-background/25 overflow-hidden">
-                            <div className="max-h-[350px] overflow-y-auto divide-y divide-border/40 scrollbar-interactive">
+                          <div className="flex flex-col border border-border/80 rounded-xl bg-background/25 overflow-hidden">
+                            <ScrollArea className="max-h-[350px]" scrollbar="thin">
+                              <div className="divide-y divide-border/40">
                                 {btDetails?.trackers && btDetails.trackers.length > 0 ? (
                                   btDetails.trackers.map((tracker, idx) => (
                                     <div key={idx} className="px-4 py-3 text-xs font-mono break-all hover:bg-muted/10 transition-colors text-foreground/85">
                                       {tracker}
                                     </div>
                                   ))
                                 ) : (
                                   <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                                     <span className="text-xs select-none">暂无 Tracker 服务器</span>
                                   </div>
                                 )}
-                            </div>
-                          </div>
+                              </div>
+                            </ScrollArea>
+                          </div>
```

### 3. 去除 JS Hover 事件样式侵入
在 `NavSidebar.tsx` 中，改用纯 Tailwind 的 `hover:` 类，移除 `onMouseEnter` / `onMouseLeave` 事件。

**重构示例**：
```diff
       <button
         key={id}
         type="button"
         onClick={() => {
           onFilterChange(id);
           onToggle?.();
         }}
-        className={`flex w-full items-center gap-3 rounded-lg py-2 pr-3 text-sm transition-all duration-150 ${paddingLeft} ${
-          isActive ? activeWeight : inactiveWeight
-        }`}
+        className={cn(
+          "flex w-full items-center gap-3 rounded-lg py-2 pr-3 text-sm transition-all duration-150",
+          paddingLeft,
+          isActive 
+            ? "bg-primary text-primary-foreground font-semibold" 
+            : "text-foreground hover:bg-secondary bg-transparent font-bold"
+        )}
-        style={{
-          background: isActive ? "var(--primary)" : "transparent",
-          color: isActive ? "var(--primary-foreground)" : undefined,
-        }}
-        onMouseEnter={(event) => {
-          if (!isActive) event.currentTarget.style.background = "var(--secondary)";
-        }}
-        onMouseLeave={(event) => {
-          if (!isActive) event.currentTarget.style.background = "transparent";
-        }}
       >
```

### 4. 纠正框架与独立窗口安全边距
将侧边栏布局容器与任务仪表盘的 Padding 由硬编码 `p-4` 替换为统一从 `UI_TOKENS` 中引用的安全间距（使用 `p-6`，即 `24px`），使主界面的呼吸感更协调。

**重构示例**：
- **`TaskListDashboard.tsx`**：
  ```diff
-  <div className="flex min-h-0 flex-1 flex-col overflow-hidden pt-4 pb-4 pr-4 pl-4 select-none">
+  <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-6 select-none">
  ```
- **`NavSidebar.tsx`**：
  ```diff
-  <nav ... className="flex h-full min-h-0 flex-col bg-transparent pt-4 pb-4 pl-4 pr-0 select-none cursor-default">
+  <nav ... className="flex h-full min-h-0 flex-col bg-transparent pt-6 pb-6 pl-6 pr-0 select-none cursor-default">
  ```

### 5. 清理硬编码颜色与字体字号
- **去除超小字号**：尽量避免使用 `text-[10px]` 或 `text-[11px]`。若无空间限制，在设置界面、抽屉等区域将字号升格至系统的统一的 `text-xs` (即 `12px` / `0.75rem`)。如确需使用，在全局自定义类中限制，防止字号节奏凌乱。
- **色彩替换为变量**：
  - 将 `FloatDisc.tsx` 的硬编码 SVG 边框改为系统变量颜色或 `border`。例如将 `stroke="rgba(255, 255, 255, 0.15)"` 替换为 `stroke="var(--border)"` 或使用 Tailwind 的 `stroke-border/15`。
  - 将 `FloatDisc.tsx` 的硬编码文字高亮色 `text-[#93c5fd]` 替换为 `text-primary-foreground` 或带有透明度的 `text-primary/70`，以适应浅色模式。
  - 将 `CategoryEditDialog.tsx` 中的 `#8c8c8c` 替换为 HSL/CSS 变量 `var(--muted-foreground)`。

---

## 四、 开发自检清单

在后续进行 UI 交付或重构时，请通过此清单进行审查：

- [ ] **公共组件**：不存在未通过 `<ScrollArea>` 包裹的高于视窗的滚动列表？
- [ ] **表单原子**：不存在原生 `<input type="checkbox">`，已全部使用 Shadcn 的 `<Checkbox>` 组件？
- [ ] **边距规范**：页面边缘（除无边框穿透的悬浮窗外）是否统一留出 `24px` (`p-6` / `UI_TOKENS.content.pagePadding`) 的呼吸深度？
- [ ] **亮暗适配**：代码中是否不存在任何 `#RGB` / `rgba()` / `hsl()` 的硬编码视觉属性？
- [ ] **交互动效**：交互状态（Hover、Focus、Active）全部交由 CSS 或 Tailwind 管理，杜绝使用 JS 强行写入行内样式控制 hover 态？
- [ ] **字阶规范**：正文文字（最小字号）保持在 `text-xs` (`12px`) 以上，不允许随意写入 `text-[10px]` 等超小字体限制无障碍表现？

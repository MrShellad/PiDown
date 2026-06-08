
---

## 📂 深度解耦的前端核心目录设计 (Deep Dive)

```text
frontend/src/
├── core/                        # ==========================================
│   ├── bridge/                  # 【核心逻辑层】：100% 纯逻辑，无任何样式
│   │   ├── tauri-commands.ts    # 封装所有 invoke() 请求（如：startTask, pauseTask）
│   │   └── tauri-events.ts      # 监听后端高频推送（100ms），并将原始数据分发给状态中心
│   │
│   ├── store/                   # 【状态管理中心】
│   │   ├── useDownloadStore.ts  # 管理任务队列、全局速度、限速状态等核心下载业务数据
│   │   └── useThemeStore.ts     # 管理当前激活的主题、全局音效开关、动画特效等级
│   │
│   └── hooks/                   # 【业务逻辑钩子】：解耦 UI 与逻辑的“胶水”
│       ├── useActiveTasks.ts    # 自动过滤并返回当前正在下载的任务列表
│       └── useTaskSpeed.ts      # 传入 GID，计算并格式化单任务的实时下载速度与 ETA
│
├── themes/                      # ==========================================
│   ├── config.ts                # 【皮肤注册中心】：在此定义有哪些皮肤（ThemeRegistry）
│   ├── protocols/               # 【皮肤约束协议】：用 TypeScript 规范每套皮肤必须提供的特效
│   │   └── theme-spec.ts        # 定义皮肤元数据接口（如是否带音效、是否有独立 Canvas 背景）
│   │
│   ├── styles/                  # 【全局样式桶】
│   │   ├── index.css            # Tailwind & CSS 变量注入总入口
│   │   └── animations.css       # 存放高阶动画（如赛博闪烁、流光滚动、Win98抖动）
│   │
│   └── skins/                   # 【换肤外壳隔离区】：未来增加皮肤只需在此新建文件夹
│       ├── modern-fluid/        # ---- 皮肤A：现代流光 ----
│       │   ├── variables.css    # 该皮肤特有的 CSS 变量（毛玻璃、12px圆角、渐变色）
│       │   ├── AuroraBg.tsx     # 专属于该皮肤的 GPU 加速极光背景组件
│       │   └── click.mp3        # 该皮肤特有的现代科技感点击音效
│       │
│       ├── cyberpunk-2077/      # ---- 皮肤B：赛博朋克 ----
│       │   ├── variables.css    # 该皮肤特有的 CSS 变量（硬边缘、发光霓虹边框）
│       │   ├── CyberGrid.tsx    # 专属的黑客数字矩阵/扫描线 Canvas 背景
│       │   └── warning.wav      # 下载失败时特有的警告电子音效
│       │
│       └── retro-win98/         # ---- 皮肤C：复古像素 ----
│           ├── variables.css    # 经典浅灰、立体双边框阴影变量
│           └── PixelStars.tsx   # 专属的 8-Bit 像素星星动画
│
├── components/                  # ==========================================
│   ├── ui/                      # 【shadcn/ui 基础零件库】：不带业务，完全走 CSS 变量
│   │   ├── button.tsx           # 二改后的标准按钮（样式由 var(--primary) 等变量接管）
│   │   ├── progress.tsx         # 二改后的标准进度条（支持流光与发光变量）
│   │   └── dialog.tsx           # 标准弹窗
│   │
│   ├── layout/                  # 【外壳容器包装器】：根据当前皮肤动态穿衣服
│   │   ├── ThemeProvider.tsx    # 监听 useThemeStore，动态切换 document 标签和挂载背景音效
│   │   ├── ActiveBackground.tsx # 条件渲染器：根据当前皮肤加载对应的 AuroraBg 或 CyberGrid
│   │   └── WindowFrame.tsx      # 自定义标题栏（主窗最小化/关闭切换到小窗的交互控制）
│   │
│   └── downloader/              # 【下载器通用业务视图】：只管逻辑骨架，样式全部由变量决定
│       ├── TaskListDashboard.tsx# 主窗口仪表盘大通铺
│       ├── TaskItemCard.tsx     # 核心解耦卡片：负责渲染单条任务的骨架与事件绑定
│       ├── NewTaskModal.tsx     # 新建任务弹窗
│       └── FloatDisc.tsx        # 独立窗口：悬浮小窗视图

```

---

## 📐 核心解耦架构：它们之间是如何无缝运作的？

为了让你看清这种高阶解耦的威力，我们可以拆解“单条下载任务卡片（`TaskItemCard.tsx`）”在多皮肤切换下的运作原理。

### 1. 业务逻辑与结构解耦：`TaskItemCard.tsx`

这个组件**不包含**任何死板的颜色类名（如 `bg-slate-900`），所有的控制全部通过语义化的 Tailwind 变量和条件组件外包出去：

```tsx
import { useTaskSpeed } from "@/core/hooks/useTaskSpeed";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useDownloadStore } from "@/core/store/useDownloadStore";
import { Play, Pause, Trash2 } from "lucide-react";

export default function TaskItemCard({ gid }: { gid: string }) {
  // 1. 从状态中心获取该任务的原始数据（纯数据）
  const task = useDownloadStore((state) => state.tasks[gid]);
  // 2. 利用业务 Hook 计算格式化后的速度和剩余时间
  const { speedStr, progress, etaStr } = useTaskSpeed(gid);
  const toggleTask = useDownloadStore((state) => state.toggleTask);

  if (!task) return null;

  return (
    // bg-background, border-border, shadow-glow 全部是 CSS 变量
    // 会随着最外层 <html data-theme="xxx"> 的切换而自动改变物理表现
    <div className="flex items-center justify-between p-4 bg-background border border-border rounded-lg shadow-glow transition-all duration-300">
      
      {/* 左侧：任务信息骨架 */}
      <div className="flex flex-col flex-1 mr-4">
        <span className="text-sm font-bold text-foreground truncate">{task.name}</span>
        <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
          <span>{speedStr}</span>
          <span>剩余时间: {etaStr}</span>
        </div>
        {/* 使用二改后的 shadcn 进度条，发光与粒子特性完全由当前皮肤的 CSS 控制 */}
        <Progress value={progress} className="mt-2" />
      </div>

      {/* 右侧：交互按钮（控制逻辑） */}
      <div className="flex items-center gap-2">
        <Button 
          size="icon" 
          variant="outline" 
          onClick={() => toggleTask(gid)}
        >
          {task.status === "Downloading" ? <Pause size={16} /> : <Play size={16} />}
        </Button>
      </div>
    </div>
  );
}

```

### 2. 皮肤样式与特效解耦：`cyberpunk-2077/variables.css`

当用户在设置里把皮肤切到“赛博朋克”时，`ThemeProvider` 会把最外层标签变成 `<html data-theme="cyberpunk">`。此时，属于赛博朋克的专有变量桶生效，强行覆盖上面的通用卡片：

```css
[data-theme="cyberpunk"] {
  /* 基础色彩解耦覆盖 */
  --background: #03001e;
  --foreground: #00f0ff;          /* 极光青文字 */
  --muted-foreground: #ff007f;    /* 霓虹粉速度文字 */
  --border: #00f0ff;
  
  /* 形状与特效解耦覆盖 */
  --border-radius: 0px;           /* 强行切断圆角，变硬边缘 */
  --glow-color: rgba(0, 240, 255, 0.6);
  --shadow-glow: 0 0 12px var(--glow-color); /* 卡片获得赛博外发光 */

  /* 注入 progress 专属魔改类（shadcn 内部读取） */
  --progress-bg: #1a0033;
  --progress-indicator: linear-gradient(90deg, #ff007f, #00f0ff);
}

```

### 3. 高阶动态背景解耦：`ActiveBackground.tsx`

不同的皮肤不仅仅是颜色不同，赛博朋克需要背景有黑客帝国的数字下落，现代流光需要炫酷的极光。我们通过一个专门的背景包装器进行物理隔离：

```tsx
import { useThemeStore } from "@/core/store/useThemeStore";
import AuroraBg from "@/themes/skins/modern-fluid/AuroraBg";
import CyberGrid from "@/themes/skins/cyberpunk-2077/CyberGrid";
import PixelStars from "@/themes/skins/retro-win98/PixelStars";

export default function ActiveBackground() {
  const currentTheme = useThemeStore((state) => state.theme);
  const effectsEnabled = useThemeStore((state) => state.effectsEnabled);

  // 如果用户为了省性能关闭了特效，直接返回纯色暗黑背景
  if (!effectsEnabled) return <div className="fixed inset-0 bg-[#09090b] -z-50" />;

  // 100% 隔离的动效条件渲染，互不干扰，未激活的组件会被彻底销毁（Unmount）释放内存
  switch (currentTheme) {
    case "cyberpunk":
      return <CyberGrid />; // 渲染 Canvas 数字矩阵
    case "retro":
      return <PixelStars />; // 渲染 8-bit 星星
    case "modern":
    default:
      return <AuroraBg />; // 渲染 WebGL 极光
  }
}

```

---

## 🎯 这套深度解耦目录的核心资产优势

1. **零代码污染**：你写下载逻辑时，完全不用管界面好不好看；你写“流光动画”或调 Canvas 粒子时，完全不用担心会把下载暂停/续传的逻辑改出 Bug。
2. **极速换肤扩展**：如果你以后想增加第四套样式（比如“动漫元气风”或“极简白”），你**不需要碰 `components/downloader/` 里的任何一个文件**。你只需要在 `themes/skins/` 下新建一个文件夹，配置好对应的 CSS 变量和特有组件，并在 `ThemeRegistry` 中注册一下即可。
3. **悬浮窗轻量化**：由于小窗（`FloatDisc.tsx`）是独立页面，它通过 `core/bridge/tauri-events.ts` 共享同一套轻量级的数据监听钩子，但它的 UI 组件可以直接写得极度紧凑，同样完美享受全局变量带来的无缝一键换肤。
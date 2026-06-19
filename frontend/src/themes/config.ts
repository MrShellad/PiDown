export interface ThemeMeta {
  id: string;
  name: string;
  description: string;
  hasCanvasBg: boolean;
  hasSpecialSound: boolean;
  accent: string;
  previewClassName: string;
}

export const THEME_REGISTRY: ThemeMeta[] = [
  {
    id: "modern",
    name: "Modern Fluid",
    description: "Glassmorphism, gradients, fluid micro-animations, plus dark and tech-blue light color modes.",
    hasCanvasBg: true,
    hasSpecialSound: true,
    accent: "科技蓝亮色",
    previewClassName: "bg-[radial-gradient(circle_at_18%_18%,oklch(0.58_0.2_252_/0.78),transparent_34%),radial-gradient(circle_at_82%_72%,oklch(0.76_0.14_220_/0.58),transparent_31%),linear-gradient(135deg,oklch(0.98_0.014_235),oklch(0.9_0.035_240))]",
  },
  {
    id: "surface",
    name: "Surface",
    description: "Elegant Slate design featuring minimal borders, delicate tones, and focused clarity.",
    hasCanvasBg: false,
    hasSpecialSound: false,
    accent: "靛蓝青色",
    previewClassName: "bg-[radial-gradient(circle_at_18%_18%,rgba(79,70,229,0.12),transparent_34%),radial-gradient(circle_at_82%_72%,rgba(6,182,212,0.1),transparent_31%),linear-gradient(135deg,#F8FAFC,#F1F5F9)]",
  },
  {
    id: "ubuntu",
    name: "Ubuntu",
    description: "Ubuntu system style with classic Orange & Deep Aubergine palette.",
    hasCanvasBg: false,
    hasSpecialSound: false,
    accent: "经典橙紫",
    previewClassName: "bg-[radial-gradient(circle_at_18%_18%,rgba(233,84,32,0.18),transparent_34%),radial-gradient(circle_at_82%_72%,rgba(233,84,32,0.12),transparent_31%),linear-gradient(135deg,#300A24,#241E20)]",
  },
];

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
];

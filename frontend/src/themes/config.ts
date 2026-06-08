export interface ThemeMeta {
  id: "modern" | "cyberpunk" | "retro";
  name: string;
  description: string;
  hasCanvasBg: boolean;
  hasSpecialSound: boolean;
}

export const THEME_REGISTRY: ThemeMeta[] = [
  {
    id: "modern",
    name: "Modern Fluid",
    description: "Glassmorphism, gradients, fluid micro-animations, and soft modern audio.",
    hasCanvasBg: true,
    hasSpecialSound: true,
  },
  {
    id: "cyberpunk",
    name: "Cyberpunk 2077",
    description: "High contrast neon cyan/pink, rigid corners, grid scanlines, and digital synthetic audio.",
    hasCanvasBg: true,
    hasSpecialSound: true,
  },
  {
    id: "retro",
    name: "Retro Win98",
    description: "Classic gray block layout, retro pixel borders, starry canvas, and 8-bit chip sounds.",
    hasCanvasBg: true,
    hasSpecialSound: true,
  },
];

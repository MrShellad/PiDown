export type ThemeFontId = string;

export interface ThemeFontOption {
  id: ThemeFontId;
  label: string;
  description: string;
  stack: string;
  source: "built-in" | "system";
}

export const DEFAULT_THEME_FONT_ID = "builtin:geist";

const FALLBACK_UI_STACK = "'Microsoft YaHei UI', 'PingFang SC', 'Noto Sans CJK SC', sans-serif";

export const BUILT_IN_FONT_OPTIONS: readonly ThemeFontOption[] = [
  {
    id: DEFAULT_THEME_FONT_ID,
    label: "Geist",
    description: "内置默认字体，适合现代下载器界面。",
    stack: "'Geist Variable', " + FALLBACK_UI_STACK,
    source: "built-in",
  },
  {
    id: "builtin:system-ui",
    label: "System UI",
    description: "使用系统默认界面字体，作为系统字体读取失败时的兜底。",
    stack: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', " + FALLBACK_UI_STACK,
    source: "built-in",
  },
];

export function normalizeThemeFontId(fontId: unknown): ThemeFontId {
  return typeof fontId === "string" && fontId.trim()
    ? fontId.trim()
    : DEFAULT_THEME_FONT_ID;
}

export function createSystemFontOption(fontFamily: string): ThemeFontOption | null {
  const family = fontFamily.trim();
  if (!family) return null;

  return {
    id: `system:${family}`,
    label: family,
    description: "从当前系统字体目录读取到的字体。",
    stack: `${quoteFontFamily(family)}, ${FALLBACK_UI_STACK}`,
    source: "system",
  };
}

export function createFontOptions(systemFonts: string[]) {
  const seen = new Set(BUILT_IN_FONT_OPTIONS.map((option) => option.id));
  const options: ThemeFontOption[] = [...BUILT_IN_FONT_OPTIONS];

  for (const font of systemFonts) {
    const option = createSystemFontOption(font);
    if (!option || seen.has(option.id)) continue;
    seen.add(option.id);
    options.push(option);
  }

  return options;
}

export function getThemeFontOption(fontId: ThemeFontId, options = BUILT_IN_FONT_OPTIONS) {
  const normalized = normalizeThemeFontId(fontId);
  return (
    options.find((option) => option.id === normalized) ??
    createFontOptionFromPersistedId(normalized) ??
    BUILT_IN_FONT_OPTIONS[0]
  );
}

function createFontOptionFromPersistedId(fontId: ThemeFontId) {
  if (!fontId.startsWith("system:")) return null;
  return createSystemFontOption(fontId.slice("system:".length));
}

function quoteFontFamily(fontFamily: string) {
  return `'${fontFamily.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
}

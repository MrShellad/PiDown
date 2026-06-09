export const UI_TOKENS = {
  sidebarWidth: "220px",
  settingsSidebarWidth: "208px",
  settingsDialog: {
    width: "1040px",
    height: "720px",
    maxWidth: "calc(100vw - 2rem)",
    maxHeight: "calc(100vh - 2rem)",
  },
  frameHeights: {
    modern: "44px",
  },
  icon: {
    xs: "0.75rem",
    sm: "0.875rem",
    md: "1rem",
    lg: "1.125rem",
  },
  tooltip: {
    delayDuration: 260,
    skipDelayDuration: 80,
    sideOffset: 8,
    collisionPadding: 12,
  },
  content: {
    pagePadding: "1.5rem",
    cardPadding: "1.25rem",
    sectionGap: "1.5rem",
    blockGap: "1rem",
  },
} as const;

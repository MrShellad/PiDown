import { useThemeStore } from "@/core/store/useThemeStore";
import AuroraBg from "@/themes/skins/modern-fluid/AuroraBg";

export default function ActiveBackground() {
  const theme = useThemeStore((state) => state.theme);
  const effectsEnabled = useThemeStore((state) => state.effectsEnabled);

  if (!effectsEnabled) {
    return <div className="fixed inset-0 -z-50 bg-[var(--theme-static-background)]" />;
  }

  void theme;
  return <AuroraBg />;
}

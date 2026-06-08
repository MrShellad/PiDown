import { useThemeStore } from "@/core/store/useThemeStore";
import AuroraBg from "@/themes/skins/modern-fluid/AuroraBg";
import CyberGrid from "@/themes/skins/cyberpunk-2077/CyberGrid";
import PixelStars from "@/themes/skins/retro-win98/PixelStars";

export default function ActiveBackground() {
  const theme = useThemeStore((state) => state.theme);
  const effectsEnabled = useThemeStore((state) => state.effectsEnabled);

  if (!effectsEnabled) {
    // Return theme-matched static colored background
    if (theme === "cyberpunk") {
      return <div className="fixed inset-0 bg-[#03001e] -z-50" />;
    } else if (theme === "retro") {
      return <div className="fixed inset-0 bg-[#c0c0c0] -z-50" />;
    } else {
      return <div className="fixed inset-0 bg-[#090710] -z-50" />;
    }
  }

  switch (theme) {
    case "cyberpunk":
      return <CyberGrid />;
    case "retro":
      return <PixelStars />;
    case "modern":
    default:
      return <AuroraBg />;
  }
}

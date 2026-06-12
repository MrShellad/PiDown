import { useEffect, useState } from "react";
import { useThemeStore } from "@/core/store/useThemeStore";
import { useAppSettingsStore } from "@/core/store/useAppSettingsStore";
import { getBackgrounds, type DbBackground } from "@/core/bridge/tauri-commands";
import { convertFileSrc } from "@tauri-apps/api/core";
import AuroraBg from "@/themes/skins/modern-fluid/AuroraBg";

export default function ActiveBackground() {
  const theme = useThemeStore((state) => state.theme);
  const effectsEnabled = useThemeStore((state) => state.effectsEnabled);
  const settings = useAppSettingsStore((state) => state.settings);
  const bgId = settings?.interface?.background_id;

  const [backgrounds, setBackgrounds] = useState<DbBackground[]>([]);

  useEffect(() => {
    getBackgrounds()
      .then(setBackgrounds)
      .catch((err) => console.error("Failed to load backgrounds:", err));
  }, [bgId]);

  const activeBg = backgrounds.find((b) => b.id === bgId);
  const hideBorderAndBg = settings?.interface?.hide_border_and_bg ?? false;
  const opacityVal = hideBorderAndBg ? 0 : (settings?.interface?.background_opacity ?? 100);


  const renderContent = () => {
    if (!activeBg) {
      if (!effectsEnabled) {
        return <div className="absolute inset-0" style={{ background: "var(--theme-static-background)" }} />;
      }
      void theme;
      return <AuroraBg />;
    }

    let assetUrl = "";
    if (activeBg.path) {
      try {
        assetUrl = convertFileSrc(activeBg.path);
      } catch {
        assetUrl = activeBg.path;
      }
    }

    const blurVal = settings?.interface?.background_blur ?? 0;
    const maskColor = settings?.interface?.background_mask_color ?? "#000000";
    const maskOpacity = settings?.interface?.background_mask_opacity ?? 0;

    return (
      <>
        {activeBg.type === "video" ? (
          <video
            src={assetUrl}
            autoPlay
            muted
            loop
            playsInline
            className="w-full h-full object-cover transition-all duration-300"
            style={{ filter: `blur(${blurVal}px)` }}
          />
        ) : (
          <img
            src={assetUrl}
            alt="custom-bg"
            className="w-full h-full object-cover transition-all duration-300"
            style={{ filter: `blur(${blurVal}px)` }}
          />
        )}
        <div
          className="absolute inset-0 transition-all duration-300"
          style={{
            backgroundColor: maskColor,
            opacity: maskOpacity / 100,
          }}
        />
      </>
    );
  };

  return (
    <div
      className="absolute inset-0 -z-50 overflow-hidden select-none pointer-events-none transition-all duration-300 rounded-lg"
      style={{ opacity: opacityVal / 100 }}
    >
      {renderContent()}
    </div>
  );
}

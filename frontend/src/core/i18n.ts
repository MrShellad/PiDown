import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import zhCN from "../locales/zh-CN.json";
import enUS from "../locales/en-US.json";

/** All supported locales with display labels. */
export const SUPPORTED_LANGUAGES = [
  { code: "auto", label: "" }, // label resolved at runtime via UI_TEXT
  { code: "zh-CN", label: "简体中文" },
  { code: "en-US", label: "English" },
] as const;

export type LanguageCode = (typeof SUPPORTED_LANGUAGES)[number]["code"];

/**
 * Resolve the effective locale for the "auto" setting.
 * Uses `navigator.language` and falls back to "zh-CN".
 */
export function resolveAutoLocale(): string {
  const nav = navigator.language; // e.g. "zh-CN", "en-US", "en"
  if (nav.startsWith("zh")) return "zh-CN";
  if (nav.startsWith("en")) return "en-US";
  return "zh-CN"; // fallback
}

/**
 * Apply a language setting. Pass "auto" to detect from the browser.
 * Returns the resolved locale code that was actually applied.
 */
export function applyLanguage(setting: string): string {
  const resolved = setting === "auto" ? resolveAutoLocale() : setting;
  if (i18n.language !== resolved) {
    i18n.changeLanguage(resolved);
  }
  return resolved;
}

i18n
  .use(initReactI18next)
  .init({
    resources: {
      "zh-CN": {
        translation: zhCN,
      },
      "en-US": {
        translation: enUS,
      },
    },
    lng: resolveAutoLocale(), // Default: auto-detect
    fallbackLng: "zh-CN",
    interpolation: {
      escapeValue: false, // React already safes from XSS
    },
  });

export default i18n;

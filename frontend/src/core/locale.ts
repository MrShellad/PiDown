import i18n from "./i18n";
import zhCN from "../locales/zh-CN.json";

// A recursive Proxy to intercept property accesses and dynamically call i18n.t
function createLocaleProxy<T extends object>(prefix: string, schema: T): T {
  return new Proxy(schema, {
    get(target, prop) {
      if (typeof prop !== "string") return undefined;
      const key = prefix ? `${prefix}.${prop}` : prop;

      const val = (target as any)[prop];
      if (val && typeof val === "object") {
        return createLocaleProxy(key, val);
      }

      return i18n.t(key);
    },
  }) as T;
}

export const UI_TEXT = createLocaleProxy("", zhCN);

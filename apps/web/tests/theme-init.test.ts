import { readFileSync } from "node:fs";
import { createContext, runInContext } from "node:vm";
import { describe, expect, it } from "vitest";
import {
  themeAppearance,
  themeBrowserColor,
  themeFromSavedPreferences,
  themeStyle,
  WORKBENCH_THEMES,
} from "../src/theme-preferences";

const script = readFileSync("public/theme-init.js", "utf8");

function bootstrap(
  saved: Record<string, string>,
  { storageBlocked = false, hasOwnAvailable = true } = {},
) {
  const page = document.implementation.createHTMLDocument();
  const meta = page.createElement("meta");
  meta.name = "theme-color";
  meta.content = "#11110f";
  page.head.append(meta);
  const values = new Map(Object.entries(saved));
  const context = createContext({
    document: page,
    localStorage: {
      getItem: (key: string) => {
        if (storageBlocked) throw new Error("Storage unavailable");
        return values.get(key) ?? null;
      },
      removeItem: (key: string) => values.delete(key),
      setItem: (key: string, value: string) => values.set(key, value),
    },
  });
  if (!hasOwnAvailable) runInContext("Object.hasOwn = undefined;", context);
  runInContext(script, context);
  return {
    classes: [...page.documentElement.classList],
    color: meta.content,
    values,
  };
}

describe.each([true, false])(
  "pre-render theme initialization (Object.hasOwn available: %s)",
  (hasOwnAvailable) => {
    it.each(WORKBENCH_THEMES)(
      "preserves $label before React loads",
      ({ browserColor, theme }) => {
        const result = bootstrap(
          {
            "herdr-web-theme": theme,
            "herdr-web-appearance":
              themeAppearance(theme) === "light" ? "dark" : "light",
          },
          { hasOwnAvailable },
        );
        expect(result.values.get("herdr-web-theme")).toBe(theme);
        expect(result.classes).toEqual([
          themeAppearance(theme),
          `theme-${themeStyle(theme)}`,
        ]);
        expect(result.color).toBe(browserColor);
      },
    );

    it.each(["light", "dark"])(
      "matches React's invalid-theme fallback for %s",
      (appearance) => {
        for (const savedTheme of [
          "invalid",
          "toString",
          "constructor",
          "__proto__",
          "hasOwnProperty",
        ]) {
          const theme = themeFromSavedPreferences(savedTheme, appearance);
          const result = bootstrap(
            {
              "herdr-web-theme": savedTheme,
              "herdr-web-appearance": appearance,
            },
            { hasOwnAvailable },
          );
          expect(result.values.get("herdr-web-theme")).toBe(theme);
          expect(result.color).toBe(themeBrowserColor(theme));
          expect(result.classes).toEqual([appearance, "theme-editorial"]);
        }
      },
    );

    it("still migrates the legacy appearance key", () => {
      const legacyKey = ["he", "dr-appearance"].join("");
      const result = bootstrap({ [legacyKey]: "light" }, { hasOwnAvailable });
      expect(result.values.has(legacyKey)).toBe(false);
      expect(result.values.get("herdr-web-appearance")).toBe("light");
      expect(result.values.get("herdr-web-theme")).toBe("editorial-light");
    });

    it("keeps the default when storage is empty or unavailable", () => {
      for (const blocked of [false, true]) {
        const result = bootstrap(
          {},
          { storageBlocked: blocked, hasOwnAvailable },
        );
        expect(result.classes).toEqual(["dark", "theme-editorial"]);
        expect(result.color).toBe("#11110f");
      }
    });
  },
);

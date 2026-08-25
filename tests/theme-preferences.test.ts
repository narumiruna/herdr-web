import { describe, expect, it } from "vitest";
import {
  DEFAULT_WORKBENCH_THEME,
  isWorkbenchTheme,
  themeAppearance,
  themeBrowserColor,
  themeFromSavedPreferences,
  themeStyle,
  toggleThemeAppearance,
} from "../src/theme-preferences";

describe("theme preferences", () => {
  it("defaults to Editorial Dark and migrates saved appearances", () => {
    expect(themeFromSavedPreferences(null, null)).toBe(DEFAULT_WORKBENCH_THEME);
    expect(themeFromSavedPreferences(null, "light")).toBe("editorial-light");
    expect(themeFromSavedPreferences(null, "dark")).toBe("editorial-dark");
  });

  it("prefers every valid saved theme and rejects invalid values", () => {
    for (const theme of [
      "editorial-light",
      "editorial-dark",
      "classic-light",
      "classic-dark",
    ] as const) {
      expect(isWorkbenchTheme(theme)).toBe(true);
      expect(themeFromSavedPreferences(theme, "light")).toBe(theme);
    }
    expect(isWorkbenchTheme("sepia")).toBe(false);
    expect(themeFromSavedPreferences("sepia", "light")).toBe("editorial-light");
  });

  it("derives style and appearance and toggles within each style", () => {
    expect(themeStyle("editorial-light")).toBe("editorial");
    expect(themeStyle("classic-dark")).toBe("classic");
    expect(themeAppearance("classic-light")).toBe("light");
    expect(themeAppearance("editorial-dark")).toBe("dark");
    expect(toggleThemeAppearance("editorial-light")).toBe("editorial-dark");
    expect(toggleThemeAppearance("classic-dark")).toBe("classic-light");
    expect(themeBrowserColor("editorial-light")).toBe("#f6f3ed");
    expect(themeBrowserColor("editorial-dark")).toBe("#11110f");
    expect(themeBrowserColor("classic-light")).toBe("#f9f9f8");
    expect(themeBrowserColor("classic-dark")).toBe("#111110");
  });
});

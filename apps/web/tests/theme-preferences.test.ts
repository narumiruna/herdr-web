import { describe, expect, it } from "vitest";
import {
  DEFAULT_WORKBENCH_THEME,
  isWorkbenchTheme,
  themeAppearance,
  themeBrowserColor,
  themeFromSavedPreferences,
  themeStyle,
  toggleThemeAppearance,
  WORKBENCH_THEME_STYLES,
  WORKBENCH_THEMES,
} from "../src/theme-preferences";

describe("theme preferences", () => {
  it("defaults to Editorial Dark and migrates saved appearances", () => {
    expect(themeFromSavedPreferences(null, null)).toBe(DEFAULT_WORKBENCH_THEME);
    expect(themeFromSavedPreferences(null, "light")).toBe("editorial-light");
    expect(themeFromSavedPreferences(null, "dark")).toBe("editorial-dark");
    expect(themeFromSavedPreferences(null, "invalid")).toBe("editorial-dark");
  });

  it.each(WORKBENCH_THEMES)(
    "restores $label and toggles appearance without changing its style",
    ({ browserColor, theme }) => {
      const style = themeStyle(theme);
      const appearance = themeAppearance(theme);
      expect(isWorkbenchTheme(theme)).toBe(true);
      expect(themeFromSavedPreferences(theme, "light")).toBe(theme);
      expect(themeFromSavedPreferences(theme, "dark")).toBe(theme);
      expect(theme).toBe(`${style}-${appearance}`);
      expect(themeBrowserColor(theme)).toBe(browserColor);
      const toggled = toggleThemeAppearance(theme);
      expect(isWorkbenchTheme(toggled)).toBe(true);
      expect(themeStyle(toggled)).toBe(style);
      expect(themeAppearance(toggled)).not.toBe(appearance);
      expect(toggleThemeAppearance(toggled)).toBe(theme);
    },
  );

  it("registers a unique light and dark choice for every style", () => {
    expect(new Set(WORKBENCH_THEMES.map(({ theme }) => theme)).size).toBe(10);
    for (const style of WORKBENCH_THEME_STYLES) {
      expect(isWorkbenchTheme(`${style}-light`)).toBe(true);
      expect(isWorkbenchTheme(`${style}-dark`)).toBe(true);
    }
    expect(themeStyle("mist-light")).toBe("mist");
    expect(themeStyle("sage-dark")).toBe("sage");
    expect(themeStyle("linen-light")).toBe("linen");
  });

  it.each([null, "sepia", "mist", "sage-auto", "linen-light-extra"])(
    "rejects invalid theme %s and falls back to the saved appearance",
    (value) => {
      expect(isWorkbenchTheme(value)).toBe(false);
      expect(themeFromSavedPreferences(value, "light")).toBe("editorial-light");
      expect(themeFromSavedPreferences(value, "dark")).toBe("editorial-dark");
    },
  );

  it("preserves the existing browser colors", () => {
    expect(themeBrowserColor("editorial-light")).toBe("#f6f3ed");
    expect(themeBrowserColor("editorial-dark")).toBe("#11110f");
    expect(themeBrowserColor("classic-light")).toBe("#f9f9f8");
    expect(themeBrowserColor("classic-dark")).toBe("#111110");
  });
});

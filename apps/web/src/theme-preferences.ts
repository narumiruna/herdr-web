export type Appearance = "light" | "dark";
export const WORKBENCH_THEME_STYLES = [
  "editorial",
  "classic",
  "mist",
  "sage",
  "linen",
] as const;
export type ThemeStyle = (typeof WORKBENCH_THEME_STYLES)[number];
export type WorkbenchTheme = `${ThemeStyle}-${Appearance}`;

export const DEFAULT_WORKBENCH_THEME: WorkbenchTheme = "editorial-dark";

export const WORKBENCH_THEMES = [
  {
    browserColor: "#f6f3ed",
    description: "Warm paper, sumi ink, and restrained editorial accents.",
    label: "Editorial Light",
    theme: "editorial-light",
  },
  {
    browserColor: "#11110f",
    description: "Subdued sumi surfaces with editorial accents.",
    label: "Editorial Dark",
    theme: "editorial-dark",
  },
  {
    browserColor: "#f9f9f8",
    description: "The original light Sand and Amber workbench.",
    label: "Classic Light",
    theme: "classic-light",
  },
  {
    browserColor: "#111110",
    description: "The original dark Sand and Amber workbench.",
    label: "Classic Dark",
    theme: "classic-dark",
  },
  {
    browserColor: "#f5f7fa",
    description: "Cool white, soft slate, and quiet blue accents.",
    label: "Mist Light",
    theme: "mist-light",
  },
  {
    browserColor: "#141a22",
    description: "Deep slate with soft blue accents.",
    label: "Mist Dark",
    theme: "mist-dark",
  },
  {
    browserColor: "#f5f8f5",
    description: "Fresh white, pale sage, and muted green accents.",
    label: "Sage Light",
    theme: "sage-light",
  },
  {
    browserColor: "#151c19",
    description: "Quiet charcoal with soft sage accents.",
    label: "Sage Dark",
    theme: "sage-dark",
  },
  {
    browserColor: "#faf7f2",
    description: "Soft ivory, warm stone, and understated taupe.",
    label: "Linen Light",
    theme: "linen-light",
  },
  {
    browserColor: "#1c1916",
    description: "Warm charcoal with gentle sandstone accents.",
    label: "Linen Dark",
    theme: "linen-dark",
  },
] as const satisfies ReadonlyArray<{
  browserColor: string;
  description: string;
  label: string;
  theme: WorkbenchTheme;
}>;

export function isWorkbenchTheme(
  value: string | null,
): value is WorkbenchTheme {
  return WORKBENCH_THEMES.some(({ theme }) => theme === value);
}

export function themeAppearance(theme: WorkbenchTheme): Appearance {
  return theme.endsWith("-light") ? "light" : "dark";
}

export function themeStyle(theme: WorkbenchTheme): ThemeStyle {
  return theme.split("-")[0] as ThemeStyle;
}

export function themeBrowserColor(theme: WorkbenchTheme): string {
  return (
    WORKBENCH_THEMES.find(({ theme: option }) => option === theme)
      ?.browserColor ?? "#11110f"
  );
}

export function toggleThemeAppearance(theme: WorkbenchTheme): WorkbenchTheme {
  return `${themeStyle(theme)}-${themeAppearance(theme) === "light" ? "dark" : "light"}`;
}

export function themeFromSavedPreferences(
  savedTheme: string | null,
  savedAppearance: string | null,
): WorkbenchTheme {
  if (isWorkbenchTheme(savedTheme)) return savedTheme;
  return savedAppearance === "light"
    ? "editorial-light"
    : DEFAULT_WORKBENCH_THEME;
}

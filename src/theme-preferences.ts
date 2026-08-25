export type Appearance = "light" | "dark";
export type ThemeStyle = "classic" | "editorial";
export type WorkbenchTheme = `${ThemeStyle}-${Appearance}`;

export const DEFAULT_WORKBENCH_THEME: WorkbenchTheme = "editorial-dark";

export const WORKBENCH_THEMES = [
  {
    description: "Warm paper, sumi ink, and restrained editorial accents.",
    label: "Editorial Light",
    theme: "editorial-light",
  },
  {
    description: "Subdued sumi surfaces with editorial accents.",
    label: "Editorial Dark",
    theme: "editorial-dark",
  },
  {
    description: "The original light Sand and Amber workbench.",
    label: "Classic Light",
    theme: "classic-light",
  },
  {
    description: "The original dark Sand and Amber workbench.",
    label: "Classic Dark",
    theme: "classic-dark",
  },
] as const satisfies ReadonlyArray<{
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
  return theme.startsWith("classic-") ? "classic" : "editorial";
}

export function themeBrowserColor(theme: WorkbenchTheme): string {
  if (theme === "classic-light") return "#f9f9f8";
  if (theme === "classic-dark") return "#111110";
  return theme === "editorial-light" ? "#f6f3ed" : "#11110f";
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

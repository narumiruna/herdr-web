try {
  const key = "herdr-web-appearance";
  const legacyKey = ["he", "dr-appearance"].join("");
  const saved = localStorage.getItem(key) ?? localStorage.getItem(legacyKey);
  if (localStorage.getItem(key) === null && saved !== null) {
    localStorage.setItem(key, saved);
    localStorage.removeItem(legacyKey);
  }
  const appearance = saved === "light" ? "light" : "dark";
  const themeKey = "herdr-web-theme";
  const savedTheme = localStorage.getItem(themeKey);
  // Keep this pre-render palette aligned with src/theme-preferences.ts.
  const browserColors = {
    "editorial-light": "#f6f3ed",
    "editorial-dark": "#11110f",
    "classic-light": "#f9f9f8",
    "classic-dark": "#111110",
    "mist-light": "#f5f7fa",
    "mist-dark": "#141a22",
    "sage-light": "#f5f8f5",
    "sage-dark": "#151c19",
    "linen-light": "#faf7f2",
    "linen-dark": "#1c1916",
  };
  // Keep the pre-render script compatible with browsers without Object.hasOwn.
  const theme = Object.keys(browserColors).includes(savedTheme)
    ? savedTheme
    : `editorial-${appearance}`;
  localStorage.setItem(themeKey, theme);
  const [style, themeAppearance] = theme.split("-");
  document.documentElement.classList.add(themeAppearance, `theme-${style}`);
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", browserColors[theme]);
} catch {
  document.documentElement.classList.add("dark", "theme-editorial");
}

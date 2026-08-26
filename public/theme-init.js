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
  const themes = [
    "editorial-light",
    "editorial-dark",
    "classic-light",
    "classic-dark",
  ];
  const theme = themes.includes(savedTheme)
    ? savedTheme
    : `editorial-${appearance}`;
  localStorage.setItem(themeKey, theme);
  const [style, themeAppearance] = theme.split("-");
  document.documentElement.classList.add(themeAppearance, `theme-${style}`);
  const browserColors = {
    "editorial-light": "#f6f3ed",
    "editorial-dark": "#11110f",
    "classic-light": "#f9f9f8",
    "classic-dark": "#111110",
  };
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", browserColors[theme]);
} catch {
  document.documentElement.classList.add("dark", "theme-editorial");
}

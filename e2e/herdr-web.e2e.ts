import { expect, type Page, test } from "@playwright/test";

async function hasNoPageOverflow(page: Page) {
  return page.evaluate(
    () => document.documentElement.scrollWidth <= window.innerWidth,
  );
}

test("defaults to dark and preserves an explicit light appearance", async ({
  page,
}) => {
  await page.goto("/");

  await expect(page.locator("html")).toHaveClass(/dark/);
  await expect(page.locator("html")).toHaveClass(/theme-editorial/);
  await expect(page.locator(".herdr-web-theme")).toHaveClass(/dark/);
  await expect(page.locator(".herdr-web-theme")).toHaveClass(/theme-editorial/);
  await expect(
    page.getByRole("button", { name: "Use light appearance" }),
  ).toBeVisible();
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute(
    "content",
    "#11110f",
  );

  await page.getByRole("button", { name: "Use light appearance" }).click();
  await expect(page.locator("html")).toHaveClass(/light/);
  await expect(page.locator(".herdr-web-theme")).toHaveClass(/light/);
  await expect
    .poll(() =>
      page.evaluate(() => localStorage.getItem("herdr-web-appearance")),
    )
    .toBe("light");
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem("herdr-web-theme")))
    .toBe("editorial-light");
  await page.reload();
  await expect(page.locator("html")).toHaveClass(/light/);
  await expect(page.locator(".herdr-web-theme")).toHaveClass(/light/);
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute(
    "content",
    "#f6f3ed",
  );
});

test("migrates a saved appearance to an Editorial theme on first load", async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.removeItem("herdr-web-theme");
    localStorage.setItem("herdr-web-appearance", "light");
  });
  await page.goto("/");
  await expect(page.locator("html")).toHaveClass(/light/);
  await expect(page.locator("html")).toHaveClass(/theme-editorial/);
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem("herdr-web-theme")))
    .toBe("editorial-light");
});

test("Editorial palette propagates into portalled Radix themes", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });

  const expectedThemes = {
    light: {
      buttonBackground: "rgb(156, 61, 45)",
      buttonText: "rgb(255, 253, 250)",
      selectedBorder: "rgb(170, 80, 61)",
      tokens: {
        "--amber-9": "#9c3d2d",
        "--blue-9": "#405779",
        "--grass-9": "#4c6540",
        "--red-9": "#8f3040",
        "--radius-4": "8px",
      },
    },
    dark: {
      buttonBackground: "rgb(241, 154, 132)",
      buttonText: "rgb(17, 17, 15)",
      selectedBorder: "rgb(210, 126, 104)",
      tokens: {
        "--amber-9": "#f19a84",
        "--blue-9": "#a9c2ec",
        "--grass-9": "#abc995",
        "--red-9": "#f29aa5",
        "--radius-4": "8px",
      },
    },
  } as const;

  for (const appearance of ["light", "dark"] as const) {
    await page.goto("/");
    await page.evaluate((value) => {
      localStorage.setItem("herdr-web-appearance", value);
      localStorage.setItem("herdr-web-theme", `editorial-${value}`);
    }, appearance);
    await page.reload();
    await page.getByRole("button", { name: "Open menu" }).click();
    await page.getByRole("menuitem", { name: "Settings" }).click();

    const settings = page.getByRole("dialog", { name: "Settings" });
    await expect(settings).toHaveClass(/radix-themes/);
    await expect(settings).toHaveClass(new RegExp(appearance));
    const palette = await settings.evaluate((element) => {
      const styles = getComputedStyle(element);
      return Object.fromEntries(
        ["--amber-9", "--blue-9", "--grass-9", "--red-9", "--radius-4"].map(
          (token) => [token, styles.getPropertyValue(token).trim()],
        ),
      );
    });
    expect(palette).toEqual(expectedThemes[appearance].tokens);

    const selectedTheme = settings.locator(
      '.theme-options label[data-selected="true"]',
    );
    await expect(selectedTheme).toHaveCSS(
      "background-color",
      "rgba(0, 0, 0, 0)",
    );
    await expect(selectedTheme).toHaveCSS("box-shadow", "none");
    await expect(selectedTheme).toHaveCSS(
      "border-color",
      expectedThemes[appearance].selectedBorder,
    );
    await expect(settings.getByRole("button", { name: "Apply" })).toHaveCSS(
      "background-color",
      expectedThemes[appearance].buttonBackground,
    );
    await expect(settings.getByRole("button", { name: "Apply" })).toHaveCSS(
      "color",
      expectedThemes[appearance].buttonText,
    );
  }
});

test("Settings offers ten themes and preserves style when toggling appearance", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/");
  await page.getByRole("button", { name: "Open menu" }).click();
  await page.getByRole("menuitem", { name: "Settings" }).click();

  const settings = page.getByRole("dialog", { name: "Settings" });
  const themes = settings.getByRole("group", { name: "Theme" });
  await expect(themes.getByRole("radio")).toHaveCount(10);
  await expect(
    themes.getByRole("radio", { name: /^Editorial Dark/ }),
  ).toBeChecked();
  await themes.getByRole("radio", { name: /^Classic Light/ }).click();
  await settings.getByRole("button", { name: "Apply" }).click();

  await expect(page.locator("html")).toHaveClass(/light/);
  await expect(page.locator("html")).toHaveClass(/theme-classic/);
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem("herdr-web-theme")))
    .toBe("classic-light");
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute(
    "content",
    "#f9f9f8",
  );
  const classicMetrics = await page.evaluate(() => {
    const theme = document.querySelector(".herdr-web-theme") as Element;
    return {
      accent: getComputedStyle(theme).getPropertyValue("--amber-9").trim(),
      brandFont: getComputedStyle(
        document.querySelector(".brand-type strong") as Element,
      ).fontFamily,
      tabBorder: getComputedStyle(
        document.querySelector(".session-tabs") as Element,
      ).borderBottomWidth,
      terminalRadius: getComputedStyle(
        document.querySelector(".terminal-shell") as Element,
      ).borderRadius,
    };
  });
  expect(classicMetrics.accent).not.toBe("#9c3d2d");
  expect(classicMetrics.brandFont).toContain("Bricolage Grotesque");
  expect(classicMetrics.tabBorder).toBe("0px");
  expect(classicMetrics.terminalRadius).toBe("10px");

  await page.getByRole("button", { name: "Use dark appearance" }).click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await expect(page.locator("html")).toHaveClass(/theme-classic/);
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem("herdr-web-theme")))
    .toBe("classic-dark");
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute(
    "content",
    "#111110",
  );

  await page.getByRole("button", { name: "Open menu" }).click();
  await page.getByRole("menuitem", { name: "Settings" }).click();
  await expect(
    page.getByRole("radio", { name: /^Classic Dark/ }),
  ).toBeChecked();
});

test("Classic themes retain accessible controls, focus, and dialogs", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });

  for (const theme of ["classic-light", "classic-dark"] as const) {
    await page.goto("/");
    await page.evaluate((value) => {
      localStorage.setItem("herdr-web-theme", value);
      localStorage.setItem(
        "herdr-web-appearance",
        value.endsWith("-light") ? "light" : "dark",
      );
    }, theme);
    await page.reload();

    const command = page.getByRole("button", { name: "Open Action Palette" });
    await command.focus();
    const ratios = await command.evaluate((element) => {
      const channels = (color: string) => {
        const values =
          color
            .match(/[\d.]+/g)
            ?.slice(0, 3)
            .map(Number) ?? [];
        return color.startsWith("color(")
          ? values.map((value) => value * 255)
          : values;
      };
      const luminance = (color: string) => {
        const values = channels(color).map((channel) => {
          const normalized = channel / 255;
          return normalized <= 0.04045
            ? normalized / 12.92
            : ((normalized + 0.055) / 1.055) ** 2.4;
        });
        return (
          0.2126 * (values[0] ?? 0) +
          0.7152 * (values[1] ?? 0) +
          0.0722 * (values[2] ?? 0)
        );
      };
      const contrast = (left: string, right: string) => {
        const values = [luminance(left), luminance(right)].sort(
          (a, b) => b - a,
        );
        return ((values[0] ?? 0) + 0.05) / ((values[1] ?? 0) + 0.05);
      };
      const styles = getComputedStyle(element);
      return {
        border: contrast(styles.borderColor, styles.backgroundColor),
        focus: contrast(styles.outlineColor, styles.backgroundColor),
        outlineStyle: styles.outlineStyle,
        tabIndicator: contrast(
          getComputedStyle(
            document.querySelector(
              '.session-tab[data-state="active"]',
            ) as Element,
          ).borderBottomColor,
          getComputedStyle(document.querySelector(".session-tabs") as Element)
            .backgroundColor,
        ),
      };
    });
    expect(ratios.tabIndicator, `${theme} selected tab`).toBeGreaterThanOrEqual(
      3,
    );
    expect(ratios.border, `${theme} control border`).toBeGreaterThanOrEqual(3);
    expect(ratios.focus, `${theme} focus`).toBeGreaterThanOrEqual(3);
    expect(ratios.outlineStyle).toBe("solid");

    await page.getByRole("button", { name: "Open details" }).click();
    await expect(
      page.getByRole("dialog", { name: "Session details" }),
    ).toHaveCSS("box-shadow", /.+/);
    expect(
      await page
        .getByRole("dialog", { name: "Session details" })
        .evaluate((element) => getComputedStyle(element).boxShadow),
    ).not.toBe("none");
  }
});

test("desktop workbench gives the terminal priority", async ({
  page,
}, testInfo) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem("herdr-web-theme")) {
      localStorage.setItem("herdr-web-theme", "editorial-light");
      localStorage.setItem("herdr-web-appearance", "light");
    }
  });
  await page.setViewportSize({ width: 1536, height: 960 });
  await page.goto("/");

  await expect(page).toHaveTitle("(1) api-review · herdr — herdr-web");
  await expect(page.locator(".brand-type strong")).toHaveText("herdr-web");
  await expect(page.locator(".agent-title-line")).toHaveCount(0);
  await expect(
    page.getByRole("region", { name: "Needs input", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Activity" })).toHaveCount(0);
  await expect(
    page.getByRole("region", { name: "claude · API review terminal" }),
  ).toBeVisible();
  await expect(page.getByRole("tablist", { name: "herdr tabs" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "New Agent in herdr" }),
  ).toBeVisible();
  await expect(page.getByRole("tab")).toHaveCount(3);
  await expect(page.getByRole("tab", { selected: true })).toContainText(
    "Needs input",
  );
  await expect(page.locator(".workspace-cwd")).toContainText(
    "~/Projects/herdr",
  );
  await expect(page.getByRole("heading", { name: "Agents" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Terminals" })).toHaveCount(0);
  expect(await hasNoPageOverflow(page)).toBe(true);

  const lightMetrics = await page.evaluate(() => {
    return {
      brandMark:
        document
          .querySelector(".sidebar-brand .brand-mark")
          ?.getBoundingClientRect().width ?? 0,
      sidebar:
        document.querySelector(".desktop-sidebar")?.getBoundingClientRect()
          .width ?? 0,
      terminalArea: (() => {
        const rect = document
          .querySelector(".terminal-shell")
          ?.getBoundingClientRect();
        return rect ? rect.width * rect.height : 0;
      })(),
      workSurfaceArea: (() => {
        const rect = document
          .querySelector(".main-workspace")
          ?.getBoundingClientRect();
        return rect ? rect.width * rect.height : 0;
      })(),
      terminalTop:
        document.querySelector(".terminal-shell")?.getBoundingClientRect()
          .top ?? 999,
      topbarHeight:
        document.querySelector(".topbar")?.getBoundingClientRect().height ?? 0,
      terminalToolsHeight:
        document
          .querySelector(".interactive-terminal-tools")
          ?.getBoundingClientRect().height ?? 0,
      terminalToolsBorder: Number.parseFloat(
        getComputedStyle(
          document.querySelector(".interactive-terminal-tools") as Element,
        ).borderBottomWidth,
      ),
      tabStripBorder: Number.parseFloat(
        getComputedStyle(document.querySelector(".session-tabs") as Element)
          .borderBottomWidth,
      ),
      redundantPaneTitles: document.querySelectorAll(".pane-titlebar").length,
      terminalContextCenters: [
        ".workspace-cwd",
        ".terminal-toolbar-branch",
        ".interactive-terminal-state",
      ].map((selector) => {
        const rect = document.querySelector(selector)?.getBoundingClientRect();
        return rect ? rect.top + rect.height / 2 : 0;
      }),
      tabsRight:
        document.querySelector(".session-tabs-scroll")?.getBoundingClientRect()
          .right ?? 0,
      newTabLeft:
        document.querySelector(".session-tabs-new")?.getBoundingClientRect()
          .left ?? 0,
    };
  });
  expect(lightMetrics.brandMark).toBeLessThanOrEqual(30);
  expect(lightMetrics.sidebar).toBeLessThanOrEqual(224);
  expect(
    lightMetrics.terminalArea / lightMetrics.workSurfaceArea,
  ).toBeGreaterThanOrEqual(0.7);
  expect(lightMetrics.terminalTop).toBeLessThanOrEqual(225);
  expect(lightMetrics.topbarHeight).toBeLessThanOrEqual(56);
  expect(lightMetrics.terminalToolsHeight).toBeLessThanOrEqual(44);
  expect(lightMetrics.terminalToolsBorder).toBe(1);
  expect(lightMetrics.tabStripBorder).toBe(1);
  expect(lightMetrics.redundantPaneTitles).toBe(0);
  expect(
    Math.max(...lightMetrics.terminalContextCenters) -
      Math.min(...lightMetrics.terminalContextCenters),
  ).toBeLessThanOrEqual(1);
  expect(
    Math.abs(lightMetrics.tabsRight - lightMetrics.newTabLeft),
  ).toBeLessThanOrEqual(1);
  const contrastRatios = await page.evaluate(() => {
    const rgb = (value: string) =>
      (value
        .match(/[\d.]+/g)
        ?.slice(0, 3)
        .map(Number) ?? [0, 0, 0]) as [number, number, number];
    const luminance = (value: string) => {
      const channels = rgb(value).map((channel) => {
        const normalized = channel / 255;
        return normalized <= 0.04045
          ? normalized / 12.92
          : ((normalized + 0.055) / 1.055) ** 2.4;
      });
      return (
        0.2126 * (channels[0] ?? 0) +
        0.7152 * (channels[1] ?? 0) +
        0.0722 * (channels[2] ?? 0)
      );
    };
    const ratio = (foreground: string, background: string) => {
      const values = [luminance(foreground), luminance(background)].sort(
        (left, right) => right - left,
      );
      return ((values[0] ?? 0) + 0.05) / ((values[1] ?? 0) + 0.05);
    };
    const pair = (foregroundSelector: string, backgroundSelector: string) =>
      ratio(
        getComputedStyle(document.querySelector(foregroundSelector) as Element)
          .color,
        getComputedStyle(document.querySelector(backgroundSelector) as Element)
          .backgroundColor,
      );
    return {
      blockedStatus: pair(".session-tab .status-blocked", ".session-tabs"),
      compactStatus: pair(
        '.agent-item[data-active="true"] .status-pill',
        '.agent-item[data-active="true"]',
      ),
      tabIndicator: ratio(
        getComputedStyle(
          document.querySelector(
            '.session-tab[data-state="active"]',
          ) as Element,
        ).borderBottomColor,
        getComputedStyle(document.querySelector(".session-tabs") as Element)
          .backgroundColor,
      ),
      primaryAction: pair(".desktop-new-agent", ".desktop-new-agent"),
      composerHint: pair(".composer-hint", ".message-composer"),
      needsInput: pair(".attention-banner", ".attention-banner"),
      workingStatus: pair(".session-tab .status-working", ".session-tabs"),
      workspacePath: pair(".workspace-cwd", ".interactive-terminal-tools"),
    };
  });
  for (const [name, ratio] of Object.entries(contrastRatios)) {
    expect(ratio, name).toBeGreaterThanOrEqual(4.5);
  }
  await expect(page.getByText("agent runtime", { exact: true })).toHaveCount(0);
  await expect(page.getByText("herdr on GitHub", { exact: true })).toHaveCount(
    0,
  );
  await expect(page.getByText("Focused", { exact: true })).toHaveCount(0);
  await expect(page.locator(".topbar-context > strong")).toHaveText("herdr");
  await expect(page.locator(".topbar-context > strong")).toBeVisible();

  await page.screenshot({
    path: testInfo.outputPath("herdr-web-terminal-first-desktop.png"),
    fullPage: true,
  });

  await page.getByRole("button", { name: "Use dark appearance" }).click();
  await expect(page.locator(".herdr-web-theme")).toHaveClass(/dark/);
  const darkTokens = await page.evaluate(() => {
    const styles = getComputedStyle(document.documentElement);
    return {
      paper: styles.getPropertyValue("--paper").trim(),
      raisedPaper: styles.getPropertyValue("--raised-paper").trim(),
      sumi: styles.getPropertyValue("--sumi").trim(),
    };
  });
  expect(darkTokens).toEqual({
    paper: "#11110f",
    raisedPaper: "#1c1b18",
    sumi: "#eeeae1",
  });
  await page.screenshot({
    path: testInfo.outputPath("herdr-web-terminal-first-dark.png"),
    fullPage: true,
  });
  await page.reload();
  await expect(page.locator(".herdr-web-theme")).toHaveClass(/dark/);
  await page.getByRole("button", { name: "Open details" }).click();
  await expect(
    page.getByRole("dialog", { name: "Session details" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "Open details" }),
  ).toBeFocused();
});

test("semantic editorial colors and focus meet contrast thresholds", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });

  for (const appearance of ["light", "dark"] as const) {
    await page.goto("/");
    await page.evaluate((value) => {
      localStorage.setItem("herdr-web-appearance", value);
      localStorage.setItem("herdr-web-theme", `editorial-${value}`);
    }, appearance);
    await page.reload();
    await expect(page.locator(".herdr-web-theme")).toHaveClass(
      new RegExp(appearance),
    );

    const audit = await page.evaluate(() => {
      const theme = document.querySelector(".herdr-web-theme") as HTMLElement;
      const styles = getComputedStyle(theme);
      const value = (name: string) => styles.getPropertyValue(name).trim();
      const normalize = (color: string) => {
        const probe = document.createElement("span");
        probe.style.color = color;
        theme.append(probe);
        const result = getComputedStyle(probe).color;
        probe.remove();
        return result;
      };
      const channels = (color: string) =>
        (color
          .match(/[\d.]+/g)
          ?.slice(0, 3)
          .map(Number) ?? [0, 0, 0]) as [number, number, number];
      const luminance = (color: string) => {
        const values = channels(normalize(color)).map((channel) => {
          const normalized = channel / 255;
          return normalized <= 0.04045
            ? normalized / 12.92
            : ((normalized + 0.055) / 1.055) ** 2.4;
        });
        return (
          0.2126 * (values[0] ?? 0) +
          0.7152 * (values[1] ?? 0) +
          0.0722 * (values[2] ?? 0)
        );
      };
      const contrast = (left: string, right: string) => {
        const values = [luminance(value(left)), luminance(value(right))].sort(
          (a, b) => b - a,
        );
        return ((values[0] ?? 0) + 0.05) / ((values[1] ?? 0) + 0.05);
      };
      const rendered = (selector: string) =>
        getComputedStyle(document.querySelector(selector) as Element);
      return {
        mappings: {
          unfilledTabStatus:
            rendered(".session-tab .status-blocked").backgroundColor ===
            "rgba(0, 0, 0, 0)",
          blockedText:
            rendered(".session-tab .status-blocked").color ===
            normalize(value("--amber-12")),
          controlBorder:
            rendered(".command-button").borderColor ===
            normalize(value("--control-border")),
          doneText:
            rendered(".status-done").color === normalize(value("--grass-12")),
          workingText:
            rendered(".status-working").color === normalize(value("--blue-12")),
        },
        ratios: {
          controlBorder: contrast("--control-border", "--paper"),
          danger: contrast("--danger", "--danger-fill"),
          focus: contrast("--focus", "--paper"),
          indigo: contrast("--indigo", "--indigo-fill"),
          moss: contrast("--moss", "--moss-fill"),
          tabIndicator: contrast("--amber-11", "--paper"),
          secondaryInk: contrast("--secondary-ink", "--paper"),
          sumi: contrast("--sumi", "--paper"),
          vermilion: contrast("--vermilion", "--vermilion-fill"),
        },
      };
    });

    expect(audit.mappings).toEqual({
      unfilledTabStatus: true,
      blockedText: true,
      controlBorder: true,
      doneText: true,
      workingText: true,
    });
    expect(audit.ratios.controlBorder).toBeGreaterThanOrEqual(3);
    expect(audit.ratios.focus).toBeGreaterThanOrEqual(3);
    for (const [name, ratio] of Object.entries(audit.ratios)) {
      if (name === "controlBorder" || name === "focus") continue;
      expect(ratio, `${appearance} ${name}`).toBeGreaterThanOrEqual(4.5);
    }

    const command = page.getByRole("button", { name: "Open Action Palette" });
    await command.focus();
    await expect(command).toHaveCSS("outline-width", "2px");
    const commandFocus = await command.evaluate((element) => {
      const theme = document.querySelector(".herdr-web-theme") as HTMLElement;
      const probe = document.createElement("span");
      probe.style.color = getComputedStyle(theme).getPropertyValue("--focus");
      theme.append(probe);
      const expected = getComputedStyle(probe).color;
      probe.remove();
      return getComputedStyle(element).outlineColor === expected;
    });
    expect(commandFocus).toBe(true);

    const terminalAction = page
      .locator(".interactive-terminal-actions button:not(:disabled)")
      .first();
    await terminalAction.focus();
    await expect(terminalAction).toHaveCSS("outline-width", "2px");
    await expect(terminalAction).toHaveCSS(
      "outline-color",
      appearance === "light" ? "rgb(54, 95, 145)" : "rgb(223, 170, 114)",
    );
  }

  await expect(page.locator(".status-blocked svg").first()).toBeVisible();
  await expect(page.locator(".status-working svg").first()).toBeVisible();
  await page.getByRole("button", { name: "Open details" }).click();
  const fontState = await page.evaluate(async () => {
    const [medium, semibold] = await Promise.all([
      document.fonts.load('500 20px "Zen Old Mincho"'),
      document.fonts.load('600 20px "Zen Old Mincho"'),
    ]);
    return {
      brand: getComputedStyle(
        document.querySelector(".brand-type strong") as Element,
      ).fontFamily,
      heading: getComputedStyle(
        document.querySelector(".dialog-heading h2") as Element,
      ).fontFamily,
      headingWeight: getComputedStyle(
        document.querySelector(".dialog-heading h2") as Element,
      ).fontWeight,
      mediumFaces: medium.length,
      semiboldFaces: semibold.length,
    };
  });
  expect(fontState.brand).toContain("Zen Old Mincho");
  expect(fontState.heading).toContain("Zen Old Mincho");
  expect(fontState.headingWeight).toBe("500");
  expect(fontState.mediumFaces).toBeGreaterThan(0);
  expect(fontState.semiboldFaces).toBeGreaterThan(0);
});

// Linux rasterization varies slightly between the Playwright image and hosted runners.
const CROSS_PLATFORM_RENDERING_DIFF_PIXELS = 15_000;

type VisualTheme =
  | "editorial-light"
  | "editorial-dark"
  | "classic-light"
  | "classic-dark";

async function prepareVisual(page: Page, theme: VisualTheme) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript((value) => {
    const appearance = value.endsWith("-light") ? "light" : "dark";
    localStorage.setItem("herdr-web-appearance", appearance);
    localStorage.setItem("herdr-web-theme", value);
  }, theme);
  await page.goto("/");
  await page.evaluate(async () => {
    await Promise.all([
      document.fonts.load('500 20px "Zen Old Mincho"'),
      document.fonts.load('600 20px "Zen Old Mincho"'),
      document.fonts.ready,
    ]);
  });
}

test.afterEach(async ({ page }, testInfo) => {
  if (!testInfo.title.endsWith("visual baseline")) return;
  // Keep native renders for review even when a stale image passes the tolerance.
  await page.screenshot({
    path: testInfo.outputPath("current-visual-baseline.png"),
    animations: "disabled",
    caret: "hide",
    fullPage: true,
  });
});

test("desktop light visual baseline", async ({ page }) => {
  await page.setViewportSize({ width: 1536, height: 960 });
  await prepareVisual(page, "editorial-light");
  await expect(page).toHaveScreenshot("japanese-literary-desktop-light.png", {
    animations: "disabled",
    caret: "hide",
    fullPage: true,
    maxDiffPixels: CROSS_PLATFORM_RENDERING_DIFF_PIXELS,
  });
});

test("desktop dark visual baseline", async ({ page }) => {
  await page.setViewportSize({ width: 1536, height: 960 });
  await prepareVisual(page, "editorial-dark");
  await expect(page).toHaveScreenshot("japanese-literary-desktop-dark.png", {
    animations: "disabled",
    caret: "hide",
    fullPage: true,
    maxDiffPixels: CROSS_PLATFORM_RENDERING_DIFF_PIXELS,
  });
});

test("mobile light visual baseline", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await prepareVisual(page, "editorial-light");
  await expect(page).toHaveScreenshot("japanese-literary-mobile-light.png", {
    animations: "disabled",
    caret: "hide",
    fullPage: true,
    maxDiffPixels: CROSS_PLATFORM_RENDERING_DIFF_PIXELS,
  });
});

test("classic light visual baseline", async ({ page }) => {
  await page.setViewportSize({ width: 1536, height: 960 });
  await prepareVisual(page, "classic-light");
  await expect(page).toHaveScreenshot("classic-desktop-light.png", {
    animations: "disabled",
    caret: "hide",
    fullPage: true,
    maxDiffPixels: CROSS_PLATFORM_RENDERING_DIFF_PIXELS,
  });
});

test("classic dark visual baseline", async ({ page }) => {
  await page.setViewportSize({ width: 1536, height: 960 });
  await prepareVisual(page, "classic-dark");
  await expect(page).toHaveScreenshot("classic-desktop-dark.png", {
    animations: "disabled",
    caret: "hide",
    fullPage: true,
    maxDiffPixels: CROSS_PLATFORM_RENDERING_DIFF_PIXELS,
  });
});

test("compact Agent statuses leave names and metadata unobstructed", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await prepareVisual(page, "editorial-light");

  const rows = await page.locator(".agent-item").evaluateAll((items) =>
    items.map((item) => {
      const identity = item.querySelector(".agent-identity");
      const copy = item.querySelector(".agent-item-copy");
      const title = item.querySelector("strong");
      const task = item.querySelector(".agent-item-task");
      const space = item.querySelector("small");
      const status = item.querySelector('.status-pill[data-compact="true"]');
      if (!identity || !copy || !title || !task || !space || !status)
        throw new Error("Missing Agent metadata");
      return {
        copyLeft: copy.getBoundingClientRect().left,
        copyRight: copy.getBoundingClientRect().right,
        identityRight: identity.getBoundingClientRect().right,
        rowRight: item.getBoundingClientRect().right,
        spaceTop: space.getBoundingClientRect().top,
        statusLeft: status.getBoundingClientRect().left,
        statusRight: status.getBoundingClientRect().right,
        taskBottom: task.getBoundingClientRect().bottom,
        titleClipped: title.scrollWidth > title.clientWidth,
      };
    }),
  );
  expect(rows).toHaveLength(5);
  for (const row of rows) {
    expect(row.identityRight).toBeLessThanOrEqual(row.copyLeft);
    expect(row.copyRight).toBeLessThanOrEqual(row.statusLeft);
    expect(row.statusRight).toBeLessThanOrEqual(row.rowRight);
    expect(row.taskBottom).toBeLessThanOrEqual(row.spaceTop);
    expect(row.titleClipped).toBe(false);
  }
});

test("core workbench typography stays legible on desktop and mobile", async ({
  page,
}) => {
  for (const viewport of [
    { width: 1280, height: 800 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto("/");
    if (viewport.width === 390) {
      await page.getByRole("button", { name: "Open navigation" }).click();
    }

    const metrics = await page.evaluate(() => {
      const fontSize = (selector: string) => {
        const element = document.querySelector(selector);
        if (!element) throw new Error(`Missing ${selector}`);
        return Number.parseFloat(getComputedStyle(element).fontSize);
      };
      const lineHeight = (selector: string) => {
        const element = document.querySelector(selector);
        if (!element) throw new Error(`Missing ${selector}`);
        return Number.parseFloat(getComputedStyle(element).lineHeight);
      };
      return {
        actionable: [
          ".workspace-item strong",
          ".agent-item-copy strong",
          ".session-tab",
          ".agent-progress-copy strong",
        ].map(fontSize),
        supporting: [
          ".section-label-row h2",
          ".agent-item-task",
          ".session-tab-status .status-pill",
          ".interactive-terminal-tools",
          ".agent-progress-copy small",
          ".composer-hint",
        ].map(fontSize),
        taskFont: fontSize(".agent-item-task"),
        taskLine: lineHeight(".agent-item-task"),
      };
    });

    for (const size of metrics.supporting)
      expect(size).toBeGreaterThanOrEqual(11);
    for (const size of metrics.actionable)
      expect(size).toBeGreaterThanOrEqual(12);
    expect(metrics.taskLine / metrics.taskFont).toBeGreaterThanOrEqual(1.4);
    expect(await hasNoPageOverflow(page)).toBe(true);
    if (viewport.width === 390) {
      await page
        .getByRole("dialog", { name: "Navigate workbench" })
        .getByRole("button", { name: "Close dialog" })
        .click();
    }
  }
});

test("selection, statuses, progress, and desktop action groups have distinct hierarchy", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/");

  const audit = await page.evaluate(() => {
    const root = document.querySelector(".herdr-web-theme") as HTMLElement;
    const probe = document.createElement("span");
    const worktree = document.createElement("button");
    const dot = document.createElement("span");
    worktree.className = "workspace-item worktree-item";
    worktree.dataset.active = "true";
    dot.className = "worktree-dot";
    dot.dataset.active = "true";
    worktree.append(dot);
    root.append(probe, worktree);
    const resolve = (token: string) => {
      probe.style.color = `var(${token})`;
      return getComputedStyle(probe).color;
    };
    const selected = resolve("--selection-accent");
    const status = {
      blocked: resolve("--amber-12"),
      done: resolve("--grass-12"),
      failed: resolve("--red-12"),
      working: resolve("--blue-12"),
    };
    const actions = document.querySelector(".topbar-actions") as HTMLElement;
    const actionBounds = [...actions.children]
      .filter((element) => getComputedStyle(element).display !== "none")
      .map((element) => element.getBoundingClientRect());
    const result = {
      actionBottoms: actionBounds.map(({ bottom }) => bottom),
      actionTops: actionBounds.map(({ top }) => top),
      actionsFit: actions.scrollWidth <= actions.clientWidth,
      agentMarker: getComputedStyle(
        document.querySelector('.agent-item[data-active="true"]') as Element,
      ).borderLeftColor,
      selected,
      status,
      tabMarker: getComputedStyle(
        document.querySelector('.session-tab[data-state="active"]') as Element,
      ).borderBottomColor,
      worktreeFill: getComputedStyle(dot).backgroundColor,
      worktreeMarker: getComputedStyle(dot).borderColor,
      workspaceMarker: getComputedStyle(
        document.querySelector(
          '.workspace-item[data-active="true"]',
        ) as Element,
      ).borderLeftColor,
    };
    worktree.remove();
    probe.remove();
    return result;
  });

  expect(new Set(Object.values(audit.status)).size).toBe(4);
  for (const color of Object.values(audit.status)) {
    expect(audit.selected).not.toBe(color);
  }
  expect(audit.workspaceMarker).toBe(audit.selected);
  expect(audit.agentMarker).toBe(audit.selected);
  expect(audit.tabMarker).toBe(audit.selected);
  expect(audit.worktreeMarker).toBe(audit.selected);
  expect(audit.worktreeFill).toBe(audit.selected);
  expect(audit.actionsFit).toBe(true);
  expect(
    Math.max(...audit.actionTops) - Math.min(...audit.actionTops),
  ).toBeLessThanOrEqual(1);
  expect(
    Math.max(...audit.actionBottoms) - Math.min(...audit.actionBottoms),
  ).toBeLessThanOrEqual(1);

  const progress = page.locator(".agent-progress-summary");
  await expect(progress).not.toHaveAttribute("open");
  await progress.locator("summary").click();
  await expect(progress).toHaveAttribute("open");
  await expect(progress).toContainText("Goal");
  await expect(progress).toContainText("Updated");
  expect(
    await page
      .locator(".terminal-viewport")
      .evaluate((element) => element.getBoundingClientRect().height > 100),
  ).toBe(true);
});

for (const theme of [
  "editorial-light",
  "editorial-dark",
  "classic-light",
  "classic-dark",
] as const) {
  test(`${theme} surfaces fit short mobile and compact desktop viewports`, async ({
    page,
  }) => {
    await prepareVisual(page, theme);
    const badge = page.locator(".attention-inbox-trigger > span");
    await expect(badge).toBeVisible();
    const badgeColors = await badge.evaluate((element) => {
      const styles = getComputedStyle(element);
      const luminance = (color: string) => {
        const values = (color.match(/[\d.]+/g) ?? [])
          .slice(0, 3)
          .map(Number)
          .map((value) => {
            const normalized = color.startsWith("color(") ? value : value / 255;
            return normalized <= 0.04045
              ? normalized / 12.92
              : ((normalized + 0.055) / 1.055) ** 2.4;
          });
        return (
          (values[0] ?? 0) * 0.2126 +
          (values[1] ?? 0) * 0.7152 +
          (values[2] ?? 0) * 0.0722
        );
      };
      const [lighter, darker] = [
        luminance(styles.color),
        luminance(styles.backgroundColor),
      ].sort((a, b) => b - a);
      return {
        token: styles.getPropertyValue("--amber-contrast").trim(),
        contrast: ((lighter ?? 0) + 0.05) / ((darker ?? 0) + 0.05),
      };
    });
    expect(badgeColors.token).toBe(
      theme.startsWith("classic")
        ? "#21201c"
        : theme === "editorial-light"
          ? "#fffdfa"
          : "#11110f",
    );
    expect(badgeColors.contrast).toBeGreaterThanOrEqual(4.5);
    for (const selector of [
      '.workspace-item[data-active="true"]',
      '.agent-item[data-active="true"]',
      '.attention-item[data-active="true"]',
      '.session-tab[data-state="active"]',
      ".workspace-glyph",
      ".command-button",
      ".attention-banner",
      ".terminal-shell",
      ".message-composer",
    ]) {
      await expect(page.locator(selector).first()).toHaveCSS(
        "box-shadow",
        "none",
      );
    }
    const selectedTab = page.getByRole("tab", { selected: true });
    await expect(selectedTab).toHaveCSS("border-bottom-width", "2px");
    await expect(selectedTab).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    expect(
      await selectedTab.evaluate(
        (element) => getComputedStyle(element).borderBottomColor,
      ),
    ).not.toBe("rgba(0, 0, 0, 0)");
    await expect(page.locator(".message-composer")).toHaveCSS(
      "border-radius",
      "0px",
    );
    for (const viewport of [
      { width: 320, height: 500 },
      { width: 900, height: 700 },
    ]) {
      await page.setViewportSize(viewport);
      const composer = page.getByRole("textbox", {
        name: "Message api-review",
      });
      await composer.fill("Review the changes\nand explain the tradeoffs.");
      await expect(composer).toBeVisible();
      await expect(page.locator(".message-composer")).toHaveCSS(
        "outline-width",
        "2px",
      );
      await expect(page.locator(".message-composer")).toHaveCSS(
        "outline-style",
        "solid",
      );
      expect(await hasNoPageOverflow(page)).toBe(true);
      const bounds = await page.evaluate(() => {
        const rect = (selector: string) => {
          const element = document.querySelector(selector);
          if (!element) throw new Error(`Missing ${selector}`);
          const box = element.getBoundingClientRect();
          return {
            left: box.left,
            right: box.right,
            bottom: box.bottom,
            height: box.height,
          };
        };
        return {
          attach: rect(".composer-attach"),
          input: rect(".message-composer textarea"),
          send: rect('[aria-label="Send message"]'),
          terminal: rect(".terminal-viewport"),
          lines: rect(".terminal-lines"),
          composer: rect(".message-composer"),
          actions: rect(".topbar-actions"),
          fontSize: Number.parseFloat(
            getComputedStyle(
              document.querySelector(".message-composer textarea") as Element,
            ).fontSize,
          ),
        };
      });
      expect(bounds.attach.right).toBeLessThanOrEqual(bounds.input.left);
      expect(bounds.input.right).toBeLessThanOrEqual(bounds.send.left);
      expect(bounds.composer.bottom).toBeLessThanOrEqual(viewport.height);
      expect(bounds.terminal.height).toBeGreaterThan(100);
      expect(bounds.lines.right).toBeLessThanOrEqual(bounds.terminal.right);
      expect(bounds.actions.right).toBeLessThanOrEqual(viewport.width);
      if (viewport.width === 320) {
        expect(bounds.fontSize).toBeGreaterThanOrEqual(16);
      }
    }
  });
}

test("mobile drawers fit the viewport below their headings", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await prepareVisual(page, "editorial-dark");
  await page.screenshot({
    path: testInfo.outputPath("editorial-mobile-dark.png"),
  });
  await page.getByRole("button", { name: "Open navigation" }).click();
  const navigation = page.getByRole("dialog", { name: "Navigate workbench" });
  await expect(navigation).toBeVisible();
  const navigationBounds = await navigation.boundingBox();
  const sidebarBounds = await navigation.locator(".sidebar").boundingBox();
  expect(navigationBounds).not.toBeNull();
  expect(sidebarBounds).not.toBeNull();
  expect(
    (sidebarBounds?.y ?? 0) + (sidebarBounds?.height ?? 0),
  ).toBeLessThanOrEqual(
    (navigationBounds?.y ?? 0) + (navigationBounds?.height ?? 0),
  );
  await page.screenshot({
    path: testInfo.outputPath("editorial-mobile-navigation.png"),
  });
  await navigation.getByRole("button", { name: "Open menu" }).click();
  await page.getByRole("menuitem", { name: "Settings" }).click();
  await expect(page.getByRole("dialog", { name: "Settings" })).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("editorial-mobile-settings.png"),
  });
});

test("sidebar mirrors Herdr Spaces and Agents navigation", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/");

  const agents = page.getByRole("region", { name: "Agents" });
  const agentList = agents.getByRole("navigation", {
    name: "Detected Agents",
  });
  await expect(page.getByRole("heading", { name: "Spaces" })).toBeVisible();
  await expect(agentList.getByRole("button")).toHaveCount(5);
  await expect(agents.getByRole("radio", { name: "Grouped" })).toHaveAttribute(
    "data-state",
    "on",
  );
  await agents.getByRole("radio", { name: "Priority" }).click();
  await expect(agentList.getByRole("button").first()).toContainText(
    "api-review",
  );
  await expect(agentList.getByRole("button").nth(1)).toContainText(
    "integration-tests",
  );
  await expect
    .poll(() =>
      page.evaluate(() => localStorage.getItem("herdr-web-agent-sort")),
    )
    .toBe("priority");
  await page.reload();
  await expect(agents.getByRole("radio", { name: "Priority" })).toHaveAttribute(
    "data-state",
    "on",
  );
  await expect(
    page.getByRole("button", { name: "Create a new Space" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Open menu" })).toBeVisible();

  const sections = await page.evaluate(() => ({
    actionsBottom:
      document.querySelector(".spaces-actions")?.getBoundingClientRect()
        .bottom ?? 0,
    agentsTop:
      document.querySelector(".agent-panel")?.getBoundingClientRect().top ?? 0,
    agentTitleBottom:
      document.querySelector(".agent-panel-title")?.getBoundingClientRect()
        .bottom ?? 0,
    agentTitleRight:
      document.querySelector(".agent-panel-title")?.getBoundingClientRect()
        .right ?? 0,
    agentSortLeft:
      document.querySelector(".agent-sort-control")?.getBoundingClientRect()
        .left ?? 0,
    agentSortTop:
      document.querySelector(".agent-sort-control")?.getBoundingClientRect()
        .top ?? 0,
    agentSortRight:
      document.querySelector(".agent-sort-control")?.getBoundingClientRect()
        .right ?? 0,
    agentPanelRight:
      document.querySelector(".agent-panel")?.getBoundingClientRect().right ??
      0,
  }));
  expect(sections.actionsBottom).toBeLessThanOrEqual(sections.agentsTop + 1);
  expect(
    sections.agentTitleRight <= sections.agentSortLeft ||
      sections.agentTitleBottom <= sections.agentSortTop,
  ).toBe(true);
  expect(sections.agentSortRight).toBeLessThanOrEqual(sections.agentPanelRight);

  const newSpace = page.getByRole("button", { name: "Create a new Space" });
  await newSpace.click();
  await page
    .getByRole("textbox", { name: "Directory", exact: true })
    .fill("/repo/cancelled");
  await expect(
    page.getByRole("region", { name: "Space preview" }),
  ).toContainText("cancelled");
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(newSpace).toBeFocused();

  const menu = page.getByRole("button", { name: "Open menu" });
  await menu.click();
  await page.getByRole("menuitem", { name: "Settings" }).click();
  await expect(page.getByRole("dialog", { name: "Settings" })).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).click();

  await menu.click();
  await page.getByRole("menuitem", { name: "Keybindings" }).click();
  await expect(page.getByRole("dialog", { name: "Keybindings" })).toContainText(
    "⌘ K / Ctrl K",
  );
  await page.getByRole("button", { name: "Close dialog" }).click();

  await agents
    .getByRole("button", { name: /agent-guide.*herdr\.dev/i })
    .click();
  await expect(
    page.getByRole("tab", { name: /agent-guide/i, selected: true }),
  ).toBeVisible();
  expect(await hasNoPageOverflow(page)).toBe(true);
});

test("mouse resizing persists Spaces and Agents proportions", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/");

  const separator = page.getByRole("separator", {
    name: "Resize Spaces and Agents panels",
  });
  const sections = page.locator(".desktop-sidebar .sidebar-sections");
  const sectionBox = await sections.boundingBox();
  const separatorBox = await separator.boundingBox();
  if (!sectionBox || !separatorBox) {
    throw new Error("Sidebar section separator is not visible");
  }
  const targetRatio = 0.55;
  const targetY =
    sectionBox.y +
    (sectionBox.height - separatorBox.height) * targetRatio +
    separatorBox.height / 2;
  await page.mouse.move(
    separatorBox.x + separatorBox.width / 2,
    separatorBox.y + separatorBox.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(separatorBox.x + separatorBox.width / 2, targetY);
  await page.mouse.up();

  await expect(separator).toHaveAttribute("aria-valuenow", "55");
  await expect
    .poll(() =>
      page.evaluate(() =>
        Number(localStorage.getItem("herdr-web-sidebar-spaces-ratio")),
      ),
    )
    .toBeCloseTo(targetRatio, 2);
  const panelHeights = await page.evaluate(() => ({
    agents:
      document
        .querySelector(".desktop-sidebar .agent-panel")
        ?.getBoundingClientRect().height ?? 0,
    spaces:
      document
        .querySelector(".desktop-sidebar .spaces-panel")
        ?.getBoundingClientRect().height ?? 0,
  }));
  expect(
    panelHeights.spaces / (panelHeights.spaces + panelHeights.agents),
  ).toBeCloseTo(targetRatio, 2);

  await page.reload();
  await expect(separator).toHaveAttribute("aria-valuenow", "55");
});

test("Agent rows remain separated at sidebar width and panel-ratio limits", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });

  for (const { ratio, width } of [
    { ratio: 0.2, width: 180 },
    { ratio: 0.8, width: 320 },
  ]) {
    await page.addInitScript(
      ({ savedRatio, savedWidth }) => {
        localStorage.setItem(
          "herdr-web-sidebar-spaces-ratio",
          String(savedRatio),
        );
        localStorage.setItem("herdr-web-sidebar-width", String(savedWidth));
      },
      { savedRatio: ratio, savedWidth: width },
    );
    await page.goto("/");
    await expect(page.locator(".desktop-sidebar")).toHaveCSS(
      "width",
      `${width}px`,
    );
    await expect(
      page.getByRole("separator", {
        name: "Resize Spaces and Agents panels",
      }),
    ).toHaveAttribute("aria-valuenow", String(ratio * 100));

    const bounds = await page.locator(".agent-item").evaluateAll((rows) => {
      const items = rows.map((row) => {
        const identity = row.querySelector(".agent-identity");
        const copy = row.querySelector(".agent-item-copy");
        const status = row.querySelector(".status-pill");
        if (!identity || !copy || !status)
          throw new Error("Missing Agent row content");
        return {
          bottom: row.getBoundingClientRect().bottom,
          copyLeft: copy.getBoundingClientRect().left,
          copyRight: copy.getBoundingClientRect().right,
          identityRight: identity.getBoundingClientRect().right,
          rowRight: row.getBoundingClientRect().right,
          statusLeft: status.getBoundingClientRect().left,
          statusRight: status.getBoundingClientRect().right,
          top: row.getBoundingClientRect().top,
        };
      });
      const viewport = document.querySelector(
        ".agent-panel-viewport",
      ) as HTMLElement;
      return {
        items,
        scrollable: viewport.scrollHeight >= viewport.clientHeight,
      };
    });
    expect(bounds.scrollable).toBe(true);
    for (const [index, row] of bounds.items.entries()) {
      expect(row.identityRight).toBeLessThanOrEqual(row.copyLeft);
      expect(row.copyRight).toBeLessThanOrEqual(row.statusLeft);
      expect(row.statusRight).toBeLessThanOrEqual(row.rowRight);
      if (index > 0) {
        expect(row.top).toBeGreaterThanOrEqual(
          bounds.items[index - 1]?.bottom ?? 0,
        );
      }
    }
    expect(await hasNoPageOverflow(page)).toBe(true);
  }
});

test("mouse resizing persists navigation width and updates pane proportions", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/");

  const navigationSeparator = page.getByRole("separator", {
    name: "Resize navigation",
  });
  const navigationBox = await navigationSeparator.boundingBox();
  if (!navigationBox) throw new Error("Navigation separator is not visible");
  await page.mouse.move(
    navigationBox.x + navigationBox.width / 2,
    navigationBox.y + 100,
  );
  await page.mouse.down();
  await page.mouse.move(280, navigationBox.y + 100);
  await page.mouse.up();
  await expect(page.locator(".desktop-sidebar")).toHaveCSS("width", "280px");
  await expect
    .poll(() =>
      page.evaluate(() => localStorage.getItem("herdr-web-sidebar-width")),
    )
    .toBe("280");
  await page.reload();
  await expect(page.locator(".desktop-sidebar")).toHaveCSS("width", "280px");

  await page.getByRole("button", { name: "Split pane" }).click();
  await page.getByRole("menuitem", { name: "Split right" }).click();
  const paneSeparator = page.getByRole("separator", {
    name: "Resize terminal panes",
  });
  const paneGrid = page.locator(".pane-grid");
  const paneBox = await paneGrid.boundingBox();
  const separatorBox = await paneSeparator.boundingBox();
  if (!paneBox || !separatorBox) throw new Error("Pane split is not visible");
  await page.mouse.move(
    separatorBox.x + separatorBox.width / 2,
    separatorBox.y + separatorBox.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    paneBox.x + paneBox.width * 0.65,
    separatorBox.y + separatorBox.height / 2,
  );
  await page.mouse.up();

  await expect(paneSeparator).toHaveAttribute("aria-valuenow", /6[45]/);
  const paneWidths = await page
    .locator(".terminal-pane")
    .evaluateAll((panes) =>
      panes.map((pane) => pane.getBoundingClientRect().width),
    );
  expect(paneWidths).toHaveLength(2);
  expect(
    (paneWidths[0] ?? 0) / ((paneWidths[1] ?? 1) + (paneWidths[0] ?? 0)),
  ).toBeGreaterThan(0.63);
  expect(await hasNoPageOverflow(page)).toBe(true);
});

test("split down stacks panes using Herdr's direction", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/");

  await page.getByRole("button", { name: "Split pane" }).click();
  await expect(
    page.getByRole("menuitem", { name: "Split right" }),
  ).toBeVisible();
  await page.getByRole("menuitem", { name: "Split down" }).click();

  const paneGrid = page.locator(".pane-grid");
  const separator = page.getByRole("separator", {
    name: "Resize terminal panes",
  });
  await expect(paneGrid).toHaveAttribute("data-direction", "down");
  await expect(separator).toHaveAttribute("aria-orientation", "horizontal");
  const paneBoxes = await page.locator(".terminal-pane").evaluateAll((panes) =>
    panes.map((pane) => {
      const box = pane.getBoundingClientRect();
      return { left: box.left, top: box.top };
    }),
  );
  expect(paneBoxes).toHaveLength(2);
  expect(paneBoxes[1]?.top ?? 0).toBeGreaterThan(paneBoxes[0]?.top ?? 0);
  expect(paneBoxes[1]?.left).toBe(paneBoxes[0]?.left);
  expect(await hasNoPageOverflow(page)).toBe(true);
});

test("terminal uses bundled JetBrainsMono Nerd Font Mono", async ({ page }) => {
  await page.goto("/");
  const fontFamily = await page
    .locator(".terminal-lines")
    .evaluate((element) => getComputedStyle(element).fontFamily);

  expect(fontFamily).toBe('"JetBrainsMono Nerd Font Mono", monospace');
  await page.locator(".terminal-lines").evaluate((terminal) => {
    const symbol = document.createElement("span");
    symbol.textContent = " 󰊢 ";
    terminal.append(symbol);
  });
  await page.evaluate(() => document.fonts.ready);
  const loadedFonts = await page.evaluate(() =>
    Array.from(document.fonts)
      .filter((font) => font.status === "loaded")
      .map((font) => font.family),
  );
  expect(loadedFonts).toContain("JetBrainsMono Nerd Font Mono");
  expect(loadedFonts).not.toContain("JetBrains Mono");
  expect(loadedFonts).not.toContain("Symbols Nerd Font Mono");
});

test("command palette works with a keyboard only", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/");

  await page.keyboard.press("Control+KeyK");
  const search = page.getByRole("combobox", {
    name: "Search actions, Spaces, Agents, and Terminals",
  });
  await expect(search).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(
    page.getByRole("button", { name: "Close dialog" }),
  ).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(search).toBeFocused();
  await search.fill("plugin");
  await page.keyboard.press("End");
  await page.keyboard.press("Home");
  await page.keyboard.press("Enter");

  await expect(
    page.getByRole("tab", { name: /plugin-index/i, selected: true }),
  ).toBeVisible();
  expect(await hasNoPageOverflow(page)).toBe(true);
});

test("tablet layout keeps navigation in a drawer and terminal output usable", async ({
  page,
}) => {
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.goto("/");

  await expect(
    page.getByRole("button", { name: "Open navigation" }),
  ).toBeVisible();
  await expect(
    page.getByRole("textbox", { name: "Message api-review" }),
  ).toBeVisible();
  await expect(page.locator(".topbar-context > strong")).toBeVisible();
  await page.getByRole("button", { name: "Open navigation" }).click();
  await expect(
    page.getByRole("dialog", { name: "Navigate workbench" }),
  ).toBeVisible();
  expect(await hasNoPageOverflow(page)).toBe(true);
});

test("mobile layout keeps the terminal, composer, and touch targets reachable", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  await expect(
    page.getByRole("button", { name: "Open navigation" }),
  ).toBeVisible();
  await expect(
    page.getByRole("tab", { name: /api-review/i, selected: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "claude · API review terminal" }),
  ).toBeVisible();
  await expect(
    page.getByRole("textbox", { name: "Message api-review" }),
  ).toBeVisible();
  await expect(page.locator(".workspace-cwd-compact")).toHaveText(
    "…/Projects/herdr",
  );
  expect(await hasNoPageOverflow(page)).toBe(true);

  const metrics = await page.evaluate(() => ({
    composerBottom:
      document.querySelector(".message-composer")?.getBoundingClientRect()
        .bottom ?? 9999,
    fontSize: Number.parseFloat(
      getComputedStyle(document.querySelector(".terminal-lines") as Element)
        .fontSize,
    ),
    navTarget:
      document
        .querySelector('[aria-label="Open navigation"]')
        ?.getBoundingClientRect().height ?? 0,
    viewport: window.innerHeight,
  }));
  expect(metrics.composerBottom).toBeLessThanOrEqual(metrics.viewport);
  expect(metrics.fontSize).toBeGreaterThanOrEqual(11);
  expect(metrics.navTarget).toBeGreaterThanOrEqual(44);
  for (const target of [
    page.getByRole("button", { name: "Open navigation" }),
    page.getByRole("button", { name: "Open Action Palette" }),
    page.getByRole("button", { name: "New Agent in herdr" }),
    page.getByRole("button", { name: "Open more actions" }),
    page.getByRole("button", { name: "Attach image" }),
    page.getByRole("button", { name: "Send message" }),
  ]) {
    const box = await target.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
    expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
  }

  await page.screenshot({
    path: testInfo.outputPath("herdr-web-terminal-first-mobile.png"),
    fullPage: true,
  });

  await page.getByRole("button", { name: "Open more actions" }).click();
  const actions = page.getByRole("dialog", { name: "More actions" });
  await expect(actions).toBeVisible();
  for (const target of [
    actions.getByRole("button", { name: /Start Agent/i }),
    actions.getByRole("button", { name: /Session details/i }),
    actions.getByRole("button", { name: /appearance/i }),
  ]) {
    const box = await target.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
    expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
  }
  await actions.getByRole("button", { name: "Close dialog" }).click();
  await expect(
    page.getByRole("button", { name: "Open more actions" }),
  ).toBeFocused();

  await page.getByRole("button", { name: "Open navigation" }).click();
  const navigation = page.getByRole("dialog", { name: "Navigate workbench" });
  await expect(navigation).toBeVisible();
  await expect(
    navigation.getByRole("heading", { name: "Agents" }),
  ).toBeVisible();
  for (const target of [
    navigation.getByRole("button", { name: "Create a new Space" }),
    navigation.getByRole("button", { name: "Open menu" }),
  ]) {
    const box = await target.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
    expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
  }
  await navigation.getByRole("button", { name: "Create a new Space" }).click();
  await expect(navigation).toBeHidden();
  await expect(
    page.getByRole("dialog", { name: "Create a new Space" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(
    page.getByRole("button", { name: "Open navigation" }),
  ).toBeFocused();

  await page.getByRole("button", { name: "Open navigation" }).click();
  await navigation
    .getByRole("button", { name: "Open herdr.dev Space" })
    .click();
  await expect(
    page.getByRole("tab", { name: /agent-guide/i, selected: true }),
  ).toBeVisible();

  const composer = page.getByRole("textbox", { name: "Message agent-guide" });
  await composer.focus();
  await page.setViewportSize({ width: 390, height: 500 });
  await expect(composer).toBeVisible();
  expect(
    await page
      .locator(".message-composer")
      .evaluate(
        (element) =>
          element.getBoundingClientRect().bottom <= window.innerHeight,
      ),
  ).toBe(true);
});

test("mobile Settings keeps terminal text presets inside the viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 500 });
  await page.goto("/");
  await page.getByRole("button", { name: "Open navigation" }).click();
  const navigation = page.getByRole("dialog", { name: "Navigate workbench" });
  await navigation.getByRole("button", { name: "Open menu" }).click();
  await page.getByRole("menuitem", { name: "Settings" }).click();

  const settings = page.getByRole("dialog", { name: "Settings" });
  await expect(settings).toBeVisible();
  await expect(settings.getByRole("radio", { name: /Compact/ })).toBeVisible();
  await expect(
    settings.getByRole("radio", { name: /Comfortable/ }),
  ).toBeVisible();
  expect(await hasNoPageOverflow(page)).toBe(true);
  const bounds = await settings.boundingBox();
  expect(bounds?.x ?? -1).toBeGreaterThanOrEqual(0);
  expect((bounds?.x ?? 0) + (bounds?.width ?? 0)).toBeLessThanOrEqual(320);
  expect((bounds?.y ?? 0) + (bounds?.height ?? 0)).toBeLessThanOrEqual(500);
  const privacy = settings.getByRole("combobox", {
    name: /Lock-screen detail/,
  });
  await privacy.scrollIntoViewIfNeeded();
  const privacyBounds = await privacy.boundingBox();
  expect(privacyBounds?.x ?? -1).toBeGreaterThanOrEqual(bounds?.x ?? 0);
  expect(
    (privacyBounds?.x ?? 0) + (privacyBounds?.width ?? 0),
  ).toBeLessThanOrEqual((bounds?.x ?? 0) + (bounds?.width ?? 0));
  const apply = settings.getByRole("button", { name: "Apply" });
  await apply.scrollIntoViewIfNeeded();
  await expect(apply).toBeVisible();
  expect((await apply.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(32);
  await apply.click();
  await expect(settings).toBeHidden();
});

test("supported viewports avoid clipped workbench controls", async ({
  page,
}, testInfo) => {
  for (const viewport of [
    { width: 320, height: 700 },
    { width: 390, height: 844 },
    { width: 840, height: 900 },
    { width: 1536, height: 960 },
    { width: 2560, height: 1440 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await expect(
      page.getByRole("tab", { name: /api-review/i, selected: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("textbox", { name: "Message api-review" }),
    ).toBeVisible();
    expect(await hasNoPageOverflow(page)).toBe(true);
    const bounds = await page.evaluate(() => {
      const selectors = [
        ".main-workspace",
        ".terminal-shell",
        ".message-composer",
      ];
      return selectors.map((selector) => {
        const rect = document.querySelector(selector)?.getBoundingClientRect();
        return rect
          ? {
              bottom: rect.bottom,
              left: rect.left,
              right: rect.right,
              top: rect.top,
            }
          : null;
      });
    });
    for (const bound of bounds) {
      expect(bound).not.toBeNull();
      expect(bound?.left ?? -1).toBeGreaterThanOrEqual(0);
      expect(bound?.right ?? Number.POSITIVE_INFINITY).toBeLessThanOrEqual(
        viewport.width,
      );
      expect(bound?.top ?? -1).toBeGreaterThanOrEqual(0);
      expect(bound?.bottom ?? Number.POSITIVE_INFINITY).toBeLessThanOrEqual(
        viewport.height,
      );
    }
    if (viewport.width === 320 || viewport.width === 840) {
      await page.screenshot({
        path: testInfo.outputPath(
          `japanese-literary-${viewport.width}x${viewport.height}.png`,
        ),
        fullPage: true,
      });
    }
  }
});

test("mobile split panes stay readable through a pane selector", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 700 });
  await page.goto("/");
  await page.getByRole("button", { name: "Split pane" }).click();
  await page.getByRole("menuitem", { name: "Split down" }).click();

  const paneTabs = page.getByRole("tablist", { name: "Session panes" });
  await expect(paneTabs.getByRole("tab")).toHaveCount(2);
  await expect(page.locator(".terminal-pane:visible")).toHaveCount(1);
  await paneTabs.getByRole("tab").first().click();
  await expect(paneTabs.getByRole("tab").first()).toHaveAttribute(
    "aria-selected",
    "true",
  );
});

test("multi-line prompts grow without covering the terminal", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 700 });
  await page.goto("/");
  const textbox = page.getByRole("textbox", { name: "Message api-review" });
  const initialHeight = (await textbox.boundingBox())?.height ?? 0;

  await textbox.fill("line one\nline two\nline three\nline four");

  expect((await textbox.boundingBox())?.height ?? 0).toBeGreaterThan(
    initialHeight,
  );
  expect(
    await page
      .locator(".message-composer")
      .evaluate(
        (element) => element.getBoundingClientRect().bottom <= innerHeight,
      ),
  ).toBe(true);
});

test("mobile composer stages and sends an image attachment", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.evaluate(() => {
    const clipboard = new DataTransfer();
    clipboard.items.add(
      new File(
        [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1])],
        "mobile-shot.png",
        { type: "image/png" },
      ),
    );
    window.dispatchEvent(
      new ClipboardEvent("paste", {
        bubbles: true,
        cancelable: true,
        clipboardData: clipboard,
      }),
    );
  });

  await expect(page.getByText("mobile-shot.png")).toBeVisible();
  await page.getByRole("button", { name: "Send message" }).click();

  await expect(
    page
      .locator(".terminal-message")
      .filter({ hasText: "Attached image: `mobile-shot.png`" }),
  ).toBeVisible();
  await expect(page.locator(".composer-attachment")).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollHeight <= window.innerHeight,
    ),
  ).toBe(true);
});

test("terminal follows new output without interrupting scrollback", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 500 });
  await page.goto("/");
  const viewport = page.locator(".terminal-viewport");
  await expect
    .poll(() =>
      viewport.evaluate(
        (element) => element.scrollHeight > element.clientHeight,
      ),
    )
    .toBe(true);
  const distanceFromBottom = () =>
    viewport.evaluate(
      (element) =>
        element.scrollHeight - element.clientHeight - element.scrollTop,
    );

  await expect.poll(distanceFromBottom).toBeLessThanOrEqual(1);

  await page
    .getByRole("textbox", { name: "Message api-review" })
    .fill("say hi");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByText("› say hi")).toBeVisible();
  await expect.poll(distanceFromBottom).toBeLessThanOrEqual(1);

  await viewport.evaluate((element) => {
    element.scrollTop = 0;
    element.dispatchEvent(new Event("scroll"));
  });
  await page
    .getByRole("textbox", { name: "Message api-review" })
    .fill("continue");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByText("› continue")).toBeVisible();
  await expect
    .poll(() => viewport.evaluate((element) => element.scrollTop))
    .toBe(0);
});

test("wide snapshot frames scroll together while prose stays inside the pane", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await prepareVisual(page, "editorial-light");
  const frame = page.getByRole("region", { name: "Terminal frame" });
  await expect(frame).toHaveCount(1);
  await expect(frame).toHaveCSS("white-space", "pre");
  expect(
    await frame.evaluate(
      (element) => element.scrollWidth > element.clientWidth,
    ),
  ).toBe(true);

  const rowPositions = () =>
    frame.evaluate((element) => {
      const text = element.firstChild;
      if (!text || text.nodeType !== Node.TEXT_NODE)
        throw new Error("Missing frame text");
      let offset = 0;
      return (text.textContent ?? "").split("\n").map((line) => {
        const range = document.createRange();
        range.setStart(text, offset);
        range.setEnd(text, offset + 1);
        offset += line.length + 1;
        return range.getBoundingClientRect().left;
      });
    });
  const before = await rowPositions();
  expect(before).toHaveLength(3);
  await frame.focus();
  await expect(frame).toHaveCSS("outline-width", "2px");
  await frame.press("ArrowRight");
  await expect
    .poll(() => frame.evaluate((element) => element.scrollLeft))
    .toBeGreaterThan(0);
  const after = await rowPositions();
  const displacement = (before[0] ?? 0) - (after[0] ?? 0);
  expect(displacement).toBeGreaterThan(0);
  for (let index = 0; index < before.length; index += 1) {
    expect((before[index] ?? 0) - (after[index] ?? 0)).toBeCloseTo(
      displacement,
      1,
    );
  }
  expect(
    await page.locator(".terminal-lines").evaluate((element) => {
      const viewport = element.closest(".terminal-viewport");
      return (
        viewport &&
        element.getBoundingClientRect().right <=
          viewport.getBoundingClientRect().right
      );
    }),
  ).toBe(true);
  expect(await hasNoPageOverflow(page)).toBe(true);
});

test("long mobile terminal output stays inside its scroll viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.locator(".terminal-lines").evaluate((terminal) => {
    for (let index = 0; index < 300; index += 1) {
      const line = document.createElement("div");
      line.textContent = `live terminal line ${index}`;
      terminal.append(line);
    }
  });

  expect(
    await page.evaluate(
      () => document.documentElement.scrollHeight <= window.innerHeight,
    ),
  ).toBe(true);
  expect(
    await page
      .locator(".terminal-viewport")
      .evaluate((viewport) => viewport.scrollHeight > viewport.clientHeight),
  ).toBe(true);
});

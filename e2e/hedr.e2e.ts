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
  await expect(page.locator(".hedr-theme")).toHaveClass(/dark/);
  await expect(
    page.getByRole("button", { name: "Use light appearance" }),
  ).toBeVisible();
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute(
    "content",
    "#11110f",
  );

  await page.getByRole("button", { name: "Use light appearance" }).click();
  await expect(page.locator("html")).toHaveClass(/light/);
  await expect(page.locator(".hedr-theme")).toHaveClass(/light/);
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem("hedr-appearance")))
    .toBe("light");
  await page.reload();
  await expect(page.locator("html")).toHaveClass(/light/);
  await expect(page.locator(".hedr-theme")).toHaveClass(/light/);
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute(
    "content",
    "#f6f3ed",
  );
});

test("desktop workbench gives the terminal priority", async ({
  page,
}, testInfo) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem("hedr-appearance")) {
      localStorage.setItem("hedr-appearance", "light");
    }
  });
  await page.setViewportSize({ width: 1536, height: 960 });
  await page.goto("/");

  await expect(page).toHaveTitle("Hedr — agent workbench");
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
    const brightness = (selector: string) => {
      const color = getComputedStyle(
        document.querySelector(selector) as Element,
      ).backgroundColor;
      const channels =
        color
          .match(/[\d.]+/g)
          ?.slice(0, 3)
          .map(Number) ?? [];
      const average =
        channels.reduce((total, channel) => total + channel, 0) / 3;
      return Math.max(...channels) <= 1 ? average * 255 : average;
    };
    return {
      brandMark:
        document
          .querySelector(".sidebar-brand .brand-mark")
          ?.getBoundingClientRect().width ?? 0,
      sidebar:
        document.querySelector(".desktop-sidebar")?.getBoundingClientRect()
          .width ?? 0,
      sidebarBrightness: brightness(".desktop-sidebar"),
      surface:
        document.querySelector(".app-surface")?.getBoundingClientRect().width ??
        0,
      terminal:
        document.querySelector(".terminal-shell")?.getBoundingClientRect()
          .width ?? 0,
      terminalBrightness: brightness(".terminal-shell"),
      terminalTop:
        document.querySelector(".terminal-shell")?.getBoundingClientRect()
          .top ?? 999,
      topbarBrightness: brightness(".topbar"),
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
        ".terminal-toolbar-title",
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
  expect(lightMetrics.terminal / lightMetrics.surface).toBeGreaterThanOrEqual(
    0.7,
  );
  expect(lightMetrics.sidebarBrightness).toBeGreaterThan(180);
  expect(lightMetrics.terminalBrightness).toBeGreaterThan(180);
  expect(lightMetrics.terminalTop).toBeLessThanOrEqual(225);
  expect(lightMetrics.topbarBrightness).toBeGreaterThan(180);
  expect(lightMetrics.topbarHeight).toBeLessThanOrEqual(56);
  expect(lightMetrics.terminalToolsHeight).toBeLessThanOrEqual(44);
  expect(lightMetrics.terminalToolsBorder).toBe(0);
  expect(lightMetrics.tabStripBorder).toBe(0);
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
      blockedStatus: pair(".status-blocked", ".status-blocked"),
      composerHint: pair(".composer-hint", ".message-composer"),
      needsInput: pair(".attention-banner", ".attention-banner"),
      workingStatus: pair(".status-working", ".status-working"),
      workspacePath: pair(".workspace-cwd", "body"),
    };
  });
  for (const ratio of Object.values(contrastRatios)) {
    expect(ratio).toBeGreaterThanOrEqual(4.5);
  }
  await expect(page.getByText("agent runtime", { exact: true })).toHaveCount(0);
  await expect(page.getByText("herdr on GitHub", { exact: true })).toHaveCount(
    0,
  );
  await expect(page.getByText("Focused", { exact: true })).toHaveCount(0);
  await expect(page.locator(".topbar-context > strong")).toBeHidden();

  await page.screenshot({
    path: testInfo.outputPath("hedr-terminal-first-desktop.png"),
    fullPage: true,
  });

  await page.getByRole("button", { name: "Use dark appearance" }).click();
  await expect(page.locator(".hedr-theme")).toHaveClass(/dark/);
  const darkBrightness = await page.evaluate(() => {
    const brightness = (selector: string) => {
      const color = getComputedStyle(
        document.querySelector(selector) as Element,
      ).backgroundColor;
      const channels =
        color
          .match(/[\d.]+/g)
          ?.slice(0, 3)
          .map(Number) ?? [];
      const average =
        channels.reduce((total, channel) => total + channel, 0) / 3;
      return Math.max(...channels) <= 1 ? average * 255 : average;
    };
    return {
      sidebar: brightness(".desktop-sidebar"),
      terminal: brightness(".terminal-shell"),
      topbar: brightness(".topbar"),
    };
  });
  expect(darkBrightness.sidebar).toBeLessThan(80);
  expect(darkBrightness.terminal).toBeLessThan(80);
  expect(darkBrightness.topbar).toBeLessThan(80);
  await page.screenshot({
    path: testInfo.outputPath("hedr-terminal-first-dark.png"),
    fullPage: true,
  });
  await page.reload();
  await expect(page.locator(".hedr-theme")).toHaveClass(/dark/);
  await page.getByRole("button", { name: "Open details" }).click();
  await expect(
    page.getByRole("dialog", { name: "Session details" }),
  ).toBeVisible();
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
    .poll(() => page.evaluate(() => localStorage.getItem("hedr-agent-sort")))
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
    agentTitleRight:
      document.querySelector(".agent-panel-title")?.getBoundingClientRect()
        .right ?? 0,
    agentSortLeft:
      document.querySelector(".agent-sort-control")?.getBoundingClientRect()
        .left ?? 0,
    agentSortRight:
      document.querySelector(".agent-sort-control")?.getBoundingClientRect()
        .right ?? 0,
    agentPanelRight:
      document.querySelector(".agent-panel")?.getBoundingClientRect().right ??
      0,
  }));
  expect(sections.actionsBottom).toBeLessThanOrEqual(sections.agentsTop + 1);
  expect(sections.agentTitleRight).toBeLessThanOrEqual(sections.agentSortLeft);
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
    .poll(() => page.evaluate(() => localStorage.getItem("hedr-sidebar-width")))
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

test("terminal uses JetBrains Mono with bundled Nerd Font symbols", async ({
  page,
}) => {
  await page.goto("/");
  const fontFamily = await page
    .locator(".terminal-lines")
    .evaluate((element) => getComputedStyle(element).fontFamily);

  expect(fontFamily).toContain("JetBrains Mono");
  expect(fontFamily).toContain("Symbols Nerd Font Mono");
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
  expect(loadedFonts).toContain("JetBrains Mono");
  expect(loadedFonts).toContain("Symbols Nerd Font Mono");
});

test("command palette works with a keyboard only", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/");

  await page.keyboard.press("Control+KeyK");
  const search = page.getByRole("combobox", {
    name: "Search Spaces, Agents, and Terminals",
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
    page.getByRole("button", { name: "Open command palette" }),
    page.getByRole("button", { name: "New Agent in herdr" }),
    page.getByRole("button", { name: "Open more actions" }),
    page.getByRole("button", { name: "Attach image" }),
    page.getByRole("button", { name: "Send message" }),
  ]) {
    expect((await target.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(
      44,
    );
  }

  await page.screenshot({
    path: testInfo.outputPath("hedr-terminal-first-mobile.png"),
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
    expect((await target.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(
      44,
    );
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
    expect((await target.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(
      44,
    );
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

test("supported width extremes avoid horizontal overflow", async ({ page }) => {
  for (const viewport of [
    { width: 320, height: 700 },
    { width: 640, height: 700 },
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

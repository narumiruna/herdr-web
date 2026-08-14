import { expect, type Page, test } from "@playwright/test";

async function hasNoPageOverflow(page: Page) {
  return page.evaluate(
    () => document.documentElement.scrollWidth <= window.innerWidth,
  );
}

test("desktop workbench gives the terminal priority", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1536, height: 960 });
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "api-review" })).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Needs attention", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Activity" })).toHaveCount(0);
  await expect(
    page.getByRole("region", { name: "claude · API review terminal" }),
  ).toBeVisible();
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
      workspaceHeaderHeight:
        document.querySelector(".workspace-header")?.getBoundingClientRect()
          .height ?? 0,
    };
  });
  expect(lightMetrics.brandMark).toBeLessThanOrEqual(30);
  expect(lightMetrics.sidebar).toBeLessThanOrEqual(224);
  expect(lightMetrics.terminal / lightMetrics.surface).toBeGreaterThanOrEqual(
    0.7,
  );
  expect(lightMetrics.sidebarBrightness).toBeGreaterThan(180);
  expect(lightMetrics.terminalBrightness).toBeGreaterThan(180);
  expect(lightMetrics.terminalTop).toBeLessThanOrEqual(200);
  expect(lightMetrics.topbarBrightness).toBeGreaterThan(180);
  expect(lightMetrics.topbarHeight).toBeLessThanOrEqual(56);
  expect(lightMetrics.workspaceHeaderHeight).toBeLessThanOrEqual(60);
  await expect(page.getByText("agent runtime", { exact: true })).toHaveCount(0);
  await expect(page.getByText("herdr on GitHub", { exact: true })).toHaveCount(
    0,
  );
  await expect(page.getByText("Focused", { exact: true })).toHaveCount(0);
  await expect(page.locator(".topbar-context > strong")).toBeHidden();

  await page.screenshot({
    path: testInfo.outputPath("herdr-terminal-first-desktop.png"),
    fullPage: true,
  });

  await page.getByRole("button", { name: "Use dark appearance" }).click();
  await expect(page.locator(".herdr-theme")).toHaveClass(/dark/);
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
    path: testInfo.outputPath("herdr-terminal-first-dark.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Open details" }).click();
  await expect(
    page.getByRole("dialog", { name: "Session details" }),
  ).toBeVisible();
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
    name: "Search workspaces, agents, and terminals",
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
    page.getByRole("heading", { name: "plugin-index" }),
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
  await expect(page.getByRole("heading", { name: "api-review" })).toBeVisible();
  await expect(
    page.getByRole("region", { name: "claude · API review terminal" }),
  ).toBeVisible();
  await expect(
    page.getByRole("textbox", { name: "Message api-review" }),
  ).toBeVisible();
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
    page.getByRole("button", { name: "New agent" }),
    page.getByRole("button", { name: "Open command palette" }),
    page.getByRole("button", { name: "Open details" }),
    page.getByRole("button", { name: "Attach image" }),
    page.getByRole("button", { name: "Send message" }),
  ]) {
    expect((await target.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(
      44,
    );
  }

  await page.screenshot({
    path: testInfo.outputPath("herdr-terminal-first-mobile.png"),
    fullPage: true,
  });

  await page.getByRole("button", { name: "Open navigation" }).click();
  const navigation = page.getByRole("dialog", { name: "Navigate workbench" });
  await expect(navigation).toBeVisible();
  await navigation
    .getByRole("button", { name: "Open herdr.dev workspace" })
    .click();
  await expect(
    page.getByRole("heading", { name: "agent-guide" }),
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
    { width: 2560, height: 1440 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "api-review" }),
    ).toBeVisible();
    await expect(
      page.getByRole("textbox", { name: "Message api-review" }),
    ).toBeVisible();
    expect(await hasNoPageOverflow(page)).toBe(true);
  }
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

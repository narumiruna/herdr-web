import { expect, test } from "@playwright/test";

test("Agent ordering toggles with the keyboard, preserves selection and drafts, and survives reload", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/");
  const agents = page.getByRole("navigation", { name: "Detected Agents" });
  const rows = agents.getByRole("button");
  await expect(rows).toHaveCount(5);
  await expect(rows.first()).toHaveAccessibleName(/web-bridge/);
  const composer = page.getByRole("textbox", { name: "Message api-review" });
  await composer.fill("Keep the review draft");
  const ordering = page.getByRole("button", {
    name: "Agent ordering: Grouped",
  });
  await ordering.focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("button", { name: "Agent ordering: Priority" }),
  ).toBeFocused();
  await expect(rows.first()).toHaveAccessibleName(/api-review/);
  await expect(rows.nth(1)).toHaveAccessibleName(/integration-tests/);
  await expect(agents.locator('[aria-current="page"]')).toHaveAccessibleName(
    /api-review/,
  );
  await expect(composer).toHaveValue("Keep the review draft");
  await rows.filter({ hasText: "OpenCode" }).click();
  await page
    .getByRole("navigation", { name: "Detected Agents" })
    .getByRole("button", { name: /api-review/ })
    .click();
  await expect(composer).toHaveValue("Keep the review draft");
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Agent ordering: Priority" }),
  ).toBeVisible();
  await expect(rows.first()).toHaveAccessibleName(/api-review/);
  await page.getByRole("button", { name: "Agent ordering: Priority" }).click();
  await expect(rows.first()).toHaveAccessibleName(/web-bridge/);
  expect(
    await page.evaluate(() => localStorage.getItem("herdr-web-agent-sort")),
  ).toBe("grouped");
});

for (const width of [180, 320]) {
  test(`long Space names retain their full title at sidebar width ${width}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.addInitScript(
      (value) => localStorage.setItem("herdr-web-sidebar-width", String(value)),
      width,
    );
    await page.goto("/");
    const name = "herdr-web-project-with-a-long-distinguishing-name";
    await page.getByRole("button", { name: "Create a new Space" }).click();
    await page
      .getByRole("textbox", { name: "Directory", exact: true })
      .fill(`/repo/${name}`);
    await page
      .getByRole("button", { name: "Create Space", exact: true })
      .click();
    const row = page.getByRole("button", { name: `Open ${name} Space` });
    await expect(row).toHaveAttribute("title", new RegExp(name));
    const label = row.locator("strong");
    await expect(label).toHaveText(name);
    expect(
      await label.evaluate(
        (element) => element.scrollWidth > element.clientWidth,
      ),
    ).toBe(true);
    await expect(label).toHaveCSS("text-overflow", "ellipsis");
    await expect(label).toHaveCSS("white-space", "nowrap");
    await expect(row).toBeInViewport({ ratio: 1 });
  });
}

test("Menu exposes attention count and opens the Attention Inbox", async ({
  page,
}) => {
  await page.goto("/");
  const menu = page.getByRole("button", { name: "Open menu" });
  await expect(menu).toHaveAccessibleDescription("Attention Inbox, 2 items");
  await menu.click();
  await page
    .getByRole("menuitem", {
      name: "Open Attention Inbox, 2 items",
      exact: true,
    })
    .click();
  const inbox = page.getByRole("dialog", { name: "Attention Inbox" });
  await expect(inbox).toBeVisible();
  await inbox.getByRole("button", { name: "Close dialog" }).click();
  await expect(menu).toBeFocused();
});

test("sidebar divider defaults to half, resizes with pointer and keyboard, and persists bounded ratios", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/");
  const divider = page.getByRole("separator", {
    name: "Resize Spaces and Agents panels",
  });
  await expect(divider).toHaveAttribute("aria-valuenow", "50");
  await expect(divider).toHaveAttribute("aria-valuemin", "10");
  await expect(divider).toHaveAttribute("aria-valuemax", "90");
  const grid = await page.locator(".sidebar-sections").boundingBox();
  const handle = await divider.boundingBox();
  if (!grid || !handle) throw new Error("Missing sidebar divider");
  await page.mouse.move(
    handle.x + handle.width / 2,
    handle.y + handle.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    handle.x + handle.width / 2,
    grid.y + grid.height * 0.65,
  );
  await page.mouse.up();
  await expect(divider).toHaveAttribute("aria-valuenow", /6[45]/);
  const saved = await page.evaluate(() =>
    localStorage.getItem("herdr-web-sidebar-spaces-ratio"),
  );
  await page.reload();
  await expect(divider).toHaveAttribute("aria-valuenow", /6[45]/);
  expect(
    await page.evaluate(() =>
      localStorage.getItem("herdr-web-sidebar-spaces-ratio"),
    ),
  ).toBe(saved);
  await divider.focus();
  await page.keyboard.press("Home");
  await expect(divider).toHaveAttribute("aria-valuenow", "10");
  await page.keyboard.press("End");
  await expect(divider).toHaveAttribute("aria-valuenow", "90");
  for (const ratio of ["-10", "10"]) {
    await page.evaluate(
      (value) => localStorage.setItem("herdr-web-sidebar-spaces-ratio", value),
      ratio,
    );
    await page.reload();
    await expect(divider).toHaveAttribute(
      "aria-valuenow",
      ratio === "-10" ? "10" : "90",
    );
    await expect(
      page.getByRole("button", { name: "Create a new Space" }),
    ).toBeInViewport({ ratio: 1 });
    await expect(
      page.getByRole("button", { name: "Open menu" }),
    ).toBeInViewport({ ratio: 1 });
    await expect(
      page.getByRole("button", { name: "Agent ordering: Grouped" }),
    ).toBeInViewport({ ratio: 1 });
  }
});

for (const viewport of [
  { width: 1280, height: 800 },
  { width: 390, height: 844 },
  { width: 390, height: 320 },
]) {
  test(`Spaces and Agents scroll independently at ${viewport.width}×${viewport.height}`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize(viewport);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    if (viewport.width <= 840)
      await page.getByRole("button", { name: "Open navigation" }).click();
    const sidebar =
      viewport.width <= 840
        ? page.getByRole("dialog", { name: "Navigate workbench" })
        : page.locator(".desktop-sidebar");
    await page.screenshot({
      path: testInfo.outputPath("navigation.png"),
      animations: "disabled",
    });
    // Extend only fixture content to exercise the real Radix scroll containers.
    await sidebar.evaluate((root) => {
      for (const selector of [".workspace-list", ".agent-list"]) {
        const list = root.querySelector(selector);
        const row = list?.firstElementChild;
        if (!list || !row) throw new Error(`Missing ${selector}`);
        for (let index = 0; index < 30; index++)
          list.append(row.cloneNode(true));
      }
    });
    const spaces = sidebar.locator(".sidebar-viewport");
    const agents = sidebar.locator(".agent-panel-viewport");
    const actionBefore = await sidebar.locator(".spaces-actions").boundingBox();
    const headingBefore = await sidebar
      .locator(".agent-panel-heading")
      .boundingBox();
    for (const container of [spaces, agents]) {
      expect(
        await container.evaluate(
          (element) => element.scrollHeight > element.clientHeight,
        ),
      ).toBe(true);
      expect((await container.boundingBox())?.height ?? 0).toBeGreaterThan(0);
    }
    await spaces.hover();
    await page.mouse.wheel(0, 500);
    await expect
      .poll(() => spaces.evaluate((element) => element.scrollTop))
      .toBeGreaterThan(0);
    expect(await agents.evaluate((element) => element.scrollTop)).toBe(0);
    const spacesTop = await spaces.evaluate((element) => element.scrollTop);
    await agents.hover();
    await page.mouse.wheel(0, 500);
    await expect
      .poll(() => agents.evaluate((element) => element.scrollTop))
      .toBeGreaterThan(0);
    expect(await spaces.evaluate((element) => element.scrollTop)).toBe(
      spacesTop,
    );
    expect(await sidebar.locator(".spaces-actions").boundingBox()).toEqual(
      actionBefore,
    );
    expect(await sidebar.locator(".agent-panel-heading").boundingBox()).toEqual(
      headingBefore,
    );
    await expect(
      sidebar.getByRole("button", { name: "Open menu" }),
    ).toBeInViewport({ ratio: 1 });
    await expect(
      sidebar.getByRole("button", { name: "Create a new Space" }),
    ).toBeInViewport({ ratio: 1 });
    await expect(
      sidebar.getByRole("button", { name: "Agent ordering: Grouped" }),
    ).toBeInViewport({ ratio: 1 });
    const divider = sidebar.locator(".sidebar-section-resize-handle");
    if (viewport.height <= 480) await expect(divider).toBeHidden();
    else await expect(divider).toBeVisible();
  });
}

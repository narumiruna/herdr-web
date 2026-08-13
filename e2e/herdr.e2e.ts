import { expect, test } from "@playwright/test";

test("desktop workbench stays focused and supports appearance switching", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1536, height: 960 });
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "api-review" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Activity" })).toBeVisible();
  await expect(
    page.getByRole("region", { name: "claude · API review terminal" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);

  await page.screenshot({
    path: testInfo.outputPath("herdr-desktop.png"),
    fullPage: true,
  });

  await page.getByRole("button", { name: "Use dark appearance" }).click();
  await expect(page.locator(".herdr-theme")).toHaveClass(/dark/);
});

test("mobile layout keeps navigation and the terminal reachable", async ({
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
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);

  await page.screenshot({
    path: testInfo.outputPath("herdr-mobile.png"),
    fullPage: true,
  });

  await page.getByRole("button", { name: "Open navigation" }).click();
  await expect(
    page.getByRole("dialog", { name: "Switch workspace" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Open herdr.dev workspace" }).click();
  await expect(
    page.getByRole("heading", { name: "agent-guide" }),
  ).toBeVisible();
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

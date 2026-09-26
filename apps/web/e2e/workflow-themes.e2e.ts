import { expect, test } from "@playwright/test";
import { WORKBENCH_THEMES } from "../src/theme-preferences";

for (const { label, theme } of WORKBENCH_THEMES) {
  test(`${label} uses its palette for workflow selection`, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.addInitScript(
      (value) => localStorage.setItem("herdr-web-theme", value),
      theme,
    );
    await page.goto("/");
    await page.getByRole("button", { name: "Open menu" }).click();
    await page.getByRole("menuitem", { name: "Workflow templates" }).click();
    const dialog = page.getByRole("dialog", {
      name: "Agent workflow templates",
      exact: true,
    });
    const templates = dialog.getByRole("complementary", {
      name: "Workflow templates",
    });
    const first = templates.getByRole("button", { name: /^Review browser/ });
    const second = templates.getByRole("button", {
      name: /^Implement browser/,
    });
    await dialog.getByRole("textbox", { name: "Template name" }).fill("Review");
    await dialog.getByRole("button", { name: "Save template" }).click();
    await expect(first).toHaveAttribute("data-active", "true");
    await templates.getByRole("button", { name: "New template" }).click();
    await dialog
      .getByRole("textbox", { name: "Template name" })
      .fill("Implement");
    await dialog.getByRole("button", { name: "Save template" }).click();
    await expect(second).toHaveAttribute("data-active", "true");

    const clean = /^(mist|sage|linen)-/.test(theme);
    const colors = await dialog.evaluate((element, useClean) => {
      const probe = document.createElement("span");
      element.append(probe);
      const resolve = (token: string) => {
        probe.style.color = `var(${token})`;
        return getComputedStyle(probe).color;
      };
      const result = {
        border: resolve(useClean ? "--clean-accent" : "--amber-7"),
        fill: resolve(useClean ? "--clean-accent-fill" : "--amber-3"),
        ink: resolve("--ink"),
        muted: resolve("--ink-muted"),
        navigationSelection: resolve("--selection-accent"),
        semanticStatuses: [
          resolve("--amber-12"),
          resolve("--blue-12"),
          resolve("--grass-12"),
          resolve("--red-12"),
        ],
      };
      probe.remove();
      return result;
    }, clean);

    expect(new Set(colors.semanticStatuses).size).toBe(4);
    for (const status of colors.semanticStatuses) {
      expect(colors.navigationSelection).not.toBe(status);
    }

    for (const [selected, inactive] of [
      [first, second],
      [second, first],
    ]) {
      await selected.click();
      await expect(selected).toHaveAttribute("data-active", "true");
      await expect(selected).toHaveCSS("border-color", colors.border);
      await expect(selected).toHaveCSS("background-color", colors.fill);
      await expect(selected.locator("strong")).toHaveCSS("color", colors.ink);
      await expect(selected.locator("small")).toHaveCSS("color", colors.muted);
      await expect(inactive).toHaveAttribute("data-active", "false");
      await expect(inactive).toHaveCSS("border-color", "rgba(0, 0, 0, 0)");
      await expect(inactive).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    }
  });
}

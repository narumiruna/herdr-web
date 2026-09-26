import { expect, test } from "@playwright/test";
import { WORKBENCH_THEMES } from "../src/theme-preferences";
import { RUNTIME_COMMAND } from "../src/workflow-templates";

for (const { label, theme } of WORKBENCH_THEMES) {
  test(`${label} uses its palette for Agent runtime selection`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.addInitScript(
      (value) => localStorage.setItem("herdr-web-theme", value),
      theme,
    );
    await page.goto("/");
    await page.getByRole("button", { name: "New Agent in herdr" }).click();
    const dialog = page.getByRole("dialog", { name: "Start a new Agent" });
    const options = dialog.getByRole("group", { name: "Agent runtime" });
    const clean = /^(mist|sage|linen)-/.test(theme);
    const colors = await dialog.evaluate((element, useClean) => {
      const probe = document.createElement("span");
      element.append(probe);
      const resolve = (token: string) => {
        probe.style.color = `var(${token})`;
        return getComputedStyle(probe).color;
      };
      const result = {
        selected: resolve(useClean ? "--clean-accent" : "--amber-8"),
        idle: resolve("--border"),
      };
      probe.remove();
      return result;
    }, clean);
    const runtimes = Object.entries(RUNTIME_COMMAND);
    await expect(options.getByRole("radio")).toHaveCount(runtimes.length);
    await expect(options.getByRole("radio").first()).toBeChecked();
    await expect(options.locator('label[data-selected="true"]')).toHaveCSS(
      "border-color",
      colors.selected,
    );

    for (const [index, [runtime, command]] of runtimes.entries()) {
      const radio = options.getByRole("radio", {
        name: `${runtime} ${command}`,
        exact: true,
      });
      if (index % 2 === 0) await radio.check();
      else {
        await radio.focus();
        await radio.press("Space");
      }
      await expect(radio).toBeChecked();
      await expect(options.locator('label[data-selected="true"]')).toHaveCSS(
        "border-color",
        colors.selected,
      );
      for (const idle of await options
        .locator('label[data-selected="false"]')
        .all()) {
        await expect(idle).toHaveCSS("border-color", colors.idle);
      }
      await expect(
        dialog.getByRole("region", { name: "Launch preview" }).locator("code"),
      ).toHaveText(command);
    }
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(dialog).toBeHidden();
  });
}

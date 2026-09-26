import { expect, test } from "@playwright/test";
import { WORKBENCH_THEMES } from "../src/theme-preferences";

for (const { label, theme } of WORKBENCH_THEMES) {
  test(`${label} uses its palette for terminal focus controls`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.addInitScript(
      (value) => localStorage.setItem("herdr-web-theme", value),
      theme,
    );
    await page.goto(`/e2e/terminal-harness.html?theme=${theme}`);
    await expect
      .poll(() => page.evaluate(() => window.__terminalSockets.length))
      .toBe(1);

    const clean = /^(mist|sage|linen)-/.test(theme);
    const colors = await page
      .locator(".herdr-web-theme")
      .evaluate((element, useClean) => {
        const probe = document.createElement("span");
        element.append(probe);
        const resolve = (value: string) => {
          probe.style.color = value;
          return getComputedStyle(probe).color;
        };
        const focus = resolve(
          `var(${useClean ? "--clean-accent" : "--amber-8"})`,
        );
        const result = {
          focus,
          promptGlow: resolve(`color-mix(in srgb, ${focus} 35%, transparent)`),
        };
        probe.remove();
        return result;
      }, clean);

    await page.getByRole("button", { name: "Search terminal" }).click();
    const search = page.getByRole("search");
    const searchInput = search.getByRole("textbox", {
      name: "Search terminal output",
    });
    await expect(searchInput).toBeFocused();
    const idleSearchInputBorder = await searchInput.evaluate(
      (element) => getComputedStyle(element).borderColor,
    );
    const focusControls = [
      {
        border: clean ? colors.focus : idleSearchInputBorder,
        control: searchInput,
      },
      {
        border: colors.focus,
        control: search.getByRole("button", { name: "Previous" }),
      },
    ];
    for (const { border, control } of focusControls) {
      await page.keyboard.press("Tab");
      await control.focus();
      expect(
        await control.evaluate((element) => element.matches(":focus-visible")),
      ).toBe(true);
      await expect(control).toHaveCSS("border-color", border);
      await expect(control).toHaveCSS(
        "box-shadow",
        `${colors.focus} 0px 0px 0px 1px`,
      );
    }

    await page.getByRole("button", { name: "Prompt Agent" }).click();
    const prompt = page.getByRole("dialog", { name: /^Prompt / });
    const instruction = prompt.getByRole("textbox", { name: "Instruction" });
    await page.keyboard.press("Tab");
    await instruction.focus();
    expect(
      await instruction.evaluate((element) =>
        element.matches(":focus-visible"),
      ),
    ).toBe(true);
    await expect(instruction).toHaveCSS("border-color", colors.focus);
    await expect(instruction).toHaveCSS(
      "box-shadow",
      `${colors.promptGlow} 0px 0px 0px 2px`,
    );
    await prompt.getByRole("button", { name: "Cancel" }).click();
  });

  test(`${label} uses its palette for Settings checkboxes`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.addInitScript(
      (value) => localStorage.setItem("herdr-web-theme", value),
      theme,
    );
    await page.goto("/");
    await page.getByRole("button", { name: "Open menu" }).click();
    await page.getByRole("menuitem", { name: "Settings", exact: true }).click();
    const settings = page.getByRole("dialog", { name: "Settings" });
    const clean = /^(mist|sage|linen)-/.test(theme);
    const checkboxColor = await settings.evaluate((element, useClean) => {
      const probe = document.createElement("span");
      element.append(probe);
      probe.style.color = `var(${useClean ? "--clean-accent" : "--amber-9"})`;
      const result = getComputedStyle(probe).color;
      probe.remove();
      return result;
    }, clean);
    const preferences = settings.getByRole("group", {
      name: "Attention and accessibility",
    });
    const checkboxes = preferences.getByRole("checkbox");
    await expect(checkboxes).toHaveCount(5);
    for (const checkbox of await checkboxes.all()) {
      await expect(checkbox).toHaveCSS("accent-color", checkboxColor);
    }
  });
}

import { expect, test } from "@playwright/test";

// These checks use real browser layout and keep PNGs as review artifacts.
const viewports = [
  { width: 1440, height: 900 },
  { width: 840, height: 900 },
  { width: 390, height: 844 },
  { width: 320, height: 568 },
];

for (const appearance of ["light", "dark"] as const) {
  for (const viewport of viewports) {
    test(`simplified workbench at ${viewport.width}×${viewport.height}, ${appearance}`, async ({
      page,
    }, testInfo) => {
      await page.setViewportSize(viewport);
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.addInitScript((value) => {
        localStorage.setItem("herdr-web-theme", `editorial-${value}`);
      }, appearance);
      await page.goto("/");
      const selected = page.getByRole("tab", { name: /api-review/ });
      await expect(selected).toHaveAttribute("aria-selected", "true");
      await page.evaluate(() => document.fonts.ready);
      await expect(selected).toBeInViewport({ ratio: 1 });
      await expect(page.locator(".herdr-web-theme")).toHaveClass(
        new RegExp(`\\b${appearance}\\b`),
      );
      await expect(page.locator(".app-surface > .topbar")).toHaveCount(0);
      await expect(page.locator(".session-tabs")).toHaveCount(1);
      await expect(page.locator(".topbar-context > strong")).toBeVisible();
      await expect(
        page.locator(".agent-progress-summary .status-pill"),
      ).toHaveCount(0);
      await expect(page.locator(".work-status-summary")).toHaveCount(0);
      await expect(page.locator(".workspace-cwd")).toHaveCount(0);
      await expect(page.locator(".terminal-toolbar-branch")).toHaveCount(1);
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await expect(
        page.getByRole("button", { name: "Copy current working directory" }),
      ).toHaveCount(0);

      const bounds = await page.evaluate(() => {
        const rect = (selector: string) => {
          const element = document.querySelector(selector);
          if (!element) throw new Error(`Missing ${selector}`);
          const value = element.getBoundingClientRect();
          return {
            left: value.left,
            right: value.right,
            top: value.top,
            bottom: value.bottom,
            width: value.width,
            height: value.height,
          };
        };
        return {
          header: rect(".session-tabs"),
          context: rect(".topbar-context"),
          tabs: rect(".session-tabs-scroll"),
          actions: rect(".topbar-actions"),
          composer: rect(".message-composer"),
          terminal: rect(".terminal-viewport"),
          nameClipped: (() => {
            const label = document.querySelector(
              ".session-tab[data-state='active'] .session-tab-label",
            );
            if (!label) throw new Error("Missing selected tab name");
            return label.scrollWidth > label.clientWidth;
          })(),
          overflow: document.documentElement.scrollWidth > window.innerWidth,
        };
      });
      expect(bounds.header.height).toBeLessThanOrEqual(60);
      expect(bounds.context.top).toBe(bounds.actions.top);
      expect(bounds.tabs.top).toBe(bounds.context.top);
      expect(bounds.context.right).toBeLessThanOrEqual(bounds.tabs.left);
      expect(bounds.tabs.right).toBeLessThanOrEqual(bounds.actions.left);
      expect(bounds.actions.right).toBeLessThanOrEqual(viewport.width);
      expect(bounds.nameClipped).toBe(false);
      expect(bounds.terminal.height).toBeGreaterThanOrEqual(150);
      expect(bounds.composer.bottom).toBeLessThanOrEqual(viewport.height);
      expect(bounds.overflow).toBe(false);
      await page.screenshot({
        path: testInfo.outputPath("workbench.png"),
        animations: "disabled",
      });

      const composer = page.getByRole("textbox", {
        name: "Message api-review",
      });
      await composer.fill("Keep this draft while inspecting details");
      await page.locator(".terminal-lines").evaluate((element) => {
        element.setAttribute("data-lifecycle-probe", "retained");
      });
      const more = page.getByRole("button", { name: "Open more actions" });
      await more.click();
      await page.getByRole("button", { name: /^Execution details/ }).click();
      const details = page.getByRole("dialog", { name: "Execution details" });
      await expect(details).toBeVisible();
      await expect(
        details.getByRole("button", { name: "Copy current working directory" }),
      ).toBeVisible();
      await expect(details.locator(".details-directory code")).not.toBeEmpty();
      await expect(details.getByText("Context", { exact: true })).toBeVisible();
      await page.screenshot({
        path: testInfo.outputPath("execution-details.png"),
        animations: "disabled",
      });
      await details.getByRole("button", { name: "Close dialog" }).click();
      await expect(more).toBeFocused();
      await expect(composer).toHaveValue(
        "Keep this draft while inspecting details",
      );
      await expect(page.locator(".terminal-lines")).toHaveAttribute(
        "data-lifecycle-probe",
        "retained",
      );
      await page.getByRole("tab", { name: /web-bridge/ }).click();
      await selected.click();
      await expect(composer).toHaveValue(
        "Keep this draft while inspecting details",
      );

      if (viewport.width <= 840) {
        await page.getByRole("button", { name: "Open navigation" }).click();
      }
      const sidebar =
        viewport.width <= 840
          ? page.getByRole("dialog", { name: "Navigate workbench" })
          : page.locator(".desktop-sidebar");
      await expect(
        sidebar.getByRole("region", { name: "Agents" }),
      ).toBeVisible();
      const agents = sidebar.getByRole("navigation", {
        name: "Detected Agents",
      });
      await expect(agents.getByRole("button")).toHaveCount(5);
      await expect(sidebar.locator(".workspace-list .agent-list")).toHaveCount(
        0,
      );
      await expect(
        sidebar.getByRole("separator", {
          name: "Resize Spaces and Agents panels",
        }),
      ).toBeVisible();
      await expect(
        sidebar.getByRole("button", {
          name: "Agent ordering: Grouped",
        }),
      ).toBeVisible();
      await expect(
        sidebar.getByRole("button", { name: /Open Attention Inbox/ }),
      ).toHaveCount(0);
      const hierarchy = await sidebar.evaluate((root) => {
        const rect = (selector: string) => {
          const element = root.querySelector(selector);
          if (!element) throw new Error(`Missing ${selector}`);
          return element.getBoundingClientRect();
        };
        const spaces = rect(".sidebar-scroll");
        const actions = rect(".spaces-actions");
        const agents = rect(".agent-panel");
        const buttons = [
          ...root.querySelectorAll(".spaces-actions button"),
        ].map((button) => button.getBoundingClientRect());
        return {
          spacesAboveActions: spaces.bottom <= actions.top,
          actionsAboveAgents: actions.bottom <= agents.top,
          newLeftMenuRight:
            buttons.length === 2 &&
            (buttons[0]?.right ?? Infinity) <= (buttons[1]?.left ?? -Infinity),
        };
      });
      expect(hierarchy).toEqual({
        spacesAboveActions: true,
        actionsAboveAgents: true,
        newLeftMenuRight: true,
      });
      await page.screenshot({
        path: testInfo.outputPath("navigation.png"),
        animations: "disabled",
      });
      if (viewport.width <= 840) {
        await sidebar.getByRole("button", { name: "Close dialog" }).click();
        await expect(composer).toHaveValue(
          "Keep this draft while inspecting details",
        );
      }
    });
  }
}

for (const theme of [
  "editorial-light",
  "editorial-dark",
  "classic-light",
  "classic-dark",
]) {
  for (const { width, sidebarWidth } of [
    { width: 1440, sidebarWidth: 180 },
    { width: 1440, sidebarWidth: 320 },
    { width: 320, sidebarWidth: 180 },
  ]) {
    test(`long names remain usable at ${width}px, sidebar ${sidebarWidth}px in ${theme}`, async ({
      page,
    }, testInfo) => {
      await page.setViewportSize({ width, height: width === 320 ? 568 : 900 });
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.addInitScript(
        ({ theme, sidebarWidth }) => {
          localStorage.setItem("herdr-web-theme", theme);
          localStorage.setItem("herdr-web-sidebar-width", String(sidebarWidth));
        },
        { theme, sidebarWidth },
      );
      await page.goto("/");
      await expect(page.getByRole("tab", { name: /api-review/ })).toBeVisible();
      if (width <= 840)
        await page.getByRole("button", { name: "Open navigation" }).click();
      const sidebar =
        width <= 840
          ? page.getByRole("dialog", { name: "Navigate workbench" })
          : page.locator(".desktop-sidebar");
      await expect(
        sidebar.getByRole("button", { name: "Open herdr Space" }),
      ).toHaveAttribute("title", /herdr.*feat\/web-bridge/);
      if (width > 840)
        await expect(sidebar).toHaveCSS("width", `${sidebarWidth}px`);
      // Change only fixture text; the app's real row and control layout stays intact.
      await sidebar
        .locator(".workspace-copy strong, .workspace-copy small")
        .evaluateAll((elements) => {
          for (const element of elements) {
            element.textContent =
              "herdr-web-project-with-a-long-distinguishing-name";
          }
        });
      await sidebar
        .locator(".agent-item-copy strong")
        .first()
        .evaluate((element) => {
          element.textContent =
            "Agent-with-a-long-name-and-distinguishing-suffix";
        });
      const metrics = await sidebar.evaluate((root) => {
        const labels = [
          ...root.querySelectorAll(
            ".workspace-copy strong, .workspace-copy small, .agent-item-copy strong",
          ),
        ];
        const heading = root.querySelector(
          ".workspace-tree-heading:has(.workspace-group-toggle)",
        );
        const select = heading
          ?.querySelector(".workspace-item")
          ?.getBoundingClientRect();
        const toggle = heading
          ?.querySelector(".workspace-group-toggle")
          ?.getBoundingClientRect();
        const row = root.querySelector(".agent-item");
        const name = row
          ?.querySelector(".agent-item-copy")
          ?.getBoundingClientRect();
        const status = row
          ?.querySelector(".status-pill")
          ?.getBoundingClientRect();
        if (!name || !status) throw new Error("Missing navigation fixture");
        return {
          labelsFit: labels.every(
            (element) =>
              element.getBoundingClientRect().width > 0 &&
              getComputedStyle(element).textOverflow === "ellipsis" &&
              getComputedStyle(element).whiteSpace === "nowrap",
          ),
          clipped: labels[0]!.scrollWidth > labels[0]!.clientWidth,
          selectAndToggleSeparate:
            !select || !toggle || select.right <= toggle.left,
          nameAndStatusSeparate: status.right <= name.left,
          touchTarget: toggle
            ? { width: toggle.width, height: toggle.height }
            : null,
          overflow: root.scrollWidth > root.clientWidth,
        };
      });
      expect(metrics.labelsFit).toBe(true);
      expect(metrics.clipped).toBe(true);
      expect(metrics.selectAndToggleSeparate).toBe(true);
      expect(metrics.nameAndStatusSeparate).toBe(true);
      expect(metrics.overflow).toBe(false);
      if (width <= 840 && metrics.touchTarget) {
        expect(metrics.touchTarget.width).toBeGreaterThanOrEqual(44);
        expect(metrics.touchTarget.height).toBeGreaterThanOrEqual(44);
      }
      await page.screenshot({
        path: testInfo.outputPath("long-name-navigation.png"),
        animations: "disabled",
      });
    });
  }
}

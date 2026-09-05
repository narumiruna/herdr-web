import { expect, test } from "@playwright/test";
import { PNG } from "pngjs";

interface LineMetrics {
  colored: number;
  maxGap: number;
  span: number;
}

async function terminalLineMetrics(
  page: import("@playwright/test").Page,
  scale: number,
): Promise<LineMetrics> {
  const screenshot = await page.locator(".xterm-screen").screenshot();
  const output = PNG.sync.read(screenshot);
  const isMagenta = (offset: number) => {
    const red = output.data[offset] ?? 0;
    const green = output.data[offset + 1] ?? 0;
    const blue = output.data[offset + 2] ?? 0;
    const alpha = output.data[offset + 3] ?? 0;
    return alpha > 100 && red > 100 && blue > 110 && green < red * 0.8;
  };
  const rowLimit = Math.min(output.height, Math.ceil(20 * scale));
  let bestY = 0;
  let bestCount = 0;
  for (let y = 0; y < rowLimit; y += 1) {
    let count = 0;
    for (let x = 0; x < output.width; x += 1) {
      if (isMagenta((y * output.width + x) * 4)) count += 1;
    }
    if (count > bestCount) {
      bestCount = count;
      bestY = y;
    }
  }

  const line: boolean[] = [];
  for (let x = 0; x < output.width; x += 1) {
    line.push(isMagenta((bestY * output.width + x) * 4));
  }
  const first = line.indexOf(true);
  const last = line.lastIndexOf(true);
  let gap = 0;
  let maxGap = 0;
  if (first >= 0 && last >= first) {
    for (let x = first; x <= last; x += 1) {
      if (line[x]) {
        gap = 0;
      } else {
        gap += 1;
        maxGap = Math.max(maxGap, gap);
      }
    }
  }
  return {
    colored: bestCount,
    maxGap,
    span: first < 0 ? 0 : last - first + 1,
  };
}

test("keeps the final row visible at fractional browser scales", async ({
  browser,
}) => {
  for (const { deviceScaleFactor, height } of [
    { deviceScaleFactor: 1.25, height: 701 },
    { deviceScaleFactor: 1.5, height: 900 },
  ]) {
    const context = await browser.newContext({
      deviceScaleFactor,
      viewport: { width: 1_200, height },
    });
    const page = await context.newPage();
    try {
      await page.goto("/e2e/terminal-harness.html");
      await expect
        .poll(() => page.evaluate(() => window.__terminalSockets.length))
        .toBe(1);
      const host = page.locator(".xterm-host");
      await expect(host).toHaveAttribute("data-fonts", "ready");
      await page.evaluate(() => {
        const output = Array.from(
          { length: 80 },
          (_, index) => `zoom line ${index}\r\n`,
        ).join("");
        window.__terminalSockets[0]?.frame(`${output}BOTTOM ROW`);
      });
      await expect(page.locator(".xterm-accessibility-tree")).toContainText(
        "BOTTOM ROW",
      );

      for (const viewportHeight of [height, height - 37]) {
        await page.setViewportSize({ width: 1_200, height: viewportHeight });
        await expect
          .poll(() =>
            page.evaluate(() => {
              const xterm = document.querySelector(".xterm");
              const screen = document.querySelector(".xterm-screen");
              if (!xterm || !screen) return false;
              const xtermBounds = xterm.getBoundingClientRect();
              const screenBounds = screen.getBoundingClientRect();
              const xtermStyle = getComputedStyle(xterm);
              const contentTop =
                xtermBounds.top + Number.parseFloat(xtermStyle.paddingTop);
              const contentBottom =
                xtermBounds.bottom -
                Number.parseFloat(xtermStyle.paddingBottom);
              return (
                screenBounds.top >= contentTop - 1 &&
                screenBounds.bottom <= contentBottom + 1
              );
            }),
          )
          .toBe(true);
      }
      await expect(page.locator(".xterm-accessibility-tree")).toContainText(
        "BOTTOM ROW",
      );
    } finally {
      await context.close();
    }
  }
});

for (const deviceScaleFactor of [1, 2]) {
  test(`renders continuous terminal glyphs at DPR ${deviceScaleFactor}`, async ({
    browser,
  }, testInfo) => {
    const context = await browser.newContext({
      deviceScaleFactor,
      viewport: { width: 1024, height: 520 },
    });
    const page = await context.newPage();
    try {
      await page.goto("/e2e/terminal-harness.html");
      await expect
        .poll(() => page.evaluate(() => window.__terminalSockets.length))
        .toBe(1);
      const terminal = page.locator(".interactive-terminal");
      const host = page.locator(".xterm-host");
      await expect(host).toHaveAttribute("data-fonts", "ready");
      await expect(host).toHaveAttribute("data-unicode-version", "11");
      await expect(host).toHaveAttribute("data-renderer-ready", "true");
      await expect
        .poll(() => host.getAttribute("data-renderer"))
        .toMatch(/^(canvas|webgl)$/);
      if (
        deviceScaleFactor === 2 &&
        (await host.getAttribute("data-renderer")) === "webgl"
      ) {
        await page.locator(".xterm-screen canvas").evaluateAll((canvases) => {
          for (const canvas of canvases) {
            canvas.dispatchEvent(
              new Event("webglcontextlost", { cancelable: true }),
            );
          }
        });
        await expect(host).toHaveAttribute("data-renderer", "canvas");
      }
      await expect
        .poll(() =>
          page.evaluate(() =>
            Array.from(document.fonts)
              .filter((font) => font.family === "JetBrainsMono Nerd Font Mono")
              .map((font) => `${font.style} ${font.weight} ${font.status}`)
              .sort(),
          ),
        )
        .toEqual([
          "italic 400 loaded",
          "italic 600 loaded",
          "normal 400 loaded",
          "normal 600 loaded",
        ]);

      await page.evaluate(() =>
        window.__terminalSockets[0]?.renderingFixture(),
      );
      await expect(
        page
          .locator(".interactive-terminal-state")
          .filter({ hasText: "Interactive" }),
      ).toBeVisible();
      const terminalAction = page
        .locator(".interactive-terminal-actions button:not(:disabled)")
        .first();
      await terminalAction.focus();
      await expect(terminalAction).toHaveCSS("outline-width", "2px");
      await expect(terminalAction).toHaveCSS(
        "outline-color",
        "rgb(223, 170, 114)",
      );
      await expect(page.locator(".xterm-accessibility-tree")).toContainText(
        "herdr-web",
      );
      await expect(page.locator(".xterm-accessibility-tree")).toContainText(
        "WIDTH ASCII|界面|é|🙂|END",
      );
      const accessibleText =
        (await page.locator(".xterm-accessibility-tree").textContent()) ?? "";
      expect(accessibleText).not.toContain("�");

      const line = await terminalLineMetrics(page, deviceScaleFactor);
      expect(line.span).toBeGreaterThan(500 * deviceScaleFactor);
      expect(line.colored / line.span).toBeGreaterThan(0.98);
      expect(line.maxGap).toBeLessThanOrEqual(deviceScaleFactor);
      await expect
        .poll(() =>
          page.evaluate(() => {
            const terminalHost = document.querySelector(".xterm-host");
            return {
              documentFits:
                document.documentElement.scrollWidth <= window.innerWidth,
              terminalFits: terminalHost
                ? terminalHost.scrollWidth <= terminalHost.clientWidth + 1
                : false,
            };
          }),
        )
        .toEqual({ documentFits: true, terminalFits: true });

      if (deviceScaleFactor === 1) {
        const beforeResize = await page.evaluate(
          () =>
            window.__terminalSockets[0]?.sent.filter(
              (value) => JSON.parse(value).type === "terminal.resize",
            ).length,
        );
        await page.locator("#root").evaluate((root) => {
          for (let width = 1_000; width >= 900; width -= 5) {
            (root as HTMLElement).style.width = `${width}px`;
          }
        });
        await expect
          .poll(() =>
            page.evaluate(
              () =>
                window.__terminalSockets[0]?.sent.filter(
                  (value) => JSON.parse(value).type === "terminal.resize",
                ).length,
            ),
          )
          .toBeGreaterThan(beforeResize ?? 0);
        const newSizes = await page.evaluate(
          (offset) =>
            window.__terminalSockets[0]?.sent
              .filter((value) => JSON.parse(value).type === "terminal.resize")
              .slice(offset)
              .map((value) => {
                const { cols, rows } = JSON.parse(value);
                return `${cols}x${rows}`;
              }),
          beforeResize ?? 0,
        );
        expect(newSizes?.length).toBeLessThanOrEqual(1);
        expect(new Set(newSizes).size).toBe(newSizes?.length);

        await page
          .locator(".xterm-helper-textarea")
          .evaluate((element) => (element as HTMLTextAreaElement).focus());
        const originalDpr = await page.evaluate(() => window.devicePixelRatio);
        await page.keyboard.press("Control+=");
        await expect(terminal).toHaveAttribute("data-font-size", "14");
        expect(await page.evaluate(() => window.devicePixelRatio)).toBe(
          originalDpr,
        );
        await page.keyboard.press("Control+0");
        await expect(terminal).toHaveAttribute("data-font-size", "13");

        if ((await host.getAttribute("data-renderer")) === "webgl") {
          await page.locator(".xterm-screen canvas").evaluateAll((canvases) => {
            for (const canvas of canvases) {
              canvas.dispatchEvent(
                new Event("webglcontextlost", { cancelable: true }),
              );
            }
          });
          await expect(host).toHaveAttribute("data-renderer", "canvas");
          await expect(page.locator(".xterm-helper-textarea")).toBeAttached();
        }
      }
    } catch (error) {
      await testInfo.attach(`terminal-dpr-${deviceScaleFactor}`, {
        body: await page.screenshot(),
        contentType: "image/png",
      });
      throw error;
    } finally {
      await context.close();
    }
  });
}

import { expect, test } from "@playwright/test";

const PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

async function writeClipboardImage(page: import("@playwright/test").Page) {
  await page.evaluate(async (encoded) => {
    const bytes = Uint8Array.from(window.atob(encoded), (value) =>
      value.charCodeAt(0),
    );
    await navigator.clipboard.write([
      new ClipboardItem({
        "image/png": new Blob([bytes], { type: "image/png" }),
      }),
    ]);
  }, PNG);
}

test("xterm supports repeated native image paste and an ordered image batch", async ({
  context,
  page,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"], {
    origin: "http://127.0.0.1:4173",
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/e2e/terminal-harness.html");
  await expect
    .poll(() => page.evaluate(() => window.__terminalSockets.length))
    .toBe(1);
  await page.evaluate(() => window.__terminalSockets[0]?.frame("interactive"));
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    )
    .toBe(true);
  await expect(
    page
      .locator(".interactive-terminal-state")
      .filter({ hasText: "Interactive" }),
  ).toBeVisible();
  await page
    .locator(".xterm-helper-textarea")
    .evaluate((element) => (element as HTMLTextAreaElement).focus());
  await writeClipboardImage(page);

  const pasteShortcut = process.platform === "darwin" ? "Meta+V" : "Control+V";
  for (let cycle = 1; cycle <= 2; cycle += 1) {
    await page.keyboard.press(pasteShortcut);
    await expect(
      page.getByRole("dialog", { name: "Insert image path" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Upload and insert path" }).click();
    await expect(
      page.getByRole("dialog", { name: "Insert image path" }),
    ).toBeHidden();
    await expect
      .poll(() => page.evaluate(() => window.__terminalUploads.length))
      .toBe(cycle);
    await expect
      .poll(() =>
        page.evaluate(() =>
          document.activeElement?.classList.contains("xterm-helper-textarea"),
        ),
      )
      .toBe(true);
  }

  await page.evaluate(() => {
    const clipboard = new DataTransfer();
    clipboard.items.add(new File(["one"], "one.png", { type: "image/png" }));
    clipboard.items.add(new File(["two"], "two.jpg", { type: "image/jpeg" }));
    clipboard.items.add(
      new File(["three"], "three.webp", { type: "image/webp" }),
    );
    window.dispatchEvent(
      new ClipboardEvent("paste", {
        bubbles: true,
        cancelable: true,
        clipboardData: clipboard,
      }),
    );
  });

  await expect(
    page.getByRole("dialog", { name: "Insert image paths" }),
  ).toBeVisible();
  await expect(page.getByTestId("terminal-image-name")).toHaveText([
    "one.png",
    "two.jpg",
    "three.webp",
  ]);
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    )
    .toBe(true);
  await expect
    .poll(() =>
      page
        .getByRole("button", { name: "Remove one.png" })
        .evaluate((element) => element.getBoundingClientRect().height),
    )
    .toBeGreaterThanOrEqual(44);
  await page
    .getByRole("button", { name: "Upload 3 images and insert paths" })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Insert image paths" }),
  ).toBeHidden();

  const result = await page.evaluate(() => ({
    inputs: window.__terminalSockets[0]?.sent
      .map((value) => JSON.parse(value))
      .filter(({ type }) => type === "terminal.input"),
    uploads: window.__terminalUploads.map(({ image }) => image.name),
  }));
  expect(result.uploads.slice(-3)).toEqual([
    "one.png",
    "two.jpg",
    "three.webp",
  ]);
  expect(result.inputs).toHaveLength(3);
  expect(result.inputs?.at(-1)).toEqual({
    data: " '/repo/3-one.png' '/repo/4-two.jpg' '/repo/5-three.webp' ",
    type: "terminal.input",
  });
});

test("split xterms route image paste only to the focused pane", async ({
  page,
}) => {
  await page.goto("/e2e/terminal-harness.html?split=1");
  await expect
    .poll(() => page.evaluate(() => window.__terminalSockets.length))
    .toBe(2);
  await page.evaluate(() => {
    for (const socket of window.__terminalSockets) socket.frame("interactive");
  });
  await expect(
    page
      .locator(".interactive-terminal-state")
      .filter({ hasText: "Interactive" }),
  ).toHaveCount(2);

  await page.evaluate(() => {
    const clipboard = new DataTransfer();
    clipboard.items.add(
      new File(["focused"], "focused.png", { type: "image/png" }),
    );
    window.dispatchEvent(
      new ClipboardEvent("paste", {
        bubbles: true,
        cancelable: true,
        clipboardData: clipboard,
      }),
    );
  });

  await expect(
    page.getByRole("dialog", { name: "Insert image path" }),
  ).toHaveCount(1);
  await page.getByRole("button", { name: "Upload and insert path" }).click();
  await expect
    .poll(() => page.evaluate(() => window.__terminalUploads.length))
    .toBe(1);
  expect(
    await page.evaluate(() =>
      window.__terminalUploads.map(({ image, paneId }) => ({
        name: image.name,
        paneId,
      })),
    ),
  ).toEqual([{ name: "focused.png", paneId: "w5:p2" }]);
});

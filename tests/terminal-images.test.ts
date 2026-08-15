import { describe, expect, test } from "vitest";
import {
  appendTerminalImages,
  emptyTerminalImageBatch,
  imageFilesFromTransfer,
  MAX_TERMINAL_IMAGES,
  removeTerminalImage,
  retryFailedTerminalImages,
  shellEscapePath,
  terminalImageInput,
  updateTerminalImage,
} from "../src/components/terminal-images";

function image(name: string, type = "image/png", contents = "image") {
  return new File([contents], name, { type });
}

describe("terminal image queue", () => {
  test("stages ordered images and treats repeated paste actions as distinct items", () => {
    const repeated = image("repeat.png");
    const first = appendTerminalImages(emptyTerminalImageBatch(1), [
      repeated,
      image("second.jpg", "image/jpeg"),
    ]);
    const second = appendTerminalImages(first, [repeated]);

    expect(second.items.map(({ file }) => file.name)).toEqual([
      "repeat.png",
      "second.jpg",
      "repeat.png",
    ]);
    expect(new Set(second.items.map(({ id }) => id)).size).toBe(3);
  });

  test("keeps invalid images visible and bounds each batch", () => {
    const files = Array.from({ length: MAX_TERMINAL_IMAGES + 2 }, (_, index) =>
      index === 0
        ? image("unsupported.svg", "image/svg+xml")
        : image(`${index}.png`),
    );
    const batch = appendTerminalImages(emptyTerminalImageBatch(2), files);

    expect(batch.items).toHaveLength(MAX_TERMINAL_IMAGES);
    expect(batch.items[0]).toMatchObject({
      error: "Choose a PNG, JPEG, GIF, or WebP image.",
      status: "failed",
    });
    expect(batch.error).toContain(`Only ${MAX_TERMINAL_IMAGES} images`);
  });

  test("ignores stale completion and retries only valid failed items", () => {
    const staged = appendTerminalImages(emptyTerminalImageBatch(3), [
      image("valid.png"),
      image("invalid.svg", "image/svg+xml"),
    ]);
    const validId = staged.items[0]?.id ?? "";
    const failed = updateTerminalImage(staged, 3, validId, {
      error: "Network unavailable",
      status: "failed",
    });

    expect(
      updateTerminalImage(failed, 2, validId, {
        path: "/stale.png",
        status: "uploaded",
      }),
    ).toBe(failed);
    const retried = retryFailedTerminalImages(failed);
    expect(
      retried.items.map(({ error, status }) => ({ error, status })),
    ).toEqual([
      { error: "", status: "staged" },
      {
        error: "Choose a PNG, JPEG, GIF, or WebP image.",
        status: "failed",
      },
    ]);
    expect(removeTerminalImage(retried, validId).items).toHaveLength(1);
  });

  test("reads all image files once and keeps clipboard order", () => {
    const first = image("first.png");
    const second = image("second.webp", "image/webp");
    const data = {
      files: [first, second],
      items: [
        { getAsFile: () => first, kind: "file", type: first.type },
        { getAsFile: () => second, kind: "file", type: second.type },
      ],
    } as unknown as DataTransfer;

    expect(imageFilesFromTransfer(data)).toEqual([first, second]);
  });

  test("escapes and separates every path without submitting", () => {
    expect(shellEscapePath("/tmp/it's.png")).toBe(`'/tmp/it'"'"'s.png'`);
    expect(terminalImageInput(["/one.png", "/two image.png"])).toBe(
      " '/one.png' '/two image.png' ",
    );
    expect(terminalImageInput(["/one.png"])).not.toMatch(/[\r\n]/);
  });
});

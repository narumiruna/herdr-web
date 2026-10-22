import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import {
  clampSidebarSpacesRatio,
  DEFAULT_SIDEBAR_SPACES_RATIO,
  MAX_SIDEBAR_SPACES_RATIO,
  MIN_SIDEBAR_SPACES_RATIO,
  SidebarSectionResizeHandle,
} from "../src/components/SidebarSectionResizeHandle";

function fixture(ratio = 0.5) {
  const onResize = vi.fn();
  const view = render(
    <div>
      <SidebarSectionResizeHandle ratio={ratio} onResize={onResize} />
    </div>,
  );
  const handle = screen.getByRole("separator", {
    name: "Resize Spaces and Agents panels",
  });
  const parent = handle.parentElement;
  if (!parent) throw new Error("Missing resize container");
  vi.spyOn(parent, "getBoundingClientRect").mockReturnValue({
    top: 100,
    height: 510,
  } as DOMRect);
  vi.spyOn(handle, "getBoundingClientRect").mockReturnValue({
    top: 350,
    height: 10,
  } as DOMRect);
  const setCapture = vi.fn();
  const releaseCapture = vi.fn();
  Object.defineProperty(handle, "setPointerCapture", { value: setCapture });
  Object.defineProperty(handle, "releasePointerCapture", {
    value: releaseCapture,
  });
  Object.defineProperty(handle, "hasPointerCapture", { value: () => true });
  return { ...view, handle, onResize, setCapture, releaseCapture, parent };
}

function pointer(
  handle: HTMLElement,
  type: string,
  clientY: number,
  pointerId = 7,
  button = 0,
) {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientY,
    button,
  });
  Object.defineProperty(event, "pointerId", { value: pointerId });
  fireEvent(handle, event);
}

describe("Sidebar section ratio", () => {
  test("uses the original default and limits", () => {
    expect(DEFAULT_SIDEBAR_SPACES_RATIO).toBe(0.5);
    expect(MIN_SIDEBAR_SPACES_RATIO).toBe(0.1);
    expect(MAX_SIDEBAR_SPACES_RATIO).toBe(0.9);
    expect(clampSidebarSpacesRatio(-1)).toBe(0.1);
    expect(clampSidebarSpacesRatio(2)).toBe(0.9);
    expect(clampSidebarSpacesRatio(0.64)).toBe(0.64);
  });

  test.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    "uses a finite default for %s",
    (value) => {
      expect(clampSidebarSpacesRatio(value)).toBe(0.5);
      const { handle } = fixture(value);
      expect(handle).toHaveAttribute("aria-valuenow", "50");
    },
  );
});

describe("SidebarSectionResizeHandle", () => {
  test("exposes the horizontal split and panel percentages", () => {
    const { handle } = fixture(0.6);
    expect(handle).toHaveAttribute("aria-orientation", "horizontal");
    expect(handle).toHaveAttribute("aria-valuemin", "10");
    expect(handle).toHaveAttribute("aria-valuemax", "90");
    expect(handle).toHaveAttribute("aria-valuenow", "60");
    expect(handle).toHaveAttribute("aria-valuetext", "60% Spaces, 40% Agents");
    expect(handle).toHaveAttribute("tabindex", "0");
  });

  test.each([
    ["{ArrowUp}", 0.45],
    ["{ArrowDown}", 0.55],
    ["{Home}", 0.1],
    ["{End}", 0.9],
  ] as const)("resizes with %s", async (key, ratio) => {
    const user = userEvent.setup();
    const { handle, onResize } = fixture();
    handle.focus();
    await user.keyboard(key);
    expect(onResize).toHaveBeenCalledExactlyOnceWith(ratio);
    expect(handle).toHaveFocus();
  });

  test("clamps keyboard changes and ignores unrelated keys", () => {
    const { handle, onResize, rerender } = fixture(0.1);
    fireEvent.keyDown(handle, { key: "ArrowUp" });
    expect(onResize).toHaveBeenLastCalledWith(0.1);
    rerender(
      <div>
        <SidebarSectionResizeHandle ratio={0.9} onResize={onResize} />
      </div>,
    );
    fireEvent.keyDown(handle, { key: "ArrowDown" });
    expect(onResize).toHaveBeenLastCalledWith(0.9);
    onResize.mockClear();
    fireEvent.keyDown(handle, { key: "ArrowLeft" });
    expect(onResize).not.toHaveBeenCalled();
  });

  test("captures one pointer, measures its parent, and commits the final position", () => {
    const { handle, onResize, setCapture, releaseCapture } = fixture();
    pointer(handle, "pointerdown", 405);
    expect(onResize).toHaveBeenLastCalledWith(0.6);
    expect(setCapture).toHaveBeenCalledExactlyOnceWith(7);
    expect(handle).toHaveAttribute("data-dragging", "true");
    expect(handle).toHaveFocus();
    pointer(handle, "pointerdown", 105, 8);
    pointer(handle, "pointermove", 105, 8);
    pointer(handle, "pointerup", 105, 8);
    expect(onResize).toHaveBeenCalledTimes(1);
    pointer(handle, "pointermove", 455);
    expect(onResize).toHaveBeenLastCalledWith(0.7);
    pointer(handle, "pointerup", 505);
    expect(onResize).toHaveBeenLastCalledWith(0.8);
    expect(releaseCapture).toHaveBeenCalledExactlyOnceWith(7);
    expect(handle).toHaveAttribute("data-dragging", "false");
    pointer(handle, "lostpointercapture", 505);
    pointer(handle, "pointermove", 105);
    expect(onResize).toHaveBeenCalledTimes(3);
  });

  test("clamps pointer positions to 10–90% and ignores non-primary buttons", () => {
    const { handle, onResize } = fixture();
    pointer(handle, "pointerdown", 300, 7, 2);
    pointer(handle, "pointermove", 300);
    expect(onResize).not.toHaveBeenCalled();
    pointer(handle, "pointerdown", -100);
    expect(onResize).toHaveBeenLastCalledWith(0.1);
    pointer(handle, "pointermove", 1000);
    expect(onResize).toHaveBeenLastCalledWith(0.9);
  });

  test.each(["pointercancel", "lostpointercapture"])(
    "restores the starting split after %s",
    (type) => {
      const { handle, onResize } = fixture(0.4);
      pointer(handle, "pointerdown", 405);
      pointer(handle, type, 405, 8);
      expect(handle).toHaveAttribute("data-dragging", "true");
      pointer(handle, type, 405);
      expect(onResize).toHaveBeenLastCalledWith(0.4);
      expect(handle).toHaveAttribute("data-dragging", "false");
      onResize.mockClear();
      pointer(handle, "pointermove", 505);
      pointer(handle, "pointerup", 505);
      expect(onResize).not.toHaveBeenCalled();
    },
  );

  test("keeps a finite split when layout cannot be measured", () => {
    const { handle, onResize, parent } = fixture(0.4);
    vi.mocked(parent.getBoundingClientRect).mockReturnValue({
      top: 0,
      height: 0,
    } as DOMRect);
    pointer(handle, "pointerdown", 405);
    expect(onResize).toHaveBeenLastCalledWith(0.4);
  });
});

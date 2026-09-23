import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import {
  clampSidebarSpacesRatio,
  SidebarSectionResizeHandle,
} from "../src/components/SidebarSectionResizeHandle";

describe("SidebarSectionResizeHandle", () => {
  test("clamps the Spaces share to keep both sections usable", () => {
    expect(clampSidebarSpacesRatio(0.1)).toBe(0.2);
    expect(clampSidebarSpacesRatio(0.5)).toBe(0.5);
    expect(clampSidebarSpacesRatio(0.9)).toBe(0.8);
  });

  test("resizes the sections with pointer input", () => {
    const onResize = vi.fn();
    render(
      <div>
        <SidebarSectionResizeHandle ratio={0.64} onResize={onResize} />
      </div>,
    );
    const separator = screen.getByRole("separator", {
      name: "Resize Spaces and Agents panels",
    });
    const sections = separator.parentElement;
    if (!sections) throw new Error("Missing sidebar sections");
    vi.spyOn(sections, "getBoundingClientRect").mockReturnValue({
      bottom: 508,
      height: 408,
      left: 0,
      right: 220,
      top: 100,
      width: 220,
      x: 0,
      y: 100,
      toJSON: () => ({}),
    });
    vi.spyOn(separator, "getBoundingClientRect").mockReturnValue({
      bottom: 364,
      height: 8,
      left: 0,
      right: 220,
      top: 356,
      width: 220,
      x: 0,
      y: 356,
      toJSON: () => ({}),
    });

    fireEvent.pointerDown(separator, {
      button: 0,
      clientY: 360,
      pointerId: 1,
    });
    fireEvent.pointerMove(separator, { clientY: 392, pointerId: 1 });
    fireEvent.pointerUp(separator, { clientY: 392, pointerId: 1 });

    expect(onResize).toHaveBeenLastCalledWith(0.72);
  });

  test("supports arrow and boundary keys", () => {
    const onResize = vi.fn();
    render(<SidebarSectionResizeHandle ratio={0.64} onResize={onResize} />);
    const separator = screen.getByRole("separator", {
      name: "Resize Spaces and Agents panels",
    });

    fireEvent.keyDown(separator, { key: "ArrowUp" });
    fireEvent.keyDown(separator, { key: "Home" });
    fireEvent.keyDown(separator, { key: "End" });

    expect(onResize.mock.calls[0]?.[0]).toBeCloseTo(0.59);
    expect(onResize).toHaveBeenNthCalledWith(2, 0.2);
    expect(onResize).toHaveBeenNthCalledWith(3, 0.8);
    expect(separator).toHaveAttribute("aria-orientation", "horizontal");
    expect(separator).toHaveAttribute(
      "aria-valuetext",
      "64% Spaces, 36% Agents",
    );
  });
});

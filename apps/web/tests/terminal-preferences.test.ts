import { describe, expect, test } from "vitest";
import {
  clampTerminalFontSize,
  DEFAULT_TERMINAL_FONT_SIZE,
  MAX_TERMINAL_FONT_SIZE,
  MIN_TERMINAL_FONT_SIZE,
  parseTerminalFontSize,
  TERMINAL_FONT_SIZE_PRESETS,
} from "../src/terminal-preferences";

describe("terminal text size preferences", () => {
  test("defaults invalid or missing values", () => {
    expect(parseTerminalFontSize(null)).toBe(DEFAULT_TERMINAL_FONT_SIZE);
    expect(parseTerminalFontSize("")).toBe(DEFAULT_TERMINAL_FONT_SIZE);
    expect(parseTerminalFontSize("not-a-size")).toBe(
      DEFAULT_TERMINAL_FONT_SIZE,
    );
  });

  test("rounds and clamps stored and shortcut values", () => {
    expect(parseTerminalFontSize("14.4")).toBe(14);
    expect(clampTerminalFontSize(2)).toBe(MIN_TERMINAL_FONT_SIZE);
    expect(clampTerminalFontSize(40)).toBe(MAX_TERMINAL_FONT_SIZE);
  });

  test("offers compact, default, and comfortable presets", () => {
    expect(TERMINAL_FONT_SIZE_PRESETS).toEqual([
      { label: "Compact", size: 12 },
      { label: "Default", size: 13 },
      { label: "Comfortable", size: 15 },
    ]);
  });
});

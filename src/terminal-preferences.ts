export const DEFAULT_TERMINAL_FONT_SIZE = 13;
export const MIN_TERMINAL_FONT_SIZE = 11;
export const MAX_TERMINAL_FONT_SIZE = 18;

export const TERMINAL_FONT_SIZE_PRESETS = [
  { label: "Compact", size: 12 },
  { label: "Default", size: DEFAULT_TERMINAL_FONT_SIZE },
  { label: "Comfortable", size: 15 },
] as const;

export function clampTerminalFontSize(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_TERMINAL_FONT_SIZE;
  return Math.min(
    MAX_TERMINAL_FONT_SIZE,
    Math.max(MIN_TERMINAL_FONT_SIZE, Math.round(value)),
  );
}

export function parseTerminalFontSize(value: string | null): number {
  if (value === null || value.trim() === "") return DEFAULT_TERMINAL_FONT_SIZE;
  return clampTerminalFontSize(Number(value));
}

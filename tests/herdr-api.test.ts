import { describe, expect, test } from "vitest";
import { normalizeWorkspacePath } from "../src/herdr-api";

describe("normalizeWorkspacePath", () => {
  test("trims trailing separators without breaking filesystem roots", () => {
    expect(normalizeWorkspacePath(" /repo/project/// ")).toBe("/repo/project");
    expect(normalizeWorkspacePath("/")).toBe("/");
    expect(normalizeWorkspacePath("C:\\")).toBe("C:\\");
    expect(normalizeWorkspacePath("\\\\server\\share\\")).toBe(
      "\\\\server\\share",
    );
  });
});

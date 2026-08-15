import { describe, expect, test } from "vitest";
import {
  normalizeWorkspacePath,
  workspaceLabelFromPath,
} from "../src/herdr-api";

describe("workspace paths", () => {
  test("preserves separators for the Herdr host to interpret", () => {
    expect(normalizeWorkspacePath(" /repo/project/// ")).toBe(
      "/repo/project///",
    );
    expect(normalizeWorkspacePath("/tmp/project\\")).toBe("/tmp/project\\");
    expect(normalizeWorkspacePath("/tmp/project\\/")).toBe("/tmp/project\\/");
    expect(normalizeWorkspacePath("C:\\")).toBe("C:\\");
    expect(normalizeWorkspacePath("\\\\server\\share\\")).toBe(
      "\\\\server\\share\\",
    );
  });

  test("suggests labels without changing POSIX backslashes", () => {
    expect(workspaceLabelFromPath("/repo/project///")).toBe("project");
    expect(workspaceLabelFromPath("/tmp/project\\/")).toBe("project\\");
    expect(workspaceLabelFromPath("/tmp/project\\name")).toBe("project\\name");
    expect(workspaceLabelFromPath("C:\\repo\\project\\")).toBe("project");
    expect(workspaceLabelFromPath("\\\\server\\share\\project\\")).toBe(
      "project",
    );
  });
});

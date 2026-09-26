import { describe, expect, test } from "vitest";
import { compactBranchLabel } from "../src/branch-label";

describe("compactBranchLabel", () => {
  test("leaves short branch names unchanged", () => {
    expect(compactBranchLabel("main")).toBe("main");
  });

  test("preserves a branch prefix and distinguishing suffix", () => {
    const first = compactBranchLabel(
      "narumi/feat/add-adjustable-spaces-agents-divider",
    );
    const second = compactBranchLabel(
      "narumi/feat/add-accessible-terminal-actions",
    );

    expect(first).toMatch(/^narumi\/…\//);
    expect(second).toMatch(/^narumi\/…\//);
    expect(first).toMatch(/divider$/);
    expect(second).toMatch(/actions$/);
    expect(first).not.toBe(second);
    expect(first.length).toBeLessThanOrEqual(24);
    expect(second.length).toBeLessThanOrEqual(24);
  });

  test("bounds unusually long prefixes and unsegmented names", () => {
    expect(
      compactBranchLabel(
        "unusually-long-contributor-prefix/feature/distinguishing-suffix",
        18,
      ),
    ).toHaveLength(18);
    expect(compactBranchLabel("one-very-long-branch-name", 12)).toHaveLength(
      12,
    );
    expect(compactBranchLabel("branch", 0)).toBe("");
  });
});

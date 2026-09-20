import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import { writePrivateJson } from "../server/private-json-file";

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), "herdr-private-json-"));
  directories.push(directory);
  return directory;
}

describe("private atomic JSON writes", () => {
  test("creates parents, replaces complete files, and preserves private formatting", async () => {
    const directory = await fixture();
    const parent = join(directory, "nested");
    const path = join(parent, "store.json");
    await writePrivateJson(path, () => ({ version: 1, entries: ["old"] }));
    await writePrivateJson(path, () => ({ version: 1, entries: ["new"] }));
    expect(await readFile(path, "utf8")).toBe(
      '{\n  "version": 1,\n  "entries": [\n    "new"\n  ]\n}\n',
    );
    expect(await readdir(parent)).toEqual(["store.json"]);
    if (process.platform !== "win32")
      expect((await stat(path)).mode & 0o777).toBe(0o600);
  });

  test("captures data after parent creation rather than when the write is scheduled", async () => {
    const directory = await fixture();
    const path = join(directory, "store.json");
    let current = "old";
    const pending = writePrivateJson(path, () => ({ current }));
    current = "new";
    await pending;
    expect(JSON.parse(await readFile(path, "utf8"))).toEqual({
      current: "new",
    });
  });

  test("does not serialize if parent creation fails and can retry", async () => {
    const directory = await fixture();
    const parent = join(directory, "blocked");
    const path = join(parent, "store.json");
    await writeFile(parent, "not a directory");
    const value = vi.fn(() => ({ version: 1 }));
    await expect(writePrivateJson(path, value)).rejects.toThrow();
    expect(value).not.toHaveBeenCalled();
    await rm(parent);
    await writePrivateJson(path, value);
    expect(value).toHaveBeenCalledOnce();
  });

  test("leaves the destination intact on serialization failure", async () => {
    const directory = await fixture();
    const path = join(directory, "store.json");
    await writePrivateJson(path, () => ({ version: 1 }));
    const original = await readFile(path, "utf8");
    await expect(
      writePrivateJson(path, () => {
        throw new Error("serialize failed");
      }),
    ).rejects.toThrow("serialize failed");
    expect(await readFile(path, "utf8")).toBe(original);
    expect(await readdir(directory)).toEqual(["store.json"]);
  });

  test("retains the existing temporary-file behavior when rename fails", async () => {
    const directory = await fixture();
    const path = join(directory, "store.json");
    await mkdir(path);
    await expect(
      writePrivateJson(path, () => ({ version: 1 })),
    ).rejects.toThrow();
    expect((await stat(path)).isDirectory()).toBe(true);
    const temporary = (await readdir(directory)).find((name) =>
      name.endsWith(".tmp"),
    );
    expect(temporary).toMatch(
      new RegExp(`^store\\.json\\.${process.pid}\\.[a-f0-9]{12}\\.tmp$`),
    );
    expect(await readFile(join(directory, temporary ?? ""), "utf8")).toBe(
      '{\n  "version": 1\n}\n',
    );
  });
});

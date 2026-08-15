import { beforeEach, describe, expect, it } from "vitest";
import {
  readProductStorage,
  writeProductStorage,
} from "../src/product-storage";

const legacyKey = (suffix: string) => ["he", `dr-${suffix}`].join("");
const values = new Map<string, string>();
const storage = {
  getItem: (key: string) => values.get(key) ?? null,
  removeItem: (key: string) => values.delete(key),
  setItem: (key: string, value: string) => values.set(key, value),
};

describe("product storage", () => {
  beforeEach(() => {
    values.clear();
  });

  it("prefers the current product key", () => {
    storage.setItem("herdr-web-appearance", "dark");
    storage.setItem(legacyKey("appearance"), "light");

    expect(readProductStorage(storage, "appearance")).toBe("dark");
    expect(storage.getItem(legacyKey("appearance"))).toBe("light");
  });

  it("migrates a legacy value once", () => {
    storage.setItem(legacyKey("agent-sort"), "priority");

    expect(readProductStorage(storage, "agent-sort")).toBe("priority");
    expect(storage.getItem("herdr-web-agent-sort")).toBe("priority");
    expect(storage.getItem(legacyKey("agent-sort"))).toBeNull();
  });

  it("writes only the current product key", () => {
    storage.setItem(legacyKey("sidebar-width"), "280");

    writeProductStorage(storage, "sidebar-width", "320");

    expect(storage.getItem("herdr-web-sidebar-width")).toBe("320");
    expect(storage.getItem(legacyKey("sidebar-width"))).toBeNull();
  });
});

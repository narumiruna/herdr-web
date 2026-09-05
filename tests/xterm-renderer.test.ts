import { Unicode11Addon } from "@xterm/addon-unicode11";
import type {
  IDisposable,
  ITerminalAddon,
  IUnicodeVersionProvider,
  Terminal,
} from "@xterm/xterm";
import { afterEach, describe, expect, test, vi } from "vitest";
import {
  initializeTerminalRenderer,
  waitForTerminalFonts,
} from "../src/components/xterm-renderer";

class FakeTerminal {
  readonly addons: ITerminalAddon[] = [];
  readonly unicode = { activeVersion: "6" };

  loadAddon(addon: ITerminalAddon) {
    this.addons.push(addon);
  }
}

afterEach(() => {
  vi.useRealTimers();
});

describe("xterm renderer lifecycle", () => {
  test("uses Herdr-compatible widths for terminal status glyphs", () => {
    let provider: IUnicodeVersionProvider | undefined;
    const addon = new Unicode11Addon();
    addon.activate({
      unicode: {
        register: (candidate: IUnicodeVersionProvider) => {
          provider = candidate;
        },
      },
    } as unknown as Terminal);

    expect(provider?.version).toBe("11");
    expect(provider?.wcwidth("界".codePointAt(0) ?? 0)).toBe(2);
    expect(provider?.wcwidth("\u0301".codePointAt(0) ?? 0)).toBe(0);
    expect(provider?.wcwidth("🙂".codePointAt(0) ?? 0)).toBe(2);
    expect(provider?.wcwidth("\ue0b0".codePointAt(0) ?? 0)).toBe(1);
    expect(provider?.wcwidth("\uf121".codePointAt(0) ?? 0)).toBe(1);
    addon.dispose();
  });

  test("reports Unicode readiness without waiting for optional WebGL", async () => {
    const terminal = new FakeTerminal();
    let resolveWebgl:
      | ((module: { WebglAddon: new () => WebglAddon }) => void)
      | undefined;
    class Unicode11Addon implements ITerminalAddon {
      activate() {}
      dispose() {}
    }
    class WebglAddon implements ITerminalAddon {
      activate() {}
      dispose() {}
      onContextLoss(): IDisposable {
        return { dispose() {} };
      }
    }
    const loadWebgl = vi.fn(
      () =>
        new Promise<{ WebglAddon: new () => WebglAddon }>((resolve) => {
          resolveWebgl = resolve;
        }),
    );
    const lifecycle = initializeTerminalRenderer(
      terminal as unknown as Terminal,
      {
        loaders: {
          loadUnicode: async () => ({ Unicode11Addon }),
          loadWebgl,
        },
      },
    );

    await expect(lifecycle.unicodeReady).resolves.toBeUndefined();
    expect(terminal.unicode.activeVersion).toBe("11");
    expect(loadWebgl).toHaveBeenCalledOnce();
    let rendererReady = false;
    void lifecycle.ready.then(() => {
      rendererReady = true;
    });
    await Promise.resolve();
    expect(rendererReady).toBe(false);

    resolveWebgl?.({ WebglAddon });
    await expect(lifecycle.ready).resolves.toBe("webgl");
    lifecycle.dispose();
  });

  test("activates Unicode 11 and falls back once after WebGL context loss", async () => {
    const terminal = new FakeTerminal();
    const changes: string[] = [];
    const unicodeDispose = vi.fn();
    const webglDispose = vi.fn();
    const listenerDispose = vi.fn();
    let loseContext: () => void = () => undefined;

    class Unicode11Addon implements ITerminalAddon {
      activate() {}
      dispose = unicodeDispose;
    }
    class WebglAddon implements ITerminalAddon {
      activate() {}
      dispose = webglDispose;
      onContextLoss(listener: () => void): IDisposable {
        loseContext = listener;
        return { dispose: listenerDispose };
      }
    }

    const lifecycle = initializeTerminalRenderer(
      terminal as unknown as Terminal,
      {
        loaders: {
          loadUnicode: async () => ({ Unicode11Addon }),
          loadWebgl: async () => ({ WebglAddon }),
        },
        onRendererChange: (renderer) => changes.push(renderer),
      },
    );

    await expect(lifecycle.ready).resolves.toBe("webgl");
    expect(terminal.unicode.activeVersion).toBe("11");
    expect(terminal.addons).toHaveLength(2);
    expect(changes).toEqual(["canvas", "webgl"]);

    loseContext();
    expect(changes).toEqual(["canvas", "webgl", "canvas"]);
    expect(listenerDispose).toHaveBeenCalledOnce();
    expect(webglDispose).toHaveBeenCalledOnce();

    lifecycle.dispose();
    lifecycle.dispose();
    expect(unicodeDispose).toHaveBeenCalledOnce();
    expect(webglDispose).toHaveBeenCalledOnce();
  });

  test("keeps the built-in renderer when optional addons fail", async () => {
    const terminal = new FakeTerminal();
    const changes: string[] = [];
    const lifecycle = initializeTerminalRenderer(
      terminal as unknown as Terminal,
      {
        loaders: {
          loadUnicode: async () => {
            throw new Error("unicode unavailable");
          },
          loadWebgl: async () => {
            throw new Error("webgl unavailable");
          },
        },
        onRendererChange: (renderer) => changes.push(renderer),
      },
    );

    await expect(lifecycle.ready).resolves.toBe("canvas");
    expect(terminal.unicode.activeVersion).toBe("6");
    expect(terminal.addons).toEqual([]);
    expect(changes).toEqual(["canvas", "canvas"]);
    lifecycle.dispose();
  });

  test("disposes WebGL cleanly when activation fails", async () => {
    const terminal = new FakeTerminal();
    const unicodeDispose = vi.fn();
    const webglDispose = vi.fn();
    const listenerDispose = vi.fn();
    class Unicode11Addon implements ITerminalAddon {
      activate() {}
      dispose = unicodeDispose;
    }
    class WebglAddon implements ITerminalAddon {
      activate() {}
      dispose = webglDispose;
      onContextLoss(): IDisposable {
        return { dispose: listenerDispose };
      }
    }
    terminal.loadAddon = (addon: ITerminalAddon) => {
      if (addon instanceof WebglAddon)
        throw new Error("WebGL activation failed");
      terminal.addons.push(addon);
    };

    const lifecycle = initializeTerminalRenderer(
      terminal as unknown as Terminal,
      {
        loaders: {
          loadUnicode: async () => ({ Unicode11Addon }),
          loadWebgl: async () => ({ WebglAddon }),
        },
      },
    );

    await expect(lifecycle.ready).resolves.toBe("canvas");
    expect(webglDispose).toHaveBeenCalledOnce();
    expect(listenerDispose).toHaveBeenCalledOnce();
    lifecycle.dispose();
    expect(unicodeDispose).toHaveBeenCalledOnce();
    expect(webglDispose).toHaveBeenCalledOnce();
  });

  test("continues cleanup when an optional addon throws during disposal", async () => {
    const terminal = new FakeTerminal();
    const unicodeDispose = vi.fn(() => {
      throw new Error("unicode cleanup failed");
    });
    const webglDispose = vi.fn();
    const listenerDispose = vi.fn(() => {
      throw new Error("listener cleanup failed");
    });
    class Unicode11Addon implements ITerminalAddon {
      activate() {}
      dispose = unicodeDispose;
    }
    class WebglAddon implements ITerminalAddon {
      activate() {}
      dispose = webglDispose;
      onContextLoss(): IDisposable {
        return { dispose: listenerDispose };
      }
    }
    const lifecycle = initializeTerminalRenderer(
      terminal as unknown as Terminal,
      {
        loaders: {
          loadUnicode: async () => ({ Unicode11Addon }),
          loadWebgl: async () => ({ WebglAddon }),
        },
      },
    );
    await lifecycle.ready;

    expect(() => lifecycle.dispose()).not.toThrow();
    expect(listenerDispose).toHaveBeenCalledOnce();
    expect(unicodeDispose).toHaveBeenCalledOnce();
    expect(webglDispose).toHaveBeenCalledOnce();
  });

  test("does not activate a late addon after disposal", async () => {
    const terminal = new FakeTerminal();
    let resolveUnicode:
      | ((module: { Unicode11Addon: new () => ITerminalAddon }) => void)
      | undefined;
    const unicode = new Promise<{ Unicode11Addon: new () => ITerminalAddon }>(
      (resolve) => {
        resolveUnicode = resolve;
      },
    );
    class Unicode11Addon implements ITerminalAddon {
      activate() {}
      dispose() {}
    }
    class WebglAddon implements ITerminalAddon {
      activate() {}
      dispose() {}
      onContextLoss(): IDisposable {
        return { dispose() {} };
      }
    }
    const loadWebgl = vi.fn(async () => ({ WebglAddon }));
    const lifecycle = initializeTerminalRenderer(
      terminal as unknown as Terminal,
      {
        loaders: {
          loadUnicode: () => unicode,
          loadWebgl,
        },
      },
    );

    lifecycle.dispose();
    resolveUnicode?.({ Unicode11Addon });
    await expect(lifecycle.ready).resolves.toBe("canvas");
    expect(terminal.addons).toEqual([]);
    expect(loadWebgl).not.toHaveBeenCalled();
  });
});

describe("terminal font readiness", () => {
  test("loads normal and italic terminal weights with text and Nerd glyphs", async () => {
    const load = vi.fn().mockResolvedValue([]);

    await waitForTerminalFonts({ load } as unknown as FontFaceSet, 13, 20);

    expect(load).toHaveBeenCalledTimes(4);
    for (const [index, style] of [
      "400",
      "600",
      "italic 400",
      "italic 600",
    ].entries()) {
      expect(load).toHaveBeenNthCalledWith(
        index + 1,
        `${style} 13px "JetBrainsMono Nerd Font Mono"`,
        "Ag\ue0b0\uf489\u{f02a2}",
      );
    }
  });

  test("returns after font rejection or the bounded timeout", async () => {
    await expect(
      waitForTerminalFonts(
        {
          load: vi.fn().mockRejectedValue(new Error("font blocked")),
        } as unknown as FontFaceSet,
        13,
        20,
      ),
    ).resolves.toBeUndefined();

    vi.useFakeTimers();
    const waiting = waitForTerminalFonts(
      {
        load: vi.fn(() => new Promise(() => undefined)),
      } as unknown as FontFaceSet,
      13,
      20,
    );
    await vi.advanceTimersByTimeAsync(20);
    await expect(waiting).resolves.toBeUndefined();
  });
});

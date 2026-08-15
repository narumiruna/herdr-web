import type { IDisposable, ITerminalAddon, Terminal } from "@xterm/xterm";

export type TerminalRendererKind = "canvas" | "webgl";

interface WebglAddonLike extends ITerminalAddon {
  onContextLoss(listener: () => void): IDisposable;
}

interface RendererLoaders {
  loadUnicode: () => Promise<{
    Unicode11Addon: new () => ITerminalAddon;
  }>;
  loadWebgl: () => Promise<{
    WebglAddon: new () => WebglAddonLike;
  }>;
}

interface RendererOptions {
  loaders?: RendererLoaders;
  onRendererChange?: (renderer: TerminalRendererKind) => void;
}

export interface TerminalRendererLifecycle {
  dispose: () => void;
  ready: Promise<TerminalRendererKind>;
  unicodeReady: Promise<void>;
}

const defaultLoaders: RendererLoaders = {
  loadUnicode: () => import("@xterm/addon-unicode11"),
  loadWebgl: () => import("@xterm/addon-webgl"),
};

export function initializeTerminalRenderer(
  terminal: Terminal,
  options: RendererOptions = {},
): TerminalRendererLifecycle {
  const loaders = options.loaders ?? defaultLoaders;
  const addons = new Set<ITerminalAddon>();
  const disposedAddons = new WeakSet<ITerminalAddon>();
  let contextLoss: IDisposable | undefined;
  let disposed = false;
  let renderer: TerminalRendererKind = "canvas";

  const announce = (next: TerminalRendererKind) => {
    renderer = next;
    if (!disposed) options.onRendererChange?.(next);
  };
  const disposeContextLoss = () => {
    const listener = contextLoss;
    contextLoss = undefined;
    try {
      listener?.dispose();
    } catch {
      // A failed optional renderer cleanup must not block terminal disposal.
    }
  };
  const disposeAddon = (addon: ITerminalAddon) => {
    if (disposedAddons.has(addon)) return;
    disposedAddons.add(addon);
    addons.delete(addon);
    try {
      addon.dispose();
    } catch {
      // A failed optional addon cleanup must not leak the terminal lifecycle.
    }
  };
  const loadAddon = (addon: ITerminalAddon): boolean => {
    if (disposed) {
      disposeAddon(addon);
      return false;
    }
    try {
      terminal.loadAddon(addon);
      addons.add(addon);
      return true;
    } catch {
      disposeAddon(addon);
      return false;
    }
  };

  announce("canvas");
  const unicodeReady = (async (): Promise<void> => {
    try {
      const { Unicode11Addon } = await loaders.loadUnicode();
      if (!disposed) {
        const unicode = new Unicode11Addon();
        if (loadAddon(unicode)) terminal.unicode.activeVersion = "11";
      }
    } catch {
      // The built-in Unicode table remains active when the optional addon fails.
    }
  })();
  const ready = (async (): Promise<TerminalRendererKind> => {
    await unicodeReady;
    if (disposed) return renderer;

    try {
      const { WebglAddon } = await loaders.loadWebgl();
      if (disposed) return renderer;
      const webgl = new WebglAddon();
      contextLoss = webgl.onContextLoss(() => {
        disposeContextLoss();
        disposeAddon(webgl);
        announce("canvas");
      });
      if (!loadAddon(webgl)) {
        disposeContextLoss();
        return renderer;
      }
      announce("webgl");
    } catch {
      announce("canvas");
    }
    return renderer;
  })();

  return {
    ready,
    unicodeReady,
    dispose: () => {
      if (disposed) return;
      disposed = true;
      disposeContextLoss();
      for (const addon of [...addons]) disposeAddon(addon);
    },
  };
}

export async function waitForTerminalFonts(
  fonts: FontFaceSet | undefined,
  fontSize: number,
  timeoutMs = 1_200,
): Promise<void> {
  if (!fonts || typeof fonts.load !== "function") return;

  let timeout: number | undefined;
  const fallback = new Promise<void>((resolve) => {
    timeout = window.setTimeout(resolve, timeoutMs);
  });
  try {
    await Promise.race([
      Promise.all([
        fonts.load(`${fontSize}px "JetBrains Mono"`, "Ag"),
        fonts.load(`${fontSize}px "Symbols Nerd Font Mono"`, "\ue0b0"),
      ]).then(() => undefined),
      fallback,
    ]);
  } catch {
    // Font failure must not block terminal connection or the system fallback.
  } finally {
    window.clearTimeout(timeout);
  }
}

#!/usr/bin/env node

import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const assetsDirectory = new URL("../dist/assets/", import.meta.url);
const assetsPath = fileURLToPath(assetsDirectory);
const expectedWeights = ["500", "600"];
const expectedExtensions = ["woff", "woff2"];
const files = (await readdir(assetsDirectory)).filter(
  (file) =>
    file.startsWith("zen-old-mincho-") &&
    expectedExtensions.some((extension) => file.endsWith(`.${extension}`)),
);

for (const weight of expectedWeights) {
  for (const extension of expectedExtensions) {
    const matches = files.filter(
      (file) =>
        file.startsWith(`zen-old-mincho-latin-${weight}-normal-`) &&
        file.endsWith(`.${extension}`),
    );
    if (matches.length !== 1) {
      throw new Error(
        `Expected one Latin Zen Old Mincho ${weight} ${extension} asset, found ${matches.length}.`,
      );
    }
  }
}

const expectedCount = expectedWeights.length * expectedExtensions.length;
if (files.length !== expectedCount) {
  throw new Error(
    `Expected ${expectedCount} Zen Old Mincho browser assets, found ${files.length}.`,
  );
}

const sizes = await Promise.all(
  files.map(async (file) => (await stat(join(assetsPath, file))).size),
);
const totalBytes = sizes.reduce((total, size) => total + size, 0);
const budgetBytes = 300 * 1024;
if (totalBytes > budgetBytes) {
  throw new Error(
    `Zen Old Mincho browser assets total ${totalBytes} bytes, exceeding ${budgetBytes} bytes.`,
  );
}

console.log(
  `Zen Old Mincho browser assets: ${files.length} files, ${totalBytes} bytes.`,
);

const terminalStyles = ["regular", "semibold", "italic", "semibolditalic"];
let terminalBytes = 0;
for (const style of terminalStyles) {
  const name = `jetbrains-mono-nerd-font-mono-v3.5.1-${style}.woff2`;
  const source = await readFile(
    new URL(`../public/fonts/${name}`, import.meta.url),
  );
  const built = await readFile(
    new URL(`../dist/fonts/${name}`, import.meta.url),
  );
  if (built.toString("ascii", 0, 4) !== "wOF2" || !built.equals(source)) {
    throw new Error(`Missing or altered terminal WOFF2 asset: ${name}`);
  }
  terminalBytes += built.length;
}
if (terminalBytes > 5 * 1024 * 1024) {
  throw new Error(
    `Terminal font assets exceed the 5 MiB budget: ${terminalBytes}`,
  );
}
for (const name of [
  "JETBRAINS-MONO-OFL.txt",
  "JETBRAINS-MONO-NERD-FONTS-README.md",
  "NERD-FONTS-LICENSE.txt",
  "README.md",
]) {
  const source = await readFile(
    new URL(`../public/fonts/${name}`, import.meta.url),
  );
  const built = await readFile(
    new URL(`../dist/fonts/${name}`, import.meta.url),
  );
  if (!built.equals(source))
    throw new Error(`Altered font documentation: ${name}`);
}
const legacyAssets = [
  ...(await readdir(assetsDirectory)),
  ...(await readdir(new URL("../dist/fonts/", import.meta.url))),
].filter(
  (file) =>
    file.startsWith("jetbrains-mono-") &&
    !file.includes("nerd-font-mono-v3.5.1-"),
);
if (
  legacyAssets.length ||
  (await readdir(new URL("../dist/fonts/", import.meta.url))).includes(
    "symbols-nerd-font-mono.woff2",
  )
) {
  throw new Error("Legacy terminal fonts must not be bundled.");
}
console.log(
  `Terminal Nerd Font assets: ${terminalStyles.length} files, ${terminalBytes} bytes.`,
);

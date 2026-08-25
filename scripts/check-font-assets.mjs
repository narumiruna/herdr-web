#!/usr/bin/env node

import { readdir, stat } from "node:fs/promises";
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

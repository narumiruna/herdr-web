import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const manifest = JSON.parse(readFileSync("package.json", "utf8"));
const lock = JSON.parse(readFileSync("package-lock.json", "utf8"));
const requiredDependencies = [
  "@vitejs/plugin-react",
  "concurrently",
  "tsx",
  "vite",
];

function requireValue(condition, message) {
  if (!condition) throw new Error(message);
}

requireValue(manifest.name === "herdr-web", "Unexpected package name");
requireValue(
  manifest.bin?.["herdr-web"] === "./scripts/herdr-web.mjs",
  "Unexpected CLI executable mapping",
);
requireValue(
  manifest.private !== true,
  "Published package must not be private",
);
requireValue(
  manifest.publishConfig?.registry === "https://registry.npmjs.org",
  "Package must publish to the public npm registry",
);
requireValue(lock.name === manifest.name, "Lockfile package name is stale");
requireValue(
  lock.version === manifest.version,
  "Lockfile package version is stale",
);
for (const dependency of requiredDependencies) {
  requireValue(
    typeof manifest.dependencies?.[dependency] === "string",
    `${dependency} must be a runtime dependency for the installed CLI`,
  );
}

const packed = JSON.parse(
  execFileSync("npm", ["pack", "--dry-run", "--ignore-scripts", "--json"], {
    encoding: "utf8",
  }),
)[0];
const files = new Set(packed.files.map(({ path }) => path));
for (const path of [
  "index.html",
  "justfile",
  "scripts/herdr-web.mjs",
  "server/index.ts",
  "src/main.tsx",
  "vite.config.ts",
]) {
  requireValue(files.has(path), `Published package is missing ${path}`);
}
for (const path of [
  ".github/workflows/ci.yml",
  "e2e/hedr.e2e.ts",
  "scripts/check-package.mjs",
  "tests/app.test.tsx",
]) {
  requireValue(!files.has(path), `Published package includes ${path}`);
}

process.stdout.write(
  `Package ${manifest.name}@${manifest.version}: ${files.size} files, ${packed.size} bytes\n`,
);

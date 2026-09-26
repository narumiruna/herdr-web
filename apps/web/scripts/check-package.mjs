import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const manifest = JSON.parse(readFileSync("package.json", "utf8"));
const rootManifest = JSON.parse(readFileSync("../../package.json", "utf8"));
const lock = JSON.parse(readFileSync("../../package-lock.json", "utf8"));
const lockedPackage = lock.packages?.["apps/web"];
const requiredDependencies = [
  "@vitejs/plugin-react",
  "citty",
  "concurrently",
  "tsx",
  "vite",
];

function requireValue(condition, message) {
  if (!condition) throw new Error(message);
}

requireValue(manifest.name === "herdr-web", "Unexpected package name");
requireValue(
  manifest.bin?.["herdr-web"] === "scripts/herdr-web.mjs",
  "Unexpected CLI executable mapping",
);
requireValue(
  manifest.repository?.url ===
    "git+https://github.com/narumiruna/herdr-web.git",
  "Repository URL must match the GitHub provenance repository",
);
requireValue(
  manifest.homepage === "https://github.com/narumiruna/herdr-web#readme",
  "Unexpected package homepage",
);
requireValue(
  manifest.private !== true,
  "Published package must not be private",
);
requireValue(
  manifest.publishConfig?.registry === "https://registry.npmjs.org",
  "Package must publish to the public npm registry",
);
requireValue(rootManifest.private === true, "Monorepo root must be private");
requireValue(
  rootManifest.workspaces?.includes("apps/web") &&
    lock.packages?.[""]?.workspaces?.includes("apps/web"),
  "Missing web workspace",
);
requireValue(
  lock.packages?.["node_modules/herdr-web"]?.link === true &&
    lock.packages["node_modules/herdr-web"].resolved === "apps/web",
  "Lockfile web workspace link is stale",
);
requireValue(
  lockedPackage?.name === manifest.name,
  "Lockfile package name is stale",
);
requireValue(
  lockedPackage?.version === manifest.version,
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
  "LICENSE",
  "README.md",
  "scripts/herdr-web.mjs",
  "scripts/start-workbench.mjs",
  "scripts/startup-environment.mjs",
  "scripts/startup-environment.d.mts",
  "server/index.ts",
  "src/main.tsx",
  "vite.config.ts",
]) {
  requireValue(files.has(path), `Published package is missing ${path}`);
}
requireValue(
  readFileSync("LICENSE", "utf8") === readFileSync("../../LICENSE", "utf8"),
  "Published license differs from the repository license",
);
requireValue(
  ![...files].some(
    (path) => path.startsWith("apps/ios/") || path.startsWith("apps/android/"),
  ),
  "Published package includes a native app",
);
for (const path of [
  ".github/workflows/ci.yml",
  "e2e/herdr-web.e2e.ts",
  "scripts/check-package.mjs",
  "tests/app.test.tsx",
]) {
  requireValue(!files.has(path), `Published package includes ${path}`);
}

process.stdout.write(
  `Package ${manifest.name}@${manifest.version}: ${files.size} files, ${packed.size} bytes\n`,
);

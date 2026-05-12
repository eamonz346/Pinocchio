import { readFile } from "node:fs/promises";
import { join } from "node:path";

const manifests = [
  "package.json",
  "apps/web/package.json",
  "packages/shared/package.json",
  "packages/core/package.json",
  "packages/mcp-server/package.json"
];

const dependencyFields = [
  "dependencies",
  "devDependencies",
  "peerDependencies",
  "optionalDependencies"
];

const allowed = new Set(["workspace:*"]);
const bad = [];

for (const manifest of manifests) {
  let parsed;
  try {
    parsed = JSON.parse(await readFile(join(process.cwd(), manifest), "utf8"));
  } catch {
    continue;
  }
  for (const field of dependencyFields) {
    for (const [name, version] of Object.entries(parsed[field] ?? {})) {
      if (allowed.has(version)) continue;
      if (version.startsWith("^") || version.startsWith("~")) {
        bad.push(`${manifest} ${field}.${name}=${version}`);
      }
    }
  }
}

if (bad.length > 0) {
  console.error("Dependency versions must be exact pinned:");
  for (const item of bad) console.error(`- ${item}`);
  process.exit(1);
}

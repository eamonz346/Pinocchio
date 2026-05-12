import { readdir } from "node:fs/promises";
import { extname, join, relative, sep } from "node:path";

const roots = ["apps", "packages", "scripts"];
const runtimeExtensions = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".css", ".json", ".png", ".ico", ".svg", ".html"]);
const ignoredDirectories = new Set(["node_modules", ".next", "dist", "coverage", ".turbo", "test-results"]);
const maxRuntimeFiles = 99;
const runtimeFiles = [];

async function walk(dir) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (!ignoredDirectories.has(entry.name)) await walk(join(dir, entry.name));
      continue;
    }
    const full = join(dir, entry.name);
    const normalized = relative(process.cwd(), full).split(sep).join("/");
    if (!runtimeExtensions.has(extname(entry.name))) continue;
    if (entry.name.endsWith(".tsbuildinfo")) continue;
    if (/[./](test|spec)\.(ts|tsx|js|jsx|mjs|cjs)$/i.test(entry.name)) continue;
    if (/(^|\/)(tests?|__tests__)\//i.test(normalized)) continue;
    runtimeFiles.push(normalized);
  }
}

for (const root of roots) await walk(join(process.cwd(), root));

runtimeFiles.sort();
if (runtimeFiles.length > maxRuntimeFiles) {
  console.error(`Runtime file count must be <= ${maxRuntimeFiles}; found ${runtimeFiles.length}.`);
  for (const file of runtimeFiles) console.error(`- ${file}`);
  process.exit(1);
}

#!/usr/bin/env node
/*
 * Ensure node-pty's macOS/Linux `spawn-helper` is executable.
 *
 * Some npm install paths drop the execute bit on node-pty's prebuilt
 * `spawn-helper`, which makes `posix_spawnp` fail at runtime ("posix_spawnp
 * failed"). This postinstall guard restores it. No-op on Windows.
 */
const fs = require("fs");
const path = require("path");

if (process.platform === "win32") process.exit(0);

function findNodePty() {
  // Resolve relative to this package's node_modules, then walk up.
  let dir = __dirname;
  for (let i = 0; i < 6; i++) {
    const candidate = path.join(dir, "node_modules", "node-pty");
    if (fs.existsSync(candidate)) return candidate;
    dir = path.dirname(dir);
  }
  try {
    return path.dirname(require.resolve("node-pty/package.json"));
  } catch {
    return null;
  }
}

function chmodHelpers(root) {
  const dirs = [path.join(root, "build", "Release"), path.join(root, "prebuilds")];
  for (const base of dirs) {
    walk(base, (file) => {
      if (path.basename(file) === "spawn-helper") {
        try {
          fs.chmodSync(file, 0o755);
        } catch {
          /* best effort */
        }
      }
    });
  }
}

function walk(dir, fn) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, fn);
    else fn(full);
  }
}

const root = findNodePty();
if (root) chmodHelpers(root);

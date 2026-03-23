/**
 * Auto-bumps the patch version in manifest.json and versions.json.
 * Called by the pre-commit git hook when source files are staged.
 */
import { readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = resolve(root, "manifest.json");
const versionsPath = resolve(root, "versions.json");
const packagePath = resolve(root, "package.json");

const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const versions = JSON.parse(readFileSync(versionsPath, "utf8"));
const pkg = JSON.parse(readFileSync(packagePath, "utf8"));

const [major, minor, patch] = manifest.version.split(".").map(Number);
const oldVersion = manifest.version;
// Bump minor every 10 patches (e.g., 1.0.9 → 1.1.0), otherwise bump patch
const newVersion = patch + 1 >= 10
	? `${major}.${minor + 1}.0`
	: `${major}.${minor}.${patch + 1}`;

manifest.version = newVersion;
writeFileSync(manifestPath, JSON.stringify(manifest, null, "\t") + "\n", "utf8");

versions[newVersion] = manifest.minAppVersion;
writeFileSync(versionsPath, JSON.stringify(versions, null, "\t") + "\n", "utf8");

pkg.version = newVersion;
writeFileSync(packagePath, JSON.stringify(pkg, null, "\t") + "\n", "utf8");

console.log(`Version bumped: ${oldVersion} → ${newVersion}`);

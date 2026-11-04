import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

export const ALLOWLIST = new Set([
  'esbuild',
  'fsevents',
]);

/**
 * Extracts all unique package names from a parsed package-lock.json that have "hasInstallScript": true.
 */
export function findInstallScriptPackages(lockfile) {
  const packagesWithInstallScript = new Set();

  if (lockfile && typeof lockfile === 'object') {
    if (lockfile.packages && typeof lockfile.packages === 'object') {
      for (const [key, pkg] of Object.entries(lockfile.packages)) {
        if (!key || !pkg || typeof pkg !== 'object') continue;
        if (pkg.hasInstallScript === true) {
          const lastIdx = key.lastIndexOf('node_modules/');
          const pkgName = lastIdx !== -1 ? key.slice(lastIdx + 'node_modules/'.length) : (pkg.name || key);
          packagesWithInstallScript.add(pkgName);
        }
      }
    }

    function walkDependencies(deps) {
      if (!deps || typeof deps !== 'object') return;
      for (const [name, info] of Object.entries(deps)) {
        if (!info || typeof info !== 'object') continue;
        if (info.hasInstallScript === true) {
          packagesWithInstallScript.add(name);
        }
        if (info.dependencies) {
          walkDependencies(info.dependencies);
        }
      }
    }
    if (lockfile.dependencies) {
      walkDependencies(lockfile.dependencies);
    }
  }

  return Array.from(packagesWithInstallScript).sort();
}

/**
 * Verifies lockfile packages against ALLOWLIST.
 * Returns an object with allWithInstallScript and unallowed.
 */
export function verifyInstallScripts(lockfile, allowlist = ALLOWLIST) {
  const allWithInstallScript = findInstallScriptPackages(lockfile);
  const unallowed = allWithInstallScript.filter((pkg) => !allowlist.has(pkg));
  return {
    allWithInstallScript,
    unallowed,
  };
}

export function runCheck(lockfilePath) {
  const fullPath = path.resolve(lockfilePath);
  if (!fs.existsSync(fullPath)) {
    throw new Error(`Lockfile not found at ${fullPath}`);
  }
  const content = fs.readFileSync(fullPath, 'utf-8');
  const lockfile = JSON.parse(content);
  return verifyInstallScripts(lockfile);
}

// CLI entry point
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  const lockfilePath = process.argv[2] || path.resolve(process.cwd(), 'package-lock.json');
  try {
    const { allWithInstallScript, unallowed } = runCheck(lockfilePath);
    if (unallowed.length > 0) {
      console.error(`\n[INSTALL-SCRIPTS FAILED] Found unallowlisted package(s) with install scripts:`);
      for (const pkg of unallowed) {
        console.error(`  - ${pkg}`);
      }
      process.exit(1);
    } else {
      console.log(`[INSTALL-SCRIPTS OK] All install-script packages allowlisted: ${allWithInstallScript.join(', ')}`);
      process.exit(0);
    }
  } catch (err) {
    console.error(`[INSTALL-SCRIPTS ERROR] ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}

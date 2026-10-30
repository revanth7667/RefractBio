import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

export const PATTERNS = [
  {
    name: 'Anthropic/sk key pattern',
    regex: /(?<![A-Za-z0-9_-])sk-(?!test-fake-)[A-Za-z0-9_-]{20,}/g,
  },
  {
    name: 'Google AIza key pattern',
    regex: /(?<![A-Za-z0-9_-])AIza[0-9A-Za-z_-]{30,}/g,
  },
  {
    name: 'Private key block',
    regex: /-----BEGIN [A-Z ]*PRIVATE KEY-----/g,
  },
];

export function scanText(text) {
  const findings = [];
  const lines = text.split('\n');

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx];
    for (const rule of PATTERNS) {
      const regex = new RegExp(rule.regex.source, rule.regex.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        const matchedStr = match[0];
        findings.push({
          pattern: rule.name,
          preview: matchedStr.slice(0, 6) + '…',
          line: lineIdx + 1,
          column: match.index + 1,
        });
      }
    }
  }

  return findings;
}

const BINARY_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.pdf',
  '.docx',
  '.ico',
  '.zip',
  '.tar',
  '.gz',
]);

const IGNORED_FILES = new Set(['package-lock.json', '.DS_Store']);

export function getTrackedFiles(repoRoot = process.cwd()) {
  try {
    const stdout = execSync('git ls-files', { cwd: repoRoot, encoding: 'utf-8' });
    return stdout
      .split('\n')
      .map((f) => f.trim())
      .filter((f) => {
        if (!f) return false;
        if (IGNORED_FILES.has(path.basename(f))) return false;
        const ext = path.extname(f).toLowerCase();
        if (BINARY_EXTENSIONS.has(ext)) return false;
        return true;
      });
  } catch {
    return [];
  }
}

export function scanRepository(repoRoot = process.cwd()) {
  const files = getTrackedFiles(repoRoot);
  const allFindings = [];

  for (const relativePath of files) {
    const fullPath = path.resolve(repoRoot, relativePath);
    if (!fs.existsSync(fullPath)) continue;

    const content = fs.readFileSync(fullPath, 'utf-8');
    const findings = scanText(content);
    for (const f of findings) {
      allFindings.push({
        file: relativePath,
        ...f,
      });
    }
  }

  return allFindings;
}

// CLI entry point
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  const findings = scanRepository();
  if (findings.length > 0) {
    console.error(`\n[SECRET-SCAN FAILED] Found ${findings.length} potential secret(s):`);
    for (const f of findings) {
      console.error(`  ${f.file}:${f.line}:${f.column} - [${f.pattern}] preview: ${f.preview}`);
    }
    process.exit(1);
  } else {
    console.log('[SECRET-SCAN OK] All tracked files scanned cleanly. Zero secrets found.');
    process.exit(0);
  }
}


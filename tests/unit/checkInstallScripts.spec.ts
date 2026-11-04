import { describe, it, expect } from 'vitest';
import * as path from 'path';
import {
  ALLOWLIST,
  findInstallScriptPackages,
  verifyInstallScripts,
  runCheck,
} from '../../scripts/check-install-scripts.mjs';

describe('Install-script check (§20 M11d)', () => {
  it('ALLOWLIST contains exactly esbuild and fsevents', () => {
    expect(Array.from(ALLOWLIST).sort()).toEqual(['esbuild', 'fsevents']);
  });

  it('accepts a synthetic lockfile whose only install-script packages are allowlisted', () => {
    const syntheticLockfile = {
      name: 'fake-app',
      version: '0.1.0',
      lockfileVersion: 3,
      packages: {
        '': {
          name: 'fake-app',
          version: '0.1.0',
        },
        'node_modules/fake-clean-pkg': {
          version: '1.0.0',
          hasInstallScript: false,
        },
        'node_modules/esbuild': {
          version: '0.21.5',
          hasInstallScript: true,
        },
        'node_modules/fsevents': {
          version: '2.3.3',
          hasInstallScript: true,
        },
      },
    };

    const found = findInstallScriptPackages(syntheticLockfile);
    expect(found).toEqual(['esbuild', 'fsevents']);

    const result = verifyInstallScripts(syntheticLockfile);
    expect(result.allWithInstallScript).toEqual(['esbuild', 'fsevents']);
    expect(result.unallowed).toEqual([]);
  });

  it('rejects a synthetic lockfile with an unallowlisted install-script package', () => {
    const syntheticLockfile = {
      name: 'fake-app',
      version: '0.1.0',
      lockfileVersion: 3,
      packages: {
        '': {
          name: 'fake-app',
          version: '0.1.0',
        },
        'node_modules/esbuild': {
          version: '0.21.5',
          hasInstallScript: true,
        },
        'node_modules/fake-malicious-pkg': {
          version: '1.2.3',
          hasInstallScript: true,
        },
        'node_modules/parent/node_modules/@fake-scope/nested-evil': {
          version: '0.0.1',
          hasInstallScript: true,
        },
      },
    };

    const result = verifyInstallScripts(syntheticLockfile);
    expect(result.allWithInstallScript).toEqual([
      '@fake-scope/nested-evil',
      'esbuild',
      'fake-malicious-pkg',
    ]);
    expect(result.unallowed).toEqual([
      '@fake-scope/nested-evil',
      'fake-malicious-pkg',
    ]);
  });

  it('runs the real checker against the repository package-lock.json and succeeds', () => {
    const lockfilePath = path.resolve(__dirname, '../../package-lock.json');
    const result = runCheck(lockfilePath);

    expect(result.allWithInstallScript).toEqual(['esbuild', 'fsevents']);
    expect(result.unallowed).toEqual([]);
  });
});

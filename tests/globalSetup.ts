import { execSync } from 'node:child_process';

export function setup(): void {
  execSync('npm run build && npm run build:single', { stdio: 'pipe' });
}

export default setup;

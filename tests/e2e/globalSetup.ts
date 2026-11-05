import { execSync } from 'child_process';

export default async function globalSetup(): Promise<void> {
  execSync('npm run build:single', { stdio: 'inherit' });
}


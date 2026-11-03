import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

export default async function globalSetup(): Promise<void> {
  const distSingleHtml = path.resolve(process.cwd(), 'dist-single/index.html');
  if (!fs.existsSync(distSingleHtml)) {
    execSync('npm run build:single', { stdio: 'inherit' });
  }
}

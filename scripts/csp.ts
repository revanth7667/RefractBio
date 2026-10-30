import type { Plugin } from 'vite';
import * as fs from 'fs';
import * as path from 'path';

export const HOSTED_CSP_DIRECTIVES = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  'connect-src https://api.anthropic.com https://generativelanguage.googleapis.com',
  "base-uri 'none'",
  "form-action 'none'",
  "object-src 'none'",
  "frame-src 'none'",
];

export const HOSTED_CSP_POLICY = HOSTED_CSP_DIRECTIVES.join('; ') + ';';

export const SINGLE_FILE_CSP_POLICY =
  HOSTED_CSP_DIRECTIVES.map((d) => (d === "script-src 'self'" ? "script-src 'unsafe-inline'" : d)).join('; ') + ';';

export interface CspPluginOptions {
  singleFile?: boolean;
}

export function cspPlugin(options: CspPluginOptions = {}): Plugin {
  const policy = options.singleFile ? SINGLE_FILE_CSP_POLICY : HOSTED_CSP_POLICY;

  return {
    name: 'refractbio-csp',
    apply: 'build',
    transformIndexHtml(html: string) {
      const metaTag = `<meta http-equiv="Content-Security-Policy" content="${policy}" />`;
      if (html.includes('http-equiv="Content-Security-Policy"')) {
        return html;
      }
      if (html.includes('</head>')) {
        return html.replace('</head>', `  ${metaTag}\n  </head>`);
      }
      return `${metaTag}\n${html}`;
    },
    closeBundle() {
      // Emit Cloudflare Pages _headers file with frame-ancestors 'none'
      try {
        const outDir = path.resolve(process.cwd(), options.singleFile ? 'dist-single' : 'dist');
        if (fs.existsSync(outDir)) {
          const headersPolicy = `${policy} frame-ancestors 'none';`;
          const headersContent = `/*\n  Content-Security-Policy: ${headersPolicy}\n`;
          fs.writeFileSync(path.join(outDir, '_headers'), headersContent, 'utf-8');
        }
      } catch {
        // Output directory may not exist in some test runs
      }
    },
  };
}


# Contributing to RefractBio

Thank you for contributing to RefractBio! Please review these guidelines before submitting changes.

## Data Safety and Privacy Rule

Never commit real resumes, real Master Info files, real job postings or questions with personal names, or API keys. All fixtures must be fake.

All automated tests and fixtures must use synthetic data (invented names, `@example.com` emails, and `555-01xx` phone numbers). Tests must never contain real API keys or literal key-shaped strings; synthetic test keys should be assembled dynamically at runtime (for example, `'sk-' + 'x'.repeat(40)` or the allowed fake test prefix `sk-test-fake-`).

## Project Documentation and Architecture

- **Specification**: Complete requirements and architectural constraints are detailed in [SPEC.md](SPEC.md).
- **Provider Findings**: Verified third-party provider capabilities, endpoint limits, and terms are documented in [docs/provider-findings.md](docs/provider-findings.md).
- **Adding a Provider**: To add a new AI model provider, refer to [SPEC.md §13.6](SPEC.md#136-adding-a-provider-later-phase-2-not-in-the-mvp).

## Development Commands

Ensure you have Node.js installed according to the version pinned in `.nvmrc`.

```bash
# Install dependencies cleanly
npm ci

# Start the local development server (note: runs without CSP)
npm run dev

# Run unit and integration tests
npm test

# Run end-to-end tests (requires Playwright Chromium)
npm run e2e

# Run secret scanner across source files
npm run secret-scan

# Verify dependencies with install scripts against allowlist
npm run check:install-scripts

# Build standard production web app bundle
npm run build

# Build standalone self-contained single-file HTML bundle
npm run build:single
```

## Supply-chain safety

To defend against supply-chain attacks (such as lifecycle script worms that steal developer credentials during installation):

- **Scripts disabled by default**: The project `.npmrc` sets `ignore-scripts=true`. Install-time lifecycle scripts (`preinstall`, `postinstall`) do not run automatically. Explicit scripts defined in `package.json` (`npm run`, `npm test`, etc.) continue to run normally.
- **Clean installs**: Always run `npm ci`, not `npm install`, for a clean install from `package-lock.json`.
- **Install-script check**: Run `npm run check:install-scripts` (implemented in `scripts/check-install-scripts.mjs`) to verify that no dependencies outside our strictly vetted allowlist have install scripts.
- **14-day rule for new dependency versions**: Dependency updates must be published for at least 14 days before being adopted. While newer npm versions (npm 11.10.0 and later) support the automated `min-release-age` configuration, on npm 10 this cooldown period is enforced manually during dependency review.

## Commit and Code Conventions

This project strictly follows Conventional Commits:

- **Format**: `<type>(<scope>): <short imperative summary>`
  - Types: `feat`, `fix`, `test`, `build`, `ci`, `docs`, `chore`, `refactor`
  - Examples:
    - `feat(settings): add sixth tab About with package version and privacy summary`
    - `test(e2e): add smoke and single-file e2e specs`
    - `build(singlefile): configure single-file build with inlined assets and CSP`
    - `ci: update CI workflow with single-file build and e2e`
- **Granular commits**: Make small, focused commits. Never mix production code edits and test edits in the same commit.
- **Clean diffs**: Keep diffs tidy and ensure files end with a single newline (no trailing whitespace or extraneous blank lines).
- **Documentation integrity**: Preserve existing comments and docstrings.
- **No Console Logging**: Production code in `src/` must not contain `console.*` statements.

## Verifying a subpath deployment

To verify that the built application runs under a repository subpath (such as GitHub Pages or a custom subdirectory) with relative asset loading and hash routing: run npm run build; create a temporary directory and symlink dist into it as RefractBio (TMP_DIR=$(mktemp -d); ln -s "$(pwd)/dist" "$TMP_DIR/RefractBio"); serve it (python3 -m http.server 8080 --directory "$TMP_DIR"); open http://localhost:8080/RefractBio/ and http://localhost:8080/RefractBio/#/help. Also check that /RefractBio (no trailing slash) redirects to /RefractBio/ on the real host, because the build uses relative asset paths.


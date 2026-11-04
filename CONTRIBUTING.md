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
- **GitHub Actions are pinned to commit SHAs**: every `uses:` line in `.github/workflows` names a full 40-character commit SHA with the version in a trailing comment. When updating an action, take the newest release that is at least 14 days old, is not a pre-release, and runs on Node 24, look up its commit SHA, and use the same SHA in every workflow that uses the action.

## Workflows and releases

- **CI** (`.github/workflows/ci.yml`) runs on every push and pull request to `main`: install, lint, type check, unit tests, secret scan, both builds and the end-to-end tests.
- **Deploy** (`.github/workflows/deploy.yml`) publishes the hosted build to GitHub Pages after CI succeeds for a push to `main`. It builds the exact commit CI tested. A manual run from the Actions tab skips the CI gate, so use it deliberately.
- **Release** (`.github/workflows/release.yml`) runs when a tag starting with `v` is pushed. The tag must equal `v` plus the version in `package.json`, and the tagged commit must be on `main`. It repeats the checks, then attaches the single-file build and its SHA-256 checksum to a GitHub Release. Only maintainers create tags.

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

The official hosted copy (https://refractbio.revanth7667.com/) is served from the root of its own subdomain, but the build uses relative asset paths and hash routing, so it must keep working under a repository subpath and from disk. To verify that the built application runs under a subpath (such as a GitHub Pages project site or a custom subdirectory): run npm run build; create a temporary directory and symlink dist into it as RefractBio (TMP_DIR=$(mktemp -d); ln -s "$(pwd)/dist" "$TMP_DIR/RefractBio"); serve it (python3 -m http.server 8080 --directory "$TMP_DIR"); open http://localhost:8080/RefractBio/ and http://localhost:8080/RefractBio/#/help. On a host that serves the app under a subpath, also check that /RefractBio (no trailing slash) redirects to /RefractBio/ on the real host, because the build uses relative asset paths. The official host does not need that check.
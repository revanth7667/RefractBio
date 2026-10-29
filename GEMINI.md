# Project instructions

This project is built from `SPEC.md` (version 3.0). Read **§0 (Instructions for the implementing agent)**, then §1–§5 and §8, then **only the sections the current milestone names** in §20. Do not try to hold the whole spec in context.

## Scope in one paragraph
A client-side web app (Vite + React + TypeScript, no backend) that drafts five outputs (Resume, Cover Letter, LinkedIn message, Email, Application answers) from one free-form Master Info file, using the user's own API key for **Anthropic or Gemini only**. No other providers, no proxies, no chat window, no Master Info parser or linter.

## Non-negotiable rules
- Work on **one milestone at a time**. When it is done, run `npm run lint`, `npm run typecheck` and `npm test`, summarize what changed, list anything that needs the maintainer to check (real key, real print dialog, other browsers) as "ready for maintainer check", and **stop for review**. Do not start the next milestone until told to.
- Do not add features, providers, dependencies, storage layers, parsers, linters, analytics, or fallbacks that SPEC.md does not list. Propose them in your summary instead.
- Never guess third-party API details (headers, endpoints, payload fields, stream events, model IDs, limits, terms). Look them up in the provider's **official documentation**, record the URL and date in `docs/provider-findings.md`, and keep each value in the file SPEC.md §4 names. If you cannot verify it, mark it `UNVERIFIED` and say so.
- **Never read, request, write, log, or commit API keys or any secret.** Do not open `.env` files. Do not type a key into any browser or tool on the maintainer's behalf. Real-key steps (Milestone 1 spike runs, "maintainer-verified" criteria) are done by the maintainer. Tests use the fake key `sk-test-fake-0000`.
- Use **fake data only** (invented names, `@example.com` emails, `555-01xx` phones). Never commit real resumes, real Master Info files, real job postings or questions.
- Never hardcode the app name, storage prefix, template marker token, or gaps delimiter. They live in `src/config.ts`.
- Test files must never contain a literal key-shaped string. Build such strings at runtime (for example `'sk-' + 'x'.repeat(40)`), as SPEC §19.3 and §22.2 require.
- No `console.*` in `src/providers/**` or `src/storage/**`.
- `localStorage` is touched only by `src/storage/`. Only four keys are ever written: Master Info, instructions, API keys (only if "remember" is on), settings.
- The Master Info is free-form text. The only code that looks at it is the four small helpers in SPEC §10.3.
- If SPEC.md contradicts itself or contradicts what you observe from a real provider, stop and report it instead of choosing silently.
- Make small commits with clear messages.

## Commands
`npm run dev` · `npm run lint` · `npm run typecheck` · `npm test` · `npm run secret-scan` · `npm run build` · `npm run build:single` · `npm run e2e`
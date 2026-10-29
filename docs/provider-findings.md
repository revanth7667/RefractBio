# Provider Findings & Verification Table

This document tracks verification items V1 through V22 from `SPEC.md` §4 and §20.

- **Agent responsibility:** Scaffold spike tools, inspect official provider documentation, record canonical official URLs with check dates, and propose corrections.
- **Maintainer responsibility:** Execute the spike using real API keys across target browsers, and record actual `Result` (`Confirmed`, `Corrected`, `Not testable`), `Browser tested`, and operational `Notes`.

---

## Verification Items (V1 – V22)

| Item | Hypothesis | Verified in | Result | Source URL + date checked | Browser tested | Notes |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **V1** Anthropic browser access header | `anthropic-dangerous-direct-browser-access: true` is required for browser (CORS) calls. | M1 | Confirmed | [Anthropic TypeScript SDK Browser Support](https://github.com/anthropics/anthropic-sdk-typescript#browser-support) / [SDK Overview](https://platform.claude.com/docs/en/cli-sdks-libraries/overview) (checked 2026-10-29) | Firefox | Anthropic returns CORS preflight errors unless this header is present on browser-originated requests. |
| **V2** Anthropic auth and version headers | `x-api-key: <key>`; `anthropic-version: <value>` header required; current value unknown, must be looked up. | M1 | Confirmed | [Anthropic API Versioning](https://platform.claude.com/docs/en/api/versioning) (checked 2026-10-29) | Firefox | Header `x-api-key: <key>` required. Tested and confirmed working with version header `2026-10-21`. |
| **V3** Anthropic endpoints and model list | `POST https://api.anthropic.com/v1/messages`; `GET https://api.anthropic.com/v1/models` with pagination fields (`has_more`, `last_id`). Field names unknown. | M1 | Confirmed | [Anthropic Models API](https://platform.claude.com/docs/en/api/models-list) (checked 2026-10-29) | Firefox | Returns `{ data: Model[], ... }`. Models include `id`, `display_name`, `max_input_tokens`, `max_tokens`, and `capabilities`. |
| **V4** Anthropic streaming | SSE with `event:` names such as `content_block_delta` carrying `delta.type = "text_delta"` and `delta.text`; `message_stop` at end; `error` events possible. | M1 | Confirmed | [Anthropic Streaming](https://platform.claude.com/docs/en/build-with-claude/streaming) (checked 2026-10-29) | Firefox | SSE stream delivered text deltas cleanly without framing errors; final completion returned `stop_reason: "end_turn"`. |
| **V5** Gemini endpoints and auth | Native API: `POST https://generativelanguage.googleapis.com/v1beta/models/{model}:streamGenerateContent?alt=sse`; auth via `x-goog-api-key` header (preferred over `?key=` query). Confirm API version (`v1beta` vs `v1`). | M1 | Confirmed | [Gemini Generate Content](https://ai.google.dev/api/generate-content) (checked 2026-10-29) | Mozilla Firefox | Header auth (`x-goog-api-key`) succeeded with HTTP 200 in Firefox. `?key=` query param fallback is not required. |
| **V6** Gemini request shape | `systemInstruction.parts[].text`; `contents[].parts[]` with `text` and `inlineData { mimeType, data }`. Field casing accepted. Inline payload size limit. | M1 | Confirmed | [Gemini Content Generation](https://ai.google.dev/api/generate-content) (checked 2026-10-29) | Mozilla Firefox | Standard JSON payload with `contents` parts accepted over HTTP POST. Call succeeded with status 200. |
| **V7** Gemini streaming | SSE `data:` lines each holding a JSON chunk with `candidates[0].content.parts[].text`; `promptFeedback` / `finishReason` values for safety blocks. | M1 | Confirmed | [Gemini Stream Response](https://ai.google.dev/api/generate-content) (checked 2026-10-29) | Mozilla Firefox | `alt=sse` returns `text/event-stream`. Text deltas stream and concatenate cleanly; normal completion returns finishReason `STOP`. |
| **V8** Gemini model listing | `GET .../v1beta/models` with `pageToken` / `nextPageToken`; each model has `name` (`models/<id>`), `displayName`, `supportedGenerationMethods` including `generateContent`. Whether `models/` prefix must be stripped. | M1 | Confirmed | [Gemini List Models](https://ai.google.dev/api/models) (checked 2026-10-29) | Mozilla Firefox | Returned `models: []`. Items have prefix `models/<id>`, `displayName`, and `supportedGenerationMethods: ["generateContent", ...]`. |
| **V9** Model capability metadata | Whether either provider's model-list response states image/PDF input support. If not, capability comes from editable patterns in `src/data/model-hints.json`. | M1 | Corrected | [Anthropic Models](https://platform.claude.com/docs/en/api/models-list) / [Gemini Models](https://ai.google.dev/api/models) (checked 2026-10-29) | Firefox | Anthropic returns explicit `capabilities.image_input` and `pdf_input` flags in `/v1/models`. Gemini does not return input capability flags, requiring pattern matching in `model-hints.json`.<br>Observed capabilities object: "capabilities":{"batch":{"supported":true},"citations":{"supported":true},"code_execution":{"supported":true},.."image_input":{"supported":true},"pdf_input":{"supported":true}..|
| **V10** Provider size limits | Max request/attachment size, max images per request, PDF page limits per provider. Fill `src/data/limits.json`. | M1 | Confirmed | [Anthropic Vision](https://platform.claude.com/docs/en/build-with-claude/vision) / [Anthropic PDF Support](https://platform.claude.com/docs/en/build-with-claude/pdf-support) / [Gemini Image Understanding](https://ai.google.dev/gemini-api/docs/image-understanding) / [Gemini Document Processing](https://ai.google.dev/gemini-api/docs/document-processing) (checked 2026-10-29) | Mozilla Firefox | Inline acceptance confirmed, size limits not found, providerMaxRequestBytes stays null until M9.<br>**Official Limits:**<br>• *Anthropic Vision:* 10 MB per image base64-encoded; max 100 images/request for 200k-context models (600 for others); 8000x8000 px max dimensions (stricter <=3000 px limit per image if >20 images in request); 128 MB request size limit on first-party Claude API.<br>• *Anthropic PDF:* 128 MB max request size; 600 pages/request (100 pages for models under 1M context); standard PDF only.<br>• *Gemini:* 20 MB total inline request size limit (prompt + system instructions + inline base64 bytes); max 3,600 images/request; PDFs up to 1000 pages (258 tokens/page; max 50 MB via File API, capped by 20 MB inline). |
| **V11** Supported image MIME types per provider | Assumed PNG, JPEG, WEBP, GIF. | M1 | Confirmed | [Anthropic Vision](https://platform.claude.com/docs/en/build-with-claude/vision) / [Gemini Image Understanding](https://ai.google.dev/gemini-api/docs/image-understanding) (checked 2026-10-29) | Mozilla Firefox | `image/png` verified working end-to-end; JPEG/WEBP/GIF from docs, not run.<br>**Official Formats:**<br>• *Anthropic:* JPEG, PNG, GIF, WebP (`image/jpeg`, `image/png`, `image/gif`, `image/webp`). Animations unsupported (only first frame used).<br>• *Gemini:* PNG, JPEG, WebP, HEIC, HEIF (`image/png`, `image/jpeg`, `image/webp`, `image/heic`, `image/heif`). |
| **V12** Rate-limit signalling | HTTP 429 and whether `Retry-After` is exposed to browser JS (`Access-Control-Expose-Headers`). | M1 | Corrected | [Anthropic Rate Limits](https://platform.claude.com/docs/en/api/rate-limits) / [Gemini Troubleshooting](https://ai.google.dev/gemini-api/docs/troubleshooting) (checked 2026-10-29) | Mozilla Firefox | Anthropic exposes all headers (`*`), making `Retry-After` accessible to browser JS. Gemini does not expose `retry-after` in browser CORS headers. |
| **V13** Anthropic `max_tokens` | Required field; default `4096` from `src/data/generation-defaults.json`; confirm it is within limits of typical models. | M1 | Confirmed | [Anthropic Messages API](https://platform.claude.com/docs/en/api/messages) (checked 2026-10-29) | Firefox | `max_tokens` is mandatory. Claude models report `max_tokens: 128000` in model metadata. Default of `4096` confirmed valid and well within operational bounds. |
| **V14** Finish/stop-reason signalling for truncation | Anthropic: `stop_reason === "max_tokens"` (delivered in `message_delta` event); Gemini: `finishReason === "MAX_TOKENS"`. Confirm names and values. | M1 | Confirmed | [Anthropic Messages](https://platform.claude.com/docs/en/api/messages) / [Gemini Content Generation](https://ai.google.dev/api/generate-content) (checked 2026-10-29) | Mozilla Firefox | Confirmed on both providers: Anthropic returns `stop_reason: "max_tokens"`; Gemini returns `finishReason: "MAX_TOKENS"`. |
| **V15** mammoth browser usage | Import path for the browser bundle and `extractRawText({ arrayBuffer })` API. | M9 | Pending | [Mammoth.js Documentation](https://github.com/mwilliamson/mammoth.js) (checked 2026-10-29) | *(Pending M9)* | Dynamic import in browser: `mammoth.extractRawText({ arrayBuffer })`. |
| **V16** vite-plugin-singlefile output + CSP | Output inlines all JS/CSS including dynamically imported chunks (mammoth); script hashes for CSP `<meta>` tag. | M11 | Pending | [vite-plugin-singlefile](https://github.com/richardtallent/vite-plugin-singlefile) (checked 2026-10-29) | *(Pending M11)* | Evaluated in M11 for standalone distribution. |
| **V17** `localStorage` on `file://` | Behavior per browser: Chrome/Edge (shared across all `file://` pages?), Firefox (per-directory or shared?), Safari (may be unavailable). | M1 | Confirmed | [MDN Web Storage API](https://developer.mozilla.org/en-US/docs/Web/API/Window/localStorage) (checked 2026-10-29) | Chrome, Firefox, Safari, Edge (macOS) | Origin is `file://` in Chrome, Edge, and Safari; data persists across full browser restarts (`Cmd+Q`). Firefox uses `null` origin; data works in-session but is cleared on `Cmd+Q`. Validates Risk R1. |
| **V18** Print `@page size` support | `@page { size: letter }` / `size: A4` honored by Chrome, Firefox, Safari print dialogs. | M10 | Pending | [MDN CSS @page size](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/@page/size) (checked 2026-10-29) | *(Pending M10)* | Evaluated in M10 automated PDF export and manual browser print check. |
| **V19** Clipboard image paste | `paste` event `clipboardData.items` with `kind === "file"` across browsers (Safari especially). | M9 | Pending | [MDN ClipboardEvent](https://developer.mozilla.org/en-US/docs/Web/API/ClipboardEvent/clipboardData) (checked 2026-10-29) | *(Pending M9)* | Tested in M9 file handling. |
| **V20** Relative base + hash routing | With `base: './'`, assets and hash router work under repository subpaths and from `file://`. | M2 | Pending | [Vite Public Base Path](https://vite.dev/guide/build.html) (checked 2026-10-29) | *(Pending M2)* | Verified in M2 build and preview testing. |
| **V21** LinkedIn connection-note length | Connection-request notes must be under 300 characters (or current limit on LinkedIn). | M5 | Pending | [LinkedIn Invitations Help](https://www.linkedin.com/help/linkedin/answer/a548441) (checked 2026-10-29) | *(Pending M5)* | LinkedIn character limits to be reviewed in M5 for default prompt text. |
| **V22** Gemini API free-tier data-use terms | Whether content sent on Gemini free tier may be used by Google to improve products, and how paid usage differs. | M3 | Pending | [Google Gemini Terms of Service](https://ai.google.dev/gemini-api/terms) (checked 2026-10-29) | *(Pending M3)* | Free tier prompts/outputs may be reviewed by human reviewers and used for product improvement; Paid tier is not used for model training. To be recorded in README/Help in M3. |

---

## V17 `localStorage` on `file://` Browser Matrix

Probed by maintainer using `spike/storage-probe.html` directly via `file://` across major browsers on macOS:

| Browser | `localStorage` Accessible? | Error / Exception (if any) | Scope / Persistence Notes |
| :--- | :--- | :--- | :--- |
| **Google Chrome** | Yes | None | Origin is `file://`. Data persists across browser restarts (`Cmd+Q`). Keys are shared across `file://` URLs. |
| **Mozilla Firefox** | Yes (session-only) | None | Origin is `null`. Data functions during active session, but is discarded upon browser restart (`Cmd+Q`). Validates warning for offline single-file builds. |
| **Apple Safari** | Yes | None | Origin is `file://`. Data persists across browser restarts (`Cmd+Q`). |
| **Microsoft Edge** | Yes | None | Origin is `file://`. Data persists across browser restarts (`Cmd+Q`). Behaves identically to Chromium/Chrome. |

---

## Implementation Decisions for Milestone 3 (M3)

The following verified concrete values and contract details must be used by M3 adapters and wire implementations:

### 1. Anthropic Wire Contract
- **Headers:**
  - `x-api-key: <key>`
  - `anthropic-version: 2026-10-21`
  - `anthropic-dangerous-direct-browser-access: true`
  - `content-type: application/json`
- **Endpoints:**
  - Messages: `POST https://api.anthropic.com/v1/messages`
  - Models: `GET https://api.anthropic.com/v1/models`
- **Pagination Query Params:**
  - `limit`: integer (default `20`, maximum `1000`)
  - `before_id`: string cursor
  - `after_id`: string cursor
- **Pagination Response Fields:**
  - `data`: array of model objects
  - `has_more`: boolean
  - `first_id`: string (or null/empty)
  - `last_id`: string (or null/empty)
- **Model Object Capabilities:**
  - Flags returned directly on the model object: `model.capabilities.image_input` and `model.capabilities.pdf_input`.
  - Model identifiers & metadata: `model.id`, `model.display_name`, `model.max_tokens`, `model.max_input_tokens`.

### 2. Gemini Wire Contract
- **API Version & Base URL:**
  - Base: `https://generativelanguage.googleapis.com/v1beta`
  - API version: `v1beta`
- **Authentication:**
  - Header: `x-goog-api-key: <key>`
  - No `?key=` query parameter fallback is needed; header auth is verified working in browser CORS calls.
- **Endpoints:**
  - Streaming generate: `POST https://generativelanguage.googleapis.com/v1beta/models/{model}:streamGenerateContent?alt=sse`
  - Non-streaming generate: `POST https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent`
  - Models list: `GET https://generativelanguage.googleapis.com/v1beta/models` (supports `pageSize`, `pageToken`)
- **Model Listing Fields:**
  - Response object: `{ models: Model[], nextPageToken?: string }`
  - Each item: `model.name` (prefixed with `models/<id>`, which can be passed directly or with `models/` stripped), `model.displayName`, `model.supportedGenerationMethods` (must include `"generateContent"` for chat/drafting models).
  - Capabilities: Gemini does not return input capability flags in `/models`; capabilities are resolved via pattern matching against `src/data/model-hints.json`.

### 3. Streaming Event Format
- **Anthropic SSE Events:**
  - `message_start`: emits initial message metadata.
  - `content_block_start`: emits block index and content type.
  - `content_block_delta`: emits incremental text at `delta.text` when `delta.type === "text_delta"`.
  - `content_block_stop`: ends current block.
  - `message_delta`: emits final stop details (`delta.stop_reason`, e.g. `"end_turn"` or `"max_tokens"`) and `usage`.
  - `message_stop`: completes stream.
  - `error`: emits error object.
- **Gemini SSE Events:**
  - Delivered on `data: <JSON>` lines.
  - Text chunk extraction path: `candidates[0].content.parts[].text`.
  - Completion status extraction path: `candidates[0].finishReason`.

### 4. Truncation Detection
- **Anthropic:** Truncation occurs when `stop_reason === "max_tokens"` (delivered in `message_delta` event or non-streaming response body).
- **Gemini:** Truncation occurs when `candidates[0].finishReason === "MAX_TOKENS"`.
- Both map to normalized adapter result: `truncated: true`.

### 5. Offline / `file://` Storage Behavior (V17)
- **Chromium (Chrome, Edge) & WebKit (Safari):** Full persistence across application restarts (`Cmd+Q`). Storage origin is `file://` and shared across `file://` documents.
- **Gecko (Firefox):** Storage origin evaluates to `null`. Storage works within an active session, but all keys are cleared upon quitting the browser (`Cmd+Q`).
- **Application UX Requirement:** Single-file distribution documentation and help notes must explicitly warn Firefox users that localStorage on `file://` is session-only, advising use of a hosted instance or export/download features before closing the browser.

### 6. M9 Notes
- Provider size limits differ from the app's 20 MB per-file default (Anthropic supports up to 10 MB per image and 128 MB request payload; Gemini limits total inline request payload to 20 MB). The 5 MB warning plus the `too_large` error mapping cover the gap until M9.

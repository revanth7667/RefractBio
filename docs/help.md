# RefractBio Help & Documentation

RefractBio is an open-source, client-side web application that drafts resumes, cover letters, outreach messages, and application answers exclusively from your Master Info using your own AI provider API key.

---

## Quick Start

1. **Fill in your Master Info**: Open Settings and write or paste your career history into the Master Info editor, or use the shipped sample as a starting point.
2. **Add job context**: Paste the job description, notes, or attach files and screenshots in the left pane.
3. **Pick outputs and generate**: Select the outputs you want and click **Send**. You can also press `Ctrl+Enter` (`Cmd+Enter` on macOS) to generate when ready.

---

## Writing a Good Master Info

Your Master Info is free-form plain text that serves as the single source of truth about your career. RefractBio instructs the model to draft documents using only facts verified in your Master Info and never invent details.

### Recommended Habits

- **Short, factual lines**: Group your experience by employer, title, dates, and concise bullet points.
- **Defensible numbers**: State metrics truthfully. Keep estimates marked with "about", "~", or "roughly"—the app preserves approximate wording and will not turn guesses into exact figures.
- **"Not me" / Gaps section**: Include a section listing skills, tools, or roles you do not have or do not want to claim. The AI is strictly instructed never to claim anything listed in a "Not me" or "Gaps" section.
- **Stories and examples**: Include short stories (situation, action, result) for projects and accomplishments. These stories provide the foundation for answering interview and application questions truthfully.

### Important Notes on File Handling

> **Important:** Regularly download a backup copy of your Master Info. Private browsing windows and browser profiles that clear site data on quit will erase local storage.

- **Backup copies**: Your Master Info is saved locally in this browser. Use the **Download** button in the Master Info panel to save a backup copy to your disk.
- **Leading BOM handling**: If your text editor saves files with a Byte Order Mark (UTF-8 BOM), RefractBio automatically detects and removes the leading BOM upon upload so your headings and text import cleanly.

---

## Application Answers

The Application Answers output drafts responses to form questions such as "Tell me about a time when…" or "Why do you want to work here?".

- **Paste questions or attach images**: Type or paste your questions into the Questions box, or attach a screenshot of the application form in the job context area.
- **Grounding in real stories**: The model answers questions using only experiences found in your Master Info.
- **"Needs your input" lines**: If a question asks for qualifications, projects, or background not found in your Master Info, the model will not fabricate an answer. Instead, it flags the question with a line starting with `Needs your input:` and notes the gap in the Gaps summary.

---

## Providers and API Keys

RefractBio connects directly from your browser to the AI provider you select. There is no intermediate server, proxy, or backend operated by this project.

### Where to Get an API Key

- **Anthropic**: Create an API key in the [Anthropic Console](https://console.anthropic.com/settings/keys).
- **Google Gemini**: Create an API key in [Google AI Studio](https://aistudio.google.com/app/apikey).

Set monthly spending limits in your provider dashboard to keep total control over costs.

### Request Authentication and URLs

RefractBio sends your API key exclusively via standard HTTP request headers (`x-api-key` for Anthropic, `x-goog-api-key` for Google Gemini). API keys are never appended to URL query parameters or exposed in browser history.

### Gemini Free-Tier Data-Use Terms

Under Google's [Gemini API Additional Terms of Service](https://ai.google.dev/gemini-api/terms) (checked 2026-11-02), prompts, inputs, and generated content on the free/unpaid tier may be reviewed by human reviewers and used to improve Google products and AI models. Paid tiers (billing enabled) do not use your data for model training. Because resumes contain sensitive personal details, consider using a Paid Tier key or Anthropic.

### Anthropic Commercial Terms

Under Anthropic's [Commercial Terms of Service](https://www.anthropic.com/legal/commercial-terms) (checked 2026-11-02), "Anthropic may not train models on Customer Content from Services", where Customer Content includes API inputs and outputs.

### API Key Storage Security

By default, API keys are held strictly in memory and are discarded when you close or reload the browser tab.

If you choose to enable "Remember my API keys on this device", keys are stored unencrypted in your browser's local storage. This convenience means anyone with access to your device, browser profile, or a malicious extension could potentially read them. You can disable the setting at any time to delete all stored keys immediately.

---

## "Why Did My Request Get Blocked?"

If an API request fails immediately:

1. **Browser Extensions**: Ad blockers, privacy shields, or script blockers may intercept direct browser-to-API network requests. Try allowing or whitelisting the page in your extension.
2. **Firewalls & VPNs**: Corporate networks, firewalls, and certain VPN configurations block direct browser requests to `api.anthropic.com` or `generativelanguage.googleapis.com`.
3. **Switch Providers**: If your current network restricts one provider, try selecting the other provider in Settings.

---

## "My Draft Was Cut Off"

When a draft ends mid-sentence, the provider reached its maximum token output limit. RefractBio flags this with an amber truncation notice above the editor. You can press **Regenerate**, shorten your instructions or job context, or choose a model configured for longer outputs.

---

## LinkedIn Variants

When drafting LinkedIn reach-out messages, RefractBio asks the model for two distinct variants:

1. `Variant 1: Connection request note`: A short note (under 200 characters) designed for invitation requests.
2. `Variant 2: Direct message`: A longer message (60–110 words) for InMail or direct messaging.

### Keeping the Variant Labels

The toolbar provides one-click copy buttons for each variant ("Copy connection note" and "Copy direct message"). These buttons require the exact label lines to remain in the draft:

```text
Variant 1: Connection request note
Variant 2: Direct message
```

If these label lines are missing or edited out, per-variant copy buttons are disabled, and only "Copy all" remains available.

### Platform Note on Connection Notes

LinkedIn connection notes are limited to 200 characters in total length. Free LinkedIn accounts can personalize only 3 invitation requests per month, whereas LinkedIn Premium accounts permit unlimited personalized connection notes.

---

## Privacy

RefractBio has no backend servers, no analytics, no tracking cookies, and no third-party telemetry scripts.

- All processing, prompt assembly, and file extraction occur locally in your browser.
- Network requests travel strictly over HTTPS to your chosen AI provider endpoint.
- Your Master Info, custom instructions, and preferences remain stored in your local browser profile.

---

## Using the Single-File Version

RefractBio can be run as a standalone, single HTML file opened directly from your local drive.

- **Storage Restrictions**: When opening an HTML file directly from disk via the `file://` protocol, some browsers restrict access to persistent local storage. If persistent storage is unavailable, an amber alert banner appears. You can still draft documents, but your Master Info and settings will not persist across browser reloads. Download a copy of your Master Info before closing the tab.
- **Content Security**: The single-file build is designed for complete local portability without requiring external network dependencies other than the direct AI provider APIs.

---

## Printing to PDF

The Resume and Cover Letter outputs include a **Print / Save as PDF** feature designed for clean, one-page or two-page printing.

In the print dialog, choose 'Save as PDF', turn off 'Headers and footers'; Chrome and Firefox use the paper size chosen in the app, Safari uses the paper size chosen in its own print dialog; margins are 1.9 cm (0.75 in) in all of them.

### How to Print

1. In the draft toolbar, select your desired paper format (**US Letter** or **A-4**).
2. Click **Print / Save as PDF**.
3. In the browser print dialog, choose 'Save as PDF', and turn off 'Headers and footers' for a clean page.

### Browser Printing Nuances

- **Chrome and Firefox**: Chrome and Firefox use the paper size chosen in the app.
- **Safari**: Safari uses the paper size chosen in its own print dialog. To select a different paper size in Safari, choose it in Safari's print dialog Paper Size menu.
- **Margins**: Margins are set to 1.9 cm (0.75 in) on all sides across all supported browsers.

---

## Troubleshooting

The table below describes common errors and recommended resolutions. Note that the **Send** button is disabled while an existing run is queued or generating.

| Error Category | Message / Symptom | How to Resolve |
|---|---|---|
| **Security Policy Blocked** | "This app's security policy blocked the request..." | The request attempted to reach an origin outside Anthropic and Google Gemini. Check your browser configuration. |
| **Network or Extension Blocked** | "The request to {host} was blocked before it reached the provider." | Disable ad/privacy extensions for this page, check your VPN/firewall, or verify your internet connection. |
| **Authentication Failed** | "The provider rejected your API key." | Open Settings → Providers, verify that the whole key was pasted correctly without missing characters, and test the connection. |
| **Model Not Found** | "The model wasn't found or isn't available to your key." | Pick another model from the picker or check the custom model ID. |
| **Request Too Large** | "The request is too large for this provider." | Remove or shrink image/PDF attachments, or shorten your Master Info and job context. |
| **Rate Limit Reached** | "Rate limit reached for {provider}." | Wait a moment for your quota window to reset, or check your rate limits in the provider console. |
| **Server Error** | "{provider} had a server problem." | The provider is experiencing an outage or temporary load spike. Click Retry in a moment. |
| **Safety Blocked** | "The provider blocked this response." | Rephrase your job context or custom instructions to avoid provider content filter triggers. |

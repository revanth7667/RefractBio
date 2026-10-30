# RefractBio Help & Documentation

RefractBio is a client-side web application that helps you draft tailored resumes, cover letters, outreach messages, and application answers from a single Master Info file using your own LLM provider API key (BYOK: Bring Your Own Key).

---

## Providers & API Keys

RefractBio communicates directly from your browser to the provider you select (Anthropic or Google Gemini). There is no intermediary backend, proxy, or server operated by the project.

### Getting an API Key

- **Anthropic:** Create an API key in the [Anthropic Console](https://console.anthropic.com/settings/keys).
- **Google Gemini:** Create an API key in [Google AI Studio](https://aistudio.google.com/app/apikey).

Set spending limits in your provider console to stay in control of your budget.

### Gemini Free-Tier Data-Use Terms (V22)

> **Important Privacy Note for Gemini Users:**
>
> Source: [Google Gemini API Additional Terms of Service](https://ai.google.dev/gemini-api/terms) (checked 2026-10-29).
>
> - **Free Tier (Unpaid Services):** When using an unpaid Gemini API key or quota, Google's terms state that human reviewers may read, annotate, and process your API inputs and outputs to help improve and train Google products, services, and machine learning models. Google explicitly instructs developers: *"Do not submit sensitive, confidential, or personal information to the Unpaid Services."*
> - **Paid Tier (Billing Enabled):** When using a paid Gemini project with billing enabled, your prompts and generated documents are **not** used to train Google's models and are **not** reviewed by human reviewers.
>
> Because resumes, job postings, and application documents contain personal, confidential, and professional details, we recommend using a **Paid Tier** key on Gemini or using **Anthropic** (which does not train on API inputs) if you require complete confidentiality for your career materials.

### API Key Security & Storage

By default, your API keys are kept strictly in browser memory (React state) and are never saved to disk or persistent storage. They disappear as soon as you close or reload the tab.

If you turn on **"Remember my API keys on this device"** in Settings → Providers, your keys are stored in this browser's `localStorage`. Anyone with access to your device, user profile, or a malicious browser extension could potentially read them. Turning the setting OFF deletes all stored keys immediately.

---

## Why Did My Request Get Blocked?

If you encounter an error during Test Connection or generation:

1. **Browser Extensions:** Ad blockers, privacy shields, or script blockers (such as uBlock Origin or Privacy Badger) may block direct browser-to-API requests. Try disabling extensions for this page.
2. **Network Firewalls & VPNs:** Corporate networks, firewalls, and VPNs sometimes block direct connections to AI provider endpoints (`api.anthropic.com` or `generativelanguage.googleapis.com`).
3. **CORS / Web Page Requests:** If direct web requests are blocked, verify that you are using a supported modern browser and check your network connection.

---

## Truncation ("My draft was cut off")

If an output stops unexpectedly, your provider reached its maximum token output limit. RefractBio flags this with a truncation notice on the tab. You can press Regenerate or select a model that supports larger output limits.

---

## Privacy Summary

RefractBio has no backend. Your Master Info, instructions, settings, job context, and API keys are processed directly on your machine. Network calls travel directly from your browser to your chosen AI provider using HTTPS.


# RefractBio

Your facts, many drafts. A private, client-side web application that drafts resumes, cover letters, outreach messages, and application answers exclusively from your Master Info using your own API key (Anthropic or Gemini).

## Providers and Privacy

RefractBio operates entirely in your browser with zero backend. API requests travel directly from your browser to the provider you choose via HTTPS.

### Gemini API Free-Tier Data Terms (V22)

> **Important Privacy Notice regarding Google Gemini Free Tier:**
>
> Official Source: [Google Gemini API Additional Terms of Service](https://ai.google.dev/gemini-api/terms) (verified 2026-10-29).
>
> - **Free / Unpaid Tier:** Under Google's terms, API inputs (prompts, Master Info, job context) and generated outputs on unpaid tiers may be read, annotated, and processed by human reviewers and used by Google to improve and train Google products, services, and machine learning models. Google warns users: *"Do not submit sensitive, confidential, or personal information to the Unpaid Services."*
> - **Paid Tier:** Prompts and generated documents on projects with billing enabled are **not** used to train Google's models and are not reviewed by humans.
>
> Because resumes and career records contain sensitive personal information, consider enabling billing for a Paid Tier key on Gemini or using Anthropic if data privacy for model training is a priority.

## Subpath Verification (V20)

To verify that the built application runs under a repository subpath (such as on GitHub Pages or custom subdirectories) with relative asset loading and hash routing:

```bash
# 1. Build the application
npm run build

# 2. Create a temporary directory and symlink dist as /RefractBio
TMP_DIR=$(mktemp -d)
ln -s "$(pwd)/dist" "$TMP_DIR/RefractBio"

# 3. Serve the directory with Python HTTP server
python3 -m http.server 8080 --directory "$TMP_DIR"

# 4. Open in browser to test:
# http://localhost:8080/RefractBio/
# http://localhost:8080/RefractBio/#/help
```

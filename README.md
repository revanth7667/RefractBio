# RefractBio

Your facts, many drafts. A private, client-side web application that drafts resumes, cover letters, outreach messages, and application answers exclusively from your Master Info using your own API key (Anthropic or Gemini).

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

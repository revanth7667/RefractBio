// Fallback fixtures for file:// or if fetch cannot load local fixtures
const FALLBACK_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

const FALLBACK_PDF_BASE64 =
  'JVBERi0xLjQKMSAwIG9iajw8L1R5cGUvQ2F0YWxvZy9QYWdlcyAyIDAgUj4+ZW5kb2JqCjIgMCBvYmo8PC9UeXBlL1BhZ2VzL0tpZHNbMyAwIFJdL0NvdW50IDE+PmVuZG9iagozIDAgb2JqPDwvVHlwZS9QYWdlL1BhcmVudCAyIDAgUi9NZWRpYUJveFswIDAgNjEyIDc5Ml0vQ29udGVudHMgNCAwIFIvUmVzb3VyY2VzPDwvRm9udDw8L0YxIDUgMCBSPj4+Pj4+ZW5kb2JqCjQgMCBvYmo8PC9MZW5ndGggNTU+PnN0cmVhbQpCVAovRjEgMTIgVGYKMTAwIDcwMCBUZAooRmFrZSBKb2IgUG9zdGluZyAtIEV4YW1wbGUgQ29ycCkgVGoKRVQgCmVuZHN0cmVhbQplbmRvYmoKNSAwIG9iajw8L1R5cGUvRm9udC9TdWJ0eXBlL1R5cGUxL0Jhc2VGb250L0hlbHZldGljYT4+ZW5kb2JqCnhyZWYKMCA2CjAwMDAwMDAwMDAgNjU1MzUgZiAKMDAwMDAwMDAwOSAwMDAwMCBuIAowMDAwMDAwMDU4IDAwMDAwIG4gCjAwMDAwMDAxMTUgMDAwMDAgbiAKMDAwMDAwMDI0NCAwMDAwMCBuIAowMDAwMDAwMzUwIDAwMDAwIG4gCnRyYWlsZXIKPDwvU2l6ZSA2L1Jvb3QgMSAwIFI+PgpzdGFydHhyZWYKNDI2CiUlRU9GCg==';

// DOM elements
const providerSelect = document.getElementById('provider') as HTMLSelectElement;
const apiKeyInput = document.getElementById('apiKey') as HTMLInputElement;
const modelIdInput = document.getElementById('modelId') as HTMLInputElement;

const anthropicOptions = document.getElementById('anthropic-options') as HTMLDivElement;
const anthropicBrowserHeader = document.getElementById('anthropic-browser-header') as HTMLInputElement;
const anthropicVersion = document.getElementById('anthropic-version') as HTMLInputElement;

const geminiOptions = document.getElementById('gemini-options') as HTMLDivElement;
const geminiAuthMode = document.getElementById('gemini-auth-mode') as HTMLSelectElement;
const geminiApiVersion = document.getElementById('gemini-api-version') as HTMLInputElement;

const outStatus = document.getElementById('out-status') as HTMLSpanElement;
const outFinishReason = document.getElementById('out-finish-reason') as HTMLSpanElement;
const corsNotice = document.getElementById('cors-notice') as HTMLDivElement;
const corsMessage = document.getElementById('cors-message') as HTMLSpanElement;
const outHeaders = document.getElementById('out-headers') as HTMLPreElement;
const outBody = document.getElementById('out-body') as HTMLPreElement;

// Buttons
const btnListModels = document.getElementById('btn-list-models') as HTMLButtonElement;
const btnNonStreaming = document.getElementById('btn-non-streaming') as HTMLButtonElement;
const btnStreaming = document.getElementById('btn-streaming') as HTMLButtonElement;
const btnImage = document.getElementById('btn-image') as HTMLButtonElement;
const btnPdf = document.getElementById('btn-pdf') as HTMLButtonElement;
const btnTruncation = document.getElementById('btn-truncation') as HTMLButtonElement;
const btnClear = document.getElementById('btn-clear') as HTMLButtonElement;

const allButtons = [btnListModels, btnNonStreaming, btnStreaming, btnImage, btnPdf, btnTruncation];

// UI event handlers
providerSelect.addEventListener('change', () => {
  const isAnthropic = providerSelect.value === 'anthropic';
  anthropicOptions.style.display = isAnthropic ? 'flex' : 'none';
  geminiOptions.style.display = isAnthropic ? 'none' : 'flex';

  if (isAnthropic) {
    modelIdInput.value = 'claude-3-5-sonnet-20241022';
  } else {
    modelIdInput.value = 'gemini-1.5-flash';
  }
});

btnClear.addEventListener('click', () => {
  resetOutput();
});

function resetOutput() {
  outStatus.innerHTML = '<span class="badge badge-info">Idle</span>';
  outFinishReason.textContent = '-';
  corsNotice.style.display = 'none';
  corsMessage.textContent = '';
  outHeaders.textContent = '(no response yet)';
  outBody.textContent = '(no response yet)';
}

function setBusy(busy: boolean, label = '') {
  for (const btn of allButtons) {
    btn.disabled = busy;
  }
  if (busy) {
    outStatus.innerHTML = `<span class="badge badge-warn">Running: ${label}...</span>`;
    corsNotice.style.display = 'none';
    outFinishReason.textContent = '-';
    outHeaders.textContent = 'Awaiting response...';
    outBody.textContent = 'Awaiting response...';
  }
}

function displayHeaders(headers: Headers) {
  const entries: string[] = [];
  headers.forEach((val, key) => {
    entries.push(`${key}: ${val}`);
  });
  if (entries.length === 0) {
    outHeaders.textContent = '(no headers exposed to JavaScript)';
  } else {
    outHeaders.textContent = entries.join('\n');
  }
}

function formatStatus(res: Response) {
  const badgeClass = res.ok ? 'badge-ok' : 'badge-err';
  outStatus.innerHTML = `<span class="badge ${badgeClass}">${res.status} ${res.statusText || ''}</span>`;
}

function handleFetchError(err: unknown) {
  if (err instanceof TypeError) {
    corsNotice.style.display = 'block';
    corsMessage.textContent = `${err.name}: ${err.message} (Likely CORS preflight rejection, blocked header, or network disconnect)`;
    outStatus.innerHTML = `<span class="badge badge-err">TypeError / Network failure</span>`;
  } else {
    outStatus.innerHTML = `<span class="badge badge-err">${String(err)}</span>`;
  }
  outHeaders.textContent = '(no response received)';
  outBody.textContent = String(err);
}

async function loadFixtureBase64(url: string, fallback: string): Promise<string> {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const dataUrl = reader.result as string;
        const base64 = dataUrl.split(',')[1] || '';
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch {
    return fallback;
  }
}

// -------------------------------------------------------------
// Request Builders
// -------------------------------------------------------------

interface PreparedRequest {
  url: string;
  options: RequestInit;
}

function prepareListModels(): PreparedRequest {
  const provider = providerSelect.value;
  const key = apiKeyInput.value.trim();

  if (provider === 'anthropic') {
    const headers: Record<string, string> = {
      'x-api-key': key,
      'anthropic-version': anthropicVersion.value.trim() || '2023-06-01',
    };
    if (anthropicBrowserHeader.checked) {
      headers['anthropic-dangerous-direct-browser-access'] = 'true';
    }
    return {
      url: 'https://api.anthropic.com/v1/models',
      options: { method: 'GET', headers },
    };
  } else {
    const ver = geminiApiVersion.value.trim() || 'v1beta';
    const isHeaderAuth = geminiAuthMode.value === 'header';
    let url = `https://generativelanguage.googleapis.com/${ver}/models`;
    const headers: Record<string, string> = {};

    if (isHeaderAuth) {
      headers['x-goog-api-key'] = key;
    } else {
      url += `?key=${encodeURIComponent(key)}`;
    }

    return {
      url,
      options: { method: 'GET', headers },
    };
  }
}

function prepareNonStreaming(promptText: string): PreparedRequest {
  const provider = providerSelect.value;
  const key = apiKeyInput.value.trim();
  const model = modelIdInput.value.trim();

  if (provider === 'anthropic') {
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      'x-api-key': key,
      'anthropic-version': anthropicVersion.value.trim() || '2023-06-01',
    };
    if (anthropicBrowserHeader.checked) {
      headers['anthropic-dangerous-direct-browser-access'] = 'true';
    }
    const body = {
      model,
      max_tokens: 1024,
      messages: [{ role: 'user', content: promptText }],
    };
    return {
      url: 'https://api.anthropic.com/v1/messages',
      options: { method: 'POST', headers, body: JSON.stringify(body) },
    };
  } else {
    const ver = geminiApiVersion.value.trim() || 'v1beta';
    const isHeaderAuth = geminiAuthMode.value === 'header';
    let url = `https://generativelanguage.googleapis.com/${ver}/models/${encodeURIComponent(model)}:generateContent`;
    const headers: Record<string, string> = {
      'content-type': 'application/json',
    };

    if (isHeaderAuth) {
      headers['x-goog-api-key'] = key;
    } else {
      url += `?key=${encodeURIComponent(key)}`;
    }

    const body = {
      contents: [{ role: 'user', parts: [{ text: promptText }] }],
    };

    return {
      url,
      options: { method: 'POST', headers, body: JSON.stringify(body) },
    };
  }
}

function prepareStreaming(promptText: string): PreparedRequest {
  const provider = providerSelect.value;
  const key = apiKeyInput.value.trim();
  const model = modelIdInput.value.trim();

  if (provider === 'anthropic') {
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      'x-api-key': key,
      'anthropic-version': anthropicVersion.value.trim() || '2023-06-01',
    };
    if (anthropicBrowserHeader.checked) {
      headers['anthropic-dangerous-direct-browser-access'] = 'true';
    }
    const body = {
      model,
      max_tokens: 1024,
      stream: true,
      messages: [{ role: 'user', content: promptText }],
    };
    return {
      url: 'https://api.anthropic.com/v1/messages',
      options: { method: 'POST', headers, body: JSON.stringify(body) },
    };
  } else {
    const ver = geminiApiVersion.value.trim() || 'v1beta';
    const isHeaderAuth = geminiAuthMode.value === 'header';
    let url = `https://generativelanguage.googleapis.com/${ver}/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`;
    const headers: Record<string, string> = {
      'content-type': 'application/json',
    };

    if (isHeaderAuth) {
      headers['x-goog-api-key'] = key;
    } else {
      url += `&key=${encodeURIComponent(key)}`;
    }

    const body = {
      contents: [{ role: 'user', parts: [{ text: promptText }] }],
    };

    return {
      url,
      options: { method: 'POST', headers, body: JSON.stringify(body) },
    };
  }
}

function prepareTruncationCheck(): PreparedRequest {
  const provider = providerSelect.value;
  const key = apiKeyInput.value.trim();
  const model = modelIdInput.value.trim();
  const promptText = 'Write a 200 word detailed essay explaining why the sky is blue and ocean is deep.';

  if (provider === 'anthropic') {
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      'x-api-key': key,
      'anthropic-version': anthropicVersion.value.trim() || '2023-06-01',
    };
    if (anthropicBrowserHeader.checked) {
      headers['anthropic-dangerous-direct-browser-access'] = 'true';
    }
    // Limit to 5 tokens to force truncation finish reason
    const body = {
      model,
      max_tokens: 5,
      messages: [{ role: 'user', content: promptText }],
    };
    return {
      url: 'https://api.anthropic.com/v1/messages',
      options: { method: 'POST', headers, body: JSON.stringify(body) },
    };
  } else {
    const ver = geminiApiVersion.value.trim() || 'v1beta';
    const isHeaderAuth = geminiAuthMode.value === 'header';
    let url = `https://generativelanguage.googleapis.com/${ver}/models/${encodeURIComponent(model)}:generateContent`;
    const headers: Record<string, string> = {
      'content-type': 'application/json',
    };

    if (isHeaderAuth) {
      headers['x-goog-api-key'] = key;
    } else {
      url += `?key=${encodeURIComponent(key)}`;
    }

    // maxOutputTokens: 5
    const body = {
      contents: [{ role: 'user', parts: [{ text: promptText }] }],
      generationConfig: {
        maxOutputTokens: 5,
      },
    };

    return {
      url,
      options: { method: 'POST', headers, body: JSON.stringify(body) },
    };
  }
}

function prepareImageCall(base64: string): PreparedRequest {
  const provider = providerSelect.value;
  const key = apiKeyInput.value.trim();
  const model = modelIdInput.value.trim();

  if (provider === 'anthropic') {
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      'x-api-key': key,
      'anthropic-version': anthropicVersion.value.trim() || '2023-06-01',
    };
    if (anthropicBrowserHeader.checked) {
      headers['anthropic-dangerous-direct-browser-access'] = 'true';
    }
    const body = {
      model,
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: 'image/png',
                data: base64,
              },
            },
            {
              type: 'text',
              text: 'Describe what you see in this image in one concise sentence.',
            },
          ],
        },
      ],
    };
    return {
      url: 'https://api.anthropic.com/v1/messages',
      options: { method: 'POST', headers, body: JSON.stringify(body) },
    };
  } else {
    const ver = geminiApiVersion.value.trim() || 'v1beta';
    const isHeaderAuth = geminiAuthMode.value === 'header';
    let url = `https://generativelanguage.googleapis.com/${ver}/models/${encodeURIComponent(model)}:generateContent`;
    const headers: Record<string, string> = {
      'content-type': 'application/json',
    };

    if (isHeaderAuth) {
      headers['x-goog-api-key'] = key;
    } else {
      url += `?key=${encodeURIComponent(key)}`;
    }

    const body = {
      contents: [
        {
          role: 'user',
          parts: [
            {
              inlineData: {
                mimeType: 'image/png',
                data: base64,
              },
            },
            {
              text: 'Describe what you see in this image in one concise sentence.',
            },
          ],
        },
      ],
    };

    return {
      url,
      options: { method: 'POST', headers, body: JSON.stringify(body) },
    };
  }
}

function preparePdfCall(base64: string): PreparedRequest {
  const provider = providerSelect.value;
  const key = apiKeyInput.value.trim();
  const model = modelIdInput.value.trim();

  if (provider === 'anthropic') {
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      'x-api-key': key,
      'anthropic-version': anthropicVersion.value.trim() || '2023-06-01',
    };
    if (anthropicBrowserHeader.checked) {
      headers['anthropic-dangerous-direct-browser-access'] = 'true';
    }
    const body = {
      model,
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'document',
              source: {
                type: 'base64',
                media_type: 'application/pdf',
                data: base64,
              },
            },
            {
              type: 'text',
              text: 'What text or title do you see in this PDF document?',
            },
          ],
        },
      ],
    };
    return {
      url: 'https://api.anthropic.com/v1/messages',
      options: { method: 'POST', headers, body: JSON.stringify(body) },
    };
  } else {
    const ver = geminiApiVersion.value.trim() || 'v1beta';
    const isHeaderAuth = geminiAuthMode.value === 'header';
    let url = `https://generativelanguage.googleapis.com/${ver}/models/${encodeURIComponent(model)}:generateContent`;
    const headers: Record<string, string> = {
      'content-type': 'application/json',
    };

    if (isHeaderAuth) {
      headers['x-goog-api-key'] = key;
    } else {
      url += `?key=${encodeURIComponent(key)}`;
    }

    const body = {
      contents: [
        {
          role: 'user',
          parts: [
            {
              inlineData: {
                mimeType: 'application/pdf',
                data: base64,
              },
            },
            {
              text: 'What text or title do you see in this PDF document?',
            },
          ],
        },
      ],
    };

    return {
      url,
      options: { method: 'POST', headers, body: JSON.stringify(body) },
    };
  }
}

// -------------------------------------------------------------
// Request Runners
// -------------------------------------------------------------

async function runStandardRequest(req: PreparedRequest) {
  try {
    const res = await fetch(req.url, req.options);
    formatStatus(res);
    displayHeaders(res.headers);

    const fullText = await res.text();
    // Display first 2 KB
    const preview = fullText.slice(0, 2048);
    outBody.textContent = preview + (fullText.length > 2048 ? '\n\n... [truncated to 2 KB]' : '');

    // Attempt finish reason extraction if JSON
    try {
      const json = JSON.parse(fullText);
      extractFinishReason(json);
    } catch {
      // not JSON
    }
  } catch (err) {
    handleFetchError(err);
  } finally {
    setBusy(false);
  }
}

function extractFinishReason(json: Record<string, unknown>) {
  if (providerSelect.value === 'anthropic') {
    if (json.stop_reason) {
      outFinishReason.textContent = String(json.stop_reason);
    }
  } else {
    const candidates = json.candidates as Array<{ finishReason?: string }> | undefined;
    if (candidates && candidates[0] && candidates[0].finishReason) {
      outFinishReason.textContent = String(candidates[0].finishReason);
    }
  }
}

async function runStreamingRequest(req: PreparedRequest) {
  try {
    const res = await fetch(req.url, req.options);
    formatStatus(res);
    displayHeaders(res.headers);

    if (!res.ok) {
      const errText = await res.text();
      outBody.textContent = errText.slice(0, 2048);
      return;
    }

    if (!res.body) {
      outBody.textContent = 'Response body is empty';
      return;
    }

    outBody.textContent = '';
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let accumulatedText = '';
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      buffer += chunk;
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data:')) continue;
        const dataStr = trimmed.replace(/^data:\s*/, '');
        if (dataStr === '[DONE]') continue;

        try {
          const data = JSON.parse(dataStr);
          if (providerSelect.value === 'anthropic') {
            if (data.type === 'content_block_delta' && data.delta?.text) {
              accumulatedText += data.delta.text;
            } else if (data.type === 'message_delta' && data.delta?.stop_reason) {
              outFinishReason.textContent = String(data.delta.stop_reason);
            }
          } else {
            // Gemini
            const parts = data.candidates?.[0]?.content?.parts;
            if (Array.isArray(parts)) {
              for (const p of parts) {
                if (p.text) accumulatedText += p.text;
              }
            }
            if (data.candidates?.[0]?.finishReason) {
              outFinishReason.textContent = String(data.candidates[0].finishReason);
            }
          }
        } catch {
          // Keep raw line if JSON parse fails
        }
      }

      const display = accumulatedText.slice(0, 2048);
      outBody.textContent = display + (accumulatedText.length > 2048 ? '\n\n... [truncated to 2 KB]' : '');
    }

    if (!accumulatedText) {
      outBody.textContent = buffer.slice(0, 2048) || '(Stream completed with no text)';
    }
  } catch (err) {
    handleFetchError(err);
  } finally {
    setBusy(false);
  }
}

// -------------------------------------------------------------
// Button Listeners
// -------------------------------------------------------------

btnListModels.addEventListener('click', () => {
  setBusy(true, 'List Models');
  const req = prepareListModels();
  runStandardRequest(req);
});

btnNonStreaming.addEventListener('click', () => {
  setBusy(true, 'Non-streaming Call');
  const req = prepareNonStreaming('Hello! Please respond with a one-sentence greeting.');
  runStandardRequest(req);
});

btnStreaming.addEventListener('click', () => {
  setBusy(true, 'Streaming Call');
  const req = prepareStreaming('Please count steadily from 1 to 10 with commas.');
  runStreamingRequest(req);
});

btnTruncation.addEventListener('click', () => {
  setBusy(true, 'Truncation Check (5 tokens)');
  const req = prepareTruncationCheck();
  runStandardRequest(req);
});

btnImage.addEventListener('click', async () => {
  setBusy(true, 'Call with Image');
  const base64 = await loadFixtureBase64('/tests/fixtures/jobs/posting.png', FALLBACK_PNG_BASE64);
  const req = prepareImageCall(base64);
  runStandardRequest(req);
});

btnPdf.addEventListener('click', async () => {
  setBusy(true, 'Call with PDF');
  const base64 = await loadFixtureBase64('/tests/fixtures/jobs/posting.pdf', FALLBACK_PDF_BASE64);
  const req = preparePdfCall(base64);
  runStandardRequest(req);
});


// electron/ai/providers.cjs
// -------------------------------------------------------------------------
// Normalized multi-provider LLM streaming for the Electron main process.
//
// The renderer never talks to a provider directly (no CORS, keys stay out of
// the DOM). Main streams from the provider and forwards plain-text deltas over
// IPC. Each adapter exposes:
//   buildRequest({ baseUrl, apiKey, model, system, messages, maxTokens })
//        -> { url, headers, body }        (body is a plain object)
//   parseDelta(json) -> string | null    (text chunk from one SSE data frame)
//   parseError(status, text) -> string   (human-readable error message)
//
// `messages` is a normalized array of { role: 'user'|'assistant', content }.
// A separate `system` string carries the system prompt. Adapters map both onto
// each provider's own shape.
//
// This module has NO electron dependency, so it is unit-testable in isolation.

const ANTHROPIC_VERSION = '2023-06-01';

function stripTrailingSlash(u) {
  return String(u || '').trim().replace(/\/+$/, '');
}

function extractErrorMessage(text) {
  try {
    const j = JSON.parse(text);
    return j?.error?.message || j?.error?.type || j?.message || text;
  } catch {
    return text;
  }
}

const ADAPTERS = {
  // ── Anthropic (Claude) — Messages API ──────────────────────────────────
  anthropic: {
    buildRequest({ baseUrl, apiKey, model, system, messages, maxTokens }) {
      const base = stripTrailingSlash(baseUrl) || 'https://api.anthropic.com';
      return {
        url: `${base}/v1/messages`,
        headers: {
          'content-type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': ANTHROPIC_VERSION,
        },
        body: {
          model,
          max_tokens: maxTokens,
          stream: true,
          ...(system ? { system } : {}),
          messages: messages.map((m) => ({ role: m.role, content: m.content })),
        },
      };
    },
    parseDelta(json) {
      if (json.type === 'content_block_delta' && json.delta?.type === 'text_delta') {
        return json.delta.text || '';
      }
      if (json.type === 'error') {
        throw new Error(json.error?.message || 'Anthropic stream error');
      }
      return null;
    },
    parseError(status, text) {
      return `Anthropic API error (HTTP ${status}): ${extractErrorMessage(text)}`;
    },
  },

  // ── Google (Gemini) — streamGenerateContent (SSE) ──────────────────────
  gemini: {
    buildRequest({ baseUrl, apiKey, model, system, messages, maxTokens }) {
      const base = stripTrailingSlash(baseUrl) || 'https://generativelanguage.googleapis.com/v1beta';
      return {
        url: `${base}/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse&key=${encodeURIComponent(apiKey)}`,
        headers: { 'content-type': 'application/json' },
        body: {
          ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
          contents: messages.map((m) => ({
            role: m.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: m.content }],
          })),
          generationConfig: { maxOutputTokens: maxTokens },
        },
      };
    },
    parseDelta(json) {
      const parts = json?.candidates?.[0]?.content?.parts;
      if (Array.isArray(parts)) return parts.map((p) => p.text || '').join('');
      return null;
    },
    parseError(status, text) {
      return `Gemini API error (HTTP ${status}): ${extractErrorMessage(text)}`;
    },
  },

  // ── OpenAI (GPT) — Chat Completions (SSE) ──────────────────────────────
  openai: {
    buildRequest({ baseUrl, apiKey, model, system, messages, maxTokens }) {
      const base = stripTrailingSlash(baseUrl) || 'https://api.openai.com/v1';
      const msgs = system ? [{ role: 'system', content: system }, ...messages] : messages;
      return {
        url: `${base}/chat/completions`,
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${apiKey}`,
        },
        body: { model, stream: true, max_tokens: maxTokens, messages: msgs },
      };
    },
    parseDelta(json) {
      const delta = json?.choices?.[0]?.delta?.content;
      return typeof delta === 'string' ? delta : null;
    },
    parseError(status, text) {
      return `OpenAI API error (HTTP ${status}): ${extractErrorMessage(text)}`;
    },
  },
};

// OpenAI-compatible endpoints (OpenRouter, Azure, local servers) reuse the
// OpenAI wire format verbatim — the only difference is a required base URL.
ADAPTERS.compatible = {
  buildRequest: ADAPTERS.openai.buildRequest,
  parseDelta: ADAPTERS.openai.parseDelta,
  parseError(status, text) {
    return `AI endpoint error (HTTP ${status}): ${extractErrorMessage(text)}`;
  },
};

const AI_PROVIDERS = Object.keys(ADAPTERS);

/**
 * Stream a chat completion from the configured provider, invoking onDelta for
 * each text chunk. Resolves when the stream ends; rejects on HTTP/parse error
 * or abort.
 *
 * @param {object}   o
 * @param {string}   o.provider   one of AI_PROVIDERS
 * @param {string}   [o.baseUrl]  override endpoint (required for 'compatible')
 * @param {string}   o.apiKey
 * @param {string}   o.model
 * @param {string}   [o.system]
 * @param {Array<{role:string,content:string}>} o.messages
 * @param {number}   [o.maxTokens=2048]
 * @param {AbortSignal} [o.signal]
 * @param {(text:string)=>void} o.onDelta
 */
async function streamChat({ provider, baseUrl, apiKey, model, system, messages, maxTokens = 2048, signal, onDelta }) {
  const adapter = ADAPTERS[provider];
  if (!adapter) throw new Error(`Unknown AI provider: ${provider}`);
  if (provider === 'compatible' && !stripTrailingSlash(baseUrl)) {
    throw new Error('A base URL is required for an OpenAI-compatible endpoint.');
  }

  const req = adapter.buildRequest({ baseUrl, apiKey, model, system, messages, maxTokens });

  let res;
  try {
    res = await fetch(req.url, {
      method: 'POST',
      headers: req.headers,
      body: JSON.stringify(req.body),
      signal,
    });
  } catch (err) {
    if (err?.name === 'AbortError') throw err;
    throw new Error(`Could not reach the AI provider: ${err.message}`);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(adapter.parseError(res.status, text));
  }
  if (!res.body) throw new Error('AI provider returned an empty response stream.');

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });

    let nl;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line.startsWith('data:')) continue;
      const data = line.slice(5).trim();
      if (data === '[DONE]') return;
      let json;
      try {
        json = JSON.parse(data);
      } catch {
        continue; // partial / keep-alive frame
      }
      const text = adapter.parseDelta(json);
      if (text) onDelta(text);
    }
  }
}

module.exports = { streamChat, AI_PROVIDERS, ADAPTERS };

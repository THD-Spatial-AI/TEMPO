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

/** Map an HTTP status to a short, human hint (null when nothing useful to add). */
function statusHint(status) {
  if (status === 401 || status === 403) return 'authentication failed — check your API key';
  if (status === 404) return 'not found — check the model id and (for compatible endpoints) the base URL';
  if (status === 429) return 'rate limit or quota exceeded — wait and retry, or check your plan/billing';
  if (status >= 500) return 'the provider had a server error — try again shortly';
  return null;
}

/** Shared HTTP-error formatter: "<label> error (HTTP 429) — <hint>: <detail>". */
function formatHttpError(label, status, text) {
  const hint = statusHint(status);
  return `${label} error (HTTP ${status})${hint ? ` — ${hint}` : ''}: ${extractErrorMessage(text)}`;
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
      return formatHttpError('Anthropic API', status, text);
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
          // Gemini 2.5/3 Flash spend "thinking" tokens from maxOutputTokens, and
          // Flash thinking can't be fully disabled — too small a budget is spent
          // entirely on thinking and returns an empty answer. Reserve generous
          // headroom for thinking so the actual response still fits.
          generationConfig: { maxOutputTokens: maxTokens + 8192 },
        },
      };
    },
    parseDelta(json) {
      // A blocked prompt or a non-STOP finish returns no text — surface it
      // instead of silently ending the stream with an empty report.
      const block = json?.promptFeedback?.blockReason;
      if (block) throw new Error(`Gemini blocked the request (${block}). Try rephrasing or reducing the data sent.`);
      const cand = json?.candidates?.[0];
      const parts = cand?.content?.parts;
      const text = Array.isArray(parts) ? parts.map((p) => p.text || '').join('') : '';
      const finish = cand?.finishReason;
      if (!text && finish && finish !== 'STOP' && finish !== 'MAX_TOKENS') {
        throw new Error(`Gemini stopped without returning text (finishReason: ${finish}).`);
      }
      return text || null;
    },
    parseError(status, text) {
      return formatHttpError('Gemini API', status, text);
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
      return formatHttpError('OpenAI API', status, text);
    },
  },
};

// OpenAI-compatible endpoints (OpenRouter, Azure, local servers) reuse the
// OpenAI wire format verbatim — the only difference is a required base URL.
ADAPTERS.compatible = {
  buildRequest: ADAPTERS.openai.buildRequest,
  parseDelta: ADAPTERS.openai.parseDelta,
  parseError(status, text) {
    return formatHttpError('AI endpoint', status, text);
  },
};

// Groq — OpenAI-compatible wire format at a fixed base URL (free tier). Base URL
// is hardcoded so an empty field can't silently fall back to api.openai.com.
ADAPTERS.groq = {
  buildRequest({ apiKey, model, system, messages, maxTokens }) {
    const msgs = system ? [{ role: 'system', content: system }, ...messages] : messages;
    return {
      url: 'https://api.groq.com/openai/v1/chat/completions',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiKey}`,
      },
      body: { model, stream: true, max_tokens: maxTokens, messages: msgs },
    };
  },
  parseDelta: ADAPTERS.openai.parseDelta,
  parseError(status, text) {
    return formatHttpError('Groq API', status, text);
  },
};

// Ollama — OpenAI-compatible server. Runs on the user's own hardware (local or a
// LAN host), so no API key is needed; a static Authorization header keeps the
// wire format happy (Ollama ignores it). The host defaults to localhost; a base
// URL points it at another machine. Accepts a host root or a full "…/v1" base.
ADAPTERS.ollama = {
  buildRequest({ baseUrl, model, system, messages, maxTokens }) {
    const base = (stripTrailingSlash(baseUrl) || 'http://localhost:11434').replace(/\/v1$/, '');
    const msgs = system ? [{ role: 'system', content: system }, ...messages] : messages;
    return {
      url: `${base}/v1/chat/completions`,
      headers: {
        'content-type': 'application/json',
        authorization: 'Bearer ollama',
      },
      body: { model, stream: true, max_tokens: maxTokens, messages: msgs },
    };
  },
  parseDelta: ADAPTERS.openai.parseDelta,
  parseError(status, text) {
    return formatHttpError('Ollama', status, text);
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
 * @param {number}   [o.connectTimeoutMs=30000]  max wait for the first response
 * @param {number}   [o.idleTimeoutMs=60000]     max gap between stream chunks
 * @param {(text:string)=>void} o.onDelta
 */
async function streamChat({
  provider, baseUrl, apiKey, model, system, messages, maxTokens = 2048, signal, onDelta,
  // Thinking models (Gemini 2.5/3 Flash) reason server-side over a large context
  // before the first byte, so the time-to-first-response can be well over 30s.
  connectTimeoutMs = 120000, idleTimeoutMs = 90000,
}) {
  const adapter = ADAPTERS[provider];
  if (!adapter) throw new Error(`Unknown AI provider: ${provider}`);
  if (provider === 'compatible' && !stripTrailingSlash(baseUrl)) {
    throw new Error('A base URL is required for an OpenAI-compatible endpoint.');
  }

  const req = adapter.buildRequest({ baseUrl, apiKey, model, system, messages, maxTokens });

  // One internal controller drives the whole request. It is aborted by the
  // caller's signal (user cancel), a connect timeout (no first byte), or an
  // idle timeout (stream stalls). `abortReason` lets us turn each into the
  // right message — a timeout must surface as an error, not a silent cancel.
  const ctrl = new AbortController();
  let abortReason = null; // 'user' | 'connect' | 'idle'
  const onExternalAbort = () => { if (!abortReason) abortReason = 'user'; ctrl.abort(); };
  if (signal) {
    if (signal.aborted) onExternalAbort();
    else signal.addEventListener('abort', onExternalAbort, { once: true });
  }
  const cleanup = () => signal?.removeEventListener('abort', onExternalAbort);

  // Transient upstream failures (rate-limit / overload / gateway) are retried
  // with exponential backoff before surfacing — free-tier models 503 briefly
  // under load. Retries happen before any text is emitted, so they're safe.
  const RETRYABLE = new Set([429, 500, 502, 503, 504]);
  const MAX_ATTEMPTS = 4;
  let res;
  for (let attempt = 1; ; attempt++) {
    const connectTimer = setTimeout(() => { abortReason = 'connect'; ctrl.abort(); }, connectTimeoutMs);
    try {
      res = await fetch(req.url, {
        method: 'POST',
        headers: req.headers,
        body: JSON.stringify(req.body),
        signal: ctrl.signal,
      });
    } catch (err) {
      clearTimeout(connectTimer);
      cleanup();
      if (abortReason === 'connect') throw new Error(`The AI provider did not respond within ${connectTimeoutMs / 1000}s. Check your connection, base URL, or model id.`);
      if (abortReason === 'user' || err?.name === 'AbortError') throw err;
      throw new Error(`Could not reach the AI provider: ${err.message}`);
    }
    clearTimeout(connectTimer); // response headers received

    if (res.ok) break;

    const text = await res.text().catch(() => '');
    if (RETRYABLE.has(res.status) && attempt < MAX_ATTEMPTS) {
      // Back off 1s, 2s, 4s… then retry. Abortable via the caller's signal.
      const backoffMs = 1000 * 2 ** (attempt - 1);
      try {
        await new Promise((resolve, reject) => {
          const t = setTimeout(resolve, backoffMs);
          const onAb = () => { clearTimeout(t); reject(new Error('aborted')); };
          if (ctrl.signal.aborted) onAb();
          else ctrl.signal.addEventListener('abort', onAb, { once: true });
        });
      } catch {
        cleanup();
        throw new Error('Request cancelled.');
      }
      continue;
    }

    cleanup();
    throw new Error(adapter.parseError(res.status, text));
  }
  if (!res.body) { cleanup(); throw new Error('AI provider returned an empty response stream.'); }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  let sawText = false;

  let idleTimer;
  const resetIdle = () => {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => { abortReason = 'idle'; ctrl.abort(); }, idleTimeoutMs);
  };

  try {
    resetIdle();
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      resetIdle();
      buf += decoder.decode(value, { stream: true });

      let nl;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line.startsWith('data:')) continue;
        const data = line.slice(5).trim();
        if (data === '[DONE]') { clearTimeout(idleTimer); cleanup(); return; }
        let json;
        try {
          json = JSON.parse(data);
        } catch {
          continue; // partial / keep-alive frame
        }
        const text = adapter.parseDelta(json); // may throw (blocked/finish reasons)
        if (text) { sawText = true; onDelta(text); }
      }
    }
  } catch (err) {
    if (abortReason === 'idle') throw new Error(`The AI provider stopped responding (no data for ${idleTimeoutMs / 1000}s).`);
    if (abortReason === 'user' || err?.name === 'AbortError') throw err;
    throw err;
  } finally {
    clearTimeout(idleTimer);
    cleanup();
  }

  // Stream ended cleanly but produced nothing — a blocked/filtered/empty reply
  // that would otherwise render as a blank report with no explanation.
  if (!sawText) throw new Error('The AI provider returned an empty response. This can be a content filter, an unsupported model id, or a token limit — try another model or reduce the data sent.');
}

module.exports = { streamChat, AI_PROVIDERS, ADAPTERS };

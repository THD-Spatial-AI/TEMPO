// aiClient.js
// -------------------------------------------------------------------------
// Renderer-side driver for the main-process AI bridge (window.electronAPI.ai).
// Presents a single streamAI() call with callback hooks and a cancel handle,
// mirroring how other TEMPO clients expose streaming runs.

import { getAIConfig } from './aiSettings';

let counter = 0;

/** True when the desktop AI bridge is available (Electron, not plain browser). */
export function aiAvailable() {
  return Boolean(window.electronAPI?.ai);
}

/** @returns Promise<boolean> whether a key is stored for the given/current provider. */
export async function hasKey(provider) {
  if (!aiAvailable()) return false;
  const p = provider || getAIConfig().provider;
  const res = await window.electronAPI.ai.keyStatus(p).catch(() => ({ hasKey: false }));
  return Boolean(res?.hasKey);
}

/**
 * Stream a completion using the currently configured provider/model.
 * @param {object} o
 * @param {Array<{role,content}>} o.messages
 * @param {string} [o.system]
 * @param {number} [o.maxTokens]
 * @param {(text:string)=>void} [o.onDelta]
 * @param {()=>void} [o.onDone]
 * @param {(err:string)=>void} [o.onError]
 * @param {()=>void} [o.onAbort]
 * @returns {{ reqId: string, cancel: Function }}
 */
export function streamAI({ messages, system, maxTokens, onDelta, onDone, onError, onAbort }) {
  const api = window.electronAPI?.ai;
  if (!api) {
    onError?.('AI features are only available in the TEMPO desktop app.');
    return { reqId: null, cancel() {} };
  }

  const cfg = getAIConfig();
  const reqId = `ai-${Date.now()}-${++counter}`;
  let settled = false;

  const unsub = api.onStream((data) => {
    if (data.reqId !== reqId || settled) return;
    switch (data.type) {
      case 'delta':   onDelta?.(data.text); break;
      case 'done':    finish(() => onDone?.()); break;
      case 'error':   finish(() => onError?.(data.error)); break;
      case 'aborted': finish(() => onAbort?.()); break;
      default: break;
    }
  });

  const finish = (fn) => {
    if (settled) return;
    settled = true;
    unsub?.();
    fn();
  };

  api
    .send({
      reqId,
      provider: cfg.provider,
      model: cfg.model,
      baseUrl: cfg.baseUrl,
      system,
      messages,
      maxTokens: maxTokens || 2048,
    })
    .then((res) => {
      // The no-key / invalid-config path returns an error inline (no stream event).
      if (res && res.ok === false && res.error) finish(() => onError?.(res.error));
    })
    .catch((err) => finish(() => onError?.(err.message)));

  return {
    reqId,
    cancel: () => { api.cancel(reqId); },
  };
}

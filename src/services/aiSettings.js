// aiSettings.js
// -------------------------------------------------------------------------
// Non-secret AI config (provider, model, base URL, enabled) persisted in
// localStorage via appSettings. The API keys themselves live encrypted in the
// main process (see electron/ai/keystore.cjs) and are never stored here.

import { getSetting, setSetting } from './appSettings';

const KEY = 'aiConfig';

export const AI_PROVIDERS = [
  { id: 'anthropic',  label: 'Anthropic (Claude)',   defaultModel: 'claude-sonnet-4-6',   needsBaseUrl: false, keysUrl: 'https://console.anthropic.com/settings/keys' },
  { id: 'gemini',     label: 'Google (Gemini)',      defaultModel: 'gemini-flash-latest', needsBaseUrl: false, keysUrl: 'https://aistudio.google.com/apikey' },
  { id: 'openai',     label: 'OpenAI (GPT)',         defaultModel: 'gpt-4o',              needsBaseUrl: false, keysUrl: 'https://platform.openai.com/api-keys' },
  { id: 'compatible', label: 'OpenAI-compatible',    defaultModel: '',                    needsBaseUrl: true,  keysUrl: '' },
];

const DEFAULTS = { provider: 'anthropic', model: '', baseUrl: '', enabled: true };

export function providerMeta(id) {
  return AI_PROVIDERS.find((p) => p.id === id) || AI_PROVIDERS[0];
}

/** Current AI config with defaults applied. `model` falls back to the provider default. */
export function getAIConfig() {
  const stored = getSetting(KEY) || {};
  const merged = { ...DEFAULTS, ...stored };
  if (!merged.model) merged.model = providerMeta(merged.provider).defaultModel;
  return merged;
}

export function setAIConfig(patch) {
  const next = { ...getAIConfig(), ...patch };
  setSetting(KEY, next);
  return next;
}

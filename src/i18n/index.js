// Minimal i18n: t(key, vars) with English fallback; language stored in app settings.
import { useEffect, useState } from 'react';
import { getSetting, setSetting, SETTINGS_EVENT } from '../services/appSettings';
import en from './en';
import deKeys from './de';
import deStrings from './de-strings';

const DICTS = { en, de: { ...deStrings, ...deKeys } };
export const LANGUAGES = [{ value: 'en', label: 'English' }, { value: 'de', label: 'Deutsch' }];

export const getLanguage = () => (DICTS[getSetting('language')] ? getSetting('language') : 'en');
// Date locale (undefined = system)
export const locale = () => (getLanguage() === 'de' ? 'de-DE' : undefined);
export const setLanguage = (lang) => setSetting('language', lang);

export function t(key, vars) {
  const lang = getLanguage();
  let s = DICTS[lang][key] ?? en[key] ?? key;
  if (vars) s = s.replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? `{${k}}`));
  return s;
}

// Wrapper used across the app; the English text is the key
export const tr = t;

// Case-insensitive lookup for formatted IDs
let lower = null;
export function trLoose(text) {
  if (typeof text !== 'string' || getLanguage() === 'en') return text;
  const hit = DICTS[getLanguage()][text];
  if (hit) return hit;
  if (!lower) {
    lower = {};
    for (const [k, v] of Object.entries(DICTS[getLanguage()])) lower[k.toLowerCase()] = v;
  }
  return lower[text.toLowerCase()] ?? text;
}

// Translated text → English (lets tours match labels in any language)
let reverse = null;
export function toEnglish(text) {
  if (!reverse) {
    reverse = {};
    for (const [k, v] of Object.entries(DICTS[getLanguage()])) reverse[v] = en[k] ?? k;
  }
  return reverse[text] ?? text;
}

// Re-render on language change
export function useT() {
  const [, setLang] = useState(getLanguage);
  useEffect(() => {
    const on = () => setLang(getLanguage());
    window.addEventListener(SETTINGS_EVENT, on);
    return () => window.removeEventListener(SETTINGS_EVENT, on);
  }, []);
  return t;
}

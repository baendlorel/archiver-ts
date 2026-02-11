import { en } from './en.js';
import type { I18nDictionary, I18nKey } from './zh.js';
import { zh } from './zh.js';

export type SupportedLanguage = 'zh' | 'en';

const locales: Record<SupportedLanguage, I18nDictionary> = {
  zh,
  en,
};

let activeLanguage: SupportedLanguage = 'zh';

export function normalizeLanguage(value: unknown): SupportedLanguage {
  if (value === 'en') {
    return 'en';
  }
  return 'zh';
}

export function setLanguage(value: unknown): SupportedLanguage {
  activeLanguage = normalizeLanguage(value);
  return activeLanguage;
}

export function getLanguage(): SupportedLanguage {
  return activeLanguage;
}

function renderTemplate(template: string, params?: Record<string, unknown>): string {
  if (!params) {
    return template;
  }

  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (_match, key: string) => {
    if (!(key in params)) {
      return `{${key}}`;
    }

    const value = params[key];
    if (value === undefined || value === null) {
      return '';
    }
    return String(value);
  });
}

export function t(key: I18nKey, params?: Record<string, unknown>): string {
  const localized = locales[activeLanguage][key] ?? locales.zh[key] ?? key;
  return renderTemplate(localized, params);
}

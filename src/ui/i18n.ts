import bnUi from '../../data/dialogue/bn/ui.json';
import enUi from '../../data/dialogue/en/ui.json';
import bnNegotiation from '../../data/dialogue/bn/negotiation.json';
import enNegotiation from '../../data/dialogue/en/negotiation.json';
import bnPhone from '../../data/dialogue/bn/phone.json';
import enPhone from '../../data/dialogue/en/phone.json';
import bnHud from '../../data/dialogue/bn/hud.json';
import enHud from '../../data/dialogue/en/hud.json';

export type Language = 'bn' | 'en';

const dictionaries: Record<Language, Record<string, string>> = {
  bn: { ...bnUi, ...bnNegotiation, ...bnPhone, ...bnHud },
  en: { ...enUi, ...enNegotiation, ...enPhone, ...enHud },
};

let currentLanguage: Language = 'bn'; // Default to Bangla for authentic Dhaka experience

export function setLanguage(lang: Language): void {
  currentLanguage = lang;
}

export function getLanguage(): Language {
  return currentLanguage;
}

export function loadTranslations(lang: Language, data: Record<string, string>): void {
  dictionaries[lang] = { ...dictionaries[lang], ...data };
}

export function getDictionary(lang: Language): Record<string, string> {
  return { ...dictionaries[lang] };
}

/**
 * Translates a key with variable interpolation.
 * Falls back to 'en' dictionary, then to the key itself if not found.
 */
export function t(key: string, vars?: Record<string, string | number>): string {
  let template = dictionaries[currentLanguage]?.[key];

  // Fallback to English
  if (typeof template === 'undefined') {
    template = dictionaries.en?.[key];
  }

  // Fallback to key itself
  if (typeof template === 'undefined') {
    return key;
  }

  if (!vars) {
    return template;
  }

  // Replace {varName}
  return template.replace(/\{(\w+)\}/g, (match, varName) => {
    return vars[varName] !== undefined ? String(vars[varName]) : match;
  });
}

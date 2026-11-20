import bnUi from '../../data/dialogue/bn/ui.json';
import bnNegotiation from '../../data/dialogue/bn/negotiation.json';
import bnPhone from '../../data/dialogue/bn/phone.json';
import bnHud from '../../data/dialogue/bn/hud.json';
import bnMissions from '../../data/dialogue/bn/missions.json';
import bnEndings from '../../data/dialogue/bn/endings.json';
import bnCharacters from '../../data/dialogue/bn/characters.json';
import bnEncounters from '../../data/dialogue/bn/encounters.json';
import bnDialogue from '../../data/dialogue/bn/dialogue.json';
import bnPassengers from '../../data/dialogue/bn/passengers.json';
import { signal } from '@preact/signals';

export type Language = 'bn' | 'en';

const dictionaries: Record<Language, Record<string, string>> = {
  bn: {
    ...bnUi,
    ...bnNegotiation,
    ...bnPhone,
    ...bnHud,
    ...bnMissions,
    ...bnEndings,
    ...bnCharacters,
    ...bnEncounters,
    ...bnDialogue,
    ...bnPassengers,
    ...(import.meta.env.DEV ? { 'district.testloop': 'টেস্টলুপ' } : {}),
  },
  en: import.meta.env.DEV ? { 'district.testloop': 'Test Loop' } : {},
};

const localeVersionSignal = signal<number>(0);
const localePromises: Partial<Record<Language, Promise<Record<string, string>>>> = {};
const localeLoaded: Record<Language, boolean> = {
  bn: true,
  en: false,
};

async function fetchEnglishDictionary(): Promise<Record<string, string>> {
  const [
    enUi,
    enNegotiation,
    enPhone,
    enHud,
    enMissions,
    enEndings,
    enCharacters,
    enEncounters,
    enDialogue,
    enPassengers,
  ] = await Promise.all([
    import('../../data/dialogue/en/ui.json'),
    import('../../data/dialogue/en/negotiation.json'),
    import('../../data/dialogue/en/phone.json'),
    import('../../data/dialogue/en/hud.json'),
    import('../../data/dialogue/en/missions.json'),
    import('../../data/dialogue/en/endings.json'),
    import('../../data/dialogue/en/characters.json'),
    import('../../data/dialogue/en/encounters.json'),
    import('../../data/dialogue/en/dialogue.json'),
    import('../../data/dialogue/en/passengers.json'),
  ]);
  const merged: Record<string, string> = {
    ...(enUi.default ?? enUi),
    ...(enNegotiation.default ?? enNegotiation),
    ...(enPhone.default ?? enPhone),
    ...(enHud.default ?? enHud),
    ...(enMissions.default ?? enMissions),
    ...(enEndings.default ?? enEndings),
    ...(enCharacters.default ?? enCharacters),
    ...(enEncounters.default ?? enEncounters),
    ...(enDialogue.default ?? enDialogue),
    ...(enPassengers.default ?? enPassengers),
    ...dictionaries.en,
  };
  dictionaries.en = merged;
  localeLoaded.en = true;
  localeVersionSignal.value++;
  return merged;
}

/**
 * Ensures the requested locale dictionary is loaded via dynamic `import()`.
 * Default Bangla (`bn`) is embedded in the initial shell; English (`en`) is
 * split into a lazy chunk and fetched on demand.
 */
export function ensureLocaleLoaded(lang: Language): Promise<Record<string, string>> {
  if (localeLoaded[lang]) {
    return Promise.resolve(dictionaries[lang]);
  }
  if (!localePromises[lang]) {
    localePromises[lang] = fetchEnglishDictionary();
  }
  return localePromises[lang]!;
}

if (import.meta.env.DEV && typeof process !== 'undefined' && process.versions?.node) {
  // In Node / Vitest unit tests, pre-populate English from disk so
  // synchronous `setLanguage('en'); t(...)` assertions continue to work with zero changes.
  void ensureLocaleLoaded('en');
}

// Default to Bangla for authentic Dhaka experience. A signal, so components that
// call t() re-render when the language changes.
const languageSignal = signal<Language>('bn');

export function getLocaleVersion(): number {
  return localeVersionSignal.value;
}

export function setLanguage(lang: Language): void {
  if (!localeLoaded[lang]) {
    void ensureLocaleLoaded(lang);
  }
  languageSignal.value = lang;
  if (typeof document !== 'undefined' && document.documentElement) {
    document.documentElement.lang = lang;
  }
}

export function getLanguage(): Language {
  return languageSignal.value;
}

const BANGLA_DIGITS = '০১২৩৪৫৬৭৮৯';

/** A number as shown on screen: Bangla digits in Bangla mode, Western otherwise (audit). */
export function localDigits(value: string | number): string {
  const text = String(value);
  if (languageSignal.value !== 'bn') return text;
  return text.replace(/[0-9]/g, (d) => BANGLA_DIGITS[Number(d)]!);
}

export function loadTranslations(lang: Language, data: Record<string, string>): void {
  dictionaries[lang] = { ...dictionaries[lang], ...data };
  localeVersionSignal.value++;
}

export function getDictionary(lang: Language): Record<string, string> {
  void localeVersionSignal.value;
  return { ...dictionaries[lang] };
}

/**
 * Translates a key with variable interpolation.
 * Falls back to 'en' dictionary, then to the key itself if not found.
 */
export function t(key: string, vars?: Record<string, string | number>): string {
  void localeVersionSignal.value;
  let template = dictionaries[languageSignal.value]?.[key];

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

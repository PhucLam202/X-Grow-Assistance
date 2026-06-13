import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { en } from './locales/en';
import { vi } from './locales/vi';

export const UI_LANGUAGE_STORAGE_KEY = 'x_comment_assistant_ui_language';
export type UiLanguage = 'vi' | 'en';

function getInitialLanguage(): UiLanguage {
  const savedLanguage = localStorage.getItem(UI_LANGUAGE_STORAGE_KEY);
  return savedLanguage === 'en' ? 'en' : 'vi';
}

void i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    vi: { translation: vi },
  },
  lng: getInitialLanguage(),
  fallbackLng: 'vi',
  interpolation: {
    escapeValue: false,
  },
});

export { i18n };

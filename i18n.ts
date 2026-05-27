import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import frTranslations from './locales/fr.json';

// Phase A.2 — application 100% française. Détecteur de langue et paquet
// anglais retirés ; locale verrouillée à `fr`.
i18n
    .use(initReactI18next)
    .init({
        resources: {
            fr: { translation: frTranslations },
        },
        lng: 'fr',
        fallbackLng: 'fr',
        supportedLngs: ['fr'],
        interpolation: {
            escapeValue: false,
        },
    });


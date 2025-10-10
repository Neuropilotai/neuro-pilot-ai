/**
 * Enterprise Inventory System - Internationalization (i18n)
 * English/French Bilingual Support
 */

class I18n {
    constructor() {
        this.currentLanguage = localStorage.getItem('language') || 'en';
        this.translations = {};
        this.loadTranslations();
    }

    async loadTranslations() {
        try {
            // Load English translations
            const enResponse = await fetch('/locales/en.json');
            this.translations.en = await enResponse.json();

            // Load French translations
            const frResponse = await fetch('/locales/fr.json');
            this.translations.fr = await frResponse.json();

            // Apply translations to current page
            this.applyTranslations();
        } catch (error) {
            console.error('Failed to load translations:', error);
            // Fallback to English if loading fails
            this.currentLanguage = 'en';
        }
    }

    setLanguage(lang) {
        if (lang !== 'en' && lang !== 'fr') {
            console.warn(`Unsupported language: ${lang}. Defaulting to English.`);
            lang = 'en';
        }

        this.currentLanguage = lang;
        localStorage.setItem('language', lang);
        this.applyTranslations();

        // Trigger custom event for language change
        window.dispatchEvent(new CustomEvent('languageChanged', { detail: { language: lang } }));
    }

    getLanguage() {
        return this.currentLanguage;
    }

    // Get translation by key path (e.g., 'dashboard.title')
    t(key, fallback = key) {
        const keys = key.split('.');
        let translation = this.translations[this.currentLanguage];

        for (const k of keys) {
            if (translation && translation[k]) {
                translation = translation[k];
            } else {
                // Fallback to English if key not found in current language
                translation = this.translations.en;
                for (const k of keys) {
                    if (translation && translation[k]) {
                        translation = translation[k];
                    } else {
                        return fallback;
                    }
                }
                break;
            }
        }

        return translation || fallback;
    }

    // Apply translations to all elements with data-i18n attribute
    applyTranslations() {
        if (!this.translations[this.currentLanguage]) {
            return; // Translations not loaded yet
        }

        const elements = document.querySelectorAll('[data-i18n]');
        elements.forEach(element => {
            const key = element.getAttribute('data-i18n');
            const translation = this.t(key);

            if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
                if (element.type === 'submit' || element.type === 'button') {
                    element.value = translation;
                } else {
                    element.placeholder = translation;
                }
            } else {
                element.textContent = translation;
            }
        });

        // Apply translations to elements with data-i18n-title attribute (for tooltips)
        const titleElements = document.querySelectorAll('[data-i18n-title]');
        titleElements.forEach(element => {
            const key = element.getAttribute('data-i18n-title');
            element.title = this.t(key);
        });

        // Update page title if it has data-i18n attribute
        const titleElement = document.querySelector('title[data-i18n]');
        if (titleElement) {
            const key = titleElement.getAttribute('data-i18n');
            titleElement.textContent = this.t(key);
        }

        // Update language toggle button
        this.updateLanguageToggle();
    }

    updateLanguageToggle() {
        const languageToggle = document.getElementById('languageToggle');
        if (languageToggle) {
            const flagIcon = languageToggle.querySelector('.flag-icon');
            const langText = languageToggle.querySelector('.lang-text');

            if (this.currentLanguage === 'fr') {
                flagIcon.textContent = '🇫🇷';
                langText.textContent = 'FR';
                languageToggle.title = 'Changer en anglais';
            } else {
                flagIcon.textContent = '🇬🇧';
                langText.textContent = 'EN';
                languageToggle.title = 'Switch to French';
            }
        }
    }

    // Format numbers according to locale
    formatNumber(number, options = {}) {
        const locale = this.currentLanguage === 'fr' ? 'fr-FR' : 'en-US';
        return new Intl.NumberFormat(locale, options).format(number);
    }

    // Format currency according to locale
    formatCurrency(amount, currency = 'USD') {
        const locale = this.currentLanguage === 'fr' ? 'fr-FR' : 'en-US';
        return new Intl.NumberFormat(locale, {
            style: 'currency',
            currency: currency
        }).format(amount);
    }

    // Format date according to locale
    formatDate(date, options = {}) {
        const locale = this.currentLanguage === 'fr' ? 'fr-FR' : 'en-US';
        return new Intl.DateTimeFormat(locale, options).format(new Date(date));
    }

    // Get available languages
    getAvailableLanguages() {
        return [
            { code: 'en', name: 'English', flag: '🇬🇧' },
            { code: 'fr', name: 'Français', flag: '🇫🇷' }
        ];
    }
}

// Create global i18n instance
window.i18n = new I18n();

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    // Add language toggle to header if it doesn't exist
    addLanguageToggle();

    // Apply translations
    window.i18n.applyTranslations();
});

// Add language toggle button to header
function addLanguageToggle() {
    const header = document.querySelector('.top-nav');
    if (!header || document.getElementById('languageToggle')) {
        return; // Header not found or toggle already exists
    }

    const languageToggle = document.createElement('button');
    languageToggle.id = 'languageToggle';
    languageToggle.className = 'language-toggle';
    languageToggle.innerHTML = `
        <span class="flag-icon">🇬🇧</span>
        <span class="lang-text">EN</span>
    `;

    languageToggle.addEventListener('click', () => {
        const newLang = window.i18n.getLanguage() === 'en' ? 'fr' : 'en';
        window.i18n.setLanguage(newLang);
    });

    // Add to header (before logout if it exists)
    const logoutBtn = header.querySelector('.logout-btn');
    if (logoutBtn) {
        header.insertBefore(languageToggle, logoutBtn);
    } else {
        header.appendChild(languageToggle);
    }
}

// Listen for language changes to update dynamic content
window.addEventListener('languageChanged', (event) => {
    // Refresh dynamic content that might have been loaded after page load
    setTimeout(() => {
        window.i18n.applyTranslations();
    }, 100);
});
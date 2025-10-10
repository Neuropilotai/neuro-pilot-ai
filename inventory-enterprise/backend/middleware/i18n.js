/**
 * i18n Middleware
 * Version: v2.2.0-2025-10-07
 *
 * Provides bilingual support (EN/FR) for API responses
 */

const fs = require('fs');
const path = require('path');

class I18n {
  constructor() {
    this.translations = {};
    this.defaultLocale = 'en';
    this.supportedLocales = ['en', 'fr'];
    this.loadTranslations();
  }

  loadTranslations() {
    const localesDir = path.join(__dirname, '../locales');

    // Ensure locales directory exists
    if (!fs.existsSync(localesDir)) {
      fs.mkdirSync(localesDir, { recursive: true });
    }

    for (const locale of this.supportedLocales) {
      const localePath = path.join(localesDir, `${locale}.json`);
      if (fs.existsSync(localePath)) {
        try {
          const data = fs.readFileSync(localePath, 'utf8');
          this.translations[locale] = JSON.parse(data);
        } catch (error) {
          console.error(`Error loading translations for ${locale}:`, error);
          this.translations[locale] = {};
        }
      } else {
        this.translations[locale] = {};
      }
    }
  }

  translate(key, locale = this.defaultLocale) {
    if (!this.translations[locale]) {
      locale = this.defaultLocale;
    }
    return this.translations[locale][key] || key;
  }

  middleware() {
    return (req, res, next) => {
      // Extract locale from Accept-Language header or query param
      const acceptLanguage = req.headers['accept-language'] || '';
      const queryLocale = req.query.lang;

      let locale = this.defaultLocale;

      if (queryLocale && this.supportedLocales.includes(queryLocale)) {
        locale = queryLocale;
      } else if (acceptLanguage.toLowerCase().includes('fr')) {
        locale = 'fr';
      }

      // Add translation function to request object
      req.locale = locale;
      req.t = (key) => this.translate(key, locale);

      next();
    };
  }
}

const i18n = new I18n();

module.exports = i18n.middleware();
module.exports.i18n = i18n;

/**
 * Owner Console Service Worker Cleanup - CSP Compliant
 * Unregisters service workers to prevent caching issues
 */

(function() {
  'use strict';
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then(registrations => {
      registrations.forEach(registration => {
        console.warn('🗑️ Unregistering service worker:', registration.scope);
        registration.unregister();
      });
    });
  }
})();


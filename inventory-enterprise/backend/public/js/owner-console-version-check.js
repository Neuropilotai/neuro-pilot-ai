/**
 * Owner Console Version Check - CSP Compliant
 * Forces reload if wrong version detected
 */

(function() {
  'use strict';
  const EXPECTED_VERSION = '23.6.13';
  const TIMESTAMP = '1765354398301';
  const BUILD_TS = Number(TIMESTAMP) || Date.now();
  
  // Check if scripts loaded with correct version
  const scripts = document.querySelectorAll('script[src*="owner-console-core"], script[src*="owner-super-console"]');
  let needsReload = false;
  let wrongVersions = [];
  
  scripts.forEach(script => {
    const src = script.src || script.getAttribute('src') || '';
    if (src.includes('owner-console-core.js')) {
      const match = src.match(/v=([0-9.]+)/);
      const version = match ? match[1] : 'unknown';
      if (version !== EXPECTED_VERSION) {
        console.error('❌ WRONG VERSION: owner-console-core.js', version, 'expected', EXPECTED_VERSION, '- FORCING RELOAD');
        wrongVersions.push('owner-console-core.js: ' + version);
        needsReload = true;
      }
    }
    if (src.includes('owner-super-console.js')) {
      const match = src.match(/v=([0-9.]+)/);
      const version = match ? match[1] : 'unknown';
      if (version !== EXPECTED_VERSION) {
        console.error('❌ WRONG VERSION: owner-super-console.js', version, 'expected', EXPECTED_VERSION, '- FORCING RELOAD');
        wrongVersions.push('owner-super-console.js: ' + version);
        needsReload = true;
      }
    }
  });
  
  if (needsReload) {
    console.error('🔄 WRONG VERSION DETECTED:', wrongVersions.join(', '));
    console.warn('🔄 Forcing page reload to get correct version...');
    
    // Clear everything and reload
    const clearAndReload = () => {
      try {
        localStorage.clear();
        sessionStorage.clear();
        if ('caches' in window) {
          caches.keys().then(names => {
            names.forEach(name => caches.delete(name));
            window.location.href = '/owner-super-console-v15.html?_nocache=' + BUILD_TS;
          });
        } else {
          window.location.href = '/owner-super-console-v15.html?_nocache=' + BUILD_TS;
        }
      } catch (e) {
        console.error('Error during reload:', e);
        window.location.href = '/owner-super-console-v15.html?_nocache=' + BUILD_TS;
      }
    };
    
    // Wait a bit for console messages to be visible
    setTimeout(clearAndReload, 1000);
  } else {
    console.log('✅ Correct version loaded:', EXPECTED_VERSION);
  }
})();


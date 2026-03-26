// ==========================================
// PWA SERVICE — Business Logic only
// ==========================================
// No UI, no DOM, no Firebase.

const pwaService = {
  /**
   * Registers the service worker.
   * @returns {Promise<ServiceWorkerRegistration|null>}
   */
  async register() {
    if (!('serviceWorker' in navigator)) {
      console.log('Service Worker not supported');
      return null;
    }

    try {
      const registration = await navigator.serviceWorker.register('./sw.js');
      console.log('SW registered, scope:', registration.scope);
      return registration;
    } catch (err) {
      console.error('SW registration failed:', err);
      return null;
    }
  },

  /**
   * Checks if app is running as installed PWA (standalone mode).
   * @returns {boolean}
   */
  isStandalone() {
    return window.matchMedia('(display-mode: standalone)').matches
      || window.navigator.standalone === true;
  },

  /**
   * Checks if service worker is active.
   * @returns {boolean}
   */
  isReady() {
    return 'serviceWorker' in navigator
      && navigator.serviceWorker.controller !== null;
  },
};

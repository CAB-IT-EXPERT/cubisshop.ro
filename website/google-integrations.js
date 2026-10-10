/**
 * Reusable Google integrations for Cubis Shop.
 *
 * This file deliberately performs no network request on load. A future Cubis
 * deployment must provide its own IDs and call the exported methods only after
 * the relevant consent has been granted.
 */
(function exposeCubisGoogleIntegrations(global) {
  'use strict';

  const measurementPattern = /^G-[A-Z0-9]+$/;
  const merchantPattern = /^\d+$/;

  function normalizedConfig(config) {
    const source = config && typeof config === 'object' ? config : {};
    return {
      measurementId: String(source.measurementId || '').trim().toUpperCase(),
      customerReviewsMerchantId: String(source.customerReviewsMerchantId || '').trim(),
    };
  }

  function loadScript(src, id) {
    if (document.getElementById(id)) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.id = id;
      script.async = true;
      script.src = src;
      script.onload = resolve;
      script.onerror = () => reject(new Error(`Nu s-a putut încărca ${id}.`));
      document.head.appendChild(script);
    });
  }

  async function enableAnalytics(config, options = {}) {
    const { measurementId } = normalizedConfig(config);
    if (!measurementPattern.test(measurementId) || options.consentGranted !== true) {
      return { enabled: false };
    }
    await loadScript(`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`, 'cubis-google-analytics');
    global.dataLayer = global.dataLayer || [];
    global.gtag = global.gtag || function gtag() { global.dataLayer.push(arguments); };
    global.gtag('js', new Date());
    global.gtag('config', measurementId, { anonymize_ip: true });
    return { enabled: true };
  }

  async function renderCustomerReviewOptIn(config, order) {
    const { customerReviewsMerchantId } = normalizedConfig(config);
    if (!merchantPattern.test(customerReviewsMerchantId) || !order || typeof order !== 'object') {
      return { enabled: false };
    }
    await loadScript('https://apis.google.com/js/platform.js', 'cubis-google-customer-reviews');
    if (!global.gapi?.load) return { enabled: false };
    await new Promise(resolve => global.gapi.load('surveyoptin', resolve));
    global.gapi.surveyoptin.render({
      merchant_id: Number(customerReviewsMerchantId),
      order_id: String(order.orderId || ''),
      email: String(order.email || ''),
      delivery_country: String(order.deliveryCountry || 'RO'),
      estimated_delivery_date: String(order.estimatedDeliveryDate || ''),
    });
    return { enabled: true };
  }

  global.CubisGoogleIntegrations = Object.freeze({
    enableAnalytics,
    renderCustomerReviewOptIn,
  });
})(window);

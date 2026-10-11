export const API_URL = "/shop-api/api-v2.php";

export const STORAGE_KEYS = Object.freeze({
  favorites: "cubis-favorite-products-v1",
  cart: "cubis-cart-products-v1",
  customerToken: "cubis-customer-session-v1",
  customerProfile: "cubis-customer-profile-v1",
  device: "cubis-shop-device-v1",
  checkout: "cubis-last-checkout-v1",
});

// Migrare unică a datelor locale existente. Cheile istorice nu sunt expuse în UI
// și pot fi eliminate după ce utilizatorii activi au trecut pe frontendul Cubis.
const HISTORICAL_STORAGE_KEYS = Object.freeze({
  favorites: "g-trots-favorite-products-v1",
  cart: "g-trots-cart-products-v1",
  customerToken: "g-trots-customer-session-v1",
  customerProfile: "g-trots-customer-profile-v1",
  device: "g-trots-shop-device-v1",
  checkout: "g-trots-last-checkout-v1",
});

function browserStorage(kind = "local") {
  try {
    return kind === "session" ? window.sessionStorage : window.localStorage;
  } catch {
    return null;
  }
}

export function migrateHistoricalStorage() {
  const local = browserStorage();
  const session = browserStorage("session");
  for (const key of ["favorites", "cart", "customerToken", "customerProfile", "device"]) {
    if (!local || local.getItem(STORAGE_KEYS[key]) !== null) continue;
    const value = local.getItem(HISTORICAL_STORAGE_KEYS[key]);
    if (value !== null) local.setItem(STORAGE_KEYS[key], value);
  }
  if (session && session.getItem(STORAGE_KEYS.checkout) === null) {
    const checkout = session.getItem(HISTORICAL_STORAGE_KEYS.checkout);
    if (checkout !== null) session.setItem(STORAGE_KEYS.checkout, checkout);
  }
}

function customerToken() {
  const storage = browserStorage();
  if (!storage) return "";
  return String(storage.getItem(STORAGE_KEYS.customerToken)
    || storage.getItem(HISTORICAL_STORAGE_KEYS.customerToken)
    || "").trim();
}

export function shopDeviceToken() {
  const storage = browserStorage();
  if (!storage) return "";
  let token = String(storage.getItem(STORAGE_KEYS.device)
    || storage.getItem(HISTORICAL_STORAGE_KEYS.device)
    || "").trim();
  if (/^[A-Za-z0-9_-]{20,128}$/.test(token)) {
    storage.setItem(STORAGE_KEYS.device, token);
    return token;
  }
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  token = Array.from(bytes, value => value.toString(16).padStart(2, "0")).join("");
  storage.setItem(STORAGE_KEYS.device, token);
  return token;
}

export async function commerceApiRequest(action, {
  method = "GET",
  query = {},
  body,
  auth = true,
  timeout = 16000,
  cache = "no-store",
} = {}) {
  const url = new URL(API_URL, location.origin);
  url.searchParams.set("action", action);
  Object.entries(query || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  const session = auth ? customerToken() : "";
  const device = shopDeviceToken();
  try {
    const response = await fetch(url, {
      method,
      cache,
      headers: {
        Accept: "application/json",
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(session ? { "X-Customer-Token": session } : {}),
        ...(device ? { "X-Shop-Device": device } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw new Error(payload?.error || `Cererea nu a putut fi finalizată (${response.status}).`);
    if (payload === null || payload === undefined) throw new Error("API-ul magazinului a trimis un răspuns incomplet.");
    return payload;
  } catch (error) {
    if (error?.name === "AbortError") throw new Error("Conexiunea cu magazinul a durat prea mult. Încearcă din nou.");
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export const catalogApi = Object.freeze({
  filters: () => commerceApiRequest("publicCatalogFilters", { auth: false }),
  config: () => commerceApiRequest("publicShopConfig", { auth: false }),
  productsPage: query => commerceApiRequest("publicProductsPage", { auth: false, query, cache: "default" }),
  product: query => commerceApiRequest("publicProduct", { auth: false, query }),
  reviews: id => commerceApiRequest("publicProductReviews", { auth: false, query: { id } }),
  createReview: body => commerceApiRequest("createPublicReview", { method: "POST", auth: false, body }),
  activePromotions: () => commerceApiRequest("publicActivePromotions", { auth: false }),
  freeShippingBanners: () => commerceApiRequest("publicFreeShippingBanners", { auth: false }),
});

export const checkoutApi = Object.freeze({
  products: ids => commerceApiRequest("publicCheckoutProducts", { method: "POST", auth: false, body: { ids } }),
  promotionQuote: body => commerceApiRequest("publicPromotionQuote", { method: "POST", auth: false, body }),
  createOrder: body => commerceApiRequest("createPublicOrder", { method: "POST", auth: false, body, timeout: 30000 }),
  stripeStatus: sessionId => commerceApiRequest("stripeCheckoutStatus", { method: "POST", auth: false, body: { session_id: sessionId } }),
  cancelStripe: (orderNumber, token) => commerceApiRequest("cancelStripeCheckout", { method: "POST", auth: false, body: { order_number: orderNumber, token } }),
});

export const customerApi = Object.freeze({
  authConfig: () => commerceApiRequest("customerAuthConfig", { auth: false }),
  login: body => commerceApiRequest("customerLogin", { method: "POST", auth: false, body }),
  googleLogin: credential => commerceApiRequest("customerGoogleLogin", { method: "POST", auth: false, body: { credential } }),
  register: body => commerceApiRequest("customerRegister", { method: "POST", auth: false, body }),
  forgotPassword: email => commerceApiRequest("customerForgotPassword", { method: "POST", auth: false, body: { email } }),
  resetPassword: body => commerceApiRequest("customerResetPassword", { method: "POST", auth: false, body }),
  me: () => commerceApiRequest("customerMe"),
  orders: () => commerceApiRequest("customerOrders"),
  addresses: () => commerceApiRequest("customerAddresses"),
  createAddress: body => commerceApiRequest("customerAddresses", { method: "POST", body }),
  updateAddress: (id, body) => commerceApiRequest("customerAddress", { method: "PATCH", query: { id }, body }),
  deleteAddress: id => commerceApiRequest("customerAddress", { method: "DELETE", query: { id } }),
  coupons: () => commerceApiRequest("customerCoupons"),
  updateProfile: body => commerceApiRequest("customerProfile", { method: "PATCH", body }),
  logout: () => commerceApiRequest("customerLogout", { method: "POST" }),
  deleteAccount: confirmation => commerceApiRequest("customerDeleteAccount", { method: "DELETE", body: { confirmation } }),
});

export const orderApi = Object.freeze({
  track: query => commerceApiRequest("publicTrackOrder", { auth: false, query }),
  validateReturn: body => commerceApiRequest("publicValidateReturnOrder", { method: "POST", auth: false, body }),
  cancel: body => commerceApiRequest("customerCancelOrder", { method: "POST", auth: false, body }),
  requestReturn: body => commerceApiRequest("customerRequestReturn", { method: "POST", auth: false, body }),
});

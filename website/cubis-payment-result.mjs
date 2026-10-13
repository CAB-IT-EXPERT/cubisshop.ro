import { checkoutApi, STORAGE_KEYS } from "./cubis-commerce-api.mjs?v=20261013-checkout";
import { commerce, escapeHtml, icon, initShell, money } from "./cubis-storefront.mjs?v=20261013-payment";

const mode = document.body.dataset.paymentResult;
const card = document.querySelector("[data-payment-result-card]");
const params = new URLSearchParams(location.search);

function storedCheckout() {
  try {
    return JSON.parse(sessionStorage.getItem(STORAGE_KEYS.checkout) || "null") || {};
  } catch {
    return {};
  }
}

function trackingHrefFromToken(value) {
  const token = String(value || "").trim();
  return /^[A-Za-z0-9_-]{32,128}$/.test(token) ? `/urmarire-comanda?token=${encodeURIComponent(token)}` : "";
}

function safeTrackingHref(value) {
  const href = String(value || "").trim();
  return /^\/urmarire-comanda\?token=[A-Za-z0-9_-]{32,128}$/.test(href) ? href : "";
}

function actionButtons({ primaryHref = "/magazin", primaryLabel = "Continuă cumpărăturile", account = false, trackingHref = "" } = {}) {
  if (trackingHref) {
    return `<div class="cs-payment-result__actions"><a class="is-primary" href="${escapeHtml(trackingHref)}">${icon("package")}<span>Urmărește comanda</span><span aria-hidden="true">→</span></a><a href="/magazin">Continuă cumpărăturile</a></div>`;
  }
  const secondary = account ? '<a href="/cont#orders">Urmărește comanda</a>' : '<a href="/contact">Ai nevoie de ajutor?</a>';
  return `<div class="cs-payment-result__actions"><a class="is-primary" href="${escapeHtml(primaryHref)}">${escapeHtml(primaryLabel)} <span aria-hidden="true">→</span></a>${secondary}</div>`;
}

function render({ type, eyebrow, title, copy, orderNumber = "", total = null, primaryHref = "/magazin", primaryLabel = "Continuă cumpărăturile", showAccount = true, trackingHref = "" }) {
  const authenticated = Boolean(localStorage.getItem(STORAGE_KEYS.customerToken));
  card.className = `cs-payment-result is-${type}`;
  card.setAttribute("aria-busy", "false");
  const resultIcon = type === "success" ? "check" : type === "cancelled" || type === "pending" ? "rotate" : "info";
  card.innerHTML = `<span class="cs-payment-result__icon">${icon(resultIcon)}</span><small>${escapeHtml(eyebrow)}</small><h1>${escapeHtml(title)}</h1><p>${escapeHtml(copy)}</p>${orderNumber ? `<div class="cs-payment-result__receipt"><span>Comanda <strong>${escapeHtml(orderNumber)}</strong></span>${total !== null ? `<b>${money(total)}</b>` : ""}</div>` : ""}${actionButtons({ primaryHref, primaryLabel, account: authenticated && showAccount, trackingHref })}`;
}

function confirmCashOnDelivery() {
  const orderNumber = String(params.get("comanda") || "").trim();
  if (!/^CS-[A-Za-z0-9-]+$/.test(orderNumber) || params.get("status") !== "cod") {
    render({ type: "error", eyebrow: "Confirmare imposibilă", title: "Linkul comenzii nu este valid", copy: "Nu am găsit datele necesare pentru confirmarea comenzii. Coșul tău nu a fost modificat.", primaryHref: "/checkout", primaryLabel: "Înapoi la checkout", showAccount: false });
    return;
  }
  const stored = storedCheckout();
  const storedMatches = String(stored.order_number || "") === orderNumber;
  const trackingHref = storedMatches ? trackingHrefFromToken(stored.tracking_token) : "";
  commerce.clearCart();
  render({
    type: "success",
    eyebrow: "Comandă confirmată",
    title: "Comanda ta a fost înregistrată!",
    copy: "Plata se face la livrare, direct curierului. Am trimis pe e-mail confirmarea și detaliile comenzii.",
    orderNumber,
    total: storedMatches && Number(stored.total) > 0 ? Number(stored.total) : null,
    trackingHref,
  });
}

async function confirmPayment() {
  const sessionId = String(params.get("session_id") || "").trim();
  if (!/^cs_test_[A-Za-z0-9]+$/.test(sessionId)) {
    render({ type: "error", eyebrow: "Verificare imposibilă", title: "Linkul de confirmare nu este valid", copy: "Nu am găsit identificatorul securizat al plății. Coșul tău a rămas neschimbat.", primaryHref: "/checkout", primaryLabel: "Înapoi la checkout", showAccount: false });
    return;
  }
  try {
    const result = await checkoutApi.stripeStatus(sessionId);
    const paid = ["paid", "no_payment_required"].includes(String(result?.payment_status || ""));
    if (!paid) {
      render({ type: "pending", eyebrow: "Confirmare în curs", title: "Așteptăm confirmarea plății", copy: "Procesatorul nu a confirmat încă plata. Nu retrimite comanda; poți verifica din nou statusul în câteva momente.", orderNumber: result?.order?.orderNumber || params.get("comanda") || "", primaryHref: `${location.pathname}${location.search}`, primaryLabel: "Verifică din nou" });
      return;
    }
    const order = result.order || {};
    const stored = storedCheckout();
    const trackingHref = safeTrackingHref(order.trackingUrl)
      || safeTrackingHref(stored.tracking_url)
      || trackingHrefFromToken(stored.tracking_token);
    commerce.clearCart();
    sessionStorage.setItem(STORAGE_KEYS.checkout, JSON.stringify({
      order_number: order.orderNumber || params.get("comanda") || "",
      payment_method: order.paymentMethod || "card",
      payment_status: order.paymentStatus || result.payment_status,
      total: order.total || 0,
      tracking_url: trackingHref,
      tracking_token: stored.tracking_token || "",
    }));
    render({ type: "success", eyebrow: "Plată confirmată", title: "Comanda ta este confirmată!", copy: `Am înregistrat plata și am trimis detaliile comenzii la ${order.customerEmail || "adresa ta de e-mail"}.`, orderNumber: order.orderNumber || params.get("comanda") || "", total: Number(order.total || 0), trackingHref });
  } catch (error) {
    render({ type: "pending", eyebrow: "Verificare temporar indisponibilă", title: "Confirmarea plății întârzie", copy: error?.message || "Încearcă din nou peste câteva momente. Coșul nu a fost șters.", orderNumber: params.get("comanda") || "", primaryHref: `${location.pathname}${location.search}`, primaryLabel: "Verifică din nou" });
  }
}

async function cancelPayment() {
  const status = String(params.get("status") || "cancelled").trim().toLowerCase();
  const orderNumber = String(params.get("comanda") || "").trim();
  if (status === "failed") {
    render({ type: "error", eyebrow: "Plată nereușită", title: "Plata nu a putut fi finalizată", copy: "Plata nu a fost confirmată. Produsele au rămas în coș și poți încerca din nou sau poți alege plata la livrare.", orderNumber, primaryHref: "/checkout", primaryLabel: "Încearcă din nou", showAccount: false });
    return;
  }
  const token = String(params.get("token") || "").trim();
  let copy = "Sesiunea de plată a fost închisă, iar produsele au rămas în coș. Poți reveni oricând pentru a încerca din nou.";
  if (orderNumber && token.length >= 32) {
    try { await checkoutApi.cancelStripe(orderNumber, token); }
    catch (error) { copy = error?.message || "Plata nu a fost finalizată. Produsele tale au rămas în coș."; }
  }
  render({ type: "cancelled", eyebrow: "Plată anulată", title: "Plata a fost anulată", copy, orderNumber, primaryHref: "/checkout", primaryLabel: "Înapoi la checkout", showAccount: false });
}

await initShell({ active: "cart" });
if (mode === "success" && params.get("metoda") === "cash_on_delivery") confirmCashOnDelivery();
else if (mode === "success") await confirmPayment();
else await cancelPayment();

import { checkoutApi, STORAGE_KEYS } from "./cubis-commerce-api.mjs?v=20261013-checkout";
import { commerce, escapeHtml, icon, initShell, money } from "./cubis-storefront.mjs?v=20261013-payment";

const mode = document.body.dataset.paymentResult;
const card = document.querySelector("[data-payment-result-card]");
const params = new URLSearchParams(location.search);

function actionButtons({ retry = false, account = false } = {}) {
  return `<div class="cs-payment-result__actions">${retry ? '<a class="is-primary" href="/checkout">Încearcă din nou <span aria-hidden="true">→</span></a>' : '<a class="is-primary" href="/magazin">Continuă cumpărăturile <span aria-hidden="true">→</span></a>'}${account ? '<a href="/cont#orders">Vezi comenzile</a>' : '<a href="/contact">Ai nevoie de ajutor?</a>'}</div>`;
}

function render({ type, eyebrow, title, copy, orderNumber = "", total = null, retry = false }) {
  const authenticated = Boolean(localStorage.getItem(STORAGE_KEYS.customerToken));
  card.className = `cs-payment-result is-${type}`;
  card.setAttribute("aria-busy", "false");
  card.innerHTML = `<span class="cs-payment-result__icon">${icon(type === "success" ? "check" : type === "cancelled" ? "rotate" : "info")}</span><small>${escapeHtml(eyebrow)}</small><h1>${escapeHtml(title)}</h1><p>${escapeHtml(copy)}</p>${orderNumber ? `<div class="cs-payment-result__receipt"><span>Comanda <strong>${escapeHtml(orderNumber)}</strong></span>${total !== null ? `<b>${money(total)}</b>` : ""}</div>` : ""}${actionButtons({ retry, account: authenticated && !retry })}`;
}

async function confirmPayment() {
  const sessionId = String(params.get("session_id") || "").trim();
  if (!/^cs_test_[A-Za-z0-9]+$/.test(sessionId)) {
    render({ type: "error", eyebrow: "Verificare imposibilă", title: "Linkul de confirmare nu este valid", copy: "Nu am găsit identificatorul securizat al plății. Coșul tău a rămas neschimbat.", retry: true });
    return;
  }
  try {
    const result = await checkoutApi.stripeStatus(sessionId);
    const paid = ["paid", "no_payment_required"].includes(String(result?.payment_status || ""));
    if (!paid) {
      render({ type: "error", eyebrow: "Plată în așteptare", title: "Plata nu este încă confirmată", copy: "Procesatorul nu a confirmat încă plata. Poți reveni în checkout pentru a relua pasul de plată.", orderNumber: result?.order?.orderNumber || params.get("comanda") || "", retry: true });
      return;
    }
    const order = result.order || {};
    commerce.clearCart();
    sessionStorage.setItem(STORAGE_KEYS.checkout, JSON.stringify({
      order_number: order.orderNumber || params.get("comanda") || "",
      payment_method: order.paymentMethod || "card",
      payment_status: order.paymentStatus || result.payment_status,
      total: order.total || 0,
    }));
    render({ type: "success", eyebrow: "Plată confirmată", title: "Comanda ta este confirmată!", copy: `Am înregistrat plata și am trimis detaliile comenzii la ${order.customerEmail || "adresa ta de e-mail"}.`, orderNumber: order.orderNumber || params.get("comanda") || "", total: Number(order.total || 0) });
  } catch (error) {
    render({ type: "error", eyebrow: "Verificare temporar indisponibilă", title: "Nu am putut confirma plata", copy: error?.message || "Încearcă din nou peste câteva momente. Coșul nu a fost șters.", orderNumber: params.get("comanda") || "", retry: true });
  }
}

async function cancelPayment() {
  const orderNumber = String(params.get("comanda") || "").trim();
  const token = String(params.get("token") || "").trim();
  let copy = "Plata nu a fost efectuată, iar produsele au rămas în coș. Poți reveni oricând pentru a încerca din nou.";
  if (orderNumber && token.length >= 32) {
    try { await checkoutApi.cancelStripe(orderNumber, token); }
    catch (error) { copy = error?.message || "Plata nu a fost finalizată. Produsele tale au rămas în coș."; }
  }
  render({ type: "cancelled", eyebrow: "Plată nefinalizată", title: "Comanda nu a fost plătită", copy, orderNumber, retry: true });
}

await initShell({ active: "cart" });
if (mode === "success") await confirmPayment();
else await cancelPayment();

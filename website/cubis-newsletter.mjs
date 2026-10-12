import { commerceApiRequest } from "./cubis-commerce-api.mjs";

export const NEWSLETTER_CONSENT_VERSION = "2026-10-12";

function modalDocument(root) {
  if (root?.nodeType === 9) return root;
  return root?.ownerDocument || (typeof document !== "undefined" ? document : null);
}

function modalElement(doc, tag, className, text = "") {
  const node = doc.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function createNewsletterSuccessModal(doc) {
  const modal = modalElement(doc, "dialog", "cs-newsletter-success-modal");
  modal.dataset.newsletterSuccessModal = "true";
  modal.setAttribute("aria-labelledby", "newsletter-success-title");
  modal.setAttribute("aria-describedby", "newsletter-success-description");

  const panel = modalElement(doc, "div", "cs-newsletter-success-modal__panel");
  const close = modalElement(doc, "button", "cs-newsletter-success-modal__close", "×");
  close.type = "button";
  close.setAttribute("aria-label", "Închide confirmarea abonării");

  const visual = modalElement(doc, "div", "cs-newsletter-success-modal__visual");
  visual.setAttribute("aria-hidden", "true");
  const check = modalElement(doc, "span", "cs-newsletter-success-modal__check");
  visual.append(check);
  for (let index = 0; index < 8; index += 1) {
    const spark = modalElement(doc, "i", "cs-newsletter-success-modal__spark");
    spark.style.setProperty("--spark-index", String(index));
    visual.append(spark);
  }

  const eyebrow = modalElement(doc, "p", "cs-newsletter-success-modal__eyebrow", "ABONARE CONFIRMATĂ");
  const title = modalElement(doc, "h2", "", "Te-ai abonat cu succes!");
  title.id = "newsletter-success-title";
  const description = modalElement(doc, "p", "cs-newsletter-success-modal__description", "De acum vei primi pe email oferte speciale și noutăți despre produsele noi adăugate pe website-ul Cubis Shop.");
  description.id = "newsletter-success-description";

  const benefits = modalElement(doc, "div", "cs-newsletter-success-modal__benefits");
  ["Oferte speciale", "Produse noi"].forEach(text => {
    const benefit = modalElement(doc, "span", "");
    benefit.append(modalElement(doc, "i", "", "✓"), doc.createTextNode(text));
    benefits.append(benefit);
  });

  const action = modalElement(doc, "button", "cs-newsletter-success-modal__action", "Continuă cumpărăturile");
  action.type = "button";
  const note = modalElement(doc, "small", "cs-newsletter-success-modal__note", "Te poți dezabona oricând din orice email primit.");
  panel.append(close, visual, eyebrow, title, description, benefits, action, note);
  modal.append(panel);

  let closeTimer = 0;
  const finishClose = () => {
    clearTimeout(closeTimer);
    modal.classList.remove("is-visible", "is-closing");
    if (typeof modal.close === "function" && modal.open) modal.close();
    else modal.removeAttribute("open");
    doc.documentElement?.classList.remove("cs-newsletter-modal-open");
  };
  const closeAnimated = () => {
    if (!modal.hasAttribute("open") && !modal.open) return;
    modal.classList.add("is-closing");
    modal.classList.remove("is-visible");
    const reducedMotion = doc.defaultView?.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    closeTimer = setTimeout(finishClose, reducedMotion ? 0 : 260);
  };
  close.addEventListener("click", closeAnimated);
  action.addEventListener("click", closeAnimated);
  modal.addEventListener("click", event => { if (event.target === modal) closeAnimated(); });
  modal.addEventListener("cancel", event => { event.preventDefault(); closeAnimated(); });
  modal.addEventListener("close", () => doc.documentElement?.classList.remove("cs-newsletter-modal-open"));
  modal.closeAnimated = closeAnimated;
  doc.body.append(modal);
  return modal;
}

export function showNewsletterSuccess({ root = typeof document !== "undefined" ? document : null } = {}) {
  const doc = modalDocument(root);
  if (!doc?.body || typeof doc.createElement !== "function") return false;
  const modal = doc.querySelector("[data-newsletter-success-modal]") || createNewsletterSuccessModal(doc);
  if (modal.open) modal.close();
  modal.classList.remove("is-closing", "is-visible");
  doc.documentElement?.classList.add("cs-newsletter-modal-open");
  if (typeof modal.showModal === "function") modal.showModal();
  else modal.setAttribute("open", "");
  const reveal = () => {
    modal.classList.add("is-visible");
    modal.querySelector(".cs-newsletter-success-modal__action")?.focus({ preventScroll: true });
  };
  if (typeof doc.defaultView?.requestAnimationFrame === "function") doc.defaultView.requestAnimationFrame(reveal);
  else reveal();
  return true;
}

export function bindNewsletter({ root = document, previewDemo = false, request = commerceApiRequest } = {}) {
  root.querySelectorAll("[data-newsletter-form]").forEach(form => {
    if (form.dataset.newsletterBound) return;
    const section = form.closest(".cs-newsletter");
    const message = section?.querySelector("[data-newsletter-message]");
    const email = form.querySelector('[name="email"]');
    const button = form.querySelector('[type="submit"]');
    const label = button?.querySelector("[data-newsletter-label]");
    const honeypot = form.querySelector('[name="website"]');
    if (!message || !email || !button || !label) return;
    form.dataset.newsletterBound = "true";
    let pending = false;
    const show = (text, state) => {
      message.hidden = false;
      message.dataset.state = state;
      message.textContent = text;
    };
    form.addEventListener("submit", async event => {
      event.preventDefault();
      if (pending) return;
      email.value = email.value.trim();
      if (!form.reportValidity()) return;
      if (previewDemo) {
        show("Mod DEMO: abonările reale sunt dezactivate. Nu s-a salvat nicio adresă.", "error");
        return;
      }
      pending = true;
      button.disabled = true;
      email.readOnly = true;
      form.setAttribute("aria-busy", "true");
      label.textContent = "Se trimite…";
      show("Se salvează abonarea…", "pending");
      try {
        const result = await request("subscribePublicNewsletter", {
          method: "POST", auth: false,
          body: { email: email.value, consent: true, consent_version: NEWSLETTER_CONSENT_VERSION, website: honeypot?.value || "" },
        });
        if (result?.success !== true) throw new Error("Serverul nu a confirmat abonarea. Încearcă din nou mai târziu.");
        show("Abonarea ta este activă. Mulțumim! Te poți dezabona oricând din emailurile primite.", "success");
        form.reset();
        showNewsletterSuccess({ root });
      } catch (error) {
        // The local static server may still proxy an API version without this action.
        const unavailable = /autentific|token|necunoscut|\((401|404|405)\)/i.test(error?.message || "");
        show(unavailable
          ? "Abonarea nu este încă disponibilă pe acest server. Adresa nu a fost salvată."
          : error?.message || "Abonarea nu a putut fi confirmată. Verifică conexiunea și încearcă din nou.", "error");
      } finally {
        pending = false;
        button.disabled = false;
        email.readOnly = false;
        form.removeAttribute("aria-busy");
        label.textContent = "Mă abonez";
      }
    });
  });
}

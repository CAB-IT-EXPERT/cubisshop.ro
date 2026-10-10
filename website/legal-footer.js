(() => {
  const COMPONENT_VERSION = '20261004-free-shipping-v1';
  if (window.__gtLegalFooterVersion === COMPONENT_VERSION) return;
  window.__gtLegalFooterVersion = COMPONENT_VERSION;
  window.__gtLegalFooter = true;
  document.documentElement.classList.add('commerce-preview');

  const CACHE_KEY = 'cubis-public-shop-config-v1';
  const CACHE_TTL = 5 * 60 * 1000;
  const API_URL = '/shop-api/api-v2.php';
  const companyFallback = {
    legal_name: '',
    trade_name: 'Cubis Shop',
    email: 'contact@cubisshop.ro',
    phone: '',
    website: 'https://cubisshop.ro',
    cui: '',
    registration_number: '',
    address: '',
    city: '',
    county: '',
    postal_code: '',
    country: 'România',
    physical_address: '',
    bank_name: '',
    iban: '',
    share_capital: '',
  };

  const loadAsset = (tag, attributes) => {
    const element = document.createElement(tag);
    Object.assign(element, attributes);
    document.head.append(element);
    return element;
  };
  const esc = value => String(value || '').replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]);

  function ensurePromotionLayer() {
    const hasGlobalStyle = Array.from(document.querySelectorAll('link[href*="promotions.css"]')).some(link => {
      const url = new URL(link.href, location.href);
      return url.pathname.endsWith('/promotions.css') && url.search === '';
    });
    if (!hasGlobalStyle) loadAsset('link', { rel: 'stylesheet', href: '/promotions.css' });

    const hasGlobalScript = Array.from(document.querySelectorAll('script[src*="promotions.js"]')).some(script => {
      const url = new URL(script.src, location.href);
      return url.pathname.endsWith('/promotions.js') && url.search === '';
    });
    if (!hasGlobalScript) loadAsset('script', { src: '/promotions.js', defer: true });
  }

  if (!document.querySelector('link[href*="fonts.googleapis.com/css2?family=Manrope"]')) {
    loadAsset('link', {
      rel: 'stylesheet',
      href: 'https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&display=swap',
      media: 'print',
      onload() { this.media = 'all'; },
    });
  }
  loadAsset('link', { rel: 'stylesheet', href: '/legal-footer.css?v=20260920-public-theme-v1' });
  // Generated catalogue pages may still reference a cached, older stylesheet.
  // Keep it until the current revision loads, preserving its cascade position.
  const catalogStyles = document.querySelector('link[rel="stylesheet"][href*="magazin.css"]');
  if (catalogStyles && new URL(catalogStyles.href).searchParams.get('v') !== '20260920-list-theme-v2') {
    const currentStyles = catalogStyles.cloneNode();
    const currentUrl = new URL(catalogStyles.href);
    currentUrl.searchParams.set('v', '20260920-list-theme-v2');
    currentStyles.href = currentUrl.href;
    currentStyles.onload = () => catalogStyles.remove();
    currentStyles.onerror = () => currentStyles.remove();
    catalogStyles.after(currentStyles);
  }
  if (!document.querySelector('link[href*="theme.css"]')) {
    loadAsset('link', { rel: 'stylesheet', href: '/theme.css?v=20260920-public-theme-v11' });
  }
  if (!document.querySelector('script[src*="theme.js"]')) {
    loadAsset('script', { src: '/theme.js?v=20260920-public-theme-v11', async: false });
  }
  if (!document.querySelector('script[src*="cookie-consent.js"]')) {
    loadAsset('script', { src: '/cookie-consent.js?v=20260907-meta-v6', async: true });
  }

  function phoneHref(phone) {
    let digits = String(phone || '').replace(/\D/g, '');
    if (digits.startsWith('0040')) digits = digits.slice(2);
    if (digits.startsWith('40')) return `tel:+${digits}`;
    if (digits.startsWith('0')) return `tel:+40${digits.slice(1)}`;
    return digits ? `tel:+40${digits}` : '#';
  }

  function whatsappHref(phone) {
    let digits = String(phone || '').replace(/\D/g, '');
    if (digits.startsWith('0040')) digits = digits.slice(2);
    if (digits.startsWith('0')) digits = `40${digits.slice(1)}`;
    if (!digits.startsWith('40') || digits.length < 10) return '#';
    const message = 'Bună, am nevoie de ajutor cu trotineta mea electrică.';
    return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
  }

  function ensureWhatsAppSticky(company) {
    if (document.querySelector('.whatsapp-sticky')) return;
    const href = whatsappHref(company?.phone);
    if (href === '#') return;
    const link = document.createElement('a');
    link.className = 'whatsapp-sticky';
    link.setAttribute('data-gt-whatsapp-sticky', '');
    link.href = href;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.setAttribute('aria-label', 'Trimite mesaj Cubis Shop pe WhatsApp');
    link.innerHTML = '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M16 3a12.8 12.8 0 0 0-11 19.3L3.4 29l6.9-1.6A12.9 12.9 0 1 0 16 3Zm0 23.3c-2 0-3.8-.5-5.4-1.5l-.4-.2-4 .9.9-3.9-.3-.4A10.3 10.3 0 1 1 16 26.3Zm5.7-7.7c-.3-.2-1.9-.9-2.2-1s-.5-.2-.7.2-.8 1-1 1.2-.4.2-.7.1a8.5 8.5 0 0 1-2.5-1.6 9.3 9.3 0 0 1-1.7-2.1c-.2-.3 0-.5.1-.7l.5-.6.3-.6c.1-.2 0-.4 0-.6l-1-2.3c-.2-.6-.5-.5-.7-.5h-.6c-.2 0-.6.1-.9.4-.3.4-1.2 1.2-1.2 2.9s1.3 3.4 1.5 3.6c.2.2 2.5 3.8 6 5.3 3.6 1.6 3.6 1 4.3.9.6 0 1.9-.8 2.2-1.6.3-.8.3-1.5.2-1.6-.1-.2-.3-.3-.6-.4Z"/></svg><span>WhatsApp</span>';
    document.body.append(link);
  }

  function companyAddress(company) {
    return [company.address, company.postal_code, company.city, company.county, company.country].filter(Boolean).join(', ');
  }

  function companyPublicAddress(company) {
    return String(company.physical_address || '').trim() || 'Neconfigurat';
  }

  function renderCompanyBindings(company) {
    const values = { physical_address: companyPublicAddress(company) };
    Object.entries(values).forEach(([key, value]) => {
      document.querySelectorAll(`[data-company="${key}"]`).forEach(element => { element.textContent = value; });
    });
  }

  function renderCompanyProfiles(company) {
    const address = companyAddress(company);
    const bank = [company.bank_name, company.iban].filter(Boolean).join(' · ');
    const profileHtml = `
      <div class="gt-company-profile__heading"><span>DATE OFICIALE</span><h2>Comerciantul Cubis Shop</h2><p>Informațiile sunt administrate central din aplicațiile Cubis Shop și se actualizează în toate paginile publice.</p></div>
      <dl class="gt-company-profile__grid">
        <div><dt>Denumire juridică</dt><dd>${esc(company.legal_name || 'Necompletat')}</dd></div>
        <div><dt>CUI / CIF</dt><dd>${esc(company.cui || 'Necompletat')}</dd></div>
        <div><dt>Registrul Comerțului</dt><dd>${esc(company.registration_number || 'Necompletat')}</dd></div>
        <div><dt>Sediu social</dt><dd>${esc(address || 'Necompletat')}</dd></div>
        <div><dt>Adresă publică / zonă</dt><dd>${esc(companyPublicAddress(company))}</dd></div>
        <div><dt>Telefon</dt><dd>${company.phone ? `<a href="${phoneHref(company.phone)}">${esc(company.phone)}</a>` : 'Necompletat'}</dd></div>
        <div><dt>E-mail</dt><dd>${company.email ? `<a href="mailto:${esc(company.email)}">${esc(company.email)}</a>` : 'Necompletat'}</dd></div>
        <div><dt>Website</dt><dd>${company.website ? `<a href="${esc(company.website)}">${esc(company.website)}</a>` : 'Necompletat'}</dd></div>
        <div><dt>Date bancare</dt><dd>${esc(bank || 'Se completează din aplicațiile G-Trots')}</dd></div>
      </dl>`;

    const legalContent = document.querySelector('.legal-content');
    if (legalContent && !legalContent.querySelector('[data-gt-company-profile]')) {
      const card = document.createElement('article');
      card.className = 'legal-card gt-company-profile';
      card.dataset.gtCompanyProfile = '';
      card.innerHTML = profileHtml;
      legalContent.prepend(card);
    }

    const aboutAnswer = document.querySelector('.about-answer');
    if (aboutAnswer && !document.querySelector('.about-company')) {
      const section = document.createElement('section');
      section.className = 'about-company';
      section.setAttribute('aria-label', 'Datele oficiale ale comerciantului');
      section.innerHTML = `<div class="about-shell gt-company-profile" data-gt-company-profile>${profileHtml}</div>`;
      aboutAnswer.after(section);
    }
  }

  function ensureOriginalHeader() {
    if (/^\/googledb9a3f7a7ad1d21d(?:\.html)?\/?$/i.test(location.pathname)) return;

    const currentPath = location.pathname.toLowerCase().replace(/\/+$/, '').replace(/\.html$/, '') || '/';
    const shopActive = /\/(magazin|produs)(?:\/|$)|anvelopa-g10|display-smart|incarcator-fastcharge|motor-dualhub|baterie-powercore|kit-frana/.test(currentPath);
    const servicePage = currentPath === '/service-trotinete-electrice' || currentPath.startsWith('/service-trotinete-electrice-');
    const contactActive = currentPath === '/contact';
    const guidesActive = !shopActive && !servicePage && !contactActive && (
      currentPath === '/ghiduri-service-trotinete-electrice'
      || currentPath.startsWith('/ghid-')
      || Boolean(document.querySelector('main.seo-page'))
    );
    const navigationHtml = `
          <div class="mobile-nav-heading" aria-hidden="true"><span>Meniu</span><small>G-Trots</small></div>
          <a href="/#servicii">Servicii</a>
          <a class="nav-shop-link${shopActive ? ' active' : ''}" href="/magazin"${shopActive ? ' aria-current="page"' : ''}><span class="nav-shop-icon" aria-hidden="true"></span><span>Shop</span></a>
          <a href="/ghiduri-service-trotinete-electrice"${guidesActive ? ' aria-current="page"' : ''}>Ghiduri</a>
          <a href="/#proces">Cum lucrăm</a>
          <a href="/#intrebari">Întrebări</a>
          <a href="/contact"${contactActive ? ' aria-current="page"' : ''}>Contact</a>
          <a class="mobile-nav-account" href="/login" aria-label="Intră în cont sau creează un cont"><span class="mobile-nav-account-avatar" aria-hidden="true"><i></i></span><span class="mobile-nav-account-copy"><small>CONT G-TROTS</small><strong>Login</strong></span><b aria-hidden="true">›</b></a>
          <a class="mobile-nav-call" href="/contact"><span aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M6.6 10.8c1.7 3.3 3.3 4.9 6.6 6.6l2.2-2.2c.3-.3.7-.4 1.1-.3 1.2.4 2.4.6 3.6.6.6 0 .9.4.9.9V20c0 .6-.4 1-1 1C10.6 21 3 13.4 3 4c0-.6.4-1 1-1h3.6c.5 0 .9.3.9.8.1 1.3.3 2.5.6 3.6.1.4 0 .8-.3 1.1l-2.2 2.3Z"/></svg></span><strong>Sună chiar acum</strong><small>Contact</small></a>`;

    const callButtonHtml = `Sună acum <span aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M6.6 10.8c1.7 3.3 3.3 4.9 6.6 6.6l2.2-2.2c.3-.3.7-.4 1.1-.3 1.2.4 2.4.6 3.6.6.6 0 .9.4.9.9V20c0 .6-.4 1-1 1C10.6 21 3 13.4 3 4c0-.6.4-1 1-1h3.6c.5 0 .9.3.9.8.1 1.3.3 2.5.6 3.6.1.4 0 .8-.3 1.1l-2.2 2.3Z"/></svg></span>`;

    const existingHeader = document.querySelector('.site-header:not(.legal-top)');
    let header = existingHeader;
    if (!header) {
      const legacyHeader = document.querySelector('.legal-top, .tracking-header');
      header = document.createElement('header');
      header.className = 'site-header gt-public-header';
      header.innerHTML = `
      <div class="header-inner">
        <a class="logo" href="/" aria-label="G-Trots, pagina principală">
          <img src="/assets/favicon.png" width="128" height="128" alt="">
          <b><span>G</span>-Trots</b>
        </a>
        <nav class="main-nav" aria-label="Navigație principală">
${navigationHtml}
        </nav>
        <a class="button button-small header-cta call-button" href="/contact">
          ${callButtonHtml}
        </a>
        <button class="menu-toggle" type="button" aria-label="Deschide meniul" aria-expanded="false"><span></span><span></span></button>
      </div>`;
      if (legacyHeader) legacyHeader.replaceWith(header);
      else document.body.prepend(header);
    }

    header.classList.add('gt-public-header');
    const headerInner = header.querySelector('.header-inner');
    const logo = header.querySelector('.logo');
    if (logo) {
      logo.href = '/';
      logo.setAttribute('aria-label', 'G-Trots, pagina principală');
      logo.innerHTML = '<img src="/assets/favicon.png" width="128" height="128" alt=""><b><span>G</span>-Trots</b>';
    }

    let nav = header.querySelector('.main-nav');
    if (!nav && headerInner) {
      nav = document.createElement('nav');
      nav.className = 'main-nav';
      headerInner.append(nav);
    }
    if (!nav) return;
    nav.setAttribute('aria-label', 'Navigație principală');
    nav.innerHTML = navigationHtml;

    let callButton = header.querySelector('.header-cta');
    if (!callButton && headerInner) {
      callButton = document.createElement('a');
      headerInner.insertBefore(callButton, headerInner.querySelector('.global-shop-actions, .menu-toggle'));
    }
    if (callButton) {
      callButton.className = 'button button-small header-cta call-button';
      callButton.href = '/contact';
      callButton.innerHTML = callButtonHtml;
    }

    let toggle = header.querySelector('.menu-toggle');
    if (!toggle && headerInner) {
      toggle = document.createElement('button');
      toggle.className = 'menu-toggle';
      toggle.type = 'button';
      toggle.innerHTML = '<span></span><span></span>';
      headerInner.append(toggle);
    }
    if (!toggle) return;
    // Unele pagini statice au încă un handler inline pentru vechiul navbar.
    // Înlocuirea butonului păstrează aspectul și elimină handler-ele duplicate,
    // altfel aceeași atingere deschide și închide imediat meniul pe mobil.
    const cleanToggle = toggle.cloneNode(true);
    toggle.replaceWith(cleanToggle);
    toggle = cleanToggle;
    toggle.setAttribute('aria-label', 'Deschide meniul');
    toggle.setAttribute('aria-expanded', 'false');
    toggle.dataset.gtNavigationBound = 'true';
    toggle.dataset.favoritesMenuBound = 'true';
    document.dispatchEvent(new CustomEvent('g-trots:customer-changed'));

    const syncMobileAccount = () => {
      const account = nav.querySelector('.mobile-nav-account');
      if (!account) return;
      let customer = null;
      let loggedIn = false;
      try {
        loggedIn = Boolean(localStorage.getItem('g-trots-customer-session-v1'));
        customer = loggedIn ? JSON.parse(localStorage.getItem('g-trots-customer-profile-v1') || 'null') : null;
      } catch { /* localStorage poate fi indisponibil */ }
      const name = customer ? String(customer.full_name || 'Contul meu').trim().split(/\s+/)[0] : 'Login';
      account.href = loggedIn && customer ? '/cont' : '/login';
      account.setAttribute('aria-label', loggedIn && customer ? `Deschide contul lui ${name}` : 'Intră în cont sau creează un cont');
      account.querySelector('small').textContent = loggedIn && customer ? 'CONTUL TĂU' : 'CONT G-TROTS';
      account.querySelector('strong').textContent = name;
      account.classList.toggle('is-authenticated', Boolean(loggedIn && customer));
    };
    const setOpen = open => {
      document.body.classList.toggle('menu-open', open);
      nav.classList.toggle('open', open);
      toggle.setAttribute('aria-expanded', String(open));
      toggle.setAttribute('aria-label', open ? 'Închide meniul' : 'Deschide meniul');
    };
    toggle.addEventListener('click', event => {
      event.preventDefault();
      event.stopImmediatePropagation();
      setOpen(!nav.classList.contains('open'));
    });
    nav.addEventListener('click', event => { if (event.target.closest('a')) setOpen(false); });
    document.addEventListener('click', event => {
      if (nav.classList.contains('open') && !header.contains(event.target)) setOpen(false);
    }, true);
    addEventListener('keydown', event => { if (event.key === 'Escape') setOpen(false); });
    addEventListener('resize', () => { if (innerWidth > 900) setOpen(false); }, { passive: true });
    addEventListener('storage', event => {
      if (event.key === 'g-trots-customer-session-v1' || event.key === 'g-trots-customer-profile-v1') syncMobileAccount();
    });
    syncMobileAccount();
  }

  function ensureShopNavigation() {
    if (!document.querySelector('link[href*="favorites.css"]')) {
      loadAsset('link', { rel: 'stylesheet', href: '/favorites.css?v=20260909-nav-v2' });
    }
    if (!document.querySelector('script[src*="favorites.js"]')) {
      loadAsset('script', { src: '/favorites.js?v=20260910-navbar-v1' });
    }
  }

  function ensureStaticStoreShortcut() {
    const currentPath = location.pathname.toLowerCase().replace(/\/+$/, '').replace(/\.html$/, '') || '/';
    const commercePath = /^\/(?:magazin|cos|checkout|favorite|cont|login|cont-nou|resetare-parola|plata-finalizata|plata-esuata)(?:\/|$)/.test(currentPath)
      || /(?:anvelopa-g10|display-smart|incarcator-fastcharge|motor-dualhub|baterie-powercore|kit-frana)$/.test(currentPath);
    if (commercePath || document.body.dataset.productId || document.querySelector('main.product-page, [data-product-detail]')) return;
    if (document.querySelector('[data-gt-store-shortcut]')) return;

    const shortcut = document.createElement('a');
    shortcut.className = 'gt-store-shortcut';
    shortcut.href = '/magazin';
    shortcut.dataset.gtStoreShortcut = '';
    shortcut.setAttribute('aria-label', 'Intră în magazinul G-Trots');
    shortcut.innerHTML = `
      <span class="gt-store-shortcut__label" aria-hidden="true">Vezi magazinul</span>
      <span class="gt-store-shortcut__icon" aria-hidden="true">
        <svg viewBox="0 0 24 24"><path d="M6.8 8.1h10.4l1.15 11H5.65l1.15-11Z"/><path d="M9 9V6.6a3 3 0 0 1 6 0V9"/></svg>
      </span>`;
    document.body.append(shortcut);

    const storeCta = Array.from(document.querySelectorAll('a[href="/magazin"], a[href^="/magazin?"]'))
      .find(link => !link.closest('header, footer, nav') && /magazin|produse/i.test(link.textContent || ''));
    let frame = 0;
    const update = () => {
      frame = 0;
      const revealAfter = storeCta
        ? storeCta.getBoundingClientRect().bottom + scrollY + 20
        : Math.max(innerHeight * 0.7, 420);
      shortcut.classList.toggle('is-visible', scrollY > revealAfter);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    addEventListener('scroll', schedule, { passive: true });
    addEventListener('resize', schedule, { passive: true });
    update();
  }

  function cachedConfig() {
    try {
      const cached = JSON.parse(sessionStorage.getItem(CACHE_KEY) || 'null');
      return cached && Date.now() - Number(cached.saved_at || 0) < CACHE_TTL ? cached.data : null;
    } catch {
      return null;
    }
  }

  function loadConfig() {
    if (window.GTrotsPublicConfigPromise) return window.GTrotsPublicConfigPromise;
    const cached = cachedConfig();
    window.GTrotsPublicConfigPromise = cached
      ? Promise.resolve(cached)
      : fetch(`${API_URL}?action=publicShopConfig`, { headers: { Accept: 'application/json' } })
        .then(response => response.ok ? response.json() : null)
        .then(data => {
          if (data) {
            try { sessionStorage.setItem(CACHE_KEY, JSON.stringify({ saved_at: Date.now(), data })); } catch { /* storage can be disabled */ }
          }
          return data;
        });
    return window.GTrotsPublicConfigPromise;
  }

  function appendOrganizationSchema(company) {
    if (document.querySelector('[data-gt-organization-schema]')) return;
    const hasAddress = company.address || company.city || company.county || company.postal_code;
    const schema = {
      '@context': 'https://schema.org',
      '@type': 'OnlineStore',
      name: company.trade_name || company.legal_name || 'Cubis Shop',
      alternateName: 'Cubis Shop',
      url: `${location.origin}/`,
      logo: `${location.origin}/assets/logo.png`,
      hasMerchantReturnPolicy: {
        '@type': 'MerchantReturnPolicy',
        applicableCountry: 'RO',
        returnPolicyCountry: 'RO',
        returnPolicyCategory: 'https://schema.org/MerchantReturnFiniteReturnWindow',
        merchantReturnDays: 30,
        returnMethod: 'https://schema.org/ReturnByMail',
        returnFees: 'https://schema.org/ReturnFeesCustomerResponsibility',
        merchantReturnLink: `${location.origin}/politica-de-retur`,
      },
    };
    if (company.legal_name) schema.legalName = company.legal_name;
    if (company.email || company.phone) schema.contactPoint = { '@type': 'ContactPoint', contactType: 'customer service', email: company.email || undefined, telephone: company.phone || undefined };
    if (company.email) schema.email = company.email;
    if (company.phone) schema.telephone = company.phone;
    if (company.cui) schema.taxID = company.cui;
    if (hasAddress) schema.address = { '@type': 'PostalAddress', streetAddress: company.address || undefined, postalCode: company.postal_code || undefined, addressLocality: company.city || undefined, addressRegion: company.county || undefined, addressCountry: 'RO' };
    const script = document.createElement('script');
    script.type = 'application/ld+json';
    script.dataset.gtOrganizationSchema = '';
    script.textContent = JSON.stringify(schema);
    document.head.append(script);
  }

  function paymentMarks() {
    return `
      <span class="gt-pay-mark gt-pay-visa" role="img" aria-label="Visa"><svg viewBox="0 0 72 28" aria-hidden="true"><text x="36" y="20" text-anchor="middle">VISA</text></svg></span>
      <span class="gt-pay-mark gt-pay-mastercard" role="img" aria-label="Mastercard"><svg viewBox="0 0 72 28" aria-hidden="true"><circle cx="30" cy="14" r="9"/><circle cx="42" cy="14" r="9"/><path d="M36 7.3a9 9 0 0 1 0 13.4A9 9 0 0 1 36 7.3Z"/></svg></span>
      <span class="gt-pay-mark gt-pay-google" role="img" aria-label="Google Pay"><svg viewBox="0 0 82 28" aria-hidden="true"><g transform="translate(3 2)"><path fill="#4285f4" d="M21.6 12.23c0-.71-.06-1.4-.18-2.05H12v3.87h5.38a4.6 4.6 0 0 1-2 3.02v2.51h3.24c1.9-1.75 2.98-4.33 2.98-7.35Z"/><path fill="#34a853" d="M12 22c2.7 0 4.96-.9 6.62-2.42l-3.24-2.51c-.9.6-2.05.96-3.38.96-2.61 0-4.82-1.76-5.61-4.13H3.04v2.59A10 10 0 0 0 12 22Z"/><path fill="#fbbc05" d="M6.39 13.9a6.02 6.02 0 0 1 0-3.8V7.51H3.04A10 10 0 0 0 2 12c0 1.61.38 3.14 1.04 4.49l3.35-2.59Z"/><path fill="#ea4335" d="M12 5.97c1.47 0 2.79.5 3.83 1.5L18.7 4.6A9.6 9.6 0 0 0 12 2a10 10 0 0 0-8.96 5.51l3.35 2.59C7.18 7.73 9.39 5.97 12 5.97Z"/></g><text x="31" y="20">Pay</text></svg></span>
      <span class="gt-pay-mark gt-pay-apple" role="img" aria-label="Apple Pay"><svg viewBox="0 0 76 28" aria-hidden="true"><path d="M18.7 9.2c-1.1 0-2.8-1.2-4.6-1.2-2.3 0-4.4 1.3-5.6 3.4-2.4 4.2-.6 10.3 1.7 13.6 1.1 1.6 2.4 3.4 4.2 3.3 1.7-.1 2.3-1.1 4.4-1.1 2 0 2.6 1.1 4.4 1.1 1.8 0 3-1.6 4.1-3.2 1.3-1.9 1.8-3.8 1.8-3.9-.1 0-3.5-1.3-3.5-5.4 0-3.4 2.8-5 2.9-5.1-1.6-2.3-4.1-2.6-5-2.7-2.3-.2-4.2 1.2-5.2 1.2Zm3.6-3.5c.9-1.1 1.5-2.7 1.3-4.2-1.3.1-2.9.9-3.9 2-.8.9-1.5 2.5-1.3 4 1.5.1 3-.7 3.9-1.8Z" transform="translate(0 -1) scale(.72)"/><text x="27" y="20">Pay</text></svg></span>
      <span class="gt-pay-mark gt-pay-stripe" role="img" aria-label="Stripe"><svg viewBox="0 0 76 28" aria-hidden="true"><text x="38" y="20" text-anchor="middle">stripe</text></svg></span>`;
  }

  function socialLinks() {
    return '';
  }

  function themeControl() {
    return `
      <div class="gt-theme-control">
        <span>Aspect website</span>
        <button class="gt-theme-switch" type="button" data-theme-toggle aria-label="Schimbă tema website-ului">
          <span data-theme-option="light"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.65 17.65l1.42 1.42M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.65 6.35l1.42-1.42"/></svg>Zi</span>
          <span data-theme-option="dark"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.4 15.1A8.5 8.5 0 0 1 8.9 3.6 8.5 8.5 0 1 0 20.4 15.1Z"/></svg>Noapte</span>
        </button>
      </div>`;
  }

  function render(company) {
    ensureWhatsAppSticky(company);
    if (document.querySelector('[data-gt-legal-footer]')) return;
    const existingFooter = Array.from(document.querySelectorAll('body > footer'))
      .reverse()
      .find(footer => !footer.classList.contains('smart-search-footer'));
    const host = existingFooter || document.createElement('footer');
    const isTrackingFooter = host.classList.contains('tracking-footer');
    let trackingContent = null;
    if (isTrackingFooter) {
      trackingContent = document.createElement('div');
      trackingContent.className = 'gt-site-footer__tracking';
      while (host.firstChild) trackingContent.append(host.firstChild);
    } else {
      host.replaceChildren();
    }

    // Pagina principală avea clase de layout vechi (`shell` / `footer-inner`)
    // care restrângeau footerul doar la anumite lățimi mobile. Componenta comună
    // își controlează singură dimensiunile, identic pe toate paginile.
    host.classList.remove('shell');
    host.classList.add('gt-site-footer');
    if (!existingFooter) host.classList.add('gt-site-footer--generated');
    host.dataset.gtLegalFooter = '';
    host.setAttribute('aria-label', 'Informații despre G-Trots, plăți și politici');

    const publicAddress = companyPublicAddress(company);
    const tradeName = company.trade_name || company.legal_name || 'G-Trots';
    const inner = document.createElement('div');
    inner.className = 'gt-site-footer__inner';
    inner.innerHTML = `
      <section class="gt-site-footer__brand">
        <a class="gt-site-footer__logo" href="/">
          <img src="/assets/favicon.png" width="128" height="128" alt="">
          <span><strong>${esc(tradeName)}</strong><small>Service & shop pentru mobilitate electrică</small></span>
        </a>
        <p>Cumpărături clare, piese alese atent și asistență reală înainte și după comandă.</p>
        <dl class="gt-site-footer__identity gt-site-footer__identity--desktop">
          <div><dt>Operator</dt><dd>${esc(company.legal_name || 'Necompletat')}</dd></div>
          <div><dt>CUI</dt><dd>${esc(company.cui || 'Necompletat')}</dd></div>
          <div><dt>Adresă</dt><dd>${esc(publicAddress)}</dd></div>
        </dl>
      </section>
      <div class="gt-site-footer__nav-grid">
        <nav aria-label="Pagini principale Cubis Shop"><b>Pagini principale</b><div><a href="/magazin">Magazin</a><a href="/service-trotinete-electrice-bucuresti-ilfov">Service</a><a href="/despre-g-trots">Despre</a><a href="/contact">Contact și date firmă</a></div></nav>
        <nav aria-label="Comenzi, livrare și retururi"><b>Comenzi și retururi</b><div><a href="/urmarire-comanda">Urmărește comanda</a><a href="/livrare-si-plata">Livrare și plată</a><a href="/plata-si-facturare">Plată și facturare</a><a href="/politica-de-retur">Politica de retur</a><a class="gt-withdrawal-link" href="/solicita-retur">Solicită un retur</a><a class="gt-mobile-wide-link gt-mobile-wide-link--cross-nav" href="/garantii-si-reclamatii">Garanții și reclamații</a></div></nav>
        <nav aria-label="Legal și confidențialitate"><b>Legal și confidențialitate</b><div><a href="/termeni-si-conditii">Termeni și condiții</a><a href="/politica-de-confidentialitate">Confidențialitate</a><a href="/politica-cookies">Politica de cookie-uri</a><button type="button" data-cookie-preferences>Preferințe cookie</button><a href="/siguranta-produselor">Siguranța produselor</a><a href="/conditii-b2b">Condiții B2B</a><a class="gt-mobile-wide-link gt-mobile-wide-link--inner-grid" href="/accesibilitate">Accesibilitate</a></div></nav>
      </div>
      <dl class="gt-site-footer__identity gt-site-footer__identity--mobile" aria-label="Datele firmei Cubis Shop">
        <div><dt>Operator</dt><dd>${esc(company.legal_name || 'Necompletat')}</dd></div>
        <div><dt>CUI</dt><dd>${esc(company.cui || 'Necompletat')}</dd></div>
        <div><dt>Adresă</dt><dd>${esc(publicAddress)}</dd></div>
      </dl>
      <div class="gt-site-footer__contact-row">
        <div class="gt-site-footer__contact">${company.phone ? `<a href="${phoneHref(company.phone)}">${esc(company.phone)}</a>` : ''}${company.email ? `<a href="mailto:${esc(company.email)}">${esc(company.email)}</a>` : ''}</div>
        ${socialLinks()}
      </div>
      <section class="gt-site-footer__assurance" aria-label="Plăți și protecția consumatorilor">
        <div class="gt-site-footer__payments"><span><b>Plăți securizate</b><small>Procesate prin Stripe</small></span><div>${paymentMarks()}</div></div>
        <a class="gt-sal-link" href="https://reclamatiisal.anpc.ro" target="_blank" rel="noopener noreferrer"><img src="/assets/anpc-sal.png" width="201" height="50" loading="lazy" decoding="async" alt="ANPC - Soluționarea Alternativă a Litigiilor"></a>
      </section>
      <div class="gt-site-footer__bottom">
        <a class="cab-it-credit" href="https://cab-it.ro/" target="_blank" rel="noopener noreferrer"><span>Designed by</span><img src="https://cab-it.ro/assets/img/brand/cab-it-header-symbol-clean.webp" width="44" height="44" loading="lazy" decoding="async" alt="Sigla CAB-IT Expert"><strong>cab-it.ro</strong></a>
        <span class="gt-site-footer__copyright">© ${new Date().getFullYear()} ${esc(tradeName)}</span>
        ${themeControl()}
      </div>`;

    if (trackingContent) host.append(trackingContent);
    host.append(inner);
    host.querySelector('[data-cookie-preferences]')?.addEventListener('click', () => {
      if (window.GTrotsConsent?.open) window.GTrotsConsent.open();
      else document.dispatchEvent(new CustomEvent('g-trots:open-consent'));
    });
    window.GTrotsTheme?.refresh?.();
    if (!existingFooter) document.body.append(host);
    appendOrganizationSchema(company);
    renderCompanyProfiles(company);
  }

  ensureOriginalHeader();
  ensurePromotionLayer();
  ensureShopNavigation();
  ensureStaticStoreShortcut();
  loadConfig()
    .then(data => {
      const company = { ...companyFallback, ...(data?.company || {}) };
      renderCompanyBindings(company);
      render(company);
    })
    .catch(() => {
      renderCompanyBindings(companyFallback);
      render(companyFallback);
    });
})();

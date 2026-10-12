const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    show: false,
    width: 1440,
    height: 900,
    webPreferences: { nodeIntegration: true, contextIsolation: false, offscreen: true, backgroundThrottling: false, partition: `qa-newsletter-${Date.now()}` },
  });
  const errors = [];
  win.webContents.on('console-message', (_event, level, message) => {
    if (level >= 2 && !message.includes('app-update') && !message.includes('Failed to fetch') && !message.includes('Security Warning')) errors.push(message);
  });

  await win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  await win.webContents.executeJavaScript(`(() => {
    document.getElementById('startup-loader').style.display = 'none';
    document.getElementById('auth-overlay').style.display = 'none';
    const subscribers = [
      { id:'n1', full_name:'Andrei Popescu', email:'andrei@example.ro', phone:'0762 000 111', status:'subscribed', consent_source:'checkout', consent_at:'2026-09-12 10:30:00', last_notified_at:'2026-09-13 09:10:00', last_error:null, created_at:'2026-09-12 10:30:00' },
      { id:'n2', full_name:'Maria Ionescu', email:'maria@example.ro', phone:'0722 000 222', status:'unsubscribed', consent_source:'checkout_historical', consent_at:'2026-09-01 12:00:00', unsubscribed_at:'2026-09-13 11:45:00', last_notified_at:null, last_error:null, created_at:'2026-09-01 12:00:00' },
      { id:'n3', full_name:'Client Test', email:'test@example.ro', phone:'', status:'subscribed', consent_source:'checkout', consent_at:'2026-09-13 12:00:00', last_notified_at:null, last_error:null, created_at:'2026-09-13 12:00:00' }
    ];
    for (let index = 4; index <= 13; index += 1) subscribers.push({
      id: 'n' + index,
      full_name: 'Abonat Test ' + index,
      email: 'abonat' + index + '@example.ro',
      phone: '0722 100 ' + String(index).padStart(3, '0'),
      status: index % 4 === 0 ? 'unsubscribed' : 'subscribed',
      consent_source: 'checkout',
      consent_at: '2026-09-14 12:00:00',
      last_notified_at: index % 3 === 0 ? '2026-09-15 10:00:00' : null,
      last_error: null,
      created_at: '2026-09-14 12:00:00'
    });
    window.SHOP_API = {
      listNewsletterSubscribers: async () => subscribers,
      listCategories: async () => [], listBrands: async () => [], listManufacturers: async () => [],
      listProductSources: async () => [{ id:'source-1', name:'Cubis Shop', domain:'cubisshop.ro', is_active:true, is_default:true }],
      createProduct: async payload => { await new Promise(resolve => setTimeout(resolve, 1900)); return { id:'product-1', ...payload, stripe_sync_status:'synced', seo_page:{ success:true }, newsletter_notification:{ sent:2, failed:0 } }; },
      loadProductManager: async () => ({ products:[], total:0, page:1, categories:[], brands:[], manufacturers:[], sources:[{ id:'source-1', name:'Cubis Shop', domain:'cubisshop.ro', is_active:true, is_default:true }] })
    };
    window.selectAppModule('shop');
    window.switchTab('shop-newsletter');
  })()`);
  await wait(700);

  const outputDir = path.join(__dirname, '..', '..', 'tmp', 'qa-newsletter');
  fs.mkdirSync(outputDir, { recursive: true });
  const newsletterPath = path.join(outputDir, 'newsletter-desktop.png');
  fs.writeFileSync(newsletterPath, (await win.webContents.capturePage()).toPNG());
  const newsletterLayout = await win.webContents.executeJavaScript(`(() => {
    const metrics = document.querySelector('.shop-newsletter-metrics');
    const cards = [...document.querySelectorAll('.shop-newsletter-metrics article')];
    const list = document.querySelector('.shop-newsletter-list');
    return metrics ? {
      viewport: innerWidth,
      hasHorizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      columns: getComputedStyle(metrics).gridTemplateColumns,
      width: metrics.getBoundingClientRect().width,
      cardWidths: cards.map(card => card.getBoundingClientRect().width),
      subscriberCards: list ? list.querySelectorAll('.shop-newsletter-card').length : 0
    } : { viewport: innerWidth, missing: true };
  })()`);

  const newsletterSingleResult = await win.webContents.executeJavaScript(`(() => {
    const input = document.getElementById('shop-newsletter-search');
    input.value = 'Andrei Popescu';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    const card = document.querySelector('.shop-newsletter-card');
    return {
      cards: document.querySelectorAll('.shop-newsletter-card').length,
      hasPagination: Boolean(document.querySelector('.shop-newsletter-pagination')),
      activePage: document.querySelector('.shop-newsletter-page-numbers .active')?.textContent.trim() || '',
      previousDisabled: Boolean(document.querySelector('.shop-newsletter-pagination .previous')?.disabled),
      nextDisabled: Boolean(document.querySelector('.shop-newsletter-pagination .next')?.disabled),
      personWidth: card ? Math.round(card.querySelector('.shop-newsletter-person').getBoundingClientRect().width) : 0,
      cardWidth: card ? Math.round(card.getBoundingClientRect().width) : 0
    };
  })()`);
  await win.webContents.executeJavaScript(`document.getElementById('shop-newsletter-search-clear').click()`);
  await wait(120);

  win.setSize(390, 844);
  await wait(350);
  await win.webContents.executeJavaScript(`document.querySelector('[data-newsletter-status="all"]').click()`);
  await wait(180);
  const newsletterMobilePath = path.join(outputDir, 'newsletter-mobile.png');
  fs.writeFileSync(newsletterMobilePath, (await win.webContents.capturePage()).toPNG());
  const newsletterMobileLayout = await win.webContents.executeJavaScript(`(() => {
    const metrics = document.querySelector('.shop-newsletter-metrics');
    const toolbar = document.querySelector('.shop-newsletter-toolbar');
    const cards = [...document.querySelectorAll('.shop-newsletter-card')];
    const viewportWidth = document.documentElement.clientWidth;
    return {
      viewport: innerWidth,
      hasHorizontalOverflow: document.documentElement.scrollWidth > viewportWidth,
      metricsColumns: metrics ? getComputedStyle(metrics).gridTemplateColumns : '',
      toolbarWidth: toolbar ? Math.round(toolbar.getBoundingClientRect().width) : 0,
      cardWidths: cards.map(card => Math.round(card.getBoundingClientRect().width)),
      cardsInsideViewport: cards.every(card => {
        const rect = card.getBoundingClientRect();
        return rect.left >= -1 && rect.right <= viewportWidth + 1;
      }),
      pageCopy: document.querySelector('.shop-newsletter-page-copy')?.textContent.trim() || '',
      activePage: document.querySelector('.shop-newsletter-page-numbers .active')?.textContent.trim() || ''
    };
  })()`);
  await win.webContents.executeJavaScript(`document.querySelector('.shop-newsletter-pagination').scrollIntoView({ block: 'end' })`);
  await wait(180);
  const newsletterMobilePaginationPath = path.join(outputDir, 'newsletter-mobile-pagination.png');
  fs.writeFileSync(newsletterMobilePaginationPath, (await win.webContents.capturePage()).toPNG());
  await win.webContents.executeJavaScript(`document.querySelector('.shop-newsletter-pagination .next').click()`);
  await wait(180);
  const newsletterMobilePageTwo = await win.webContents.executeJavaScript(`(() => ({
    activePage: document.querySelector('.shop-newsletter-page-numbers .active')?.textContent.trim() || '',
    cards: document.querySelectorAll('.shop-newsletter-card').length,
    pageCopy: document.querySelector('.shop-newsletter-page-copy')?.textContent.trim() || ''
  }))()`);

  win.setSize(650, 900);
  await wait(250);
  const newsletterMobileWidePath = path.join(outputDir, 'newsletter-mobile-wide.png');
  fs.writeFileSync(newsletterMobileWidePath, (await win.webContents.capturePage()).toPNG());
  const newsletterMobileWideLayout = await win.webContents.executeJavaScript(`(() => ({
    hasHorizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    cards: document.querySelectorAll('.shop-newsletter-card').length,
    metricColumns: getComputedStyle(document.querySelector('.shop-newsletter-metrics')).gridTemplateColumns
  }))()`);

  win.setSize(1440, 900);
  await wait(250);

  await win.webContents.executeJavaScript(`document.querySelector('[data-commerce-add="shop-products-content"]').click()`);
  await wait(350);
  await win.webContents.executeJavaScript(`(() => {
    document.getElementById('shop-product-name').value = 'Produs demonstrativ newsletter';
    document.getElementById('shop-product-slug').value = 'produs-demonstrativ-newsletter';
    document.getElementById('shop-product-price').value = '129';
    document.getElementById('shop-product-short').value = 'Descriere scurtă pentru verificarea salvării.';
    document.getElementById('shop-product-form').requestSubmit();
  })()`);
  await wait(520);
  const progressPath = path.join(outputDir, 'product-save-progress-desktop.png');
  fs.writeFileSync(progressPath, (await win.webContents.capturePage()).toPNG());
  const during = await win.webContents.executeJavaScript(`(() => ({
    visible: !document.getElementById('shop-product-save-progress').hidden,
    title: document.getElementById('shop-product-save-title').textContent,
    percent: document.getElementById('shop-product-save-percent').textContent,
    stage: document.getElementById('shop-product-save-stage').textContent,
    steps: document.querySelectorAll('#shop-product-save-steps span').length,
    stepLabels: document.querySelectorAll('#shop-product-save-steps span small').length,
    palette: (() => {
      const card = getComputedStyle(document.querySelector('.shop-product-save-card'));
      const title = getComputedStyle(document.getElementById('shop-product-save-title'));
      const track = getComputedStyle(document.querySelector('.shop-product-save-track'));
      return { cardColor: card.color, titleColor: title.color, trackBackground: track.backgroundColor };
    })()
  }))()`);
  await wait(2200);
  const after = await win.webContents.executeJavaScript(`({ hidden: document.getElementById('shop-product-save-progress').hidden })`);
  const passed = during.visible
    && during.steps === 5
    && during.stepLabels === 5
    && during.palette.cardColor === 'rgb(23, 43, 64)'
    && during.palette.titleColor === 'rgb(23, 43, 64)'
    && during.palette.trackBackground !== 'rgb(12, 11, 11)'
    && after.hidden
    && newsletterLayout.subscriberCards === 12
    && !newsletterLayout.hasHorizontalOverflow
    && newsletterSingleResult.cards === 1
    && newsletterSingleResult.hasPagination
    && newsletterSingleResult.activePage === '1'
    && newsletterSingleResult.previousDisabled
    && newsletterSingleResult.nextDisabled
    && newsletterSingleResult.personWidth > 250
    && newsletterMobileLayout.cardWidths.length === 4
    && newsletterMobileLayout.cardsInsideViewport
    && !newsletterMobileLayout.hasHorizontalOverflow
    && newsletterMobileLayout.activePage === '1'
    && newsletterMobilePageTwo.activePage === '2'
    && newsletterMobilePageTwo.cards === 4
    && newsletterMobileWideLayout.cards === 4
    && !newsletterMobileWideLayout.hasHorizontalOverflow
    && errors.length === 0;
  console.log(JSON.stringify({
    passed,
    newsletterLayout,
    newsletterSingleResult,
    newsletterMobileLayout,
    newsletterMobilePageTwo,
    newsletterMobileWideLayout,
    during,
    after,
    errors,
    screenshots: { newsletterPath, newsletterMobilePath, newsletterMobilePaginationPath, newsletterMobileWidePath, progressPath }
  }, null, 2));
  await win.destroy();
  app.exit(passed ? 0 : 1);
}).catch(error => { console.error(error); app.exit(1); });

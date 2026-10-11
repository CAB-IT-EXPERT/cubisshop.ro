# Cubis Shop — inventar de paritate funcțională pentru website

Data auditului: 11 octombrie 2026
Ramură de lucru: `feat/website-redesign`
Baseline recuperabil: commit `097acb1` (`main`), în care directorul `website/` este nemodificat. Modificările locale preexistente din `electron-app/` nu aparțin redesignului și nu trebuie atinse.

## Domeniu și surse verificate

Auditul a parcurs recursiv cele 155 de fișiere din `website/`: 44 HTML, 25 CSS, 24 JavaScript, 18 module JavaScript, fișierele de căutare/index, asseturile, sitemapurile, `robots.txt` și `.htaccess`. Au fost verificate separat scripturile `scripts/generate-shared-site-shell.cjs`, `scripts/generate-product-seo-pages.mjs` și `scripts/serve-website.py`.

Documentația citită înainte de schimbări: `AGENTS.md`, `website/agents.md`, `README.md`, întregul `docs/wiki/`, `docs/SPV_ORDER_CANCELLATION_HANDOFF.md`, rapoartele etapelor API/cPanel/Stripe, documentația SmartBill și documentația de deployment/SEO.

API-ul public autoritativ rămâne `https://cubisshop.ro/shop-api/api-v2.php`. La data auditului, citirile publice au returnat o categorie și un produs diagnostic, ambele etichetate explicit ca date de test, plus o metodă de livrare de test. Website-ul nu va transforma aceste date în conținut comercial și nu va completa catalogul cu produse fictive.

## Contracte comune care trebuie păstrate

- Stocări browser existente: `g-trots-favorite-products-v1`, `g-trots-cart-products-v1`, `g-trots-customer-session-v1`, `g-trots-customer-profile-v1`, `g-trots-shop-device-v1`, `g-trots-last-checkout-v1` și `g-trots-cookie-consent-v1`. Cheile istorice se păstrează în faza de tranziție pentru a nu pierde coșuri, favorite sau sesiuni existente; interfața nouă le poate expune prin aliasuri `CubisShop*`.
- Contracte globale existente: `window.GTrotsFavorites`, `window.GTrotsCart`, `window.GTrotsLiveShop`, `window.GTrotsShopCatalog`, `window.GTrotsConsent` și `window.GTrotsPublicConfigPromise`. Ele rămân compatibile până când toate paginile comerciale sunt migrate.
- Autoritate comercială: API-ul decide prețul efectiv, promoția, stocul, transportul și totalurile. Clientul poate calcula numai estimări de afișare și trebuie să folosească răspunsul API la plasarea comenzii.
- Autoritate fiscală: SmartBill rămâne autoritatea pentru facturi, corecții, gestiuni și efect fiscal. Redesignul nu modifică aceste fluxuri și nu execută mutații în preview.
- Tema publică țintă este exclusiv light. `theme.js`, `theme.css` și generatorul shell injectează în prezent și dark mode; paginile noi nu trebuie să le încarce.

## Matrice de paritate

Coloana „DOM” enumeră contractele principale, nu fiecare selector decorativ.

| Funcționalitate | Sursă curentă | DOM / date dependente | Endpoint / persistență | Comportament actual | Comportament în designul nou | Verificare necesară |
|---|---|---|---|---|---|---|
| Configurație API reutilizabilă | `shop-live.js`, `checkout.js`, `cont.js`, `legal-page.js` | fără contract vizual | baza `api-v2.php`, timeout, JSON, `X-Customer-Token`, `X-Shop-Device` | fiecare script implementează separat requestul | client unic `storefront-api.js`, erori și timeout coerente | test request GET/POST, timeout, JSON invalid, 4xx/5xx |
| Shell public | HTML-urile, `legal-footer.js`, `legal-footer.css` | `.site-header`, `.main-nav`, footer injectat | `publicShopConfig`, cache în `sessionStorage` | header/footer și date firmă sunt injectate peste pagini eterogene | componente reale, comune, Cubis, light; datele firmei numai dacă API-ul le furnizează | desktop/mobil, linkuri, focus, lipsa datelor juridice |
| Bara beneficii | HTML, `promotions.js` | bara promo și track-ul marquee | `publicActivePromotions`, `publicFreeShippingBanners` | afișează promoții/livrare configurată | topbar navy; numai afirmații confirmate de configurare | fără promoții fictive, redus motion, responsive |
| Logo și identitate | `assets/logo.png`, `assets/favicon.svg`, header legacy | imagini/logo din DOM | asset local | asseturile website sunt încă G-Trots | logo Cubis original din repository și favicon Cubis | verificare vizuală și scanare G-Trots |
| Navigare categorii | `magazin.js`, `script.js`, header legacy | hosturi de categorii, meniul mobil | `publicCatalogFilters` | categorii și arbore din API | bară desktop + drawer mobil generate din categoriile active | zero/una/multe categorii, ierarhie, overflow |
| Căutare globală | `page.js`, `search/src/*`, worker, index static | input/header, popup rezultate | index local; navigare la pagini | normalizare, potrivire fuzzy, trigram, BM25, worker și tastatură; indexul actual este editorial G-Trots | worker alimentat cu catalogul API; caută nume, SKU, categorii, branduri, producători și compatibilități disponibile | diacritice, typo, SKU, tastatură, mobil, fallback fără Worker |
| Cache catalog | `shop-live.js` | fără DOM obligatoriu | `publicProductsPage`, `localStorage` condiționat de consimțământ | cache stale-while-refresh și deduplicare | cache compact numai cu consimțământ; API revalidat | cache permis/blocat, invalidare, deduplicare |
| Homepage hero | `index.html`, `script.js`, asseturi legacy | `#main`, `.hero`, CTA | catalog/config API | prezentare service G-Trots, animații tipwriter | mesaj Cubis și compoziție numai din imagini API; starea fără catalog este explicită | comparație desktop/mobil, fără conținut inventat |
| Categorii homepage | `index.html`, `script.js` | carduri/bridge legacy | `publicCatalogFilters` | linkuri și carduri vechi | carduri dinamice cu nume/imagine disponibile și link către catalog filtrat | una/multe/fără imagine, navigare |
| Selector compatibilitate | filtre catalog curente | select categorie/marcă/model | `publicCatalogFilters`; atribute produs | filtrare după categorii/branduri/producători; nu există contract public separat pentru modele | selectoare dependente construite numai din taxonomii/date reale; control dezactivat când nivelul următor lipsește | dependențe, resetare, query URL, stare fără modele |
| Produse recomandate/populare | `shop-live.js`, `magazin.js` | grid produs | `publicProductsPage`; `is_featured`, `featured_rank` | ordonare stoc/recomandate | „Produse recomandate” când API-ul nu furnizează popularitate; fără etichetă falsă | ordonare, stoc, empty/error/loading |
| Noutăți | catalog API | grid compact | `publicProductsPage` ordonat server-side după `created_at` | nu are secțiune Cubis distinctă | folosește ordinea curentă a catalogului și eticheta „Noutăți” numai pentru produse recent returnate/conform metadatelor disponibile | nu inventează data sau badge-ul |
| Branduri/producători | `magazin.js` | filtre și carduri | `publicCatalogFilters` | filtre separate brands/manufacturers | secțiune din entitățile active, fără logo inventat | nume reale, link filtru, stare goală |
| Bannere comerciale | homepage legacy, `promotions.js` | bannere/CTA | promoții și categorii API | elemente service/promovare vechi | bannere de categorie/configurație fără discount inventat | linkuri reale și texte adevărate |
| Ghiduri utile | pagini editoriale și index search | carduri ghid | fișiere HTML locale | mii de pagini/index G-Trots | în faza C se afișează numai resurse Cubis neutre existente; conținutul G-Trots nu este reutilizat | scanare text/linkuri și stări goale |
| Newsletter | `checkout.html`, `checkout.js`, `newsletter.php` | checkbox checkout `newsletter_opt_in` | `createPublicOrder`; nu există endpoint public standalone | consimțământ separat și nebifat la checkout; abonarea standalone lipsește | homepage explică transparent disponibilitatea la checkout; nu simulează abonarea și nu creează endpoint nou în faza C | consimțământ separat, nebifat, payload corect |
| Încărcare catalog | `shop-live.js` | `[data-live-products]`, `.product-grid` | `publicProductsPage` compact | pagina 1 rapid, restul paralel, deduplicare | aceeași paginare API și stări skeleton/error/empty | pagini 1..N, retry, duplicate SKU/slug |
| Filtre categorii | `magazin.js` | arbore checkbox | `publicCatalogFilters` + dataset card | arbore ierarhic, deep link | sidebar fidel referinței + drawer mobil | ierarhie, deep-link, reset, tastatură |
| Filtre brand/producător | `magazin.js` | checkbox groups | `publicCatalogFilters` | filtrare client-side | filtre separate și număr rezultate actualizat | selecție multiplă și zero rezultate |
| Filtru compatibilitate | `magazin.js` | dataset brand/manufacturer | catalog/filtre | compatibilitate aproximată din taxonomii disponibile | folosește exclusiv câmpurile furnizate; nu inventează modele | select dependent și chips active |
| Filtru preț | `magazin.js` | range/input | preț efectiv produs | range client-side | slider + min/max accesibile, moneda produsului | limite, tastatură, promo price |
| Filtru stoc | `magazin.js` | checkbox/dataset stock | stock_mode/stock_quantity | în stoc/stoc redus/epuizat | disponibilitate reală, fără cantități inventate | tracked/unlimited/out-of-stock |
| Sortare | `magazin.js` | sort menu | date card | relevanță/preț/nume/stoc | selector accesibil cu aceleași criterii valide | ordine stabilă și focus |
| Paginare/page size | `magazin.js` | pager și selector | catalog client-side după încărcare | 10/15 etc. și URL pagini generate | pager + 12/24/48, fără forțarea a 4 coloane | margini, ultima pagină, viewporturi |
| Chips filtre active | `magazin.js` | toolbar | stare filtre | implicit limitat | chips eliminabile + reset toate | eliminare individuală și număr rezultate |
| Card produs | `magazin.js`, `favorites.js`, `shop-live.js` | `.product-card`, butoane favorite/coș | catalog API + storage | imagine, nume, preț, stoc, promoție | proporții din design, rating doar dacă există, badge real | fără imagine, promoție, rating null, stoc epuizat |
| Favorite | `favorites.js`, `favorite.html` | `[data-favorite-product]`, counters | `localStorage` | toggle, contoare, pagină dedicată, sincronizare tab-uri | aceleași date și evenimente, icon nou | add/remove, storage event, storage blocat |
| Coș | `favorites.js`, `cos.html` | `[data-cart-product]`, cantități, sumar | `localStorage`, `publicPromotionQuote`, `publicShopConfig` | cantități, eliminare, promoții și total estimat | compatibilitate identică, badge header și CTA | cantități, promoții, stoc, reîncărcare |
| Promoții/cupoane | `favorites.js`, `checkout.js`, `promotions.js` | sumar și input cod | `publicPromotionQuote`, `publicActivePromotions` | quote autoritativ și cupoane manuale | păstrat fără calcul final independent | succes, 422, cod expirat, minim comandă |
| Breadcrumb produs | `produs.html`, `shop-live.js` | `[data-product-breadcrumb]` | `publicProduct` | actualizat după încărcare | complet, categorie + produs | slug/id, caractere speciale, fallback |
| Date produs | `shop-live.js` | title, SKU, brand, preț, stock, meta | `publicProduct` | hidratează șablonul și metadatele | panou fidel designului, numai câmpurile disponibile | produs activ/inactiv/404, metadate |
| Galerie produs | `produs.js`, `shop-live.js` | imagine principală, thumbs, viewer | `product.images` | thumbs, săgeți, swipe, zoom/pan/pinch | galerie verticală desktop, swipe mobil, dialog zoom | 0/1/12 imagini, keyboard, touch, reduced motion |
| Cantitate + adăugare coș | `produs.js`, `shop-live.js` | quantity stepper, CTA | cart storage | normalizează cantitatea și adaugă | CTA mare + favorite, dezactivat fără stoc | limite, double click, stoc epuizat |
| Compatibilități/caracteristici | `shop-live.js` | secțiuni descriere/specs | `publicProduct` | generează grupe din câmpurile API | carduri numai pentru valori existente | câmpuri absente, HTML sanitizat |
| Descriere bogată | `shop-live.js` | rich description | `publicProduct.description_html` | sanitize allowlist și expand/collapse | tipografie light, tab descriere | XSS, linkuri, headings, conținut lung |
| Taburi produs | `produs.js` | `.product-content-tabs`, secțiuni | DOM | scroll-sync și hash | taburi accesibile; ascunde tab fără conținut | keyboard, hash, mobil, sticky offset |
| Recenzii | `produs.js`, `shop-live.js` | summary, feed, form | `publicProductReviews`, `createPublicReview` | afișare/paginare; recenzie verificată prin comandă+email | rating numai real, formular păstrat | 0/multe, validare, 409 duplicate, achiziție neverificată |
| Produse similare | `produs.js`, `shop-live.js` | carousel/grid related | catalog API | relație pe categorie/brand, fallback catalog | recomandări reale, max vizual conform designului | fără rezultate, favorite/coș, scroll mobil |
| Checkout | `checkout.html`, `checkout.js` | form checkout, shipping/payment, items | `publicCheckoutProducts`, `publicShopConfig`, `publicPromotionQuote`, `createPublicOrder` | PF/PJ, adresă, livrare, card/ramburs, consimțăminte | logică păstrată; redesign în faza D după aprobare | validări, double-submit, total API, PF/PJ, empty/error |
| Stripe TEST | `checkout.js`, `checkout-status.js` | CTA card și pagini rezultat | `createPublicOrder`, `stripeCheckoutStatus`, `cancelStripeCheckout` | acceptă numai URL Stripe și sesiuni TEST | neschimbat funcțional; fără operații reale în preview | succes/eșec/expirare/replay, fără efect extern neizolat |
| Ramburs | `checkout.js` | metodă plată și label submit | `createPublicOrder` | comandă COD și redirecționare rezultat | neschimbat funcțional | metodă activă/inactivă, label obligație plată |
| Autentificare client | `login.html`, `cont-nou.html`, `cont.js` | formulare auth | `customerLogin`, `customerRegister`, `customerLogout` | sesiune locală și token header | redesign faza D, contract păstrat | succes, 401/422, redirect, logout |
| Google Login | `cont.js`, `google-integrations.js` | host Google button | `customerAuthConfig`, `customerGoogleLogin` | activ numai dacă există client ID Cubis | rămâne dezactivat fără ID | ID absent/prezent, răspuns invalid |
| Resetare parolă | `cont.js`, `resetare-parola.html` | form și token URL | `customerForgotPassword`, `customerResetPassword`, `reset-link-status.php` | verifică link, setează parolă | redesign faza D | token valid/expirat, rate limit, mismatch |
| Cont/profil | `cont.html`, `cont.js` | panels și profile form | `customerMe`, `customerProfile` | PF/PJ și date profil | redesign faza D | autorizare, câmpuri companie, sesiune expirată |
| Adrese salvate | `cont.js`, `checkout.js` | dialog/listă adresă | `customerAddresses`, `customerAddress` | CRUD și precompletare checkout | păstrat | add/edit/delete/default, autorizare |
| Istoric comenzi | `cont.js` | list/detail order | `customerOrders` | listă, status și detaliu | păstrat | empty, statusuri, detalii, acces cross-account |
| Cupoane client | `cont.js` | coupon cards | `customerCoupons` | listă și copy | păstrat | activ/expirat, clipboard fallback |
| Tracking comandă | `urmarire-comanda.*` | form, timeline, result | `publicTrackOrder` | token sau comandă+email, timeline | redesign faza D; reguli status păstrate | token, acces manual, statusuri, noindex |
| Anulare comandă | `urmarire-comanda.js` | modal motiv | `customerCancelOrder` | client numai new/confirmed/processing; API decide | nu se modifică în faza C | toate statusurile, idempotency, fără factură/factură SmartBill |
| Retur din tracking | `urmarire-comanda.js` | modal linii, cantități, IBAN | `customerRequestReturn` | numai completed eligibil; integral/parțial | nu se modifică în faza C | PF/PJ, 14/30 zile, IBAN, cantități, double-submit |
| Formular retur independent | `solicita-retur.*` | verify/configure forms | `publicValidateReturnOrder`, fallback `publicTrackOrder`, `customerRequestReturn` | verificare în doi pași și estimare | redesign faza D | asociere exactă, eligibilitate, parțial, consimțământ |
| Cookie consent | `cookie-consent.*` | layer și butoane | localStorage + eveniment | necesare/preferințe; analytics blocat implicit | identitate vizuală nouă, aceleași opțiuni | first visit, accept/refuz, reopen, storage blocat |
| Analytics/Google | `google-integrations.js` | fără DOM obligatoriu | ID-uri public config | dezactivat fără ID Cubis | rămâne dezactivat | contract existent și consimțământ |
| Pagini juridice | `legal-page.js`, HTML legal | `[data-company-*]` | `publicShopConfig` | injectează identitatea firmei, conținut încă G-Trots | faza D; nu afișează fallback juridic fals | date complete/lipsă, linkuri, no tracking |
| Contact | `contact.*` | form WhatsApp și company bindings | `publicShopConfig` | construiește URL WhatsApp | faza D; numai date reale | număr absent, validare, URL encoding |
| 404 | `404.*`, `.htaccess` | page actions | istoric/browser | pagină custom și back/home | faza D | Apache 404 real, tastatură, reduced motion |
| SEO produs | `generate-product-seo-pages.mjs`, `produs.html` | canonical/meta/JSON-LD/static article | `publicProductsPage`, `publicProductReviews` | generează HTML, Product/Offer/Breadcrumb, sitemap | faza E trebuie să folosească shell-ul nou light și să elimine texte G-Trots | generare cu catalog real, schema validator, direct URL |
| SEO catalog | același generator, `magazin.html` | card template/pagination | catalog API | pagini catalog + sitemap | faza E, șablon nou fără reintroducerea temei vechi | pagini multiple, canonical, ultima pagină |
| Shell generator | `generate-shared-site-shell.cjs` | toate HTML | filesystem build | injectează `theme.js/css`, dark bootstrap și footer legacy | faza E trebuie înlocuit cu asseturile Cubis light | idempotency, fără duplicate, scanare G-Trots/dark |
| Rute Apache | `website/.htaccess` | URL-uri curate | Apache mod_rewrite | clean URLs, produse generate, 404, cache și noindex | păstrat/adaptat în faza E; fallback Python nu este dovadă Apache | matrice 200/301/404/410 pe Apache |
| Preview local | `scripts/serve-website.py` | filesystem | HTTP local | fallback orice slug produs la `produs.html` | util numai QA; mesaj/branding Cubis | compară cu rute Apache și pagini generate |
| Sitemap/robots | XML/TXT din `website/` | n/a | crawler | conținut mixt/legacy | faza E generează numai URL-uri Cubis valide | parse XML, URL status, robots |

## Riscuri și incompatibilități identificate

1. `theme.js`, `theme.css` și `generate-shared-site-shell.cjs` aleg dark mode după sistem și pot produce exact regresia alb-pe-alb menționată în brief. Primele trei pagini vor fi decuplate de ele; generatorul va fi refăcut în faza SEO.
2. `legal-footer.js` este atât footer, cât și injector de header/navigare, config, WhatsApp, cookie și temă. Înlocuirea sa globală înainte de migrarea tuturor paginilor ar risca checkoutul și paginile legale; faza C folosește un shell nou doar pe homepage/catalog/produs.
3. `shop-live.js`, `magazin.js` și `produs.js` folosesc multe selectoare istorice și globale `GTrots*`. Refolosirea lor ca atare ar păstra tema veche. Logica reutilizabilă va fi mutată în module Cubis, cu adaptoare pentru coș/favorite.
4. Indexul de căutare de 3,5 MB și taxonomiile sale descriu conținut editorial G-Trots, nu catalogul Cubis. Motorul (normalizare, fuzzy, trigram, BM25, worker) este reutilizabil; datele nu sunt.
5. API-ul public nu expune momentan un endpoint de abonare standalone la newsletter și nici o taxonomie dedicată de modele compatibile. UI-ul nu trebuie să pretindă că aceste operații există.
6. Previewul Python servește un șablon produs pentru orice slug lipsă, în timp ce `.htaccess` răspunde 404 dacă nu există pagina generată. Această diferență trebuie testată în faza E.
7. Conținutul vechi are 744 apariții `G-Trots`/`GTrots`. Faza C elimină contaminarea din cele trei pagini și asseturile lor; restul se migrează numai după aprobarea vizuală.

## Baseline de teste înainte de redesign

- `node scripts/test-public-theme.cjs`: PASS.
- `node website/tests/google_integrations_disabled_contract_test.cjs`: PASS.
- `node scripts/verify-guide-search-schema.mjs`: BLOCK — lipsește fișierul generat, ignorat, `website/search/data/.generated-diagnostic-pages.json`.
- `git diff --check`: PASS pentru baseline; avertismentele line-ending provin numai din fișierele Electron preexistente.

## Gate pentru aprobarea fazei C

- capturi desktop și mobil pentru `/`, `/magazin` și `/produs?slug=<slug-real>`;
- datele vizibile provin exclusiv din endpointurile publice și din configurația Cubis;
- nicio apariție G-Trots, dark-theme bootstrap sau asset G-Trots în cele trei pagini;
- header, căutare, categorii, favorite, coș, filtre, sortare, paginare, galerie, tabs, recenzii și produse similare au stări loading/success/empty/error;
- testele browser nu execută `createPublicOrder`, `customerCancelOrder`, `customerRequestReturn`, Stripe, e-mail sau alte mutații reale;
- după capturi și corecții vizuale, lucrul se oprește pentru aprobarea utilizatorului înainte de faza D.

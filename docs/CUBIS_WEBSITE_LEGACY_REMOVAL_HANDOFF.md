# Cubis Shop — inventarul frontendului eliminat și contractele API păstrate

## Scop și stare

Acest document păstrează fotografia tehnică a frontendului vechi și contractele necesare reconstrucției paginilor Cubis.

- API-ul, baza de date, aplicațiile Electron și Expo nu se modifică în această operațiune.
- Cele trei pagini Cubis deja reconstruite se păstrează: Homepage, Magazin și Produs.
- Contractele publice/customer ale API-ului sunt centralizate în `website/cubis-commerce-api.mjs`, fără HTML sau CSS legacy.
- Regulile fiscale pentru anulări, retururi, facturi de retur și SPV rămân cele din `docs/SPV_ORDER_CANCELLATION_HANDOFF.md`.
- La 11 octombrie 2026, toate paginile, scripturile, stilurile, imaginile și indexurile G‑Trots din `website/` au fost șterse cu aprobarea explicită a utilizatorului.
- În `website/` au rămas doar Homepage, Magazin, Produs, pagina 404 Cubis, modulele Cubis și fișierele minime de rutare/SEO.
- Paginile comerciale care nu au fost încă reconstruite (`/cos`, `/favorite`, `/checkout`, `/cont` etc.) răspund temporar cu pagina 404 Cubis. Contractele lor sunt păstrate mai jos și în `website/cubis-commerce-api.mjs`.

## Generatorul API rămas în afara acestei operațiuni

Fișierele frontendului vechi au fost eliminate. Generatorul din backend nu a fost modificat, conform limitei explicite a operațiunii.

`shop-api/product-page-service.php` generează încă HTML, metadate, texte, carduri de catalog și pagini 410 cu identitatea G‑Trots. `createProduct`, `updateProduct`, recenziile și operațiile SEO apelează `shopProductSeoSync(...)` atunci când `website_generation_enabled` este activ.

Consecință: adăugarea sau actualizarea unui produs poate recrea pe server fișiere HTML vechi dacă generarea este activată. Rutarea locală și regula Apache Cubis ignoră acum acele fișiere și trimit toate slugurile de produs către `produs.html`. Pentru eliminarea codului generator din backend trebuie aleasă, separat și cu aprobare explicită, una dintre variante:

1. generatorul API este adaptat la template-ul Cubis;
2. generatorul este dezactivat, iar toate rutele de produs sunt rezolvate de `produs.html` și API;
3. se acceptă temporar că API-ul poate regenera pagini legacy.

Primele două variante modifică API-ul sau configurarea lui și nu au fost executate.

## Nucleul Cubis păstrat

| Fișier | Rol |
|---|---|
| `index.html` + `cubis-home.mjs` | Homepage real, alimentat din API |
| `magazin.html` + `cubis-catalog.mjs` | Catalog, filtre, sortare și paginare |
| `produs.html` + `cubis-product.mjs` | Pagină de produs, galerie, taburi și recomandări |
| `cubis-storefront.mjs` | Shell comun, catalog normalizat, căutare, favorite și coș local |
| `cubis-storefront.css` | Design system public Cubis |
| `cubis-search-worker.mjs` | Căutare în catalog într-un Web Worker |
| `cubis-search-normalize.mjs` | Normalizare, typo matching și trigrame fără dependența search legacy |
| `cubis-commerce-api.mjs` | Contractele API publice/customer păstrate pentru paginile care urmează |
| `assets/cubis-*.png` | Identitatea vizuală Cubis |

## Inventar pagină cu pagină

### Pagini Cubis păstrate

| Rută / fișier | Ce face | API și stare |
|---|---|---|
| `/` — `index.html` | Homepage: categorii, produse recomandate/noi, branduri, promoții editoriale și ghiduri. | `publicCatalogFilters`, `publicShopConfig`, `publicProductsPage`; favorite/coș în storage Cubis. |
| `/magazin` — `magazin.html` | Catalog complet: căutare, categorii, branduri, producători, compatibilitate, preț, sortare și paginare. | `publicCatalogFilters`, `publicShopConfig`, `publicProductsPage`. |
| `/produs` și `/magazin/produs/<slug>/` — `produs.html` | Produs: galerie, preț, stoc, descriere, specificații, recenzii citite și recomandări. | `publicProduct`, `publicProductReviews`, `publicProductsPage`, `publicShopConfig`. |

### Pagini legacy comerciale și de client

| Rută / fișier | Ce face în prezent | Contracte care trebuie păstrate în viitoarea pagină Cubis |
|---|---|---|
| `/favorite` — `favorite.html` | Afișează produsele salvate local, permite eliminarea și adăugarea în coș. | Storage favorite/coș; `publicShopConfig`; rehidratarea produselor din catalog. |
| `/cos` — `cos.html` | Cantități, eliminare, subtotal, reduceri estimate și trecere la checkout. | Storage coș; `publicShopConfig`, `publicPromotionQuote`; date de catalog. |
| `/checkout` — `checkout.html` | Identitate PF/PJ, adresă, curier, cupon, ramburs/card și plasarea comenzii. | `publicCheckoutProducts`, `publicPromotionQuote`, `publicShopConfig`, `customerMe`, `customerAddresses`, `createPublicOrder`; token client și device token. |
| `/plata-finalizata` — `plata-finalizata.html` | Confirmă plata sau comanda ramburs, afișează bonul și golește coșul numai după confirmare. | `stripeCheckoutStatus`, datele ultimei comenzi din session storage, catalog pentru imagini. |
| `/plata-esuata` — `plata-esuata.html` | Explică eșecul, permite revenirea și închide sesiunea Stripe anulată. | `cancelStripeCheckout`, starea checkoutului din session storage. |
| `/login` — `login.html` | Autentificare cu e-mail/parolă și Google. | `customerAuthConfig`, `customerLogin`, `customerGoogleLogin`; salvează token și profil. |
| `/cont-nou` — `cont-nou.html` | Creează cont nou și inițiază recuperarea parolei. | `customerRegister`, `customerForgotPassword`, `customerAuthConfig`, Google login. |
| `/resetare-parola` — `resetare-parola.html` | Verifică linkul și setează parola nouă. | `reset-link-status.php`, `customerResetPassword`. |
| `/cont` — `cont.html` | Profil, comenzi, cupoane, adrese, logout și ștergere cont. | `customerMe`, `customerOrders`, `customerCoupons`, `customerAddresses`, `customerAddress`, `customerProfile`, `customerForgotPassword`, `customerLogout`, `customerDeleteAccount`. |
| `/urmarire-comanda` — `urmarire-comanda.html` | Caută o comandă, afișează timeline, produse, totaluri și oferă anulare/retur când este permis. | `publicTrackOrder`, `customerCancelOrder`, `customerRequestReturn`; regulile fiscale din handoff. |
| `/solicita-retur` — `solicita-retur.html` | Validează număr comandă + e-mail, eligibilitatea, produsele/cantitățile, IBAN-ul și trimite retragerea/returul. | `publicValidateReturnOrder`, fallback `publicTrackOrder`, `customerRequestReturn`; reguli PF/PJ și retur parțial. |
| `/shop-indisponibil` — `shop-indisponibil.html` | Mesaj de mentenanță/indisponibilitate fără operațiuni comerciale. | Fără mutații; viitor fallback Cubis. |

### Pagini juridice și de informare comercială

Aceste pagini sunt în principal conținut static. `legal-page.js` și `legal-footer.js` citesc `publicShopConfig` pentru identitatea legală, adresa, contactul, TVA-ul și metodele de livrare.

| Rută / fișier | Ce face |
|---|---|
| `/termeni-si-conditii` — `termeni-si-conditii.html` | Reguli contractuale B2C/B2B, comandă, plată, livrare, facturare, retur și răspundere. |
| `/politica-de-retur` — `politica-de-retur.html` | Drept de retragere, extensii comerciale, costuri, termene și fluxul returului. |
| `/livrare-si-plata` — `livrare-si-plata.html` | Metode de livrare/plată și costurile publice configurate. |
| `/plata-si-facturare` — `plata-si-facturare.html` | Card/ramburs, factură și RO e-Factura. |
| `/conditii-b2b` — `conditii-b2b.html` | Reguli comerciale distincte pentru persoane juridice. |
| `/garantii-si-reclamatii` — `garantii-si-reclamatii.html` | Conformitate, garanție și reclamații. |
| `/siguranta-produselor` — `siguranta-produselor.html` | Informații GPSR, producător, persoană responsabilă și avertismente. |
| `/politica-de-confidentialitate` — `politica-de-confidentialitate.html` | Date personale, scopuri, temeiuri și drepturi. |
| `/politica-cookies` — `politica-cookies.html` | Categorii de cookie-uri și consimțământ. |
| `/solutionarea-litigiilor` — `solutionarea-litigiilor.html` | Soluționare amiabilă, SAL/ANPC și instanțe. |
| `/accesibilitate` — `accesibilitate.html` | Declarație și canal de raportare pentru accesibilitate. |
| `/contact` — `contact.html` | Date de contact și compunerea unei solicitări; fără mutație API proprie. |

### Pagini editoriale/SEO de service

Toate folosesc căutarea statică veche (`smart-search-index-v2.json`, `page.js`, `smart-search-v2.js`) și footerul configurat prin `publicShopConfig`. Nu sunt surse valide pentru produse, prețuri sau servicii Cubis.

| Rută / fișier | Rol curent |
|---|---|
| `/blog-service-trotinete-electrice` — `blog-service-trotinete-electrice.html` | Hub de ghiduri și articole. |
| `/baterii-trotinete-electrice` — `baterii-trotinete-electrice.html` | Cluster despre baterii și autonomie. |
| `/electronica-trotinete-electrice` — `electronica-trotinete-electrice.html` | Cluster despre controllere, display și electronică. |
| `/frane-trotinete-electrice` — `frane-trotinete-electrice.html` | Cluster despre frâne. |
| `/motoare-trotinete-electrice` — `motoare-trotinete-electrice.html` | Cluster despre motoare. |
| `/pene-cauciucuri-trotinete-electrice` — `pene-cauciucuri-trotinete-electrice.html` | Cluster despre anvelope, camere și pene. |
| `/probleme-incarcare-trotinete-electrice` — `probleme-incarcare-trotinete-electrice.html` | Ghiduri de încărcare și autonomie. |
| `/probleme-trotinete-electrice` — `probleme-trotinete-electrice.html` | Index de simptome și probleme. |
| `/reparatie-controller-trotineta-electrica` — `reparatie-controller-trotineta-electrica.html` | Articol/landing despre controller. |
| `/schimbare-baterie-trotineta-electrica` — `schimbare-baterie-trotineta-electrica.html` | Articol/landing despre schimbarea bateriei. |
| `/service-marci-modele-trotinete-electrice` — `service-marci-modele-trotinete-electrice.html` | Index extins pe mărci și modele. |
| `/service-marci-trotinete-electrice` — `service-marci-trotinete-electrice.html` | Hub pe mărci. |
| `/service-scutere-electrice-ghiduri` — `service-scutere-electrice-ghiduri.html` | Ghiduri pentru scutere electrice. |
| `/service-trotinete-electrice-bucuresti-ilfov` — `service-trotinete-electrice-bucuresti-ilfov.html` | Landing geografic București/Ilfov. |
| `/service-trotinete-electrice-zone-bucuresti-ilfov` — `service-trotinete-electrice-zone-bucuresti-ilfov.html` | Index pe zone geografice. |
| `/despre-g-trots` — `despre-g-trots.html` | Pagina vechii organizații; citește și `publicProductsPage` pentru o secțiune de produse. |

### Pagini tehnice

| Rută / fișier | Ce face |
|---|---|
| `/404.html` | Fallback 404 cu căutare editorială statică și navigare legacy. |
| Sitemapurile și `robots.txt` | Enumeră rutele vechi și paginile SEO; trebuie regenerate numai din rutele Cubis aprobate. |
| `.htaccess` | Canonicalizare, rescriere extensii și rutare pentru pagini statice/produs; trebuie înlocuit, nu copiat. |

## Contracte API publice/customer păstrate

Clientul `cubis-commerce-api.mjs` păstrează fără UI vechi următoarele grupuri:

- catalog: `publicCatalogFilters`, `publicShopConfig`, `publicProductsPage`, `publicProduct`, `publicProductReviews`;
- recenzii și promoții: `createPublicReview`, `publicActivePromotions`, `publicFreeShippingBanners`;
- coș/checkout: `publicCheckoutProducts`, `publicPromotionQuote`, `createPublicOrder`;
- Stripe status: `stripeCheckoutStatus`, `cancelStripeCheckout`;
- autentificare și cont: `customerAuthConfig`, `customerLogin`, `customerGoogleLogin`, `customerRegister`, `customerForgotPassword`, `customerResetPassword`, `customerMe`, `customerOrders`, `customerAddresses`, `customerAddress`, `customerCoupons`, `customerProfile`, `customerLogout`, `customerDeleteAccount`;
- comenzi și retururi: `publicTrackOrder`, `publicValidateReturnOrder`, `customerCancelOrder`, `customerRequestReturn`.

Clientul păstrează `X-Customer-Token`, `X-Shop-Device`, timeouturile, JSON errors și migrarea unică a storage-ului existent către cheile `cubis-*`. Nu expune `X-Auth-Token` și nu permite mutații administrative de produse.

## Procesul exact de adăugare a unui produs

### 1. Interfețele administrative

- Expo folosește `components/ShopProductsManager.tsx` și `services/shopApi.ts`.
- Electron folosește `electron-app/renderer/js/shop-commerce.js` și `electron-app/renderer/js/shop-api.js`.
- Ambele trimit același apel autentificat: `POST /shop-api/api-v2.php?action=createProduct`, cu `X-Auth-Token`.
- `api-v2.php` încarcă `api.php`; nu există două implementări paralele.

### 2. Încărcarea editorului

`productManagerBootstrap` livrează lista de produse și metadatele necesare editorului: categorii, branduri, producători, surse de produse, setări de stoc și informații pentru legătura SmartBill. La editare, `getProduct` încarcă produsul complet.

### 3. Datele introduse

Editorul construiește un `ShopProductPayload` cu:

- identitate: nume, slug, SKU, cod furnizor, EAN, sursă;
- clasificare: categorie principală, toate categoriile, producător și branduri compatibile;
- conținut: descriere scurtă, titlu descriere, HTML bogat, specificații și întrebări/răspunsuri;
- comercial: cost, preț, reducere procentuală/fixă, monedă și unitate de măsură;
- stoc: `tracked`/`unlimited`, cantitate și prag de stoc mic;
- vizibilitate: activ și recomandat;
- imagini: ID pentru imaginile păstrate sau Base64 pentru imagini noi, text alternativ și ordine;
- conformitate: producător, persoană responsabilă UE, model/identificator, avertismente, CE, documente, garanții, actualizări software, reparabilitate și piese de schimb;
- SEO: meta title și meta description.

### 4. Validarea din interfață

- numele duplicat este blocat;
- numele, slug-ul și prețul sunt obligatorii;
- prețul și costul nu pot fi negative;
- reducerea procentuală trebuie să fie sub 100%, iar cea fixă sub preț;
- prețul promoțional este calculat, nu introdus arbitrar;
- cea mai adâncă categorie selectată devine categoria principală;
- prima imagine din galerie este imaginea principală;
- SmartBill poate fi legat numai dacă SKU-ul verificat și gestiunea selectată corespund.

### 5. Validarea din API

API-ul repetă validările și mai impune:

- maximum 12 imagini;
- maximum 60 de specificații, fiecare cu denumire și valoare;
- maximum 30 de întrebări, fiecare cu răspuns;
- maximum 20 de URL-uri pentru fiecare grup de documente și numai HTTP/HTTPS valid;
- e-mailuri valide pentru producător/persoana UE;
- date software în format `YYYY-MM-DD`;
- referințe existente pentru categorii, branduri, producător și sursă;
- sursa trebuie să fie activă la creare;
- numele trebuie să fie unic; slug-ul și SKU-ul sunt făcute unice server-side;
- un produs Boomag primește stocul online din sursa lui, nu din câmpul manual;
- dacă SmartBill este autoritatea de inventar, stocul local este forțat la zero și urmărirea contabilă nu este activată de editor.

### 6. Tranzacția de creare

API-ul:

1. generează UUID-ul produsului;
2. începe tranzacția MySQL;
3. inserează rândul în `shop_products`;
4. sincronizează `shop_product_brands` și `shop_product_categories`;
5. salvează imaginile noi în storage și rândurile în `shop_product_images`, păstrând ordinea;
6. creează referințele furnizor necesare;
7. dacă stocul contabil local este autoritar și produsul tracked are stoc inițial, scrie mișcarea `initial`;
8. face commit; orice eroare înainte de commit produce rollback.

### 7. Acțiunile după commit

După salvarea produsului, API-ul rulează separat:

1. sincronizarea Stripe prin `stripeSyncProductSafe`;
2. citirea produsului complet prin `findProduct`;
3. generarea paginii SEO prin `shopProductSeoSync`, numai dacă `website_generation_enabled` este activ;
4. notificarea abonaților prin `shopNewsletterNotifyNewProduct`.

Eșecul Stripe, SEO sau newsletter nu anulează produsul deja salvat. Interfața afișează avertizările separat.

### 8. Legătura SmartBill

După răspunsul `createProduct`, aplicația apelează separat `linkProductSmartBill` numai dacă:

- căutarea SmartBill a returnat `verified`;
- există o gestiune aleasă;
- SKU-ul produsului salvat este identic cu SKU-ul verificat.

Apoi recitește produsul prin `getProduct`.

### 9. Efectul în website

Produsele active și cu taxonomiile active devin vizibile în `publicProductsPage` și `publicProduct`. Homepage, Magazin și Produs le citesc direct din API. Favoritele și coșul salvează ID-urile local; checkoutul trebuie să recitească `publicCheckoutProducts` și să obțină prețurile/stocul autoritar înainte de comandă.

Generatorul SEO legacy descris mai sus este singurul mecanism care poate recrea fișiere HTML G‑Trots după curățare.

## Funcții fiscale care nu pot fi simplificate în frontend

- Clientul poate anula public numai statusurile `new`, `confirmed`, `processing`; API-ul decide eligibilitatea.
- De la `shipped` încolo anularea publică este refuzată.
- Returul public este disponibil numai pentru `completed`, cu reguli PF/PJ și termene calculate de API.
- Confirmarea returului, factura de retur, NIR-ul de retur, refacerea FIFO și coada SPV sunt exclusiv server-side și idempotente.
- Frontendul colectează și trimite datele; nu reproduce calculele fiscale și nu decide singur eligibilitatea.

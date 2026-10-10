# Cubis Shop — raport etapa 1: izolare și Stripe TEST

Data verificării: 2026-10-09  
Workspace verificat: `D:\CAB IT\clienti\cubisshop.ro`

## Limite respectate

- Nu a fost accesat sau modificat folderul original `g-trots.ro`.
- Nu a fost pornită aplicația și nu a fost executat niciun deployment.
- Nu a fost deschisă nicio conexiune MySQL și nu au fost executate migrări sau interogări asupra vreunei baze.
- Nu au fost apelate Stripe, Google, Meta, Shopify, Gomag, ANAF/SPV, WhatsApp, Expo Push, IndexNow sau alte servicii externe.
- Nu a fost revocată, rotită sau modificată nicio cheie ori integrare din conturile originale.
- Logica fiscală de anulare, retur și ANAF/SPV a fost păstrată. Valorile de firmă copiate au fost eliminate din fallbackuri, iar emiterea/exportul refuză datele juridice Cubis incomplete.

## Izolarea configurației și a bazei de date

- Singurul nume MySQL permis este exact `cabitro_cubisshop.ro`.
- Sunt protejate separat API-ul SHOP, API-ul CRM, autentificarea, validarea linkurilor de resetare și runtime-ul SPV.
- Configurația incompletă refuză conexiunea: utilizatorul bazei și cheia API nu au valori implicite funcționale.
- Bootstrap-ul CRM este dezactivat și, chiar dacă va fi activat ulterior, refuză alt nume de bază și refuză crearea automată a bazei lipsă.
- URL-urile runtime SHOP acceptă numai `cubisshop.ro`, `www.cubisshop.ro` sau localhost; API-ul public trebuie să folosească `/shop-api`.
- Cheile locale de configurare ale aplicațiilor au namespace `cubis.systemApiConfig`, separat de instalațiile G-Trots.
- `config.local.php`, `api_config.local.php`, `gomag.local.php`, `.env` și variantele locale sunt ignorate de Git.
- Fișierele locale existente nu conțin credențiale; `.env` are doar URL-ul public Cubis Shop.

## Conținut și pagini generate

Au fost inventariate dependențele înainte de curățare, apoi eliminate exclusiv artefactele copiate:

- 20.000 pagini diagnostice generate;
- 481 pagini agregate de tip ghid/model;
- 1.615 directoare/pagini de produs;
- 67 directoare de paginare;
- dataseturile și indexurile de căutare copiate;
- snapshoturile de catalog, feedurile și sitemapurile de produse provenite din catalogul vechi;
- backupurile de catalog, rapoartele de import/promovare și kiturile APK/EXE/release copiate.

Starea finală locală:

- 44 pagini HTML operaționale în rădăcina website-ului;
- 0 directoare de produs în `website/magazin/produs`;
- 0 directoare de paginare în `website/magazin/pagina`;
- 0 fișiere de produs încărcate în `shop-api/uploads/products`;
- niciun APK/EXE/release al aplicației în afara dependențelor de dezvoltare.

Mecanismele de generare au fost păstrate și izolate:

- generatorul de produse cere `CUBIS_PUBLIC_API_URL` și acceptă numai API-ul Cubis Shop/localhost;
- generatorul diagnostic cere `CUBIS_DIAGNOSTIC_API_URL` și nu mai are fallback la datasetul copiat;
- ambele refuză configurația lipsă înainte de a modifica fișiere;
- metadatele publice `agents.md`/`llms*.txt` declară explicit că nu există încă un catalog Cubis publicat.

## Integrări eliminate

### Google Merchant Center

- Fișierele, rutele și acțiunile dedicate Merchant Center au fost eliminate.
- Nu există joburi de creare, actualizare sau ștergere produse în Merchant Center.
- Nu a fost apelat și nu a fost modificat contul Merchant Center original.

### Shopify Catalog

- Integrarea de catalog, rutele, configurările și joburile Shopify au fost eliminate.
- Nu există apeluri active către domenii Shopify.

### Meta

- Meta Pixel, evenimentele browser-side, Meta Conversions API și sincronizarea catalogului au fost eliminate.
- Nu există `fbq`, Pixel ID, endpoint de catalog sau endpoint CAPI activ.
- Accesul `graph.facebook.com` rămas aparține funcției WhatsApp CRM, distinctă de Meta tracking/catalog, și este blocat de master switch-ul automatizărilor externe.

## Google păstrat reutilizabil, dar inert

- Google Analytics, Google Customer Reviews, Search Console și Google Identity sunt tratate separat de Merchant Center.
- Identificatorii Cubis sunt goi în configurația implicită.
- Codul reutilizabil Analytics/Customer Reviews nu este inclus de nicio pagină și nu poate încărca scripturi fără ID valid; Analytics cere și consimțământ explicit.
- Paginile de login nu mai fac preconnect la Google. Scriptul Google Identity se încarcă numai după ce API-ul returnează un client ID Cubis.
- Nu există ID-uri GA4, GTM, Google Merchant Reviews sau chei Google copiate în surse.

## Stripe TEST

Fluxul existent a fost păstrat: produse/prețuri Stripe, checkout, confirmare, actualizare comandă, stoc și notificări.

Protecții aplicate:

- variabile dedicate: `CUBIS_STRIPE_SECRET_KEY`, `CUBIS_STRIPE_PUBLISHABLE_KEY`, `CUBIS_STRIPE_WEBHOOK_SECRET`;
- sunt acceptate numai chei `sk_test_` și `pk_test_`; cheile live sunt respinse explicit;
- sesiunile acceptate trebuie să fie `cs_test_` și să aibă metadata `cubisshop_project=cubisshop`;
- evenimentele webhook cu `livemode` diferit de `false` sunt respinse;
- semnătura webhook este verificată HMAC cu toleranță de 300 secunde;
- produsele și sesiunile noi folosesc metadata/idempotency Cubis Shop;
- identificatorii Stripe copiați nu sunt reutilizați fără dovada metadata Cubis.

Endpoint webhook identificat:

`https://cubisshop.ro/shop-api/api-v2.php?action=stripeWebhook`

Evenimente pregătite:

- `checkout.session.completed`
- `checkout.session.async_payment_succeeded`
- `checkout.session.async_payment_failed`
- `checkout.session.expired`

Scriptul CLI de înregistrare este TEST-only și salvează secretul numai în configurația locală ignorată de Git. Nu a fost executat, deoarece ar modifica un serviciu extern. Înregistrarea și livrarea reală a unui eveniment de test rămân verificări manuale după publicarea API-ului de test.

Cheile Stripe trimise în conversație nu au fost scrise în niciun fișier. Deoarece o cheie secretă a fost transmisă în clar, este recomandată generarea unei noi chei TEST înainte de configurarea mediului, fără a modifica sau revoca integrările G-Trots.

## Automatizări și conexiuni externe dezactivate

- e-mail tranzacțional și e-mail administrativ;
- sincronizare furnizor Gomag/Boomag, inclusiv acțiunile de import, audit, taxonomie, stoc și SEO;
- IndexNow; cheia copiată a fost eliminată;
- automatizări fiscale și worker SPV;
- WhatsApp Graph și Expo Push prin master switch CRM;
- update-uri OTA Expo și updater Electron;
- workflow-ul Electron poate porni numai manual (`workflow_dispatch`), fără trigger de push/tag.

Păstrate intenționat:

- codul ANAF/SPV și logica fiscală, dezactivate implicit;
- cursul BNR, doar la cerere pentru documente fiscale;
- codul furnizorului, blocat fail-closed, pentru o decizie/configurare Cubis ulterioară;
- funcționalitățile magazinului, checkout, comenzi, retur, facturare, NIR și service;
- structura vizuală și denumirile tehnice/brandingul legacy din UI, conform cerinței de a nu redesena magazinul sau modulul service în această etapă.

## Git și secrete

- `origin` indică la `https://github.com/CAB-IT-EXPERT/cubisshop.ro.git`, nu la repository-ul original.
- Branch-ul local `main` urmărește `origin/main`.
- Repository-ul are momentan doar `.gitignore`, `LICENSE` și `README.md` urmărite; sursele copiate și modificările acestei etape sunt încă neadăugate/necomise. Nu s-a făcut staging, commit sau push.
- Obiectele Git inaccesibile copiate au fost eliminate local; `git fsck --no-reflogs --unreachable` nu raportează obiecte.
- Scanările nu găsesc chei Stripe, webhook secrets, chei Google, tokenuri Meta/Shopify ori credențiale G-Trots în surse/configurații active.
- Scanarea nu găsește domeniul `g-trots.ro` în sursele active.
- `LICENSE` păstrează copyrightul CAB IT EXPERT; este metadată juridică a codului, nu configurație sau integrare.

## Verificări și teste

Trecute:

- lint PHP: 112 fișiere;
- verificare sintaxă Node: 93 fișiere JS/MJS/CJS;
- TypeScript: `tsc --noEmit`;
- JSON-LD: 20 blocuri valide în paginile HTML rămase;
- contractul principal de izolare Cubis;
- contractele Stripe TEST statice incluse în contractul de izolare;
- Google integrations disabled;
- checkout/payment labels;
- securitate SPV;
- trasabilitate FIFO retur;
- notificări administrative comenzi;
- conformitate magazin/cookies;
- navigație globală și filtre catalog mobil;
- taburi produse și performanță storefront;
- adresă publică/configurare companie;
- mecanism carusel service fără pagina generată G-Trots;
- status e-mail, badge-uri factură/SPV, valori NIR;
- tranziții status comandă și prețuri produse;
- testele fail-closed ale ambelor generatoare, fără modificarea outputului.

Limitări locale:

- Runtime-ul PHP local nu are `pdo_sqlite`, `mbstring`, `curl` și nu încarcă un `php.ini`. Testele funcționale care folosesc SQLite ori funcții `mb_*` nu pot porni; nu reprezintă apeluri eșuate către producție.
- `npm run lint` nu trece: 163 erori și 26 avertismente în codul UI copiat, în principal reguli React Hooks/React Compiler. `tsc --noEmit` trece. Aceste refactorizări nu au fost făcute pentru a nu extinde etapa la design/service.
- Webhookul Stripe a fost verificat static, dar nu a fost înregistrat și nu a primit un eveniment real de test, deoarece nu s-a făcut deployment și nu au fost permise modificări externe.

## Configurare manuală necesară

1. Creați manual baza `cabitro_cubisshop.ro` și un utilizator MySQL dedicat, apoi setați `CUBIS_DB_HOST`, `CUBIS_DB_NAME`, `CUBIS_DB_USER`, `CUBIS_DB_PASS` și `CUBIS_API_KEY` în mediul securizat.
2. Completați datele juridice, contactul și seria fiscală Cubis în noua bază înainte de emiterea/exportul documentelor.
3. Generați o cheie TEST nouă în contul lui George și configurați exclusiv valorile Stripe TEST în cele trei variabile `CUBIS_STRIPE_*`.
4. În Stripe TEST, creați/verificați endpointul webhook de mai sus, salvați secretul în `CUBIS_STRIPE_WEBHOOK_SECRET` și trimiteți cele patru evenimente de test.
5. Configurați ulterior, separat, ID-urile proprii Cubis pentru Google Identity, Analytics, Customer Reviews și Search Console.
6. Configurați SMTP Cubis înainte de activarea e-mailurilor.
7. Configurați și activați ANAF/SPV numai după pregătirea bazei și a credențialelor Cubis; păstrați master switch-urile oprite până la testarea controlată.
8. Regenerați catalogul, paginile de produs și conținutul diagnostic numai după ce noua bază conține date Cubis.
9. Revizuiți raportul și fișierele neadăugate, apoi faceți staging/commit în repository-ul Cubis numai după completarea controlată a configurației locale; fișierele cu secrete trebuie să rămână ignorate.

Nu s-a realizat deployment.

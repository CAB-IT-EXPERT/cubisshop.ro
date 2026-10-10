# CUBIS SHOP — raport final Etapa 3: cPanel, Apache, MySQL și Stripe TEST

Data verificării: 9 octombrie 2026.

## Rezultat

API-ul Cubis Shop este publicat controlat în
`/home/cabitro/cubisshop.ro/shop-api` și răspunde prin HTTPS la
`https://cubisshop.ro/shop-api/api-v2.php`. API-ul CRM/admin/service este la
`https://cubisshop.ro/shop-api/crm/api.php`.

Baza folosită este exact `cabitro_cubisshop.ro`. Schema versiunea
`2026100901` are 81 de tabele confirmate în MySQL. Nu au fost importate produse,
clienți, comenzi sau alte date operaționale G-Trots. Proiectul, baza și
integrările G-Trots nu au fost accesate sau modificate.

Website-ul și aplicațiile nu au fost publicate. Hostingul redirecționează însă
în prezent rădăcina `cubisshop.ro` și ruta `/plata-finalizata` prin HTTP 301
către `cab-it.ro`. Această regulă este în afara API-ului publicat și trebuie
corectată înainte de lansarea website-ului.

## Acces, backup și migrare

- transferul s-a făcut prin FTPS explicit cu TLS, port 21, folosind hostul care
  corespunde certificatului: `d108.dataserver.ro`;
- document root confirmat: `/home/cabitro/cubisshop.ro`;
- SSH și MySQL extern nu au fost disponibile;
- migrarea a fost executată printr-un instalator PHP temporar limitat prin
  HTTPS, host exact, IP, Basic Auth, token unic, confirmarea exactă a bazei și
  protecție la repetare;
- instalatorul a fost șters: URL 404 și 0 fișiere `cubis-install-*.php` în
  listarea FTPS.

Backupul bazei goale, realizat înainte de migrare, este în afara document root:

- `/home/cabitro/.cubisshop-backups/before-stage3-20261009-135303-25b82b44f92d.sql`;
- 152 bytes;
- SHA-256 `16C52874582C96BA65CDF89D4F41D78B5970B8A7733BEE0F04DC2CED0E22AC61`.

Migrarea reutilizează `shop-api/migration-service.php` și schema existentă.
Utilitarul `migrate.php` rămâne dry-run implicit și cere simultan `--apply` și
`--confirm=cabitro_cubisshop.ro`.

### De ce sunt 81 de tabele, nu 80

Planul Etapei 2 inventaria 18 tabele CRM/auth/service și 62 tabele de magazin,
în total 80. Schema efectivă mai conține tabelul structural nou
`shop_company_receipt_locations`, folosit pentru locațiile de recepție/stoc ale
companiei. Acesta explică exact diferența. Nu este un tabel importat din datele
operaționale G-Trots.

## Administrator și politica parolelor

Primul administrator a fost creat în `app_users`, cu rol `admin`, folosind
datele cerute explicit. Parola inițială de 5 caractere a fost permisă numai ca
excepție unică în instalatorul temporar și nu este inclusă în acest raport.

Politica generală pentru crearea și modificarea utilizatorilor administrativi
este acum minimum 6 caractere. Verificarea live a confirmat:

- 5 caractere: HTTP 422;
- 6 caractere: HTTP 201;
- utilizatorul de verificare a fost șters imediat: HTTP 200;
- autentificarea administratorului inițial: reușită, rol `admin`.

## Teste funcționale executate în baza Cubis

Au fost folosite exclusiv date fictive:

- categorie creată și modificată: `f23f54cf-9811-4add-abfd-6d8018ff127b`;
- produs creat și modificat: `44112513-b30a-4061-8844-8f61a01d2a4b`;
- imaginile produsului au fost adăugate, citite și eliminate; imaginea păstrată
  răspunde 200, cea eliminată răspunde 404;
- citirea produsului și catalogului prin API-ul public a trecut;
- metodă de livrare de test: `ace0934f-e46e-4c54-8306-3382baf2af53`;
- comandă ramburs: `CS-20261009-8FDDD3DC`, creată și actualizată fără email;
- mișcările de stoc sunt vizibile prin API; stocul final al produsului este 22.

Testarea unei sesiuni Stripe anulate a descoperit o problemă reală: anularea
unei sesiuni neplătite adăuga eronat o unitate în stoc, deși checkout-ul nu
scăzuse stocul. `stripeRestoreOrderStock()` a fost corectată astfel încât
sesiunile neplătite să fie doar anulate/marcate eșuate. Testul live ulterior a
confirmat stoc 22 înainte și după anulare. O ajustare explicită de test a
corectat prima mișcare eronată; istoricul fictiv păstrează auditul complet.

## Stripe TEST

Serverul acceptă exclusiv chei `sk_test_` și `pk_test_`. Nu există chei LIVE în
configurația activă. Configurația publică raportează
`stripe_configured=true`, `stripe_test_mode=true` și `card_enabled=true`.

Webhookul TEST activ este `we_1UOezdFeHvmezN57c0v4r3qc`, cu status `enabled`,
`livemode=false` și URL exact:

`https://cubisshop.ro/shop-api/api-v2.php?action=stripeWebhook`

Evenimentele active sunt:

- `checkout.session.completed`;
- `checkout.session.async_payment_succeeded`;
- `checkout.session.async_payment_failed`;
- `checkout.session.expired`.

Fluxul complet verificat:

- sesiune Checkout TEST creată pentru comanda
  `CS-20261009-8E130C7E`, total 17,50 RON;
- plata TEST a fost confirmată în pagina Stripe Sandbox;
- webhookul real `checkout.session.completed` a actualizat MySQL înaintea
  interogării explicite de status;
- comanda `1df75aa6-0b11-46ea-81f6-e5317238fb59` este `confirmed`, plata este
  `paid` și are PaymentIntent asociat;
- replay-ul aceluiași eveniment semnat corect răspunde 200, `duplicate=true`,
  fără reprocesare;
- semnătura invalidă este respinsă cu HTTP 422;
- un eveniment TEST semnat `checkout.session.async_payment_failed` a fost
  procesat o singură dată, iar replay-ul a fost detectat ca duplicat;
- o sesiune neplătită anulată a devenit `cancelled`/`failed`, fără modificarea
  stocului;
- facturarea automată, emailul și SPV au rămas dezactivate.

Secretul webhookului și cheia operațională API au fost regenerate după
verificări. Valorile curente există numai în configurațiile locale securizate,
în server și în fișierele DPAPI ignorate de Git.

## Fișiere și protecții publicate

Au fost publicate numai API-ul și resursele lui:

- endpointurile și serviciile PHP din `shop-api`;
- API-ul CRM și structurile modulului de service în `shop-api/crm`;
- schema/migrările, utilitarele CLI și protecțiile Apache;
- `config.local.php` și `crm/api_config.local.php`, generate local și ignorate
  de Git;
- corecțiile pentru politica parolei, webhook/stoc, deep-linkul
  `cubisshop://`, brandingul activ al API-ului și protecția documentației.

Verificările HTTP finale:

- health autorizat: 200, serviciu `Cubis Shop API`, baza exactă confirmată;
- endpoint administrativ fără sesiune: 401;
- `config.local.php`, `migrate.php`, `create-initial-admin.php` și fișierele
  Markdown de deployment: 403;
- schema SQL nu este accesibilă public: 404;
- instalatorul temporar: 404 și absent din FTPS.

Arhiva actualizată este
`outputs/cpanel-shop-api/cubis-shop-api-cpanel.zip`:

- SHA-256 `0C765B76CC691E3F67D698CCEDDF3D1F30F77E38DA172E40D46ECA866E4F74A9`;
- 14.881.587 bytes;
- 455 intrări, 32.209.516 bytes necomprimați;
- 0 teste și 0 configurații locale/secrete incluse.

## Aplicații, repository și secrete

Configurațiile implicite ale aplicațiilor folosesc exclusiv:

- CRM/admin/service: `https://cubisshop.ro/shop-api/crm/api.php`;
- magazin/comenzi/facturare: `https://cubisshop.ro/shop-api`.

Placeholderul vechi din setările Electron a fost înlocuit. Descărcarea
implicită a aplicației G-Trots a fost eliminată, iar aplicațiile Cubis nu sunt
distribuite în această etapă. Schema de deep-link este `cubisshop://`.

Scanarea a 156 de fișiere client și 1.143 de fișiere ale repository-ului a
confirmat 0 apariții pentru parola MySQL, parola FTPS, cheia secretă Stripe,
secretul webhookului și cheia master API în surse/builduri publice. Nu există
chei Stripe LIVE în clienți. Remote-ul Git este
`https://github.com/CAB-IT-EXPERT/cubisshop.ro.git`, nu repository-ul original.

Website-ul copiat păstrează intenționat conținutul/paginile G-Trots până la o
etapă ulterioară; nu a fost publicat. API-ul mai păstrează nume interne de clase
și texte de prezentare în module fiscale/service/newsletter reutilizate, dar
emailurile, SPV, newsletterul și automatizările sunt dezactivate. Nu mai există
URL extern activ către domeniul sau repository-ul G-Trots în API ori clienți.

## Integrări dezactivate

Configurația serverului are:

- `automations_enabled=false`;
- `email_enabled=false`;
- `admin_email_enabled=false`;
- `spv_enabled=false`;
- `website_generation_enabled=false`.

Nu există cron configurat. Google Merchant, Shopify Catalog, Meta Pixel/CAPI,
catalogul Meta și acțiunile de sincronizare ale furnizorului sunt dezactivate
sau eliminate din fluxul activ. Google Analytics, Customer Reviews și Search
Console nu au identificatori G-Trots activi și rămân neconfigurate.

## Verificări locale

- 267/267 fișiere PHP din pachet: lint trecut;
- TypeScript: `tsc --noEmit` trecut;
- `cubis_isolation_contract_test`: trecut;
- regresia de stoc pentru Stripe eșuat/anulat: trecută;
- suită PHP: 68 fișiere — 38 trecute, 2 sărite explicit, 14 blocate de lipsa
  `mbstring` local, 12 blocate de lipsa `pdo_sqlite` local, 1 fixture legacy
  absent și 1 aserțiune legacy independentă;
- serverul are PHP 8.2.34 cu `curl`, `fileinfo`, `mbstring`, `openssl`,
  `pdo_mysql` și `zip`.

## Intervenție manuală rămasă

1. Eliminarea/redirecționarea corectă în cPanel a regulii care trimite
   `cubisshop.ro/` și `/plata-finalizata` către `cab-it.ro`, înainte de lansarea
   website-ului.
2. Configurarea identității Cubis pentru email, facturi, SPV, Analytics,
   Customer Reviews și Search Console înainte de activarea acelor module.
3. Schimbarea parolei administratorului este recomandată înainte de utilizarea
   operațională, chiar dacă parola cerută a fost păstrată în această etapă.
4. Website-ul copiat trebuie curățat/generat numai din viitoarele date Cubis;
   nu trebuie publicat în forma actuală.

API-ul și Stripe TEST sunt pregătite pentru utilizare controlată. Nu s-a făcut
deployment pentru website și nu s-a distribuit nicio aplicație.

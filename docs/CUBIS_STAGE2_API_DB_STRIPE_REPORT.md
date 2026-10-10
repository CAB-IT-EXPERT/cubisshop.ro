# Cubis Shop — Etapa 2: bază de date, API PHP și Stripe TEST

Data verificării: 9 octombrie 2026  
Status: pachet API pregătit pentru deployment controlat; fără deployment și fără
execuția migrărilor.

## Limite respectate

- Nu a fost deschisă nicio conexiune MySQL și nu a fost accesată baza G-Trots.
- Nu au fost executate migrări, DDL, importuri sau interogări de modificare.
- Nu a fost apelat Stripe și nu a fost înregistrat webhookul.
- Nu au fost modificate designul, aplicațiile mobile/desktop sau modulul de service.
- Nu au fost importate produse, categorii, clienți, comenzi, facturi ori fișe.

## Fișiere configurate

- `shop-api/config.example.php` — toate valorile MySQL provin exclusiv din
  `CUBIS_DB_*`; baza și autentificarea sunt fixate la aceeași bază Cubis.
- `shop-api/api.php` — conexiune fail-closed, verificare `SELECT DATABASE()`,
  migrare HTTP eliminată, autentificare administrativă, administrare utilizatori,
  CORS allowlist, prefix comenzi `CS-` și generarea website-ului dezactivată.
- `server/api.php` și `server/api_config.example.php` — CRM pe aceeași bază,
  fără creare/migrare din HTTP și fără expunerea cheii master sau parolei DB.
- `shop-api/reset-link-status.php` și `shop-api/spv-runtime.php` — aceleași
  reguli stricte `CUBIS_DB_*`, port și verificarea bazei selectate.
- `shop-api/stripe.php` — revendicare atomică a evenimentelor webhook și retry
  numai pentru evenimente eșuate.
- `shop-api/.htaccess`, `.user.ini`, `uploads/.htaccess` — protecția fișierelor
  CLI/config/SQL, HTTPS, headere, limite PHP și blocarea execuției în uploads.
- `shop-api/migrate.php` — plan implicit fără conexiune; aplicare numai CLI cu
  `--apply --confirm=cabitro_cubisshop.ro`.
- `shop-api/create-initial-admin.php` — creare controlată a primului admin.
- `shop-api/check-php-extensions.php` — verificarea runtime-ului Plesk.
- `shop-api/migrations/20261009_cubis_crm_auth_service_schema.sql` — schema
  consolidată CRM/auth/service, fără date operaționale.
- `shop-api/migrations/MIGRATION_PLAN.md` și `shop-api/DEPLOYMENT_PLESK.md` —
  ordinea operațională și checklistul Plesk.
- `scripts/build-plesk-shop-api-package.ps1` — pachet reproductibil, fără
  configurații locale, teste sau utilitarul care ar crea webhookul.

## Schema pregătită

Schema consolidată are 80 de tabele: 18 pentru CRM/auth/service și 62 `shop_*`.

### CRM, autentificare și aplicații — 18

`app_users`, `app_sessions`, `app_push_tokens`, `app_migrations`,
`company_settings`, `price_presets`, `whatsapp_predefined_messages`, `profiles`,
`collaborators`, `clients`, `client_user_access`, `client_activity_logs`,
`client_collaborator_costs`, `expense_categories`, `client_expense_costs`,
`chat_conversations`, `chat_messages`, `service_sheets`.

### Magazin și catalog

`shop_schema_meta`, `shop_categories`, `shop_brands`, `shop_manufacturers`,
`shop_product_sources`, `shop_products`, `shop_product_brands`,
`shop_product_categories`, `shop_product_images`, `shop_product_reviews`,
`shop_supplier_sync_state`, `shop_suppliers`, `shop_supplier_product_references`,
`shop_legacy_supplier_codes`.

### Clienți, promoții, checkout și comenzi

`shop_customers`, `shop_customer_sessions`, `shop_customer_password_resets`,
`shop_customer_addresses`, `shop_coupons`, `shop_customer_coupons`,
`shop_coupon_products`, `shop_coupon_device_usage`,
`shop_coupon_customer_usage`, `shop_payment_settings`, `shop_shipping_methods`,
`shop_orders`, `shop_order_items`, `shop_order_status_history`,
`shop_order_admin_notifications`, `shop_order_return_items`,
`shop_admin_login_attempts`.

### Stripe, facturare și avize

`shop_stripe_events`, `shop_invoice_settings`, `shop_invoice_sequences`,
`shop_invoices`, `shop_invoice_automation_settings`,
`shop_invoice_automation_runs`, `shop_invoice_theme_assignments`,
`shop_shipping_note_sequences`, `shop_shipping_notes`.

### Stoc, NIR și FIFO

`shop_warehouses`, `shop_nir_settings`, `shop_nir_documents`, `shop_nir_lines`,
`shop_nir_attachments`, `shop_nir_idempotency`, `shop_inventory_movements`,
`shop_inventory_cost_layers`, `shop_inventory_layer_consumptions`,
`shop_customer_return_fifo_origins`,
`shop_customer_return_supplier_storno_allocations`, `shop_domain_audit`,
`shop_domain_outbox`.

### SPV, notificări și newsletter

`shop_spv_connections`, `shop_spv_settings`, `shop_spv_oauth_states`,
`shop_spv_outbox`, `shop_notifications`, `shop_notification_dismissals`,
`shop_newsletter_subscribers`, `shop_newsletter_deliveries`.

Migrarea creează numai setările tehnice minime: gestiunea principală, setările
NIR, seria de factură `CS` și setările de automatizare dezactivate. Nu creează
produse, categorii, clienți, comenzi, facturi sau utilizatori. Categoria
second-hand nu mai este inserată automat; mecanismul ei rămâne în cod.

Fișierele SQL istorice NIR/FIFO/second-hand/retur rămân documentație. Pentru o
bază nouă, starea lor finală este inclusă de migrarea consolidată și nu se rulează
din nou individual.

## Endpointuri verificate

- Catalog public: `publicProducts`, `publicProductsPage`, `publicProduct`,
  `publicCatalogFilters`, `publicProductReviews`, `publicShopConfig`.
- Cont client: `customerRegister`, `customerLogin`, `customerGoogleLogin`,
  `customerMe`, adrese, comenzi, resetare parolă și ștergere cont.
- Administrare: `adminLogin`, `adminMe`, `adminLogout`; `listUsers`,
  `createUser`, `updateUser`, `deleteUser` sunt rezervate rolului admin.
- Produse/categorii: CRUD produse, surse, categorii, branduri și producători.
- Comenzi/checkout: `createPublicOrder`, tracking, anulare/retur, listare și
  actualizare administrativă.
- Stoc: inventar, mișcări, ajustări, NIR și FIFO.
- Facturare: emitere, listare, download, e-mail, avize și exporturi.
- Stripe: creare sesiune TEST, `stripeCheckoutStatus`, anulare sesiune și
  `stripeWebhook`.

Rutele publice nu cer cheia master. Rutele administrative folosesc
`X-Auth-Token`. `CUBIS_API_KEY` este numai server-side și protejează health-ul
detaliat/operațiunile server-to-server. Loginul are limită de cinci încercări la
15 minute pentru perechea IP/utilizator.

## Stripe TEST

Endpoint webhook pregătit:

`https://cubisshop.ro/shop-api/api-v2.php?action=stripeWebhook`

Configurațiile acceptate sunt numai:

- `CUBIS_STRIPE_SECRET_KEY=sk_test_...`
- `CUBIS_STRIPE_PUBLISHABLE_KEY=pk_test_...`
- `CUBIS_STRIPE_WEBHOOK_SECRET=whsec_...`

Codul respinge cheile live, evenimentele `livemode=true`, sesiunile care nu au
prefix `cs_test_` și obiectele fără metadata `cubisshop_project=cubisshop`.
Semnătura are toleranță de 300 secunde. `shop_stripe_events` revendică atomic
fiecare event ID; duplicatele `processing/processed` nu sunt reprocesate, iar un
event `failed` poate fi reluat controlat.

Evenimentele webhook necesare sunt:

- `checkout.session.completed`
- `checkout.session.async_payment_succeeded`
- `checkout.session.async_payment_failed`
- `checkout.session.expired`

Webhookul nu a fost înregistrat și nu a fost trimis niciun eveniment extern.

## Variabile care se completează manual în Plesk

Obligatorii înaintea migrării:

- `CUBIS_DB_HOST`
- `CUBIS_DB_PORT` (`3306`, dacă Plesk nu indică alt port)
- `CUBIS_DB_NAME=cabitro_cubisshop.ro`
- `CUBIS_DB_USER`
- `CUBIS_DB_PASS`
- `CUBIS_API_KEY` — secret aleator server-side, minimum 32 bytes
- `CUBIS_ALLOWED_ORIGINS=https://cubisshop.ro,https://www.cubisshop.ro`

Stripe TEST înaintea testului checkout:

- `CUBIS_STRIPE_SECRET_KEY`
- `CUBIS_STRIPE_PUBLISHABLE_KEY`
- `CUBIS_STRIPE_WEBHOOK_SECRET`

Rămân `false`: `CUBIS_AUTOMATIONS_ENABLED`,
`CUBIS_WEBSITE_GENERATION_ENABLED`, `CUBIS_EMAIL_ENABLED`,
`CUBIS_ADMIN_EMAIL_ENABLED`, `CUBIS_SPV_ENABLED`.

Pentru primul administrator se folosesc temporar
`CUBIS_INITIAL_ADMIN_USERNAME`, `CUBIS_INITIAL_ADMIN_PASSWORD` și
`CUBIS_INITIAL_ADMIN_DISPLAY_NAME`. Parola temporară se elimină după rularea CLI.

## Pachet Plesk

Arhiva pregătită local:

`outputs/plesk-shop-api/cubis-shop-api-plesk.zip`

SHA-256:

`7F52F60B267C713ABFF728F2D0293612B00F880262672737DC586602BB81A517`

Conținutul arhivei se extrage astfel încât `api-v2.php` să fie în directorul
public `shop-api`. Pachetul nu conține `config.local.php`, `.env`, teste,
credenciale sau utilitarul de înregistrare Stripe. Include implementarea PHP,
bibliotecile PDF, asseturile fiscale, schema/migrările, protecțiile Apache și
directoarele uploads securizate.

## Teste

Au trecut:

- PHP lint: 338 fișiere;
- TypeScript `tsc --noEmit`;
- 39 teste PHP, inclusiv izolarea Cubis, contractul deploymentului, autentificare
  statică, semnătura webhook Stripe, SPV security, fluxurile de status/retur,
  produse, checkout, facturare și NIR contract;
- dry-run migrare și dry-run creare administrator: fără conexiune MySQL;
- build pachet și scanare: zero fișiere locale/secrete/teste interzise;
- scanare statică: fără chei Stripe reale, `g-trots.ro`, CORS wildcard sau nume
  alternativ de bază în sursele API active.

Blocate de runtime-ul PHP local, nu de cod:

- 12 teste necesită `pdo_sqlite`;
- 13 teste necesită `mbstring`.

Verificarea extensiilor locale mai raportează lipsă `curl`, `fileinfo`,
`openssl`, `pdo_mysql` și `zip`; acestea trebuie activate în Plesk înainte de
deployment. `gd` și `intl` sunt recomandate.

Două contracte UI existente nu trec și nu au fost modificate, deoarece sunt în
afara etapei API: testul bannerului de livrare caută un asset CSS absent, iar
testul aliasului de furnizor indică o afișare mobilă a denumirii juridice.

Nu au putut fi executate fără deployment/configurare:

- aplicarea reală a schemei pe MariaDB/MySQL;
- testul de conexiune la `cabitro_cubisshop.ro`;
- checkoutul Stripe TEST și livrarea webhookului;
- endpointurile HTTP prin Plesk/LiteSpeed.

## Concluzie

API-ul este pregătit pentru încărcare controlată în Plesk, dar nu trebuie să
primească trafic funcțional până când extensiile PHP și variabilele sunt
configurate, schema este revizuită împreună și migrarea CLI este aprobată.
Deploymentul și migrarea nu au fost executate.


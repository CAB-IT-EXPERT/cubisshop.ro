# Cubis Shop API pe cPanel + Apache

Document root confirmat: `/home/cabitro/cubisshop.ro`.

API-ul se publică exclusiv în `shop-api/`; website-ul nu face parte din acest
deployment. Configurația server-side este `shop-api/config.local.php`, este
ignorată de Git și blocată de `.htaccess`. Valorile MySQL sunt injectate numai
în variabilele `CUBIS_DB_*`, iar codul refuză orice bază diferită de
`cabitro_cubisshop.ro`.

Endpointuri:

- magazin/comenzi/facturare: `https://cubisshop.ro/shop-api/api-v2.php`;
- CRM/admin/service: `https://cubisshop.ro/shop-api/crm/api.php`.

CRM-ul are configurația separată `shop-api/crm/api_config.local.php`, protejată
prin `crm/.htaccess`, dar folosește aceleași variabile `CUBIS_DB_*` și aceeași
bază. Aplicațiile client nu primesc cheia master și nu se conectează direct la
MySQL.

## Runtime verificat

- PHP 8.2.34;
- extensii: `curl`, `fileinfo`, `mbstring`, `openssl`, `pdo_mysql`, `zip`;
- HTTPS și Apache `.htaccess` active;
- email, SPV, generarea website-ului și automatizările externe dezactivate.

## Migrare

Migrarea structurală se execută o singură dată cu serviciul comun din
`migration-service.php`. Utilitarul CLI rămâne:

```bash
php /home/cabitro/cubisshop.ro/shop-api/migrate.php \
  --apply --confirm=cabitro_cubisshop.ro
```

Migrarea nu importă produse, clienți, comenzi sau alte date operaționale și se
oprește dacă detectează date în tabelele operaționale.

## Primul administrator

Crearea rămâne exclusiv CLI și necesită o parolă aleasă, de minimum 6
caractere. Nu există parolă implicită și nu există bootstrap HTTP.

```bash
export CUBIS_INITIAL_ADMIN_USERNAME='alege-utilizatorul'
export CUBIS_INITIAL_ADMIN_DISPLAY_NAME='Numele afișat'
read -s CUBIS_INITIAL_ADMIN_PASSWORD
export CUBIS_INITIAL_ADMIN_PASSWORD
php /home/cabitro/cubisshop.ro/shop-api/create-initial-admin.php \
  --apply --confirm=cabitro_cubisshop.ro
unset CUBIS_INITIAL_ADMIN_PASSWORD
```

## Stripe TEST

Endpointul configurat este:

`https://cubisshop.ro/shop-api/api-v2.php?action=stripeWebhook`

Sunt acceptate numai chei `sk_test_` / `pk_test_` și evenimente cu
`livemode=false`. Secretul `whsec_` rămâne numai în configurația server-side.

## Automatizări

Nu se configurează cron în această etapă. În special, `spv-cron.php` rămâne
inaccesibil prin HTTP și nu trebuie programat înainte de configurarea fiscală
Cubis Shop.

## SmartBill V1 + V3

Credențialele se configurează exclusiv în `config.local.php` sau în mediul PHP
al contului cPanel, niciodată în aplicațiile Expo/EAS ori Electron:

```text
CUBIS_SMARTBILL_V1_EMAIL
CUBIS_SMARTBILL_V1_TOKEN
CUBIS_SMARTBILL_V3_TOKEN
CUBIS_SMARTBILL_CIF
CUBIS_SMARTBILL_CREDENTIAL_KEY
CUBIS_SMARTBILL_READ_ENABLED=true
CUBIS_SMARTBILL_AUTO_SYNC_INTERVAL=300
CUBIS_SMARTBILL_ISSUING_ENABLED=false
CUBIS_SMARTBILL_EMAIL_ENABLED=false
```

`CUBIS_SMARTBILL_CREDENTIAL_KEY` este obligatorie dacă datele V1/V3 sunt
introduse din ecranul de administrare. Trebuie să fie un secret unic al
serverului de minimum 32 de caractere. În acest mod, e-mailul, CIF-ul și
tokenurile sunt salvate într-un singur payload AES-256-GCM; cheia nu este
salvată în MySQL. Variabilele individuale `CUBIS_SMARTBILL_V1_*`,
`CUBIS_SMARTBILL_V3_TOKEN` și `CUBIS_SMARTBILL_CIF` rămân alternativa pentru
administrarea exclusivă din mediul serverului și au prioritate față de seiful
criptat.

Ultimele două porți rămân `false` până la aprobarea explicită a emiterii și a
trimiterii e-mailurilor fiscale. Migrarea SmartBill este aditivă, verifică baza
exactă și nu apelează servicii externe:

```bash
php /home/cabitro/cubisshop.ro/shop-api/migrate-smartbill.php
php /home/cabitro/cubisshop.ro/shop-api/migrate-smartbill.php \
  --apply --confirm=cabitro_cubisshop.ro
```

După migrare se testează mai întâi conexiunile V1/V3 și sincronizarea read-only
a seriilor și gestiunilor. Gestiunea se alege explicit pentru fiecare produs;
configuratorul nu aplică automat o singură gestiune întregului catalog.

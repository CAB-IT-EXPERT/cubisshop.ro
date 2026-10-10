# Deployment și release

[← SmartBill](SmartBill-Integration.md) · [Testing →](Testing-and-Quality.md)

## Starea confirmată

```text
[+] Shop API publicat controlat
[+] CRM/auth API publicat controlat
[+] MySQL Cubis migrat si izolat
[~] Stripe numai TEST
[~] SmartBill read-only configurabil
[x] Website nepublicat
[x] Aplicatii nedistribuite public
[x] Emitere/e-mail SmartBill pana la aprobare explicita
```

Prezența unui modul în surse nu înseamnă că este activ în producție. Verifică porțile de configurare și traseul efectiv al requestului.

## Topologie cPanel

```text
/home/cabitro/cubisshop.ro/
|
+-- shop-api/
|   +-- api-v2.php              endpoint Shop stabil
|   +-- api.php                 implementare
|   +-- crm/
|   |   +-- api.php             construit din server/api.php
|   +-- uploads/                storage neexecutabil
|   +-- config.local.php        secret, blocat HTTP
|
+-- website/ sau document root  numai dupa checklistul de lansare
```

## Preflight API

- [ ] backup recuperabil în afara document root;
- [ ] PHP 8.2+;
- [ ] extensiile obligatorii active;
- [ ] HTTPS și `.htaccess` active;
- [ ] baza este exact `cabitro_cubisshop.ro`;
- [ ] allowlist CORS explicit;
- [ ] configurațiile locale nu sunt urmărite de Git;
- [ ] Stripe este TEST;
- [ ] SmartBill este în starea aprobată;
- [ ] testele și scanarea de secrete trec;
- [ ] există plan de rollback.

## Pachetul cPanel

```powershell
./scripts/build-cpanel-shop-api-package.ps1
```

Builderul:

1. pregătește Shop API;
2. copiază `server/` în `crm/`;
3. elimină fișiere locale și teste;
4. refuză `.env`, `*.local.php` și patternuri de secrete;
5. generează arhiva în `outputs/cpanel-shop-api/`.

`outputs/` este ignorat. Pentru fiecare release calculează un hash nou; nu reutiliza hashul dintr-un raport vechi.

## Runtime PHP

```powershell
php shop-api/check-php-extensions.php
```

Extensiile obligatorii includ `curl`, `dom`, `fileinfo`, `json`, `mbstring`, `openssl`, `pdo`, `pdo_mysql`, `simplexml`, `xml`, `xmlreader`, `xmlwriter` și `zip`.

CLI și Apache/FPM pot folosi configurații PHP diferite. Verifică runtime-ul care va executa efectiv API-ul.

## Migrare

Dry-run:

```bash
php /home/cabitro/cubisshop.ro/shop-api/migrate.php
```

Aplicare:

```bash
php /home/cabitro/cubisshop.ro/shop-api/migrate.php \
  --apply --confirm=cabitro_cubisshop.ro
```

Migrarea este CLI-only, cere numele exact al bazei și nu trebuie expusă prin HTTP. Urmează [MIGRATION_PLAN.md](https://github.com/CAB-IT-EXPERT/cubisshop.ro/blob/main/shop-api/migrations/MIGRATION_PLAN.md).

## Primul administrator

Se creează separat după migrare, cu variabile temporare și fără parola în linia de comandă:

```bash
export CUBIS_INITIAL_ADMIN_USERNAME='utilizator'
export CUBIS_INITIAL_ADMIN_DISPLAY_NAME='Nume afisat'
read -s CUBIS_INITIAL_ADMIN_PASSWORD
export CUBIS_INITIAL_ADMIN_PASSWORD
php /home/cabitro/cubisshop.ro/shop-api/create-initial-admin.php \
  --apply --confirm=cabitro_cubisshop.ro
unset CUBIS_INITIAL_ADMIN_PASSWORD
```

## SmartBill

Ordinea de activare:

```text
[1] credentiale server-side
 -> [2] conexiune V1/V3
 -> [3] sincronizare read-only
 -> [4] asociere produse/gestiuni
 -> [5] test reconciliere
 -> [6] aprobare emitere
 -> [7] aprobare e-mail, separat
```

Emiterea normală este rutată prin SmartBill. Nu activa o cale locală paralelă doar pentru că există cod istoric în repository. Scrierile contabile locale rămân blocate implicit.

## Smoke test după API deploy

1. health autorizat confirmă serviciul și baza;
2. ruta admin fără sesiune răspunde 401/403;
3. configurațiile și utilitarele CLI răspund 403/404 prin HTTP;
4. catalogul public nu expune câmpuri interne;
5. loginul admin și o citire protejată funcționează;
6. Stripe raportează TEST;
7. SmartBill read-only afișează starea corectă fără token;
8. emiterea rămâne conform porții configurate;
9. nu există instalatoare temporare;
10. logurile nu conțin secrete.

## Website

Preview:

```powershell
python scripts/serve-website.py 4173
```

Checklist de lansare:

- [ ] redirectul hostingului către alt domeniu este eliminat/corectat;
- [ ] conținutul moștenit este înlocuit cu date Cubis;
- [ ] identitatea juridică și contactul sunt corecte;
- [ ] checkoutul și trackingul folosesc API-ul Cubis;
- [ ] paginile legale sunt validate;
- [ ] Stripe rămâne în mediul aprobat;
- [ ] datele structurate, sitemapul și robots sunt verificate;
- [ ] analytics se activează numai cu consimțământ și ID Cubis;
- [ ] există rollback al document root-ului.

## Mobil — EAS

`eas.json` definește:

- `development` — client de dezvoltare intern;
- `preview` — APK intern;
- `production` — auto-increment.

Înainte de build verifică versiunea, `versionCode`, package ID, iconurile, URL-urile API și faptul că Expo Updates este intenționat dezactivat.

## Desktop — GitHub Release

Workflow-ul este manual (`workflow_dispatch`). Înainte de release:

1. crește versiunea din `electron-app/package.json`;
2. rulează testele desktop;
3. construiește local dacă schimbarea este riscantă;
4. verifică feedul de update;
5. rulează workflow-ul cu tag explicit;
6. verifică installerul pe sistem curat;
7. publică împreună `.exe`, `.blockmap` și `latest.yml`.

## Rollback

- API: redeploy al pachetului anterior, fără a suprascrie configurația;
- DB: restaurare numai din backup verificat și plan explicit;
- SmartBill: oprește emiterea/e-mailul înainte de diagnostic;
- website: comutare atomică la versiunea publicată anterior;
- desktop: release corectiv cu versiune mai mare.

Rollbackul codului nu anulează plăți, documente sau e-mailuri deja produse extern.

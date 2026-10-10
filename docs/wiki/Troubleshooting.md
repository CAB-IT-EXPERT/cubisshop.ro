# Depanare

[← Securitate](Security-and-Operations.md) · [Contribuții →](Contributing.md)

## Ordinea corectă

```text
[UI] -> [RETEA] -> [ENDPOINT] -> [AUTH] -> [VALIDARE] -> [DB] -> [INTEGRATOR]
```

Găsește primul strat care diferă de contract. Nu schimba simultan clientul, API-ul și integrarea.

## Expo/Metro nu pornește

1. confirmă Node 20;
2. rulează `npm ci`;
3. rulează `npm run typecheck`;
4. oprește procesele Metro vechi;
5. curăță cache-ul numai dacă eroarea îl indică;
6. verifică compatibilitatea Expo Go/dev client cu SDK 57.

Nu șterge lockfile-ul pentru a masca o dependență inconsistentă.

## Clientul nu ajunge la API

- URL efectiv și schema HTTPS;
- DNS/certificat;
- accesul emulatorului/dispozitivului;
- CORS doar unde se aplică browserului;
- redirect WAF/hosting;
- răspuns JSON versus HTML;
- timeout și log server.

`localhost` pe telefon/emulator nu este neapărat PC-ul de dezvoltare.

## 401 / 403

Verifică:

- sesiune expirată/revocată;
- token trimis incorect;
- accesul utilizatorului la platformă;
- rolul cerut;
- endpoint admin apelat fără login;
- ceas sau storage inconsistent.

Nu ocoli autorizarea din UI sau server.

## CRM API răspunde 404

În repository sursa este `server/api.php`; în pachet devine `shop-api/crm/api.php`. Dacă ai publicat manual numai folderul `shop-api`, lipsește probabil `crm/`. Folosește builderul cPanel.

## PHP raportează extensii lipsă

```powershell
php shop-api/check-php-extensions.php
php --ini
php -m
```

CLI și web server pot încărca `php.ini` diferite.

## Migrarea refuză să ruleze

Motive intenționate:

- nu este CLI;
- lipsește `--apply`;
- confirmarea bazei nu este exactă;
- variabilele DB lipsesc;
- baza selectată este alta;
- schema/starea nu este compatibilă.

Nu elimina protecțiile. Rulează dry-run și corectează mediul.

## Stripe nu actualizează comanda

1. verifică endpointul `?action=stripeWebhook`;
2. verifică secretul endpointului curent;
3. verifică semnătura/timestampul;
4. confirmă `livemode=false`;
5. verifică metadata Cubis;
6. caută event ID-ul și starea lui;
7. distinge `processing`, `processed` și `failed`;
8. nu procesa din nou un duplicat.

Redirectul de succes nu substituie webhookul.

## SmartBill nu se conectează

```text
[?] credentiale V1 complete?
[?] token V3 prezent?
[?] CIF corect?
[?] cheia seifului >= 32 caractere?
[?] READ_ENABLED activ?
[?] serverul poate iesi HTTPS?
```

Nu muta tokenurile în client pentru diagnostic. Testează server-side și filtrează logul.

## Gestiunile/produsele nu se sincronizează

- conexiunea read-only nu a trecut;
- cache-ul nu a expirat;
- SKU-ul nu există sau este ambiguu;
- produsul nu are asocierea corectă;
- gestiunea a fost arhivată/renumită în SmartBill;
- răspunsul SmartBill este limitat/temporar.

Reîmprospătează referințele și rezolvă asocierea explicit; nu crea o gestiune locală paralelă.

## Factura nu se emite

Verifică:

- `CUBIS_SMARTBILL_ISSUING_ENABLED`;
- datele firmei și CIF-ul;
- clientul și pozițiile;
- asocierea SKU/gestiune;
- statusul comercial permis;
- existența unui document deja emis;
- mesajul SmartBill filtrat.

Emiterea normală trebuie să treacă prin SmartBill. Nu activa fallbackul local pentru a ocoli o configurare lipsă.

## Timeout la emitere

Timeoutul înseamnă „rezultat necunoscut”, nu „document inexistent”. Procedură:

```text
[1] pastreaza cheia idempotenta
[2] cauta documentul dupa referinta comenzii
[3] daca exista, leaga rezultatul
[4] daca nu exista si starea permite, retry cu aceeasi cheie
```

Nu folosi o cheie nouă înainte de reconciliere.

## Cod contabil local apare în audit

Prezența codului nu demonstrează activarea lui. Verifică:

- ruta apelată de `issueInvoice`;
- porțile SmartBill;
- flagurile care blochează scrierile locale;
- logul operației reale;
- identificatorul SmartBill salvat.

În arhitectura activă, emiterea normală trece prin SmartBill, iar scrierile contabile locale sunt blocate implicit.

## Build Electron fără installer

- `npm ci` în `electron-app/`;
- Node 20;
- icon ICO valid;
- antivirus/NSIS;
- `npm run dist:win:ci`;
- logul și `builder-debug.yml` local.

Nu comite `electron-app/release/`.

## Updaterul nu vede versiunea

- versiune nouă mai mare;
- `.exe`, `.blockmap`, `latest.yml` publicate împreună;
- URL fără autentificare/HTML/redirect neașteptat;
- nume și hash coerente;
- downgrade-ul este dezactivat.

## Website-ul redirecționează greșit

Raportul de deployment documentează un redirect de hosting către alt domeniu. Corecția este în configurația hostingului, nu în Shop API. Nu lansa website-ul înainte de rezolvare și validarea conținutului.

## Raport de bug util

Include:

- suprafață și versiune;
- mediu;
- pași exacți;
- rezultat așteptat/actual;
- action + cod HTTP, fără token;
- ID-uri tehnice nesensibile;
- timestamp și fus orar;
- log filtrat;
- poarta SmartBill/Stripe relevantă;
- dacă operația externă poate fi deja executată.

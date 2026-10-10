<div align="center">
  <img src="assets/cubis-shop-logo.png" alt="Cubis Shop" width="300">
  <h1>Wiki Cubis Shop</h1>
  <p><strong>Documentație tehnică și operațională pentru întreaga platformă.</strong></p>
</div>

![Platforma Cubis Shop](assets/cubis-shop-platform-hero.png)

> [!IMPORTANT]
> API-ul și baza izolată Cubis sunt publicate controlat. Stripe este configurat numai în TEST. Website-ul și aplicațiile nu sunt încă publicate/distribuite, iar emiterea SmartBill și comunicările automate rămân oprite până la aprobarea explicită.

## Legendă vizuală

```text
[+] activ / recomandat     [~] configurabil     [!] atentie     [x] inactiv
[>] pas urmator            [#] informatie       [?] diagnostic  [*] automat
```

## Începe de aici

| Obiectiv | Document |
|---|---|
| vreau să înțeleg sistemul | [Arhitectură](Architecture.md) |
| vreau să pornesc proiectul | [Dezvoltare locală](Local-Development.md) |
| vreau să configurez mediul | [Configurare](Configuration.md) |
| lucrez pe mobil, desktop sau website | [Aplicații și suprafețe](Applications-and-Surfaces.md) |
| schimb un endpoint sau model de date | [API și date](API-and-Data.md) |
| schimb o comandă, anulare sau retur | [Comenzi și retururi](Orders-Returns-and-Refunds.md) |
| lucrez cu facturarea/gestiunile | [Integrarea SmartBill](SmartBill-Integration.md) |
| pregătesc un release | [Deployment](Deployment.md) |
| vreau lista testelor | [Testing și quality gates](Testing-and-Quality.md) |
| investighez un incident | [Securitate și operare](Security-and-Operations.md) |
| am o eroare concretă | [Depanare](Troubleshooting.md) |
| pregătesc un commit | [Contribuții](Contributing.md) |

## Platforma în 30 de secunde

```text
                             +----------------------+
                             |      SMARTBILL       |
                             |----------------------|
                             | documente fiscale   |
                             | gestiuni + evidenta |
                             | transmitere fiscala |
                             +----------^-----------+
                                        |
                                  sincronizare
                                        |
 +------------------+      +------------+-------------+      +------------------+
 | WEBSITE PUBLIC   | ---> |      CUBIS SHOP API      | <--- | DESKTOP ADMIN    |
 | catalog/checkout |      |--------------------------|      | Electron         |
 +------------------+      | clienti + comenzi       |      +------------------+
                           | catalog + promotii      |
 +------------------+      | Stripe + notificari    |      +------------------+
 | CLIENT FINAL     |      | integrare SmartBill    | <--- | APLICATIE MOBILA |
 +------------------+      +------------+-------------+      | Expo / RN        |
                                        |                    +------------------+
                                        v
                             +----------------------+
                             | MYSQL CUBIS IZOLAT   |
                             | date operationale    |
                             +----------------------+
```

## Responsabilități

### Cubis Shop

- catalogul și prezentarea produselor;
- conturile de client și checkoutul;
- comenzile și statusurile comerciale;
- plățile Stripe în mediul aprobat;
- promoțiile, livrările, clienții și notificările;
- interfața operatorului pe mobil și desktop;
- sincronizarea controlată cu SmartBill.

### SmartBill

- documentele fiscale și seriile lor;
- gestiunile și evidența contabilă;
- transmiterea fiscală;
- documentele de corecție/retur;
- starea fiscală autoritativă.

Cubis afișează și leagă rezultatele SmartBill de comandă, dar nu creează o autoritate contabilă paralelă.

> [!NOTE]
> Emiterea facturii normale este deja rutată prin SmartBill. Unele implementări locale istorice sunt încă vizibile în auditul surselor, însă scrierile lor sunt blocate implicit; documentația nu le tratează ca funcții active.

## Stare documentată

| Componentă | Stare | Detaliu |
|---|:---:|---|
| Shop API | `[+]` | publicat controlat la `shop-api/api-v2.php` |
| CRM/auth API | `[+]` | publicat la `shop-api/crm/api.php` |
| MySQL Cubis | `[+]` | bază izolată, nume verificat de server |
| Stripe | `[~]` | numai TEST |
| SmartBill read-only | `[~]` | configurabil și separat de emitere |
| SmartBill emitere/e-mail | `[x]` | porți oprite până la aprobare |
| Website | `[x]` | nepublicat, necesită curățare și validare |
| Mobil / Desktop | `[x]` | nedistribuite public |

Sursa stării este [raportul Etapei 3](https://github.com/CAB-IT-EXPERT/cubisshop.ro/blob/main/docs/CUBIS_STAGE3_CPANEL_DEPLOYMENT_REPORT.md). Când se schimbă realitatea operațională, actualizează raportul și apoi acest rezumat.

## Reguli de lucru

1. Citește `AGENTS.md` înainte de schimbări.
2. Nu confunda o capabilitate prezentă în cod cu o integrare activată în producție.
3. Nu pune secrete în Git sau în variabile `EXPO_PUBLIC_*`.
4. SmartBill rămâne autoritatea contabilă/fiscală.
5. Orice acțiune externă are poartă de activare, idempotency și audit.
6. Modificările de contract se verifică în API, mobil, desktop și website, după caz.
7. Documentația se actualizează în același commit cu arhitectura/configurarea.

## Linkuri esențiale

- [README principal](https://github.com/CAB-IT-EXPERT/cubisshop.ro#readme)
- [Shop API](https://github.com/CAB-IT-EXPERT/cubisshop.ro/blob/main/shop-api/README.md)
- [Deployment cPanel](https://github.com/CAB-IT-EXPERT/cubisshop.ro/blob/main/shop-api/DEPLOYMENT_CPANEL.md)
- [Plan de migrare](https://github.com/CAB-IT-EXPERT/cubisshop.ro/blob/main/shop-api/migrations/MIGRATION_PLAN.md)
- [SmartBill etapa 1](https://github.com/CAB-IT-EXPERT/cubisshop.ro/blob/main/docs/SMARTBILL_STAGE1_CONNECTIVITY.md)
- [Actualizări desktop](https://github.com/CAB-IT-EXPERT/cubisshop.ro/blob/main/desktop-update-server/README.md)
- [Licență](https://github.com/CAB-IT-EXPERT/cubisshop.ro/blob/main/LICENSE)

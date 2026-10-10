# Aplicații și suprafețe

[← Configurare](Configuration.md) · [API și date →](API-and-Data.md)

## Matrice funcțională

| Capabilitate | Website | Mobil | Desktop | SmartBill |
|---|:---:|:---:|:---:|:---:|
| catalog și produs | public | admin | admin | asociere SKU |
| cont client și checkout | ✅ | — | — | — |
| dashboard comercial | — | ✅ | ✅ | sursă fiscală externă |
| administrare produse | — | ✅ | ✅ | referințe/gestiuni |
| comenzi și statusuri | tracking | ✅ | ✅ | documente asociate |
| facturi/documente | vizualizare client | vizualizare/acțiuni | vizualizare/acțiuni | **autoritate** |
| livrări și promoții | consumă | configurează | configurează | — |
| utilizatori admin | — | admin | admin | — |
| actualizare aplicație | — | notificator | updater Electron | — |

## Mobil — Expo 57 / React Native 0.86

### Navigare

Suprafața principală are patru zone:

```text
[ ACASA ]   [ COMENZI ]   [ PRODUSE ]   [ MAI MULTE ]
    |            |             |               |
 dashboard   operare      catalog admin   configurari
```

`ShopModuleScreen.tsx` orchestrează managerii. Navigarea la comenzi poate veni și prin deep-linkul `cubisshop://`, tratat de `app/order/[id].tsx`.

### Componente cheie

| Componentă | Rol |
|---|---|
| `ShopOrdersManager` | listă, detaliu, status, retur și legătura cu documentele |
| `ShopProductsManager` | produs, preț, imagini, descriere și legătura SmartBill |
| `ShopCustomersManager` | client, comenzi și acces |
| `ShopInvoicesManager` | afișarea documentelor și stărilor sincronizate |
| `ShopCompanySettingsManager` | identitatea juridică și configurările firmei |
| `ShopAutomationsManager` | porți și reguli aprobate pentru integrări |
| `ShopUsersManager` | conturi, roluri și acces pe platforme |

### Persistență

- tokenul sesiunii folosește `expo-secure-store`;
- preferințele UI nu sunt sursă de adevăr;
- datele critice se recitesc după mutații;
- tokenurile SmartBill nu ajung în aplicație.

## Desktop — Electron 28

```text
+--------------------+       +------------------+       +--------------------+
| PROCES PRINCIPAL   | <---> | PRELOAD CONTROLAT| <---> | RENDERER UI        |
| main.js            |  IPC  | preload.js       |  API  | HTML/CSS/JS        |
+--------------------+       +------------------+       +--------------------+
         |
         +--> dialoguri fisiere / protocol / updater
```

Rendererul este împărțit astfel:

- `api.js` — autentificare și CRM;
- `shop-api.js` — clientul Shop API;
- `shop-catalog.js` — taxonomii și catalog;
- `shop-commerce.js` — comenzi, clienți, documente, configurări și integrarea SmartBill;
- `settings.js`, `shell.js`, `updater.js` — infrastructura interfeței.

Tema vizuală este în `renderer/theme/`, cu tokenuri centralizate și audituri dedicate. Accesul la sistemul de operare se adaugă numai printr-un canal preload restrâns și validat.

## Website public

### Zone

| Zonă | Fișiere reprezentative |
|---|---|
| prezentare | `index.html`, `despre-g-trots.html`, pagini editoriale |
| magazin | `magazin.html`, `produs.html`, `cos.html` |
| checkout | `checkout.html`, rezultat plată |
| cont | `cont.html`, creare/resetare |
| post-comandă | tracking și solicitare retur |
| legal | termeni, confidențialitate, cookie, livrare, plată, garanții, B2B |

Website-ul folosește numai rute publice. Nu conține cheia master, token admin sau credentiale SmartBill.

### Căutare

Căutarea combină normalizare, trigram, BM25, index compact și worker. Indexul local accelerează descoperirea, dar API-ul este autoritatea pentru informația comercială curentă.

### Starea de lansare

Website-ul este încă nepublicat conform ultimului raport și necesită verificarea identității/conținutului. Un preview local reușit nu este aprobare de producție.

## SmartBill în interfețe

Interfețele Cubis afișează:

- starea conexiunii;
- ultima sincronizare;
- gestiunea asociată produsului;
- starea emiterii;
- seria/numărul și ID-ul returnat;
- documentul disponibil;
- eroarea filtrată și acțiunea de reconciliere.

Interfețele nu afișează și nu editează tokenurile. Emiterea și e-mailul au controale separate.

<p align="center">
  <img src="assets/smartbill-icon.png" alt="SmartBill" width="110">
</p>

## Paritate mobil–desktop

O schimbare administrativă completă include:

```text
[1] API + validare
     |
     +--> [2] tipuri/client mobil --> [3] UI mobil
     |
     +--> [4] client desktop -----> [5] UI desktop
     |
     +--> [6] contracte si documentatie
```

Backend-ul impune regula finală. Ascunderea unui buton într-o singură interfață nu este autorizare.

## Versiuni

- Expo: `package.json` și `app.json`;
- Android: `app.json#expo.android.versionCode`;
- Electron: `electron-app/package.json#version`;
- runtime Expo: legat de `appVersion`;
- API: endpoint stabil `api-v2.php`.

Versiunile mobile și desktop au cicluri diferite și nu trebuie forțate să coincidă.

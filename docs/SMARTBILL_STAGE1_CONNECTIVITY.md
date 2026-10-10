# SmartBill etapa 1 — conectare și validare read-only

## Stare de siguranță

- Citirea V1/V3 este permisă numai când `CUBIS_SMARTBILL_READ_ENABLED=true`.
- Gestiunile și seriile sunt reîmprospătate automat la cerere și la pornirea aplicațiilor; intervalul implicit este controlat de `CUBIS_SMARTBILL_AUTO_SYNC_INTERVAL=300`.
- Emiterea fiscală rămâne blocată de `CUBIS_SMARTBILL_ISSUING_ENABLED=false`.
- Trimiterea documentelor pe e-mail rămâne blocată de `CUBIS_SMARTBILL_EMAIL_ENABLED=false`.
- Automatizările Cubis, SPV și mecanismele locale de gestiune nu sunt activate de această etapă.
- SmartBill rămâne autoritatea pentru gestiuni și stoc contabil; Cubis păstrează numai cache și asocierea SKU–gestiune.

## Credențiale

Aplicațiile mobile și desktop nu afișează și nu trimit formulare de conectare SmartBill. Configurarea credențialelor este o operație server-side controlată; configuratorul din aplicații păstrează numai regulile de facturare și starea sincronizării.

API-ul validează valorile primite prin fluxul administrativ server-side, apoi le salvează ca payload AES-256-GCM în `shop_smartbill_credentials`. Cheia de criptare `CUBIS_SMARTBILL_CREDENTIAL_KEY` rămâne exclusiv în configurația serverului. Niciun endpoint nu returnează tokenurile.

Schimbarea credențialelor:

1. oprește comutatorul de emitere;
2. invalidează testele V1/V3 și sincronizarea anterioară;
3. golește numai cache-urile și referințele SmartBill locale;
4. nu modifică produse, comenzi, facturi sau stocuri externe.

## Operații read-only implementate

| Sursă | Operație | Utilizare Cubis |
| --- | --- | --- |
| V1 `/series` | listare serii și `nextNumber` | numerotarea rămâne exclusiv SmartBill |
| V1 `/stocks` | stoc după SKU și gestiune | verificare/cache, fără ajustare locală |
| V3 `/warehouses` | listare gestiuni | asociere individuală pe produs |
| V3 `/products` | căutare exactă după `code` | asociere SKU exclusiv în fișa produsului; nu există nomenclator global în aplicații |
| V3 `/goods-receipts` GET | capabilitate documentată | nu este folosită automat în etapa 1 |

## Concluzii din documentația oficială

- O factură V1 cu `useStock=true` cere `warehouseName` pe fiecare poziție. Prin urmare, payloadul poate indica gestiuni diferite pentru poziții diferite; verificarea prin emitere reală este intenționat amânată.
- `/series` furnizează `nextNumber`. Cubis îl recitește la sincronizare și nu îl incrementează local. O factură emisă manual în SmartBill trebuie observată la următoarea sincronizare prin schimbarea `nextNumber`.
- `/invoice/reverse` primește identificarea facturii, nu poziții sau cantități. Automatizarea este tratată numai ca stornare integrală și rămâne blocată. Retururile parțiale cer intervenție în SmartBill.
- SmartBill permite stornări integrale, parțiale și multiple în interfața Cloud, însă această capabilitate a interfeței nu extinde automat contractul endpointului `/invoice/reverse`.
- V3 poate crea momentan un NIR numai ca `draft`; Cubis nu folosește această operație pentru retur și nu generează NIR propriu.

Surse oficiale:

- <https://api.smartbill.ro/>
- <https://api.smartbill.ro/smartbill-api-spec.yaml>
- <https://ajutor.smartbill.ro/article/196-integrare-api>
- <https://ajutor.smartbill.ro/article/59-stornare-factura>

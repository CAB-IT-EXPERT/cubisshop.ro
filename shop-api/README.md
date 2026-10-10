# Cubis Shop API

API comun pentru aplicația mobilă, aplicația Electron și website. Gestionează
produsele, până la 12 imagini/produs, sursele produselor, comenzile, stocurile,
livrările, metodele de plată, categoriile ierarhice, compatibilitățile de brand și
producătorii în baza izolată `cabitro_cubisshop.ro`.

Reducerea unui produs se păstrează prin `discount_type` (`percent` sau `fixed`)
și `discount_value`; API-ul calculează și validează automat `sale_price`.

Categoriile pot avea un părinte la orice nivel. API-ul previne selectarea propriei
categorii sau crearea buclelor între categorie și subcategorii.

API-ul nu reutilizează configurații din alte proiecte. Conexiunea MySQL provine
exclusiv din variabilele `CUBIS_DB_*`, iar numele acceptat este exact
`cabitro_cubisshop.ro`. Fără toate valorile necesare, conexiunea este refuzată.
API-ul verifică și rezultatul `SELECT DATABASE()` înainte de utilizare.

Schema nu este creată sau actualizată de requesturile HTTP. `migrate.php` este
dry-run implicit, CLI-only și cere confirmarea explicită a bazei. Nu îl rulați
înaintea revizuirii planului din `migrations/MIGRATION_PLAN.md`.

Endpoint stabil: `https://cubisshop.ro/shop-api/api-v2.php`. Fișierul `api-v2.php`
încarcă aceeași implementare din `api.php`, astfel încât website-ul și ambele
aplicații nu pot ajunge accidental pe versiuni diferite ale API-ului.

Filtrele magazinului public folosesc ruta read-only
`?action=publicCatalogFilters`. Aceasta returnează doar categoriile,
compatibilitățile și producătorii activi și nu expune cheia administrativă.

## Rute publice

- `publicProducts` — produsele active ale surselor active;
- `publicProduct&id=<id-sau-slug>` — pagina completă a produsului;
- `publicShopConfig` — livrările și metodele de plată active;
- `createPublicOrder` — creează comanda și rezervă automat stocul urmărit.
- `stripeCheckoutStatus` — confirmă plata direct la Stripe și întoarce bonul;
- `stripeWebhook` — procesează idempotent confirmările și expirările Stripe.
- `publicTrackOrder` — urmărește o comandă prin tokenul privat din e-mail sau,
  manual, prin codul comenzii împreună cu adresa de e-mail.

## Administrare

Rutele administrative cer tokenul utilizatorului autentificat. Loginul este
`adminLogin`, sesiunea se verifică prin `adminMe`, iar ieșirea prin `adminLogout`.
`CUBIS_API_KEY` rămâne exclusiv server-side pentru health/operațiuni controlate;
nu se include în JavaScript sau în aplicațiile mobile.
Sunt disponibile operații CRUD pentru produse și surse, gestiunea comenzilor,
ajustări și istoric de stoc, metode de plată și livrări.

Ruta protejată `applyFeaturedProducts` primește un array ordonat de SKU-uri,
înlocuiește atomic selecția produselor recomandate și salvează rangul comercial.
Magazinul păstrează prioritatea de stoc, iar în interiorul fiecărui nivel afișează
produsele recomandate în ordinea primită.

Comenzile păstrează un istoric separat al statusurilor. Rambursul pornește în
`processing` și trimite automat mesajul de primire; plata Stripe confirmată trece
idempotent în `confirmed` și trimite bonul o singură dată. La schimbarea manuală
a statusului, aplicațiile pot solicita opțional notificarea clientului. Mesajele
HTML sunt trimise prin SMTP de la adresa configurată local, iar parola SMTP nu se
salvează niciodată în Git.

Catalogul CRM este sursa unică de adevăr. Stripe nu are un catalog administrat
separat: fiecare produs local păstrează ID-ul copiei tehnice Stripe. La salvare
se sincronizează numele, descrierea, pagina publică, imaginea principală,
vizibilitatea și prețul. La modificarea prețului se creează automat un preț
Stripe nou și cel vechi este arhivat; la ștergere, copia Stripe este arhivată
înainte de eliminarea produsului și a fișierelor locale. Ruta administrativă
`syncStripeCatalog` repară sau reface legăturile pentru întreg catalogul.

Webhookul Stripe TEST se configurează manual în Stripe Dashboard la
`https://cubisshop.ro/shop-api/api-v2.php?action=stripeWebhook`. Secretul rezultat
se salvează în configurația server-side ca `CUBIS_STRIPE_WEBHOOK_SECRET`;
utilitarul opțional de înregistrare nu este inclus în pachetul cPanel.

Dezactivarea unei surse ascunde imediat toate produsele sale din rutele publice,
fără să le șteargă din CRM. Ștergerea definitivă a unui produs elimină imaginile
încărcate de pe disc și păstrează în comenzile istorice datele comerciale salvate.

Sincronizările automate de furnizor sunt dezactivate în etapa de izolare. Codul
fiscal și gestiunea stocului rămân păstrate, dar nicio citire publică nu pornește
automat o actualizare externă.

Fișierul `.user.ini` permite cereri suficient de mari pentru încărcarea simultană
a celor 12 imagini, respectând limita de 6 MB pentru fiecare imagine impusă de API.

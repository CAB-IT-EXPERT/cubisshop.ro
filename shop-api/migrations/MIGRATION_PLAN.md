# Plan de migrare Cubis Shop

Ținta unică este `cabitro_cubisshop.ro`. Migrarea nu se execută prin request HTTP
și nu importă produse, clienți, comenzi, facturi sau date de service G-Trots.

Ordinea pentru o bază Cubis goală este:

1. `20261009_cubis_crm_auth_service_schema.sql` — autentificare, administrare,
   CRM și structura modulului de service, fără rânduri operaționale.
2. `migrate.php` — aplică structura finală `shop_*`, inclusiv catalog, comenzi,
   clienți, checkout, Stripe events, facturare, NIR/FIFO și SPV inactiv.
3. Se înscriu versiunile `20261009_cubis_runtime_schema_v1` și `2026100901`.
4. `create-initial-admin.php` creează separat primul administrator, numai după
   configurarea variabilelor temporare dedicate.

Fișierele SQL istorice din acest director rămân documentația evoluției schemei.
Pentru o bază nouă nu se rulează individual după bootstrapul final, deoarece
structura lor este deja inclusă în schema consolidată aplicată de `migrate.php`.

Utilitarele sunt dry-run implicit și necesită simultan `--apply` și
`--confirm=cabitro_cubisshop.ro`. Nu se rulează înaintea revizuirii schemei.


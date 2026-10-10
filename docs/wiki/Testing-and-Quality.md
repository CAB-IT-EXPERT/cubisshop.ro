# Testing și quality gates

[← Deployment](Deployment.md) · [Securitate →](Security-and-Operations.md)

## Modelul de verificare

```text
[STATIC] --> [CONTRACT] --> [DOMAIN] --> [INTEGRATION] --> [MANUAL]
 types       UI <-> API     comenzi      Stripe/SmartBill  flux complet
```

Separă mereu:

```text
[PASS]    verificat cu succes
[FAIL]    regresie reala
[BLOCK]   lipsa runtime/configuratie
[SKIP]    neaplicabil, cu motiv explicit
```

## Gate TypeScript/Expo

```powershell
npm run typecheck
npm run lint
npm run audit:theme
npm run audit:design
```

Pentru export web:

```powershell
npm run build:web
```

Verificarea manuală mobilă include tastatura, safe area, modaluri, scroll, loading, erori și deep links.

## Website

```powershell
node scripts/test-public-theme.cjs
node website/tests/google_integrations_disabled_contract_test.cjs
node scripts/verify-guide-search-schema.mjs
```

În funcție de schimbare:

```powershell
python scripts/audit-search-readiness.py
python scripts/verify-public-theme-release.py
python scripts/verify-order-email-release.py
```

Verifică manual viewporturi mobile/desktop, navigarea din tastatură, checkoutul, trackingul, returul, CMP și paginile legale.

## PHP

Runtime:

```powershell
php shop-api/check-php-extensions.php
```

Lint:

```powershell
git ls-files "*.php" | ForEach-Object { php -l $_ }
```

Test individual:

```powershell
php shop-api/tests/order_status_transition_test.php
```

Unele teste necesită `pdo_sqlite`, `mbstring`, `gd`, `zip` sau fixture-uri. Un test blocat de runtime nu este un test trecut.

## Contracte pe domenii active

### Catalog

- `product_pricing_test.php`;
- `product_search_test.php`;
- `product_page_service_test.php`;
- contractele de deduplicare, taburi și garanție.

### Stripe și checkout

- `stripe_webhook_signature_test.php`;
- `stripe_failed_checkout_stock_contract_test.php` — regresie de checkout, chiar dacă evidența contabilă este externă;
- `checkout_payment_label_contract_test.php`;
- contractele de livrare gratuită.

### Comenzi și retur

- `order_status_transition_test.php`;
- `order_cancellation_test.php`;
- `order_return_request_test.php`;
- `order_return_confirmation_test.php`;
- `partial_return_email_test.php`;
- contractele de identitate și editare.

### SmartBill

- `smartbill_service_contract_test.php`;
- `smartbill_inventory_authority_contract_test.php`;
- `smartbill_navigation_cleanup_contract_test.php`;
- testele de emitere normală prin SmartBill;
- timeout, reconciliere și retry fără duplicare.

> [!IMPORTANT]
> Testele pentru cod local inactiv verifică existența/regresia acelui cod, nu demonstrează că funcția este activă. Raportul de test trebuie să precizeze ruta operațională reală și porțile de configurare.

## Desktop

```powershell
node --test electron-app/tests/*.test.js
node electron-app/scripts/qa-shop-ui.cjs
node electron-app/scripts/qa-shop-commerce.cjs
node electron-app/scripts/qa-updater-sidebar.cjs
```

Alege scripturile QA potrivite schimbării. Verifică și protocolul, salvarea fișierelor, updaterul și restaurarea ferestrei.

## Matrice schimbare → test

| Schimbare | Verificare minimă suplimentară |
|---|---|
| tip/client mobil | typecheck + contract API + smoke mobil |
| UI desktop | node tests + QA relevant + smoke Electron |
| catalog public | contracte catalog + preview + search/SEO |
| Stripe | semnătură + idempotency + succes/eșec/expirare |
| status comandă | tranziții + e-mail + mobil + desktop |
| retur | eligibilitate + parțial + SmartBill + rambursare |
| SmartBill | auth + read-only + emitere + reconciliere + secret scan |
| deployment | build pachet + scanare + smoke server |

## Verificarea integrării SmartBill

```text
[1] Emiterea normala ajunge in SmartBill?
[2] Este salvata legatura cu documentul returnat?
[3] Timeoutul verifica existenta inainte de retry?
[4] Emiterea dezactivata este refuzata clar?
[5] Niciun token nu ajunge in raspuns/log/UI?
[6] Codul local inactiv ramane blocat implicit?
```

## Review final

- [ ] `git diff --check` trece;
- [ ] nu există secrete/configurații locale;
- [ ] linkurile Markdown există;
- [ ] Mermaid se randază pe GitHub;
- [ ] testele relevante au trecut sau blocajele sunt explicate;
- [ ] documentația separă codul prezent de funcția activă;
- [ ] SmartBill este păstrat ca autoritate;
- [ ] buildurile/cache-urile nu sunt comise;
- [ ] diff-ul a fost citit integral.

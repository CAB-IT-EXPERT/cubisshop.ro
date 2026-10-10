<?php
declare(strict_types=1);

function isolationAssert(bool $condition, string $message): void
{
    if (!$condition) throw new RuntimeException($message);
}

$root = dirname(__DIR__, 2);
$shop = $root . '/shop-api';
$website = $root . '/website';
$read = static fn(string $path): string => (string)file_get_contents($path);

$config = require $shop . '/config.example.php';
isolationAssert(($config['project_id'] ?? '') === 'cubisshop', 'Project ID must identify Cubis Shop.');
isolationAssert(($config['db_name'] ?? '') === '', 'Database configuration must fail closed when CUBIS_DB_NAME is missing.');
isolationAssert(($config['auth_db_name'] ?? '') === '', 'Authentication must fail closed when CUBIS_DB_NAME is missing.');
foreach (['automations_enabled', 'supplier_sync_enabled', 'indexnow_enabled', 'email_enabled', 'admin_email_enabled', 'spv_enabled'] as $flag) {
    isolationAssert(($config[$flag] ?? null) === false, "{$flag} must be disabled by default.");
}
isolationAssert(($config['stripe_secret_key'] ?? '') === '', 'No Stripe secret may be committed.');
isolationAssert(($config['stripe_publishable_key'] ?? '') === '', 'No Stripe publishable key may be committed.');
isolationAssert(($config['stripe_webhook_secret'] ?? '') === '', 'No Stripe webhook secret may be committed.');
$configSource = $read($shop . '/config.example.php');
foreach (['CUBIS_STRIPE_SECRET_KEY', 'CUBIS_STRIPE_PUBLISHABLE_KEY', 'CUBIS_STRIPE_WEBHOOK_SECRET'] as $stripeEnvironmentName) {
    isolationAssert(str_contains($configSource, $stripeEnvironmentName), "Stripe environment variable is not namespaced for Cubis: {$stripeEnvironmentName}");
}
isolationAssert(!preg_match("/\$env\('STRIPE_(?:SECRET_KEY|PUBLISHABLE_KEY|WEBHOOK_SECRET)'\)/", $configSource), 'Generic Stripe variables could reuse another project account.');
foreach (['google_client_id', 'google_analytics_measurement_id', 'google_customer_reviews_merchant_id', 'google_search_console_verification'] as $key) {
    isolationAssert(($config[$key] ?? '') === '', "{$key} must be blank until Cubis configuration exists.");
}

foreach (['merchant.php', 'shopify.php', 'meta.php', 'register-stripe-payment-domain.php'] as $removed) {
    isolationAssert(!is_file($shop . '/' . $removed), "Removed integration file still exists: {$removed}");
}
foreach (['google-measurement.js', 'meta-measurement.js'] as $removed) {
    isolationAssert(!is_file($website . '/' . $removed), "Removed tracking file still exists: {$removed}");
}

$api = $read($shop . '/api.php');
foreach (['merchant.php', 'shopify.php', 'meta.php', 'syncMerchantCatalog', 'syncShopifyCatalog', 'metaConversion', 'metaCatalogFeed'] as $needle) {
    isolationAssert(!str_contains($api, $needle), "SHOP API still references removed integration: {$needle}");
}
isolationAssert(str_contains($api, "cabitro_cubisshop.ro"), 'SHOP API database guard is missing.');
isolationAssert(str_contains($api, "^cs_test_"), 'Checkout status must accept Stripe TEST sessions only.');
isolationAssert(str_contains($api, "['cubisshop.ro', 'www.cubisshop.ro', 'localhost', '127.0.0.1', '::1']"), 'SHOP API endpoint allowlist is missing.');

$gomag = $read($shop . '/gomag.php');
isolationAssert(str_contains($gomag, "empty(\$config['supplier_sync_enabled'])"), 'Supplier network calls are not protected by a fail-closed master gate.');
$productPages = $read($shop . '/product-page-service.php');
isolationAssert(str_contains($productPages, "empty(\$config['indexnow_enabled'])"), 'IndexNow automation is not disabled by default.');
isolationAssert(!str_contains($productPages, 'e9da45c430d2234931472c94c3523db1'), 'Copied IndexNow key remains in the Cubis source.');

$stripe = $read($shop . '/stripe.php');
isolationAssert(str_contains($stripe, "str_starts_with(\$key, 'sk_test_')"), 'Stripe configuration is not TEST-only.');
isolationAssert(str_contains($stripe, 'cubisshop_project'), 'Stripe objects must carry Cubis ownership metadata.');
isolationAssert(!str_contains($stripe, 'g_trots_') && !str_contains($stripe, 'gtrots-'), 'Legacy Stripe metadata/idempotency keys remain.');
isolationAssert(str_contains($stripe, "(\$event['livemode'] ?? null) !== false"), 'Stripe webhook must reject live-mode events.');
isolationAssert(str_contains($stripe, "^cs_test_"), 'Stripe webhook/session application must reject live checkout sessions.');

$trackingFiles = [
    'legal-footer.js', 'cookie-consent.js', 'checkout-status.js', 'checkout.js',
    'promotions.js', 'contact.js', 'cont.js', 'script.js',
];
$tracking = implode("\n", array_map(static fn(string $file): string => $read($website . '/' . $file), $trackingFiles));
foreach (['GTrotsGoogle', 'GTrotsMeta', 'window.gtag', 'fbq(', 'googletagmanager.com', 'apis.google.com/js/platform.js'] as $needle) {
    isolationAssert(!str_contains($tracking, $needle), "Browser tracking remains active: {$needle}");
}
$google = $read($website . '/google-integrations.js');
isolationAssert(str_contains($google, 'consentGranted !== true'), 'Reusable Google Analytics code must require explicit consent.');
isolationAssert(!str_contains($tracking, 'google-integrations.js'), 'Reusable Google integrations must not be loaded while Cubis IDs are blank.');

$htaccess = $read($website . '/.htaccess');
isolationAssert(!str_contains($htaccess, 'g-trots.ro'), 'Website redirects still target the original G-Trots domain.');
isolationAssert(str_contains($htaccess, 'https://cubisshop.ro/'), 'Website canonical redirects do not target Cubis Shop.');

$mobileApi = $read($root . '/services/api.ts');
$desktopApi = $read($root . '/electron-app/renderer/js/api.js');
foreach ([$mobileApi, $desktopApi] as $runtimeApi) {
    isolationAssert(str_contains($runtimeApi, 'https://cubisshop.ro/shop-api/crm/api.php'), 'Application authentication is not pinned to the Cubis API.');
    isolationAssert(!str_contains($runtimeApi, 'g-trots.ro') && !str_contains($runtimeApi, 'gtrots.systemApiConfig'), 'Application can still reuse G-Trots API settings.');
    isolationAssert(!str_contains($runtimeApi, 'X-API-Key'), 'Application must authenticate with user sessions, never a master API key.');
}
$mobileShopApi = $read($root . '/services/shopApi.ts');
$desktopShopApi = $read($root . '/electron-app/renderer/js/shop-api.js');
foreach ([$mobileShopApi, $desktopShopApi] as $runtimeShopApi) {
    isolationAssert(str_contains($runtimeShopApi, 'https://cubisshop.ro/shop-api'), 'Commercial API is not pinned to Cubis Shop.');
    isolationAssert(!str_contains($runtimeShopApi, 'X-API-Key'), 'Commercial clients must not include the master API key.');
}

isolationAssert(
    str_contains($api, "'saveBoomagSeoProduct', 'syncBoomagTaxonomy'"),
    'A legacy supplier write action is not covered by the isolation gate.'
);

isolationAssert(count(glob($website . '/*.html') ?: []) < 100, 'Copied diagnostic HTML pages remain in the website root.');
isolationAssert(count(glob($website . '/magazin/produs/*', GLOB_ONLYDIR) ?: []) === 0, 'Copied generated product pages remain.');
isolationAssert(!is_file($website . '/search/data/diagnostic-docs.json'), 'Copied diagnostic dataset remains.');
foreach (['ai-catalog.json', 'catalog-produse.html', 'openai-products.jsonl', 'openai-products.jsonl.gz'] as $removed) {
    isolationAssert(!is_file($website . '/' . $removed), "Copied generated product artifact remains: {$removed}");
}

$resetLink = $read($shop . '/reset-link-status.php');
isolationAssert(str_contains($resetLink, "\$name !== 'cabitro_cubisshop.ro'"), 'Password reset endpoint lacks the exact Cubis database guard.');
isolationAssert(!str_contains($resetLink, 'trotty-api'), 'Password reset endpoint still imports another project configuration.');

$server = $read($root . '/server/api.php');
isolationAssert(str_contains($server, "const CUBIS_DATABASE_NAME = 'cabitro_cubisshop.ro'"), 'CRM API exact database guard is missing.');
isolationAssert(str_contains($server, 'if ($name !== CUBIS_DATABASE_NAME)'), 'CRM API must reject every other database name.');
isolationAssert(!str_contains($server, "'db_pass' => DB_PASS"), 'CRM API must never return the database password.');
foreach (['getServiceSheets', 'createServiceSheet', 'updateServiceSheet', 'WHATSAPP_ACCESS_TOKEN', 'EXTERNAL_AUTOMATIONS_ENABLED'] as $removedServerFeature) {
    isolationAssert(!str_contains($server, $removedServerFeature), "Removed CRM feature remains active: {$removedServerFeature}");
}

$nirService = $read($shop . '/nir-service.php');
foreach (['49972605', 'J2024008303400', 'CAB IT EXPERT'] as $legacyCompanyValue) {
    isolationAssert(!str_contains($nirService, $legacyCompanyValue), "NIR still contains a G-Trots company fallback: {$legacyCompanyValue}");
}
isolationAssert(str_contains($nirService, 'Completează denumirea juridică și CUI-ul firmei Cubis Shop'), 'NIR export must refuse missing Cubis company identity.');
isolationAssert(str_contains($api, "invoice_series VARCHAR(20) NOT NULL DEFAULT 'CS'"), 'New Cubis databases do not use an isolated invoice prefix.');

isolationAssert(!is_dir($root . '/output'), 'Copied generated backups remain in the Cubis workspace.');

echo "Cubis isolation contract passed.\n";

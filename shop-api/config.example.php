<?php
declare(strict_types=1);

// Safe-by-default Cubis Shop configuration. Copy to config.local.php only if
// the hosting cannot inject environment variables. Never commit real values.
$env = static fn(string $name, string $default = ''): string => (($value = getenv($name)) !== false ? trim((string)$value) : $default);
$flag = static function (string $name, bool $default = false): bool {
    $value = getenv($name);
    if ($value === false || trim((string)$value) === '') return $default;
    return in_array(strtolower(trim((string)$value)), ['1', 'true', 'yes', 'on'], true);
};

$cubisDbName = $env('CUBIS_DB_NAME');

return [
    'project_id' => 'cubisshop',
    'api_key' => $env('CUBIS_API_KEY'),
    'db_host' => $env('CUBIS_DB_HOST'),
    'db_port' => (int)$env('CUBIS_DB_PORT', '3306'),
    'db_name' => $cubisDbName,
    'db_user' => $env('CUBIS_DB_USER'),
    'db_pass' => $env('CUBIS_DB_PASS'),
    // Autentificarea folosește obligatoriu aceeași bază; nu există un al doilea
    // nume configurabil care ar putea devia accidental către proiectul sursă.
    'auth_db_name' => $cubisDbName,
    'public_base_url' => $env('CUBIS_PUBLIC_API_URL', 'https://cubisshop.ro/shop-api'),
    'website_base_url' => $env('CUBIS_WEBSITE_URL', 'https://cubisshop.ro'),
    'invoice_storage_dir' => $env('CUBIS_INVOICE_STORAGE_DIR', __DIR__ . '/uploads/invoices'),
    'invoice_public_base_url' => $env('CUBIS_INVOICE_PUBLIC_BASE_URL', 'https://cubisshop.ro/shop-api/uploads/invoices'),
    'shipping_note_storage_dir' => $env('CUBIS_SHIPPING_NOTE_STORAGE_DIR', __DIR__ . '/uploads/shipping-notes'),
    'shipping_note_public_base_url' => $env('CUBIS_SHIPPING_NOTE_PUBLIC_BASE_URL', 'https://cubisshop.ro/shop-api/uploads/shipping-notes'),

    // All background/external operations remain off during isolation.
    'automations_enabled' => $flag('CUBIS_AUTOMATIONS_ENABLED', false),
    'website_generation_enabled' => $flag('CUBIS_WEBSITE_GENERATION_ENABLED', false),
    'supplier_sync_enabled' => false,
    'indexnow_enabled' => false,
    'indexnow_key' => $env('CUBIS_INDEXNOW_KEY'),
    'email_enabled' => $flag('CUBIS_EMAIL_ENABLED', false),
    'admin_email_enabled' => $flag('CUBIS_ADMIN_EMAIL_ENABLED', false),
    'spv_enabled' => $flag('CUBIS_SPV_ENABLED', false),

    // Stripe is deliberately TEST-only. Live keys are rejected in code.
    'stripe_secret_key' => $env('CUBIS_STRIPE_SECRET_KEY'),
    'stripe_publishable_key' => $env('CUBIS_STRIPE_PUBLISHABLE_KEY'),
    'stripe_webhook_secret' => $env('CUBIS_STRIPE_WEBHOOK_SECRET'),

    // SmartBill credentials stay server-side. Catalog/stock reads can be
    // enabled independently; real document issuing is off by default.
    'smartbill_v1_email' => $env('CUBIS_SMARTBILL_V1_EMAIL'),
    'smartbill_v1_token' => $env('CUBIS_SMARTBILL_V1_TOKEN'),
    'smartbill_v3_token' => $env('CUBIS_SMARTBILL_V3_TOKEN'),
    'smartbill_cif' => $env('CUBIS_SMARTBILL_CIF'),
    // Master key used only to encrypt credentials entered from administration.
    // Generate a unique high-entropy value (minimum 32 characters) per server.
    'smartbill_credential_key' => $env('CUBIS_SMARTBILL_CREDENTIAL_KEY'),
    'smartbill_read_enabled' => $flag('CUBIS_SMARTBILL_READ_ENABLED', false),
    'smartbill_auto_sync_interval' => (int)$env('CUBIS_SMARTBILL_AUTO_SYNC_INTERVAL', '300'),
    'smartbill_issuing_enabled' => $flag('CUBIS_SMARTBILL_ISSUING_ENABLED', false),
    'smartbill_email_enabled' => $flag('CUBIS_SMARTBILL_EMAIL_ENABLED', false),
    // Cubis keeps only technical cache/reservations. SmartBill is the sole
    // source of truth for accounting stock, warehouses, NIR and FIFO.
    'smartbill_inventory_authority' => $flag('CUBIS_SMARTBILL_INVENTORY_AUTHORITY', true),

    // Google Identity is separate from analytics and remains disabled until a
    // Cubis-specific OAuth client is supplied.
    'google_client_id' => $env('CUBIS_GOOGLE_CLIENT_ID'),

    // Google services are independent integrations. The reusable code is
    // retained, but every service remains inert while these Cubis IDs are blank.
    'google_analytics_measurement_id' => $env('CUBIS_GOOGLE_ANALYTICS_MEASUREMENT_ID'),
    'google_customer_reviews_merchant_id' => $env('CUBIS_GOOGLE_CUSTOMER_REVIEWS_MERCHANT_ID'),
    'google_search_console_verification' => $env('CUBIS_GOOGLE_SEARCH_CONSOLE_VERIFICATION'),

    // Transactional e-mail is disabled until Cubis SMTP is configured.
    'order_email_from' => $env('CUBIS_ORDER_EMAIL_FROM'),
    'order_email_from_name' => $env('CUBIS_ORDER_EMAIL_FROM_NAME', 'Cubis Shop'),
    'order_email_reply_to' => $env('CUBIS_ORDER_EMAIL_REPLY_TO'),
    'order_email_logo_url' => $env('CUBIS_ORDER_EMAIL_LOGO_URL', 'https://cubisshop.ro/assets/logo.png'),
    'smtp_host' => $env('CUBIS_SMTP_HOST'),
    'smtp_port' => (int)$env('CUBIS_SMTP_PORT', '465'),
    'smtp_encryption' => $env('CUBIS_SMTP_ENCRYPTION', 'ssl'),
    'smtp_username' => $env('CUBIS_SMTP_USERNAME'),
    'smtp_password' => $env('CUBIS_SMTP_PASSWORD'),
    'admin_order_notification_recipient' => $env('CUBIS_ADMIN_ORDER_RECIPIENT'),
    'admin_order_email_from' => $env('CUBIS_ADMIN_EMAIL_FROM'),
    'admin_order_email_from_name' => $env('CUBIS_ADMIN_EMAIL_FROM_NAME', 'Cubis Shop · Comenzi'),
    'admin_order_email_reply_to' => $env('CUBIS_ADMIN_EMAIL_REPLY_TO'),
    'admin_order_smtp_host' => $env('CUBIS_ADMIN_SMTP_HOST'),
    'admin_order_smtp_port' => (int)$env('CUBIS_ADMIN_SMTP_PORT', '465'),
    'admin_order_smtp_encryption' => $env('CUBIS_ADMIN_SMTP_ENCRYPTION', 'ssl'),
    'admin_order_smtp_username' => $env('CUBIS_ADMIN_SMTP_USERNAME'),
    'admin_order_smtp_password' => $env('CUBIS_ADMIN_SMTP_PASSWORD'),

    // ANAF/SPV remains implemented but disabled. Preserve the fiscal workflow;
    // enable only after Cubis credentials and the new database are ready.
    'anaf_oauth_client_id' => $env('CUBIS_ANAF_CLIENT_ID'),
    'anaf_oauth_client_secret' => $env('CUBIS_ANAF_CLIENT_SECRET'),
    'spv_encryption_key' => $env('CUBIS_SPV_ENCRYPTION_KEY'),
    'anaf_oauth_callback_url' => $env('CUBIS_ANAF_CALLBACK_URL', 'https://cubisshop.ro/shop-api/anaf-oauth-callback.php'),
    'spv_cron_key' => $env('CUBIS_SPV_CRON_KEY'),
    'anaf_oauth_authorize_url' => 'https://logincert.anaf.ro/anaf-oauth2/v1/authorize',
    'anaf_oauth_token_url' => 'https://logincert.anaf.ro/anaf-oauth2/v1/token',
    'anaf_oauth_revoke_url' => 'https://logincert.anaf.ro/anaf-oauth2/v1/revoke',
    'anaf_oauth_test_url' => 'https://api.anaf.ro/TestOauth/jaxrs/hello?name=CubisShop',
    'anaf_efactura_test_url' => 'https://api.anaf.ro/test/FCTEL/rest',
    'anaf_efactura_production_url' => 'https://api.anaf.ro/prod/FCTEL/rest',
    'anaf_invoice_validation_url' => 'https://webservicesp.anaf.ro/prod/FCTEL/rest/validare/FACT1',
    'anaf_credit_note_validation_url' => 'https://webservicesp.anaf.ro/prod/FCTEL/rest/validare/FCN',
];

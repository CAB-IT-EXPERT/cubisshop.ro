<?php
declare(strict_types=1);

function stage2Assert(bool $condition, string $message): void {
    if (!$condition) throw new RuntimeException($message);
}

$root = dirname(__DIR__, 2);
$api = (string)file_get_contents($root . '/shop-api/api.php');
$config = (string)file_get_contents($root . '/shop-api/config.example.php');
$server = (string)file_get_contents($root . '/server/api.php');
$htaccess = (string)file_get_contents($root . '/shop-api/.htaccess');
$migration = (string)file_get_contents($root . '/shop-api/migrate.php');
$migrationService = (string)file_get_contents($root . '/shop-api/migration-service.php');
$stripe = (string)file_get_contents($root . '/shop-api/stripe.php');

stage2Assert((bool)preg_match('/const CUBIS_SHOP_SCHEMA_VERSION = [0-9]{10};/', $api), 'Versiunea schemei SHOP lipsește.');
stage2Assert(!str_contains($api, "ensureShopSchema(\$db);"), 'Requestul HTTP nu trebuie să execute migrarea SHOP.');
stage2Assert(str_contains($api, "getenv('CUBIS_DB_NAME')"), 'SHOP nu citește CUBIS_DB_NAME.');
stage2Assert(str_contains($api, "SELECT DATABASE()"), 'SHOP nu verifică baza selectată de server.');
stage2Assert(str_contains($server, 'Migrarea automată prin request HTTP este dezactivată'), 'CRM poate rula încă DDL automat.');
stage2Assert(!str_contains($server, "'api_key' => API_KEY"), 'CRM expune cheia master în răspuns.');
stage2Assert(str_contains($api, "\$action === 'adminLogin'"), 'Loginul administrativ SHOP lipsește.');
stage2Assert(str_contains($api, 'shop_admin_login_attempts'), 'Protecția anti brute-force lipsește.');
stage2Assert(!str_contains($api, 'Access-Control-Allow-Origin: *'), 'CORS wildcard este interzis pentru autentificarea administrativă.');
foreach (['listUsers', 'createUser', 'updateUser', 'deleteUser'] as $userAction) {
    stage2Assert(str_contains($api, "\$action === '{$userAction}'"), "Ruta {$userAction} lipsește din pachetul API.");
}
stage2Assert(str_contains($api, "\$action === 'stripeWebhook'"), 'Endpointul Stripe webhook lipsește.');
stage2Assert(str_contains($stripe, 'INSERT IGNORE INTO shop_stripe_events'), 'Webhookul Stripe nu revendică atomic evenimentele.');
stage2Assert(str_contains($stripe, "['processing', 'processed']"), 'Webhookul Stripe nu oprește duplicatele concurente.');
stage2Assert(str_contains($htaccess, 'migrate\\.php'), 'Utilitarul de migrare nu este blocat în Apache.');
stage2Assert(str_contains($migration, '--confirm=cabitro_cubisshop.ro'), 'Migrarea nu cere confirmarea bazei.');
stage2Assert(str_contains($migration, 'cubisApplyStructuralMigration'), 'CLI-ul nu folosește serviciul comun de migrare.');
stage2Assert(str_contains($migrationService, 'operationalTables'), 'Migrarea nu blochează o bază cu date operaționale.');

echo "Stage 2 deployment contract test passed.\n";


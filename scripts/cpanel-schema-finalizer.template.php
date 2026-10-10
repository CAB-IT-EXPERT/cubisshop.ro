<?php
declare(strict_types=1);

// Temporary, single-use schema metadata finalizer for cPanel hosting without SSH.
// Generated copies must use a random filename and be deleted immediately after use.

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

function fail(string $message, int $status): never {
    http_response_code($status);
    echo json_encode(['success' => false, 'error' => $message], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

$https = strtolower((string)($_SERVER['HTTPS'] ?? '')) === 'on'
    || (string)($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https';
if (!$https) fail('HTTPS este obligatoriu.', 403);
if (strtolower((string)($_SERVER['HTTP_HOST'] ?? '')) !== 'cubisshop.ro') fail('Host invalid.', 403);
if ((string)($_SERVER['REMOTE_ADDR'] ?? '') !== '__EXPECTED_IP__') fail('IP nepermis.', 403);
if ((string)($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') fail('Metodă nepermisă.', 405);

$authorization = (string)($_SERVER['HTTP_AUTHORIZATION'] ?? '');
if (!str_starts_with($authorization, 'Basic ')) fail('Autentificare necesară.', 401);
$decoded = base64_decode(substr($authorization, 6), true);
if (!is_string($decoded) || !str_contains($decoded, ':')) fail('Autentificare invalidă.', 401);
[$user, $password] = explode(':', $decoded, 2);
if (!hash_equals('__BASIC_USER_SHA256__', hash('sha256', $user))
    || !hash_equals('__BASIC_PASS_SHA256__', hash('sha256', $password))) {
    fail('Autentificare invalidă.', 401);
}
$token = (string)($_SERVER['HTTP_X_CUBIS_DEPLOY_TOKEN'] ?? '');
if (!hash_equals('__TOKEN_SHA256__', hash('sha256', $token))) fail('Token invalid.', 403);

$body = json_decode((string)file_get_contents('php://input'), true);
if (!is_array($body) || (string)($body['confirm'] ?? '') !== 'cabitro_cubisshop.ro') {
    fail('Confirmarea exactă a bazei lipsește.', 422);
}

$targetVersion = '2026101002';
$markerDirectory = dirname(__DIR__, 2) . '/.cubisshop-deploy-state';
$marker = $markerDirectory . '/schema-finalized-' . $targetVersion . '.done';
if (is_file($marker)) fail('Finalizarea a fost deja executată.', 409);

$configFile = __DIR__ . '/config.local.php';
$serviceFile = __DIR__ . '/smartbill-service.php';
if (!is_file($configFile) || !is_file($serviceFile)) fail('Fișierele API necesare lipsesc.', 500);
$config = require $configFile;
require_once $serviceFile;
if (!is_array($config) || (string)($config['db_name'] ?? '') !== 'cabitro_cubisshop.ro') {
    fail('Configurația bazei nu este Cubis Shop.', 500);
}

$db = new PDO(
    'mysql:host=' . (string)$config['db_host'] . ';port=' . (int)$config['db_port'] . ';dbname=' . (string)$config['db_name'] . ';charset=utf8mb4',
    (string)$config['db_user'],
    (string)$config['db_pass'],
    [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC, PDO::ATTR_EMULATE_PREPARES => false]
);
if ((string)$db->query('SELECT DATABASE()')->fetchColumn() !== 'cabitro_cubisshop.ro') fail('Baza selectată este invalidă.', 500);

$lock = $db->prepare('SELECT GET_LOCK(?, 15)');
$lock->execute(['cubisshop-schema-finalizer-2026101002']);
if ((int)$lock->fetchColumn() !== 1) fail('O altă migrare este în curs.', 423);

try {
    $versionQuery = $db->prepare('SELECT meta_value FROM shop_schema_meta WHERE meta_key = ? LIMIT 1');
    $versionQuery->execute(['schema_version']);
    $previousVersion = (string)$versionQuery->fetchColumn();
    if ($previousVersion === '' || !ctype_digit($previousVersion)) {
        throw new RuntimeException('Versiunea existentă a schemei lipsește sau este invalidă.');
    }
    if ((int)$previousVersion > (int)$targetVersion) {
        throw new RuntimeException('Schema serverului este mai nouă decât pachetul curent; finalizarea a fost oprită.');
    }

    $backupDirectory = dirname(__DIR__, 2) . '/.cubisshop-backups';
    if (!is_dir($backupDirectory) && !mkdir($backupDirectory, 0700, true) && !is_dir($backupDirectory)) {
        throw new RuntimeException('Directorul de backup nu a putut fi creat.');
    }
    $backupPath = $backupDirectory . '/before-schema-finalizer-' . date('Ymd-His') . '-' . bin2hex(random_bytes(6)) . '.sql';
    $backup = "-- Cubis Shop schema metadata backup\n"
        . "-- Database: cabitro_cubisshop.ro\n"
        . "-- Previous version: " . $previousVersion . "\n"
        . "UPDATE shop_schema_meta SET meta_value = " . $db->quote($previousVersion)
        . " WHERE meta_key = 'schema_version';\n";
    if (file_put_contents($backupPath, $backup, LOCK_EX) === false) {
        throw new RuntimeException('Backupul metadatelor nu a putut fi scris.');
    }
    chmod($backupPath, 0600);

    // Idempotent, additive verification. No operational rows are imported or deleted.
    CubisSmartBillService::ensureSchema($db);

    $requiredTables = [
        'shop_smartbill_settings',
        'shop_smartbill_warehouses',
        'shop_smartbill_series',
        'shop_smartbill_request_cache',
        'shop_smartbill_invoice_requests',
        'shop_smartbill_adjustments',
    ];
    $tableCheck = $db->prepare('SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ?');
    foreach ($requiredTables as $table) {
        $tableCheck->execute([$table]);
        if ((int)$tableCheck->fetchColumn() !== 1) throw new RuntimeException('Lipsește structura necesară: ' . $table);
    }

    $requiredColumns = [
        ['shop_smartbill_settings', 'issuing_enabled'],
        ['shop_products', 'smartbill_sku'],
        ['shop_products', 'smartbill_warehouse_id'],
        ['shop_products', 'smartbill_stock_quantity'],
        ['shop_invoices', 'smartbill_document_id'],
        ['shop_invoices', 'smartbill_synced_at'],
    ];
    $columnCheck = $db->prepare('SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?');
    foreach ($requiredColumns as [$table, $column]) {
        $columnCheck->execute([$table, $column]);
        if ((int)$columnCheck->fetchColumn() !== 1) throw new RuntimeException('Lipsește coloana necesară: ' . $table . '.' . $column);
    }

    $saveVersion = $db->prepare(
        'INSERT INTO shop_schema_meta (meta_key, meta_value) VALUES (?, ?)
         ON DUPLICATE KEY UPDATE meta_value = VALUES(meta_value)'
    );
    $saveVersion->execute(['schema_version', $targetVersion]);
    $versionQuery->execute(['schema_version']);
    $installedVersion = (string)$versionQuery->fetchColumn();
    if ($installedVersion !== $targetVersion) throw new RuntimeException('Versiunea schemei nu a putut fi confirmată.');

    if (!is_dir($markerDirectory) && !mkdir($markerDirectory, 0700, true) && !is_dir($markerDirectory)) {
        throw new RuntimeException('Markerul de execuție nu poate fi creat.');
    }
    file_put_contents($marker, date(DATE_ATOM), LOCK_EX);
    chmod($marker, 0600);

    echo json_encode([
        'success' => true,
        'database' => (string)$db->query('SELECT DATABASE()')->fetchColumn(),
        'previous_version' => $previousVersion,
        'installed_version' => $installedVersion,
        'verified_smartbill_tables' => count($requiredTables),
        'verified_smartbill_columns' => count($requiredColumns),
        'issuing_enabled' => (bool)$db->query('SELECT issuing_enabled FROM shop_smartbill_settings WHERE id = 1')->fetchColumn(),
        'table_count' => (int)$db->query('SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE()')->fetchColumn(),
        'backup_file' => basename($backupPath),
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
} catch (Throwable $error) {
    fail(substr($error->getMessage(), 0, 500), 500);
} finally {
    $release = $db->prepare('SELECT RELEASE_LOCK(?)');
    $release->execute(['cubisshop-schema-finalizer-2026101002']);
}

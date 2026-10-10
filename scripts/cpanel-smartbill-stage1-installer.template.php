<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

function fail(string $message, int $status): never {
    http_response_code($status);
    echo json_encode(['success' => false, 'error' => mb_substr($message, 0, 500)], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
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
if (!is_array($body) || (string)($body['confirm'] ?? '') !== 'cabitro_cubisshop.ro') fail('Confirmarea exactă a bazei lipsește.', 422);

$markerDirectory = dirname(__DIR__, 2) . '/.cubisshop-deploy-state';
$marker = $markerDirectory . '/smartbill-connectivity-stage1-20261010.done';
if (is_file($marker)) fail('Migrarea a fost deja executată.', 409);
if (!function_exists('openssl_encrypt') || !function_exists('openssl_decrypt')) fail('Extensia PHP OpenSSL lipsește.', 500);

$configFile = __DIR__ . '/config.local.php';
$serviceFile = __DIR__ . '/smartbill-service.php';
if (!is_file($configFile) || !is_file($serviceFile)) fail('Fișierele API necesare lipsesc.', 500);
$config = require $configFile;
require_once $serviceFile;
if (!is_array($config) || (string)($config['db_name'] ?? '') !== 'cabitro_cubisshop.ro') fail('Configurația bazei nu este Cubis Shop.', 500);
if (strlen(trim((string)($config['smartbill_credential_key'] ?? ''))) < 32) fail('Cheia seifului SmartBill nu este configurată.', 500);
if (empty($config['smartbill_read_enabled']) || !empty($config['smartbill_issuing_enabled']) || !empty($config['smartbill_email_enabled'])) {
    fail('Porțile SmartBill nu sunt în starea sigură pentru etapa 1.', 500);
}

$db = new PDO(
    'mysql:host=' . (string)$config['db_host'] . ';port=' . (int)$config['db_port'] . ';dbname=' . (string)$config['db_name'] . ';charset=utf8mb4',
    (string)$config['db_user'],
    (string)$config['db_pass'],
    [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC, PDO::ATTR_EMULATE_PREPARES => false]
);
if ((string)$db->query('SELECT DATABASE()')->fetchColumn() !== 'cabitro_cubisshop.ro') fail('Baza selectată este invalidă.', 500);
$lock = $db->prepare('SELECT GET_LOCK(?, 15)');
$lock->execute(['cubisshop-smartbill-connectivity-stage1']);
if ((int)$lock->fetchColumn() !== 1) fail('O altă migrare este în curs.', 423);

try {
    $backupDirectory = dirname(__DIR__, 2) . '/.cubisshop-backups';
    if (!is_dir($backupDirectory) && !mkdir($backupDirectory, 0700, true) && !is_dir($backupDirectory)) throw new RuntimeException('Directorul de backup nu a putut fi creat.');
    $backupPath = $backupDirectory . '/before-smartbill-connectivity-stage1-20261010-' . bin2hex(random_bytes(6)) . '.sql';
    $backup = ['-- Cubis Shop SmartBill connectivity stage 1 backup', '-- Database: cabitro_cubisshop.ro', '-- Created: ' . date(DATE_ATOM), ''];
    foreach (['shop_smartbill_settings', 'shop_smartbill_warehouses', 'shop_smartbill_series', 'shop_smartbill_request_cache', 'shop_schema_meta'] as $table) {
        $exists = $db->prepare('SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ?');
        $exists->execute([$table]);
        if (!(bool)$exists->fetchColumn()) { $backup[] = '-- Table did not exist: ' . $table; continue; }
        $create = $db->query('SHOW CREATE TABLE `' . $table . '`')->fetch(PDO::FETCH_NUM);
        $backup[] = 'DROP TABLE IF EXISTS `' . $table . '`;';
        $backup[] = (string)($create[1] ?? '') . ';';
        foreach ($db->query('SELECT * FROM `' . $table . '`')->fetchAll() as $row) {
            $columns = array_map(static fn(string $column): string => '`' . str_replace('`', '``', $column) . '`', array_keys($row));
            $values = array_map(static fn($value): string => $value === null ? 'NULL' : $db->quote((string)$value), array_values($row));
            $backup[] = 'INSERT INTO `' . $table . '` (' . implode(',', $columns) . ') VALUES (' . implode(',', $values) . ');';
        }
        $backup[] = '';
    }
    if (file_put_contents($backupPath, implode("\n", $backup), LOCK_EX) === false) throw new RuntimeException('Backupul nu a putut fi scris.');
    chmod($backupPath, 0600);

    CubisSmartBillService::ensureSchema($db);
    $saveVersion = $db->prepare(
        'INSERT INTO shop_schema_meta (meta_key, meta_value) VALUES (?, ?)
         ON DUPLICATE KEY UPDATE meta_value = VALUES(meta_value)'
    );
    $saveVersion->execute(['schema_version', '2026101003']);

    $credentialsTable = (int)$db->query("SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'shop_smartbill_credentials'")->fetchColumn();
    $auditTable = (int)$db->query("SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'shop_smartbill_credential_audit'")->fetchColumn();
    $historyColumns = (int)$db->query("SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'shop_smartbill_series' AND column_name IN ('previous_next_number','next_number_changed_at')")->fetchColumn();
    if ($credentialsTable !== 1 || $auditTable !== 1 || $historyColumns !== 2) throw new RuntimeException('Verificarea structurii SmartBill etapa 1 a eșuat.');
    if (!is_dir($markerDirectory) && !mkdir($markerDirectory, 0700, true) && !is_dir($markerDirectory)) throw new RuntimeException('Markerul de execuție nu poate fi creat.');
    file_put_contents($marker, date(DATE_ATOM), LOCK_EX);
    chmod($marker, 0600);

    echo json_encode([
        'success' => true,
        'database' => (string)$db->query('SELECT DATABASE()')->fetchColumn(),
        'schema_version' => (string)$db->query("SELECT meta_value FROM shop_schema_meta WHERE meta_key = 'schema_version'")->fetchColumn(),
        'credential_vault_exists' => true,
        'credential_audit_exists' => true,
        'series_history_columns' => $historyColumns,
        'openssl_available' => true,
        'read_enabled' => true,
        'issuing_enabled' => false,
        'email_enabled' => false,
        'backup_file' => basename($backupPath),
        'table_count' => (int)$db->query('SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE()')->fetchColumn(),
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
} catch (Throwable $error) {
    fail($error->getMessage(), 500);
} finally {
    $release = $db->prepare('SELECT RELEASE_LOCK(?)');
    $release->execute(['cubisshop-smartbill-connectivity-stage1']);
}

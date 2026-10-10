<?php
declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

define('CUBIS_SHOP_LIBRARY_ONLY', true);
require_once __DIR__ . '/api.php';

$arguments = array_slice($argv, 1);
$apply = in_array('--apply', $arguments, true);
$confirmation = '';
foreach ($arguments as $argument) {
    if (str_starts_with($argument, '--confirm=')) $confirmation = substr($argument, 10);
}

$plan = [
    'target_database' => 'cabitro_cubisshop.ro',
    'migration' => 'smartbill_v1_v3',
    'schema_version' => CUBIS_SHOP_SCHEMA_VERSION,
    'additive_only' => true,
    'operational_data_deleted' => false,
    'external_api_called' => false,
];

if (!$apply) {
    echo json_encode($plan, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . PHP_EOL;
    echo "DRY-RUN: nu s-a deschis conexiunea MySQL și nu s-a executat DDL." . PHP_EOL;
    exit(0);
}
if ($confirmation !== 'cabitro_cubisshop.ro') {
    throw new RuntimeException('Confirmarea exactă a bazei lipsește.');
}

$config = shopConfig();
$db = new PDO(
    'mysql:host=' . (string)$config['db_host'] . ';port=' . (int)$config['db_port'] . ';dbname=' . (string)$config['db_name'] . ';charset=utf8mb4',
    (string)$config['db_user'],
    (string)$config['db_pass'],
    [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC, PDO::ATTR_EMULATE_PREPARES => false]
);
if ((string)$db->query('SELECT DATABASE()')->fetchColumn() !== 'cabitro_cubisshop.ro') {
    throw new RuntimeException('Migrarea SmartBill a fost blocată: baza selectată nu este Cubis Shop.');
}
$lock = $db->prepare('SELECT GET_LOCK(?, 15)');
$lock->execute(['cubisshop-smartbill-migration']);
if ((int)$lock->fetchColumn() !== 1) throw new RuntimeException('O altă migrare SmartBill este în curs.');
try {
    CubisSmartBillService::ensureSchema($db);
    $saveVersion = $db->prepare('UPDATE shop_schema_meta SET meta_value = ? WHERE meta_key = ?');
    $saveVersion->execute([(string)CUBIS_SHOP_SCHEMA_VERSION, 'schema_version']);
    if ($saveVersion->rowCount() < 1) {
        $db->prepare('INSERT IGNORE INTO shop_schema_meta (meta_key, meta_value) VALUES (?, ?)')->execute(['schema_version', (string)CUBIS_SHOP_SCHEMA_VERSION]);
    }
} finally {
    $release = $db->prepare('SELECT RELEASE_LOCK(?)');
    $release->execute(['cubisshop-smartbill-migration']);
}

echo json_encode([
    'success' => true,
    'database' => 'cabitro_cubisshop.ro',
    'schema_version' => CUBIS_SHOP_SCHEMA_VERSION,
    'tables' => ['shop_smartbill_settings', 'shop_smartbill_warehouses', 'shop_smartbill_series', 'shop_smartbill_request_cache', 'shop_smartbill_invoice_requests'],
], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . PHP_EOL;

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
    'from_schema_version' => 2026101002,
    'to_schema_version' => CUBIS_SHOP_SCHEMA_VERSION,
    'operations' => [
        'create encrypted SmartBill credential vault and audit table',
        'add SmartBill series numbering observation fields',
        'preserve all products, orders, invoices and legacy inventory tables',
    ],
    'external_smartbill_writes' => false,
];

if (!$apply) {
    echo json_encode($plan, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . PHP_EOL;
    echo "DRY-RUN: nu s-a deschis nicio conexiune MySQL și nu s-a executat DDL." . PHP_EOL;
    exit(0);
}
if ($confirmation !== 'cabitro_cubisshop.ro') {
    throw new RuntimeException('Confirmarea bazei lipsește. Folosește --confirm=cabitro_cubisshop.ro.');
}

$config = shopConfig();
$db = new PDO(
    'mysql:host=' . (string)$config['db_host'] . ';port=' . (int)$config['db_port'] . ';dbname=' . (string)$config['db_name'] . ';charset=utf8mb4',
    (string)$config['db_user'],
    (string)$config['db_pass'],
    [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC, PDO::ATTR_EMULATE_PREPARES => false]
);
if ((string)$db->query('SELECT DATABASE()')->fetchColumn() !== 'cabitro_cubisshop.ro') {
    throw new RuntimeException('Migrarea incrementală SmartBill a fost blocată: baza selectată nu este Cubis Shop.');
}

$lock = $db->prepare('SELECT GET_LOCK(?, 15)');
$lock->execute(['cubisshop-smartbill-stage1']);
if ((int)$lock->fetchColumn() !== 1) throw new RuntimeException('O altă migrare SmartBill este deja în curs.');
try {
    CubisSmartBillService::ensureSchema($db);
    $save = $db->prepare(
        'INSERT INTO shop_schema_meta (meta_key, meta_value) VALUES (?, ?)
         ON DUPLICATE KEY UPDATE meta_value = VALUES(meta_value)'
    );
    $save->execute(['schema_version', (string)CUBIS_SHOP_SCHEMA_VERSION]);
} finally {
    $release = $db->prepare('SELECT RELEASE_LOCK(?)');
    $release->execute(['cubisshop-smartbill-stage1']);
}

$count = $db->query("SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'cabitro_cubisshop.ro' AND table_type = 'BASE TABLE'")->fetchColumn();
echo 'Migrarea SmartBill etapa 1 a fost aplicată exclusiv în cabitro_cubisshop.ro. Tabele curente: ' . (int)$count . '.' . PHP_EOL;

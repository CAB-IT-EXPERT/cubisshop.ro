<?php
declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

define('CUBIS_SHOP_LIBRARY_ONLY', true);
require_once __DIR__ . '/api.php';
require_once __DIR__ . '/migration-service.php';

$arguments = array_slice($argv, 1);
$apply = in_array('--apply', $arguments, true);
$confirmation = '';
foreach ($arguments as $argument) {
    if (str_starts_with($argument, '--confirm=')) $confirmation = substr($argument, 10);
}

$baseline = cubisMigrationBaselinePath();
$plan = [
    'target_database' => 'cabitro_cubisshop.ro',
    'crm_auth_service_baseline' => basename($baseline),
    'shop_schema_version' => CUBIS_SHOP_SCHEMA_VERSION,
    'operational_data_imported' => false,
    'automatic_http_migrations' => false,
];

if (!$apply) {
    echo json_encode($plan, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . PHP_EOL;
    echo "DRY-RUN: nu s-a deschis nicio conexiune MySQL și nu s-a executat nicio migrare." . PHP_EOL;
    exit(0);
}

if ($confirmation !== 'cabitro_cubisshop.ro') {
    throw new RuntimeException('Confirmarea bazei lipsește. Folosește --confirm=cabitro_cubisshop.ro numai după verificarea împreună a schemei.');
}
if (!is_file($baseline)) throw new RuntimeException('Lipsește schema CRM/auth/service din pachetul de deployment.');

$config = shopConfig();
$host = trim((string)($config['db_host'] ?? ''));
$port = (int)($config['db_port'] ?? 3306);
$name = trim((string)($config['db_name'] ?? ''));
$user = trim((string)($config['db_user'] ?? ''));
$pass = (string)($config['db_pass'] ?? '');
if ($name !== 'cabitro_cubisshop.ro' || $host === '' || $user === '' || $port < 1 || $port > 65535) {
    throw new RuntimeException('Variabilele CUBIS_DB_* sunt incomplete sau baza țintă nu este Cubis Shop.');
}

$db = new PDO(
    "mysql:host={$host};port={$port};dbname={$name};charset=utf8mb4",
    $user,
    $pass,
    [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ]
);
$result = cubisApplyStructuralMigration($db, $name);
echo "Migrarea structurală Cubis Shop a fost aplicată fără import de date operaționale. Tabele: {$result['table_count']}." . PHP_EOL;


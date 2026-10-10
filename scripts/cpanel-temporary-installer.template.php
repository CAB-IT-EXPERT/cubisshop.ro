<?php
declare(strict_types=1);

// Generated and uploaded only for the controlled cPanel bootstrap. The deployed
// copy must be deleted immediately after verification.
const CUBIS_INSTALL_EXPECTED_IP = '__EXPECTED_IP__';
const CUBIS_INSTALL_BASIC_USER_HASH = '__BASIC_USER_SHA256__';
const CUBIS_INSTALL_BASIC_PASS_HASH = '__BASIC_PASS_SHA256__';
const CUBIS_INSTALL_TOKEN_HASH = '__TOKEN_SHA256__';
const CUBIS_INSTALL_DATABASE = 'cabitro_cubisshop.ro';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: DENY');

function installerFail(int $status, string $message): never {
    http_response_code($status);
    echo json_encode(['ok' => false, 'error' => $message], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function installerHeader(string $name): string {
    $key = 'HTTP_' . strtoupper(str_replace('-', '_', $name));
    return trim((string)($_SERVER[$key] ?? ''));
}

function installerBasicCredentials(): array {
    $user = (string)($_SERVER['PHP_AUTH_USER'] ?? '');
    $pass = (string)($_SERVER['PHP_AUTH_PW'] ?? '');
    if ($user !== '' || $pass !== '') return [$user, $pass];
    $header = installerHeader('Authorization');
    if (!preg_match('/^Basic\s+(.+)$/i', $header, $match)) return ['', ''];
    $decoded = base64_decode($match[1], true);
    if ($decoded === false || !str_contains($decoded, ':')) return ['', ''];
    return explode(':', $decoded, 2);
}

$https = strtolower((string)($_SERVER['HTTPS'] ?? '')) === 'on' || (int)($_SERVER['SERVER_PORT'] ?? 0) === 443;
if (!$https) installerFail(404, 'Resursa nu este disponibilă.');
if (strtolower((string)($_SERVER['HTTP_HOST'] ?? '')) !== 'cubisshop.ro') installerFail(404, 'Resursa nu este disponibilă.');
if ((string)($_SERVER['REMOTE_ADDR'] ?? '') !== CUBIS_INSTALL_EXPECTED_IP) installerFail(404, 'Resursa nu este disponibilă.');
if ((string)($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') installerFail(405, 'Metodă nepermisă.');

[$basicUser, $basicPass] = installerBasicCredentials();
if (!hash_equals(CUBIS_INSTALL_BASIC_USER_HASH, hash('sha256', $basicUser))
    || !hash_equals(CUBIS_INSTALL_BASIC_PASS_HASH, hash('sha256', $basicPass))) {
    header('WWW-Authenticate: Basic realm="Cubis deployment"');
    installerFail(401, 'Autentificare necesară.');
}
if (!hash_equals(CUBIS_INSTALL_TOKEN_HASH, hash('sha256', installerHeader('X-Cubis-Deploy-Token')))) {
    installerFail(403, 'Token invalid.');
}
if (!hash_equals(CUBIS_INSTALL_DATABASE, installerHeader('X-Cubis-Database'))) {
    installerFail(409, 'Confirmarea exactă a bazei lipsește.');
}

$body = json_decode((string)file_get_contents('php://input'), true);
$action = is_array($body) ? trim((string)($body['action'] ?? '')) : '';
if (!in_array($action, ['inspect', 'backup_and_migrate', 'configure_stripe_test', 'create_initial_admin', 'verify'], true)) {
    installerFail(400, 'Acțiune invalidă.');
}

define('CUBIS_SHOP_LIBRARY_ONLY', true);
require_once __DIR__ . '/api.php';
require_once __DIR__ . '/migration-service.php';

function installerDatabase(array $config): PDO {
    $name = trim((string)($config['db_name'] ?? ''));
    $host = trim((string)($config['db_host'] ?? ''));
    $user = trim((string)($config['db_user'] ?? ''));
    $pass = (string)($config['db_pass'] ?? '');
    $port = (int)($config['db_port'] ?? 3306);
    if ($name !== CUBIS_INSTALL_DATABASE || $host === '' || $user === '' || $port < 1 || $port > 65535) {
        throw new RuntimeException('Configurația CUBIS_DB_* este incompletă sau indică altă bază.');
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
    cubisAssertMigrationTarget($db, CUBIS_INSTALL_DATABASE);
    return $db;
}

function installerTableNames(PDO $db): array {
    $query = $db->prepare(
        "SELECT table_name FROM information_schema.tables
         WHERE table_schema = ? AND table_type = 'BASE TABLE' ORDER BY table_name"
    );
    $query->execute([CUBIS_INSTALL_DATABASE]);
    return array_map('strval', $query->fetchAll(PDO::FETCH_COLUMN));
}

function installerQuoteIdentifier(string $identifier): string {
    if (!preg_match('/^[A-Za-z0-9_]+$/', $identifier)) throw new RuntimeException('Identificator SQL invalid.');
    return '`' . $identifier . '`';
}

function installerSqlValue(PDO $db, mixed $value): string {
    if ($value === null) return 'NULL';
    $quoted = $db->quote((string)$value);
    if ($quoted === false) throw new RuntimeException('O valoare nu a putut fi serializată în backup.');
    return $quoted;
}

function installerBackup(PDO $db): string {
    $home = dirname(__DIR__, 2);
    $directory = $home . '/.cubisshop-backups';
    if (!is_dir($directory) && !mkdir($directory, 0700, true) && !is_dir($directory)) {
        throw new RuntimeException('Directorul privat de backup nu a putut fi creat.');
    }
    @chmod($directory, 0700);
    $path = $directory . '/before-stage3-' . gmdate('Ymd-His') . '-' . bin2hex(random_bytes(6)) . '.sql';
    $handle = fopen($path, 'xb');
    if ($handle === false) throw new RuntimeException('Fișierul de backup nu a putut fi creat.');
    try {
        fwrite($handle, "-- Cubis Shop backup before Stage 3 migration\n");
        fwrite($handle, "-- Database: " . CUBIS_INSTALL_DATABASE . "\n");
        fwrite($handle, "SET NAMES utf8mb4;\nSET FOREIGN_KEY_CHECKS=0;\n\n");
        foreach (installerTableNames($db) as $table) {
            $identifier = installerQuoteIdentifier($table);
            $create = $db->query('SHOW CREATE TABLE ' . $identifier)->fetch(PDO::FETCH_NUM);
            if (!is_array($create) || !isset($create[1])) throw new RuntimeException("Structura tabelei {$table} nu poate fi exportată.");
            fwrite($handle, "DROP TABLE IF EXISTS {$identifier};\n" . $create[1] . ";\n\n");
            $rows = $db->query('SELECT * FROM ' . $identifier);
            while (($row = $rows->fetch(PDO::FETCH_ASSOC)) !== false) {
                $columns = array_map('installerQuoteIdentifier', array_keys($row));
                $values = array_map(fn(mixed $value): string => installerSqlValue($db, $value), array_values($row));
                fwrite($handle, 'INSERT INTO ' . $identifier . ' (' . implode(',', $columns) . ') VALUES (' . implode(',', $values) . ");\n");
            }
            fwrite($handle, "\n");
        }
        fwrite($handle, "SET FOREIGN_KEY_CHECKS=1;\n");
    } finally {
        fclose($handle);
    }
    @chmod($path, 0600);
    return $path;
}

function installerStatePaths(): array {
    $directory = dirname(__DIR__, 2) . '/.cubisshop-backups';
    if (!is_dir($directory) && !mkdir($directory, 0700, true) && !is_dir($directory)) {
        throw new RuntimeException('Directorul privat de stare nu a putut fi creat.');
    }
    return [$directory . '/stage3-install.lock', $directory . '/stage3-install.completed.json'];
}

function installerSnapshot(PDO $db, array $config = []): array {
    $tables = installerTableNames($db);
    $required = [
        'app_users', 'app_sessions', 'clients', 'service_sheets', 'shop_products',
        'shop_categories', 'shop_customers', 'shop_orders', 'shop_order_items',
        'shop_invoices', 'shop_stripe_events', 'shop_schema_meta',
    ];
    $schemaVersion = null;
    if (in_array('shop_schema_meta', $tables, true)) {
        $version = $db->prepare('SELECT meta_value FROM shop_schema_meta WHERE meta_key = ? LIMIT 1');
        $version->execute(['schema_version']);
        $schemaVersion = $version->fetchColumn() ?: null;
    }
    $operationalRows = [];
    foreach (['app_users', 'clients', 'service_sheets', 'shop_products', 'shop_customers', 'shop_orders', 'shop_invoices', 'shop_nir_documents'] as $table) {
        $operationalRows[$table] = in_array($table, $tables, true)
            ? (int)$db->query('SELECT COUNT(*) FROM ' . installerQuoteIdentifier($table))->fetchColumn()
            : null;
    }
    $stripeSecret = trim((string)($config['stripe_secret_key'] ?? ''));
    $stripePublishable = trim((string)($config['stripe_publishable_key'] ?? ''));
    return [
        'database' => (string)$db->query('SELECT DATABASE()')->fetchColumn(),
        'table_count' => count($tables),
        'tables' => $tables,
        'missing_required_tables' => array_values(array_diff($required, $tables)),
        'schema_version' => $schemaVersion,
        'operational_rows' => $operationalRows,
        'external_features' => [
            'automations_enabled' => (bool)($config['automations_enabled'] ?? false),
            'email_enabled' => (bool)($config['email_enabled'] ?? false),
            'admin_email_enabled' => (bool)($config['admin_email_enabled'] ?? false),
            'spv_enabled' => (bool)($config['spv_enabled'] ?? false),
            'website_generation_enabled' => (bool)($config['website_generation_enabled'] ?? false),
        ],
        'stripe' => [
            'test_secret_configured' => str_starts_with($stripeSecret, 'sk_test_'),
            'test_publishable_configured' => str_starts_with($stripePublishable, 'pk_test_'),
            'webhook_secret_configured' => trim((string)($config['stripe_webhook_secret'] ?? '')) !== '',
        ],
        'php_version' => PHP_VERSION,
        'extensions' => [
            'curl' => extension_loaded('curl'),
            'fileinfo' => extension_loaded('fileinfo'),
            'mbstring' => extension_loaded('mbstring'),
            'openssl' => extension_loaded('openssl'),
            'pdo_mysql' => extension_loaded('pdo_mysql'),
            'zip' => extension_loaded('zip'),
        ],
    ];
}

try {
    $config = shopConfig();
    $db = installerDatabase($config);
    [$lockPath, $completedPath] = installerStatePaths();
    $lockHandle = fopen($lockPath, 'c+');
    if ($lockHandle === false || !flock($lockHandle, LOCK_EX | LOCK_NB)) {
        throw new RuntimeException('O instalare Cubis este deja în curs.');
    }
    try {
        if ($action === 'inspect') {
            $result = installerSnapshot($db, $config);
        } elseif ($action === 'backup_and_migrate') {
            if (is_file($completedPath)) throw new RuntimeException('Instalarea a fost deja executată și nu poate fi repetată.');
            cubisAssertNoOperationalData($db, CUBIS_INSTALL_DATABASE);
            $backupPath = installerBackup($db);
            $migration = cubisApplyStructuralMigration($db, CUBIS_INSTALL_DATABASE);
            $result = installerSnapshot($db, $config);
            $result['migration'] = $migration;
            $result['backup_path'] = $backupPath;
            $state = json_encode([
                'database' => CUBIS_INSTALL_DATABASE,
                'schema_version' => CUBIS_SHOP_SCHEMA_VERSION,
                'completed_at' => gmdate(DATE_ATOM),
                'backup_path' => $backupPath,
            ], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
            if ($state === false || file_put_contents($completedPath, $state, LOCK_EX) === false) {
                throw new RuntimeException('Migrarea a reușit, dar marcajul de finalizare nu a putut fi salvat.');
            }
            @chmod($completedPath, 0600);
        } elseif ($action === 'configure_stripe_test') {
            if (!str_starts_with(trim((string)($config['stripe_secret_key'] ?? '')), 'sk_test_')
                || !str_starts_with(trim((string)($config['stripe_publishable_key'] ?? '')), 'pk_test_')
                || !str_starts_with(trim((string)($config['stripe_webhook_secret'] ?? '')), 'whsec_')) {
                throw new RuntimeException('Stripe TEST și secretul webhook trebuie configurate înainte de activarea plății cu cardul.');
            }
            $db->exec(
                "INSERT INTO shop_payment_settings
                    (id, card_enabled, cash_on_delivery_enabled, card_label, cash_on_delivery_label)
                 VALUES (1, 1, 1, 'Card online', 'Ramburs la curier')
                 ON DUPLICATE KEY UPDATE
                    card_enabled = VALUES(card_enabled),
                    cash_on_delivery_enabled = VALUES(cash_on_delivery_enabled),
                    card_label = VALUES(card_label),
                    cash_on_delivery_label = VALUES(cash_on_delivery_label)"
            );
            $result = installerSnapshot($db, $config);
            $result['card_payment_enabled'] = true;
        } elseif ($action === 'create_initial_admin') {
            $username = trim((string)($body['username'] ?? ''));
            $password = (string)($body['password'] ?? '');
            $displayName = trim((string)($body['display_name'] ?? 'Administrator Cubis'));
            if ($username !== 'admin' || $password !== 'admin') {
                throw new RuntimeException('Datele bootstrap nu corespund administratorului inițial aprobat.');
            }
            if ((int)$db->query('SELECT COUNT(*) FROM app_users')->fetchColumn() !== 0) {
                throw new RuntimeException('Bootstrapul este permis numai când tabela app_users este goală.');
            }
            $id = uuidV4();
            $insert = $db->prepare(
                'INSERT INTO app_users
                 (id, username, password_hash, display_name, role, platform_access, support_chat_access, client_panel_access, client_edit_access, service_sheet_access, client_financial_access, is_active)
                 VALUES (?, ?, ?, ?, "admin", "both", 1, 1, 1, 1, 1, 1)'
            );
            $insert->execute([$id, $username, password_hash($password, PASSWORD_DEFAULT), $displayName]);
            $result = installerSnapshot($db, $config);
            $result['administrator'] = ['id' => $id, 'username' => $username, 'role' => 'admin'];
        } else {
            $result = installerSnapshot($db, $config);
            $result['installation_completed'] = is_file($completedPath);
        }
    } finally {
        flock($lockHandle, LOCK_UN);
        fclose($lockHandle);
    }
    echo json_encode(['ok' => true, 'result' => $result], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
} catch (Throwable $error) {
    error_log('Cubis temporary installer: ' . $error->getMessage());
    installerFail(500, $error->getMessage());
}

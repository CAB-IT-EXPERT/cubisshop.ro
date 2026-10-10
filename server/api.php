<?php
declare(strict_types=1);

ini_set('display_errors', '0');
ini_set('log_errors', '1');

const CUBIS_DATABASE_NAME = 'cabitro_cubisshop.ro';
const CUBIS_RUNTIME_SCHEMA_ID = '20261009_cubis_runtime_schema_v1';
const SERVER_CONFIG_FILE = __DIR__ . '/api_config.local.php';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-Auth-Token');

function jsonResponse(array $payload, int $status = 200): never {
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function applyCors(): void {
    $origin = trim((string)($_SERVER['HTTP_ORIGIN'] ?? ''));
    if ($origin === '') return;
    $raw = (string)(getenv('CUBIS_ALLOWED_ORIGINS') ?: 'https://cubisshop.ro,https://www.cubisshop.ro');
    $allowed = array_values(array_filter(array_map('trim', explode(',', $raw))));
    if (!in_array($origin, $allowed, true)) jsonResponse(['error' => 'Originea cererii nu este permisă.'], 403);
    header('Access-Control-Allow-Origin: ' . $origin);
    header('Vary: Origin', false);
}

applyCors();
if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'OPTIONS') jsonResponse([], 204);

function runtimeConfig(): array {
    $config = [];
    $example = __DIR__ . '/api_config.example.php';
    if (is_file($example)) { $loaded = include $example; if (is_array($loaded)) $config = $loaded; }
    if (is_file(SERVER_CONFIG_FILE)) { $loaded = include SERVER_CONFIG_FILE; if (is_array($loaded)) $config = array_replace($config, $loaded); }
    foreach (['host' => 'CUBIS_DB_HOST', 'port' => 'CUBIS_DB_PORT', 'name' => 'CUBIS_DB_NAME', 'user' => 'CUBIS_DB_USER', 'pass' => 'CUBIS_DB_PASS'] as $key => $env) {
        $value = getenv($env);
        if ($value !== false) $config['db_' . $key] = $key === 'port' ? (int)$value : trim((string)$value);
    }
    return $config;
}

function database(array $config): PDO {
    $host = trim((string)($config['db_host'] ?? ''));
    $port = (int)($config['db_port'] ?? 3306);
    $name = trim((string)($config['db_name'] ?? ''));
    $user = trim((string)($config['db_user'] ?? ''));
    $pass = (string)($config['db_pass'] ?? '');
    if ($name !== CUBIS_DATABASE_NAME) throw new RuntimeException('Conexiunea a fost blocată: baza trebuie să fie exact ' . CUBIS_DATABASE_NAME . '.');
    if ($host === '' || $user === '' || $port < 1 || $port > 65535) throw new RuntimeException('Variabilele CUBIS_DB_* nu sunt configurate complet.');
    $db = new PDO("mysql:host={$host};port={$port};dbname={$name};charset=utf8mb4", $user, $pass, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC, PDO::ATTR_EMULATE_PREPARES => false]);
    if ((string)$db->query('SELECT DATABASE()')->fetchColumn() !== CUBIS_DATABASE_NAME) throw new RuntimeException('Serverul MySQL nu a selectat baza Cubis Shop.');
    $check = $db->prepare('SELECT 1 FROM app_migrations WHERE id = ? LIMIT 1');
    $check->execute([CUBIS_RUNTIME_SCHEMA_ID]);
    if (!$check->fetchColumn()) throw new RuntimeException('Schema Cubis Shop este incompletă; migrarea HTTP este dezactivată.');
    return $db;
}

function uuid(): string {
    $bytes = random_bytes(16);
    $bytes[6] = chr((ord($bytes[6]) & 0x0f) | 0x40);
    $bytes[8] = chr((ord($bytes[8]) & 0x3f) | 0x80);
    return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($bytes), 4));
}

function requestBody(): array {
    $payload = json_decode((string)file_get_contents('php://input'), true);
    return is_array($payload) ? $payload : [];
}

function authToken(array $body): string {
    return trim((string)($_SERVER['HTTP_X_AUTH_TOKEN'] ?? $_GET['authToken'] ?? $body['auth_token'] ?? ''));
}

function userPayload(array $row): array {
    return ['id' => (string)$row['id'], 'username' => (string)$row['username'], 'display_name' => (string)$row['display_name'], 'role' => (string)$row['role'], 'platform_access' => (string)$row['platform_access'], 'is_active' => (bool)$row['is_active'], 'created_at' => (string)($row['created_at'] ?? ''), 'updated_at' => (string)($row['updated_at'] ?? '')];
}

function platformAllowed(array $user, string $platform): bool {
    return ($user['platform_access'] ?? '') === 'both' || ($user['platform_access'] ?? '') === $platform;
}

function requireUser(PDO $db, array $body, array $roles = [], ?string $platform = null): array {
    $token = authToken($body);
    if ($token === '') jsonResponse(['error' => 'Autentificare necesară.'], 401);
    $stmt = $db->prepare('SELECT u.*, s.platform AS session_platform FROM app_sessions s JOIN app_users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > NOW() AND u.is_active = 1 LIMIT 1');
    $stmt->execute([hash('sha256', $token)]);
    $user = $stmt->fetch();
    if (!$user) jsonResponse(['error' => 'Sesiune expirată sau invalidă.'], 401);
    if (!platformAllowed($user, (string)$user['session_platform'])) jsonResponse(['error' => 'Contul nu mai are acces la această platformă.'], 403);
    if ($platform !== null && $user['session_platform'] !== $platform) jsonResponse(['error' => 'Sesiunea nu este validă pentru această platformă.'], 403);
    if ($roles && !in_array($user['role'], $roles, true)) jsonResponse(['error' => 'Nu ai permisiune pentru această acțiune.'], 403);
    $db->prepare('UPDATE app_sessions SET expires_at = DATE_ADD(NOW(), INTERVAL 30 DAY) WHERE token_hash = ? AND expires_at < DATE_ADD(NOW(), INTERVAL 7 DAY)')->execute([hash('sha256', $token)]);
    return $user;
}

function requireAdmin(PDO $db, array $body): array { return requireUser($db, $body, ['admin']); }

function validateUserInput(array $body, bool $creating): array {
    $username = trim((string)($body['username'] ?? ''));
    $displayName = trim((string)($body['display_name'] ?? ''));
    $password = (string)($body['password'] ?? '');
    $role = (string)($body['role'] ?? 'user');
    $platform = (string)($body['platform_access'] ?? 'both');
    if ($username === '' || $displayName === '') jsonResponse(['error' => 'Utilizatorul și numele afișat sunt obligatorii.'], 422);
    if (!preg_match('/^[A-Za-z0-9._-]{3,80}$/', $username)) jsonResponse(['error' => 'Utilizatorul poate conține doar litere, cifre, punct, minus și underscore.'], 422);
    if (($creating || $password !== '') && strlen($password) < 6) jsonResponse(['error' => 'Parola trebuie să aibă minimum 6 caractere.'], 422);
    if (!in_array($role, ['admin', 'manager', 'user'], true)) jsonResponse(['error' => 'Rol invalid.'], 422);
    if (!in_array($platform, ['desktop', 'mobile', 'both'], true)) jsonResponse(['error' => 'Platformă invalidă.'], 422);
    if ($role === 'admin' && $platform === 'mobile') jsonResponse(['error' => 'Administratorii trebuie să aibă acces Desktop sau Desktop + Mobil.'], 422);
    return [$username, $displayName, $password, $role, $platform, !empty($body['is_active']) ? 1 : 0];
}

$action = trim((string)($_GET['action'] ?? ''));
$id = trim((string)($_GET['id'] ?? ''));
$body = requestBody();

if ($action === 'getMobileAppUpdate') {
    $current = trim((string)($_GET['currentVersion'] ?? ''));
    jsonResponse(['platform' => 'android', 'current_version' => $current, 'available_version' => $current, 'update_available' => false, 'download_url' => '', 'message' => 'Actualizările automate sunt dezactivate.']);
}

if (!in_array($action, ['health', 'login', 'adminLogin', 'logout', 'getCurrentUser', 'updateOwnProfile', 'getUsers', 'createUser', 'updateUser', 'deleteUser'], true)) jsonResponse(['error' => 'Endpoint inexistent în API-ul Cubis Shop.'], 404);

try {
    $db = database(runtimeConfig());
    if ($action === 'health') jsonResponse(['success' => true, 'database' => CUBIS_DATABASE_NAME, 'service_module' => false]);
    if ($action === 'login' || $action === 'adminLogin') {
        $username = trim((string)($body['username'] ?? ''));
        $password = (string)($body['password'] ?? '');
        $platform = in_array(($body['platform'] ?? ''), ['desktop', 'mobile'], true) ? (string)$body['platform'] : 'desktop';
        $stmt = $db->prepare('SELECT * FROM app_users WHERE username = ? LIMIT 1');
        $stmt->execute([$username]);
        $user = $stmt->fetch();
        if (!$user || !(bool)$user['is_active'] || !password_verify($password, (string)$user['password_hash']) || !platformAllowed($user, $platform)) jsonResponse(['error' => 'Utilizator sau parolă greșită.'], 401);
        $token = bin2hex(random_bytes(32));
        $days = !empty($body['remember_me']) ? 180 : 30;
        $insert = $db->prepare('INSERT INTO app_sessions (id, user_id, token_hash, platform, expires_at) VALUES (?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL ' . $days . ' DAY))');
        $insert->execute([uuid(), $user['id'], hash('sha256', $token), $platform]);
        jsonResponse(['success' => true, 'token' => $token, 'user' => userPayload($user)]);
    }
    if ($action === 'logout') {
        $token = authToken($body);
        if ($token !== '') $db->prepare('DELETE FROM app_sessions WHERE token_hash = ?')->execute([hash('sha256', $token)]);
        jsonResponse(['success' => true]);
    }
    if ($action === 'getCurrentUser') jsonResponse(userPayload(requireUser($db, $body)));
    if ($action === 'updateOwnProfile') {
        $me = requireUser($db, $body, ['admin'], 'desktop');
        $displayName = trim((string)($body['display_name'] ?? ''));
        $password = (string)($body['password'] ?? '');
        if ($displayName === '') jsonResponse(['error' => 'Numele afișat este obligatoriu.'], 422);
        if ($password !== '' && strlen($password) < 6) jsonResponse(['error' => 'Parola trebuie să aibă minimum 6 caractere.'], 422);
        if ($password !== '') $db->prepare('UPDATE app_users SET display_name = ?, password_hash = ? WHERE id = ?')->execute([$displayName, password_hash($password, PASSWORD_DEFAULT), $me['id']]);
        else $db->prepare('UPDATE app_users SET display_name = ? WHERE id = ?')->execute([$displayName, $me['id']]);
        $read = $db->prepare('SELECT * FROM app_users WHERE id = ?'); $read->execute([$me['id']]); jsonResponse(userPayload($read->fetch()));
    }
    $admin = requireAdmin($db, $body);
    if ($action === 'getUsers') jsonResponse(array_map('userPayload', $db->query('SELECT * FROM app_users ORDER BY created_at DESC')->fetchAll()));
    if ($action === 'createUser') {
        [$username, $displayName, $password, $role, $platform, $active] = validateUserInput($body, true);
        $duplicate = $db->prepare('SELECT COUNT(*) FROM app_users WHERE LOWER(username) = LOWER(?)'); $duplicate->execute([$username]);
        if ((int)$duplicate->fetchColumn() > 0) jsonResponse(['error' => 'Utilizatorul există deja.'], 422);
        $newId = uuid();
        $stmt = $db->prepare('INSERT INTO app_users (id, username, password_hash, display_name, role, platform_access, support_chat_access, client_panel_access, client_edit_access, service_sheet_access, client_financial_access, is_active) VALUES (?, ?, ?, ?, ?, ?, 0, 0, 0, 0, 0, ?)');
        $stmt->execute([$newId, $username, password_hash($password, PASSWORD_DEFAULT), $displayName, $role, $platform, $active]);
        $read = $db->prepare('SELECT * FROM app_users WHERE id = ?'); $read->execute([$newId]); jsonResponse(userPayload($read->fetch()), 201);
    }
    $userId = $id !== '' ? $id : trim((string)($body['id'] ?? ''));
    $target = $db->prepare('SELECT * FROM app_users WHERE id = ? LIMIT 1'); $target->execute([$userId]); $targetUser = $target->fetch();
    if (!$targetUser) jsonResponse(['error' => 'Utilizator inexistent.'], 404);
    $isPrimaryAdmin = strtolower((string)$targetUser['username']) === 'admin';
    if ($action === 'deleteUser') {
        if ($userId === $admin['id']) jsonResponse(['error' => 'Nu îți poți șterge propriul cont.'], 422);
        if ($isPrimaryAdmin) jsonResponse(['error' => 'Utilizatorul principal admin nu poate fi șters.'], 422);
        $db->prepare('DELETE FROM app_users WHERE id = ?')->execute([$userId]); jsonResponse(['success' => true]);
    }
    [$username, $displayName, $password, $role, $platform, $active] = validateUserInput($body, false);
    $duplicate = $db->prepare('SELECT COUNT(*) FROM app_users WHERE LOWER(username) = LOWER(?) AND id <> ?'); $duplicate->execute([$username, $userId]);
    if ((int)$duplicate->fetchColumn() > 0) jsonResponse(['error' => 'Utilizatorul există deja.'], 422);
    if ($isPrimaryAdmin) { $username = 'admin'; $role = 'admin'; $platform = 'both'; $active = 1; }
    if ($password !== '') {
        $stmt = $db->prepare('UPDATE app_users SET username=?, display_name=?, role=?, platform_access=?, support_chat_access=0, client_panel_access=0, client_edit_access=0, service_sheet_access=0, client_financial_access=0, is_active=?, password_hash=? WHERE id=?');
        $stmt->execute([$username, $displayName, $role, $platform, $active, password_hash($password, PASSWORD_DEFAULT), $userId]);
    } else {
        $stmt = $db->prepare('UPDATE app_users SET username=?, display_name=?, role=?, platform_access=?, support_chat_access=0, client_panel_access=0, client_edit_access=0, service_sheet_access=0, client_financial_access=0, is_active=? WHERE id=?');
        $stmt->execute([$username, $displayName, $role, $platform, $active, $userId]);
    }
    $read = $db->prepare('SELECT * FROM app_users WHERE id = ?'); $read->execute([$userId]); jsonResponse(userPayload($read->fetch()));
} catch (Throwable $error) {
    error_log('[Cubis Shop CRM] ' . $error->getMessage());
    jsonResponse(['error' => 'API-ul Cubis Shop nu este disponibil momentan.'], 500);
}

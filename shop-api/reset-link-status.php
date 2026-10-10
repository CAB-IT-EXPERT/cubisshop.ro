<?php
declare(strict_types=1);

header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Accept');
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');

$origin = trim((string)($_SERVER['HTTP_ORIGIN'] ?? ''));
$allowedOrigins = array_values(array_filter(array_map(
    'trim',
    explode(',', (string)(getenv('CUBIS_ALLOWED_ORIGINS') ?: 'https://cubisshop.ro,https://www.cubisshop.ro'))
)));
$corsAllowed = $origin === '' || in_array($origin, $allowedOrigins, true);
if ($origin !== '' && $corsAllowed) {
    header('Access-Control-Allow-Origin: ' . $origin);
    header('Vary: Origin', false);
}

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'OPTIONS') {
    http_response_code($corsAllowed ? 204 : 403);
    exit;
}
if (!$corsAllowed) {
    http_response_code(403);
    echo json_encode(['error' => 'Originea cererii nu este permisă.']);
    exit;
}

function resetLinkResponse(array $payload, int $status = 200): void {
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE);
    exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') {
    resetLinkResponse(['error' => 'Metodă nepermisă.'], 405);
}

$body = json_decode((string)file_get_contents('php://input'), true);
$body = is_array($body) ? $body : [];
$email = mb_strtolower(trim((string)($body['email'] ?? '')));
$rawToken = strtolower(trim((string)($body['token'] ?? '')));
if (!filter_var($email, FILTER_VALIDATE_EMAIL) || !preg_match('/^[a-f0-9]{64}$/', $rawToken)) {
    resetLinkResponse(['error' => 'Linkul de resetare nu este valid sau a expirat.', 'code' => 'reset_link_expired'], 410);
}

try {
    $defaults = require __DIR__ . '/config.example.php';
    $local = [];
    $localFile = __DIR__ . '/config.local.php';
    if (is_file($localFile)) {
        $loaded = require $localFile;
        if (is_array($loaded)) $local = $loaded;
    }
    $config = array_replace($defaults, $local);
    $host = trim((string)(getenv('CUBIS_DB_HOST') ?: ''));
    $port = (int)(getenv('CUBIS_DB_PORT') ?: 3306);
    $name = trim((string)(getenv('CUBIS_DB_NAME') ?: ''));
    $user = trim((string)(getenv('CUBIS_DB_USER') ?: ''));
    $pass = (string)(getenv('CUBIS_DB_PASS') ?: '');
    if ($name !== 'cabitro_cubisshop.ro') {
        throw new RuntimeException('Baza de date configurată nu este baza izolată Cubis Shop.');
    }
    if ($host === '' || $user === '' || $port < 1 || $port > 65535) throw new RuntimeException('Configurare CUBIS_DB_* incompletă.');
    $db = new PDO("mysql:host={$host};port={$port};dbname={$name};charset=utf8mb4", $user, $pass, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ]);
    if ((string)$db->query('SELECT DATABASE()')->fetchColumn() !== 'cabitro_cubisshop.ro') {
        throw new RuntimeException('Serverul nu a selectat baza Cubis Shop.');
    }
    $stmt = $db->prepare(
        'SELECT r.id
         FROM shop_customer_password_resets r
         INNER JOIN shop_customers c ON c.id = r.customer_id AND c.is_active = 1
         WHERE r.token_hash = ? AND r.email = ? AND c.email = ?
           AND r.used_at IS NULL AND r.expires_at >= NOW()
         LIMIT 1'
    );
    $stmt->execute([hash('sha256', $rawToken), $email, $email]);
    if (!$stmt->fetchColumn()) {
        resetLinkResponse(['error' => 'Linkul de resetare nu este valid sau a expirat.', 'code' => 'reset_link_expired'], 410);
    }
    resetLinkResponse(['valid' => true]);
} catch (Throwable $error) {
    error_log('[Cubis Shop reset link validation] ' . $error->getMessage());
    resetLinkResponse(['error' => 'Linkul nu poate fi verificat momentan.', 'code' => 'reset_link_unavailable'], 503);
}

<?php
declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}
if (!in_array('--apply', $argv, true) || !in_array('--confirm=cabitro_cubisshop.ro', $argv, true)) {
    echo "DRY-RUN: utilitarul nu a deschis conexiunea MySQL. Pentru creare este necesară confirmarea explicită a bazei Cubis." . PHP_EOL;
    exit(0);
}

define('CUBIS_SHOP_LIBRARY_ONLY', true);
require_once __DIR__ . '/api.php';

$username = trim((string)(getenv('CUBIS_INITIAL_ADMIN_USERNAME') ?: ''));
$password = (string)(getenv('CUBIS_INITIAL_ADMIN_PASSWORD') ?: '');
$displayName = trim((string)(getenv('CUBIS_INITIAL_ADMIN_DISPLAY_NAME') ?: 'Administrator Cubis'));
if (!preg_match('/^[A-Za-z0-9._-]{3,80}$/', $username)) throw new RuntimeException('CUBIS_INITIAL_ADMIN_USERNAME este invalid.');
if (strlen($password) < CUBIS_ADMIN_PASSWORD_MIN_LENGTH) {
    throw new RuntimeException('CUBIS_INITIAL_ADMIN_PASSWORD trebuie să aibă minimum ' . CUBIS_ADMIN_PASSWORD_MIN_LENGTH . ' caractere.');
}

$db = shopDb(shopConfig());
$exists = $db->prepare('SELECT 1 FROM app_users WHERE LOWER(username) = LOWER(?) LIMIT 1');
$exists->execute([$username]);
if ($exists->fetchColumn()) throw new RuntimeException('Utilizatorul inițial există deja; parola nu a fost modificată.');

$id = uuidV4();
$insert = $db->prepare(
    'INSERT INTO app_users
     (id, username, password_hash, display_name, role, platform_access, support_chat_access, client_panel_access, client_edit_access, service_sheet_access, client_financial_access, is_active)
     VALUES (?, ?, ?, ?, "admin", "both", 1, 1, 1, 1, 1, 1)'
);
$insert->execute([$id, $username, password_hash($password, PASSWORD_DEFAULT), $displayName]);
echo "Administratorul inițial Cubis a fost creat. Elimină imediat CUBIS_INITIAL_ADMIN_PASSWORD din mediul shell/cPanel." . PHP_EOL;


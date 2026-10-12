<?php
declare(strict_types=1);

// Preview local, fără baze de date, configurări live sau trimitere SMTP.
if (!function_exists('mb_strtolower')) {
    function mb_strtolower(string $value, ?string $encoding = null): string { return strtolower($value); }
}

require_once dirname(__DIR__) . '/shop-api/order-emails.php';

$output = $argv[1] ?? (dirname(__DIR__) . '/.codex-tmp/password-reset-email-preview.html');
$directory = dirname($output);
if (!is_dir($directory) && !mkdir($directory, 0775, true) && !is_dir($directory)) {
    throw new RuntimeException('Directorul pentru preview nu a putut fi creat.');
}

$preview = gtBuildPasswordResetEmail(
    ['email' => 'client@exemplu.ro', 'full_name' => 'Alex'],
    [
        'website_base_url' => 'https://cubisshop.ro',
        'order_email_logo_url' => 'https://cubisshop.ro/assets/cubis-shop-logo.png',
    ],
    str_repeat('a', 64)
);

if (file_put_contents($output, $preview['html']) === false) {
    throw new RuntimeException('Previewul nu a putut fi salvat.');
}

fwrite(STDOUT, realpath($output) . PHP_EOL);

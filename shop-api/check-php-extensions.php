<?php
declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

$required = ['curl', 'dom', 'fileinfo', 'json', 'mbstring', 'openssl', 'pdo', 'pdo_mysql', 'simplexml', 'xml', 'xmlreader', 'xmlwriter', 'zip'];
$recommended = ['bcmath', 'gd', 'iconv', 'intl', 'zlib'];
$missing = array_values(array_filter($required, static fn(string $extension): bool => !extension_loaded($extension)));
$missingRecommended = array_values(array_filter($recommended, static fn(string $extension): bool => !extension_loaded($extension)));

echo json_encode([
    'php_version' => PHP_VERSION,
    'required_missing' => $missing,
    'recommended_missing' => $missingRecommended,
    'ready' => $missing === [] && version_compare(PHP_VERSION, '8.2.0', '>='),
], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES) . PHP_EOL;
exit($missing === [] && version_compare(PHP_VERSION, '8.2.0', '>=') ? 0 : 1);


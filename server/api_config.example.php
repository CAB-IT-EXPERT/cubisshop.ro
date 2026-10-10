<?php
declare(strict_types=1);

// Copy to api_config.local.php only when local overrides are needed.
// Keep api_config.local.php outside Git; prefer environment variables in hosting.
$env = static function (string $name, string $fallback = ''): string {
    $value = getenv($name);
    return $value === false ? $fallback : trim((string)$value);
};

return [
    'api_key' => $env('CUBIS_API_KEY'),
    'db_host' => $env('CUBIS_DB_HOST'),
    'db_port' => (int)$env('CUBIS_DB_PORT', '3306'),
    'db_name' => $env('CUBIS_DB_NAME'),
    'db_user' => $env('CUBIS_DB_USER'),
    'db_pass' => $env('CUBIS_DB_PASS'),
];

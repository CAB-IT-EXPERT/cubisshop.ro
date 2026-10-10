<?php
declare(strict_types=1);

/** Standalone bootstrap used only by the OAuth callback and the CLI worker. */
function gtrotsSpvRuntimeConfig(): array
{
    $exampleFile = __DIR__ . '/config.example.php';
    if (!is_file($exampleFile)) throw new RuntimeException('Lipsește configurația de bază Cubis Shop.');
    $config = include $exampleFile;
    if (!is_array($config)) throw new RuntimeException('Configurația de bază Cubis Shop este invalidă.');

    $localFile = __DIR__ . '/config.local.php';
    if (is_file($localFile)) {
        $local = include $localFile;
        if (is_array($local)) $config = array_replace($config, $local);
    }
    foreach ([
        'db_host' => 'CUBIS_DB_HOST',
        'db_port' => 'CUBIS_DB_PORT',
        'db_name' => 'CUBIS_DB_NAME',
        'db_user' => 'CUBIS_DB_USER',
        'db_pass' => 'CUBIS_DB_PASS',
    ] as $key => $environmentName) {
        $value = getenv($environmentName);
        $config[$key] = $key === 'db_port' ? (int)($value === false ? 3306 : $value) : trim((string)($value === false ? '' : $value));
    }
    if ((string)($config['db_name'] ?? '') !== 'cabitro_cubisshop.ro') {
        throw new RuntimeException('Conexiunea SPV a fost blocată: baza trebuie să fie exact cabitro_cubisshop.ro.');
    }
    return $config;
}

function gtrotsSpvRuntimeDb(array $config): PDO
{
    $host = trim((string)($config['db_host'] ?? ''));
    $port = (int)($config['db_port'] ?? 3306);
    $name = trim((string)($config['db_name'] ?? ''));
    $user = trim((string)($config['db_user'] ?? ''));
    $pass = (string)($config['db_pass'] ?? '');
    if ($name !== 'cabitro_cubisshop.ro') {
        throw new RuntimeException('Conexiunea SPV a fost blocată: baza configurată nu este baza Cubis Shop.');
    }
    if ($host === '' || $user === '' || $port < 1 || $port > 65535) throw new RuntimeException('Configurația CUBIS_DB_* este incompletă.');
    $db = new PDO("mysql:host={$host};port={$port};dbname={$name};charset=utf8mb4", $user, $pass, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ]);
    if ((string)$db->query('SELECT DATABASE()')->fetchColumn() !== 'cabitro_cubisshop.ro') {
        throw new RuntimeException('Conexiunea SPV a fost blocată: serverul nu a selectat baza Cubis Shop.');
    }
    return $db;
}

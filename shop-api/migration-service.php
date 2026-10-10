<?php
declare(strict_types=1);

/**
 * Shared structural migration used by the CLI migrator and by the temporary,
 * authenticated cPanel bootstrapper. It never imports operational data.
 */

function cubisMigrationBaselinePath(): string {
    return __DIR__ . '/migrations/20261009_cubis_crm_auth_service_schema.sql';
}

function cubisAssertMigrationTarget(PDO $db, string $expectedDatabase = 'cabitro_cubisshop.ro'): void {
    $actual = (string)$db->query('SELECT DATABASE()')->fetchColumn();
    if ($actual !== $expectedDatabase) {
        throw new RuntimeException('Migrarea a fost blocată: conexiunea nu este pe baza Cubis Shop.');
    }
}

function cubisAssertNoOperationalData(PDO $db, string $databaseName): void {
    $operationalTables = [
        'app_users', 'clients', 'service_sheets', 'shop_products', 'shop_customers',
        'shop_orders', 'shop_invoices', 'shop_nir_documents',
    ];
    $exists = $db->prepare(
        'SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = ? AND table_name = ?'
    );
    foreach ($operationalTables as $table) {
        $exists->execute([$databaseName, $table]);
        if (!(bool)$exists->fetchColumn()) continue;
        if ((int)$db->query('SELECT COUNT(*) FROM `' . $table . '`')->fetchColumn() > 0) {
            throw new RuntimeException("Migrarea a fost blocată: tabela {$table} conține deja date operaționale.");
        }
    }
}

function cubisApplySqlFile(PDO $db, string $path): void {
    if (!is_file($path)) throw new RuntimeException('Lipsește schema structurală din pachetul de deployment.');
    $sql = (string)file_get_contents($path);
    $sql = preg_replace('/^\s*--.*$/m', '', $sql) ?? $sql;
    foreach (preg_split('/;\s*(?:\R|$)/', $sql) ?: [] as $statement) {
        $statement = trim($statement);
        if ($statement !== '') $db->exec($statement);
    }
}

/** @return array{database:string,schema_version:int,table_count:int} */
function cubisApplyStructuralMigration(PDO $db, string $databaseName = 'cabitro_cubisshop.ro'): array {
    if ($databaseName !== 'cabitro_cubisshop.ro') {
        throw new RuntimeException('Migrarea acceptă exclusiv baza cabitro_cubisshop.ro.');
    }
    cubisAssertMigrationTarget($db, $databaseName);
    cubisAssertNoOperationalData($db, $databaseName);

    $lock = $db->prepare('SELECT GET_LOCK(?, 15)');
    $lock->execute(['cubisshop-schema-migration']);
    if ((int)$lock->fetchColumn() !== 1) throw new RuntimeException('O altă migrare Cubis este deja în curs.');

    try {
        cubisApplySqlFile($db, cubisMigrationBaselinePath());
        ensureShopSchema($db);
        $db->exec(
            "CREATE TABLE IF NOT EXISTS shop_schema_meta (
                meta_key VARCHAR(80) NOT NULL PRIMARY KEY,
                meta_value VARCHAR(120) NOT NULL,
                updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
        );
        $saveShopVersion = $db->prepare(
            'INSERT INTO shop_schema_meta (meta_key, meta_value) VALUES (?, ?)
             ON DUPLICATE KEY UPDATE meta_value = VALUES(meta_value)'
        );
        $saveShopVersion->execute(['schema_version', (string)CUBIS_SHOP_SCHEMA_VERSION]);
        $saveCrmVersion = $db->prepare('INSERT IGNORE INTO app_migrations (id) VALUES (?)');
        $saveCrmVersion->execute(['20261009_cubis_runtime_schema_v1']);
    } finally {
        $release = $db->prepare('SELECT RELEASE_LOCK(?)');
        $release->execute(['cubisshop-schema-migration']);
    }

    $count = $db->prepare(
        "SELECT COUNT(*) FROM information_schema.tables
         WHERE table_schema = ? AND table_type = 'BASE TABLE'"
    );
    $count->execute([$databaseName]);
    return [
        'database' => $databaseName,
        'schema_version' => CUBIS_SHOP_SCHEMA_VERSION,
        'table_count' => (int)$count->fetchColumn(),
    ];
}

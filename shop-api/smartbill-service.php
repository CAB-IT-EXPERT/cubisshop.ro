<?php
declare(strict_types=1);

require_once __DIR__ . '/order-emails.php';
require_once __DIR__ . '/invoice-service.php';

/**
 * SmartBill V1 + V3 integration for Cubis Shop.
 *
 * Secrets are accepted only through authenticated administration or server
 * environment variables. When entered in administration they are encrypted
 * with a server-only key before being stored in MySQL and are never returned to
 * clients. Read operations and document issuing have separate feature flags so
 * catalog validation can be enabled safely while fiscal issuing remains blocked.
 */
final class CubisSmartBillService
{
    private const V1_BASE_URL = 'https://ws.smartbill.ro/SBORO/api';
    private const V3_BASE_URL = 'https://ws.smartbill.ro/SBORO/api/v3';
    private const MIN_REQUEST_INTERVAL_US = 350000; // below SmartBill's 3 req/s limit
    private const CACHE_TTL_SECONDS = 300;

    /** @var callable|null */
    private static $transport = null;
    private static float $lastRequestAt = 0.0;

    public static function setTransport(?callable $transport): void
    {
        self::$transport = $transport;
        self::$lastRequestAt = 0.0;
    }

    public static function ensureSchema(PDO $db): void
    {
        self::assertCubisDatabase($db);
        $db->exec(
            "CREATE TABLE IF NOT EXISTS shop_smartbill_settings (
                id TINYINT UNSIGNED NOT NULL PRIMARY KEY,
                cif VARCHAR(32) NOT NULL DEFAULT '',
                invoice_series VARCHAR(60) NULL,
                default_warehouse_id VARCHAR(100) NULL,
                default_warehouse_name VARCHAR(180) NULL,
                due_days SMALLINT UNSIGNED NOT NULL DEFAULT 7,
                default_notes TEXT NULL,
                archive_pdf_enabled TINYINT(1) NOT NULL DEFAULT 1,
                issuing_enabled TINYINT(1) NOT NULL DEFAULT 0,
                v1_last_tested_at DATETIME NULL,
                v3_last_tested_at DATETIME NULL,
                last_reference_sync_at DATETIME NULL,
                updated_by VARCHAR(180) NULL,
                updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
        );
        $db->exec("INSERT IGNORE INTO shop_smartbill_settings (id) VALUES (1)");
        if (!self::columnExists($db, 'shop_smartbill_settings', 'archive_pdf_enabled')) {
            $db->exec('ALTER TABLE shop_smartbill_settings ADD COLUMN archive_pdf_enabled TINYINT(1) NOT NULL DEFAULT 1 AFTER default_notes');
        }
        if (!self::columnExists($db, 'shop_smartbill_settings', 'issuing_enabled')) {
            $db->exec('ALTER TABLE shop_smartbill_settings ADD COLUMN issuing_enabled TINYINT(1) NOT NULL DEFAULT 0 AFTER archive_pdf_enabled');
        }
        $db->exec(
            "CREATE TABLE IF NOT EXISTS shop_smartbill_credentials (
                id TINYINT UNSIGNED NOT NULL PRIMARY KEY,
                encrypted_payload LONGTEXT NOT NULL,
                key_fingerprint CHAR(16) NOT NULL,
                updated_by VARCHAR(180) NULL,
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
        );
        $db->exec(
            "CREATE TABLE IF NOT EXISTS shop_smartbill_credential_audit (
                id CHAR(36) NOT NULL PRIMARY KEY,
                action_name VARCHAR(40) NOT NULL,
                actor VARCHAR(180) NULL,
                source_ip_hash CHAR(64) NULL,
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_shop_smartbill_credential_audit_created (created_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
        );
        $db->exec(
            "CREATE TABLE IF NOT EXISTS shop_smartbill_warehouses (
                smartbill_id VARCHAR(100) NOT NULL PRIMARY KEY,
                name VARCHAR(180) NOT NULL,
                is_default TINYINT(1) NOT NULL DEFAULT 0,
                payload_json LONGTEXT NULL,
                synced_at DATETIME NOT NULL,
                INDEX idx_shop_smartbill_warehouses_name (name)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
        );
        $db->exec(
            "CREATE TABLE IF NOT EXISTS shop_smartbill_series (
                series_name VARCHAR(60) NOT NULL PRIMARY KEY,
                next_number VARCHAR(120) NULL,
                previous_next_number VARCHAR(120) NULL,
                next_number_changed_at DATETIME NULL,
                document_type VARCHAR(20) NOT NULL DEFAULT 'f',
                payload_json LONGTEXT NULL,
                synced_at DATETIME NOT NULL,
                INDEX idx_shop_smartbill_series_type (document_type, series_name)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
        );
        if (!self::columnExists($db, 'shop_smartbill_series', 'previous_next_number')) {
            $db->exec('ALTER TABLE shop_smartbill_series ADD COLUMN previous_next_number VARCHAR(120) NULL AFTER next_number');
        }
        if (!self::columnExists($db, 'shop_smartbill_series', 'next_number_changed_at')) {
            $db->exec('ALTER TABLE shop_smartbill_series ADD COLUMN next_number_changed_at DATETIME NULL AFTER previous_next_number');
        }
        $db->exec(
            "CREATE TABLE IF NOT EXISTS shop_smartbill_request_cache (
                cache_key CHAR(64) NOT NULL PRIMARY KEY,
                response_json LONGTEXT NOT NULL,
                expires_at DATETIME NOT NULL,
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_shop_smartbill_cache_expiry (expires_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
        );
        $db->exec(
            "CREATE TABLE IF NOT EXISTS shop_smartbill_invoice_requests (
                id CHAR(36) NOT NULL PRIMARY KEY,
                order_id CHAR(36) NOT NULL,
                request_hash CHAR(64) NOT NULL,
                status VARCHAR(30) NOT NULL DEFAULT 'prepared',
                smartbill_document_id VARCHAR(120) NULL,
                response_json LONGTEXT NULL,
                last_error VARCHAR(500) NULL,
                attempts SMALLINT UNSIGNED NOT NULL DEFAULT 0,
                completed_at DATETIME NULL,
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                UNIQUE INDEX uq_shop_smartbill_invoice_order (order_id),
                INDEX idx_shop_smartbill_invoice_status (status, updated_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
        );
        $db->exec(
            "CREATE TABLE IF NOT EXISTS shop_smartbill_adjustments (
                id CHAR(36) NOT NULL PRIMARY KEY,
                operation_key CHAR(64) NOT NULL,
                order_id CHAR(36) NOT NULL,
                original_invoice_id CHAR(36) NOT NULL,
                operation_type VARCHAR(30) NOT NULL,
                return_scope VARCHAR(20) NOT NULL,
                status VARCHAR(40) NOT NULL,
                request_json LONGTEXT NOT NULL,
                response_json LONGTEXT NULL,
                last_error VARCHAR(500) NULL,
                attempts SMALLINT UNSIGNED NOT NULL DEFAULT 0,
                completed_at DATETIME NULL,
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                UNIQUE INDEX uq_shop_smartbill_adjustment_operation (operation_key),
                INDEX idx_shop_smartbill_adjustment_order (order_id, created_at),
                INDEX idx_shop_smartbill_adjustment_status (status, updated_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
        );

        $productColumns = [
            'smartbill_product_id' => 'VARCHAR(100) NULL AFTER stripe_sync_error',
            'smartbill_sku' => 'VARCHAR(80) NULL AFTER smartbill_product_id',
            'smartbill_warehouse_id' => 'VARCHAR(100) NULL AFTER smartbill_sku',
            'smartbill_warehouse_name' => 'VARCHAR(180) NULL AFTER smartbill_warehouse_id',
            'smartbill_stock_quantity' => 'DECIMAL(18,4) NULL AFTER smartbill_warehouse_name',
            'smartbill_link_status' => "VARCHAR(20) NOT NULL DEFAULT 'unlinked' AFTER smartbill_stock_quantity",
            'smartbill_last_synced_at' => 'DATETIME NULL AFTER smartbill_link_status',
            'smartbill_last_error' => 'VARCHAR(500) NULL AFTER smartbill_last_synced_at',
        ];
        foreach ($productColumns as $column => $definition) {
            if (!self::columnExists($db, 'shop_products', $column)) {
                $db->exec("ALTER TABLE shop_products ADD COLUMN {$column} {$definition}");
            }
        }
        if (!self::indexExists($db, 'shop_products', 'idx_shop_products_smartbill')) {
            $db->exec('ALTER TABLE shop_products ADD INDEX idx_shop_products_smartbill (smartbill_link_status, smartbill_sku)');
        }

        $invoiceColumns = [
            'smartbill_document_id' => 'VARCHAR(120) NULL AFTER spv_submission_id',
            'smartbill_document_url' => 'VARCHAR(500) NULL AFTER smartbill_document_id',
            'smartbill_pdf_url' => 'VARCHAR(500) NULL AFTER smartbill_document_url',
            'smartbill_synced_at' => 'DATETIME NULL AFTER smartbill_pdf_url',
        ];
        foreach ($invoiceColumns as $column => $definition) {
            if (!self::columnExists($db, 'shop_invoices', $column)) {
                $db->exec("ALTER TABLE shop_invoices ADD COLUMN {$column} {$definition}");
            }
        }
        if (!self::indexExists($db, 'shop_invoices', 'uq_shop_invoices_smartbill_document')) {
            $db->exec('ALTER TABLE shop_invoices ADD UNIQUE INDEX uq_shop_invoices_smartbill_document (smartbill_document_id)');
        }
    }

    public static function settings(PDO $db, array $config): array
    {
        $credentialState = self::credentialState($db, $config);
        $config = self::effectiveConfig($db, $config);
        $row = $db->query('SELECT * FROM shop_smartbill_settings WHERE id = 1')->fetch() ?: [];
        $warehouses = $db->query('SELECT smartbill_id AS id, name, is_default, synced_at FROM shop_smartbill_warehouses ORDER BY is_default DESC, name ASC')->fetchAll();
        $series = $db->query('SELECT series_name AS name, next_number, previous_next_number, next_number_changed_at, document_type AS type, synced_at FROM shop_smartbill_series ORDER BY series_name ASC')->fetchAll();
        $warehouseLastSyncedAt = $db->query('SELECT MAX(synced_at) FROM shop_smartbill_warehouses')->fetchColumn();
        $seriesLastSyncedAt = $db->query('SELECT MAX(synced_at) FROM shop_smartbill_series')->fetchColumn();
        $issuingAllowed = !empty($config['smartbill_issuing_enabled']);
        $issuingReady = $issuingAllowed
            && self::v1Configured($config)
            && self::v3Configured($config)
            && !empty($config['smartbill_read_enabled'])
            && !empty($row['v1_last_tested_at'])
            && !empty($row['v3_last_tested_at'])
            && !empty($row['last_reference_sync_at'])
            && trim((string)($row['invoice_series'] ?? '')) !== '';
        $issuingEnabled = $issuingReady && !empty($row['issuing_enabled']);
        return [
            'configured' => self::v1Configured($config) && self::v3Configured($config),
            'v1_configured' => self::v1Configured($config),
            'v3_configured' => self::v3Configured($config),
            'credential_storage_ready' => $credentialState['storage_ready'],
            'credential_source' => $credentialState['source'],
            'v1_email' => self::maskedEmail((string)($config['smartbill_v1_email'] ?? '')),
            'read_enabled' => !empty($config['smartbill_read_enabled']),
            'issuing_allowed' => $issuingAllowed,
            'issuing_ready' => $issuingReady,
            'issuing_enabled' => $issuingEnabled,
            'issuing_block_reason' => self::issuingBlockReason($config, $row, $issuingAllowed, $issuingReady),
            'inventory_authority' => 'smartbill',
            'email_enabled' => !empty($config['smartbill_email_enabled']),
            'cif' => self::maskedCif((string)($config['smartbill_cif'] ?? $row['cif'] ?? '')),
            'invoice_series' => ($row['invoice_series'] ?? null) !== null ? (string)$row['invoice_series'] : null,
            'default_warehouse_id' => ($row['default_warehouse_id'] ?? null) !== null ? (string)$row['default_warehouse_id'] : null,
            'default_warehouse_name' => ($row['default_warehouse_name'] ?? null) !== null ? (string)$row['default_warehouse_name'] : null,
            'due_days' => (int)($row['due_days'] ?? 7),
            'default_notes' => (string)($row['default_notes'] ?? ''),
            'archive_pdf_enabled' => !array_key_exists('archive_pdf_enabled', $row) || !empty($row['archive_pdf_enabled']),
            'v1_last_tested_at' => $row['v1_last_tested_at'] ?? null,
            'v3_last_tested_at' => $row['v3_last_tested_at'] ?? null,
            'last_reference_sync_at' => $row['last_reference_sync_at'] ?? null,
            'auto_sync_enabled' => !empty($config['smartbill_read_enabled']),
            'auto_sync_interval_seconds' => self::autoSyncInterval($config),
            'warehouse_last_synced_at' => $warehouseLastSyncedAt !== false ? $warehouseLastSyncedAt : null,
            'series_last_synced_at' => $seriesLastSyncedAt !== false ? $seriesLastSyncedAt : null,
            'warehouses' => array_map(static fn(array $item): array => [
                'id' => (string)$item['id'],
                'name' => (string)$item['name'],
                'is_default' => (bool)$item['is_default'],
                'synced_at' => (string)$item['synced_at'],
            ], $warehouses),
            'series' => array_map(static fn(array $item): array => [
                'name' => (string)$item['name'],
                'next_number' => $item['next_number'] !== null ? (string)$item['next_number'] : null,
                'previous_next_number' => $item['previous_next_number'] !== null ? (string)$item['previous_next_number'] : null,
                'next_number_changed_at' => $item['next_number_changed_at'] !== null ? (string)$item['next_number_changed_at'] : null,
                'type' => (string)$item['type'],
                'synced_at' => (string)$item['synced_at'],
            ], $series),
            'capabilities' => self::capabilities($row, count($warehouses)),
        ];
    }

    public static function saveCredentials(PDO $db, array $config, array $payload, string $actor, string $sourceIp = ''): array
    {
        if (self::v1Configured($config) && self::v3Configured($config)) {
            throw new RuntimeException('Credențialele sunt administrate prin variabilele de mediu ale serverului și nu pot fi suprascrise din aplicație.');
        }
        $current = self::effectiveConfig($db, $config);
        $email = mb_strtolower(trim((string)($payload['v1_email'] ?? '')));
        $v1Token = trim((string)($payload['v1_token'] ?? ''));
        $v3Token = trim((string)($payload['v3_token'] ?? ''));
        $cif = strtoupper(preg_replace('/\s+/', '', trim((string)($payload['cif'] ?? ''))) ?? '');
        if ($email === '') $email = mb_strtolower(trim((string)($current['smartbill_v1_email'] ?? '')));
        if ($v1Token === '') $v1Token = trim((string)($current['smartbill_v1_token'] ?? ''));
        if ($v3Token === '') $v3Token = trim((string)($current['smartbill_v3_token'] ?? ''));
        if ($cif === '') $cif = strtoupper(trim((string)($current['smartbill_cif'] ?? '')));
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) throw new InvalidArgumentException('Adresa de e-mail SmartBill V1 nu este validă.');
        if (strlen($v1Token) < 16 || strlen($v1Token) > 500 || !preg_match('/^[A-Za-z0-9._-]+$/', $v1Token)) {
            throw new InvalidArgumentException('Tokenul SmartBill V1 nu are un format valid.');
        }
        if (strlen($v3Token) < 32 || strlen($v3Token) > 5000 || !str_starts_with($v3Token, 'sb_') || !preg_match('/^[A-Za-z0-9._-]+$/', $v3Token)) {
            throw new InvalidArgumentException('Tokenul SmartBill V3 nu are un format valid.');
        }
        self::cif(['smartbill_cif' => $cif]);

        $encrypted = self::encryptCredentials($config, [
            'smartbill_v1_email' => $email,
            'smartbill_v1_token' => $v1Token,
            'smartbill_v3_token' => $v3Token,
            'smartbill_cif' => $cif,
        ]);
        $fingerprint = substr(hash('sha256', self::credentialKey($config)), 0, 16);
        $actor = mb_substr(trim($actor), 0, 180);
        $ipHash = $sourceIp === '' ? null : hash('sha256', trim($sourceIp) . '|' . $fingerprint);

        $db->beginTransaction();
        try {
            $save = $db->prepare(
                'INSERT INTO shop_smartbill_credentials (id, encrypted_payload, key_fingerprint, updated_by)
                 VALUES (1, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE encrypted_payload = VALUES(encrypted_payload), key_fingerprint = VALUES(key_fingerprint), updated_by = VALUES(updated_by)'
            );
            $save->execute([$encrypted, $fingerprint, $actor]);
            $db->prepare(
                'UPDATE shop_smartbill_settings
                 SET cif = ?, invoice_series = NULL, issuing_enabled = 0, v1_last_tested_at = NULL,
                     v3_last_tested_at = NULL, last_reference_sync_at = NULL, updated_by = ?
                 WHERE id = 1'
            )->execute([$cif, $actor]);
            $db->exec('DELETE FROM shop_smartbill_request_cache');
            $db->exec('DELETE FROM shop_smartbill_warehouses');
            $db->exec('DELETE FROM shop_smartbill_series');
            $audit = $db->prepare('INSERT INTO shop_smartbill_credential_audit (id, action_name, actor, source_ip_hash) VALUES (?, ?, ?, ?)');
            $audit->execute([self::uuid(), 'credentials_saved', $actor, $ipHash]);
            $db->commit();
        } catch (Throwable $error) {
            if ($db->inTransaction()) $db->rollBack();
            throw $error;
        }

        return self::settings($db, $config);
    }

    public static function listProducts(PDO $db, array $config, string $code = '', string $after = '', int $limit = 50): array
    {
        $config = self::effectiveConfig($db, $config);
        self::assertReadEnabled($config);
        self::assertV3Configured($config);
        $limit = max(1, min(100, $limit));
        $code = mb_substr(trim($code), 0, 80);
        $after = mb_substr(trim($after), 0, 300);
        $query = ['limit' => $limit];
        if ($code !== '') $query['code'] = $code;
        if ($after !== '') $query['after'] = $after;
        $payload = self::v3(
            $db,
            $config,
            'GET',
            '/companies/' . rawurlencode(self::cif($config)) . '/products',
            $query,
            null,
            false
        );
        $items = [];
        foreach (self::collection($payload) as $item) {
            $items[] = [
                'id' => (string)($item['id'] ?? $item['productId'] ?? ''),
                'code' => (string)($item['code'] ?? $item['sku'] ?? ''),
                'name' => (string)($item['name'] ?? ''),
                'type' => (string)($item['type'] ?? $item['productType'] ?? ''),
                'measuring_unit' => (string)($item['measuringUnitName'] ?? $item['measuringUnit'] ?? ''),
            ];
        }
        return [
            'items' => $items,
            'next_cursor' => self::nextCursor($payload),
            'limit' => $limit,
            'read_only' => true,
        ];
    }

    private static function capabilities(array $settings, int $warehouseCount): array
    {
        return [
            'multi_warehouse_invoice' => [
                'status' => 'documented',
                'ready_for_preview' => $warehouseCount > 1,
                'detail' => 'API V1 acceptă warehouseName pe fiecare poziție când useStock=true; validarea live prin emitere este intenționat neexecutată.',
            ],
            'series_numbering' => [
                'status' => 'smartbill_authoritative',
                'detail' => 'Cubis recitește nextNumber din SmartBill și nu incrementează local seria. Facturile manuale sunt observate la următoarea sincronizare.',
                'last_sync_at' => $settings['last_reference_sync_at'] ?? null,
            ],
            'full_reverse' => [
                'status' => 'documented_write_blocked',
                'detail' => 'Endpointul /invoice/reverse permite stornarea integrală; nu este apelat în această etapă.',
            ],
            'partial_reverse' => [
                'status' => 'manual_required',
                'detail' => 'Endpointul documentat nu primește poziții sau cantități; returul parțial rămâne pentru intervenție în SmartBill.',
            ],
            'stock_reentry' => [
                'status' => 'not_guaranteed_by_api_contract',
                'detail' => 'Cubis nu modifică artificial stocul și nu generează NIR. După o corecție fiscală aprobată, reintrarea trebuie verificată în SmartBill.',
            ],
            'goods_receipts_v3' => [
                'status' => 'draft_write_blocked',
                'detail' => 'V3 expune recepții în regim de ciornă; Cubis nu le folosește pentru retur și nu execută operația în această etapă.',
            ],
        ];
    }

    public static function updateSettings(PDO $db, array $config, array $payload, string $actor): array
    {
        $config = self::effectiveConfig($db, $config);
        $series = mb_substr(trim((string)($payload['invoice_series'] ?? '')), 0, 60);
        $warehouseId = mb_substr(trim((string)($payload['default_warehouse_id'] ?? '')), 0, 100);
        $warehouseName = mb_substr(trim((string)($payload['default_warehouse_name'] ?? '')), 0, 180);
        if ($series !== '') {
            $check = $db->prepare('SELECT COUNT(*) FROM shop_smartbill_series WHERE series_name = ? AND document_type = ?');
            $check->execute([$series, 'f']);
            if (!(bool)$check->fetchColumn()) throw new InvalidArgumentException('Seria selectată nu există în lista sincronizată din SmartBill.');
        }
        if ($warehouseId !== '' || $warehouseName !== '') {
            $check = $db->prepare('SELECT smartbill_id, name FROM shop_smartbill_warehouses WHERE smartbill_id = ? OR name = ? LIMIT 1');
            $check->execute([$warehouseId, $warehouseName]);
            $warehouse = $check->fetch();
            if (!$warehouse) throw new InvalidArgumentException('Gestiunea selectată nu există în lista sincronizată din SmartBill.');
            $warehouseId = (string)$warehouse['smartbill_id'];
            $warehouseName = (string)$warehouse['name'];
        }
        $current = $db->query('SELECT * FROM shop_smartbill_settings WHERE id = 1')->fetch() ?: [];
        $requestedIssuing = array_key_exists('issuing_enabled', $payload)
            ? filter_var($payload['issuing_enabled'], FILTER_VALIDATE_BOOLEAN)
            : !empty($current['issuing_enabled']);
        if ($requestedIssuing) {
            $readinessRow = array_merge($current, ['invoice_series' => $series === '' ? null : $series]);
            $issuingAllowed = !empty($config['smartbill_issuing_enabled']);
            $issuingReady = $issuingAllowed
                && self::v1Configured($config)
                && self::v3Configured($config)
                && !empty($config['smartbill_read_enabled'])
                && !empty($readinessRow['v1_last_tested_at'])
                && !empty($readinessRow['v3_last_tested_at'])
                && !empty($readinessRow['last_reference_sync_at'])
                && trim((string)($readinessRow['invoice_series'] ?? '')) !== '';
            if (!$issuingReady) {
                throw new RuntimeException(self::issuingBlockReason($config, $readinessRow, $issuingAllowed, false));
            }
        }
        $stmt = $db->prepare(
            'UPDATE shop_smartbill_settings
             SET cif = ?, invoice_series = ?, default_warehouse_id = ?, default_warehouse_name = ?, due_days = ?, default_notes = ?, archive_pdf_enabled = ?, issuing_enabled = ?, updated_by = ?
             WHERE id = 1'
        );
        $stmt->execute([
            trim((string)($config['smartbill_cif'] ?? '')),
            $series === '' ? null : $series,
            $warehouseId === '' ? null : $warehouseId,
            $warehouseName === '' ? null : $warehouseName,
            max(0, min(365, (int)($payload['due_days'] ?? 7))),
            mb_substr(trim((string)($payload['default_notes'] ?? '')), 0, 4000),
            !array_key_exists('archive_pdf_enabled', $payload) || filter_var($payload['archive_pdf_enabled'], FILTER_VALIDATE_BOOLEAN) ? 1 : 0,
            $requestedIssuing ? 1 : 0,
            mb_substr(trim($actor), 0, 180),
        ]);
        return self::settings($db, $config);
    }

    public static function testV1(PDO $db, array $config): array
    {
        $config = self::effectiveConfig($db, $config);
        self::assertReadEnabled($config);
        self::assertV1Configured($config);
        $result = self::v1($db, $config, 'GET', '/series', ['cif' => self::cif($config), 'type' => 'f'], null, false);
        $db->prepare('UPDATE shop_smartbill_settings SET cif = ?, v1_last_tested_at = NOW() WHERE id = 1')->execute([self::cif($config)]);
        return ['success' => true, 'api' => 'v1', 'series_count' => count((array)($result['list'] ?? [])), 'tested_at' => date('Y-m-d H:i:s')];
    }

    public static function testV3(PDO $db, array $config): array
    {
        $config = self::effectiveConfig($db, $config);
        self::assertReadEnabled($config);
        self::assertV3Configured($config);
        $result = self::v3($db, $config, 'GET', '/companies/' . rawurlencode(self::cif($config)) . '/warehouses', ['limit' => 1], null, false);
        $items = self::collection($result);
        $db->prepare('UPDATE shop_smartbill_settings SET cif = ?, v3_last_tested_at = NOW() WHERE id = 1')->execute([self::cif($config)]);
        return ['success' => true, 'api' => 'v3', 'warehouse_probe_count' => count($items), 'tested_at' => date('Y-m-d H:i:s')];
    }

    public static function syncReferences(PDO $db, array $config): array
    {
        $report = self::autoSyncReferences($db, $config, true);
        $settings = self::settings($db, $config);
        $settings['auto_sync'] = $report;
        return $settings;
    }

    public static function autoSyncReferences(PDO $db, array $config, bool $force = false): array
    {
        $config = self::effectiveConfig($db, $config);
        $interval = self::autoSyncInterval($config);
        $report = [
            'enabled' => !empty($config['smartbill_read_enabled']),
            'automatic' => !$force,
            'interval_seconds' => $interval,
            'v1' => ['status' => 'skipped', 'error' => null],
            'v3' => ['status' => 'skipped', 'error' => null],
        ];
        if (empty($config['smartbill_read_enabled'])) return $report;

        $sources = [
            'v3' => ['configured' => self::v3Configured($config), 'table' => 'shop_smartbill_warehouses', 'callback' => 'syncWarehouses'],
            'v1' => ['configured' => self::v1Configured($config), 'table' => 'shop_smartbill_series', 'callback' => 'syncSeries'],
        ];
        foreach ($sources as $source => $definition) {
            if (!$definition['configured']) {
                $report[$source] = ['status' => 'not_configured', 'error' => null];
                continue;
            }
            if (!$force && self::referencesAreFresh($db, (string)$definition['table'], $interval)) {
                $report[$source] = ['status' => 'fresh', 'error' => null];
                continue;
            }
            $backoff = self::autoSyncBackoff($db, $source);
            if (!$force && $backoff !== null) {
                $report[$source] = ['status' => 'retry_scheduled', 'error' => $backoff];
                continue;
            }
            try {
                $count = self::{$definition['callback']}($db, $config);
                self::clearAutoSyncBackoff($db, $source);
                $report[$source] = ['status' => 'success', 'count' => $count, 'error' => null];
            } catch (Throwable $error) {
                $safe = self::safeError($error->getMessage());
                self::saveAutoSyncBackoff($db, $source, $safe, $interval);
                $report[$source] = ['status' => 'error', 'error' => $safe];
            }
        }

        $warehouseSync = $db->query('SELECT MAX(synced_at) FROM shop_smartbill_warehouses')->fetchColumn();
        $seriesSync = $db->query('SELECT MAX(synced_at) FROM shop_smartbill_series')->fetchColumn();
        if ($warehouseSync !== false && $warehouseSync !== null && $seriesSync !== false && $seriesSync !== null) {
            $db->prepare('UPDATE shop_smartbill_settings SET cif = ?, last_reference_sync_at = NOW() WHERE id = 1')->execute([self::cif($config)]);
        }
        return $report;
    }

    private static function syncWarehouses(PDO $db, array $config): int
    {
        $payload = self::v3($db, $config, 'GET', '/companies/' . rawurlencode(self::cif($config)) . '/warehouses', ['limit' => 100], null, false);
        $warehouses = self::collection($payload);
        $db->beginTransaction();
        try {
            $db->exec('DELETE FROM shop_smartbill_warehouses');
            $insert = $db->prepare('INSERT INTO shop_smartbill_warehouses (smartbill_id, name, payload_json, synced_at) VALUES (?, ?, ?, NOW())');
            $count = 0;
            foreach ($warehouses as $item) {
                $id = trim((string)($item['id'] ?? $item['warehouseId'] ?? ''));
                $name = trim((string)($item['name'] ?? $item['warehouseName'] ?? ''));
                if ($id === '' || $name === '') continue;
                $insert->execute([$id, $name, json_encode($item, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)]);
                $count++;
            }
            $db->prepare('UPDATE shop_smartbill_settings SET cif = ?, v3_last_tested_at = NOW() WHERE id = 1')->execute([self::cif($config)]);
            $db->commit();
            return $count;
        } catch (Throwable $error) {
            if ($db->inTransaction()) $db->rollBack();
            throw $error;
        }
    }

    private static function syncSeries(PDO $db, array $config): int
    {
        $payload = self::v1($db, $config, 'GET', '/series', ['cif' => self::cif($config), 'type' => 'f'], null, false);
        $series = (array)($payload['list'] ?? []);
        $db->beginTransaction();
        try {
            $seen = [];
            $insert = $db->prepare(
                'INSERT INTO shop_smartbill_series (series_name, next_number, previous_next_number, next_number_changed_at, document_type, payload_json, synced_at)
                 VALUES (?, ?, NULL, NULL, ?, ?, NOW())
                 ON DUPLICATE KEY UPDATE
                    previous_next_number = IF(NOT (next_number <=> VALUES(next_number)), next_number, previous_next_number),
                    next_number_changed_at = IF(NOT (next_number <=> VALUES(next_number)), NOW(), next_number_changed_at),
                    next_number = VALUES(next_number), document_type = VALUES(document_type),
                    payload_json = VALUES(payload_json), synced_at = NOW()'
            );
            foreach ($series as $item) {
                $name = trim((string)($item['name'] ?? ''));
                if ($name === '') continue;
                $seen[] = $name;
                $insert->execute([$name, isset($item['nextNumber']) ? (string)$item['nextNumber'] : null, (string)($item['type'] ?? 'f'), json_encode($item, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)]);
            }
            if ($seen) {
                $placeholders = implode(',', array_fill(0, count($seen), '?'));
                $db->prepare("DELETE FROM shop_smartbill_series WHERE series_name NOT IN ({$placeholders})")->execute($seen);
            } else {
                $db->exec('DELETE FROM shop_smartbill_series');
            }
            $db->prepare('UPDATE shop_smartbill_settings SET cif = ?, v1_last_tested_at = NOW() WHERE id = 1')->execute([self::cif($config)]);
            $db->commit();
            return count($seen);
        } catch (Throwable $error) {
            if ($db->inTransaction()) $db->rollBack();
            throw $error;
        }
    }

    private static function autoSyncInterval(array $config): int
    {
        return max(60, min(3600, (int)($config['smartbill_auto_sync_interval'] ?? self::CACHE_TTL_SECONDS)));
    }

    private static function referencesAreFresh(PDO $db, string $table, int $interval): bool
    {
        if (!in_array($table, ['shop_smartbill_warehouses', 'shop_smartbill_series'], true)) return false;
        $last = $db->query("SELECT MAX(synced_at) FROM {$table}")->fetchColumn();
        if ($last === false || $last === null || trim((string)$last) === '') return false;
        $timestamp = strtotime((string)$last);
        return $timestamp !== false && $timestamp >= time() - $interval;
    }

    private static function autoSyncBackoff(PDO $db, string $source): ?string
    {
        $stmt = $db->prepare('SELECT response_json FROM shop_smartbill_request_cache WHERE cache_key = ? AND expires_at > NOW() LIMIT 1');
        $stmt->execute([self::autoSyncCacheKey($source)]);
        $raw = $stmt->fetchColumn();
        if ($raw === false) return null;
        $decoded = json_decode((string)$raw, true);
        return is_array($decoded) ? trim((string)($decoded['error'] ?? 'Reîncercarea automată este programată.')) : 'Reîncercarea automată este programată.';
    }

    private static function saveAutoSyncBackoff(PDO $db, string $source, string $error, int $interval): void
    {
        $save = $db->prepare(
            'INSERT INTO shop_smartbill_request_cache (cache_key, response_json, expires_at) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL ? SECOND))
             ON DUPLICATE KEY UPDATE response_json = VALUES(response_json), expires_at = VALUES(expires_at)'
        );
        $save->execute([
            self::autoSyncCacheKey($source),
            json_encode(['error' => mb_substr($error, 0, 500)], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
            $interval,
        ]);
    }

    private static function clearAutoSyncBackoff(PDO $db, string $source): void
    {
        $db->prepare('DELETE FROM shop_smartbill_request_cache WHERE cache_key = ?')->execute([self::autoSyncCacheKey($source)]);
    }

    private static function autoSyncCacheKey(string $source): string
    {
        return hash('sha256', 'cubis-smartbill-auto-sync|' . $source);
    }

    public static function lookupSku(PDO $db, array $config, string $sku, ?string $warehouseId = null): array
    {
        $config = self::effectiveConfig($db, $config);
        self::assertReadEnabled($config);
        self::assertV3Configured($config);
        $sku = mb_substr(trim($sku), 0, 80);
        if ($sku === '') return ['status' => 'empty', 'sku' => '', 'match' => null];
        $payload = self::v3(
            $db,
            $config,
            'GET',
            '/companies/' . rawurlencode(self::cif($config)) . '/products',
            ['code' => $sku, 'limit' => 100],
            null,
            true
        );
        $exact = [];
        foreach (self::collection($payload) as $item) {
            if ((string)($item['code'] ?? $item['sku'] ?? '') === $sku) $exact[] = $item;
        }
        if (!$exact) return ['status' => 'not_found', 'sku' => $sku, 'match' => null];
        if (count($exact) > 1) return ['status' => 'ambiguous', 'sku' => $sku, 'matches' => count($exact), 'match' => null];
        $product = $exact[0];
        $warehouse = self::resolveWarehouse($db, $warehouseId);
        $stock = $warehouse ? self::stock($db, $config, $sku, (string)$warehouse['name']) : null;
        return [
            'status' => 'verified',
            'sku' => $sku,
            'match' => [
                'id' => (string)($product['id'] ?? $product['productId'] ?? ''),
                'code' => (string)($product['code'] ?? $product['sku'] ?? ''),
                'name' => (string)($product['name'] ?? ''),
                'measuring_unit' => (string)($product['measuringUnitName'] ?? $product['measuringUnit'] ?? ''),
            ],
            'warehouse' => $warehouse,
            'stock' => $stock,
        ];
    }

    public static function linkProduct(PDO $db, array $config, string $productId, array $payload): array
    {
        $productStmt = $db->prepare('SELECT id, sku FROM shop_products WHERE id = ? LIMIT 1');
        $productStmt->execute([$productId]);
        $localProduct = $productStmt->fetch();
        if (!$localProduct) throw new InvalidArgumentException('Produsul Cubis nu există.');
        $sku = trim((string)($payload['sku'] ?? $localProduct['sku'] ?? ''));
        if ($sku === '' || $sku !== trim((string)($localProduct['sku'] ?? ''))) {
            throw new InvalidArgumentException('SKU-ul verificat trebuie să fie identic cu SKU-ul salvat al produsului Cubis.');
        }
        $warehouseId = trim((string)($payload['warehouse_id'] ?? ''));
        if ($warehouseId === '') {
            throw new InvalidArgumentException('Selectează explicit gestiunea SmartBill pentru acest produs.');
        }
        $lookup = self::lookupSku($db, $config, $sku, $warehouseId);
        if (($lookup['status'] ?? '') !== 'verified' || empty($lookup['match']['id'])) {
            throw new InvalidArgumentException('SKU-ul nu poate fi asociat: SmartBill nu a returnat un produs unic cu același cod.');
        }
        $warehouse = $lookup['warehouse'] ?? null;
        if (!$warehouse) throw new InvalidArgumentException('Selectează o gestiune SmartBill înainte de asociere.');
        $stockQuantity = isset($lookup['stock']['quantity']) ? (float)$lookup['stock']['quantity'] : null;
        $update = $db->prepare(
            "UPDATE shop_products
             SET smartbill_product_id = ?, smartbill_sku = ?, smartbill_warehouse_id = ?, smartbill_warehouse_name = ?,
                 smartbill_stock_quantity = ?, stock_quantity = ?, smartbill_link_status = 'linked', smartbill_last_synced_at = NOW(), smartbill_last_error = NULL
             WHERE id = ?"
        );
        $update->execute([
            (string)$lookup['match']['id'],
            $sku,
            (string)$warehouse['id'],
            (string)$warehouse['name'],
            $stockQuantity,
            $stockQuantity === null ? 0 : max(0, (int)floor($stockQuantity)),
            $productId,
        ]);
        return ['success' => true, 'status' => 'linked', 'product_id' => $productId, 'sku' => $sku, 'match' => $lookup['match'], 'warehouse' => $warehouse, 'stock' => $lookup['stock']];
    }

    public static function unlinkProduct(PDO $db, string $productId): array
    {
        $stmt = $db->prepare(
            "UPDATE shop_products SET smartbill_product_id = NULL, smartbill_sku = NULL, smartbill_warehouse_id = NULL,
             smartbill_warehouse_name = NULL, smartbill_stock_quantity = NULL, smartbill_link_status = 'unlinked',
             smartbill_last_synced_at = NULL, smartbill_last_error = NULL WHERE id = ?"
        );
        $stmt->execute([$productId]);
        if ($stmt->rowCount() < 1) throw new InvalidArgumentException('Produsul Cubis nu există sau era deja neasociat.');
        return ['success' => true, 'status' => 'unlinked', 'product_id' => $productId];
    }

    public static function invalidateProductLinkIfSkuChanged(PDO $db, string $productId, string $savedSku): void
    {
        $stmt = $db->prepare(
            "UPDATE shop_products SET smartbill_product_id = NULL, smartbill_sku = NULL, smartbill_stock_quantity = NULL,
             smartbill_link_status = 'stale', smartbill_last_synced_at = NULL,
             smartbill_last_error = 'SKU-ul Cubis a fost modificat; asocierea SmartBill trebuie reverificată.'
             WHERE id = ? AND smartbill_product_id IS NOT NULL AND BINARY COALESCE(smartbill_sku, '') <> BINARY ?"
        );
        $stmt->execute([$productId, $savedSku]);
    }

    public static function stock(PDO $db, array $config, string $sku, string $warehouseName, bool $fresh = false): array
    {
        $config = self::effectiveConfig($db, $config);
        self::assertReadEnabled($config);
        self::assertV1Configured($config);
        $sku = trim($sku);
        $warehouseName = trim($warehouseName);
        if ($sku === '' || $warehouseName === '') throw new InvalidArgumentException('SKU-ul și gestiunea sunt obligatorii pentru verificarea stocului.');
        $payload = self::v1($db, $config, 'GET', '/stocks', [
            'cif' => self::cif($config),
            'date' => date('Y-m-d'),
            'warehouseName' => $warehouseName,
            'productCode' => $sku,
        ], null, !$fresh);
        $rows = (array)($payload['list'] ?? $payload['stocks'] ?? []);
        $quantity = 0.0;
        $found = false;
        foreach ($rows as $row) {
            if (!is_array($row)) continue;
            $warehouse = (string)($row['warehouse']['warehouseName'] ?? $row['warehouseName'] ?? '');
            if ($warehouse !== $warehouseName) continue;
            $products = isset($row['products']) && is_array($row['products']) ? $row['products'] : [$row];
            foreach ($products as $product) {
                if (!is_array($product)) continue;
                $code = (string)($product['productCode'] ?? $product['code'] ?? '');
                if ($code !== $sku) continue;
                $quantity += (float)($product['quantity'] ?? $product['stock'] ?? 0);
                $found = true;
            }
        }
        return ['sku' => $sku, 'warehouse_name' => $warehouseName, 'quantity' => $quantity, 'found' => $found, 'checked_at' => date('Y-m-d H:i:s')];
    }

    public static function previewInvoice(PDO $db, array $config, string $orderId): array
    {
        $config = self::effectiveConfig($db, $config);
        self::autoSyncReferences($db, $config, false);
        $built = self::buildInvoicePayload($db, $config, $orderId);
        $settings = self::settings($db, $config);
        return [
            'ready' => true,
            'issuing_enabled' => !empty($settings['issuing_enabled']),
            'order_id' => $orderId,
            'series' => (string)$built['payload']['seriesName'],
            'line_count' => count((array)$built['payload']['products']),
            'warehouse_names' => array_values(array_unique(array_map(static fn(array $line): string => (string)($line['warehouseName'] ?? ''), (array)$built['payload']['products']))),
            'payment_included' => isset($built['payload']['payment']),
            'request_hash' => hash('sha256', json_encode($built['payload'], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)),
            'payload' => $built['payload'],
        ];
    }

    public static function issueInvoice(PDO $db, array $config, string $orderId, array $actor): array
    {
        $config = self::effectiveConfig($db, $config);
        $referenceSync = self::autoSyncReferences($db, $config, true);
        foreach (['v1', 'v3'] as $source) {
            $status = (string)($referenceSync[$source]['status'] ?? 'error');
            if (!in_array($status, ['success', 'fresh'], true)) {
                $detail = trim((string)($referenceSync[$source]['error'] ?? ''));
                throw new RuntimeException('Emiterea a fost blocată: sincronizarea ' . strtoupper($source) . ' nu a reușit' . ($detail !== '' ? ' (' . $detail . ')' : '.') );
            }
        }
        self::assertIssuingEnabled($db, $config);
        self::assertReadEnabled($config);
        self::assertV1Configured($config);
        $built = self::buildInvoicePayload($db, $config, $orderId);
        $payload = $built['payload'];
        $existingInvoice = $db->prepare('SELECT id, series, invoice_number, smartbill_document_id FROM shop_invoices WHERE order_id = ? AND invoice_type = ? LIMIT 1');
        $existingInvoice->execute([$orderId, 'invoice']);
        $existingInvoiceRow = $existingInvoice->fetch();
        if ($existingInvoiceRow) {
            if (trim((string)($existingInvoiceRow['smartbill_document_id'] ?? '')) === '') {
                throw new RuntimeException('Comanda are deja o factură istorică locală. Emiterea SmartBill este blocată pentru a evita două documente fiscale pentru aceeași comandă.');
            }
            return [
                'id' => (string)$existingInvoiceRow['id'],
                'display_number' => trim((string)$existingInvoiceRow['series'] . ' ' . (string)$existingInvoiceRow['invoice_number']),
                'existing' => true,
                'smartbill' => [],
            ];
        }
        $stockBefore = self::validateInvoiceStock($db, $config, $payload);
        $hash = hash('sha256', json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
        $requestId = self::uuid();
        $response = null;
        $recoveredExternalResponse = false;

        $db->beginTransaction();
        try {
            $existing = $db->prepare('SELECT * FROM shop_smartbill_invoice_requests WHERE order_id = ? FOR UPDATE');
            $existing->execute([$orderId]);
            $request = $existing->fetch();
            if ($request && (string)$request['status'] === 'completed') {
                $decoded = json_decode((string)$request['response_json'], true);
                $invoice = $db->prepare('SELECT id, series, invoice_number FROM shop_invoices WHERE order_id = ? AND invoice_type = ? LIMIT 1');
                $invoice->execute([$orderId, 'invoice']);
                $invoiceRow = $invoice->fetch() ?: [];
                $db->commit();
                return ['id' => (string)($invoiceRow['id'] ?? ''), 'display_number' => trim((string)($invoiceRow['series'] ?? '') . ' ' . (string)($invoiceRow['invoice_number'] ?? '')), 'existing' => true, 'smartbill' => is_array($decoded) ? $decoded : []];
            }
            if ($request && (string)$request['request_hash'] !== $hash) {
                throw new RuntimeException('Cererea SmartBill existentă nu mai corespunde comenzii. Revizuiește manual înainte de reîncercare.');
            }
            if (!$request) {
                $db->prepare('INSERT INTO shop_smartbill_invoice_requests (id, order_id, request_hash, status, attempts) VALUES (?, ?, ?, ?, 1)')
                    ->execute([$requestId, $orderId, $hash, 'sending']);
            } else {
                $requestId = (string)$request['id'];
            }
            if ($request && (string)$request['status'] === 'external_success') {
                $decoded = json_decode((string)($request['response_json'] ?? ''), true);
                if (!is_array($decoded) || trim((string)($decoded['series'] ?? '')) === '' || trim((string)($decoded['number'] ?? '')) === '') {
                    throw new RuntimeException('Răspunsul SmartBill salvat pentru recuperare este incomplet; este necesară verificarea manuală.');
                }
                $response = $decoded;
                $recoveredExternalResponse = true;
            } elseif ($request && (string)$request['status'] === 'sending') {
                throw new RuntimeException('Emiterea SmartBill pentru această comandă este deja în curs sau are un rezultat extern incert. Verifică documentele SmartBill înainte de orice reîncercare.');
            } elseif ($request) {
                $db->prepare("UPDATE shop_smartbill_invoice_requests SET status = 'sending', attempts = attempts + 1, last_error = NULL WHERE id = ?")->execute([$requestId]);
            }
            $db->commit();
        } catch (Throwable $error) {
            if ($db->inTransaction()) $db->rollBack();
            throw $error;
        }

        try {
            if ($response === null) {
                $response = self::v1($db, $config, 'POST', '/invoice/v2', [], $payload, false);
                $externalError = trim((string)($response['errorText'] ?? ''));
                if ($externalError !== '') {
                    $response = null;
                    throw new RuntimeException('SmartBill: ' . self::safeError($externalError));
                }
                $db->prepare("UPDATE shop_smartbill_invoice_requests
                              SET status = 'external_success', smartbill_document_id = ?, response_json = ?, last_error = NULL
                              WHERE id = ?")
                    ->execute([
                        trim((string)($response['documentId'] ?? $response['id'] ?? '')) ?: null,
                        json_encode(self::publicInvoiceResponse($response), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
                        $requestId,
                    ]);
            }
            $series = trim((string)($response['series'] ?? $payload['seriesName'] ?? ''));
            $number = trim((string)($response['number'] ?? ''));
            $documentId = trim((string)($response['documentId'] ?? $response['id'] ?? ''));
            if ($series === '' || $number === '') throw new RuntimeException('SmartBill nu a returnat seria și numărul facturii.');
            $invoiceId = self::persistIssuedInvoice($db, $built['order'], $payload, $response, $actor, $requestId, $documentId, $series, $number);
            $stockVerification = self::verifyInvoiceStockAfterIssue($db, $config, $invoiceId, $stockBefore);
            $archive = self::archiveIssuedInvoiceIfEnabled($db, $config, $invoiceId);
            $publicResponse = self::publicInvoiceResponse($response);
            $publicResponse['stock_verification'] = $stockVerification;
            $publicResponse['pdf_archive'] = $archive;
            return [
                'id' => $invoiceId,
                'display_number' => trim($series . ' ' . $number),
                'existing' => $recoveredExternalResponse,
                'recovered_external_response' => $recoveredExternalResponse,
                'smartbill' => $publicResponse,
            ];
        } catch (Throwable $error) {
            $safe = self::safeError($error->getMessage());
            if ($response === null) {
                $db->prepare("UPDATE shop_smartbill_invoice_requests SET status = 'error', last_error = ? WHERE id = ?")->execute([$safe, $requestId]);
            } else {
                // The external invoice may already exist. Keep the recoverable
                // response so a retry persists locally without issuing again.
                $db->prepare("UPDATE shop_smartbill_invoice_requests SET status = 'external_success', last_error = ? WHERE id = ?")->execute([$safe, $requestId]);
            }
            throw $error;
        }
    }

    public static function downloadInvoicePdf(PDO $db, array $config, string $invoiceId): array
    {
        $config = self::effectiveConfig($db, $config);
        $invoice = self::invoice($db, $invoiceId);
        $stored = self::archiveInvoicePdf($db, $config, $invoice, false);
        $bytes = file_get_contents((string)$stored['path']);
        if (!is_string($bytes) || !str_starts_with($bytes, '%PDF-')) {
            throw new RuntimeException('PDF-ul original SmartBill arhivat nu a putut fi citit.');
        }
        return [
            'file_name' => (string)$stored['file_name'],
            'mime_type' => 'application/pdf',
            'content_base64' => base64_encode($bytes),
            'public_url' => (string)$stored['public_url'],
            'stored' => true,
            'provider' => 'smartbill',
        ];
    }

    public static function publicInvoiceLink(PDO $db, array $config, string $invoiceId): array
    {
        $config = self::effectiveConfig($db, $config);
        $invoice = self::invoice($db, $invoiceId);
        $stored = self::archiveInvoicePdf($db, $config, $invoice, false);
        return [
            'url' => (string)$stored['public_url'],
            'file_name' => (string)$stored['file_name'],
            'mime_type' => 'application/pdf',
            'format' => 'pdf',
            'provider' => 'smartbill',
        ];
    }

    public static function sendInvoiceEmail(PDO $db, array $config, string $invoiceId): array
    {
        $config = self::effectiveConfig($db, $config);
        if (empty($config['smartbill_email_enabled'])) {
            throw new RuntimeException('Trimiterea e-mailurilor SmartBill este dezactivată server-side.');
        }
        self::assertV1Configured($config);
        $invoice = self::invoice($db, $invoiceId);
        $recipient = mb_strtolower(trim((string)($invoice['customer_email'] ?? '')));
        if (!filter_var($recipient, FILTER_VALIDATE_EMAIL)) {
            throw new InvalidArgumentException('Comanda nu are o adresă de e-mail validă.');
        }
        try {
            $stored = self::archiveInvoicePdf($db, $config, $invoice, false);
            $pdf = file_get_contents((string)$stored['path']);
            if (!is_string($pdf) || !str_starts_with($pdf, '%PDF-')) {
                throw new RuntimeException('PDF-ul SmartBill arhivat nu a putut fi citit pentru e-mail.');
            }
            $email = GtrotsInvoiceService::buildEmail($invoice, $config);
            gtSmtpSend($config, $recipient, (string)$email['subject'], (string)$email['html'], [[
                'file_name' => (string)$stored['file_name'],
                'mime_type' => 'application/pdf',
                'content' => $pdf,
            ]]);
            $db->prepare('UPDATE shop_invoices SET email_sent_at = NOW(), email_last_error = NULL WHERE id = ?')->execute([(string)$invoice['id']]);
            return ['sent' => true, 'recipient' => $recipient, 'provider' => 'cubis_smtp', 'document_provider' => 'smartbill'];
        } catch (Throwable $error) {
            $safe = self::safeError($error->getMessage());
            $db->prepare('UPDATE shop_invoices SET email_last_error = ? WHERE id = ?')->execute([$safe, (string)$invoice['id']]);
            throw new RuntimeException($safe, (int)$error->getCode(), $error);
        }
    }

    public static function sendInvoiceEmailOnce(PDO $db, array $config, string $invoiceId): array
    {
        $invoiceId = trim($invoiceId);
        if ($invoiceId === '') throw new InvalidArgumentException('Factura nu a fost selectată.');
        $driver = strtolower((string)$db->getAttribute(PDO::ATTR_DRIVER_NAME));
        $lockName = 'cubis-smartbill-email-' . preg_replace('/[^a-zA-Z0-9-]/', '', $invoiceId);
        $locked = false;
        if ($driver !== 'sqlite') {
            $lock = $db->prepare('SELECT GET_LOCK(?, 15)');
            $lock->execute([$lockName]);
            $locked = (int)$lock->fetchColumn() === 1;
            if (!$locked) return ['sent' => false, 'error' => 'Trimiterea facturii este deja în curs.'];
        }
        try {
            $invoice = self::invoice($db, $invoiceId);
            if (!empty($invoice['email_sent_at'])) {
                return ['sent' => true, 'recipient' => (string)$invoice['customer_email'], 'skipped' => true, 'already_sent' => true, 'provider' => 'smartbill'];
            }
            return self::sendInvoiceEmail($db, $config, $invoiceId);
        } finally {
            if ($locked) {
                $release = $db->prepare('SELECT RELEASE_LOCK(?)');
                $release->execute([$lockName]);
            }
        }
    }

    /**
     * Records the required SmartBill correction without changing local
     * accounting stock. Full reversals are queued for an explicit admin action;
     * partial returns remain manual because the documented reverse endpoint has
     * no line/quantity selection.
     */
    public static function prepareReturnAdjustment(PDO $db, array $config, string $orderId, string $operationType, string $reason): array
    {
        if (empty($config['smartbill_inventory_authority'])) {
            throw new RuntimeException('Autoritatea de gestiune SmartBill nu este activă.');
        }
        $operationType = $operationType === 'cancellation' ? 'cancellation' : 'return';
        $orderStmt = $db->prepare('SELECT * FROM shop_orders WHERE id = ? LIMIT 1');
        $orderStmt->execute([$orderId]);
        $order = $orderStmt->fetch();
        if (!$order) throw new InvalidArgumentException('Comanda nu există.');
        $invoiceStmt = $db->prepare("SELECT * FROM shop_invoices WHERE order_id = ? AND invoice_type = 'invoice' LIMIT 1");
        $invoiceStmt->execute([$orderId]);
        $invoice = $invoiceStmt->fetch();
        if (!$invoice) {
            return ['required' => false, 'status' => 'not_required', 'message' => 'Comanda nu are factură emisă.'];
        }

        $scope = $operationType === 'cancellation' || !empty($order['return_is_full']) ? 'full' : 'partial';
        $lines = self::adjustmentLines($db, $orderId, $scope);
        $providerInvoice = trim((string)($invoice['smartbill_document_id'] ?? '')) !== '' || (string)($invoice['theme'] ?? '') === 'smartbill';
        $status = $scope === 'full' && $providerInvoice ? 'awaiting_approval' : 'manual_required';
        $message = $status === 'awaiting_approval'
            ? 'Stornarea integrală SmartBill este pregătită și așteaptă aprobarea explicită a administratorului.'
            : ($scope === 'partial'
                ? 'Returul parțial necesită intervenție în SmartBill: endpointul documentat de stornare nu acceptă poziții sau cantități parțiale.'
                : 'Factura nu are o identitate SmartBill verificabilă; corecția necesită intervenție manuală în SmartBill.');
        $request = [
            'order_id' => $orderId,
            'order_number' => (string)($order['order_number'] ?? ''),
            'operation_type' => $operationType,
            'return_scope' => $scope,
            'reason' => mb_substr(trim($reason), 0, 1000),
            'original_invoice' => [
                'id' => (string)$invoice['id'],
                'series' => (string)$invoice['series'],
                'number' => (string)$invoice['invoice_number'],
                'issue_date' => (string)$invoice['issue_date'],
                'smartbill_document_id' => (string)($invoice['smartbill_document_id'] ?? ''),
            ],
            'lines' => $lines,
        ];
        $operationKey = hash('sha256', implode('|', [$operationType, $orderId, (string)$invoice['id'], $scope]));
        $id = self::uuid();
        $encoded = json_encode($request, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
        if (strtolower((string)$db->getAttribute(PDO::ATTR_DRIVER_NAME)) === 'sqlite') {
            $db->prepare('INSERT OR IGNORE INTO shop_smartbill_adjustments (id, operation_key, order_id, original_invoice_id, operation_type, return_scope, status, request_json, last_error) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
                ->execute([$id, $operationKey, $orderId, (string)$invoice['id'], $operationType, $scope, $status, $encoded, $status === 'manual_required' ? $message : null]);
        } else {
            $db->prepare('INSERT IGNORE INTO shop_smartbill_adjustments (id, operation_key, order_id, original_invoice_id, operation_type, return_scope, status, request_json, last_error) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
                ->execute([$id, $operationKey, $orderId, (string)$invoice['id'], $operationType, $scope, $status, $encoded, $status === 'manual_required' ? $message : null]);
        }
        $stmt = $db->prepare('SELECT * FROM shop_smartbill_adjustments WHERE operation_key = ? LIMIT 1');
        $stmt->execute([$operationKey]);
        $row = $stmt->fetch() ?: [];
        return self::publicAdjustment($row, $message);
    }

    public static function processReturnAdjustment(PDO $db, array $config, string $adjustmentId): array
    {
        $config = self::effectiveConfig($db, $config);
        self::assertIssuingEnabled($db, $config);
        $suffix = strtolower((string)$db->getAttribute(PDO::ATTR_DRIVER_NAME)) === 'sqlite' ? '' : ' FOR UPDATE';
        $db->beginTransaction();
        try {
            $stmt = $db->prepare('SELECT * FROM shop_smartbill_adjustments WHERE id = ? LIMIT 1' . $suffix);
            $stmt->execute([$adjustmentId]);
            $job = $stmt->fetch();
            if (!$job) throw new InvalidArgumentException('Corecția SmartBill nu există.');
            if (in_array((string)$job['status'], ['completed_verified', 'external_success_stock_unverified'], true)) {
                $db->commit();
                return self::publicAdjustment($job);
            }
            if ((string)$job['return_scope'] !== 'full') {
                throw new RuntimeException('Returul parțial nu poate fi emis automat prin endpointul SmartBill de stornare integrală.');
            }
            if ((string)$job['status'] === 'sending') {
                throw new RuntimeException('Rezultatul extern al stornării este incert. Verifică SmartBill înainte de orice reîncercare.');
            }
            $request = json_decode((string)$job['request_json'], true, 512, JSON_THROW_ON_ERROR);
            $before = self::adjustmentStockSnapshot($db, $config, (array)($request['lines'] ?? []));
            $request['_stock_before'] = $before;
            $db->prepare("UPDATE shop_smartbill_adjustments SET status = 'sending', attempts = attempts + 1, request_json = ?, last_error = NULL WHERE id = ?")
                ->execute([json_encode($request, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR), $adjustmentId]);
            $db->commit();
        } catch (Throwable $error) {
            if ($db->inTransaction()) $db->rollBack();
            throw $error;
        }

        $response = null;
        try {
            $original = (array)($request['original_invoice'] ?? []);
            $response = self::v1($db, $config, 'POST', '/invoice/reverse', [], [
                'companyVatCode' => self::cif($config),
                'seriesName' => (string)($original['series'] ?? ''),
                'number' => (string)($original['number'] ?? ''),
                'issueDate' => date('Y-m-d'),
            ], false);
            $externalError = trim((string)($response['errorText'] ?? ''));
            if ($externalError !== '') throw new RuntimeException('SmartBill: ' . self::safeError($externalError));
            $after = self::adjustmentStockSnapshot($db, $config, (array)($request['lines'] ?? []));
            $verified = self::verifyAdjustmentStockIncrease((array)($request['_stock_before'] ?? []), $after);
            $status = $verified ? 'completed_verified' : 'external_success_stock_unverified';
            $safeResponse = self::publicInvoiceResponse($response);
            $safeResponse['stock_before'] = $request['_stock_before'] ?? [];
            $safeResponse['stock_after'] = $after;
            $safeResponse['stock_reentry_verified'] = $verified;
            $error = $verified ? null : 'Documentul a fost stornat în SmartBill, dar reintrarea în stoc nu a putut fi confirmată prin API. Verificare manuală necesară.';
            $db->prepare('UPDATE shop_smartbill_adjustments SET status = ?, response_json = ?, last_error = ?, completed_at = NOW() WHERE id = ?')
                ->execute([$status, json_encode($safeResponse, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), $error, $adjustmentId]);
            $stmt = $db->prepare('SELECT * FROM shop_smartbill_adjustments WHERE id = ? LIMIT 1');
            $stmt->execute([$adjustmentId]);
            return self::publicAdjustment($stmt->fetch() ?: []);
        } catch (Throwable $error) {
            $safe = self::safeError($error->getMessage());
            $status = $response === null ? 'manual_required' : 'external_success_stock_unverified';
            $db->prepare('UPDATE shop_smartbill_adjustments SET status = ?, response_json = ?, last_error = ? WHERE id = ?')
                ->execute([$status, $response ? json_encode(self::publicInvoiceResponse($response), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) : null, $safe, $adjustmentId]);
            throw new RuntimeException($safe, (int)$error->getCode(), $error);
        }
    }

    public static function listAdjustments(PDO $db, ?string $orderId = null): array
    {
        if ($orderId !== null && trim($orderId) !== '') {
            $stmt = $db->prepare('SELECT * FROM shop_smartbill_adjustments WHERE order_id = ? ORDER BY created_at DESC');
            $stmt->execute([trim($orderId)]);
        } else {
            $stmt = $db->query('SELECT * FROM shop_smartbill_adjustments ORDER BY created_at DESC LIMIT 200');
        }
        return array_map(static fn(array $row): array => self::publicAdjustment($row), $stmt->fetchAll());
    }

    private static function validateInvoiceStock(PDO $db, array $config, array $payload): array
    {
        $required = [];
        foreach ((array)($payload['products'] ?? []) as $line) {
            if (!is_array($line) || !empty($line['isService'])) continue;
            $sku = trim((string)($line['code'] ?? ''));
            $warehouse = trim((string)($line['warehouseName'] ?? ''));
            $quantity = max(0.0, (float)($line['quantity'] ?? 0));
            if ($sku === '' || $warehouse === '' || $quantity <= 0) {
                throw new InvalidArgumentException('Fiecare produs facturabil trebuie să aibă SKU, gestiune și cantitate valide.');
            }
            $key = $warehouse . "\0" . $sku;
            if (!isset($required[$key])) $required[$key] = ['sku' => $sku, 'warehouse_name' => $warehouse, 'requested_quantity' => 0.0];
            $required[$key]['requested_quantity'] += $quantity;
        }
        $result = [];
        foreach ($required as $item) {
            $stock = self::stock($db, $config, (string)$item['sku'], (string)$item['warehouse_name'], true);
            if (empty($stock['found'])) {
                throw new RuntimeException('Produsul ' . $item['sku'] . ' nu are stoc identificabil în gestiunea SmartBill ' . $item['warehouse_name'] . '.');
            }
            if ((float)$stock['quantity'] + 0.0001 < (float)$item['requested_quantity']) {
                throw new RuntimeException('Stoc SmartBill insuficient pentru ' . $item['sku'] . ' în ' . $item['warehouse_name'] . '. Disponibil: ' . $stock['quantity'] . ', necesar: ' . $item['requested_quantity'] . '.');
            }
            $db->prepare('UPDATE shop_products SET smartbill_stock_quantity = ?, stock_quantity = ?, smartbill_last_synced_at = NOW(), smartbill_last_error = NULL WHERE BINARY smartbill_sku = BINARY ? AND BINARY smartbill_warehouse_name = BINARY ?')
                ->execute([(float)$stock['quantity'], max(0, (int)floor((float)$stock['quantity'])), (string)$item['sku'], (string)$item['warehouse_name']]);
            $result[] = array_merge($item, ['before_quantity' => (float)$stock['quantity']]);
        }
        return $result;
    }

    private static function verifyInvoiceStockAfterIssue(PDO $db, array $config, string $invoiceId, array $before): array
    {
        $lines = [];
        $verified = true;
        foreach ($before as $item) {
            try {
                $stock = self::stock($db, $config, (string)$item['sku'], (string)$item['warehouse_name'], true);
                $expectedMaximum = (float)$item['before_quantity'] - (float)$item['requested_quantity'];
                $lineVerified = !empty($stock['found']) && (float)$stock['quantity'] <= $expectedMaximum + 0.0001;
                $verified = $verified && $lineVerified;
                $lines[] = array_merge($item, [
                    'after_quantity' => (float)$stock['quantity'],
                    'expected_maximum' => $expectedMaximum,
                    'verified' => $lineVerified,
                ]);
                $db->prepare('UPDATE shop_products SET smartbill_stock_quantity = ?, stock_quantity = ?, smartbill_last_synced_at = NOW(), smartbill_last_error = ? WHERE BINARY smartbill_sku = BINARY ? AND BINARY smartbill_warehouse_name = BINARY ?')
                    ->execute([(float)$stock['quantity'], max(0, (int)floor((float)$stock['quantity'])), $lineVerified ? null : 'Descărcarea SmartBill necesită verificare manuală.', (string)$item['sku'], (string)$item['warehouse_name']]);
            } catch (Throwable $error) {
                $verified = false;
                $lines[] = array_merge($item, ['verified' => false, 'error' => self::safeError($error->getMessage())]);
            }
        }
        $result = ['verified' => $verified, 'checked_at' => date('Y-m-d H:i:s'), 'lines' => $lines];
        try {
            self::recordInvoiceMetadata($db, $invoiceId, 'stock_verification', $result);
        } catch (Throwable $error) {
            error_log('[Cubis SmartBill stock audit] ' . self::safeError($error->getMessage()));
        }
        return $result;
    }

    private static function archiveIssuedInvoiceIfEnabled(PDO $db, array $config, string $invoiceId): array
    {
        $settings = $db->query('SELECT archive_pdf_enabled FROM shop_smartbill_settings WHERE id = 1')->fetch() ?: [];
        if (array_key_exists('archive_pdf_enabled', $settings) && empty($settings['archive_pdf_enabled'])) {
            return ['enabled' => false, 'archived' => false];
        }
        try {
            $stored = self::archiveInvoicePdf($db, $config, self::invoice($db, $invoiceId), false);
            return ['enabled' => true, 'archived' => true, 'url' => (string)$stored['public_url']];
        } catch (Throwable $error) {
            $result = ['enabled' => true, 'archived' => false, 'error' => self::safeError($error->getMessage())];
            try {
                self::recordInvoiceMetadata($db, $invoiceId, 'pdf_archive', $result);
            } catch (Throwable $metadataError) {
                error_log('[Cubis SmartBill PDF audit] ' . self::safeError($metadataError->getMessage()));
            }
            return $result;
        }
    }

    private static function buildInvoicePayload(PDO $db, array $config, string $orderId): array
    {
        $orderStmt = $db->prepare('SELECT * FROM shop_orders WHERE id = ? LIMIT 1');
        $orderStmt->execute([$orderId]);
        $order = $orderStmt->fetch();
        if (!$order) throw new InvalidArgumentException('Comanda nu există.');
        if (in_array((string)$order['status'], ['cancelled', 'refunded'], true)) throw new InvalidArgumentException('Comanda anulată sau rambursată nu poate fi facturată.');
        $settings = $db->query('SELECT * FROM shop_smartbill_settings WHERE id = 1')->fetch() ?: [];
        $series = trim((string)($settings['invoice_series'] ?? ''));
        if ($series === '') throw new InvalidArgumentException('Selectează seria de factură SmartBill.');
        $itemsStmt = $db->prepare(
            'SELECT oi.*, p.unit_of_measure, p.smartbill_product_id, p.smartbill_sku, p.smartbill_warehouse_id,
                    p.smartbill_warehouse_name, p.smartbill_link_status
             FROM shop_order_items oi
             LEFT JOIN shop_products p ON p.id = oi.product_id
             WHERE oi.order_id = ? ORDER BY oi.id ASC'
        );
        $itemsStmt->execute([$orderId]);
        $items = $itemsStmt->fetchAll();
        if (!$items) throw new InvalidArgumentException('Comanda nu conține produse.');
        $vatRate = max(0.0, (float)($order['vat_rate'] ?? 0));
        $products = [];
        foreach ($items as $item) {
            if ((string)($item['smartbill_link_status'] ?? '') !== 'linked'
                || trim((string)($item['smartbill_product_id'] ?? '')) === ''
                || trim((string)($item['smartbill_sku'] ?? '')) === ''
                || trim((string)($item['smartbill_warehouse_name'] ?? '')) === '') {
                throw new InvalidArgumentException('Toate produsele comenzii trebuie asociate explicit cu produsul și gestiunea SmartBill.');
            }
            if ((string)($item['smartbill_sku'] ?? '') !== (string)($item['product_sku'] ?? '')) {
                throw new InvalidArgumentException('SKU-ul unei poziții nu mai corespunde asocierii SmartBill salvate.');
            }
            $unitPrice = (float)($item['discounted_unit_price'] ?? 0) > 0
                ? (float)$item['discounted_unit_price']
                : (float)$item['unit_price'];
            $products[] = [
                'name' => (string)$item['product_name'],
                'code' => (string)$item['smartbill_sku'],
                'isDiscount' => false,
                'measuringUnitName' => trim((string)($item['unit_of_measure'] ?? '')) ?: 'buc',
                'currency' => strtoupper(trim((string)($order['currency'] ?? 'RON'))) ?: 'RON',
                'quantity' => (float)$item['quantity'],
                'price' => round($unitPrice, 2),
                'isTaxIncluded' => true,
                'taxName' => $vatRate > 0 ? 'Normala' : 'Scutit',
                'taxPercentage' => $vatRate,
                'warehouseName' => (string)$item['smartbill_warehouse_name'],
                'isService' => false,
                'saveToDb' => false,
                'useSBProductName' => true,
            ];
        }
        if ((float)($order['shipping_cost'] ?? 0) > 0) {
            $products[] = [
                'name' => (string)($order['shipping_method_name'] ?? 'Transport'),
                'code' => 'TRANSPORT',
                'isDiscount' => false,
                'measuringUnitName' => 'buc',
                'currency' => strtoupper(trim((string)($order['currency'] ?? 'RON'))) ?: 'RON',
                'quantity' => 1,
                'price' => round((float)$order['shipping_cost'], 2),
                'isTaxIncluded' => true,
                'taxName' => $vatRate > 0 ? 'Normala' : 'Scutit',
                'taxPercentage' => $vatRate,
                'isService' => true,
                'saveToDb' => false,
            ];
        }
        $issueDate = date('Y-m-d');
        $payload = [
            'companyVatCode' => self::cif($config),
            'client' => [
                'name' => trim((string)($order['company_name'] ?? '')) ?: (string)$order['customer_name'],
                'vatCode' => trim((string)($order['company_cui'] ?? '')),
                'regCom' => trim((string)($order['company_registration_number'] ?? '')),
                'address' => trim((string)($order['company_address'] ?? '')) ?: (string)$order['address'],
                'isTaxPayer' => trim((string)($order['company_cui'] ?? '')) !== '',
                'city' => (string)$order['city'],
                'county' => (string)($order['county'] ?? ''),
                'country' => 'România',
                'email' => (string)($order['customer_email'] ?? ''),
                'phone' => (string)$order['customer_phone'],
                'saveToDb' => false,
            ],
            'issueDate' => $issueDate,
            'seriesName' => $series,
            'isDraft' => false,
            'dueDate' => date('Y-m-d', strtotime($issueDate . ' +' . max(0, min(365, (int)($settings['due_days'] ?? 7))) . ' days')),
            'deliveryDate' => $issueDate,
            'currency' => strtoupper(trim((string)($order['currency'] ?? 'RON'))) ?: 'RON',
            'language' => 'RO',
            'precision' => 2,
            'useStock' => true,
            'products' => $products,
            'observations' => trim((string)($settings['default_notes'] ?? '')),
        ];
        $isPaidCard = (string)($order['payment_method'] ?? '') === 'card'
            && (string)($order['payment_status'] ?? '') === 'paid'
            && trim((string)($order['stripe_paid_at'] ?? '')) !== '';
        if ($isPaidCard) {
            $payload['payment'] = [
                'value' => round((float)$order['total'], 2),
                'type' => 'Card online',
                'isCash' => false,
            ];
        }
        return ['order' => $order, 'payload' => $payload];
    }

    private static function persistIssuedInvoice(PDO $db, array $order, array $payload, array $response, array $actor, string $requestId, string $documentId, string $series, string $number): string
    {
        $db->beginTransaction();
        try {
            $existing = $db->prepare('SELECT id, smartbill_document_id FROM shop_invoices WHERE order_id = ? AND invoice_type = ? LIMIT 1 FOR UPDATE');
            $existing->execute([(string)$order['id'], 'invoice']);
            $existingInvoice = $existing->fetch();
            $invoiceId = self::uuid();
            $status = (string)($order['payment_status'] ?? '') === 'paid' ? 'paid' : 'unpaid';
            $snapshot = GtrotsInvoiceService::buildExternalInvoiceSnapshot(
                $db,
                $order,
                $invoiceId,
                $series,
                $number,
                (string)$payload['issueDate'],
                (string)$payload['dueDate'],
                $status,
                (string)($payload['observations'] ?? '')
            );
            $snapshot['_provider'] = 'smartbill';
            $snapshot['_smartbill'] = [
                'request' => $payload,
                'response' => self::publicInvoiceResponse($response),
                // Sale-time lineage is immutable even if the product is later
                // renamed or remapped to another SmartBill warehouse.
                'lineage' => self::adjustmentLines($db, (string)$order['id'], 'full'),
            ];
            $encoded = json_encode($snapshot, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
            $documentUrl = trim((string)($response['documentViewUrl'] ?? $response['documentUrl'] ?? $response['url'] ?? ''));
            $pdfUrl = trim((string)($response['pdfUrl'] ?? ''));
            $issuedBy = mb_substr(trim((string)($actor['display_name'] ?? $actor['username'] ?? 'Administrator')), 0, 180);
            if ($existingInvoice) {
                if (trim((string)($existingInvoice['smartbill_document_id'] ?? '')) === '') {
                    throw new RuntimeException('Factura a fost emisă extern, dar comanda are deja un document local diferit. Este necesară reconcilierea manuală; SmartBill nu va fi apelat din nou.');
                }
                $db->prepare("UPDATE shop_smartbill_invoice_requests SET status = 'completed', smartbill_document_id = ?, response_json = ?, completed_at = NOW(), last_error = NULL WHERE id = ?")
                    ->execute([$documentId === '' ? null : $documentId, json_encode(self::publicInvoiceResponse($response), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), $requestId]);
                $db->commit();
                return (string)$existingInvoice['id'];
            }
            $insert = $db->prepare(
                "INSERT INTO shop_invoices
                 (id, order_id, series, invoice_number, invoice_type, document_status, theme, issue_date, due_date, currency, total,
                  buyer_name, buyer_cui, payload_json, issued_by, smartbill_document_id, smartbill_document_url, smartbill_pdf_url, smartbill_synced_at)
                 VALUES (?, ?, ?, ?, 'invoice', ?, 'smartbill', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())"
            );
            $insert->execute([
                $invoiceId,
                (string)$order['id'],
                $series,
                $number,
                $status,
                (string)$payload['issueDate'],
                (string)$payload['dueDate'],
                (string)$payload['currency'],
                round((float)$order['total'], 2),
                (string)$payload['client']['name'],
                (string)$payload['client']['vatCode'],
                $encoded,
                $issuedBy,
                $documentId === '' ? null : $documentId,
                $documentUrl === '' ? null : $documentUrl,
                $pdfUrl === '' ? null : $pdfUrl,
            ]);
            $db->prepare("UPDATE shop_smartbill_invoice_requests SET status = 'completed', smartbill_document_id = ?, response_json = ?, completed_at = NOW(), last_error = NULL WHERE id = ?")
                ->execute([$documentId === '' ? null : $documentId, json_encode(self::publicInvoiceResponse($response), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), $requestId]);
            $db->commit();
            return $invoiceId;
        } catch (Throwable $error) {
            if ($db->inTransaction()) $db->rollBack();
            throw $error;
        }
    }

    private static function invoice(PDO $db, string $invoiceId): array
    {
        $stmt = $db->prepare(
            'SELECT i.*, o.customer_email, o.order_number
             FROM shop_invoices i
             INNER JOIN shop_orders o ON o.id = i.order_id
             WHERE i.id = ? LIMIT 1'
        );
        $stmt->execute([trim($invoiceId)]);
        $invoice = $stmt->fetch();
        if (!$invoice) throw new InvalidArgumentException('Factura nu există.');
        if (trim((string)($invoice['smartbill_document_id'] ?? '')) === '') {
            throw new InvalidArgumentException('Factura selectată nu este un document SmartBill.');
        }
        return $invoice;
    }

    private static function archiveInvoicePdf(PDO $db, array $config, array $invoice, bool $force): array
    {
        self::assertV1Configured($config);
        $directory = trim((string)($config['invoice_storage_dir'] ?? ''));
        if ($directory === '') $directory = __DIR__ . DIRECTORY_SEPARATOR . 'uploads' . DIRECTORY_SEPARATOR . 'invoices';
        $publicBase = rtrim(trim((string)($config['invoice_public_base_url'] ?? '')), '/');
        if ($publicBase === '') throw new RuntimeException('Adresa publică pentru arhiva PDF SmartBill nu este configurată.');
        if (!is_dir($directory) && !mkdir($directory, 0755, true) && !is_dir($directory)) {
            throw new RuntimeException('Folderul pentru arhiva PDF SmartBill nu a putut fi creat.');
        }
        $safeSeries = preg_replace('/[^A-Za-z0-9._-]+/', '-', (string)$invoice['series']) ?: 'serie';
        $safeNumber = preg_replace('/[^A-Za-z0-9._-]+/', '-', (string)$invoice['invoice_number']) ?: 'numar';
        $token = substr(hash('sha256', (string)$invoice['id'] . '|' . (string)($config['api_key'] ?? '') . '|cubis-smartbill-pdf-v1'), 0, 32);
        $storedName = strtolower('smartbill-' . $safeSeries . '-' . $safeNumber . '-' . $token . '.pdf');
        $path = $directory . DIRECTORY_SEPARATOR . $storedName;
        if ($force || !is_file($path) || (int)@filesize($path) < 5) {
            $bytes = self::v1Pdf($db, $config, (string)$invoice['series'], (string)$invoice['invoice_number']);
            $temporary = $path . '.tmp-' . bin2hex(random_bytes(5));
            if (file_put_contents($temporary, $bytes, LOCK_EX) === false) throw new RuntimeException('PDF-ul SmartBill nu a putut fi arhivat.');
            if (!@rename($temporary, $path)) {
                @unlink($path);
                if (!@rename($temporary, $path)) {
                    @unlink($temporary);
                    throw new RuntimeException('PDF-ul SmartBill arhivat nu a putut fi finalizat.');
                }
            }
        }
        $publicUrl = $publicBase . '/' . rawurlencode($storedName);
        $db->prepare('UPDATE shop_invoices SET smartbill_pdf_url = ?, smartbill_synced_at = NOW() WHERE id = ?')
            ->execute([$publicUrl, (string)$invoice['id']]);
        return [
            'path' => $path,
            'public_url' => $publicUrl,
            'file_name' => 'Factura-SmartBill-' . $safeSeries . '-' . $safeNumber . '.pdf',
        ];
    }

    private static function v1Pdf(PDO $db, array $config, string $series, string $number): string
    {
        $config = self::effectiveConfig($db, $config);
        self::assertV1Configured($config);
        return self::requestBinary($db, 'GET', self::V1_BASE_URL . '/invoice/pdf', [
            'cif' => self::cif($config),
            'seriesname' => $series,
            'number' => $number,
        ], [
            'Authorization: Basic ' . base64_encode((string)$config['smartbill_v1_email'] . ':' . (string)$config['smartbill_v1_token']),
            'Accept: application/octet-stream',
        ]);
    }

    private static function requestBinary(PDO $db, string $method, string $url, array $query, array $headers): string
    {
        unset($db); // retained in the signature for symmetry and injectable tests
        if ($query) $url .= (str_contains($url, '?') ? '&' : '?') . http_build_query($query, '', '&', PHP_QUERY_RFC3986);
        $delays = [0, 250000, 500000, 1000000];
        $lastError = null;
        foreach ($delays as $attempt => $delay) {
            if ($delay > 0) usleep($delay);
            self::throttle();
            try {
                $response = self::send(strtoupper($method), $url, $headers, null);
                $status = (int)($response['status'] ?? 0);
                $raw = (string)($response['body'] ?? '');
                if ($status >= 200 && $status < 300 && str_starts_with($raw, '%PDF-')) return $raw;
                $message = 'SmartBill PDF a răspuns cu HTTP ' . $status . '.';
                if (!in_array($status, [429, 500, 502, 503, 504], true) || $attempt === count($delays) - 1) {
                    throw new RuntimeException($message, $status);
                }
                $lastError = new RuntimeException($message, $status);
            } catch (Throwable $error) {
                $lastError = $error;
                if ($error->getCode() > 0 && !in_array((int)$error->getCode(), [429, 500, 502, 503, 504], true)) break;
            }
        }
        throw new RuntimeException(self::safeError($lastError?->getMessage() ?? 'Descărcarea PDF-ului SmartBill a eșuat.'));
    }

    private static function recordInvoiceMetadata(PDO $db, string $invoiceId, string $key, array $value): void
    {
        $stmt = $db->prepare('SELECT payload_json FROM shop_invoices WHERE id = ? LIMIT 1');
        $stmt->execute([$invoiceId]);
        $encoded = $stmt->fetchColumn();
        if ($encoded === false) return;
        $payload = json_decode((string)$encoded, true);
        if (!is_array($payload)) return;
        if (!is_array($payload['_smartbill'] ?? null)) $payload['_smartbill'] = [];
        $payload['_smartbill'][$key] = $value;
        $db->prepare('UPDATE shop_invoices SET payload_json = ?, smartbill_synced_at = NOW() WHERE id = ?')
            ->execute([json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR), $invoiceId]);
    }

    private static function adjustmentLines(PDO $db, string $orderId, string $scope): array
    {
        $acceptedByItem = [];
        if ($scope === 'partial') {
            try {
                $stmt = $db->prepare('SELECT order_item_id, accepted_quantity FROM shop_order_return_items WHERE order_id = ? AND accepted_quantity > 0');
                $stmt->execute([$orderId]);
                foreach ($stmt->fetchAll() as $row) $acceptedByItem[(string)$row['order_item_id']] = (float)$row['accepted_quantity'];
            } catch (Throwable $ignored) { }
        }
        $stmt = $db->prepare(
            'SELECT oi.id AS order_item_id, oi.product_id, oi.product_sku, oi.quantity,
                    p.smartbill_product_id, p.smartbill_sku, p.smartbill_warehouse_id, p.smartbill_warehouse_name
             FROM shop_order_items oi
             LEFT JOIN shop_products p ON p.id = oi.product_id
             WHERE oi.order_id = ? ORDER BY oi.id'
        );
        $stmt->execute([$orderId]);
        $lines = [];
        foreach ($stmt->fetchAll() as $row) {
            $quantity = $scope === 'partial'
                ? (float)($acceptedByItem[(string)$row['order_item_id']] ?? 0)
                : (float)$row['quantity'];
            if ($quantity <= 0) continue;
            $lines[] = [
                'order_item_id' => (string)$row['order_item_id'],
                'product_id' => (string)($row['product_id'] ?? ''),
                'sku' => (string)($row['smartbill_sku'] ?: $row['product_sku']),
                'smartbill_product_id' => (string)($row['smartbill_product_id'] ?? ''),
                'warehouse_id' => (string)($row['smartbill_warehouse_id'] ?? ''),
                'warehouse_name' => (string)($row['smartbill_warehouse_name'] ?? ''),
                'quantity' => $quantity,
            ];
        }
        return $lines;
    }

    private static function adjustmentStockSnapshot(PDO $db, array $config, array $lines): array
    {
        $grouped = [];
        foreach ($lines as $line) {
            if (!is_array($line)) continue;
            $sku = trim((string)($line['sku'] ?? ''));
            $warehouse = trim((string)($line['warehouse_name'] ?? ''));
            if ($sku === '' || $warehouse === '') {
                throw new RuntimeException('Corecția nu are instantaneul complet SKU + gestiune SmartBill. Intervenție manuală necesară.');
            }
            $key = $warehouse . "\0" . $sku;
            if (!isset($grouped[$key])) $grouped[$key] = ['sku' => $sku, 'warehouse_name' => $warehouse, 'quantity' => 0.0];
            $grouped[$key]['quantity'] += max(0.0, (float)($line['quantity'] ?? 0));
        }
        $snapshot = [];
        foreach ($grouped as $line) {
            $stock = self::stock($db, $config, (string)$line['sku'], (string)$line['warehouse_name'], true);
            $snapshot[] = array_merge($line, ['stock_quantity' => (float)$stock['quantity'], 'found' => (bool)$stock['found'], 'checked_at' => (string)$stock['checked_at']]);
        }
        return $snapshot;
    }

    private static function verifyAdjustmentStockIncrease(array $before, array $after): bool
    {
        $afterByKey = [];
        foreach ($after as $line) $afterByKey[(string)($line['warehouse_name'] ?? '') . "\0" . (string)($line['sku'] ?? '')] = $line;
        if (!$before) return false;
        foreach ($before as $line) {
            $key = (string)($line['warehouse_name'] ?? '') . "\0" . (string)($line['sku'] ?? '');
            $next = $afterByKey[$key] ?? null;
            if (!$next || empty($next['found'])) return false;
            $expectedMinimum = (float)($line['stock_quantity'] ?? 0) + (float)($line['quantity'] ?? 0);
            if ((float)($next['stock_quantity'] ?? 0) + 0.0001 < $expectedMinimum) return false;
        }
        return true;
    }

    private static function publicAdjustment(array $row, ?string $fallbackMessage = null): array
    {
        $response = json_decode((string)($row['response_json'] ?? ''), true);
        return [
            'id' => (string)($row['id'] ?? ''),
            'required' => true,
            'order_id' => (string)($row['order_id'] ?? ''),
            'original_invoice_id' => (string)($row['original_invoice_id'] ?? ''),
            'operation_type' => (string)($row['operation_type'] ?? ''),
            'return_scope' => (string)($row['return_scope'] ?? ''),
            'status' => (string)($row['status'] ?? ''),
            'attempts' => (int)($row['attempts'] ?? 0),
            'message' => (string)($row['last_error'] ?? $fallbackMessage ?? ''),
            'response' => is_array($response) ? $response : null,
            'completed_at' => $row['completed_at'] ?? null,
            'created_at' => $row['created_at'] ?? null,
            'updated_at' => $row['updated_at'] ?? null,
        ];
    }

    private static function assertIssuingEnabled(PDO $db, array $config): void
    {
        $state = self::settings($db, $config);
        if (empty($state['issuing_enabled'])) {
            throw new RuntimeException((string)($state['issuing_block_reason'] ?: 'Emiterea SmartBill este oprită din configuratorul de facturi.'));
        }
    }

    private static function issuingBlockReason(array $config, array $row, bool $allowed, bool $ready): ?string
    {
        if (!$allowed) return 'Emiterea SmartBill nu este permisă de configurația securizată a serverului.';
        if (!self::v1Configured($config) || !self::v3Configured($config)) return 'Configurează pe server tokenurile SmartBill V1 și V3.';
        if (empty($config['smartbill_read_enabled'])) return 'Activează mai întâi citirea SmartBill pe server.';
        if (empty($row['v1_last_tested_at']) || empty($row['v3_last_tested_at'])) return 'Testează cu succes ambele conexiuni SmartBill.';
        if (empty($row['last_reference_sync_at'])) return 'Sincronizează seriile și gestiunile SmartBill.';
        if (trim((string)($row['invoice_series'] ?? '')) === '') return 'Selectează seria de factură SmartBill.';
        return $ready ? null : 'Emiterea SmartBill nu este încă pregătită.';
    }

    private static function v1(PDO $db, array $config, string $method, string $path, array $query = [], ?array $body = null, bool $cache = false): array
    {
        $config = self::effectiveConfig($db, $config);
        self::assertV1Configured($config);
        return self::request($db, $method, self::V1_BASE_URL . $path, $query, $body, [
            'Authorization: Basic ' . base64_encode((string)$config['smartbill_v1_email'] . ':' . (string)$config['smartbill_v1_token']),
            'Accept: application/json',
            'Content-Type: application/json',
        ], $cache);
    }

    private static function v3(PDO $db, array $config, string $method, string $path, array $query = [], ?array $body = null, bool $cache = false): array
    {
        $config = self::effectiveConfig($db, $config);
        self::assertV3Configured($config);
        return self::request($db, $method, self::V3_BASE_URL . $path, $query, $body, [
            'Authorization: Bearer ' . (string)$config['smartbill_v3_token'],
            'Accept: application/json',
            'Content-Type: application/json',
        ], $cache);
    }

    private static function request(PDO $db, string $method, string $url, array $query, ?array $body, array $headers, bool $cache): array
    {
        $method = strtoupper($method);
        if ($query) $url .= (str_contains($url, '?') ? '&' : '?') . http_build_query($query, '', '&', PHP_QUERY_RFC3986);
        $cacheKey = hash('sha256', $method . '|' . $url . '|' . json_encode($body));
        if ($cache && $method === 'GET') {
            $cached = $db->prepare('SELECT response_json FROM shop_smartbill_request_cache WHERE cache_key = ? AND expires_at > NOW()');
            $cached->execute([$cacheKey]);
            $value = $cached->fetchColumn();
            if ($value !== false) {
                $decoded = json_decode((string)$value, true);
                if (is_array($decoded)) return $decoded;
            }
        }
        $delays = [0, 250000, 500000, 1000000];
        $lastError = null;
        foreach ($delays as $attempt => $delay) {
            if ($delay > 0) usleep($delay);
            self::throttle();
            try {
                $response = self::send($method, $url, $headers, $body);
                $status = (int)($response['status'] ?? 0);
                $raw = (string)($response['body'] ?? '');
                $decoded = $raw === '' ? [] : json_decode($raw, true);
                if ($status >= 200 && $status < 300 && is_array($decoded)) {
                    if ($cache && $method === 'GET') {
                        $save = $db->prepare(
                            'INSERT INTO shop_smartbill_request_cache (cache_key, response_json, expires_at) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL ? SECOND))
                             ON DUPLICATE KEY UPDATE response_json = VALUES(response_json), expires_at = VALUES(expires_at)'
                        );
                        $save->execute([$cacheKey, json_encode($decoded, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), self::CACHE_TTL_SECONDS]);
                    }
                    return $decoded;
                }
                $message = self::extractError($decoded, $status);
                if (!in_array($status, [429, 500, 502, 503, 504], true) || $attempt === count($delays) - 1) {
                    throw new RuntimeException($message, $status);
                }
                $lastError = new RuntimeException($message);
            } catch (Throwable $error) {
                $lastError = $error;
                if ($error->getCode() > 0 && !in_array((int)$error->getCode(), [429, 500, 502, 503, 504], true)) break;
                if ($attempt === count($delays) - 1) break;
            }
        }
        throw new RuntimeException(self::safeError($lastError?->getMessage() ?? 'Conexiunea SmartBill a eșuat.'));
    }

    private static function send(string $method, string $url, array $headers, ?array $body): array
    {
        if (self::$transport !== null) {
            $result = (self::$transport)($method, $url, $headers, $body);
            if (!is_array($result)) throw new RuntimeException('Transportul SmartBill de test a returnat un rezultat invalid.');
            return $result;
        }
        if (!function_exists('curl_init')) throw new RuntimeException('Extensia PHP cURL este obligatorie pentru SmartBill.');
        $handle = curl_init($url);
        if ($handle === false) throw new RuntimeException('Conexiunea SmartBill nu a putut fi inițializată.');
        $options = [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_FOLLOWLOCATION => false,
            CURLOPT_CONNECTTIMEOUT => 8,
            CURLOPT_TIMEOUT => 25,
            CURLOPT_CUSTOMREQUEST => $method,
            CURLOPT_HTTPHEADER => $headers,
            CURLOPT_HEADER => false,
        ];
        if ($body !== null) $options[CURLOPT_POSTFIELDS] = json_encode($body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
        curl_setopt_array($handle, $options);
        $raw = curl_exec($handle);
        $status = (int)curl_getinfo($handle, CURLINFO_RESPONSE_CODE);
        $curlError = curl_error($handle);
        curl_close($handle);
        if ($raw === false) throw new RuntimeException('Conexiunea HTTPS SmartBill a eșuat: ' . self::safeError($curlError));
        return ['status' => $status, 'body' => (string)$raw];
    }

    private static function throttle(): void
    {
        $now = microtime(true);
        $elapsedUs = (int)(($now - self::$lastRequestAt) * 1000000);
        if (self::$lastRequestAt > 0 && $elapsedUs < self::MIN_REQUEST_INTERVAL_US) usleep(self::MIN_REQUEST_INTERVAL_US - $elapsedUs);
        self::$lastRequestAt = microtime(true);
    }

    private static function resolveWarehouse(PDO $db, ?string $warehouseId): ?array
    {
        $warehouseId = trim((string)$warehouseId);
        if ($warehouseId === '') return null;
        $stmt = $db->prepare('SELECT smartbill_id AS id, name FROM shop_smartbill_warehouses WHERE smartbill_id = ? LIMIT 1');
        $stmt->execute([$warehouseId]);
        $row = $stmt->fetch();
        return $row ? ['id' => (string)$row['id'], 'name' => (string)$row['name']] : null;
    }

    private static function collection(array $payload): array
    {
        foreach (['data', 'items', 'list', 'warehouses', 'products'] as $key) {
            if (isset($payload[$key]) && is_array($payload[$key])) return array_values(array_filter($payload[$key], 'is_array'));
        }
        return array_is_list($payload) ? array_values(array_filter($payload, 'is_array')) : [];
    }

    private static function publicInvoiceResponse(array $response): array
    {
        $allowed = ['series', 'number', 'documentId', 'documentUrl', 'documentViewUrl', 'url', 'pdfUrl', 'errorText', 'message'];
        return array_intersect_key($response, array_flip($allowed));
    }

    private static function extractError($decoded, int $status): string
    {
        if (is_array($decoded)) {
            if (isset($decoded['status']) && is_array($decoded['status']) && trim((string)($decoded['status']['message'] ?? '')) !== '') {
                return 'SmartBill HTTP ' . $status . ': ' . self::safeError((string)$decoded['status']['message']);
            }
            if (isset($decoded['errors']) && is_array($decoded['errors'])) {
                $messages = [];
                foreach ($decoded['errors'] as $error) {
                    if (!is_array($error)) continue;
                    $message = trim((string)($error['message'] ?? ''));
                    $param = trim((string)($error['param'] ?? ''));
                    if ($message !== '') $messages[] = $param !== '' ? $param . ': ' . $message : $message;
                }
                if ($messages) return 'SmartBill HTTP ' . $status . ': ' . self::safeError(implode('; ', $messages));
            }
            foreach (['errorText', 'message', 'error', 'detail'] as $key) {
                if (isset($decoded[$key]) && is_scalar($decoded[$key]) && trim((string)$decoded[$key]) !== '') {
                    return 'SmartBill HTTP ' . $status . ': ' . self::safeError((string)$decoded[$key]);
                }
            }
        }
        return 'SmartBill a răspuns cu HTTP ' . $status . '.';
    }

    private static function effectiveConfig(PDO $db, array $config): array
    {
        if (self::v1Configured($config) && self::v3Configured($config)) return $config;
        if (trim((string)($config['smartbill_credential_key'] ?? '')) === '') return $config;
        try {
            $row = $db->query('SELECT encrypted_payload, key_fingerprint FROM shop_smartbill_credentials WHERE id = 1 LIMIT 1')->fetch();
        } catch (Throwable) {
            return $config;
        }
        if (!$row) return $config;
        $credentials = self::decryptCredentials($config, (string)$row['encrypted_payload'], (string)$row['key_fingerprint']);
        foreach (['smartbill_v1_email', 'smartbill_v1_token', 'smartbill_v3_token', 'smartbill_cif'] as $key) {
            if (trim((string)($config[$key] ?? '')) === '') $config[$key] = (string)($credentials[$key] ?? '');
        }
        return $config;
    }

    /** @return array{storage_ready:bool,source:string} */
    private static function credentialState(PDO $db, array $config): array
    {
        if (self::v1Configured($config) && self::v3Configured($config)) {
            return ['storage_ready' => true, 'source' => 'server_environment'];
        }
        $keyReady = trim((string)($config['smartbill_credential_key'] ?? '')) !== '';
        if (!$keyReady) return ['storage_ready' => false, 'source' => 'not_configured'];
        try {
            $stored = (bool)$db->query('SELECT COUNT(*) FROM shop_smartbill_credentials WHERE id = 1')->fetchColumn();
        } catch (Throwable) {
            $stored = false;
        }
        return ['storage_ready' => true, 'source' => $stored ? 'encrypted_database' : 'encrypted_database_empty'];
    }

    private static function credentialKey(array $config): string
    {
        $material = trim((string)($config['smartbill_credential_key'] ?? ''));
        if (strlen($material) < 32) {
            throw new RuntimeException('Cheia server-side CUBIS_SMARTBILL_CREDENTIAL_KEY lipsește sau este prea scurtă.');
        }
        return hash('sha256', $material, true);
    }

    private static function encryptCredentials(array $config, array $credentials): string
    {
        if (!function_exists('openssl_encrypt')) throw new RuntimeException('Extensia PHP OpenSSL este obligatorie pentru stocarea securizată SmartBill.');
        $nonce = random_bytes(12);
        $tag = '';
        $plain = json_encode($credentials, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
        $ciphertext = openssl_encrypt($plain, 'aes-256-gcm', self::credentialKey($config), OPENSSL_RAW_DATA, $nonce, $tag, 'cubisshop-smartbill-v1', 16);
        if (!is_string($ciphertext) || strlen($tag) !== 16) throw new RuntimeException('Credențialele SmartBill nu au putut fi criptate.');
        return json_encode([
            'v' => 1,
            'alg' => 'A256GCM',
            'nonce' => base64_encode($nonce),
            'tag' => base64_encode($tag),
            'ciphertext' => base64_encode($ciphertext),
        ], JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
    }

    private static function decryptCredentials(array $config, string $envelopeJson, string $fingerprint): array
    {
        if (!function_exists('openssl_decrypt')) throw new RuntimeException('Extensia PHP OpenSSL este obligatorie pentru citirea credențialelor SmartBill.');
        $key = self::credentialKey($config);
        if ($fingerprint !== '' && !hash_equals($fingerprint, substr(hash('sha256', $key), 0, 16))) {
            throw new RuntimeException('Cheia server-side SmartBill nu corespunde credențialelor criptate.');
        }
        $envelope = json_decode($envelopeJson, true);
        if (!is_array($envelope) || (int)($envelope['v'] ?? 0) !== 1 || (string)($envelope['alg'] ?? '') !== 'A256GCM') {
            throw new RuntimeException('Formatul credențialelor SmartBill criptate nu este valid.');
        }
        $nonce = base64_decode((string)($envelope['nonce'] ?? ''), true);
        $tag = base64_decode((string)($envelope['tag'] ?? ''), true);
        $ciphertext = base64_decode((string)($envelope['ciphertext'] ?? ''), true);
        if (!is_string($nonce) || strlen($nonce) !== 12 || !is_string($tag) || strlen($tag) !== 16 || !is_string($ciphertext)) {
            throw new RuntimeException('Credențialele SmartBill criptate sunt corupte.');
        }
        $plain = openssl_decrypt($ciphertext, 'aes-256-gcm', $key, OPENSSL_RAW_DATA, $nonce, $tag, 'cubisshop-smartbill-v1');
        if (!is_string($plain)) throw new RuntimeException('Credențialele SmartBill nu pot fi decriptate cu cheia serverului.');
        $credentials = json_decode($plain, true);
        if (!is_array($credentials)) throw new RuntimeException('Conținutul credențialelor SmartBill nu este valid.');
        return $credentials;
    }

    private static function nextCursor(array $payload): ?string
    {
        $candidates = [
            $payload['nextCursor'] ?? null,
            $payload['next_cursor'] ?? null,
            $payload['pagination']['nextCursor'] ?? null,
            $payload['pagination']['next'] ?? null,
            $payload['links']['next'] ?? null,
            $payload['next'] ?? null,
        ];
        foreach ($candidates as $candidate) {
            if (!is_scalar($candidate)) continue;
            $value = trim((string)$candidate);
            if ($value === '') continue;
            if (filter_var($value, FILTER_VALIDATE_URL)) {
                $query = [];
                parse_str((string)(parse_url($value, PHP_URL_QUERY) ?? ''), $query);
                $value = trim((string)($query['after'] ?? ''));
            }
            if ($value !== '') return mb_substr($value, 0, 300);
        }
        return null;
    }

    private static function assertReadEnabled(array $config): void
    {
        if (empty($config['smartbill_read_enabled'])) throw new RuntimeException('Citirea SmartBill este dezactivată server-side.');
    }

    private static function assertV1Configured(array $config): void
    {
        if (!self::v1Configured($config)) throw new RuntimeException('Configurația SmartBill V1 este incompletă.');
    }

    private static function assertV3Configured(array $config): void
    {
        if (!self::v3Configured($config)) throw new RuntimeException('Configurația SmartBill V3 este incompletă.');
    }

    private static function v1Configured(array $config): bool
    {
        return trim((string)($config['smartbill_v1_email'] ?? '')) !== ''
            && trim((string)($config['smartbill_v1_token'] ?? '')) !== ''
            && trim((string)($config['smartbill_cif'] ?? '')) !== '';
    }

    private static function v3Configured(array $config): bool
    {
        return trim((string)($config['smartbill_v3_token'] ?? '')) !== ''
            && trim((string)($config['smartbill_cif'] ?? '')) !== '';
    }

    private static function cif(array $config): string
    {
        $cif = trim((string)($config['smartbill_cif'] ?? ''));
        if ($cif === '' || !preg_match('/^[A-Za-z]{0,3}[0-9]{2,20}$/', $cif)) throw new RuntimeException('CIF-ul SmartBill Cubis este invalid.');
        return $cif;
    }

    private static function maskedCif(string $cif): string
    {
        $cif = trim($cif);
        if ($cif === '') return '';
        return strlen($cif) <= 6 ? str_repeat('*', strlen($cif)) : substr($cif, 0, 2) . str_repeat('*', max(1, strlen($cif) - 5)) . substr($cif, -3);
    }

    private static function maskedEmail(string $email): string
    {
        $email = trim($email);
        if ($email === '' || !str_contains($email, '@')) return '';
        [$local, $domain] = explode('@', $email, 2);
        $visible = mb_substr($local, 0, min(2, mb_strlen($local)));
        return $visible . str_repeat('*', max(3, mb_strlen($local) - mb_strlen($visible))) . '@' . $domain;
    }

    private static function assertCubisDatabase(PDO $db): void
    {
        if (strtolower((string)$db->getAttribute(PDO::ATTR_DRIVER_NAME)) === 'sqlite') return;
        if ((string)$db->query('SELECT DATABASE()')->fetchColumn() !== 'cabitro_cubisshop.ro') {
            throw new RuntimeException('Schema SmartBill poate fi instalată exclusiv în baza Cubis Shop.');
        }
    }

    private static function columnExists(PDO $db, string $table, string $column): bool
    {
        if (strtolower((string)$db->getAttribute(PDO::ATTR_DRIVER_NAME)) === 'sqlite') {
            foreach ($db->query("PRAGMA table_info({$table})")->fetchAll() as $row) if ((string)$row['name'] === $column) return true;
            return false;
        }
        $stmt = $db->prepare('SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?');
        $stmt->execute([$table, $column]);
        return (int)$stmt->fetchColumn() > 0;
    }

    private static function indexExists(PDO $db, string $table, string $index): bool
    {
        if (strtolower((string)$db->getAttribute(PDO::ATTR_DRIVER_NAME)) === 'sqlite') return false;
        $stmt = $db->prepare('SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = ? AND index_name = ?');
        $stmt->execute([$table, $index]);
        return (int)$stmt->fetchColumn() > 0;
    }

    private static function safeError(string $message): string
    {
        $message = preg_replace('/(Bearer|Basic)\s+[A-Za-z0-9+\/=._-]+/i', '$1 [secret]', $message) ?? $message;
        $message = preg_replace('/sb_(?:live|test)_[A-Za-z0-9._-]+/i', '[secret]', $message) ?? $message;
        return mb_substr(trim($message), 0, 500);
    }

    private static function uuid(): string
    {
        $bytes = random_bytes(16);
        $bytes[6] = chr((ord($bytes[6]) & 0x0f) | 0x40);
        $bytes[8] = chr((ord($bytes[8]) & 0x3f) | 0x80);
        $hex = bin2hex($bytes);
        return substr($hex, 0, 8) . '-' . substr($hex, 8, 4) . '-' . substr($hex, 12, 4) . '-' . substr($hex, 16, 4) . '-' . substr($hex, 20);
    }
}

<?php
declare(strict_types=1);

function authorityAssert(bool $condition, string $message): void
{
    if (!$condition) throw new RuntimeException($message);
}

$root = dirname(__DIR__);
$service = file_get_contents($root . '/smartbill-service.php') ?: '';
$api = file_get_contents($root . '/api.php') ?: '';
$config = file_get_contents($root . '/config.example.php') ?: '';
$invoice = file_get_contents($root . '/invoice-service.php') ?: '';
$cancellation = file_get_contents($root . '/order-cancellation.php') ?: '';
$returns = file_get_contents($root . '/order-return-confirmation.php') ?: '';
$mobileConfig = file_get_contents(dirname($root) . '/components/ShopInvoiceConfigurator.tsx') ?: '';
$mobileNir = file_get_contents(dirname($root) . '/components/ShopNirManager.tsx') ?: '';
$desktop = file_get_contents(dirname($root) . '/electron-app/renderer/js/shop-commerce.js') ?: '';

authorityAssert(str_contains($config, "CUBIS_SMARTBILL_INVENTORY_AUTHORITY', true"), 'SmartBill inventory authority must fail closed by default.');
authorityAssert(str_contains($api, 'cubisRejectLegacyInventoryWrite($config);'), 'Legacy accounting writes must be rejected centrally.');
foreach (['createNir', 'confirmNir', 'reverseNir', 'adjustStock'] as $action) {
    authorityAssert(str_contains($api, "\$action === '{$action}'") || str_contains($api, "['reverseNir', 'stornoNir']"), "Missing guarded {$action} route.");
}
authorityAssert(str_contains($invoice, "if (!empty(\$config['smartbill_inventory_authority']))"), 'Legacy return invoice/FIFO path must have a SmartBill authority guard.');
authorityAssert(str_contains($cancellation, 'CubisSmartBillService::prepareReturnAdjustment'), 'Cancellation must prepare a SmartBill adjustment.');
authorityAssert(str_contains($returns, 'CubisSmartBillService::prepareReturnAdjustment'), 'Returns must prepare a SmartBill adjustment.');
authorityAssert(str_contains($service, "'/invoice/reverse'"), 'Full reversal must use the documented SmartBill reverse endpoint.');
authorityAssert(str_contains($service, "'manual_required'"), 'Unsupported corrections must be marked for manual SmartBill intervention.');
authorityAssert(str_contains($service, 'verifyAdjustmentStockIncrease'), 'SmartBill stock re-entry must be verified by a read-back.');
authorityAssert(str_contains($service, 'shop_smartbill_adjustments'), 'Adjustment audit/idempotency table is required.');
authorityAssert(str_contains($service, "'lineage' => self::adjustmentLines"), 'Invoice snapshots must preserve sale-time SKU/warehouse lineage.');
authorityAssert(str_contains($mobileConfig, 'issuing_enabled: issuingEnabled'), 'Mobile configurator must save the issuing switch.');
authorityAssert(str_contains($desktop, 'shop-smartbill-issuing'), 'Desktop configurator must expose the issuing switch.');
authorityAssert(str_contains($mobileNir, 'SMARTBILL_INVENTORY_AUTHORITY = true'), 'Mobile NIR registry must be read-only under SmartBill authority.');
authorityAssert(str_contains($desktop, 'SMARTBILL_INVENTORY_AUTHORITY = true'), 'Desktop NIR registry must be read-only under SmartBill authority.');

echo "SmartBill inventory authority contract: OK\n";

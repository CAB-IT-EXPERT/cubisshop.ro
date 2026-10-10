<?php
declare(strict_types=1);

function smartBillNavigationAssert(bool $condition, string $message): void {
    if (!$condition) throw new RuntimeException($message);
}

$root = dirname(__DIR__, 2);
$mobile = (string)file_get_contents($root . '/components/ShopModuleScreen.tsx');
$desktop = (string)file_get_contents($root . '/electron-app/renderer/index.html');
$desktopCommerce = (string)file_get_contents($root . '/electron-app/renderer/js/shop-commerce.js');

smartBillNavigationAssert(!str_contains($mobile, "{ key: 'inventory', title: 'Stocuri'"), 'Fila mobilă Stoc este încă prezentă.');
smartBillNavigationAssert(!str_contains($mobile, "key: 'stock', title: 'STOC & ACHIZIȚII'"), 'Grupul mobil Stoc & achiziții este încă prezent.');

foreach (['shop-inventory', 'shop-nirs', 'shop-suppliers', 'shop-sources'] as $tab) {
    smartBillNavigationAssert(!str_contains($desktop, 'data-tab="' . $tab . '"'), 'Meniul desktop păstrează fila ' . $tab . '.');
}
smartBillNavigationAssert(!str_contains($desktop, 'data-shop-open="shop-inventory"'), 'Dashboardul desktop păstrează cardul Stoc.');
foreach (['shop-sources', 'shop-suppliers', 'shop-nirs'] as $target) {
    smartBillNavigationAssert(!str_contains($desktopCommerce, "dashboardCard('{$target}'"), 'Dashboardul desktop recreează cardul ' . $target . '.');
}

echo "SmartBill navigation cleanup contract: OK\n";

<?php
declare(strict_types=1);

require_once __DIR__ . '/../product-page-service.php';

$root = dirname(__DIR__, 2);
$api = file_get_contents($root . '/shop-api/api.php');
$checkout = file_get_contents($root . '/website/cubis-checkout.mjs');
$storefront = file_get_contents($root . '/website/cubis-storefront.mjs');
$seoGenerator = file_get_contents($root . '/scripts/generate-product-seo-pages.mjs');

$check = static function (bool $condition, string $message): void {
    if (!$condition) {
        fwrite(STDERR, "free_shipping_threshold_test: {$message}\n");
        exit(1);
    }
};

$check(shopFreeShippingMinimum(300) === 300.0, 'pragul configurat trebuie păstrat inclusiv');
$check(!shopFreeShippingEligible(299.99, 300), '299,99 lei nu trebuie să fie gratuit');
$check(shopFreeShippingEligible(300.00, 300), '300,00 lei trebuie să fie gratuit');
$check(shopFreeShippingEligible(300.01, 300), '300,01 lei trebuie să fie gratuit');
$check(str_contains($api, "shopFreeShippingEligible(\$subtotal, \$shipping['free_above'])"), 'API-ul nu folosește regula comună');
$check(str_contains($checkout, 'subtotal >= threshold'), 'checkout-ul nu folosește pragul inclusiv');
$check(str_contains($storefront, 'const amount = threshold.toLocaleString'), 'bara nu afișează pragul configurat');
$check(!str_contains($storefront, 'Math.floor(threshold) + 1'), 'bara adaugă în mod incorect un leu la prag');
$check(str_contains($seoGenerator, '? freeAbove : null'), 'generatorul SEO nu folosește pragul inclusiv');
$check(!str_contains($seoGenerator, 'Math.floor(freeAbove) + 1'), 'generatorul SEO adaugă în mod incorect un leu la prag');

echo "free_shipping_threshold_test: OK\n";

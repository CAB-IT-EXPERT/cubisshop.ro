<?php
declare(strict_types=1);

$root = dirname(__DIR__, 2);
$api = file_get_contents($root . '/shop-api/api.php');
$web = file_get_contents($root . '/website/cubis-storefront.mjs');
$css = file_get_contents($root . '/website/cubis-free-shipping.css');
$desktop = file_get_contents($root . '/electron-app/renderer/js/shop-commerce.js');
$mobile = file_get_contents($root . '/components/ShopMoreManagers.tsx');
$types = file_get_contents($root . '/services/shopApi.ts');

$check = static function (bool $condition, string $message): void {
    if (!$condition) {
        fwrite(STDERR, "free_shipping_banner_contract_test: {$message}\n");
        exit(1);
    }
};

$check(str_contains($api, 'show_free_shipping_banner TINYINT(1) NOT NULL DEFAULT 0'), 'coloana configurabilă lipsește din schemă');
$check((bool)preg_match('/const CUBIS_SHOP_SCHEMA_VERSION = [0-9]{10};/', $api), 'versiunea schemei trebuie declarată explicit');
$check(!str_contains($api, 'ensureShopSchema($db);'), 'API-ul HTTP nu trebuie să ruleze migrarea automat');
$check(str_contains($api, "publicFreeShippingBanners"), 'endpointul public pentru bară lipsește');
$check(str_contains($api, 'show_free_shipping_banner = 1 AND free_above IS NOT NULL AND free_above > 0'), 'endpointul nu filtrează metodele active eligibile');
$check(str_contains($api, 'ORDER BY free_above ASC'), 'API-ul nu prioritizează cel mai mic prag');
$check(str_contains($api, 'ORDER BY free_above ASC, sort_order ASC, name ASC LIMIT 1'), 'API-ul poate publica mai multe praguri simultan');
$check(str_contains($types, 'show_free_shipping_banner: boolean'), 'tipul comun al aplicațiilor nu conține opțiunea');
$check(str_contains($desktop, 'shop-shipping-free-banner'), 'opțiunea lipsește din aplicația desktop');
$check(str_contains($desktop, 'show_free_shipping_banner: showFreeShippingBanner'), 'desktopul nu salvează opțiunea');
$check(str_contains($mobile, 'title="Arata bara pe site"'), 'opțiunea lipsește din aplicația mobilă');
$check(str_contains($mobile, 'show_free_shipping_banner: form.show_free_shipping_banner'), 'aplicația mobilă nu salvează opțiunea');
$check(str_contains($web, '.sort((left, right) => Number(left.free_above) - Number(right.free_above))'), 'site-ul nu sortează pragurile crescător');
$check(str_contains($web, '.slice(0, 1)'), 'site-ul poate afișa mai multe livrări simultan');
$check(str_contains($web, 'cs-free-shipping-bar'), 'bara nu este randată în shell-ul global');
$check(str_contains($web, 'publicFreeShippingBanners'), 'shell-ul global nu încarcă setarea live');
$check(str_contains($web, '/cubis-free-shipping.css?v='), 'stilul dedicat al barei nu este încărcat cu versiune');
$check(str_contains($web, 'icon("truck")'), 'bara nu are iconul propriu de livrare');
$check(str_contains($css, '@keyframes cs-free-shipping-orbit'), 'animația barei de livrare lipsește');
$check(str_contains($css, '@keyframes cs-free-shipping-wrap-a'), 'textul barei nu este animat');
$check(str_contains($css, '.cs-free-shipping-bar__track > span {'), 'stilul textului principal lipsește');
$check(str_contains($css, '@media (max-width: 760px)'), 'bara nu are adaptare pentru telefon');
$check(str_contains($css, '@media (prefers-reduced-motion: reduce)'), 'bara nu respectă preferința de mișcare redusă');

echo "free_shipping_banner_contract_test: OK\n";

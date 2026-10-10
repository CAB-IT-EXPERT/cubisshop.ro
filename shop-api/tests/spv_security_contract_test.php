<?php
declare(strict_types=1);

$root = dirname(__DIR__, 2);
$clientFiles = [
    $root . '/services/shopApi.ts',
    $root . '/components/ShopModuleScreen.tsx',
    $root . '/components/ShopInvoicesManager.tsx',
    $root . '/components/ShopSpvManager.tsx',
    $root . '/components/ShopNotificationsButton.tsx',
    $root . '/electron-app/renderer/js/shop-api.js',
    $root . '/electron-app/renderer/js/shop-commerce.js',
    $root . '/electron-app/renderer/js/shell.js',
];
$forbidden = ['anaf_oauth_client_secret', 'spv_encryption_key', '3b9bdc'];
foreach ($clientFiles as $file) {
    $contents = (string)file_get_contents($file);
    foreach ($forbidden as $needle) {
        if (stripos($contents, $needle) !== false) throw new RuntimeException(basename($file) . ' expune un secret SPV în client.');
    }
}
$api = (string)file_get_contents($root . '/shop-api/api.php');
$config = (string)file_get_contents($root . '/shop-api/config.example.php');
$spvService = (string)file_get_contents($root . '/shop-api/spv-service.php');
if (!str_contains($config, "'anaf_oauth_client_secret' => \$env('CUBIS_ANAF_CLIENT_SECRET')")) throw new RuntimeException('Secretul OAuth trebuie citit exclusiv din mediul Cubis.');
if (!str_contains($config, "'spv_enabled' => \$flag('CUBIS_SPV_ENABLED', false)")) throw new RuntimeException('SPV trebuie să fie dezactivat implicit în Cubis Shop.');
if (!str_contains($config, 'https://api.anaf.ro/test/FCTEL/rest') || str_contains($config, "'anaf_efactura_test_url' => 'https://webserviceapl.anaf.ro")) throw new RuntimeException('Gateway-ul e-Factura OAuth trebuie să fie api.anaf.ro, nu varianta mTLS.');
if (!str_contains($spvService, "'litespeed_finish_request'")) throw new RuntimeException('Workerul SPV oportunist nu rulează după răspuns pe hostingul LiteSpeed.');
if (!str_contains($spvService, "'fastcgi_finish_request'")) throw new RuntimeException('Workerul SPV oportunist nu păstrează compatibilitatea PHP-FPM.');
$requiredActions = ['getSpvConnection', 'beginSpvOAuth', 'testSpvConnection', 'runSpvDiagnostics', 'pollSpvDiagnostics', 'updateSpvSettings', 'disconnectSpv', 'sendInvoiceToSpv', 'runSpvWorker', 'getShopNotificationSummary', 'listShopNotifications', 'markShopNotificationRead'];
foreach ($requiredActions as $action) if (!str_contains($api, "'{$action}'")) throw new RuntimeException("Acțiunea API {$action} lipsește.");
$desktopApi = (string)file_get_contents($root . '/electron-app/renderer/js/shop-api.js');
foreach (['runSpvDiagnostics', 'pollSpvDiagnostics'] as $action) if (!str_contains($desktopApi, $action)) throw new RuntimeException("Clientul desktop nu expune acțiunea sigură {$action}.");
$mobileShell = (string)file_get_contents($root . '/components/ShopModuleScreen.tsx');
$mobileInvoices = (string)file_get_contents($root . '/components/ShopInvoicesManager.tsx');
$desktopShell = (string)file_get_contents($root . '/electron-app/renderer/index.html');
$desktopInvoices = (string)file_get_contents($root . '/electron-app/renderer/js/shop-commerce.js');
if (str_contains($mobileShell, "setView('spv')") || str_contains($mobileShell, '<ShopSpvManager')) throw new RuntimeException('Interfața SPV nu trebuie să fie accesibilă în aplicația mobilă.');
if (str_contains($mobileInvoices, 'shopApi.sendInvoiceToSpv')) throw new RuntimeException('Factura mobilă nu trebuie să expună transmiterea SPV.');
if (str_contains($desktopShell, 'data-tab="shop-spv"') || str_contains($desktopInvoices, "'shop-spv'")) throw new RuntimeException('Interfața SPV nu trebuie să fie accesibilă în aplicația desktop.');
if (str_contains($desktopInvoices, 'window.SHOP_API.sendInvoiceToSpv')) throw new RuntimeException('Factura desktop nu trebuie să expună transmiterea SPV.');
$protection = (string)file_get_contents($root . '/shop-api/.htaccess');
foreach (['\.local\.php', 'spv-runtime', 'spv-cron'] as $protected) if (!str_contains($protection, $protected)) throw new RuntimeException("Protecția HTTP lipsește pentru {$protected}.");
$callback = (string)file_get_contents($root . '/shop-api/anaf-oauth-callback.php');
if (!str_contains($callback, 'completeOAuth') || !str_contains($callback, 'Content-Security-Policy')) throw new RuntimeException('Callback-ul OAuth nu finalizează securizat schimbul de token.');
echo "SPV security contract tests passed.\n";

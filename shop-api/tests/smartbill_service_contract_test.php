<?php
declare(strict_types=1);

require_once dirname(__DIR__) . '/smartbill-service.php';

function smartBillAssert(bool $condition, string $message): void {
    if (!$condition) throw new RuntimeException($message);
}

final class SmartBillDummyPdo extends PDO {
    public function __construct() {}
}

$calls = [];
CubisSmartBillService::setTransport(static function (string $method, string $url, array $headers, ?array $body) use (&$calls): array {
    $calls[] = compact('method', 'url', 'headers', 'body');
    return ['status' => 200, 'body' => json_encode(['ok' => true])];
});
$reflection = new ReflectionClass(CubisSmartBillService::class);
$send = $reflection->getMethod('send');
$result = $send->invoke(null, 'GET', 'https://example.invalid/read-only', ['Authorization: Bearer mock-secret'], null);
smartBillAssert(($result['status'] ?? 0) === 200, 'Transportul injectabil trebuie să returneze răspunsul mock.');
smartBillAssert(count($calls) === 1 && $calls[0]['method'] === 'GET', 'Testul mock nu trebuie să execute o cerere externă.');

$dummyDb = new SmartBillDummyPdo();
$mockConfig = [
    'smartbill_read_enabled' => true,
    'smartbill_v1_email' => 'mock@example.invalid',
    'smartbill_v1_token' => 'mock-v1-token',
    'smartbill_v3_token' => 'mock-v3-token',
    'smartbill_cif' => 'RO12345678',
];

$stockCalls = 0;
CubisSmartBillService::setTransport(static function (string $method, string $url, array $headers, ?array $body) use (&$stockCalls): array {
    $stockCalls++;
    smartBillAssert($method === 'GET', 'Citirea stocului trebuie să fie read-only.');
    smartBillAssert(str_contains($url, '/stocks?'), 'Stocul trebuie citit prin endpointul SmartBill V1 /stocks.');
    smartBillAssert(str_contains($url, 'warehouseName=Gestiune%20Test'), 'Cererea trebuie să conțină gestiunea exactă.');
    smartBillAssert(str_contains($url, 'productCode=SKU-TEST'), 'Cererea trebuie să conțină SKU-ul exact.');
    return ['status' => 200, 'body' => json_encode([
        'list' => [[
            'warehouse' => ['warehouseName' => 'Gestiune Test'],
            'products' => [
                ['productCode' => 'SKU-TEST', 'quantity' => 7.5],
                ['productCode' => 'ALT-SKU', 'quantity' => 999],
            ],
        ]],
    ])];
});
$stock = CubisSmartBillService::stock($dummyDb, $mockConfig, 'SKU-TEST', 'Gestiune Test', true);
smartBillAssert($stockCalls === 1, 'Verificarea fresh a stocului trebuie să folosească o singură cerere reușită.');
smartBillAssert(($stock['found'] ?? false) === true && abs((float)$stock['quantity'] - 7.5) < 0.0001, 'Parserul trebuie să citească structura oficială gestiune -> produse.');

$retryCalls = 0;
CubisSmartBillService::setTransport(static function () use (&$retryCalls): array {
    $retryCalls++;
    if ($retryCalls === 1) return ['status' => 429, 'body' => json_encode(['message' => 'rate limited'])];
    return ['status' => 200, 'body' => json_encode([
        'list' => [[
            'warehouse' => ['warehouseName' => 'Gestiune Test'],
            'products' => [['productCode' => 'SKU-TEST', 'quantity' => 4]],
        ]],
    ])];
});
$retriedStock = CubisSmartBillService::stock($dummyDb, $mockConfig, 'SKU-TEST', 'Gestiune Test', true);
smartBillAssert($retryCalls === 2 && (float)$retriedStock['quantity'] === 4.0, 'HTTP 429 trebuie reîncercat controlat, fără serviciu extern real.');

$v3Headers = [];
CubisSmartBillService::setTransport(static function (string $method, string $url, array $headers) use (&$v3Headers): array {
    $v3Headers = $headers;
    return ['status' => 200, 'body' => json_encode(['items' => []])];
});
$v3 = $reflection->getMethod('v3');
$v3->invoke(null, $dummyDb, $mockConfig, 'GET', '/companies/RO12345678/products', ['code' => 'SKU-TEST'], null, false);
smartBillAssert(in_array('Authorization: Bearer mock-v3-token', $v3Headers, true), 'SmartBill V3 trebuie să folosească autentificarea Bearer exclusiv server-side.');

$publicResponse = $reflection->getMethod('publicInvoiceResponse')->invoke(null, [
    'series' => 'CUB',
    'number' => '126',
    'documentId' => 'mock-document',
    'token' => 'must-not-leak',
]);
smartBillAssert(($publicResponse['number'] ?? '') === '126' && !array_key_exists('token', $publicResponse), 'Răspunsul către client trebuie să excludă orice secret.');

$credentialConfig = ['smartbill_credential_key' => str_repeat('k', 48)];
$credentialPayload = [
    'smartbill_v1_email' => 'smartbill@example.invalid',
    'smartbill_v1_token' => 'mock-v1-secret-value',
    'smartbill_v3_token' => 'mock-v3-secret-value-for-contract-test',
    'smartbill_cif' => 'RO12345678',
];
if (function_exists('openssl_encrypt')) {
    $encrypted = $reflection->getMethod('encryptCredentials')->invoke(null, $credentialConfig, $credentialPayload);
    smartBillAssert(!str_contains($encrypted, 'mock-v1-secret-value') && !str_contains($encrypted, 'mock-v3-secret-value'), 'Seiful SmartBill nu trebuie să păstreze secrete în clar.');
    $key = $reflection->getMethod('credentialKey')->invoke(null, $credentialConfig);
    $fingerprint = substr(hash('sha256', $key), 0, 16);
    $decrypted = $reflection->getMethod('decryptCredentials')->invoke(null, $credentialConfig, $encrypted, $fingerprint);
    smartBillAssert($decrypted === $credentialPayload, 'Credențialele criptate trebuie să poată fi decriptate numai cu cheia serverului.');
    $badKeyRejected = false;
    try {
        $reflection->getMethod('decryptCredentials')->invoke(null, ['smartbill_credential_key' => str_repeat('x', 48)], $encrypted, $fingerprint);
    } catch (Throwable) {
        $badKeyRejected = true;
    }
    smartBillAssert($badKeyRejected, 'O altă cheie server-side nu trebuie să poată deschide seiful SmartBill.');
} else {
    $opensslRequired = false;
    try {
        $reflection->getMethod('encryptCredentials')->invoke(null, $credentialConfig, $credentialPayload);
    } catch (Throwable $error) {
        $opensslRequired = str_contains($error->getMessage(), 'OpenSSL');
    }
    smartBillAssert($opensslRequired, 'Fără OpenSSL, salvarea credențialelor trebuie refuzată explicit.');
}

$source = (string)file_get_contents(dirname(__DIR__) . '/smartbill-service.php');
smartBillAssert(str_contains($source, "'useStock' => true"), 'Factura SmartBill trebuie să folosească stocul SmartBill.');
smartBillAssert(str_contains($source, "'warehouseName'"), 'Fiecare linie de produs trebuie să trimită gestiunea SmartBill.');
smartBillAssert(str_contains($source, "smartbill_issuing_enabled"), 'Emiterea trebuie protejată de un flag server-side separat.');
smartBillAssert(str_contains($source, "aes-256-gcm"), 'Credențialele introduse în administrare trebuie criptate autenticat.');
smartBillAssert(str_contains($source, "documented_write_blocked"), 'Operațiile fiscale documentate trebuie raportate fără a fi executate în etapa de validare.');
smartBillAssert(str_contains($source, "payment_status") && str_contains($source, "stripe_paid_at"), 'Plata cu cardul trebuie inclusă numai după confirmarea webhookului Stripe.');
smartBillAssert(str_contains($source, "'sending'") && str_contains($source, "'external_success'"), 'Idempotenta trebuie să distingă emiterea în curs de succesul extern recuperabil.');
smartBillAssert(str_contains($source, 'este deja în curs sau are un rezultat extern incert'), 'O a doua cerere concurentă nu trebuie să emită încă o factură.');
smartBillAssert(str_contains($source, 'Selectează explicit gestiunea SmartBill pentru acest produs.'), 'Asocierea nu trebuie să folosească implicit aceeași gestiune pentru toate produsele.');
smartBillAssert(str_contains($source, 'autoSyncReferences($db, $config, true)'), 'Emiterea trebuie să forțeze sincronizarea referințelor SmartBill înainte de facturare.');
smartBillAssert(str_contains($source, 'syncWarehouses') && str_contains($source, 'syncSeries'), 'Sincronizarea automată trebuie să actualizeze independent gestiunile V3 și seriile V1.');
smartBillAssert(!preg_match('/sb_(?:live|test)_[A-Za-z0-9._-]{20,}/i', $source), 'Fișierul nu trebuie să conțină tokenuri SmartBill.');

$apiSource = (string)file_get_contents(dirname(__DIR__) . '/api.php');
smartBillAssert(str_contains($apiSource, "saveSmartBillCredentials") && str_contains($apiSource, "listSmartBillProducts"), 'API-ul trebuie să expună configurarea securizată și nomenclatorul read-only numai prin acțiuni dedicate.');
smartBillAssert(str_contains($apiSource, 'Produsele comenzii nu mai pot fi adăugate, șterse sau înlocuite după emiterea facturii.'), 'Backendul trebuie să blocheze modificarea produselor după facturare.');
smartBillAssert(str_contains($apiSource, '$fiscalLocked = $hasCorrectionDocuments || !empty($positiveInvoices);'), 'Redenumirea produsului din catalog nu trebuie să rescrie comenzile deja facturate.');
smartBillAssert(str_contains($apiSource, 'if ($customerDataChanged || $deliveryDataChanged)') && str_contains($apiSource, 'Datele clientului și livrării nu mai pot fi modificate după emiterea facturii'), 'Backendul trebuie să blocheze datele clientului și livrării după emiterea oricărei facturi.');

$projectRoot = dirname(__DIR__, 2);
$mobileOrders = (string)file_get_contents($projectRoot . '/components/ShopOrdersManager.tsx');
smartBillAssert(str_contains($mobileOrders, 'const canAddProducts = Boolean(selected') && str_contains($mobileOrders, '&& !selected.invoice);'), 'Aplicația mobilă trebuie să dezactiveze adăugarea produselor după facturare.');
smartBillAssert(str_contains($mobileOrders, 'const editable = !selected.invoice'), 'Aplicația mobilă trebuie să dezactiveze înlocuirea produselor după facturare.');
smartBillAssert(str_contains($mobileOrders, 'Factura emisă este un snapshot fiscal'), 'Aplicația mobilă trebuie să explice că factura emisă nu se regenerează.');
smartBillAssert(str_contains($mobileOrders, 'const canEditOrderIdentity = !selected.invoice;') && str_contains($mobileOrders, 'canEdit={!selected.invoice}'), 'Aplicația mobilă trebuie să blocheze clientul și livrarea după facturare.');
smartBillAssert(str_contains($mobileOrders, 'address: canEditOrderIdentity ? deliveryAddress.trim() : undefined'), 'Aplicația mobilă nu trebuie să trimită date de livrare pentru o comandă facturată.');
$mobileConfigurator = (string)file_get_contents($projectRoot . '/components/ShopInvoiceConfigurator.tsx');
smartBillAssert(!str_contains($mobileConfigurator, 'saveSmartBillCredentials') && !str_contains($mobileConfigurator, 'secureTextEntry'), 'Aplicația mobilă nu trebuie să expună formularul de credențiale SmartBill.');
smartBillAssert(!str_contains($mobileConfigurator, 'Nomenclator produse') && !str_contains($mobileConfigurator, 'Gestiuni disponibile'), 'Configuratorul mobil nu trebuie să afișeze nomenclatorul sau lista globală de gestiuni.');
$mobileApi = (string)file_get_contents($projectRoot . '/services/shopApi.ts');
smartBillAssert(!str_contains($mobileApi, 'saveSmartBillCredentials') && !str_contains($mobileApi, 'listSmartBillProducts'), 'Clientul mobil nu trebuie să includă operații de conectare sau nomenclator global SmartBill.');
$mobileAutoSync = (string)file_get_contents($projectRoot . '/components/SmartBillAutoSync.tsx');
$mobileLayout = (string)file_get_contents($projectRoot . '/app/_layout.tsx');
smartBillAssert(str_contains($mobileAutoSync, 'setInterval') && str_contains($mobileAutoSync, 'AppState.addEventListener') && str_contains($mobileAutoSync, 'getSmartBillSettings'), 'Aplicația mobilă trebuie să sincronizeze SmartBill la pornire, periodic și la revenirea în prim-plan.');
smartBillAssert(str_contains($mobileLayout, '<SmartBillAutoSync />'), 'Sincronizarea SmartBill trebuie montată global în aplicația mobilă.');
$mobileProducts = (string)file_get_contents($projectRoot . '/components/ShopProductsManager.tsx');
smartBillAssert(str_contains($mobileProducts, 'smartbill_warehouse_id') && str_contains($mobileProducts, 'lookupSmartBillSku'), 'Aplicația mobilă trebuie să păstreze SKU-ul și gestiunea SmartBill exclusiv în fișa produsului.');
smartBillAssert(str_contains($mobileProducts, "AppState.addEventListener('change'") && str_contains($mobileProducts, 'setInterval(() => void refreshSmartBillSettings()'), 'Fișa produsului mobil trebuie să primească automat gestiunile SmartBill noi.');

$desktopOrders = (string)file_get_contents($projectRoot . '/electron-app/renderer/js/shop-commerce.js');
$desktopApi = (string)file_get_contents($projectRoot . '/electron-app/renderer/js/shop-api.js');
smartBillAssert(str_contains($desktopOrders, 'const invoiceLocked = Boolean(order.invoice);'), 'Aplicația desktop trebuie să detecteze factura emisă.');
smartBillAssert(str_contains($desktopOrders, '&& !invoiceLocked;'), 'Aplicația desktop trebuie să dezactiveze adăugarea produselor după facturare.');
smartBillAssert(str_contains($desktopOrders, 'redenumirea produsului în catalog nu o regenerează'), 'Aplicația desktop trebuie să explice că factura emisă nu se regenerează.');
smartBillAssert(str_contains($desktopOrders, 'const customerEditAllowed = !invoiceLocked;') && str_contains($desktopOrders, "const deliveryEditAction = invoiceLocked"), 'Aplicația desktop trebuie să blocheze clientul și livrarea după facturare.');
smartBillAssert(str_contains($desktopOrders, 'address: orderIdentityEditAllowed ? address : undefined'), 'Aplicația desktop nu trebuie să trimită date de livrare pentru o comandă facturată.');
smartBillAssert(!str_contains($desktopOrders, 'saveSmartBillCredentials') && !str_contains($desktopOrders, 'Conectare securizată SmartBill'), 'Aplicația desktop nu trebuie să expună formularul de credențiale SmartBill.');
smartBillAssert(!str_contains($desktopOrders, 'Nomenclator produse') && !str_contains($desktopOrders, 'Gestiuni disponibile'), 'Configuratorul desktop nu trebuie să afișeze nomenclatorul sau lista globală de gestiuni.');
smartBillAssert(!str_contains($desktopApi, 'saveSmartBillCredentials') && !str_contains($desktopApi, 'listSmartBillProducts'), 'Clientul desktop nu trebuie să includă operații de conectare sau nomenclator global SmartBill.');
smartBillAssert(str_contains($desktopOrders, 'startSmartBillAutoSync') && str_contains($desktopOrders, "window.addEventListener('focus'"), 'Aplicația desktop trebuie să sincronizeze SmartBill la pornire, periodic și la revenirea în prim-plan.');
smartBillAssert(str_contains($desktopOrders, 'shop-smartbill-product-warehouse') && str_contains($desktopOrders, 'linkProductSmartBill'), 'Aplicația desktop trebuie să păstreze SKU-ul și gestiunea SmartBill exclusiv în fișa produsului.');
smartBillAssert(str_contains($desktopOrders, "fillSelect(warehouseSelect, settings.warehouses || []"), 'Fișa produsului desktop trebuie să primească automat gestiunile SmartBill noi.');

CubisSmartBillService::setTransport(null);
echo "SmartBill service contract: OK\n";

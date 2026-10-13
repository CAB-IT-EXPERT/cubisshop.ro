<?php
declare(strict_types=1);

if (!function_exists('mb_strtolower')) { function mb_strtolower(string $value): string { return strtolower($value); } }
if (!function_exists('mb_substr')) { function mb_substr(string $value, int $start, ?int $length = null): string { return $length === null ? substr($value, $start) : substr($value, $start, $length); } }

require_once __DIR__ . '/../order-emails.php';
require_once __DIR__ . '/../order-admin-notifications.php';
require_once __DIR__ . '/../newsletter.php';
require_once __DIR__ . '/../invoice-service.php';

$root = dirname(__DIR__, 2);
$directory = $root . '/reports/cubis-email-design-20261013';
if (!is_dir($directory) && !mkdir($directory, 0777, true) && !is_dir($directory)) {
    throw new RuntimeException('Directorul de preview nu a putut fi creat.');
}

$config = [
    'website_base_url' => 'https://cubisshop.ro',
    'public_base_url' => 'https://cubisshop.ro/shop-api',
    'order_email_logo_url' => 'http://127.0.0.1:4173/assets/cubis-shop-logo.png',
];
$order = [
    'id' => 'preview-order',
    'order_number' => 'CS-20261013-488CA417',
    'tracking_token' => str_repeat('a', 32),
    'created_at' => '2026-10-13 09:40:00',
    'status' => 'confirmed',
    'payment_method' => 'card',
    'payment_status' => 'paid',
    'customer_name' => 'Alexie Popescu',
    'customer_email' => 'client@example.test',
    'customer_phone' => '0726 285 155',
    'customer_type' => 'individual',
    'address' => 'Intrarea Humulești 6A',
    'city' => 'București',
    'county' => 'București',
    'shipping_method_name' => 'Livrare rapidă',
    'subtotal' => 119.90,
    'discount_total' => 11.99,
    'promotion_code' => 'CUBIS10',
    'promotion_scope' => 'order',
    'shipping_cost' => 5,
    'total' => 112.91,
    'currency' => 'RON',
    'items' => [[
        'product_name' => 'Termos inox Trek 750 ml',
        'product_sku' => 'CUBIS-DEMO-021',
        'quantity' => 1,
        'unit_price' => 119.90,
        'line_total' => 119.90,
        'image_url' => 'http://127.0.0.1:4173/assets/cubis-shop-icon.png',
    ]],
];

$previews = [
    'status-client.html' => gtBuildOrderEmail($order, $config, 'confirmed')['html'],
    'comanda-interna.html' => gtBuildAdminOrderNotificationEmail($order, $config, 'new_order_confirmed')['html'],
    'anulare.html' => gtBuildOrderCancellationEmail(array_replace($order, ['customer_cancellation_reason' => 'Comanda a fost plasată din greșeală.']), $config)['html'],
    'retur.html' => gtBuildOrderReturnRequestEmail(array_replace($order, ['return_reason' => 'Produsul nu se potrivește.', 'return_bank_account_holder' => 'Alexie Popescu', 'return_bank_iban' => 'RO49AAAA1B31007593840000', 'return_shipping_cost' => 20, 'return_refund_amount' => 92.91]), $config)['html'],
    'factura.html' => GtrotsInvoiceService::buildEmail(['series' => 'CS', 'invoice_number' => '1048', 'currency' => 'RON', 'total' => 112.91, 'document_status' => 'paid', 'customer_name' => 'Alexie Popescu', 'order_number' => 'CS-20261013-488CA417'], $config)['html'],
    'newsletter.html' => shopNewsletterProductEmail($config, ['full_name' => 'Alexie Popescu', 'unsubscribe_token' => str_repeat('b', 64)], ['name' => 'Termos inox Trek 750 ml', 'slug' => 'termos-inox-trek-750-ml', 'short_description' => 'Un produs nou, verificat și pregătit pentru comenzile Cubis Shop.', 'price' => 119.90, 'images' => [['url' => 'http://127.0.0.1:4173/assets/cubis-shop-icon.png']]])['html'],
];

foreach ($previews as $file => $html) file_put_contents($directory . '/' . $file, $html);
echo "Cubis email previews: " . count($previews) . "\n";

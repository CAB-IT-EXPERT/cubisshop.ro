<?php
declare(strict_types=1);

function stripeFailedStockAssert(bool $condition, string $message): void {
    if (!$condition) {
        fwrite(STDERR, "stripe_failed_checkout_stock_contract_test: {$message}\n");
        exit(1);
    }
}

$source = file_get_contents(__DIR__ . '/../stripe.php');
stripeFailedStockAssert(is_string($source), 'stripe.php nu poate fi citit.');
$apiSource = file_get_contents(__DIR__ . '/../api.php');
stripeFailedStockAssert(is_string($apiSource), 'api.php nu poate fi citit.');

$start = strpos($source, 'function stripeDiscardUnpaidCheckout');
$end = strpos($source, 'function stripeApplyCheckoutSession', $start === false ? 0 : $start);
stripeFailedStockAssert($start !== false && $end !== false && $end > $start, 'Funcția de eliminare a checkout-ului Stripe nu a fost găsită.');
$block = substr($source, $start, $end - $start);

stripeFailedStockAssert(
    !str_contains($block, 'UPDATE shop_products SET stock_quantity'),
    'O sesiune Stripe neplătită nu trebuie să mărească stocul produsului.'
);
stripeFailedStockAssert(
    !str_contains($block, "movement_type, quantity_delta") && !str_contains($block, "'return'"),
    'Anularea unei sesiuni neplătite nu trebuie să inventeze o mișcare de retur.'
);
stripeFailedStockAssert(
    !str_contains($block, 'payment_status = "failed"') && !str_contains($block, 'status = "cancelled"'),
    'Checkout-ul neplătit nu trebuie păstrat ca o comandă eșuată sau anulată.'
);
stripeFailedStockAssert(
    str_contains($block, 'DELETE FROM shop_orders')
        && str_contains($block, 'DELETE FROM shop_order_items')
        && str_contains($block, 'DELETE FROM shop_order_status_history'),
    'Tentativa Stripe neplătită trebuie eliminată din registrul de comenzi.'
);
stripeFailedStockAssert(
    str_contains($block, "payment_method'] !== 'card'")
        && str_contains($block, "payment_status'] === 'paid'")
        && str_contains($block, 'shop_invoices')
        && str_contains($block, 'shop_inventory_movements'),
    'Ștergerea trebuie limitată la checkout-uri card neplătite și fără documente fiscale sau mișcări de stoc.'
);
stripeFailedStockAssert(
    substr_count($apiSource, 'stripeDiscardUnpaidCheckout(') === 2
        && str_contains($source, "checkout.session.async_payment_failed', 'checkout.session.expired")
        && substr_count($source, 'stripeDiscardUnpaidCheckout(') >= 2,
    'Inițializarea eșuată, anularea clientului și webhook-ul Stripe trebuie să elimine tentativa neplătită.'
);

echo "stripe_failed_checkout_stock_contract_test: OK\n";

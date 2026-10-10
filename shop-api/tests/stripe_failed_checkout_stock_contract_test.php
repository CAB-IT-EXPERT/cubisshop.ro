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

$start = strpos($source, 'function stripeRestoreOrderStock');
$end = strpos($source, 'function stripeApplyCheckoutSession', $start === false ? 0 : $start);
stripeFailedStockAssert($start !== false && $end !== false && $end > $start, 'Funcția de anulare Stripe nu a fost găsită.');
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
    str_contains($block, 'payment_status = "failed"') && str_contains($block, 'status = "cancelled"'),
    'Comanda trebuie marcată anulată și plata eșuată.'
);

echo "stripe_failed_checkout_stock_contract_test: OK\n";

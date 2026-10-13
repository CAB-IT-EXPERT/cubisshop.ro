<?php
declare(strict_types=1);

function checkoutPaymentLabelAssert(bool $condition, string $message): void {
    if (!$condition) throw new RuntimeException($message);
}

$root = dirname(__DIR__, 2);
$checkoutHtml = (string)file_get_contents($root . '/website/checkout.html');
$checkoutScript = (string)file_get_contents($root . '/website/cubis-checkout.mjs');
$combined = $checkoutHtml . $checkoutScript;

checkoutPaymentLabelAssert(!str_contains($combined, 'Plasează comanda cu obligație de plată'), 'Formularea veche nu trebuie sa mai apara in checkout sau in termenii publici.');
checkoutPaymentLabelAssert(str_contains($checkoutScript, '"Trimite comanda"'), 'Checkout-ul ramburs trebuie sa foloseasca formularea scurta si neambigua.');
checkoutPaymentLabelAssert(str_contains($checkoutScript, '"Continuă către plata securizată"'), 'Plata cu cardul trebuie sa explice redirectionarea catre procesator.');
checkoutPaymentLabelAssert((bool)preg_match('/cubis-checkout\.mjs\?v=[A-Za-z0-9._-]+/', $checkoutHtml), 'Checkout-ul trebuie sa forteze incarcarea unei versiuni explicite JavaScript.');

echo "checkout_payment_label_contract_test: OK\n";

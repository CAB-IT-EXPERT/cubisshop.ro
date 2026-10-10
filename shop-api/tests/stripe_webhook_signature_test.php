<?php
declare(strict_types=1);

require_once dirname(__DIR__) . '/stripe.php';

function stripeSignatureAssert(bool $condition, string $message): void {
    if (!$condition) throw new RuntimeException($message);
}

$payload = '{"id":"evt_test_cubis","livemode":false,"type":"checkout.session.completed"}';
$secret = 'whsec_local_contract_value';
$timestamp = time();
$signature = hash_hmac('sha256', $timestamp . '.' . $payload, $secret);
$header = 't=' . $timestamp . ',v1=' . $signature;

stripeSignatureAssert(stripeVerifyWebhookSignature($payload, $header, $secret), 'Semnătura TEST validă a fost refuzată.');
stripeSignatureAssert(!stripeVerifyWebhookSignature($payload . 'x', $header, $secret), 'Payloadul modificat a fost acceptat.');
stripeSignatureAssert(!stripeVerifyWebhookSignature($payload, 't=' . ($timestamp - 1000) . ',v1=' . $signature, $secret), 'Semnătura expirată a fost acceptată.');

echo "Stripe webhook signature test passed.\n";


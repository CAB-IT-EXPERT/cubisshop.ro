<?php
declare(strict_types=1);

if (!function_exists('mb_strtolower')) {
    function mb_strtolower(string $value, ?string $encoding = null): string { return strtolower($value); }
}

require_once dirname(__DIR__) . '/order-emails.php';

function passwordResetEmailAssert(bool $condition, string $message): void {
    if (!$condition) throw new RuntimeException($message);
}

$token = str_repeat('a', 64);
$email = gtBuildPasswordResetEmail(
    ['email' => 'client@example.test', 'full_name' => 'Alex Exemplu'],
    [
        'website_base_url' => 'https://cubisshop.ro',
        'order_email_logo_url' => 'https://cubisshop.ro/assets/cubis-shop-logo.png',
    ],
    $token
);

passwordResetEmailAssert(($email['subject'] ?? '') === 'Resetează parola contului tău Cubis Shop', 'Subiectul trebuie să folosească identitatea Cubis Shop.');
passwordResetEmailAssert(str_contains((string)$email['html'], 'Salut, Alex!'), 'Prenumele clientului trebuie folosit în salut.');
passwordResetEmailAssert(str_contains((string)$email['html'], 'Link unic, valabil 30 de minute'), 'Durata de valabilitate trebuie explicată.');
passwordResetEmailAssert(str_contains((string)$email['html'], 'toate sesiunile existente vor fi închise automat'), 'Închiderea sesiunilor trebuie explicată.');
passwordResetEmailAssert(str_contains((string)$email['html'], '/resetare-parola?token=' . $token . '&amp;email=client%40example.test'), 'CTA-ul trebuie să folosească ruta publică și tokenul securizat.');
passwordResetEmailAssert(str_contains((string)$email['html'], 'cubis-shop-logo.png'), 'E-mailul trebuie să folosească sigla Cubis Shop.');
passwordResetEmailAssert(!preg_match('/G-Trots|GTrots|g-trots/i', $email['subject'] . "\n" . $email['html']), 'E-mailul nu trebuie să expună identitatea veche.');

echo "password-reset-email: OK · branded template, secure route and safety copy\n";

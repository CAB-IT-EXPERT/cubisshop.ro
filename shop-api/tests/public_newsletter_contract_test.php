<?php
declare(strict_types=1);
require_once __DIR__ . '/../newsletter.php';

function expect(bool $condition, string $message): void {
    if (!$condition) throw new RuntimeException($message);
}
function expectFailure(callable $call, string $class): Throwable {
    try { $call(); } catch (Throwable $error) {
        expect($error instanceof $class, 'Unexpected failure: ' . get_class($error));
        return $error;
    }
    throw new RuntimeException('Expected ' . $class);
}

final class NewsletterMemoryPdo extends PDO {
    public array $rows = [];
    public string $sql = '';
    public bool $fail = false;
    public function __construct() {}
    public function prepare(string $query, array $options = []): PDOStatement|false {
        $this->sql = $query;
        return new NewsletterMemoryStatement($this);
    }
}
final class NewsletterMemoryStatement extends PDOStatement {
    public function __construct(private NewsletterMemoryPdo $db) {}
    public function execute(?array $params = null): bool {
        if ($this->db->fail) return false;
        [$id, $email, $normalized, $source, $token] = $params;
        if (!isset($this->db->rows[$normalized])) {
            $this->db->rows[$normalized] = [
                'id' => $id, 'email' => $email, 'status' => 'subscribed',
                'consent_source' => $source, 'consent_at' => 'new-consent',
                'unsubscribe_token' => $token, 'unsubscribed_at' => null,
            ];
        } elseif ($this->db->rows[$normalized]['status'] !== 'subscribed') {
            $this->db->rows[$normalized] = array_replace($this->db->rows[$normalized], [
                'status' => 'subscribed', 'consent_source' => $source, 'consent_at' => 'renewed-consent',
                'unsubscribe_token' => $token, 'unsubscribed_at' => null, 'last_error' => null,
            ]);
        }
        return true;
    }
}

$body = ['email' => '  CUSTOMER@Example.COM  ', 'consent' => true, 'consent_version' => SHOP_NEWSLETTER_CONSENT_VERSION, 'website' => ''];
$email = shopNewsletterPublicEmail($body);
expect($email === 'customer@example.com', 'Email normalization');
foreach ([null, [], '', 'invalid', "mail@example.com\r\nBcc: other@example.com", str_repeat('a', 181) . '@example.com'] as $invalid) {
    expectFailure(fn() => shopNewsletterPublicEmail(array_replace($body, ['email' => $invalid])), InvalidArgumentException::class);
}
foreach ([false, 'true', 1, null] as $invalid) {
    expectFailure(fn() => shopNewsletterPublicEmail(array_replace($body, ['consent' => $invalid])), InvalidArgumentException::class);
}
expectFailure(fn() => shopNewsletterPublicEmail(array_replace($body, ['consent_version' => 'old'])), InvalidArgumentException::class);
expectFailure(fn() => shopNewsletterPublicEmail(array_replace($body, ['website' => 'https://bot.example'])), InvalidArgumentException::class);

$db = new NewsletterMemoryPdo();
$result = shopNewsletterSubscribePublic($db, $email);
expect($result['success'] === true && count($result) === 2, 'Generic confirmed success, no identifiers');
expect((bool)preg_match('/^[a-f0-9]{64}$/', $db->rows[$email]['unsubscribe_token']), 'Secure unsubscribe token');
$db->rows[$email] += ['full_name' => 'Existing customer', 'phone' => 'phone', 'last_consent_order_id' => 'order', 'last_notified_at' => 'delivery', 'last_error' => 'existing error'];
$existing = $db->rows[$email];
expect(shopNewsletterSubscribePublic($db, $email) === $result, 'No subscriber enumeration');
expect($db->rows[$email] === $existing, 'Existing subscription idempotence');
$db->rows[$email]['status'] = 'unsubscribed';
$db->rows[$email]['unsubscribed_at'] = 'previous date';
shopNewsletterSubscribePublic($db, $email);
expect($db->rows[$email]['status'] === 'subscribed', 'Explicit resubscription');
expect($db->rows[$email]['unsubscribe_token'] !== $existing['unsubscribe_token'], 'Rotate token on resubscription');
expect($db->rows[$email]['full_name'] === $existing['full_name'] && $db->rows[$email]['last_consent_order_id'] === 'order', 'Preserve customer/order metadata');
$updates = explode('ON DUPLICATE KEY UPDATE', $db->sql)[1];
foreach (['full_name', 'phone', 'last_consent_order_id', 'last_notified_at'] as $field) {
    expect(!str_contains($updates, $field), 'No overwrite of ' . $field);
}
expect(str_ends_with(trim($updates), "status = 'subscribed'"), 'Status assignment after old-status conditionals');
expect(substr_count($updates, "CASE WHEN status <> 'subscribed'") === 4, 'Real SQL preserves active consent/token/errors');
expect(!str_contains($db->sql, 'CREATE TABLE'), 'Reuse registry, no schema changes');
$db->fail = true;
expectFailure(fn() => shopNewsletterSubscribePublic($db, 'failed@example.com'), RuntimeException::class);

$directory = sys_get_temp_dir() . '/cubis-newsletter-test-' . bin2hex(random_bytes(8));
expect(mkdir($directory, 0700), 'Create isolated test storage');
$file = $directory . '/requests.json';
$config = ['api_key' => 'test-only-not-a-real-key'];
try {
    for ($i = 0; $i < 3; $i++) shopNewsletterPublicRateLimit($email, $config, '192.0.2.1', $file, 1000);
    $failure = expectFailure(fn() => shopNewsletterPublicRateLimit($email, $config, '192.0.2.2', $file, 1001), ShopNewsletterRateLimitException::class);
    expect($failure->retryAfterSeconds === 3599, 'Email limit across IPs with Retry-After');
    $contents = file_get_contents($file);
    expect(!str_contains($contents, $email) && !str_contains($contents, '192.0.2'), 'No raw personal identifiers in rate storage');
    for ($i = 0; $i < 7; $i++) shopNewsletterPublicRateLimit("other$i@example.com", $config, '192.0.2.1', $file, 1001);
    expectFailure(fn() => shopNewsletterPublicRateLimit('another@example.com', $config, '192.0.2.1', $file, 1002), ShopNewsletterRateLimitException::class);
    shopNewsletterPublicRateLimit('after-ip-expiry@example.com', $config, '192.0.2.1', $file, 1900);
    shopNewsletterPublicRateLimit($email, $config, '192.0.2.1', $file, 4600);
    expectFailure(fn() => shopNewsletterPublicRateLimit($email, [], '192.0.2.1', $file, 4600), RuntimeException::class);
    file_put_contents($file, '{corrupt');
    expectFailure(fn() => shopNewsletterPublicRateLimit($email, $config, '192.0.2.1', $file, 4600), JsonException::class);
    file_put_contents($file, str_repeat('x', 262145));
    expectFailure(fn() => shopNewsletterPublicRateLimit($email, $config, '192.0.2.1', $file, 4600), RuntimeException::class);
    expectFailure(fn() => shopNewsletterPublicRateLimit($email, $config, '192.0.2.1', $directory . '/missing/requests.json', 4600), RuntimeException::class);
} finally {
    if (is_file($file)) unlink($file);
    rmdir($directory);
}

$api = file_get_contents(__DIR__ . '/../api.php');
$route = strpos($api, "if (\$action === 'subscribePublicNewsletter')");
expect($route !== false && $route < strpos($api, '$currentUser = validateAuthToken'), 'Public route before admin authentication');
$routeSource = substr($api, $route, strpos($api, "if (\$action === 'publicActivePromotions'", $route) - $route);
foreach (["\$method !== 'POST'", "'Allow: POST'", '405', '429', 'Retry-After:', '503', 'shopNewsletterPublicEmail($body)', "\$_SERVER['REMOTE_ADDR']"] as $requirement) {
    expect(str_contains($routeSource, $requirement), 'Route contract: ' . $requirement);
}
expect(!str_contains($routeSource, 'shopNewsletterEnsureSchema'), 'No runtime schema mutations in endpoint');
echo "public-newsletter: OK — validation, consent, dedup/resubscribe, preserved metadata, private rate limits, failures, public POST routing (no real database/mail).\n";

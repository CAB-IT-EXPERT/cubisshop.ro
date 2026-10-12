<?php
declare(strict_types=1);

$root = dirname(__DIR__, 2);
$api = (string)file_get_contents($root . '/shop-api/api.php');
$storefront = (string)file_get_contents($root . '/website/cubis-storefront.mjs');
$homepage = (string)file_get_contents($root . '/website/cubis-home.mjs');
$failures = [];
$expect = static function (bool $condition, string $message) use (&$failures): void {
    if (!$condition) $failures[] = $message;
};

$expect(
    str_contains($api, 'p.is_featured, p.featured_rank, p.view_count, p.created_at,'),
    'Interogarea catalogului public nu citește view_count și created_at.'
);
$expect(
    str_contains($api, "'view_count' => max(0, (int)(\$row['view_count'] ?? 0))")
        && str_contains($api, "'created_at' => (string)(\$row['created_at'] ?? '')"),
    'Forma publică a produsului nu expune metadatele pentru popularitate și noutate.'
);
$expect(
    str_contains($api, "max(0, (int)(\$product['view_count'] ?? 0)),")
        && str_contains($api, "(string)(\$product['created_at'] ?? ''),"),
    'Payload-ul compact al catalogului nu include view_count și created_at.'
);
$expect(
    str_contains($storefront, '"review_count", "review_average", "view_count", "created_at"')
        && str_contains($storefront, 'viewCount:')
        && str_contains($storefront, 'createdAt:'),
    'Storefront-ul nu decodează metadatele publice adăugate.'
);
$expect(
    str_contains($homepage, 'product => product.viewCount')
        && str_contains($homepage, 'product.createdAt'),
    'Homepage-ul nu sortează produsele populare și noi după metadatele reale.'
);

if ($failures) {
    fwrite(STDERR, "Contract metadate catalog public: " . count($failures) . " verificări eșuate:\n- " . implode("\n- ", $failures) . "\n");
    exit(1);
}

echo "Contract metadate catalog public validat: view_count și created_at ajung în homepage.\n";

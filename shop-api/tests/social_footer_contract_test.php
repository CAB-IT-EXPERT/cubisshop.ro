<?php
declare(strict_types=1);

function socialFooterAssert(bool $condition, string $message): void {
    if (!$condition) throw new RuntimeException($message);
}

$root = dirname(__DIR__, 2);
$footer = (string)file_get_contents($root . '/website/legal-footer.js');

foreach ([
    'instagram.com/gtrots',
    'facebook.com/profile.php?id=61590892933228',
    'tiktok.com/@gtrots',
    'x.com/servicegtrots',
    'youtube.com/@g-trots',
] as $legacyProfile) {
    socialFooterAssert(!str_contains($footer, $legacyProfile), "Profilul social G-Trots a rămas activ: {$legacyProfile}");
}

socialFooterAssert(str_contains($footer, "function socialLinks() {\n    return '';"), 'Footerul trebuie să păstreze integrarea socială dezactivată.');
socialFooterAssert(str_contains($footer, "trade_name: 'Cubis Shop'"), 'Fallback-ul footerului trebuie să identifice Cubis Shop.');
socialFooterAssert(str_contains($footer, "phone: ''"), 'Footerul nu trebuie să păstreze numărul copiat.');

fwrite(STDOUT, "OK: profilurile sociale G-Trots sunt dezactivate.\n");

<?php
declare(strict_types=1);

$root = dirname(__DIR__, 2);
$script = (string)file_get_contents($root . '/website/service-products.js');
$styles = (string)file_get_contents($root . '/website/service-products.css');

$assert = static function (bool $condition, string $message): void {
    if (!$condition) throw new RuntimeException($message);
};

$assert(!is_file($root . '/website/service-trotinete-electrice.html'), 'Pagina service generată pentru G-Trots nu trebuie transferată în Cubis Shop.');
$assert(str_contains($script, "g-trots:live-products") && str_contains($script, 'isAvailable(product)'), 'Caruselul nu folosește catalogul live filtrat după disponibilitate.');
$assert(str_contains($script, 'raw?.is_featured') && str_contains($script, 'featured_rank'), 'Produsele recomandate nu au prioritate în carusel.');
$assert(str_contains($script, "viewport.addEventListener('pointermove'") && str_contains($script, 'requestAnimationFrame(animate)'), 'Caruselul nu este glisabil sau animat continuu.');
$assert(str_contains($styles, '@media (max-width: 700px)') && str_contains($styles, 'touch-action: pan-y'), 'Caruselul nu este adaptat pentru mobil și gesturi tactile.');

echo "service_product_carousel_contract_test: mecanism păstrat, pagina G-Trots ne-transferată.\n";

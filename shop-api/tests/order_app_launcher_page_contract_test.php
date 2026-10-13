<?php
declare(strict_types=1);

function appLauncherAssert(bool $condition, string $message): void
{
    if (!$condition) throw new RuntimeException($message);
}

$page = (string)file_get_contents(__DIR__ . '/../deschide-comanda.php');

appLauncherAssert(str_contains($page, 'https://cubisshop.ro/assets/cubis-shop-logo.png'), 'Pagina trebuie să folosească sigla publică validă Cubis Shop.');
appLauncherAssert(str_contains($page, "'cubisshop://order/'"), 'Deep link-ul către fișa comenzii trebuie păstrat.');
appLauncherAssert(str_contains($page, 'id="open-app"') && str_contains($page, 'id="status"'), 'Acțiunea și feedback-ul deschiderii aplicației lipsesc.');
appLauncherAssert(str_contains($page, 'Comanda ta este') && str_contains($page, 'Continuă în aplicație'), 'Noua prezentare Cubis Shop nu este completă.');
appLauncherAssert(str_contains($page, '@media(max-width:600px)'), 'Pagina nu are adaptare dedicată pentru telefon.');
appLauncherAssert(str_contains($page, 'prefers-reduced-motion'), 'Pagina trebuie să respecte preferința pentru animații reduse.');
appLauncherAssert(!str_contains($page, 'https://cubisshop.ro/assets/logo.png'), 'Pagina încă folosește sigla inexistentă.');

echo "order_app_launcher_page_contract_test: OK\n";

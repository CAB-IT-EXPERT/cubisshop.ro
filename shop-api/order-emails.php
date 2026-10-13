<?php
declare(strict_types=1);
require_once __DIR__ . '/email-presentation.php';

function gtOrderStatuses(): array {
    return [
        'new' => [
            'label' => 'În procesare',
            'title' => 'Am primit comanda ta',
            'message' => 'Comanda este nouă și se află în procesare. Verificăm toate detaliile înainte să începem pregătirea.',
            'color' => '#38bdf8',
            'eyebrow' => 'COMANDĂ NOUĂ',
            'symbol' => '01',
            'next_title' => 'Urmează verificarea comenzii',
            'next_message' => 'Confirmăm produsele, stocul și datele de livrare.',
        ],
        'confirmed' => [
            'label' => 'Confirmată',
            'title' => 'Comanda a fost confirmată',
            'message' => 'Am primit comanda ta, plata cu cardul a fost efectuată și comanda este confirmată.',
            'color' => '#34d399',
            'eyebrow' => 'PLATĂ EFECTUATĂ',
            'symbol' => '✓',
            'next_title' => 'Urmează pregătirea produselor',
            'next_message' => 'Nu mai ai nimic de făcut. Echipa noastră începe pregătirea comenzii.',
        ],
        'processing' => [
            'label' => 'În pregătire',
            'title' => 'Comanda este în pregătire',
            'message' => 'Produsele tale sunt pregătite și verificate înainte de predarea către curier.',
            'color' => '#fb923c',
            'eyebrow' => 'ÎN PREGĂTIRE',
            'symbol' => '02',
            'next_title' => 'Pregătim predarea către curier',
            'next_message' => 'Ambalăm produsele și pregătim documentele pentru expediere.',
        ],
        'shipped' => [
            'label' => 'Predată curierului',
            'title' => 'Comanda a fost predată curierului',
            'message' => 'Pachetul tău a plecat de la noi și se îndreaptă către adresa de livrare.',
            'color' => '#a78bfa',
            'eyebrow' => 'COMANDA ESTE PE DRUM',
            'symbol' => '03',
            'next_title' => 'Urmează livrarea',
            'next_message' => 'Curierul va continua transportul către adresa indicată în comandă.',
        ],
        'completed' => [
            'label' => 'Livrată',
            'title' => 'Comanda a fost livrată',
            'message' => 'Comanda a ajuns la destinație. Îți mulțumim că ai ales Cubis Shop.',
            'color' => '#22c55e',
            'eyebrow' => 'LIVRARE FINALIZATĂ',
            'symbol' => '✓',
            'next_title' => 'Totul este gata',
            'next_message' => 'Îți mulțumim pentru încredere. Suntem aici dacă ai nevoie de ajutor.',
        ],
        'modified' => [
            'label' => 'Comandă modificată',
            'title' => 'Comanda ta a fost modificată',
            'message' => 'Am adăugat produsele discutate și am actualizat sumarul comenzii. Mai jos găsești produsele, cantitățile, prețurile și totalul curent.',
            'color' => '#fb923c',
            'eyebrow' => 'SUMAR ACTUALIZAT',
            'symbol' => '+',
            'next_title' => 'Continuăm procesarea comenzii',
            'next_message' => 'Folosește sumarul de mai jos pentru a verifica toate produsele și valorile actualizate.',
        ],
        'return_requested' => [
            'label' => 'Retur solicitat',
            'title' => 'Retur solicitat',
            'message' => 'Solicitarea de retur pentru această comandă este în curs de verificare.',
            'color' => '#f472b6',
            'eyebrow' => 'RETUR ÎN VERIFICARE',
            'symbol' => '↶',
            'next_title' => 'Verificăm solicitarea',
            'next_message' => 'Acest status apare numai când returul este activ.',
        ],
        'return_refused' => [
            'label' => 'Retur refuzat',
            'title' => 'Solicitarea de retur a fost refuzată',
            'message' => 'Solicitarea de retur a fost verificată și nu a fost aprobată. Pentru clarificări, răspunde direct la acest e-mail.',
            'color' => '#fb7185',
            'eyebrow' => 'RETUR REFUZAT',
            'symbol' => '×',
            'next_title' => 'Ai nevoie de clarificări?',
            'next_message' => 'Acest status apare numai când este activ.',
        ],
        'return_confirmed' => [
            'label' => 'Retur confirmat',
            'title' => 'Retur confirmat',
            'message' => 'Returul a fost confirmat și urmează procesarea rambursării.',
            'color' => '#2dd4bf',
            'eyebrow' => 'RETUR CONFIRMAT',
            'symbol' => '✓',
            'next_title' => 'Urmează rambursarea',
            'next_message' => 'Acest status apare numai când returul este activ.',
        ],
        'refunded' => [
            'label' => 'Rambursată',
            'title' => 'Comanda a fost rambursată',
            'message' => 'Comanda a fost returnată, iar rambursarea a fost înregistrată. Dacă ai întrebări, răspunde direct la acest e-mail.',
            'color' => '#f59e0b',
            'eyebrow' => 'RAMBURSARE ÎNREGISTRATĂ',
            'symbol' => '↶',
            'next_title' => 'Rambursarea este înregistrată',
            'next_message' => 'Păstrează acest mesaj pentru evidență și contactează-ne dacă ai nevoie de detalii.',
        ],
        'cancelled' => [
            'label' => 'Comandă anulată',
            'title' => 'Comanda a fost anulată',
            'message' => 'Comanda nu va mai fi procesată. Dacă ai nevoie de ajutor, răspunde direct la acest e-mail.',
            'color' => '#fb7185',
            'eyebrow' => 'COMANDĂ OPRITĂ',
            'symbol' => '×',
            'next_title' => 'Ai nevoie de ajutor?',
            'next_message' => 'Răspunde direct la acest mesaj și echipa Cubis Shop îți va oferi toate detaliile.',
        ],
    ];
}

function gtOrderStatusMeta(string $status): array {
    $statuses = gtOrderStatuses();
    return $statuses[$status] ?? $statuses['new'];
}

function gtEmailEscape($value): string {
    return htmlspecialchars((string)$value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

function gtEmailMoney($value, string $currency = 'RON'): string {
    return number_format((float)$value, 2, ',', '.') . ' ' . gtEmailEscape($currency);
}

function gtOrderCustomerDisplayName(array $order): string {
    $isCompany = (string)($order['customer_type'] ?? 'individual') === 'company';
    $companyName = trim((string)($order['company_name'] ?? ''));
    $contactName = trim((string)($order['customer_contact_name'] ?? $order['customer_name'] ?? ''));
    return $isCompany && $companyName !== '' ? $companyName : $contactName;
}

function gtOrderCustomerContactName(array $order): string {
    return trim((string)($order['customer_contact_name'] ?? $order['customer_name'] ?? ''));
}

function gtEmailTrackingUrl(array $order, array $config): string {
    $base = rtrim((string)($config['website_base_url'] ?? 'https://cubisshop.ro'), '/');
    return $base . '/urmarire-comanda?token=' . rawurlencode((string)($order['tracking_token'] ?? ''));
}

function gtEmailCancellationUrl(array $order, array $config): string {
    return gtEmailTrackingUrl($order, $config) . '&anulare=1';
}

function gtEmailReturnUrl(array $order, array $config): string {
    return gtEmailTrackingUrl($order, $config) . '&retur=1';
}

/** Transformă imaginile WebP locale într-un URL JPEG compatibil cu Outlook. */
function gtEmailCompatibleImageUrl(string $imageUrl, array $config): string {
    $imageUrl = trim($imageUrl);
    if ($imageUrl === '' || !preg_match('/\.webp(?:$|\?)/i', $imageUrl)) return $imageUrl;
    $parts = parse_url($imageUrl);
    $host = strtolower((string)($parts['host'] ?? ''));
    $path = (string)($parts['path'] ?? '');
    if (!in_array($host, ['cubisshop.ro', 'www.cubisshop.ro'], true) || !str_starts_with($path, '/shop-api/uploads/products/')) return $imageUrl;
    $file = basename($path);
    if (!preg_match('/^[A-Za-z0-9][A-Za-z0-9._-]{0,180}\.webp$/i', $file)) return $imageUrl;
    $base = rtrim((string)($config['public_base_url'] ?? 'https://cubisshop.ro/shop-api'), '/');
    return $base . '/email-image.php?file=' . rawurlencode($file);
}

/** Buton bazat pe tabel, redat corect inclusiv de motorul Word din Outlook. */
function gtEmailTableButton(string $url, string $label, string $background = '#087ff5', string $color = '#ffffff'): string {
    return '<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center"><tr><td align="center" bgcolor="' . gtEmailEscape($background) . '" style="padding:17px 30px;border-radius:17px;background:' . gtEmailEscape($background) . ';box-shadow:0 12px 28px rgba(8,127,245,.22)"><a href="' . gtEmailEscape($url) . '" style="display:block;color:' . gtEmailEscape($color) . ';text-decoration:none;font-size:14px;font-weight:900;line-height:18px;mso-line-height-rule:exactly">' . gtEmailEscape($label) . '&nbsp;&nbsp;→</a></td></tr></table>';
}

function gtEmailStatusTimeline(string $status, string $paymentMethod = 'card'): string {
    $flow = ['new', 'confirmed', 'processing', 'shipped', 'completed'];
    $currentIndex = array_search($status, $flow, true);
    $terminal = in_array($status, ['refunded', 'cancelled'], true);
    $returnState = in_array($status, ['return_requested', 'return_refused', 'return_confirmed', 'refunded'], true);
    if ($currentIndex === false) $currentIndex = $returnState ? count($flow) - 1 : 0;
    $rows = '';
    foreach ($flow as $index => $value) {
        $meta = gtOrderStatusMeta($value);
        $reached = $returnState || (!$terminal && $index <= $currentIndex);
        $current = !$terminal && !$returnState && $index === $currentIndex;
        $tone = $current ? (string)$meta['color'] : ($reached ? '#087ff5' : '#9bb2c9');
        $surface = $current ? '#eef8ff' : ($reached ? '#f7fbff' : '#fbfdff');
        $border = $current ? '#9bd4fb' : '#d8e8f5';
        $stateLabel = $current ? 'ACUM' : ($reached ? 'FINALIZAT' : 'URMEAZĂ');
        $rows .= '<tr><td style="padding:0 0 8px">'
            . '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:' . $surface . ';border:1px solid ' . $border . ';border-radius:18px">'
            . '<tr><td style="width:48px;padding:11px 0 11px 12px">'
            . '<span style="display:block;width:36px;height:36px;line-height:36px;text-align:center;border-radius:13px;background:' . $tone . ';color:#ffffff;font-size:11px;font-weight:900">' . ($reached ? '✓' : str_pad((string)($index + 1), 2, '0', STR_PAD_LEFT)) . '</span></td>'
            . '<td style="padding:11px 8px"><strong style="display:block;color:#062b5b;font-size:13px;line-height:1.3">' . gtEmailEscape($meta['label']) . '</strong>'
            . '<span style="display:block;margin-top:3px;color:#6b86a3;font-size:10px;line-height:1.35">' . gtEmailEscape($meta['next_message'] ?? $meta['message']) . '</span></td>'
            . '<td align="right" style="width:72px;padding:11px 12px 11px 4px"><span style="display:inline-block;color:' . $tone . ';font-size:8px;font-weight:900;letter-spacing:.08em">' . $stateLabel . '</span></td></tr></table>'
            . '</td></tr>';
    }
    if ($terminal || $returnState) {
        $terminalMeta = gtOrderStatusMeta($status);
        $terminalTone = (string)$terminalMeta['color'];
        $rows .= '<tr><td style="padding:0"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f7fbff;border:1px solid #d8e8f5;border-radius:18px">'
            . '<tr><td style="width:48px;padding:11px 0 11px 12px"><span style="display:block;width:36px;height:36px;line-height:36px;text-align:center;border-radius:13px;background:' . $terminalTone . ';color:#ffffff;font-size:17px;font-weight:900">' . gtEmailEscape($terminalMeta['symbol']) . '</span></td>'
            . '<td style="padding:11px 8px"><strong style="display:block;color:#062b5b;font-size:13px">' . gtEmailEscape($terminalMeta['label']) . '</strong><span style="display:block;margin-top:3px;color:#6b86a3;font-size:10px">' . gtEmailEscape($terminalMeta['message']) . '</span></td>'
            . '<td align="right" style="width:72px;padding:11px 12px 11px 4px"><span style="color:' . $terminalTone . ';font-size:8px;font-weight:900;letter-spacing:.08em">ACUM</span></td></tr></table></td></tr>';
    }
    return '<table role="presentation" width="100%" cellpadding="0" cellspacing="0">' . $rows . '</table>';
}

function gtEmailQuantity($value): string {
    $quantity = round((float)$value, 4);
    return rtrim(rtrim(number_format($quantity, 4, ',', '.'), '0'), ',');
}

/** Afișează decizia exactă pe cantități în mesajele de confirmare/refuz ale returului. */
function gtEmailReturnDecisionSummary(array $order): string {
    $items = array_values(array_filter((array)($order['return_items'] ?? []), static fn($item): bool => is_array($item) && (string)($item['decision_status'] ?? 'pending') !== 'pending'));
    if (!$items) return '';
    $rows = '';
    foreach ($items as $item) {
        $requested = max(0.0, (float)($item['requested_quantity'] ?? 0));
        $accepted = max(0.0, min($requested, (float)($item['accepted_quantity'] ?? 0)));
        $refused = max(0.0, (float)($item['refused_quantity'] ?? ($requested - $accepted)));
        $reason = trim((string)($item['decision_reason'] ?? ''));
        $decisionColor = $refused > 0.00005 ? ($accepted > 0.00005 ? '#fbbf24' : '#fb7185') : '#5eead4';
        $decisionLabel = $refused > 0.00005 ? ($accepted > 0.00005 ? 'APROBAT PARȚIAL' : 'REFUZAT') : 'APROBAT INTEGRAL';
        $reasonHtml = $refused > 0.00005 && $reason !== ''
            ? '<p style="margin:9px 0 0;padding:10px 12px;border:1px solid #ffd1dc;border-radius:12px;background:#fff4f7;color:#8a3650;font-size:11px;line-height:1.5"><strong style="color:#d72e5e">Motivul refuzului:</strong> ' . gtEmailEscape($reason) . '</p>'
            : '';
        $rows .= '<div style="margin-top:10px;padding:15px;border:1px solid #d8e8f5;border-radius:18px;background:#ffffff">'
            . '<span style="display:block;color:' . $decisionColor . ';font-size:9px;font-weight:900;letter-spacing:.08em">' . $decisionLabel . '</span>'
            . '<strong style="display:block;margin-top:6px;color:#062b5b;font-size:13px;line-height:1.4;word-break:break-word;overflow-wrap:anywhere">' . gtEmailEscape($item['product_name'] ?? '') . '</strong><span style="display:block;margin-top:3px;color:#7892ad;font-size:10px">' . gtEmailEscape($item['product_sku'] ?? 'Fără SKU') . '</span>'
            . '<table role="presentation" width="100%" style="margin-top:12px;font-size:11px"><tr><td style="color:#607e9c">Solicitată <strong style="color:#062b5b">' . gtEmailQuantity($requested) . '</strong></td><td align="center" style="color:#07834c">Acceptată <strong>' . gtEmailQuantity($accepted) . '</strong></td><td align="right" style="color:#d72e5e">Refuzată <strong>' . gtEmailQuantity($refused) . '</strong></td></tr></table>'
            . $reasonHtml . '</div>';
    }
    return '<div style="margin-top:18px;padding:18px;border:1px solid #cfe4f5;border-radius:24px;background:#f4faff"><span style="display:block;color:#5f82a4;font-size:9px;font-weight:900;letter-spacing:.12em">DECIZIA PE FIECARE PRODUS</span>' . $rows . '</div>';
}

/** Cadru comun pentru mesajele speciale de anulare și retur. */
function gtEmailSpecialStatusDocument(
    string $logoUrl,
    string $preheader,
    string $statusLabel,
    string $eyebrow,
    string $title,
    string $message,
    string $accent,
    string $content,
    string $button,
    string $footer = ''
): string {
    return '<!doctype html><html lang="ro"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light">'
        . '<style>body,table,td,a{-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%}table{border-spacing:0;mso-table-lspace:0pt;mso-table-rspace:0pt}img{border:0;outline:none}@media(max-width:600px){.gt-special-wrap{padding:10px 7px!important}.gt-special-shell{border-radius:24px!important}.gt-special-body{padding:23px 17px 27px!important}.gt-special-logo{width:145px!important}.gt-special-title{font-size:33px!important}.gt-special-status{display:none!important}}</style></head>'
        . '<body data-gt-email="light-v1" bgcolor="#eaf5ff" style="margin:0;background:#eaf5ff;color:#062b5b;font-family:Arial,\'Segoe UI\',sans-serif;-webkit-font-smoothing:antialiased">'
        . '<div style="display:none;max-height:0;overflow:hidden;opacity:0">' . $preheader . '</div>'
        . '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#eaf5ff" style="width:100%;background:#eaf5ff"><tr><td class="gt-special-wrap" align="center" style="padding:34px 14px">'
        . '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="gt-special-shell" bgcolor="#ffffff" style="width:100%;max-width:680px;overflow:hidden;border:1px solid #b9dcf7;border-radius:34px;background:#ffffff;box-shadow:0 24px 70px rgba(4,59,115,.14)">'
        . '<tr><td style="height:7px;background:#0788f7;background-image:linear-gradient(90deg,#087ff5,#12c3df 72%,' . $accent . ')"></td></tr><tr><td class="gt-special-body" style="padding:30px 32px 34px">'
        . '<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td><img class="gt-special-logo" src="' . $logoUrl . '" width="165" alt="Cubis Shop" style="display:block;width:165px;max-width:100%;height:auto"></td><td class="gt-special-status" align="right"><span style="display:inline-block;padding:9px 13px;border:1px solid #acd9f8;border-radius:999px;background:#f0f8ff;color:#0874d9;font-size:11px;font-weight:900">' . $statusLabel . '</span></td></tr></table>'
        . '<div style="padding:34px 0 22px"><span style="display:block;color:' . $accent . ';font-size:10px;font-weight:900;letter-spacing:.15em">' . $eyebrow . '</span><h1 class="gt-special-title" style="margin:9px 0 12px;color:#062b5b;font-size:42px;line-height:1.05;letter-spacing:-1.8px">' . $title . '</h1><p style="margin:0;color:#52769a;font-size:15px;line-height:1.7">' . $message . '</p></div>'
        . $content
        . '<div style="padding:24px 0 4px;text-align:center">' . $button . '</div>'
        . $footer
        . '<p style="margin:25px 0 0;text-align:center;color:#7892ad;font-size:10px;line-height:1.65">Ai nevoie de ajutor? Răspunde direct la acest mesaj.<br><strong style="color:#365f88">Cubis Shop</strong> · <a href="https://cubisshop.ro" style="color:#0874d9;text-decoration:none">cubisshop.ro</a></p>'
        . '</td></tr></table></td></tr></table></body></html>';
}

function gtBuildOrderEmail(array $order, array $config, string $status): array {
    $meta = gtOrderStatusMeta($status);
    if ($status === 'confirmed' && ($order['payment_method'] ?? '') !== 'card') {
        $meta['message'] = 'Am verificat și confirmat comanda ta. Vei achita produsele la livrare.';
        $meta['eyebrow'] = 'COMANDĂ CONFIRMATĂ';
    }
    $currency = (string)($order['currency'] ?? 'RON');
    $trackingUrl = gtEmailTrackingUrl($order, $config);
    $logoUrl = (string)($config['order_email_logo_url'] ?? 'https://cubisshop.ro/assets/cubis-shop-logo.png');
    $contactName = gtOrderCustomerContactName($order);
    $firstName = trim(explode(' ', $contactName, 2)[0] ?? '');
    $greeting = $firstName !== '' ? 'Salut, ' . gtEmailEscape($firstName) . '!' : 'Salut!';
    $isProductPromotion = (string)($order['promotion_scope'] ?? '') === 'product';
    $itemsHtml = '';
    foreach (($order['items'] ?? []) as $item) {
        if (!is_array($item)) continue;
        $imageUrl = gtEmailCompatibleImageUrl((string)($item['image_url'] ?? ''), $config);
        $image = $imageUrl !== ''
            ? '<img class="gt-product-image" src="' . gtEmailEscape($imageUrl) . '" width="76" height="76" alt="" style="display:block;width:76px;height:76px;object-fit:contain;border:1px solid #cfe3f4;border-radius:17px;background:#ffffff">'
            : '<span style="display:block;width:76px;height:76px;line-height:76px;text-align:center;border:1px solid #cfe3f4;border-radius:17px;background:#eff8ff;color:#087ff5;font-size:19px;font-weight:900">CS</span>';
        $hasItemDiscount = $isProductPromotion && (float)($item['discount_total'] ?? 0) > 0;
        $unitPriceHtml = $hasItemDiscount
            ? '<span style="text-decoration:line-through;color:#91a5b9">' . gtEmailMoney($item['unit_price'] ?? 0, $currency) . '</span> <strong style="color:#07834c">' . gtEmailMoney($item['discounted_unit_price'] ?? 0, $currency) . '</strong>'
            : gtEmailMoney($item['unit_price'] ?? 0, $currency);
        $linePriceHtml = $hasItemDiscount
            ? '<span style="text-decoration:line-through;color:#91a5b9;font-size:10px;font-weight:600">' . gtEmailMoney($item['line_total'] ?? 0, $currency) . '</span> <strong style="color:#07834c">' . gtEmailMoney($item['discounted_line_total'] ?? 0, $currency) . '</strong>'
            : gtEmailMoney($item['line_total'] ?? 0, $currency);
        $itemsHtml .= '<tr>'
            . '<td class="gt-product-cell" style="padding:15px 0;border-bottom:1px solid #dcebf7;width:88px;vertical-align:top">' . $image . '</td>'
            . '<td style="padding:14px 0 14px 12px;border-bottom:1px solid #dcebf7;vertical-align:top;min-width:0">'
            . '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">'
            . '<tr><td style="padding:0;color:#062b5b;font-size:14px;line-height:20px;font-weight:900;word-break:break-word;overflow-wrap:anywhere">' . gtEmailEscape($item['product_name'] ?? '') . '</td></tr>'
            . '<tr><td style="padding:5px 0 0;color:#7892ad;font-size:10px;line-height:14px">' . gtEmailEscape($item['product_sku'] ?? 'Fără SKU') . '</td></tr>'
            . '<tr><td style="padding:7px 0 0;color:#5f7f9f;font-size:11px;line-height:16px"><span style="display:inline-block;padding:4px 8px;border-radius:999px;background:#e9f5ff;color:#0874d9;font-weight:900">' . (int)($item['quantity'] ?? 0) . ' buc.</span>&nbsp;&nbsp;×&nbsp;&nbsp;' . $unitPriceHtml . '</td></tr>'
            . '<tr><td style="padding:8px 0 0;color:#062b5b;font-size:13px;line-height:18px;font-weight:900">Total produs: <span style="color:#087ff5">' . $linePriceHtml . '</span></td></tr>'
            . '</table></td></tr>';
    }
    $paymentLabel = ($order['payment_method'] ?? '') === 'card' ? 'Card online' : 'Ramburs la curier';
    $subject = (string)$meta['title'] . ' · ' . (string)($order['order_number'] ?? 'Cubis Shop');
    $preheader = gtEmailEscape((string)$meta['message']);
    $statusColor = gtEmailEscape((string)$meta['color']);
    $statusLabel = gtEmailEscape((string)$meta['label']);
    $statusTitle = gtEmailEscape((string)$meta['title']);
    $statusMessage = gtEmailEscape((string)$meta['message']);
    $statusEyebrow = gtEmailEscape((string)$meta['eyebrow']);
    $statusSymbol = gtEmailEscape((string)$meta['symbol']);
    $nextTitle = gtEmailEscape((string)$meta['next_title']);
    $nextMessage = gtEmailEscape((string)$meta['next_message']);
    $safeLogoUrl = gtEmailEscape($logoUrl);
    $orderNumber = gtEmailEscape($order['order_number'] ?? '');
    $createdAt = gtEmailEscape(date('d.m.Y, H:i', strtotime((string)($order['created_at'] ?? 'now'))));
    $shippingName = gtEmailEscape($order['shipping_method_name'] ?? 'Curier standard');
    $paymentText = gtEmailEscape($paymentLabel);
    $discountValue = (float)($order['discount_total'] ?? 0);
    $displaySubtotal = (float)($order['subtotal'] ?? 0) - ($isProductPromotion ? $discountValue : 0);
    $subtotal = gtEmailMoney(max(0, $displaySubtotal), $currency);
    $hasVat = !empty($order['vat_payer']);
    $subtotalLabel = ($isProductPromotion && $discountValue > 0 ? 'Subtotal după reducerile pe produse' : 'Subtotal') . ($hasVat ? ' (TVA inclus)' : '');
    $vatTotalLabel = $hasVat ? ' (TVA inclus)' : '';
    $discountRow = $discountValue > 0 && !$isProductPromotion
        ? '<tr><td style="padding:6px 0;color:#07834c">Reducere' . (!empty($order['promotion_code']) ? ' · ' . gtEmailEscape((string)$order['promotion_code']) : '') . '</td><td align="right" style="color:#07834c;font-weight:800">−' . gtEmailMoney($discountValue, $currency) . '</td></tr>'
        : '';
    $shippingCost = gtEmailMoney($order['shipping_cost'] ?? 0, $currency);
    $total = gtEmailMoney($order['total'] ?? 0, $currency);
    $customerType = ($order['customer_type'] ?? 'individual') === 'company' ? 'PJ' : 'PF';
    $customerDataRows = '<tr><td style="padding:5px 0;color:#6b86a3">Tip client</td><td align="right" style="color:#062b5b;font-weight:900">' . $customerType . '</td></tr>';
    if ($customerType === 'PJ') {
        $customerDataRows .= '<tr><td style="padding:5px 0;color:#6b86a3">Denumire firmă</td><td align="right" style="color:#07834c;font-weight:900">' . gtEmailEscape(gtOrderCustomerDisplayName($order)) . '</td></tr>'
            . '<tr><td style="padding:5px 0;color:#6b86a3">Persoană de contact</td><td align="right" style="color:#365f88">' . gtEmailEscape($contactName) . '</td></tr>'
            . '<tr><td style="padding:5px 0;color:#6b86a3">CUI / CIF</td><td align="right" style="color:#365f88">' . gtEmailEscape($order['company_cui'] ?? '') . '</td></tr>'
            . '<tr><td style="padding:5px 0;color:#6b86a3">Registrul Comerțului</td><td align="right" style="color:#365f88">' . gtEmailEscape($order['company_registration_number'] ?? '') . '</td></tr>'
            . '<tr><td style="padding:5px 0;color:#6b86a3">Sediu social</td><td align="right" style="color:#365f88">' . gtEmailEscape($order['company_address'] ?? '') . '</td></tr>';
    } else {
        $customerDataRows .= '<tr><td style="padding:5px 0;color:#6b86a3">Nume</td><td align="right" style="color:#365f88">' . gtEmailEscape($contactName) . '</td></tr>';
    }
    $customerDataRows .= '<tr><td style="padding:5px 0;color:#6b86a3">Telefon</td><td align="right" style="color:#365f88">' . gtEmailEscape($order['customer_phone'] ?? '') . '</td></tr>';
    $deliveryAddress = trim((string)($order['address'] ?? '') . ', ' . (string)($order['city'] ?? '') . ', ' . (string)($order['county'] ?? ''), ', ');
    $customerDataRows .= '<tr><td style="padding:9px 0 5px;border-top:1px solid #dcebf7;color:#6b86a3">Livrare</td><td align="right" style="padding:9px 0 5px;border-top:1px solid #dcebf7;color:#365f88">' . gtEmailEscape($deliveryAddress) . '</td></tr>';
    $timelineStatus = $status === 'modified' ? (string)($order['status'] ?? 'new') : $status;
    $timeline = gtEmailStatusTimeline($timelineStatus, (string)($order['payment_method'] ?? 'card'));
    $returnDecisionSummary = in_array($status, ['return_refused', 'return_confirmed', 'refunded'], true)
        ? gtEmailReturnDecisionSummary($order)
        : '';
    $reviewRequestHtml = '';
    if ($status === 'completed') {
        $websiteBaseUrl = rtrim((string)($config['website_base_url'] ?? 'https://cubisshop.ro'), '/');
        $reviewLinks = [];
        foreach (($order['items'] ?? []) as $item) {
            if (!is_array($item)) continue;
            $slug = trim((string)($item['product_slug'] ?? ''));
            if ($slug === '' || isset($reviewLinks[$slug])) continue;
            $reviewUrl = gtEmailEscape($websiteBaseUrl . '/magazin/produs/' . rawurlencode($slug) . '/#recenzii');
            $productName = gtEmailEscape((string)($item['product_name'] ?? 'Produs Cubis Shop'));
            $reviewLinks[$slug] = '<a href="' . $reviewUrl . '" style="display:block;margin-top:9px;padding:13px 14px;border:1px solid #b8dcf8;border-radius:15px;background:#ffffff;color:#0874d9;text-decoration:none;font-size:12px;font-weight:900">Evaluează ' . $productName . '&nbsp;&nbsp;→</a>';
        }
        if ($reviewLinks) {
            $reviewRequestHtml = '<div style="margin-top:20px;padding:20px;border:1px solid #cfe4f5;border-radius:24px;background:#f0f8ff"><span style="display:block;color:#0788f7;font-size:9px;font-weight:900;letter-spacing:.12em">RECENZIE VERIFICATĂ</span><strong style="display:block;margin-top:7px;color:#062b5b;font-size:15px">Cum ți s-au părut produsele?</strong><p style="margin:7px 0 0;color:#607e9c;font-size:11px;line-height:1.55">Experiența ta îi ajută pe ceilalți clienți să aleagă mai ușor. Numărul comenzii și e-mailul sunt folosite numai pentru verificarea achiziției.</p>' . implode('', $reviewLinks) . '</div>';
        }
    }
    $customerActionFooter = '';
    if (in_array($status, ['new', 'confirmed', 'processing'], true)) {
        $safeCancellationUrl = gtEmailEscape(gtEmailCancellationUrl($order, $config));
        $customerActionFooter = '<p style="margin:17px 0 0;text-align:center;color:#7892ad;font-size:10px;line-height:1.55">Nu mai dorești comanda? <a href="' . $safeCancellationUrl . '" style="color:#d72e5e;text-decoration:underline;font-weight:800">Solicită anularea</a></p>';
    } elseif ($status === 'completed') {
        $safeReturnUrl = gtEmailEscape(gtEmailReturnUrl($order, $config));
        $customerActionFooter = '<p style="margin:17px 0 0;text-align:center;color:#7892ad;font-size:10px;line-height:1.55">Ai nevoie să returnezi produsele? <a href="' . $safeReturnUrl . '" style="color:#0874d9;text-decoration:underline;font-weight:800">Solicită returul</a></p>';
    }
    $trackingButton = gtEmailTableButton($trackingUrl, 'Urmărește comanda');
    $html = <<<HTML
<!doctype html><html lang="ro"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light">
<style>body,table,td,a{-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%}table{border-spacing:0;mso-table-lspace:0pt;mso-table-rspace:0pt}img{border:0;outline:none}@media(max-width:600px){.gt-wrap{padding:10px 7px!important}.gt-shell{border-radius:24px!important}.gt-body{padding:23px 17px 27px!important}.gt-logo{width:145px!important}.gt-title{font-size:33px!important}.gt-summary,.gt-timeline,.gt-client{padding:17px!important}.gt-status{display:none!important}.gt-next-icon{width:52px!important}.gt-next-copy{padding-left:10px!important}.gt-product-image{width:64px!important;height:64px!important}.gt-product-cell{width:75px!important}}</style></head>
<body data-gt-email="light-v1" bgcolor="#eaf5ff" style="margin:0;background:#eaf5ff;color:#062b5b;font-family:Arial,'Segoe UI',sans-serif;-webkit-font-smoothing:antialiased">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">{$preheader}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#eaf5ff" style="width:100%;background:#eaf5ff"><tr><td class="gt-wrap" style="padding:34px 14px" align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="gt-shell" bgcolor="#ffffff" style="width:100%;max-width:700px;background:#ffffff;border:1px solid #b9dcf7;border-radius:34px;overflow:hidden;box-shadow:0 24px 70px rgba(4,59,115,.14)">
<tr><td style="height:7px;background:#0788f7;background-image:linear-gradient(90deg,#087ff5,#12c3df 72%,{$statusColor})"></td></tr>
<tr><td class="gt-body" style="padding:30px 32px 34px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td><img class="gt-logo" src="{$safeLogoUrl}" width="165" alt="Cubis Shop" style="display:block;width:165px;max-width:100%;height:auto"></td><td class="gt-status" align="right"><span style="display:inline-block;padding:9px 13px;border:1px solid #acd9f8;border-radius:999px;background:#f0f8ff;color:#0874d9;font-size:11px;font-weight:900">●&nbsp;&nbsp;{$statusLabel}</span></td></tr></table>
<div style="padding:34px 0 22px"><span style="display:block;color:{$statusColor};font-size:10px;font-weight:900;letter-spacing:.15em">{$statusEyebrow}</span><h1 class="gt-title" style="margin:9px 0 12px;color:#062b5b;font-size:43px;line-height:1.04;letter-spacing:-1.9px">{$statusTitle}</h1><p style="margin:0;color:#52769a;font-size:15px;line-height:1.7">{$greeting} {$statusMessage}</p></div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#f0f9ff" style="margin-bottom:19px;border:1px solid #c8e5f8;border-radius:22px;background:#f0f9ff"><tr><td class="gt-next-icon" width="64" style="width:64px;padding:15px 0 15px 15px"><span style="display:block;width:48px;height:48px;line-height:48px;text-align:center;border-radius:16px;background:{$statusColor};color:#ffffff;font-size:16px;font-weight:900">{$statusSymbol}</span></td><td class="gt-next-copy" style="padding:15px"><span style="display:block;color:#0874d9;font-size:9px;font-weight:900;letter-spacing:.12em">CE URMEAZĂ</span><strong style="display:block;margin-top:5px;color:#062b5b;font-size:14px">{$nextTitle}</strong><span style="display:block;margin-top:4px;color:#6080a0;font-size:11px;line-height:1.5">{$nextMessage}</span></td></tr></table>
<div class="gt-summary" style="padding:23px;border:1px solid #d5e8f7;border-radius:25px;background:#f8fbfe">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td><span style="display:block;color:#6889a8;font-size:9px;font-weight:900;letter-spacing:.13em">REZUMATUL COMENZII</span><strong style="display:block;margin-top:5px;color:#087ff5;font-size:17px;overflow-wrap:anywhere">{$orderNumber}</strong></td><td align="right"><span style="display:block;color:#6889a8;font-size:9px;font-weight:900;letter-spacing:.13em">DATA</span><strong style="display:block;margin-top:5px;color:#365f88;font-size:12px">{$createdAt}</strong></td></tr></table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:10px;table-layout:fixed">{$itemsHtml}</table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:15px;color:#54789b;font-size:12px"><tr><td style="padding:6px 0">{$subtotalLabel}</td><td align="right">{$subtotal}</td></tr>{$discountRow}<tr><td style="padding:6px 0">Livrare · {$shippingName}</td><td align="right">{$shippingCost}</td></tr><tr><td style="padding:8px 0 5px">Metoda de plată</td><td align="right" style="padding:8px 0 5px"><span style="display:inline-block;padding:7px 10px;border:1px solid #b9dcf7;border-radius:999px;background:#eaf6ff;color:#0874d9;font-size:11px;font-weight:900">{$paymentText}</span></td></tr><tr><td style="padding:18px 0 0;border-top:1px solid #cfe2f1;color:#062b5b;font-size:15px;font-weight:900">Total de plată{$vatTotalLabel}</td><td align="right" style="padding:18px 0 0;border-top:1px solid #cfe2f1;color:#087ff5;font-size:27px;font-weight:900">{$total}</td></tr></table>
</div>
<div style="padding:23px 0 4px;text-align:center">{$trackingButton}</div>
<p style="margin:8px 0 0;color:#7892ad;font-size:10px;line-height:1.55;text-align:center">Acces securizat, direct la statusul comenzii tale.</p>
{$returnDecisionSummary}
<div class="gt-client" style="margin-top:20px;padding:20px;border:1px solid #cfe4f5;border-radius:23px;background:#ffffff"><span style="display:block;margin-bottom:10px;color:#5f82a4;font-size:9px;font-weight:900;letter-spacing:.12em">DATE CLIENT ȘI LIVRARE</span><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:11px">{$customerDataRows}</table></div>
<div class="gt-timeline" style="margin-top:18px;padding:20px;border:1px solid #cfe4f5;border-radius:25px;background:#f4faff"><span style="display:block;margin-bottom:13px;color:#5f82a4;font-size:9px;font-weight:900;letter-spacing:.12em">EVOLUȚIA COMENZII</span>{$timeline}</div>
{$reviewRequestHtml}
{$customerActionFooter}
<p style="margin:25px 0 0;text-align:center;color:#7892ad;font-size:10px;line-height:1.65">Ai nevoie de ajutor? Răspunde direct la acest mesaj.<br><strong style="color:#365f88">Cubis Shop</strong> · <a href="https://cubisshop.ro" style="color:#0874d9;text-decoration:none">cubisshop.ro</a></p>
</td></tr></table></td></tr></table></body></html>
HTML;
    return ['subject' => $subject, 'html' => gtEmailLightDocument($html), 'tracking_url' => $trackingUrl];
}

function gtSmtpRead($socket): string {
    $response = '';
    while (($line = fgets($socket, 515)) !== false) {
        $response .= $line;
        if (strlen($line) < 4 || $line[3] === ' ') break;
    }
    return trim($response);
}

function gtSmtpCommand($socket, string $command, array $expectedCodes): string {
    if ($command !== '') fwrite($socket, $command . "\r\n");
    $response = gtSmtpRead($socket);
    $code = (int)substr($response, 0, 3);
    if (!in_array($code, $expectedCodes, true)) {
        throw new RuntimeException('Serverul de e-mail a răspuns cu eroarea ' . $code . '.');
    }
    return $response;
}

function gtSmtpSend(array $config, string $recipient, string $subject, string $html, array $attachments = [], array $extraHeaders = []): void {
    if (empty($config['email_enabled'])) {
        throw new RuntimeException('Trimiterea e-mailurilor este dezactivată în Cubis Shop până la configurarea SMTP propriu.');
    }
    $html = gtEmailLightDocument($html);
    $host = trim((string)($config['smtp_host'] ?? ''));
    $port = (int)($config['smtp_port'] ?? 465);
    $encryption = strtolower(trim((string)($config['smtp_encryption'] ?? 'ssl')));
    $username = trim((string)($config['smtp_username'] ?? ''));
    $password = (string)($config['smtp_password'] ?? '');
    $from = trim((string)($config['order_email_from'] ?? $username));
    $fromName = trim((string)($config['order_email_from_name'] ?? 'Cubis Shop'));
    $replyTo = trim((string)($config['order_email_reply_to'] ?? $from));
    if ($host === '' || $username === '' || $password === '' || !filter_var($from, FILTER_VALIDATE_EMAIL)) {
        throw new RuntimeException('Configurația SMTP nu este completă.');
    }
    $remote = ($encryption === 'ssl' ? 'ssl://' : 'tcp://') . $host . ':' . $port;
    $errno = 0;
    $error = '';
    $socket = @stream_socket_client($remote, $errno, $error, 20, STREAM_CLIENT_CONNECT);
    if (!$socket) throw new RuntimeException('Conexiunea la serverul de e-mail nu a putut fi deschisă.');
    stream_set_timeout($socket, 20);
    try {
        gtSmtpCommand($socket, '', [220]);
        gtSmtpCommand($socket, 'EHLO cubisshop.ro', [250]);
        if ($encryption === 'tls') {
            gtSmtpCommand($socket, 'STARTTLS', [220]);
            if (!stream_socket_enable_crypto($socket, true, STREAM_CRYPTO_METHOD_TLS_CLIENT)) {
                throw new RuntimeException('Conexiunea SMTP securizată nu a putut fi inițiată.');
            }
            gtSmtpCommand($socket, 'EHLO cubisshop.ro', [250]);
        }
        gtSmtpCommand($socket, 'AUTH LOGIN', [334]);
        gtSmtpCommand($socket, base64_encode($username), [334]);
        gtSmtpCommand($socket, base64_encode($password), [235]);
        gtSmtpCommand($socket, 'MAIL FROM:<' . $from . '>', [250]);
        gtSmtpCommand($socket, 'RCPT TO:<' . $recipient . '>', [250, 251]);
        gtSmtpCommand($socket, 'DATA', [354]);
        $encodedName = '=?UTF-8?B?' . base64_encode($fromName) . '?=';
        $encodedSubject = '=?UTF-8?B?' . base64_encode($subject) . '?=';
        $headers = [
            'Date: ' . date(DATE_RFC2822),
            'From: ' . $encodedName . ' <' . $from . '>',
            'To: <' . $recipient . '>',
            'Reply-To: ' . $replyTo,
            'Subject: ' . $encodedSubject,
            'Message-ID: <' . bin2hex(random_bytes(12)) . '@cubisshop.ro>',
            'MIME-Version: 1.0',
        ];
        foreach ($extraHeaders as $name => $value) {
            $name = trim((string)$name);
            $value = trim((string)$value);
            if (!in_array($name, ['List-Unsubscribe', 'List-Unsubscribe-Post'], true)) continue;
            if ($value === '' || preg_match('/[\r\n]/', $value)) continue;
            $headers[] = $name . ': ' . $value;
        }
        if ($attachments) {
            $boundary = '=_cubis_' . bin2hex(random_bytes(18));
            $headers[] = 'Content-Type: multipart/mixed; boundary="' . $boundary . '"';
            $parts = ['--' . $boundary, 'Content-Type: text/html; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', rtrim(chunk_split(base64_encode($html), 76, "\r\n"))];
            foreach ($attachments as $attachment) {
                $fileName = preg_replace('/[^A-Za-z0-9._-]+/', '-', basename((string)($attachment['file_name'] ?? 'document.pdf'))) ?: 'document.pdf';
                $mimeType = trim((string)($attachment['mime_type'] ?? 'application/octet-stream')) ?: 'application/octet-stream';
                $parts[] = '--' . $boundary;
                $parts[] = 'Content-Type: ' . $mimeType . '; name="' . $fileName . '"';
                $parts[] = 'Content-Transfer-Encoding: base64';
                $parts[] = 'Content-Disposition: attachment; filename="' . $fileName . '"';
                $parts[] = '';
                $parts[] = rtrim(chunk_split(base64_encode((string)($attachment['content'] ?? '')), 76, "\r\n"));
            }
            $parts[] = '--' . $boundary . '--';
            $message = implode("\r\n", $headers) . "\r\n\r\n" . implode("\r\n", $parts);
        } else {
            $headers[] = 'Content-Type: text/html; charset=UTF-8';
            $headers[] = 'Content-Transfer-Encoding: base64';
            $message = implode("\r\n", $headers) . "\r\n\r\n" . chunk_split(base64_encode($html), 76, "\r\n");
        }
        $message = preg_replace('/(?m)^\./', '..', $message) ?? $message;
        fwrite($socket, $message . "\r\n.\r\n");
        gtSmtpCommand($socket, '', [250]);
        gtSmtpCommand($socket, 'QUIT', [221]);
    } finally {
        fclose($socket);
    }
}

function gtBuildPasswordResetEmail(array $customer, array $config, string $token): array {
    $recipient = mb_strtolower(trim((string)($customer['email'] ?? '')));
    if (!filter_var($recipient, FILTER_VALIDATE_EMAIL) || !preg_match('/^[a-f0-9]{64}$/', $token)) {
        throw new RuntimeException('Datele pentru resetarea parolei nu sunt valide.');
    }
    $base = rtrim((string)($config['website_base_url'] ?? 'https://cubisshop.ro'), '/');
    $resetUrl = $base . '/resetare-parola?token=' . rawurlencode($token) . '&email=' . rawurlencode($recipient);
    $safeResetUrl = gtEmailEscape($resetUrl);
    $safeLogo = gtEmailEscape((string)($config['order_email_logo_url'] ?? 'https://cubisshop.ro/assets/cubis-shop-logo.png'));
    $firstName = trim(explode(' ', trim((string)($customer['full_name'] ?? '')), 2)[0] ?? '');
    $greeting = $firstName === '' ? 'Salut!' : 'Salut, ' . gtEmailEscape($firstName) . '!';
    $html = <<<HTML
<!doctype html><html lang="ro"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"><style>body,table,td,a{-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%}table{border-collapse:separate!important;mso-table-lspace:0pt;mso-table-rspace:0pt}img{border:0;outline:none;text-decoration:none}@media(max-width:600px){.cs-wrap{padding:12px 8px!important}.cs-card{border-radius:24px!important}.cs-body{padding:26px 20px 28px!important}.cs-title{font-size:32px!important}.cs-info td{display:block!important;width:auto!important;padding:7px 0!important}.cs-button a{padding:17px 18px!important}}</style></head>
<body data-gt-email="light-v1" bgcolor="#eff7ff" style="margin:0;background:#eff7ff;color:#0b2c5a;font-family:Arial,'Segoe UI',sans-serif;-webkit-font-smoothing:antialiased">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">Linkul tău securizat Cubis Shop este valabil 30 de minute.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#eff7ff" style="width:100%;background:#eff7ff"><tr><td class="cs-wrap" align="center" style="padding:34px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="cs-card" bgcolor="#ffffff" style="width:100%;max-width:640px;overflow:hidden;border:1px solid #cfe3f3;border-radius:32px;background:#ffffff;box-shadow:0 24px 70px rgba(4,55,103,.13)">
<tr><td style="height:8px;background:#0589ef;background-image:linear-gradient(90deg,#0678ed,#08a8ed 58%,#12c9d8)"></td></tr>
<tr><td class="cs-body" style="padding:30px 34px 34px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="width:172px"><img src="{$safeLogo}" width="158" alt="Cubis Shop" style="display:block;width:158px;max-width:100%;height:auto"></td><td align="right"><span style="display:inline-block;padding:9px 12px;border:1px solid #cce4f7;border-radius:999px;color:#0879da;background:#f0f8ff;font-size:11px;font-weight:800">Cont securizat</span></td></tr></table>
<div style="padding:36px 0 22px"><span style="color:#0786ed;font-size:11px;font-weight:800;letter-spacing:.14em">RESETARE PAROLĂ</span><h1 class="cs-title" style="margin:10px 0 14px;color:#062556;font-size:42px;line-height:1.06;letter-spacing:-1.8px">Alege o parolă nouă.</h1><p style="margin:0;color:#58718e;font-size:15px;line-height:1.7">{$greeting} Am primit solicitarea de resetare pentru contul tău Cubis Shop.</p></div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#f1f9ff" style="width:100%;border:1px solid #cfe5f6;border-radius:22px;background:#f1f9ff"><tr><td style="padding:20px"><strong style="display:block;color:#082d5e;font-size:15px">Link unic, valabil 30 de minute</strong><p style="margin:7px 0 0;color:#5b7591;font-size:12px;line-height:1.65">Poate fi folosit o singură dată. După schimbarea parolei, toate sesiunile existente vor fi închise automat.</p></td></tr></table>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" class="cs-button" style="margin:25px auto 9px"><tr><td align="center" bgcolor="#0788f2" style="border-radius:17px;background:#0788f2;background-image:linear-gradient(100deg,#0677ed,#08a4ee 60%,#10bfd7)"><a href="{$safeResetUrl}" style="display:block;padding:18px 30px;color:#ffffff;text-decoration:none;font-size:14px;font-weight:800">Alege parola nouă&nbsp;&nbsp;→</a></td></tr></table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="cs-info" style="margin-top:25px;border-top:1px solid #dbe8f3"><tr><td width="50%" style="padding:18px 8px 0 0;color:#5f7690;font-size:11px;line-height:1.55"><strong style="display:block;color:#10365f;font-size:12px">Nu ai făcut solicitarea?</strong>Ignoră mesajul; parola actuală rămâne neschimbată.</td><td width="50%" style="padding:18px 0 0 8px;color:#5f7690;font-size:11px;line-height:1.55"><strong style="display:block;color:#10365f;font-size:12px">Butonul nu funcționează?</strong><a href="{$safeResetUrl}" style="color:#087bdc;overflow-wrap:anywhere">Deschide linkul securizat</a></td></tr></table>
<p style="margin:27px 0 0;text-align:center;color:#71849a;font-size:10px;line-height:1.65">Mesaj automat de securitate trimis de <strong style="color:#173e68">Cubis Shop</strong><br><a href="https://cubisshop.ro" style="color:#087bdc;text-decoration:none">cubisshop.ro</a> · contact@cubisshop.ro</p>
</td></tr></table></td></tr></table></body></html>
HTML;
    return ['subject' => 'Resetează parola contului tău Cubis Shop', 'html' => gtEmailLightDocument($html), 'reset_url' => $resetUrl];
}

function gtSendPasswordResetEmail(array $customer, array $config, string $token): void {
    $email = gtBuildPasswordResetEmail($customer, $config, $token);
    gtSmtpSend($config, mb_strtolower(trim((string)($customer['email'] ?? ''))), $email['subject'], $email['html']);
}

function gtSendOrderStatusEmail(array $order, array $config, string $status): array {
    $recipient = trim((string)($order['customer_email'] ?? ''));
    if (in_array($status, ['return_requested', 'return_confirmed'], true)) {
        return ['sent' => false, 'recipient' => $recipient, 'error' => 'Statusul este intern și nu se comunică clientului.'];
    }
    if (!filter_var($recipient, FILTER_VALIDATE_EMAIL)) {
        return ['sent' => false, 'recipient' => $recipient, 'error' => 'Comanda nu are o adresă de e-mail validă.'];
    }
    try {
        $email = gtBuildOrderEmail($order, $config, $status);
        gtSmtpSend($config, $recipient, (string)$email['subject'], (string)$email['html']);
        return ['sent' => true, 'recipient' => $recipient, 'tracking_url' => $email['tracking_url']];
    } catch (Throwable $error) {
        error_log('[Cubis Shop order email] ' . $error->getMessage());
        return ['sent' => false, 'recipient' => $recipient, 'error' => mb_substr($error->getMessage(), 0, 500)];
    }
}

/** Trimite automat sumarul complet după adăugarea de produse de către operator. */
function gtSendOrderModifiedEmail(array $order, array $config): array {
    $recipient = trim((string)($order['customer_email'] ?? ''));
    if (!filter_var($recipient, FILTER_VALIDATE_EMAIL)) {
        return ['sent' => false, 'recipient' => $recipient, 'error' => 'Comanda nu are o adresă de e-mail validă.'];
    }
    try {
        $email = gtBuildOrderEmail($order, $config, 'modified');
        gtSmtpSend($config, $recipient, (string)$email['subject'], (string)$email['html']);
        return ['sent' => true, 'recipient' => $recipient, 'tracking_url' => $email['tracking_url']];
    } catch (Throwable $error) {
        error_log('[Cubis Shop order modified email] ' . $error->getMessage());
        return ['sent' => false, 'recipient' => $recipient, 'error' => mb_substr($error->getMessage(), 0, 500)];
    }
}

/**
 * Retrimite informarea aferentă statusului deja salvat, fără să modifice
 * statusul, istoricul comenzii, stocul sau documentele fiscale.
 */
function gtSendCurrentOrderStatusEmail(array $order, array $config): array {
    $status = (string)($order['status'] ?? 'new');
    return match ($status) {
        'return_requested' => gtSendOrderReturnRequestEmail($order, $config),
        'return_confirmed' => gtSendOrderReturnConfirmedEmail($order, $config),
        default => gtSendOrderStatusEmail($order, $config, $status),
    };
}

function gtBuildOrderCancellationEmail(array $order, array $config, array $details = []): array {
    $recipient = trim((string)($order['customer_email'] ?? ''));
    if (!filter_var($recipient, FILTER_VALIDATE_EMAIL)) {
        return ['sent' => false, 'recipient' => $recipient, 'error' => 'Comanda nu are o adresă de e-mail validă.'];
    }
    $number = gtEmailEscape((string)($order['order_number'] ?? ''));
    $reason = gtEmailEscape((string)($order['customer_cancellation_reason'] ?? 'Nespecificat'));
    $trackingUrl = gtEmailTrackingUrl($order, $config);
    $trackingButton = gtEmailTableButton($trackingUrl, 'Vezi comanda anulată');
    $logoUrl = gtEmailEscape((string)($config['order_email_logo_url'] ?? 'https://cubisshop.ro/assets/cubis-shop-logo.png'));
    $isPaidCard = (string)($order['payment_method'] ?? '') === 'card' && (string)($order['refund_status'] ?? '') === 'pending';
    $refundMessage = $isPaidCard
        ? 'Rambursarea va fi efectuată în cel mult <strong style="color:#062b5b">15 zile calendaristice</strong>, în aceeași metodă de plată confirmată în momentul achiziției.'
        : 'Comanda cu plata ramburs a fost oprită și nu mai ai nimic de achitat pentru ea.';
    $invoiceAction = (string)($details['invoice_action'] ?? $order['cancellation_invoice_action'] ?? 'none');
    if ($invoiceAction === 'deleted_latest_unsent') {
        $fiscalMessage = 'Factura netrimisă în SPV a fost eliminată în siguranță, iar numărul eliberat poate fi folosit de următoarea factură.';
    } elseif ($invoiceAction === 'return_invoice_created') {
        $returnNumber = gtEmailEscape((string)($details['return_invoice']['display_number'] ?? ''));
        $fiscalMessage = 'A fost emisă factura de retur' . ($returnNumber !== '' ? ' <strong style="color:#087ff5">' . $returnNumber . '</strong>' : '') . '. Documentul îți este trimis separat pe e-mail.';
    } else {
        $fiscalMessage = 'Nu fusese emisă nicio factură pentru această comandă, așadar nu va fi creat niciun document fiscal.';
    }
    $message = 'Comanda <strong style="color:#087ff5">' . $number . '</strong> a fost anulată și nu va mai fi pregătită sau predată curierului.';
    $content = '<div style="padding:18px;border:1px solid #ffd1dc;border-radius:21px;background:#fff4f7"><span style="display:block;color:#d72e5e;font-size:9px;font-weight:900;letter-spacing:.11em">MOTIVUL ANULĂRII</span><p style="margin:7px 0 0;color:#8a3650;font-size:13px;line-height:1.6">' . $reason . '</p></div>'
        . '<div style="margin-top:13px;padding:18px;border:1px solid #cfe4f5;border-radius:21px;background:#f8fbfe"><strong style="display:block;color:#062b5b;font-size:13px">Plată și rambursare</strong><p style="margin:7px 0 0;color:#607e9c;font-size:12px;line-height:1.65">' . $refundMessage . '</p></div>'
        . '<div style="margin-top:13px;padding:18px;border:1px solid #cfe4f5;border-radius:21px;background:#ffffff"><strong style="display:block;color:#062b5b;font-size:13px">Documente fiscale</strong><p style="margin:7px 0 0;color:#607e9c;font-size:12px;line-height:1.65">' . $fiscalMessage . '</p></div>';
    $html = gtEmailSpecialStatusDocument($logoUrl, 'Anularea comenzii ' . $number . ' a fost confirmată.', 'Comandă anulată', 'COMANDĂ OPRITĂ', 'Am oprit comanda.', $message, '#e83f66', $content, $trackingButton);
    return ['subject' => 'Comanda ' . (string)($order['order_number'] ?? '') . ' a fost anulată', 'html' => gtEmailLightDocument($html), 'tracking_url' => $trackingUrl];
}

function gtSendOrderCancellationEmail(array $order, array $config, array $details = []): array {
    $recipient = trim((string)($order['customer_email'] ?? ''));
    try {
        $email = gtBuildOrderCancellationEmail($order, $config, $details);
        if (!isset($email['html'])) return $email;
        gtSmtpSend($config, $recipient, $email['subject'], $email['html']);
        return ['sent' => true, 'recipient' => $recipient, 'tracking_url' => gtEmailTrackingUrl($order, $config)];
    } catch (Throwable $error) {
        error_log('[Cubis Shop cancellation email] ' . $error->getMessage());
        return ['sent' => false, 'recipient' => $recipient, 'error' => mb_substr($error->getMessage(), 0, 500)];
    }
}

function gtBuildOrderReturnRequestEmail(array $order, array $config): array {
    $recipient = trim((string)($order['customer_email'] ?? ''));
    if (!filter_var($recipient, FILTER_VALIDATE_EMAIL)) {
        return ['sent' => false, 'recipient' => $recipient, 'error' => 'Comanda nu are o adresă de e-mail validă.'];
    }
    $orderNumber = gtEmailEscape((string)($order['order_number'] ?? ''));
    $contactName = gtOrderCustomerContactName($order);
    $firstName = trim(explode(' ', $contactName, 2)[0] ?? '');
    $greeting = $firstName !== '' ? 'Salut, ' . gtEmailEscape($firstName) . '!' : 'Salut!';
    $reason = gtEmailEscape((string)($order['return_reason'] ?? 'Nespecificat'));
    $holder = gtEmailEscape((string)($order['return_bank_account_holder'] ?? ''));
    $iban = gtEmailEscape((string)($order['return_bank_iban'] ?? ''));
    $currency = (string)($order['currency'] ?? 'RON');
    $returnCost = gtEmailMoney($order['return_shipping_cost'] ?? 0, $currency);
    $refundAmount = gtEmailMoney($order['return_refund_amount'] ?? 0, $currency);
    $isWithdrawal = (string)($order['return_policy_type'] ?? '') === 'b2c_withdrawal' && trim((string)($order['withdrawal_statement'] ?? '')) !== '';
    $statement = gtEmailEscape($isWithdrawal ? (string)$order['withdrawal_statement'] : 'Solicitare de retur comercial');
    $submittedRaw = trim((string)($order['withdrawal_submitted_at'] ?? $order['return_requested_at'] ?? ''));
    $submittedAt = $submittedRaw !== '' ? gtEmailEscape((new DateTimeImmutable($submittedRaw))->format('d.m.Y, H:i:s')) : '—';
    $requestEvidenceTitle = $isWithdrawal ? 'CONFIRMAREA RETRAGERII' : 'CONFIRMAREA SOLICITĂRII';
    $trackingUrl = gtEmailTrackingUrl($order, $config);
    $trackingButton = gtEmailTableButton($trackingUrl, 'Vezi solicitarea');
    $logoUrl = gtEmailEscape((string)($config['order_email_logo_url'] ?? 'https://cubisshop.ro/assets/cubis-shop-logo.png'));
    $message = $greeting . ' Cererea pentru comanda <strong style="color:#087ff5">' . $orderNumber . '</strong> a fost înregistrată și urmează să fie verificată de echipa noastră.';
    $content = '<div style="padding:18px;border:1px solid #cfe4f5;border-radius:21px;background:#f4faff"><span style="display:block;color:#0874d9;font-size:9px;font-weight:900;letter-spacing:.11em">MOTIVUL RETURULUI</span><p style="margin:7px 0 0;color:#365f88;font-size:13px;line-height:1.6">' . $reason . '</p></div>'
        . '<div style="margin-top:13px;padding:18px;border:1px solid #cfe4f5;border-radius:21px;background:#ffffff"><span style="display:block;color:#0874d9;font-size:9px;font-weight:900;letter-spacing:.11em">' . $requestEvidenceTitle . '</span><p style="margin:7px 0 0;color:#365f88;font-size:13px;line-height:1.6">' . $statement . '</p><p style="margin:8px 0 0;color:#7892ad;font-size:11px">Înregistrată la: <strong style="color:#062b5b">' . $submittedAt . '</strong></p></div>'
        . '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:13px;border:1px solid #d5e8f7;border-radius:21px;background:#f8fbfe;color:#54789b;font-size:12px"><tr><td style="padding:17px 17px 6px">Titular cont</td><td align="right" style="padding:17px 17px 6px;color:#062b5b;font-weight:800">' . $holder . '</td></tr><tr><td style="padding:6px 17px">IBAN</td><td align="right" style="padding:6px 17px;color:#365f88;font-weight:700;overflow-wrap:anywhere">' . $iban . '</td></tr><tr><td style="padding:6px 17px">Cost retur curier</td><td align="right" style="padding:6px 17px;color:#d72e5e;font-weight:800">−' . $returnCost . '</td></tr><tr><td style="padding:15px 17px 17px;border-top:1px solid #cfe2f1;color:#062b5b;font-weight:900">Sumă estimată de restituit</td><td align="right" style="padding:15px 17px 17px;border-top:1px solid #cfe2f1;color:#07834c;font-size:20px;font-weight:900">' . $refundAmount . '</td></tr></table>'
        . '<div style="margin-top:13px;padding:18px;border:1px solid #cfe4f5;border-radius:21px;background:#f0f8ff"><strong style="display:block;color:#062b5b;font-size:13px">Ce urmează?</strong><p style="margin:7px 0 0;color:#607e9c;font-size:12px;line-height:1.65">Verificăm solicitarea și îți comunicăm pașii de predare a produselor. Suma afișată este estimativă și include costul de retur configurat pentru comanda ta.</p></div>';
    $html = gtEmailSpecialStatusDocument($logoUrl, 'Am primit solicitarea de retur pentru comanda ' . $orderNumber . '.', 'Retur în verificare', 'SOLICITARE PRIMITĂ', 'Am primit solicitarea ta de retur.', $message, '#087ff5', $content, $trackingButton);
    return ['subject' => 'Am primit solicitarea de retur · ' . (string)($order['order_number'] ?? ''), 'html' => gtEmailLightDocument($html), 'tracking_url' => $trackingUrl];
}

function gtSendOrderReturnRequestEmail(array $order, array $config): array {
    $recipient = trim((string)($order['customer_email'] ?? ''));
    try {
        $email = gtBuildOrderReturnRequestEmail($order, $config);
        if (!isset($email['html'])) return $email;
        gtSmtpSend($config, $recipient, $email['subject'], $email['html']);
        return ['sent' => true, 'recipient' => $recipient, 'tracking_url' => gtEmailTrackingUrl($order, $config)];
    } catch (Throwable $error) {
        error_log('[Cubis Shop return request email] ' . $error->getMessage());
        return ['sent' => false, 'recipient' => $recipient, 'error' => mb_substr($error->getMessage(), 0, 500)];
    }
}

function gtBuildOrderReturnConfirmedEmail(array $order, array $config): array {
    $recipient = trim((string)($order['customer_email'] ?? ''));
    if (!filter_var($recipient, FILTER_VALIDATE_EMAIL)) {
        return ['sent' => false, 'recipient' => $recipient, 'error' => 'Comanda nu are o adresă de e-mail validă.'];
    }
    $orderNumber = gtEmailEscape((string)($order['order_number'] ?? ''));
    $contactName = gtOrderCustomerContactName($order);
    $firstName = trim(explode(' ', $contactName, 2)[0] ?? '');
    $greeting = $firstName !== '' ? 'Salut, ' . gtEmailEscape($firstName) . '!' : 'Salut!';
    $refundAmount = gtEmailMoney($order['return_refund_amount'] ?? 0, (string)($order['currency'] ?? 'RON'));
    $trackingUrl = gtEmailTrackingUrl($order, $config);
    $trackingButton = gtEmailTableButton($trackingUrl, 'Vezi comanda');
    $logoUrl = gtEmailEscape((string)($config['order_email_logo_url'] ?? 'https://cubisshop.ro/assets/cubis-shop-logo.png'));
    $fiscalMessage = !empty($order['return_invoice_id'])
        ? 'Factura de retur este emisă automat și îți este trimisă separat pe e-mail, în format PDF.'
        : 'Comanda nu avea o factură pozitivă emisă, așadar confirmarea returului nu generează acum niciun document fiscal.';
    $returnDecisionSummary = gtEmailReturnDecisionSummary($order);
    $message = $greeting . ' Am confirmat returul pentru comanda <strong style="color:#087ff5">' . $orderNumber . '</strong>. Echipa noastră continuă verificarea produselor și procesarea restituirii.';
    $content = $returnDecisionSummary
        . '<div style="margin-top:13px;padding:19px;border:1px solid #b9e5cf;border-radius:21px;background:#effcf5"><span style="display:block;color:#07834c;font-size:9px;font-weight:900;letter-spacing:.11em">SUMĂ ESTIMATĂ DE RESTITUIT</span><strong style="display:block;margin-top:8px;color:#07834c;font-size:26px">' . $refundAmount . '</strong><p style="margin:7px 0 0;color:#4d8068;font-size:12px;line-height:1.65">Valoarea finală este procesată după verificarea returului. Acest mesaj confirmă aprobarea returului, nu finalizarea rambursării.</p></div>'
        . '<div style="margin-top:13px;padding:18px;border:1px solid #cfe4f5;border-radius:21px;background:#ffffff"><strong style="display:block;color:#062b5b;font-size:13px">Documente fiscale</strong><p style="margin:7px 0 0;color:#607e9c;font-size:12px;line-height:1.65">' . $fiscalMessage . '</p></div>';
    $html = gtEmailSpecialStatusDocument($logoUrl, 'Returul comenzii ' . $orderNumber . ' a fost confirmat.', 'Retur confirmat', 'RETUR APROBAT', 'Returul tău a fost aprobat.', $message, '#10a978', $content, $trackingButton);
    return ['subject' => 'Retur confirmat · ' . (string)($order['order_number'] ?? ''), 'html' => gtEmailLightDocument($html), 'tracking_url' => $trackingUrl];
}

function gtSendOrderReturnConfirmedEmail(array $order, array $config): array {
    $recipient = trim((string)($order['customer_email'] ?? ''));
    try {
        $email = gtBuildOrderReturnConfirmedEmail($order, $config);
        if (!isset($email['html'])) return $email;
        gtSmtpSend($config, $recipient, $email['subject'], $email['html']);
        return ['sent' => true, 'recipient' => $recipient, 'tracking_url' => gtEmailTrackingUrl($order, $config)];
    } catch (Throwable $error) {
        error_log('[Cubis Shop return confirmation email] ' . $error->getMessage());
        return ['sent' => false, 'recipient' => $recipient, 'error' => mb_substr($error->getMessage(), 0, 500)];
    }
}

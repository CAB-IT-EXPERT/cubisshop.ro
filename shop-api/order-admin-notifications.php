<?php
declare(strict_types=1);

/**
 * Notificări operaționale trimise exclusiv către adresa internă de comenzi.
 * Sunt separate de e-mailurile clientului și folosesc propriul cont SMTP,
 * păstrat numai în config.local.php pe server.
 */

function gtAdminOrderNotificationRecipient(array $config): string
{
    return trim((string)($config['admin_order_notification_recipient'] ?? ''));
}

function gtAdminOrderNotificationSmtpConfig(array $config): array
{
    $mail = $config;
    $mail['email_enabled'] = !empty($config['admin_email_enabled']);
    foreach ([
        'host' => 'smtp_host',
        'port' => 'smtp_port',
        'encryption' => 'smtp_encryption',
        'username' => 'smtp_username',
        'password' => 'smtp_password',
    ] as $source => $target) {
        $value = $config['admin_order_smtp_' . $source] ?? null;
        if ($value !== null && $value !== '') $mail[$target] = $value;
    }
    $adminFrom = trim((string)($config['admin_order_email_from'] ?? $mail['smtp_username'] ?? ''));
    if ($adminFrom !== '') $mail['order_email_from'] = $adminFrom;
    $mail['order_email_from_name'] = trim((string)($config['admin_order_email_from_name'] ?? 'Cubis Shop · Comenzi')) ?: 'Cubis Shop · Comenzi';
    $mail['order_email_reply_to'] = trim((string)($config['admin_order_email_reply_to'] ?? $adminFrom)) ?: $adminFrom;
    return $mail;
}

function gtAdminOrderOpenUrl(array $order, array $config): string
{
    $base = rtrim((string)($config['public_base_url'] ?? 'https://cubisshop.ro/shop-api'), '/');
    return $base . '/deschide-comanda.php?order=' . rawurlencode((string)($order['id'] ?? ''));
}

function gtAdminOrderNotificationMeta(string $eventType): array
{
    return match ($eventType) {
        'cancelled_by_customer' => [
            'eyebrow' => 'COMANDĂ ANULATĂ DE CLIENT',
            'title' => 'Clientul a anulat comanda.',
            'subject' => 'Comandă anulată',
            'message' => 'Comanda a fost oprită prin fluxul securizat destinat clientului.',
            'color' => '#fb7185',
            'symbol' => '×',
        ],
        'return_requested_by_customer' => [
            'eyebrow' => 'SOLICITARE NOUĂ DE RETUR',
            'title' => 'Clientul solicită un retur.',
            'subject' => 'Solicitare de retur',
            'message' => 'Cererea a fost înregistrată și așteaptă verificarea în aplicația Cubis Shop.',
            'color' => '#f472b6',
            'symbol' => '↶',
        ],
        default => [
            'eyebrow' => 'COMANDĂ NOUĂ CONFIRMATĂ',
            'title' => 'Ai primit o comandă nouă.',
            'subject' => 'Comandă nouă',
            'message' => 'Comanda este confirmată și poate fi procesată în aplicația Cubis Shop.',
            'color' => '#087ff5',
            'symbol' => '✓',
        ],
    };
}

function gtLoadAdminOrderNotification(PDO $db, string $orderId, array $config): ?array
{
    $stmt = $db->prepare('SELECT * FROM shop_orders WHERE id = ? LIMIT 1');
    $stmt->execute([$orderId]);
    $order = $stmt->fetch();
    if (!$order) return null;
    if (function_exists('orderRow')) return orderRow($db, $order, $config, true, true);

    $items = $db->prepare('SELECT * FROM shop_order_items WHERE order_id = ? ORDER BY id');
    $items->execute([$orderId]);
    $order['items'] = $items->fetchAll();
    return $order;
}

function gtBuildAdminOrderNotificationEmail(array $order, array $config, string $eventType): array
{
    $meta = gtAdminOrderNotificationMeta($eventType);
    $currency = (string)($order['currency'] ?? 'RON');
    $orderNumber = gtEmailEscape((string)($order['order_number'] ?? ''));
    $customerName = gtEmailEscape(gtOrderCustomerDisplayName($order));
    $customerContact = gtEmailEscape(gtOrderCustomerContactName($order));
    $customerEmail = gtEmailEscape((string)($order['customer_email'] ?? ''));
    $customerPhone = gtEmailEscape((string)($order['customer_phone'] ?? ''));
    $createdAt = gtEmailEscape(date('d.m.Y, H:i', strtotime((string)($order['created_at'] ?? 'now'))));
    $paymentMethod = (string)($order['payment_method'] ?? '') === 'card' ? 'Card online · plată confirmată' : 'Ramburs la curier · comandă finalizată';
    $paymentStatus = (string)($order['payment_status'] ?? '') === 'paid' ? 'Plătită' : ((string)($order['payment_method'] ?? '') === 'card' ? 'În verificare' : 'De încasat la livrare');
    $addressParts = array_filter([
        trim((string)($order['address'] ?? '')),
        trim((string)($order['city'] ?? '')),
        trim((string)($order['county'] ?? '')),
        trim((string)($order['postal_code'] ?? '')),
    ]);
    $address = gtEmailEscape(implode(', ', $addressParts));
    $companyRows = '';
    if ((string)($order['customer_type'] ?? '') === 'company') {
        $companyRows = '<tr><td style="padding:5px 0;color:#6b86a3">Persoană de contact</td><td align="right" style="color:#365f88">' . $customerContact . '</td></tr>'
            . '<tr><td style="padding:5px 0;color:#6b86a3">CUI / CIF</td><td align="right" style="color:#365f88">' . gtEmailEscape((string)($order['company_cui'] ?? '')) . '</td></tr>'
            . '<tr><td style="padding:5px 0;color:#6b86a3">Registrul Comerțului</td><td align="right" style="color:#365f88">' . gtEmailEscape((string)($order['company_registration_number'] ?? '')) . '</td></tr>';
    }

    $itemsHtml = '';
    foreach ((array)($order['items'] ?? []) as $item) {
        if (!is_array($item)) continue;
        $quantity = max(0, (int)($item['quantity'] ?? 0));
        $unitPrice = (float)($item['discounted_unit_price'] ?? $item['unit_price'] ?? 0);
        $lineTotal = (float)($item['discounted_line_total'] ?? $item['line_total'] ?? ($unitPrice * $quantity));
        $imageUrl = gtEmailCompatibleImageUrl((string)($item['image_url'] ?? ''), $config);
        $image = $imageUrl !== ''
            ? '<img src="' . gtEmailEscape($imageUrl) . '" width="64" height="64" alt="" style="display:block;width:64px;height:64px;object-fit:contain;border-radius:16px;background:#fff">'
            : '<span style="display:block;width:64px;height:64px;line-height:64px;text-align:center;border:1px solid #cfe3f4;border-radius:16px;background:#eff8ff;color:#087ff5;font-size:18px;font-weight:900">CS</span>';
        $itemsHtml .= '<tr><td style="width:76px;padding:14px 0;border-bottom:1px solid #dcebf7;vertical-align:top">' . $image . '</td>'
            . '<td style="padding:14px 0 14px 12px;border-bottom:1px solid #dcebf7;vertical-align:top;min-width:0"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">'
            . '<tr><td style="padding:0;color:#062b5b;font-size:14px;line-height:20px;font-weight:900;word-break:break-word;overflow-wrap:anywhere">' . gtEmailEscape((string)($item['product_name'] ?? 'Produs')) . '</td></tr>'
            . '<tr><td style="padding:5px 0 0;color:#7892ad;font-size:10px;line-height:14px">' . gtEmailEscape((string)($item['product_sku'] ?? 'Fără SKU')) . '</td></tr>'
            . '<tr><td style="padding:7px 0 0;color:#5f7f9f;font-size:11px;line-height:16px"><strong style="display:inline-block;padding:4px 8px;border-radius:999px;background:#e9f5ff;color:#0874d9">' . $quantity . ' buc.</strong>&nbsp;&nbsp;×&nbsp;&nbsp;' . gtEmailMoney($unitPrice, $currency) . '</td></tr>'
            . '<tr><td style="padding:7px 0 0;color:#062b5b;font-size:13px;line-height:18px;font-weight:900">Total produs: <span style="color:#087ff5">' . gtEmailMoney($lineTotal, $currency) . '</span></td></tr>'
            . '</table></td></tr>';
    }

    $eventDetails = '';
    if ($eventType === 'cancelled_by_customer') {
        $eventDetails = '<div style="margin-top:15px;padding:17px;border:1px solid #ffd1dc;border-radius:20px;background:#fff4f7"><span style="display:block;color:#d72e5e;font-size:9px;font-weight:900;letter-spacing:.11em">MOTIVUL ANULĂRII</span><p style="margin:7px 0 0;color:#8a3650;font-size:13px;line-height:1.55">' . gtEmailEscape((string)($order['customer_cancellation_reason'] ?? 'Nespecificat')) . '</p></div>';
    } elseif ($eventType === 'return_requested_by_customer') {
        $returnItems = '';
        foreach ((array)($order['return_items'] ?? []) as $item) {
            if (!is_array($item)) continue;
            $returnItems .= '<li style="margin:5px 0">' . gtEmailEscape((string)($item['product_name'] ?? 'Produs')) . ' · ' . gtEmailQuantity($item['requested_quantity'] ?? 0) . ' buc.</li>';
        }
        $eventDetails = '<div style="margin-top:15px;padding:17px;border:1px solid #cfe4f5;border-radius:20px;background:#f4faff"><span style="display:block;color:#0874d9;font-size:9px;font-weight:900;letter-spacing:.11em">DETALIILE RETURULUI</span><p style="margin:7px 0 0;color:#365f88;font-size:13px;line-height:1.55">' . gtEmailEscape((string)($order['return_reason'] ?? 'Nespecificat')) . '</p>'
            . ($returnItems !== '' ? '<ul style="margin:10px 0 0;padding-left:18px;color:#607e9c;font-size:11px;line-height:1.5">' . $returnItems . '</ul>' : '')
            . '<table role="presentation" width="100%" style="margin-top:11px;color:#607e9c;font-size:11px"><tr><td>Cost retur</td><td align="right" style="color:#d72e5e">−' . gtEmailMoney($order['return_shipping_cost'] ?? 0, $currency) . '</td></tr><tr><td style="padding-top:6px">Estimare restituire</td><td align="right" style="padding-top:6px;color:#07834c;font-weight:900">' . gtEmailMoney($order['return_refund_amount'] ?? 0, $currency) . '</td></tr></table></div>';
    }

    $openUrl = gtAdminOrderOpenUrl($order, $config);
    $openButton = gtEmailTableButton($openUrl, 'Vezi comanda');
    $safeLogo = gtEmailEscape((string)($config['order_email_logo_url'] ?? 'https://cubisshop.ro/assets/cubis-shop-logo.png'));
    $color = gtEmailEscape((string)$meta['color']);
    $subject = (string)$meta['subject'] . ' · ' . (string)($order['order_number'] ?? '') . ' · ' . strip_tags(gtEmailMoney($order['total'] ?? 0, $currency));
    $notes = trim((string)($order['customer_notes'] ?? ''));
    $notesHtml = $notes !== '' ? '<tr><td style="padding:5px 0;color:#6b86a3">Observații client</td><td align="right" style="max-width:360px;color:#365f88">' . gtEmailEscape($notes) . '</td></tr>' : '';
    $discountValue = (float)($order['discount_total'] ?? 0);
    $discountRow = $discountValue > 0
        ? '<tr><td style="padding:5px 0;color:#07834c">Reducere</td><td align="right" style="color:#07834c;font-weight:800">−' . gtEmailMoney($discountValue, $currency) . '</td></tr>'
        : '';
    $html = '<!doctype html><html lang="ro"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"><style>body,table,td,a{-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%}table{border-spacing:0;mso-table-lspace:0pt;mso-table-rspace:0pt}img{border:0;outline:none}@media(max-width:600px){.gt-wrap{padding:10px 7px!important}.gt-shell{border-radius:24px!important}.gt-body{padding:23px 17px 27px!important}.gt-logo{width:145px!important}.gt-title{font-size:33px!important}.gt-order-card{padding:17px!important}.gt-hide-mobile{display:none!important}}</style></head>'
        . '<body data-gt-email="light-v1" bgcolor="#eaf5ff" style="margin:0;background:#eaf5ff;color:#062b5b;font-family:Arial,Segoe UI,sans-serif"><div style="display:none;max-height:0;overflow:hidden">' . gtEmailEscape((string)$meta['message']) . '</div>'
        . '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#eaf5ff" style="width:100%;background:#eaf5ff"><tr><td class="gt-wrap" align="center" style="padding:34px 14px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="gt-shell" bgcolor="#ffffff" style="width:100%;max-width:700px;border:1px solid #b9dcf7;border-radius:34px;background:#ffffff;overflow:hidden;box-shadow:0 24px 70px rgba(4,59,115,.14)"><tr><td style="height:7px;background:#0788f7;background-image:linear-gradient(90deg,#087ff5,#12c3df 72%,' . $color . ')"></td></tr><tr><td class="gt-body" style="padding:30px 32px 34px">'
        . '<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td><img class="gt-logo" src="' . $safeLogo . '" width="165" alt="Cubis Shop" style="display:block;width:165px;max-width:100%;height:auto"></td><td class="gt-hide-mobile" align="right"><span style="display:inline-block;padding:9px 13px;border:1px solid #acd9f8;border-radius:999px;background:#f0f8ff;color:#0874d9;font-size:11px;font-weight:900">Cubis Shop · Comenzi</span></td></tr></table>'
        . '<div style="padding:34px 0 22px"><span style="display:block;color:' . $color . ';font-size:10px;font-weight:900;letter-spacing:.15em">' . gtEmailEscape((string)$meta['eyebrow']) . '</span><h1 class="gt-title" style="margin:9px 0 12px;color:#062b5b;font-size:42px;line-height:1.05;letter-spacing:-1.8px">' . gtEmailEscape((string)$meta['title']) . '</h1><p style="margin:0;color:#52769a;font-size:15px;line-height:1.7">' . gtEmailEscape((string)$meta['message']) . '</p></div>'
        . '<div class="gt-order-card" style="padding:23px;border:1px solid #d5e8f7;border-radius:25px;background:#f8fbfe"><table role="presentation" width="100%"><tr><td><span style="display:block;color:#6889a8;font-size:9px;font-weight:900;letter-spacing:.13em">NUMĂR COMANDĂ</span><strong style="display:block;margin-top:5px;color:#087ff5;font-size:17px">' . $orderNumber . '</strong></td><td align="right"><span style="display:block;color:#6889a8;font-size:9px;font-weight:900;letter-spacing:.13em">DATA</span><strong style="display:block;margin-top:5px;color:#365f88;font-size:12px">' . $createdAt . '</strong></td></tr></table><table role="presentation" width="100%" style="margin-top:10px;table-layout:fixed">' . $itemsHtml . '</table>'
        . '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:15px;color:#54789b;font-size:12px"><tr><td style="padding:5px 0">Subtotal</td><td align="right">' . gtEmailMoney($order['subtotal'] ?? 0, $currency) . '</td></tr>' . $discountRow . '<tr><td style="padding:5px 0">Livrare · ' . gtEmailEscape((string)($order['shipping_method_name'] ?? 'Curier')) . '</td><td align="right">' . gtEmailMoney($order['shipping_cost'] ?? 0, $currency) . '</td></tr><tr><td style="padding:8px 0 5px">Metoda de plată</td><td align="right" style="padding:8px 0 5px"><span style="display:inline-block;padding:7px 10px;border:1px solid #b9dcf7;border-radius:999px;background:#eaf6ff;color:#0874d9;font-size:11px;font-weight:900">' . gtEmailEscape($paymentMethod) . '</span></td></tr><tr><td style="padding:18px 0 0;border-top:1px solid #cfe2f1;color:#062b5b;font-size:15px;font-weight:900">TOTAL COMANDĂ</td><td align="right" style="padding:18px 0 0;border-top:1px solid #cfe2f1;color:#087ff5;font-size:27px;font-weight:900">' . gtEmailMoney($order['total'] ?? 0, $currency) . '</td></tr></table></div>'
        . $eventDetails
        . '<div style="margin-top:16px;padding:19px;border:1px solid #cfe4f5;border-radius:23px;background:#ffffff"><span style="display:block;margin-bottom:9px;color:#5f82a4;font-size:9px;font-weight:900;letter-spacing:.11em">CLIENT ȘI LIVRARE</span><table role="presentation" width="100%" style="font-size:11px"><tr><td style="padding:5px 0;color:#6b86a3">Client</td><td align="right" style="color:#062b5b;font-weight:900">' . $customerName . '</td></tr>' . $companyRows . '<tr><td style="padding:5px 0;color:#6b86a3">E-mail</td><td align="right" style="color:#365f88">' . $customerEmail . '</td></tr><tr><td style="padding:5px 0;color:#6b86a3">Telefon</td><td align="right" style="color:#365f88">' . $customerPhone . '</td></tr><tr><td style="padding:5px 0;color:#6b86a3">Adresă</td><td align="right" style="color:#365f88">' . $address . '</td></tr><tr><td style="padding:5px 0;color:#6b86a3">Status plată</td><td align="right" style="color:#07834c;font-weight:800">' . gtEmailEscape($paymentStatus) . '</td></tr>' . $notesHtml . '</table></div>'
        . '<div style="padding:24px 0 5px;text-align:center">' . $openButton . '</div><p style="margin:8px 0 0;text-align:center;color:#7892ad;font-size:10px;line-height:1.55">Deschide direct comanda în aplicația Cubis Shop de pe telefon sau calculator.</p>'
        . '<p style="margin:24px 0 0;text-align:center;color:#7892ad;font-size:10px;line-height:1.6">Notificare operațională automată · <strong style="color:#365f88">Cubis Shop</strong></p>'
        . '</td></tr></table></td></tr></table></body></html>';
    return ['subject' => $subject, 'html' => gtEmailLightDocument($html), 'open_url' => gtAdminOrderOpenUrl($order, $config)];
}

function gtSendAdminOrderNotification(PDO $db, array $config, string $orderId, string $eventType): array
{
    $recipient = gtAdminOrderNotificationRecipient($config);
    if (!filter_var($recipient, FILTER_VALIDATE_EMAIL)) {
        return ['sent' => false, 'error' => 'Adresa internă pentru notificările comenzilor nu este validă.'];
    }

    $claimId = function_exists('uuidV4') ? uuidV4() : bin2hex(random_bytes(16));
    try {
        $claim = $db->prepare("INSERT IGNORE INTO shop_order_admin_notifications (id, order_id, event_type, status, attempts, recipient) VALUES (?, ?, ?, 'sending', 1, ?)");
        $claim->execute([$claimId, $orderId, $eventType, $recipient]);
        if ($claim->rowCount() !== 1) {
            $existing = $db->prepare('SELECT status, sent_at, last_error FROM shop_order_admin_notifications WHERE order_id = ? AND event_type = ? LIMIT 1');
            $existing->execute([$orderId, $eventType]);
            $row = $existing->fetch() ?: [];
            return ['sent' => (string)($row['status'] ?? '') === 'sent', 'duplicate' => true, 'sent_at' => $row['sent_at'] ?? null, 'error' => $row['last_error'] ?? null];
        }

        $order = gtLoadAdminOrderNotification($db, $orderId, $config);
        if (!$order) throw new RuntimeException('Comanda nu a putut fi recitită pentru notificarea internă.');
        $email = gtBuildAdminOrderNotificationEmail($order, $config, $eventType);
        gtSmtpSend(gtAdminOrderNotificationSmtpConfig($config), $recipient, (string)$email['subject'], (string)$email['html']);
        $db->prepare("UPDATE shop_order_admin_notifications SET status = 'sent', sent_at = CURRENT_TIMESTAMP, last_error = NULL WHERE id = ?")
            ->execute([$claimId]);
        return ['sent' => true, 'recipient' => $recipient, 'open_url' => $email['open_url']];
    } catch (Throwable $error) {
        try {
            $db->prepare("UPDATE shop_order_admin_notifications SET status = 'failed', last_error = ? WHERE id = ?")
                ->execute([mb_substr($error->getMessage(), 0, 500), $claimId]);
        } catch (Throwable $ignored) {
            // Eroarea de jurnalizare nu trebuie să afecteze comanda confirmată.
        }
        error_log('[Cubis Shop admin order notification] ' . $eventType . ': ' . $error->getMessage());
        return ['sent' => false, 'recipient' => $recipient, 'error' => mb_substr($error->getMessage(), 0, 500)];
    }
}

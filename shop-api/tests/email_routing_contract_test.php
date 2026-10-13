<?php
declare(strict_types=1);

$config = require __DIR__ . '/../config.example.php';

function emailRoutingAssert(bool $condition, string $message): void
{
    if (!$condition) {
        throw new RuntimeException($message);
    }
}

emailRoutingAssert(($config['order_email_from'] ?? '') === 'contact@cubisshop.ro', 'Customer e-mails must be sent from contact@cubisshop.ro.');
emailRoutingAssert(($config['order_email_reply_to'] ?? '') === 'contact@cubisshop.ro', 'Customer replies must return to contact@cubisshop.ro.');
emailRoutingAssert(($config['smtp_username'] ?? '') === 'contact@cubisshop.ro', 'Customer SMTP must authenticate as contact@cubisshop.ro.');
emailRoutingAssert(($config['admin_order_notification_recipient'] ?? '') === 'office@cubisshop.ro', 'Internal order e-mails must be delivered to office@cubisshop.ro.');
emailRoutingAssert(($config['admin_order_email_from'] ?? '') === 'contact@cubisshop.ro', 'Internal order e-mails must be sent from contact@cubisshop.ro.');
emailRoutingAssert(($config['admin_order_email_reply_to'] ?? '') === 'contact@cubisshop.ro', 'Internal replies must return to contact@cubisshop.ro.');
emailRoutingAssert(($config['admin_order_smtp_username'] ?? '') === 'contact@cubisshop.ro', 'Internal SMTP must authenticate as contact@cubisshop.ro.');
emailRoutingAssert(($config['email_enabled'] ?? true) === false, 'Customer e-mail must remain disabled by default.');
emailRoutingAssert(($config['admin_email_enabled'] ?? true) === false, 'Internal e-mail must remain disabled by default.');

echo "email_routing_contract_test: OK\n";

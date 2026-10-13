<?php
declare(strict_types=1);

$orderId = strtolower(trim((string)($_GET['order'] ?? '')));
if (!preg_match('/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/', $orderId)) {
    http_response_code(404);
    $orderId = '';
}

header('Content-Type: text/html; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Referrer-Policy: no-referrer');
header('X-Robots-Tag: noindex, nofollow, noarchive');
header("Content-Security-Policy: default-src 'none'; img-src https://cubisshop.ro data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'");

$appUrl = $orderId !== '' ? 'cubisshop://order/' . rawurlencode($orderId) : '';
$safeAppUrl = htmlspecialchars($appUrl, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
?>
<!doctype html>
<html lang="ro">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
  <meta name="theme-color" content="#edf7ff">
  <title>Deschide comanda în Cubis Shop</title>
  <style>
    :root{color-scheme:light;--navy:#062d63;--ink:#082b58;--muted:#5d7698;--line:#cfe3f6;--soft:#edf7ff;--blue:#087ff5;--cyan:#14c6dd;--green:#0aaf7a;--white:#fff}
    *{box-sizing:border-box}
    html{min-height:100%;background:#edf7ff}
    body{min-height:100vh;margin:0;padding:max(22px,env(safe-area-inset-top)) max(22px,env(safe-area-inset-right)) max(22px,env(safe-area-inset-bottom)) max(22px,env(safe-area-inset-left));overflow-x:hidden;background:radial-gradient(circle at 10% 8%,rgba(20,198,221,.2),transparent 30%),radial-gradient(circle at 92% 88%,rgba(8,127,245,.16),transparent 28%),linear-gradient(145deg,#f8fcff 0%,#edf7ff 48%,#f7fbff 100%);color:var(--ink);font-family:Inter,"Segoe UI",Roboto,Arial,sans-serif}
    body:before{content:"";position:fixed;inset:0;pointer-events:none;opacity:.43;background-image:linear-gradient(rgba(8,127,245,.045) 1px,transparent 1px),linear-gradient(90deg,rgba(8,127,245,.045) 1px,transparent 1px);background-size:42px 42px;mask-image:linear-gradient(to bottom,black,transparent 82%)}
    .shell{position:relative;display:grid;grid-template-rows:auto 1fr auto;min-height:calc(100vh - 44px);width:min(1180px,100%);margin:0 auto}
    .topbar{display:flex;align-items:center;justify-content:space-between;gap:24px;padding:4px 4px 26px}
    .brand{display:flex;align-items:center;gap:14px;text-decoration:none;color:var(--ink)}
    .brand-logo{display:grid;place-items:center;width:72px;height:54px;overflow:hidden;border:1px solid rgba(8,127,245,.16);border-radius:17px;background:#fff;box-shadow:0 10px 28px rgba(9,54,102,.09)}
    .brand-logo img{display:block;width:64px;height:48px;object-fit:contain}
    .brand-copy strong{display:block;font-size:20px;line-height:1;font-weight:900;letter-spacing:-.03em}
    .brand-copy small{display:block;margin-top:7px;color:#6680a2;font-size:10px;font-weight:900;letter-spacing:.14em;text-transform:uppercase}
    .secure{display:inline-flex;align-items:center;gap:9px;padding:10px 14px;border:1px solid rgba(8,127,245,.18);border-radius:999px;background:rgba(255,255,255,.75);color:#315b8a;font-size:12px;font-weight:800;box-shadow:0 8px 22px rgba(8,68,126,.06);backdrop-filter:blur(10px)}
    .secure svg{width:16px;height:16px;color:var(--blue)}
    .stage{display:grid;grid-template-columns:minmax(0,1.08fr) minmax(380px,.92fr);align-items:center;gap:clamp(42px,7vw,94px);padding:clamp(24px,5vw,58px) clamp(8px,3vw,32px)}
    .eyebrow{display:inline-flex;align-items:center;gap:10px;margin-bottom:22px;color:#0873df;font-size:12px;font-weight:950;letter-spacing:.16em;text-transform:uppercase}
    .eyebrow:before{content:"";width:32px;height:4px;border-radius:99px;background:linear-gradient(90deg,var(--blue),var(--cyan));box-shadow:0 4px 12px rgba(8,127,245,.24)}
    h1{max-width:690px;margin:0;color:#052d62;font-size:clamp(46px,6.2vw,78px);line-height:.98;letter-spacing:-.058em}
    h1 .accent{display:block;background:linear-gradient(100deg,#087ff5 10%,#0fb8de 75%);background-clip:text;-webkit-background-clip:text;color:transparent}
    .lead{max-width:620px;margin:24px 0 0;color:var(--muted);font-size:clamp(16px,1.45vw,19px);line-height:1.72}
    .steps{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin-top:38px}
    .step{min-height:116px;padding:16px;border:1px solid rgba(122,169,214,.3);border-radius:20px;background:rgba(255,255,255,.64);box-shadow:0 16px 38px rgba(30,82,130,.07);backdrop-filter:blur(12px)}
    .step-number{display:grid;place-items:center;width:34px;height:34px;margin-bottom:13px;border-radius:12px;background:#e8f5ff;color:var(--blue);font-size:12px;font-weight:950}
    .step strong{display:block;font-size:13px;line-height:1.25}.step small{display:block;margin-top:5px;color:#758ba7;font-size:11px;line-height:1.4}
    .launcher{position:relative;padding:1px;border-radius:34px;background:linear-gradient(145deg,rgba(8,127,245,.54),rgba(20,198,221,.45),rgba(255,255,255,.9));box-shadow:0 34px 84px rgba(8,62,116,.18)}
    .launcher:before{content:"";position:absolute;z-index:-1;inset:-24px;border-radius:48px;background:linear-gradient(145deg,rgba(8,127,245,.08),rgba(20,198,221,.04));filter:blur(12px)}
    .launcher-inner{overflow:hidden;padding:clamp(28px,4vw,44px);border-radius:33px;background:linear-gradient(160deg,rgba(255,255,255,.98),rgba(248,252,255,.96));box-shadow:inset 0 1px 0 #fff}
    .app-heading{display:flex;align-items:center;gap:16px}
    .app-icon{display:grid;place-items:center;width:64px;height:64px;flex:none;border-radius:21px;background:linear-gradient(145deg,var(--blue),var(--cyan));color:#fff;box-shadow:0 16px 34px rgba(8,127,245,.25)}
    .app-icon svg{width:30px;height:30px}.app-heading small{display:block;color:#6c83a1;font-size:10px;font-weight:950;letter-spacing:.14em;text-transform:uppercase}.app-heading strong{display:block;margin-top:5px;color:#082e62;font-size:21px;line-height:1.15}
    .launch-title{margin:32px 0 0;color:#082e62;font-size:clamp(29px,3.5vw,42px);line-height:1.05;letter-spacing:-.045em}.launch-copy{margin:15px 0 0;color:#607a9b;font-size:15px;line-height:1.65}
    .button{display:flex;align-items:center;justify-content:space-between;width:100%;min-height:68px;margin-top:26px;padding:8px 9px 8px 24px;border:0;border-radius:21px;background:linear-gradient(100deg,#087ff5,#14bfdc);color:#fff;text-decoration:none;font-size:15px;font-weight:950;box-shadow:0 18px 38px rgba(8,127,245,.27);transition:transform .22s ease,box-shadow .22s ease,filter .22s ease}
    .button:hover{transform:translateY(-2px);filter:saturate(1.08);box-shadow:0 23px 46px rgba(8,127,245,.34)}.button:focus-visible{outline:4px solid rgba(8,127,245,.2);outline-offset:4px}.button span{display:grid;place-items:center;width:50px;height:50px;border-radius:16px;background:rgba(255,255,255,.18);font-size:24px;transition:transform .22s ease}.button:hover span{transform:translateX(3px)}
    .status{display:flex;align-items:flex-start;gap:11px;margin-top:16px;padding:15px 16px;border:1px solid #d6e6f5;border-radius:17px;background:#f7fbff;color:#587391;font-size:12px;line-height:1.55}.pulse{width:10px;height:10px;flex:none;margin-top:4px;border-radius:50%;background:var(--green);box-shadow:0 0 0 0 rgba(10,175,122,.34);animation:pulse 1.8s infinite}@keyframes pulse{70%{box-shadow:0 0 0 9px rgba(10,175,122,0)}100%{box-shadow:0 0 0 0 rgba(10,175,122,0)}}
    .privacy{display:flex;align-items:center;justify-content:center;gap:7px;margin-top:19px;color:#7e92ab;font-size:11px;text-align:center}.privacy svg{width:14px;height:14px;color:#55a3ec}.error-icon{background:linear-gradient(145deg,#fb5f73,#ff8e72)}
    .footer{display:flex;align-items:center;justify-content:space-between;gap:20px;padding:24px 4px 2px;border-top:1px solid rgba(125,170,211,.25);color:#7a91ab;font-size:11px}.footer strong{color:#406a98}
    @media(max-width:900px){.shell{min-height:calc(100vh - 32px)}.stage{grid-template-columns:1fr;gap:38px;padding-top:28px}.intro{text-align:center}.eyebrow{justify-content:center}.lead{margin-inline:auto}.steps{text-align:left}.launcher{width:min(560px,100%);margin-inline:auto}.footer{margin-top:34px}}
    @media(max-width:600px){body{padding:14px}.shell{min-height:calc(100vh - 28px)}.topbar{padding:2px 1px 18px}.brand-logo{width:58px;height:45px;border-radius:14px}.brand-logo img{width:52px;height:39px}.brand-copy strong{font-size:17px}.brand-copy small{font-size:8px;letter-spacing:.1em}.secure{padding:9px;width:40px;height:40px;justify-content:center}.secure span{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}.stage{padding:22px 0;gap:30px}.eyebrow{margin-bottom:16px;font-size:10px}.eyebrow:before{width:24px}h1{font-size:clamp(39px,13vw,54px)}.lead{margin-top:18px;font-size:15px;line-height:1.6}.steps{display:flex;gap:10px;margin-top:27px;overflow-x:auto;scroll-snap-type:x mandatory;scrollbar-width:none}.steps::-webkit-scrollbar{display:none}.step{min-width:190px;min-height:104px;scroll-snap-align:start}.launcher{border-radius:28px}.launcher-inner{padding:25px 19px;border-radius:27px}.app-icon{width:56px;height:56px;border-radius:18px}.app-heading strong{font-size:18px}.launch-title{margin-top:27px;font-size:32px}.launch-copy{font-size:14px}.button{min-height:64px;padding-left:18px;font-size:14px}.button span{width:46px;height:46px}.footer{align-items:flex-start;flex-direction:column;padding-top:20px;line-height:1.5}}
    @media(prefers-reduced-motion:reduce){*,*:before,*:after{scroll-behavior:auto!important;animation:none!important;transition:none!important}}
  </style>
</head>
<body>
  <main class="shell">
    <header class="topbar">
      <a class="brand" href="https://cubisshop.ro" aria-label="Cubis Shop">
        <span class="brand-logo"><img src="https://cubisshop.ro/assets/cubis-shop-logo.png" alt=""></span>
        <span class="brand-copy"><strong>Cubis Shop</strong><small>Aplicația de administrare</small></span>
      </a>
      <span class="secure"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/><path d="m9 12 2 2 4-4"/></svg><span>Legătură securizată</span></span>
    </header>

    <?php if ($orderId !== ''): ?>
      <section class="stage" aria-labelledby="page-title">
        <div class="intro">
          <div class="eyebrow">Acces rapid la comandă</div>
          <h1 id="page-title">Comanda ta este <span class="accent">la un click distanță.</span></h1>
          <p class="lead">Deschidem direct fișa comenzii în aplicația Cubis Shop, fără căutări și fără pași inutili. Tot ce ai nevoie pentru procesare apare imediat.</p>
          <div class="steps" aria-label="Cum funcționează">
            <article class="step"><span class="step-number">01</span><strong>Link securizat</strong><small>Creat special pentru această comandă</small></article>
            <article class="step"><span class="step-number">02</span><strong>Deschidere instantă</strong><small>Aplicația este pornită automat</small></article>
            <article class="step"><span class="step-number">03</span><strong>Acces direct</strong><small>Ajungi chiar în fișa comenzii</small></article>
          </div>
        </div>
        <section class="launcher" aria-label="Deschide comanda în aplicație">
          <div class="launcher-inner">
            <div class="app-heading"><span class="app-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5"/><path d="M8 12h8m-4-4 4 4-4 4"/></svg></span><span><small>Cubis Shop Admin</small><strong>Comanda este pregătită</strong></span></div>
            <h2 class="launch-title">Continuă în aplicație</h2>
            <p class="launch-copy">Dacă aplicația este deja deschisă, fereastra ei va fi adusă automat în față.</p>
            <a class="button" id="open-app" href="<?= $safeAppUrl ?>">Deschide comanda <span aria-hidden="true">›</span></a>
            <div class="status" id="status"><span class="pulse" aria-hidden="true"></span><span>Încercăm să deschidem automat aplicația…</span></div>
            <div class="privacy"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>Linkul deschide exclusiv aplicația Cubis Shop instalată pe dispozitiv.</div>
          </div>
        </section>
      </section>
    <?php else: ?>
      <section class="stage" aria-labelledby="page-title">
        <div class="intro"><div class="eyebrow">Link indisponibil</div><h1 id="page-title">Nu putem deschide <span class="accent">această comandă.</span></h1><p class="lead">Adresa folosită este incompletă sau nu mai este validă. Redeschide butonul primit în e-mailul original al comenzii.</p></div>
        <section class="launcher" aria-label="Link invalid"><div class="launcher-inner"><div class="app-heading"><span class="app-icon error-icon" aria-hidden="true">!</span><span><small>Acces oprit</small><strong>Link invalid</strong></span></div><h2 class="launch-title">Încearcă din nou din e-mail</h2><p class="launch-copy">Folosește butonul „Vezi comanda” din cea mai recentă notificare Cubis Shop.</p></div></section>
      </section>
    <?php endif; ?>

    <footer class="footer"><span><strong>Cubis Shop</strong> · Administrarea comenzilor</span><span>Conexiune securizată · Acces intern</span></footer>
  </main>

  <?php if ($orderId !== ''): ?>
  <script>
    (() => {
      const appUrl = <?= json_encode($appUrl, JSON_UNESCAPED_SLASHES) ?>;
      const status = document.getElementById('status');
      const statusText = status?.querySelector('span:last-child');
      let leftPage = false;
      const setStatus = (message) => { if (statusText) statusText.textContent = message; };
      const markOpened = () => { leftPage = true; setStatus('Aplicația a fost solicitată. Poți închide această pagină.'); };
      document.addEventListener('visibilitychange', () => { if (document.hidden) markOpened(); });
      window.addEventListener('blur', markOpened);
      document.getElementById('open-app')?.addEventListener('click', () => setStatus('Deschidem aplicația și comanda…'));
      setTimeout(() => {
        if (leftPage) return;
        window.location.href = appUrl;
        setTimeout(() => { if (!leftPage) setStatus('Dacă aplicația nu s-a deschis, apasă butonul „Deschide comanda”.'); }, 1600);
      }, 350);
    })();
  </script>
  <?php endif; ?>
</body>
</html>

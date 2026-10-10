# Securitate și operare

[← Testing](Testing-and-Quality.md) · [Depanare →](Troubleshooting.md)

## Model de amenințări

```text
 INTERNET
    |
    +--> WEBSITE PUBLIC --> API PUBLIC --------+
    |                                           |
    +--> LOGIN ADMIN ----> API PROTEJAT --------+--> MYSQL CUBIS
                                                |
                                                +--> STRIPE TEST
                                                |
                                                +--> SMARTBILL
```

Orice input client este neîncrezut. Webhookurile pot fi repetate, integratorii pot răspunde târziu, iar un timeout nu dovedește eșecul operației externe.

## Secrete

Nu se comit:

- `.env` populat și `*.local.php`;
- parole DB/FTPS/SMTP;
- `CUBIS_API_KEY`;
- chei Stripe și secretul webhook;
- tokenuri SmartBill;
- certificate, chei private sau dumpuri reale.

Un secret șters din ultimul commit rămâne expus în istoric. Rotește-l.

## Autentificare și autorizare

- rate limit la login;
- sesiuni server-side revocabile;
- rol verificat în API, nu doar în UI;
- ultimul admin activ protejat;
- cont client separat de admin;
- tokenuri absente din URL și log.

## Transport și CORS

- HTTPS în afara localhost;
- origini explicite în `CUBIS_ALLOWED_ORIGINS`;
- fără wildcard pentru admin;
- headere `nosniff`, frame deny și policy restrictivă;
- cookie-uri Secure/HttpOnly/SameSite unde se aplică.

## Stripe

În etapa curentă:

- numai chei TEST;
- evenimente `livemode=false`;
- semnătură webhook cu fereastră controlată;
- metadata de proiect obligatorie;
- evenimente revendicate atomic;
- duplicatele nu se reprocesază;
- evenimentele eșuate se reiau controlat.

Redirectul browserului nu este dovada finală a plății.

## SmartBill

```text
 tokenuri --> server / seif criptat
 UI       --> numai stare filtrata
 emitere  --> poarta explicita
 retry    --> reconciliere inainte de repetare
 audit    --> comanda + actor + ID SmartBill
```

- cheia seifului nu se salvează în DB;
- tokenurile nu sunt returnate clienților;
- citirea și emiterea au porți separate;
- emiterea normală trece prin SmartBill;
- scrierile contabile locale sunt blocate implicit;
- documentele SmartBill nu se modifică direct în DB Cubis.

## Uploaduri și exporturi

- validează MIME, dimensiune și conținut;
- storage-ul este neexecutabil;
- numele utilizatorului nu devine cale directă;
- URL-urile de document sunt obținute prin serviciu;
- exporturile pot conține date personale și au acces controlat.

## Date personale

Cubis procesează contact, adresă, comenzi și date de rambursare. Aplică:

- minimizare;
- acces pe rol;
- date fictive în teste;
- loguri fără payload complet;
- exporturi tratate ca sensibile;
- separarea ștergerii contului de obligațiile legale de păstrare.

## Logging

Loghează ID-ul operației, actorul permis, durata, codul de stare și identificatorii externi nesensibili. Nu loga parole, tokenuri, chei, carduri, date bancare complete sau documente întregi.

## Runbook incident

```text
[1] CONTINE       opreste poarta afectata
[2] PASTREAZA     loguri si ID-uri, fara secrete
[3] CLASIFICA     date / plata / document / disponibilitate
[4] ROTESTE       secretele suspecte
[5] RECONCILIAZA  Cubis cu Stripe/SmartBill
[6] CORECTEAZA    prin flux auditat
[7] VERIFICA      teste + smoke
[8] DOCUMENTEAZA  cauza si preventia
```

Nu „repara” un document extern prin editarea arbitrară a bazei Cubis.

## Checklist operațional

- [ ] webhookuri Stripe eșuate;
- [ ] cereri SmartBill în stare incertă;
- [ ] credentiale/porți SmartBill;
- [ ] joburi și e-mailuri restante;
- [ ] spațiu storage și permisiuni;
- [ ] backup recent și verificat;
- [ ] alerte de dependențe/securitate;
- [ ] diferențe între statusul comenzii și documentul SmartBill.

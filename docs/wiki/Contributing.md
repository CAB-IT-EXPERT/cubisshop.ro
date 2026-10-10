# Ghid de contribuție

[← Depanare](Troubleshooting.md) · [Wiki Home →](Home.md)

## Înainte de modificare

```text
[1] citeste AGENTS.md
[2] verifica git status
[3] citeste documentul domeniului
[4] ruleaza baseline-ul
[5] delimiteaza suprafetele afectate
```

Păstrează modificările existente ale altor colegi și nu folosi resetări destructive.

## Cod prezent versus funcție activă

Această distincție este obligatorie în review și documentație:

| Întrebare | Dovadă necesară |
|---|---|
| există codul? | fișier/funcție/import |
| este accesibil? | rută și autorizare |
| este activ? | flag/configurație și traseu runtime |
| este folosit în producție? | log/raport operațional verificat |
| este autoritativ? | decizie de arhitectură și sursă de adevăr |

Pentru contabilitate/fiscalitate, SmartBill este autoritatea. Emiterea normală trece prin SmartBill, iar scrierile contabile locale sunt blocate implicit. Nu descrie codul dormant drept funcție activă.

## Branch și commit

Branch recomandat:

```text
codex/<descriere-scurta>
```

Commituri:

```text
feat(shop): add ...
fix(orders): prevent ...
docs(wiki): explain ...
test(smartbill): cover ...
refactor(api): isolate ...
```

Un commit exprimă o intenție coerentă.

## Flux

```text
+---------+   +----------+   +---------+   +----------+   +--------+
| REGULI  |-->| BASELINE |-->| SCHIMBA |-->| VERIFICA |-->| REVIEW |
+---------+   +----------+   +---------+   +----------+   +--------+
```

## Reguli de implementare

- apelurile HTTP stau în clienții dedicați;
- validarea finală este server-side;
- efectele multiple folosesc tranzacție/outbox;
- retry-ul este idempotent;
- un timeout extern cere reconciliere;
- SmartBill rămâne autoritatea fiscală;
- nu expune secrete în client;
- păstrează paritatea mobil–desktop;
- mesajele operatorului sunt clare și acționabile;
- folosește diacritice și formatare `ro-RO`.

## Schimbări API

Actualizează împreună:

1. autorizarea și validatorul;
2. serviciul de domeniu;
3. DTO-ul;
4. tipurile/clientul mobil;
5. clientul desktop;
6. website-ul dacă ruta este publică;
7. testele;
8. wiki-ul.

Nu rupe clienții distribuiți fără strategie de compatibilitate.

## SmartBill

La modificarea integrării:

- separă read-only, emitere și e-mail;
- păstrează credentialele server-side;
- salvează identificatorul extern;
- verifică existența documentului după timeout;
- nu aloca local seria/numărul autoritativ;
- nu activa fallback contabil local;
- testează retry-ul fără duplicare;
- afișează eroarea filtrată, nu tokenul.

## Schimbări de schemă

- aditive când este posibil;
- idempotente;
- compatibile cu datele existente;
- CLI-only;
- cu backup și plan de rollback;
- documentate;
- testate pe date fictive.

Nu edita producția manual ca substitut pentru migrare.

## UX și accesibilitate

- loading și blocare dublu-submit;
- erori cu acțiune recomandată;
- focus logic după modal;
- contrast WCAG AA;
- etichete text, nu doar culoare;
- statusuri inteligibile;
- tastatură/safe area pe mobil;
- scalare și tastatură pe desktop.

## Documentație

Actualizează README/wiki dacă schimbi:

- comenzi sau cerințe;
- variabile de mediu;
- endpointuri;
- statusuri;
- responsabilitatea Cubis vs SmartBill;
- deployment/release;
- porți de activare;
- structura repository-ului.

`docs/wiki/` este sursa versionată. GitHub Wiki este oglinda publicată.

## Definition of Done

- [ ] cerința este completă;
- [ ] traseul activ este demonstrat, nu dedus din cod;
- [ ] testele țintite trec;
- [ ] typecheck/lint/audit trec;
- [ ] mobil și desktop sunt sincronizate;
- [ ] SmartBill rămâne autoritatea;
- [ ] erorile și stările goale sunt tratate;
- [ ] nu există secrete/date reale în diff;
- [ ] migrarea este sigură, dacă există;
- [ ] README/wiki sunt actualizate;
- [ ] `git diff --check` trece;
- [ ] diff-ul final a fost citit integral;
- [ ] commitul descrie efectul.

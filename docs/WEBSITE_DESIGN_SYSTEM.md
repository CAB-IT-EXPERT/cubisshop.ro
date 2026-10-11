# Cubis Shop — design system public (Phase C)

## Direcție vizuală

Interfața publică este exclusiv light și urmărește structura referințelor aprobate: fundal alb, suprafețe albastre foarte deschise, bleumarin pentru titluri și albastru electric pentru acțiunile principale. Identitatea vizibilă este numai Cubis Shop.

Sistemul este implementat central în `website/cubis-storefront.css`; cele trei pagini pilot nu mai încarcă `theme.js`, `theme.css` sau asseturile publice G-Trots.

## Tokenuri

| Rol | Valoare principală |
| --- | --- |
| Bleumarin profund | `#041b3c` |
| Bleumarin text | `#08265b` |
| Albastru acțiune | `#006ae6` / `#0786f8` |
| Fundal albastru pal | `#f5faff` / `#eaf8ff` |
| Linie | `#dce7f4` |
| Text secundar | `#657895` |
| Succes/stoc | `#00a86b` |
| Rating | `#ff9f00` |
| Eroare | `#ef3e59` |
| Rază standard | `12px` |
| Container desktop | `1440px` |
| Font | `Manrope`, cu fallback Arial/sans-serif |

## Componente comune

- topbar comercial, header cu căutare live și navigație cont/favorite/coș;
- bară de categorii alimentată din `publicCatalogFilters`;
- search dropdown alimentat exclusiv din catalogul API, cu ranking în Web Worker;
- card de produs unificat pentru homepage, catalog și produse similare;
- panou de compatibilitate dependent de opțiunile realmente disponibile;
- filtre desktop și drawer mobil;
- galerie, cumpărare, specificații, compatibilitate și recenzii pentru produs;
- newsletter prezentat fără a simula o înscriere, deoarece API-ul nu expune un endpoint public separat;
- footer Cubis cu linkurile comerciale existente.

## Responsive

Breakpoints validate: `320`, `375`, `390`, `768`, `1024`, `1280`, `1440` px. La dimensiuni mici:

- căutarea trece pe al doilea rând al headerului;
- bara de categorii devine meniu lateral;
- filtrele catalogului devin drawer;
- grilele folosesc două coloane compacte, fără overflow orizontal;
- galeria produsului și sumarul de cumpărare se stivuiesc;
- taburile produsului rămân navigabile prin scroll orizontal.

## Reguli de conținut și asseturi

- Numele, prețurile, stocurile, categoriile, brandurile, producătorii, specificațiile și recenziile provin numai din API-ul live.
- Nu se inventează carduri pentru a umple grilele. Stările rare/empty sunt tratate ca stări reale.
- Produsele diagnostice rămân vizibile ca date de catalog, dar imaginile marcate explicit `test`, `fictiv` sau `diagnostic` sunt înlocuite cu placeholder neutru, pentru a împiedica reapariția identității vechi.
- Descrierea HTML a produsului trece prin allowlist înainte de randare.
- Compatibilitatea cu cheile locale vechi pentru coș/favorite este păstrată prin adaptoare, fără a le expune vizual.

## Accesibilitate

- skip link, landmark-uri și breadcrumb semantic;
- etichete pentru controale, stări `aria-pressed`, `aria-selected` și live regions;
- focus vizibil și contrast ridicat pentru text/acțiuni;
- suport pentru `prefers-reduced-motion`;
- imagini cu alternative și stări explicite când lipsesc.

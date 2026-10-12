const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const website = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(website, file), 'utf8');
const html = read('magazin.html');
const script = read('cubis-catalog.mjs');
const css = read('cubis-catalog.css');
const storefront = read('cubis-storefront.mjs');

for (const marker of [
  'cubis-catalog.css',
  'cs-catalog-intro',
  '<h1 id="catalog-page-title">Magazin</h1>',
  'data-category-carousel',
  'data-category-prev',
  'data-category-next',
  'cs-mobile-catalog-controls',
  'data-compatibility-mobile-toggle',
  '<span><b>1</b>Alege categoria</span>',
  'data-mobile-load-more',
  'data-filter-group-toggle',
  'data-filter-chevron',
  'data-filter-close-icon',
  'cs-filter-panel__mobile-reset',
  'name="price_range_min"',
]) assert.ok(html.includes(marker), `catalog markup is missing ${marker}`);

for (const marker of [
  'quickCategoryRows',
  'categoryProductCount',
  'bindCategoryCarousel',
  'new ResizeObserver(updateCategoryCarousel)',
  'filterBrandOptions',
  'syncPriceTrack',
  'data-mobile-load-more',
  'data-filter-group-toggle',
  'querySelectorAll("[data-filter-chevron]")',
  'querySelectorAll("[data-reset-filter-icon]")',
  'querySelectorAll("[data-catalog-sort]")',
]) assert.ok(script.includes(marker), `catalog behavior is missing ${marker}`);

assert.match(css, /\.cs-catalog-page \.cs-product-grid--catalog \{[^}]*display:\s*flex[^}]*flex-wrap:\s*wrap/, 'desktop catalog must use a wrapping rail that fills the final row');
assert.match(css, /\.cs-product-grid--catalog \.cs-product-card \{[^}]*flex:\s*1 1 calc\(\(100% - 40px\) \/ 5\)/, 'desktop catalog must preserve five columns while allowing sparse final rows to expand');
assert.match(css, /\.cs-catalog-page \.cs-catalog-hero \{[^}]*linear-gradient\(135deg,\s*#fff,\s*#f1f8ff\)/, 'catalog hero must use the compact light panel');
assert.match(css, /\.cs-catalog-page \.cs-category-tabs \{[^}]*display:\s*flex[^}]*overflow-x:\s*auto[^}]*scroll-snap-type:\s*x mandatory/, 'categories must use a single horizontal carousel rail');
assert.match(css, /@media \(max-width: 768px\)[\s\S]*\.cs-catalog-page \.cs-category-tabs > button \{[^}]*flex:\s*0 0 min\(54vw,\s*200px\)/, 'mobile category cards must stay compact in one swipeable band');
assert.match(css, /\.cs-category-carousel__control\.is-prev\s*\{[^}]*left:/, 'desktop category carousel must expose a previous control');
assert.match(css, /\.cs-category-carousel__control\.is-next\s*\{[^}]*right:/, 'desktop category carousel must expose a next control');
assert.match(css, /\.cs-category-tabs__count \{[^}]*min-width:\s*30px[^}]*color:\s*#fff[^}]*linear-gradient\(135deg,\s*#087cf4,\s*#0668d8\)[^}]*font-size:\s*11px/, 'category counters must use readable white numbers on blue pills');
assert.match(css, /@media \(max-width: 768px\)[\s\S]*\.cs-catalog-page \.cs-catalog-hero__eyebrow,[\s\S]*\.cs-catalog-page \.cs-assistance-card \{ display:\s*none;/, 'mobile catalog header must show only the Magazin title');
assert.match(css, /\.cs-compatibility-mobile-summary \{[^}]*grid-column:\s*1 \/ -1 !important/, 'mobile compatibility summary must span the complete card width');
assert.match(css, /\.is-mobile-open > button\[type="submit"\][^}]*grid-column:\s*1 \/ -1 !important/, 'expanded mobile compatibility action must span the complete card width');
assert.doesNotMatch(css, /cs-category-tabs[^{}]*nth-child[^{}]*\{[^}]*display:\s*none/, 'main categories must not be hidden on mobile');
assert.match(css, /@media \(max-width: 768px\)[\s\S]*cs-product-grid--catalog \.cs-product-card \{[^}]*flex-basis:\s*calc\(\(100% - 9px\) \/ 2\)/, 'mobile catalog must keep two flexible product columns');
assert.match(css, /cs-catalog-card-enter/, 'catalog cards must animate smoothly into the product grid');
assert.match(css, /@media \(min-width: 769px\) and \(hover: hover\)[\s\S]*\.cs-add-button--media \{[^}]*opacity:\s*0[^}]*translateY\(14px\)[\s\S]*\.cs-product-card:hover \.cs-add-button--media/, 'desktop add-to-cart actions must reveal over the image on card hover');
assert.match(storefront, /addButton\("media"\)[\s\S]*addButton\(showDescription \? "body" : ""\)/, 'catalog cards must use an overlay desktop action and a separate in-flow mobile action');
assert.match(css, /\.cs-add-button--body \{ display:\s*none;/, 'the in-flow action must not reserve empty space on desktop');
assert.match(css, /@media \(max-width: 768px\)[\s\S]*\.cs-add-button--media \{ display:\s*none; \}[\s\S]*\.cs-add-button--body \{ display:\s*flex; \}/, 'mobile cards must swap to the in-flow touch action');
assert.match(css, /\.cs-product-grid--catalog \.cs-add-button\.is-added \{[^}]*background:\s*linear-gradient\(135deg,\s*#00ad75,\s*#008f60\)/, 'added catalog products must keep a persistent green action');
assert.match(storefront, /label\.textContent = active \? "Adăugat în coș"/, 'added product actions must show an explicit confirmation label');
assert.match(storefront, /const iconName = active \? "check" : "cart"/, 'added product actions must replace the cart with a check icon');
assert.doesNotMatch(storefront, /Fără recenzii/, 'products without reviews must not render an empty-review message');
assert.match(storefront, /class="cs-product-card__image-backdrop"[\s\S]*class="cs-product-card__image"/, 'product cards must pair a frame-filling backdrop with a complete foreground image');
assert.match(css, /cs-product-card__media \{[^}]*height:\s*auto[^}]*aspect-ratio:\s*1 \/ 1[^}]*flex:\s*0 0 auto/, 'product media must follow the square source ratio so the complete image fills its own frame');
assert.match(css, /cs-product-card__image-backdrop \{ display:\s*none;/, 'catalog cards must not show a second cropped copy behind the original image');
assert.match(css, /cs-product-card__image \{[^}]*width:\s*100%[^}]*height:\s*100%[^}]*padding:\s*0[^}]*object-fit:\s*contain[^}]*transform:\s*none/, 'the foreground product image must use the full frame without cropping or inset scaling');
assert.match(css, /cs-product-card__title \{[^}]*font-size:\s*16px/, 'desktop product titles must remain comfortably readable');
assert.match(css, /cs-product-card__compatibility \{[^}]*font-size:\s*12\.5px/, 'desktop product categories must remain comfortably readable');
assert.match(script, /productCard\(product, \{ showDescription: true \}\)/, 'catalog cards must opt into their short product descriptions');
assert.match(storefront, /class="cs-product-card__description"/, 'catalog-ready cards must expose a short description below the title');
assert.match(css, /cs-product-card__description \{[^}]*font-size:\s*12\.5px[^}]*-webkit-line-clamp:\s*2/, 'desktop product descriptions must be readable and limited to two lines');
assert.match(css, /@media \(max-width: 768px\)[\s\S]*cs-product-card__description \{ display:\s*none;/, 'short descriptions must stay hidden on compact mobile cards');
assert.match(storefront, /const discountPercent = Math\.round/, 'sale cards must derive a discount badge when the API only supplies old and current prices');
assert.match(storefront, /is-discounted/, 'sale cards must expose a dedicated visual state');
assert.match(css, /is-discounted \.cs-product-card__price strong \{ color:\s*#ed2949/, 'sale prices must use the prominent red treatment');
assert.match(css, /@media \(max-width: 360px\)[\s\S]*\.cs-catalog-page \.cs-product-grid--catalog \.cs-product-card \{[^}]*flex-basis:\s*calc\(\(100% - 7px\) \/ 2\)/, 'narrow phones must preserve two product columns');
assert.match(css, /\.cs-catalog-page \.cs-mobile-load-more \{(?=[^}]*linear-gradient\(135deg,)(?=[^}]*border-radius:\s*16px)(?=[^}]*box-shadow:)[^}]*\}/, 'mobile load more must use a polished gradient CTA treatment');
assert.ok(html.includes('data-mobile-load-more-icon'), 'mobile load more must use an SVG icon target instead of a text glyph');
assert.match(script, /querySelector\("\[data-mobile-load-more-icon\]"\)\.innerHTML = icon\("chevron"\)/, 'mobile load more must render the shared chevron icon');
assert.match(css, /@media \(max-width: 768px\)[\s\S]*\.cs-catalog-page \.cs-filter-group legend button \{[^}]*min-height:\s*44px/, 'mobile filter groups must expose touch-friendly targets');
assert.match(css, /@media \(max-width: 768px\)[\s\S]*\.cs-catalog-page \.cs-filter-panel \{[^}]*overflow-y:\s*auto[^}]*scrollbar-width:\s*none/, 'mobile filters must scroll without a visible scrollbar');
assert.match(css, /@media \(max-width: 768px\)[\s\S]*\.cs-catalog-page \.cs-filter-panel \{[^}]*right:\s*auto[^}]*left:\s*0[^}]*translate3d\(-105%,\s*0,\s*0\)[^}]*cubic-bezier/, 'the mobile filter drawer must slide smoothly in from the left');
assert.match(css, /\.cs-catalog-page \.cs-filter-panel\.is-open \{[^}]*translate3d\(0,\s*0,\s*0\)/, 'the opened mobile filter drawer must settle fully on screen');
assert.match(css, /\.cs-catalog-page \.cs-filter-panel__mobile-head \{[^}]*position:\s*sticky[^}]*z-index:\s*6[^}]*top:\s*-10px/, 'the mobile filter header must remain fixed above the scrolling filter content');
assert.match(css, /\.cs-catalog-page\.cs-filter-open \{[^}]*overflow:\s*hidden/, 'opening the filter drawer must lock the page behind it');
assert.match(css, /\.cs-catalog-page \.cs-filter-scrim \{[^}]*backdrop-filter:\s*blur\(14px\)/, 'the open mobile filter drawer must visibly blur the page behind it');
assert.ok(html.includes('class="cs-filter-scrim" type="button" data-filter-scrim data-filter-close'), 'the mobile blur backdrop must be addressable and close the drawer when tapped');
assert.match(script, /querySelectorAll\("\[data-filter-close\]"\)\.forEach\(button => button\.addEventListener\("click", close\)\)/, 'every mobile close target, including the backdrop, must dismiss the drawer');
assert.match(script, /document\.body\.append\(scrim, panel\)/, 'the mobile drawer and backdrop must render in the page top layer');
assert.match(script, /window\.clearTimeout\(closeTimer\)/, 'reopening the drawer must cancel a pending backdrop hide');
assert.match(script, /void panel\.offsetWidth;[\s\S]*openFrame = requestAnimationFrame\(\(\) => \{[\s\S]*panel\.classList\.add\("is-open"\)/, 'the mobile drawer must paint its off-screen state before the opening transition starts');
assert.match(css, /cs-filter-option-in/, 'opening a filter group must animate its options');
assert.match(css, /\[data-filter-categories\] label\.is-root/, 'category roots must be visually distinct from subcategories');
assert.match(css, /cs-filter-group\.is-collapsed/, 'filter groups must be collapsible');
assert.match(css, /@media \(min-width: 769px\)[\s\S]*\.cs-catalog-page \.cs-filter-panel \{[^}]*position:\s*sticky[^}]*top:\s*112px[^}]*max-height:\s*calc\(100vh - 124px\)/, 'desktop filters must remain compact and sticky while products scroll');
assert.match(css, /@media \(min-width: 901px\)[\s\S]*\.cs-catalog-page \.cs-filter-panel \{[^}]*top:\s*220px[^}]*max-height:\s*calc\(100vh - 232px\)/, 'wide desktop filters must stop below the sticky header');
assert.equal((html.match(/class="cs-filter-group is-collapsed"/g) || []).length, 5, 'every filter group must start collapsed');
assert.equal((html.match(/data-filter-group-toggle aria-expanded="false"/g) || []).length, 5, 'all collapsed filter groups must expose the correct accessibility state');
assert.doesNotMatch(html, /cs-filter-group__chevron">[⌃^]/, 'filter expand controls must use SVG icons instead of text glyphs');
assert.match(css, /cs-price-range-wrap/, 'price filter must render the two-handle visual track');
assert.match(css, /\.cs-active-filters button \{[^}]*min-height:\s*44px[^}]*font-size:\s*13px/, 'active filter chips must expose readable touch-friendly targets');
assert.match(script, /data-reset-filters>\$\{icon\("rotate"\)\}/, 'the reset-all action must use the shared reset icon');
assert.match(script, /data-remove-filter="query"[\s\S]*\$\{icon\("close"\)\}/, 'active filters must use SVG close icons instead of text glyphs');

const categories = [
  { id: 'parent', slug: 'parent', parent_id: null },
  { id: 'child', slug: 'child', parent_id: 'parent' },
  { id: 'grandchild', slug: 'grandchild', parent_id: 'child' },
  ...Array.from({ length: 8 }, (_, index) => ({ id: `root-${index}`, parent_id: null })),
];
const categoryState = {
  filters: { categories },
  products: [
    { category_id: 'parent', categorySlug: 'parent' },
    { category_id: 'parent' },
    { category_id: 'child', categorySlug: 'child' },
    { categorySlug: 'grandchild' },
    { category_id: 'root-0' },
  ],
};
const categoryBehavior = vm.runInNewContext(
  script.slice(script.indexOf('function identity('), script.indexOf('function renderCategoryTabs('))
    + '\n({ quickCategoryRows, categoryProductCount, categoryImageUrl, unavailableCategoryImages })',
  { state: categoryState, safeUrl: value => new URL(value, 'https://cubisshop.ro/').href },
);
assert.equal(categoryBehavior.quickCategoryRows().length, 9, 'all API root categories must be shown without a fixed limit');
assert.equal(categoryBehavior.categoryProductCount(categories[0]), 4, 'parent total must include direct products and all descendants without double-counting ID/slug matches');
assert.equal(categoryBehavior.categoryProductCount(categories[1]), 2, 'subcategory total must include deeper descendants');
assert.equal(categoryBehavior.categoryProductCount(categories[2]), 1, 'slug-only products must count');
assert.equal(categoryBehavior.categoryProductCount(categories[4]), 0, 'empty categories must remain at zero');
for (const thumbnail_url of [null, undefined, '', '  ']) {
  assert.equal(categoryBehavior.categoryImageUrl({ thumbnail_url }), '', 'missing images must not become an origin URL');
}
const photo = 'https://cubisshop.ro/category.png';
assert.equal(categoryBehavior.categoryImageUrl({ thumbnail_url: photo }), photo);
categoryBehavior.unavailableCategoryImages.add(photo);
assert.equal(categoryBehavior.categoryImageUrl({ thumbnail_url: photo }), '', 'failed images must not return on the next render');
assert.match(script, /filterOption\("category", identity\(row\), row\.name, categoryProductCount\(row\)/, 'sidebar counts must use hierarchical totals');
assert.match(script, /grid\.dataset\.visibleCount = String\(Math\.min\(visible\.length, 5\)\)/, 'catalog must expose the visible product count for adaptive sparse-result layouts');
assert.match(css, /data-visible-count="1"[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/, 'a single desktop result must use the available catalog width');
assert.match(css, /data-visible-count="1"[^\n]*\.cs-product-card,[\s\S]*data-visible-count="2"[^\n]*\.cs-product-card \{[^}]*display:\s*grid[^}]*minmax\(220px,\s*34%\)/, 'one or two desktop results must use balanced horizontal cards');
assert.match(script, /class="is-nav is-prev"[\s\S]*icon\("chevron"\)[\s\S]*class="is-nav is-next"/, 'pagination must use shared SVG chevrons for previous and next navigation');
assert.match(css, /\.cs-pagination button \{[^}]*min-width:\s*44px[^}]*height:\s*44px[^}]*border-radius:\s*12px/, 'pagination controls must expose touch-friendly modern targets');
assert.match(css, /\.cs-pagination-row \{[^}]*position:\s*relative[^}]*justify-content:\s*center/, 'desktop page controls must remain visually centered in their bar');
assert.match(css, /\.cs-pagination-row label \{[^}]*position:\s*absolute[^}]*right:\s*12px/, 'the page-size selector must not displace the centered page controls');
assert.match(css, /@media \(max-width: 768px\)[\s\S]*\.cs-mobile-load-more \{[^}]*display:\s*flex[\s\S]*\.cs-pagination-row \{ display:\s*none;/, 'phones must use the large load-more action instead of numeric pagination');
assert.match(css, /\.cs-pagination-row select \{[^}]*width:\s*94px[^}]*padding-right:\s*34px[^}]*font-size:\s*14px/, 'desktop page-size values must remain fully visible beside the native chevron');
assert.match(html, /data-page-size><option value="25">25<\/option><option value="30">30<\/option><option value="35">35<\/option><option value="40">40<\/option><option value="45">45<\/option><option value="50">50<\/option>/, 'desktop page-size choices must start at 25 and advance in steps of five');
assert.match(script, /pageSize:\s*25/, 'the catalog must show 25 products per page by default');
assert.match(script, /state\.pageSize \+ 5/, 'mobile load-more must add five products at a time');
assert.match(script, /grid\.dataset\.lastRowCount = String\(lastRowCount\)/, 'catalog rendering must expose the final-row remainder');
assert.match(script, /slice\(-lastRowCount\)[\s\S]*classList\.add\("is-wide-card"\)/, 'one or two products in the final desktop row must receive the compact horizontal treatment');

console.log('cubis-catalog: OK · responsive layout, category carousel, hierarchical totals and optional photos');

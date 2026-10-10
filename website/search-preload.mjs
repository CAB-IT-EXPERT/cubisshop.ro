const script = document.querySelector('script[src*="search-preload"]');
const base = new URL(script?.dataset?.baseUrl || '/', location.origin);
// Acțiunea globală pentru produsele favorite este disponibilă în toate paginile
// care folosesc preîncărcarea comună a căutării.
import(new URL('favorites.js?v=20260908-nav-v1', base).href).catch(() => {});

// Căutarea diagnostică rămâne intenționat oprită. Indexurile copiate au fost
// eliminate și vor fi regenerate numai din API-ul/baza Cubis Shop.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'cubis-commerce-api.mjs'), 'utf8');

const preservedActions = [
  'publicCatalogFilters', 'publicShopConfig', 'publicProductsPage', 'publicProduct',
  'publicProductReviews', 'createPublicReview', 'publicActivePromotions',
  'publicFreeShippingBanners', 'publicCheckoutProducts', 'publicPromotionQuote',
  'createPublicOrder', 'stripeCheckoutStatus', 'cancelStripeCheckout',
  'customerAuthConfig', 'customerLogin', 'customerGoogleLogin', 'customerRegister',
  'customerForgotPassword', 'customerResetPassword', 'customerMe', 'customerOrders',
  'customerAddresses', 'customerAddress', 'customerCoupons', 'customerProfile',
  'customerLogout', 'customerDeleteAccount', 'publicTrackOrder',
  'publicValidateReturnOrder', 'customerCancelOrder', 'customerRequestReturn',
];

for (const action of preservedActions) {
  assert.ok(source.includes(`"${action}"`), `missing preserved public action ${action}`);
}

assert.match(source, /X-Customer-Token/, 'customer authentication header must be preserved');
assert.match(source, /X-Shop-Device/, 'promotion and checkout device header must be preserved');
assert.match(source, /cubis-cart-products-v1/, 'Cubis cart storage must be defined');
assert.match(source, /migrateHistoricalStorage/, 'browser storage migration must be explicit');
assert.doesNotMatch(source, /X-Auth-Token|createProduct|updateProduct|deleteProduct/, 'public website client must not expose administrative product mutations');

console.log(`cubis-commerce-api: OK · ${preservedActions.length} public/customer actions preserved without legacy UI`);

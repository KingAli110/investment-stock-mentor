// netlify/functions/create-checkout-session.js
//
// Replace the two price IDs below with the real Price IDs from your
// Stripe Dashboard (Products → each plan → Pricing → API ID, looks
// like "price_1AbCdEfGhIjKlMnOp").
//
// Requires the environment variable STRIPE_SECRET_KEY to be set in
// Netlify (Site configuration → Environment variables) — never commit
// the real key into this file or into git.

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const PRICE_IDS = {
  monthly: 'price_REPLACE_WITH_MONTHLY_PRICE_ID',
  yearly: 'price_REPLACE_WITH_YEARLY_PRICE_ID',
};

const TRIAL_DAYS = { monthly: 7, yearly: 30 };

// "First 500 customers get 50% off" — backed by a real Stripe coupon
// named FOUNDING50 (50% off, duration "once", max_redemptions 500).
// Create it in Stripe Dashboard → Product catalog → Coupons, using
// exactly that ID, before this will apply anything.
const FOUNDING_COUPON_ID = 'FOUNDING50';

// Update to your real connected domain.
const SITE_URL = 'https://kinlgaliinvesting.xyz';

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  const plan = body.plan;
  if (!PRICE_IDS[plan]) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Unknown plan: ' + plan }) };
  }

  // Only attach the coupon if it still has redemptions left — otherwise
  // Stripe would reject the whole checkout session creation.
  let discounts;
  try {
    const coupon = await stripe.coupons.retrieve(FOUNDING_COUPON_ID);
    const remaining = (coupon.max_redemptions || 0) - (coupon.times_redeemed || 0);
    if (coupon.valid && remaining > 0) {
      discounts = [{ coupon: FOUNDING_COUPON_ID }];
    }
  } catch (e) {
    // Coupon doesn't exist yet — proceed without a discount.
  }

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: PRICE_IDS[plan], quantity: 1 }],
      subscription_data: { trial_period_days: TRIAL_DAYS[plan] },
      customer_email: body.email || undefined,
      success_url: `${SITE_URL}/?checkout=success&plan=${plan}`,
      cancel_url: `${SITE_URL}/?checkout=cancel`,
      ...(discounts ? { discounts } : { allow_promotion_codes: true }),
    });

    return {
      statusCode: 200,
      body: JSON.stringify({ url: session.url }),
    };
  } catch (err) {
    console.error('Stripe error:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
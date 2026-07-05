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

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: PRICE_IDS[plan], quantity: 1 }],
      subscription_data: { trial_period_days: TRIAL_DAYS[plan] },
      customer_email: body.email || undefined,
      success_url: `${SITE_URL}/?checkout=success&plan=${plan}`,
      cancel_url: `${SITE_URL}/?checkout=cancel`,
      allow_promotion_codes: true,
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

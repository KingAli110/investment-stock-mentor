// netlify/functions/get-promo-status.js
//
// Reads the redemption count directly from Stripe for the coupon
// created below, so the "spots left" number is authoritative and
// can't be spoofed by clearing local storage or refreshing.
//
// Requires env var STRIPE_SECRET_KEY (same one used elsewhere).
// Requires a coupon named "FOUNDING50" to exist in Stripe — see
// setup notes below.

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const COUPON_ID = 'FOUNDING50';

exports.handler = async function () {
  try {
    const coupon = await stripe.coupons.retrieve(COUPON_ID);
    const max = coupon.max_redemptions || 500;
    const used = coupon.times_redeemed || 0;
    const remaining = Math.max(0, max - used);
    const active = coupon.valid && remaining > 0;

    return {
      statusCode: 200,
      body: JSON.stringify({ active, remaining, max, used }),
    };
  } catch (err) {
    // Coupon not created yet, or Stripe error — treat as inactive rather
    // than erroring the whole pricing page.
    return {
      statusCode: 200,
      body: JSON.stringify({ active: false, remaining: 0, max: 500, used: 0 }),
    };
  }
};
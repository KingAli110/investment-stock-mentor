// netlify/functions/stripe-webhook.js
//
// Stripe calls this directly (not your frontend) whenever a
// subscription event happens. This is the real source of truth for
// plan status — never trust the browser alone for billing state.
//
// Requires env vars: STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET
// (the latter comes from Stripe Dashboard → Developers → Webhooks
// → your endpoint → "Signing secret", after you register the URL).

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

exports.handler = async function (event) {
  const sig = event.headers['stripe-signature'];
  let stripeEvent;

  try {
    stripeEvent = stripe.webhooks.constructEvent(
      event.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return { statusCode: 400, body: `Webhook Error: ${err.message}` };
  }

  switch (stripeEvent.type) {
    case 'checkout.session.completed': {
      const session = stripeEvent.data.object;
      console.log('Checkout completed:', session.customer, session.customer_email);
      // TODO: mark this user as subscribed in your database.
      // Netlify Functions have no built-in database — pair this with
      // something like Firestore, Supabase, or FaunaDB to persist it.
      break;
    }
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted': {
      const sub = stripeEvent.data.object;
      console.log('Subscription changed:', sub.customer, sub.status);
      // TODO: update plan status / downgrade to weekly if canceled.
      break;
    }
    case 'invoice.payment_failed': {
      const invoice = stripeEvent.data.object;
      console.warn('Payment failed:', invoice.customer);
      // TODO: notify the user, e.g. via email.
      break;
    }
    default:
      break;
  }

  return { statusCode: 200, body: JSON.stringify({ received: true }) };
};

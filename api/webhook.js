const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

module.exports = async function(req, res) {
  const sig = req.headers['stripe-signature'];
  const body = await getRawBody(req);
  let event;

  try {
    event = stripe.webhooks.constructEvent(
      body, sig, process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'payment_intent.succeeded') {
    const pi = event.data.object;
    await supabase.from('orders').insert({
      customer: {
        email: pi.metadata.customer_email,
        name: pi.metadata.customer_name
      },
      items: JSON.parse(pi.metadata.items || '[]'),
      total: pi.amount / 100,
      stripe_id: pi.id,
      status: 'paid'
    });
  }

  res.json({ received: true });
};

function getRawBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => data += chunk);
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

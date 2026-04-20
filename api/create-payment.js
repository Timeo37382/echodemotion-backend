const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

module.exports = async function(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { amount, customer, items } = req.body;

  try {
    const itemsStr = JSON.stringify(items);
    const metadata = {
      customer_email: customer.email,
      customer_name: `${customer.firstName} ${customer.lastName}`,
      customer_phone: customer.phone || '',
      customer_address: customer.address || '',
    };
    
    // Divide la chaîne pour passer la limite des 500 caractères de Stripe
    const chunks = itemsStr.match(/.{1,500}/g) || [];
    chunks.forEach((chunk, index) => {
      metadata[`items_${index}`] = chunk;
    });

    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100),
      currency: 'eur',
      automatic_payment_methods: { enabled: true },
      metadata
    });

    res.json({ clientSecret: paymentIntent.client_secret });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

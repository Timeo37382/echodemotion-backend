const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

module.exports = async function(req, res) {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body, sig, process.env.STRIPE_WEBHOOK_SECRET
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
```

**3.6 Déployer sur Vercel**
1. Sur github.com → créez un repository `echodemotion-backend`
2. Uploadez vos 3 fichiers (bouton Add file → Upload files)
3. Sur vercel.com → Add New Project → connectez le repo GitHub → Deploy

Vercel vous donne une URL comme `echodemotion-backend.vercel.app` — notez-la !

**3.7 Ajouter les variables sur Vercel**
Settings → Environment Variables, ajoutez ces 4 variables :
```
STRIPE_SECRET_KEY     → sk_live_votre_cle
STRIPE_WEBHOOK_SECRET → whsec_... (récupéré après l'étape suivante)
SUPABASE_URL          → https://abcxyz.supabase.co
SUPABASE_SERVICE_KEY  → eyJh... (service_role)

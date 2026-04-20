const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// Helper pour interroger Supabase avec la SERVICE_ROLE_KEY (côté serveur, sécurisé)
async function supabaseFetch(path) {
  const res = await fetch(process.env.SUPABASE_URL + '/rest/v1/' + path, {
    headers: {
      'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY,
      'Authorization': 'Bearer ' + process.env.SUPABASE_SERVICE_ROLE_KEY,
      'Content-Type': 'application/json',
    }
  });
  if (!res.ok) return null;
  return res.json();
}

const ALLOWED_ORIGIN = 'https://echoemotion.com';

module.exports = async function(req, res) {
  // ─── CORS restrictif ───
  const origin = req.headers.origin;
  if (origin === ALLOWED_ORIGIN) {
    res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Vary', 'Origin');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { customer, items, promoCodeId } = req.body;

  // Validation basique des entrées
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Le panier est vide ou invalide.' });
  }
  if (!customer || !customer.email || !customer.firstName || !customer.lastName) {
    return res.status(400).json({ error: 'Informations client incomplètes.' });
  }

  try {
    // ─── 1. Récupérer les IDs des produits dans le panier ───
    const itemIds = items.map(i => Number(i.id));
    const idsQuery = `products?id=in.(${itemIds.join(',')})&select=id,price,shipping,free_shipping_threshold`;
    const products = await supabaseFetch(idsQuery);

    if (!products || products.length === 0) {
      return res.status(400).json({ error: 'Produits introuvables.' });
    }

    // Construire un map pour accéder facilement aux produits par id
    const productMap = {};
    for (const p of products) {
      productMap[Number(p.id)] = p;
    }

    // ─── 2. Calculer le sous-total avec les VRAIS prix depuis Supabase ───
    let subtotal = 0;
    for (const cartItem of items) {
      const dbProduct = productMap[Number(cartItem.id)];
      if (!dbProduct) {
        return res.status(400).json({ error: `Produit introuvable: ID ${cartItem.id}` });
      }
      const qty = Math.max(1, Math.floor(Number(cartItem.qty)));
      subtotal += dbProduct.price * qty;
    }

    // ─── 3. Appliquer le code promo si fourni ───
    let discount = 0;
    if (promoCodeId) {
      const promos = await supabaseFetch(
        `promo_codes?id=eq.${encodeURIComponent(promoCodeId)}&active=eq.true&select=*`
      );
      if (promos && promos.length > 0) {
        const promo = promos[0];
        const notExpired = !promo.expires_at || new Date(promo.expires_at) > new Date();
        const withinUsage = promo.max_usage === null || promo.usage_count < promo.max_usage;
        if (notExpired && withinUsage) {
          if (promo.type === 'percent') {
            discount = subtotal * promo.value / 100;
          } else {
            discount = Math.min(promo.value, subtotal);
          }
        }
      }
    }

    const subtotalAfterDiscount = Math.max(0, subtotal - discount);

    // ─── 4. Calculer les frais de port côté serveur ───
    // On prend la livraison maximale parmi les articles du panier
    let maxShipping = 0;
    let freeShippingThreshold = null;

    for (const cartItem of items) {
      const dbProduct = productMap[Number(cartItem.id)];
      const itemShipping = dbProduct.shipping !== undefined && dbProduct.shipping !== null
        ? Number(dbProduct.shipping)
        : 4.90;
      const itemThreshold = dbProduct.free_shipping_threshold !== undefined && dbProduct.free_shipping_threshold !== null
        ? Number(dbProduct.free_shipping_threshold)
        : 80;

      if (itemShipping > maxShipping) {
        maxShipping = itemShipping;
        freeShippingThreshold = itemThreshold;
      }
    }

    const shippingCost = (freeShippingThreshold !== null && subtotalAfterDiscount >= freeShippingThreshold)
      ? 0
      : maxShipping;

    // ─── 5. Calculer le total TTC (TVA 20%) ───
    const tva = subtotalAfterDiscount * 0.20;
    const total = subtotalAfterDiscount + tva + shippingCost;

    // ─── 6. Construire les métadonnées Stripe ───
    // Stocker les articles avec les VRAIS prix pour le webhook
    const itemsWithTruePrices = items.map(cartItem => {
      const dbProduct = productMap[Number(cartItem.id)];
      return {
        id: cartItem.id,
        name: cartItem.name,
        qty: Math.max(1, Math.floor(Number(cartItem.qty))),
        price: dbProduct.price,
        customImage: cartItem.customImage || null,
        customText: cartItem.customText || null,
        customFont: cartItem.customFont || null,
        customColor: cartItem.customColor || null,
      };
    });

    const itemsStr = JSON.stringify(itemsWithTruePrices);
    const metadata = {
      customer_email: customer.email,
      customer_name: `${customer.firstName} ${customer.lastName}`,
      customer_phone: customer.phone || '',
      customer_address: `${customer.address || ''}, ${customer.zip || ''} ${customer.city || ''}`.trim(),
    };

    // Diviser la chaîne pour respecter la limite de 500 caractères de Stripe par champ de métadonnée
    const chunks = itemsStr.match(/.{1,500}/g) || [];
    chunks.forEach((chunk, index) => {
      metadata[`items_${index}`] = chunk;
    });

    // ─── 7. Créer le PaymentIntent Stripe avec le montant calculé CÔTÉ SERVEUR ───
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(total * 100),
      currency: 'eur',
      automatic_payment_methods: { enabled: true },
      metadata
    });

    res.json({ clientSecret: paymentIntent.client_secret });

  } catch (err) {
    console.error('create-payment error:', err);
    res.status(500).json({ error: err.message });
  }
};

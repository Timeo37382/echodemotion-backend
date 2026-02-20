const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { createClient } = require('@supabase/supabase-js');
const { Resend } = require('resend');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const resend = new Resend(process.env.RESEND_API_KEY);

const SHOP_EMAIL = process.env.SHOP_EMAIL || 'commande@echoemotion.com';
const SHOP_NAME = process.env.SHOP_NAME || "Echo D'émotion";

// Désactiver le body parser de Vercel — Stripe a besoin du raw body
export const config = {
  api: {
    bodyParser: false,
  },
};

// Lire le raw body
function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

module.exports = async function(req, res) {
  const rawBody = await getRawBody(req);
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(
      rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error('Webhook signature error:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'payment_intent.succeeded') {
    const pi = event.data.object;
    const items = JSON.parse(pi.metadata.items || '[]');
    const total = pi.amount / 100;
    const customer = {
      email: pi.metadata.customer_email,
      name: pi.metadata.customer_name,
      phone: pi.metadata.customer_phone || '',
      address: pi.metadata.customer_address || ''
    };

    // 1. Sauvegarder dans Supabase
    const { data: order, error } = await supabase.from('orders').insert({
      customer,
      items,
      total,
      stripe_id: pi.id,
      status: 'paid'
    }).select().single();

    if (error) {
      console.error('Supabase insert error:', error);
    }

    const orderId = order?.id?.slice(0, 8).toUpperCase() || pi.id.slice(-8).toUpperCase();

    // Lignes produits HTML
    const itemsHtml = items.map(i =>
      `<tr>
        <td style="padding:8px 12px;border-bottom:1px solid #e8ddd0">${i.name}${i.customImage ? ' <span style="background:#c9a96e;color:white;font-size:10px;padding:1px 5px">Personnalisé</span>' : ''}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e8ddd0;text-align:center">${i.qty}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e8ddd0;text-align:right">${(i.price * i.qty).toFixed(2).replace('.', ',')} €</td>
      </tr>`
    ).join('');

    // 2. Email confirmation client
    try {
      await resend.emails.send({
        from: `${SHOP_NAME} <${SHOP_EMAIL}>`,
        to: customer.email,
        subject: `✨ Votre commande est confirmée — ${SHOP_NAME}`,
        html: `
<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#faf7f2;font-family:'Helvetica Neue',Arial,sans-serif">
<div style="max-width:580px;margin:0 auto;padding:20px">
  <div style="background:#3a2e26;padding:32px;text-align:center">
    <h1 style="margin:0;color:#c9a96e;font-family:Georgia,serif;font-size:26px;font-weight:400">${SHOP_NAME}</h1>
    <p style="margin:8px 0 0;color:rgba(255,255,255,0.5);font-size:12px;letter-spacing:2px;text-transform:uppercase">Confirmation de commande</p>
  </div>
  <div style="background:white;padding:32px;border-top:3px solid #c9a96e">
    <p style="color:#7d6e60;font-size:14px;margin-top:0">Bonjour ${customer.name},</p>
    <p style="color:#3a2e26;font-size:15px;line-height:1.6">Merci pour votre commande ! Nous la préparons avec soin.</p>
    <div style="background:#faf7f2;padding:16px;margin:20px 0;text-align:center;font-size:12px;color:#7d6e60;letter-spacing:1px;text-transform:uppercase">
      Commande n° <strong style="color:#3a2e26;font-size:14px">#${orderId}</strong>
    </div>
    <table style="width:100%;border-collapse:collapse;margin:16px 0">
      <thead><tr style="background:#faf7f2">
        <th style="padding:8px 12px;text-align:left;font-size:11px;letter-spacing:1px;text-transform:uppercase;color:#7d6e60">Article</th>
        <th style="padding:8px 12px;text-align:center;font-size:11px;letter-spacing:1px;text-transform:uppercase;color:#7d6e60">Qté</th>
        <th style="padding:8px 12px;text-align:right;font-size:11px;letter-spacing:1px;text-transform:uppercase;color:#7d6e60">Prix</th>
      </tr></thead>
      <tbody>${itemsHtml}</tbody>
      <tfoot><tr>
        <td colspan="2" style="padding:12px;text-align:right;font-weight:600;color:#3a2e26">Total TTC</td>
        <td style="padding:12px;text-align:right;font-weight:600;color:#3a2e26;font-size:16px">${total.toFixed(2).replace('.', ',')} €</td>
      </tr></tfoot>
    </table>
    <div style="border:1px solid #e8ddd0;padding:16px;margin:20px 0">
      <p style="margin:0 0 6px;font-size:11px;letter-spacing:1px;text-transform:uppercase;color:#c9a96e">Livraison à</p>
      <p style="margin:0;color:#3a2e26;font-size:14px">${customer.name}<br>${customer.address}${customer.phone ? `<br>📞 ${customer.phone}` : ''}</p>
    </div>
    <p style="color:#7d6e60;font-size:13px;line-height:1.7">Vous recevrez un email dès l'expédition.<br>Contact : <a href="mailto:${SHOP_EMAIL}" style="color:#c9a96e">${SHOP_EMAIL}</a></p>
  </div>
  <div style="padding:20px;text-align:center;font-size:11px;color:#bbb">© ${new Date().getFullYear()} ${SHOP_NAME} · Paiement sécurisé Stripe</div>
</div></body></html>`
      });
    } catch(e) { console.error('Email client error:', e); }

    // 3. Email notification boutique
    try {
      await resend.emails.send({
        from: `${SHOP_NAME} <${SHOP_EMAIL}>`,
        to: SHOP_EMAIL,
        subject: `🛍️ Nouvelle commande #${orderId} — ${total.toFixed(2).replace('.', ',')} €`,
        html: `
<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#faf7f2;font-family:'Helvetica Neue',Arial,sans-serif">
<div style="max-width:580px;margin:0 auto;padding:20px">
  <div style="background:#3a2e26;padding:24px;text-align:center">
    <h1 style="margin:0;color:#c9a96e;font-family:Georgia,serif;font-size:22px;font-weight:400">🛍️ Nouvelle commande !</h1>
    <p style="margin:8px 0 0;color:rgba(255,255,255,0.6);font-size:13px">#${orderId} · ${total.toFixed(2).replace('.', ',')} €</p>
  </div>
  <div style="background:white;padding:28px;border-top:3px solid #c9a96e">
    <div style="margin-bottom:20px">
      <p style="margin:0 0 4px;font-size:11px;letter-spacing:1px;text-transform:uppercase;color:#c9a96e">Client</p>
      <p style="margin:0;color:#3a2e26;font-size:15px;font-weight:600">${customer.name}</p>
      <p style="margin:2px 0;color:#7d6e60;font-size:13px">📧 <a href="mailto:${customer.email}" style="color:#7d6e60">${customer.email}</a></p>
      ${customer.phone ? `<p style="margin:2px 0;color:#7d6e60;font-size:13px">📞 ${customer.phone}</p>` : ''}
      ${customer.address ? `<p style="margin:2px 0;color:#7d6e60;font-size:13px">📍 ${customer.address}</p>` : ''}
    </div>
    <table style="width:100%;border-collapse:collapse;margin:16px 0">
      <thead><tr style="background:#faf7f2">
        <th style="padding:8px 12px;text-align:left;font-size:11px;letter-spacing:1px;text-transform:uppercase;color:#7d6e60">Article</th>
        <th style="padding:8px 12px;text-align:center;font-size:11px;letter-spacing:1px;text-transform:uppercase;color:#7d6e60">Qté</th>
        <th style="padding:8px 12px;text-align:right;font-size:11px;letter-spacing:1px;text-transform:uppercase;color:#7d6e60">Prix</th>
      </tr></thead>
      <tbody>${itemsHtml}</tbody>
      <tfoot><tr>
        <td colspan="2" style="padding:12px;text-align:right;font-weight:600">Total</td>
        <td style="padding:12px;text-align:right;font-weight:600;font-size:16px">${total.toFixed(2).replace('.', ',')} €</td>
      </tr></tfoot>
    </table>
    ${items.some(i => i.customImage) ? `
    <div style="background:#fff8f0;padding:16px;border:1px solid #c9a96e;margin-top:16px">
      <p style="margin:0 0 10px;font-size:11px;letter-spacing:1px;text-transform:uppercase;color:#c9a96e">⚠️ Images personnalisées à télécharger</p>
      ${items.filter(i => i.customImage).map(i => `
        <p style="margin:4px 0;font-size:13px;color:#3a2e26">${i.name} : <a href="${i.customImage}" style="color:#c9a96e">Voir l'image →</a></p>
      `).join('')}
    </div>` : ''}
  </div>
</div></body></html>`
      });
    } catch(e) { console.error('Email boutique error:', e); }
  }

  res.json({ received: true });
};

const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);
const SHOP_EMAIL = process.env.SHOP_EMAIL || 'contact@echoemotion.com';
const SHOP_NAME = process.env.SHOP_NAME || "Echo D'émotion";

module.exports = async function(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { orderId, customer, items, total } = req.body;

  if (!customer?.email) {
    return res.status(400).json({ error: 'Missing customer email' });
  }

  const shortId = orderId?.slice(0, 8).toUpperCase() || '--------';

  const itemsHtml = (items || []).map(i =>
    `<tr>
      <td style="padding:8px 12px;border-bottom:1px solid #e8ddd0">${i.name}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e8ddd0;text-align:center">${i.qty}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e8ddd0;text-align:right">${(i.price * i.qty).toFixed(2).replace('.', ',')} €</td>
    </tr>`
  ).join('');

  try {
    await resend.emails.send({
      from: `${SHOP_NAME} <${SHOP_EMAIL}>`,
      to: customer.email,
      subject: `📦 Votre commande est en route ! — ${SHOP_NAME}`,
      html: `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#faf7f2;font-family:'Helvetica Neue',Arial,sans-serif">
  <div style="max-width:580px;margin:0 auto;padding:20px">

    <div style="background:#3a2e26;padding:32px;text-align:center">
      <h1 style="margin:0;color:#c9a96e;font-family:Georgia,serif;font-size:26px;font-weight:400">${SHOP_NAME}</h1>
      <p style="margin:8px 0 0;color:rgba(255,255,255,0.5);font-size:12px;letter-spacing:2px;text-transform:uppercase">Votre commande est expédiée !</p>
    </div>

    <div style="background:white;padding:32px;border-top:3px solid #c9a96e">
      <p style="color:#7d6e60;font-size:14px;margin-top:0">Bonjour ${customer.name || customer.email},</p>

      <div style="background:#f0fdf4;border:1px solid #4a7c59;padding:16px;margin:16px 0;text-align:center">
        <p style="margin:0;color:#4a7c59;font-size:16px;font-weight:600">📦 Votre commande #${shortId} est en chemin !</p>
        <p style="margin:6px 0 0;color:#4a7c59;font-size:13px">Vous la recevrez dans 2 à 5 jours ouvrés.</p>
      </div>

      <table style="width:100%;border-collapse:collapse;margin:16px 0">
        <thead>
          <tr style="background:#faf7f2">
            <th style="padding:8px 12px;text-align:left;font-size:11px;letter-spacing:1px;text-transform:uppercase;color:#7d6e60">Article</th>
            <th style="padding:8px 12px;text-align:center;font-size:11px;letter-spacing:1px;text-transform:uppercase;color:#7d6e60">Qté</th>
            <th style="padding:8px 12px;text-align:right;font-size:11px;letter-spacing:1px;text-transform:uppercase;color:#7d6e60">Prix</th>
          </tr>
        </thead>
        <tbody>${itemsHtml}</tbody>
        <tfoot>
          <tr>
            <td colspan="2" style="padding:12px;text-align:right;font-weight:600;color:#3a2e26">Total</td>
            <td style="padding:12px;text-align:right;font-weight:600;color:#3a2e26;font-size:16px">${Number(total).toFixed(2).replace('.', ',')} €</td>
          </tr>
        </tfoot>
      </table>

      <div style="border:1px solid #e8ddd0;padding:16px;margin:20px 0">
        <p style="margin:0 0 6px;font-size:11px;letter-spacing:1px;text-transform:uppercase;color:#c9a96e">Livraison à</p>
        <p style="margin:0;color:#3a2e26;font-size:14px">${customer.name || ''}<br>${customer.address || ''}</p>
      </div>

      <p style="color:#7d6e60;font-size:13px;line-height:1.7">Une question ? Contactez-nous : <a href="mailto:${SHOP_EMAIL}" style="color:#c9a96e">${SHOP_EMAIL}</a></p>
    </div>

    <div style="padding:20px;text-align:center;font-size:11px;color:#bbb">
      © ${new Date().getFullYear()} ${SHOP_NAME}
    </div>
  </div>
</body>
</html>`
    });

    res.json({ sent: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

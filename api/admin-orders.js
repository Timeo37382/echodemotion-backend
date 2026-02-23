const crypto = require('crypto');

function isAuth(req) {
  const cookie = (req.headers.cookie || '').match(/admin_session=([^;]+)/);
  if (!cookie) return false;
  const [payload, sig] = cookie[1].split('.');
  if (!payload || !sig) return false;
  const expected = crypto.createHmac('sha256', process.env.ADMIN_SESSION_SECRET).update(payload).digest('hex');
  if (sig !== expected) return false;
  try {
    const { role, ts } = JSON.parse(Buffer.from(payload, 'base64').toString());
    return role === 'admin' && Date.now() - ts < 8 * 60 * 60 * 1000;
  } catch { return false; }
}

async function sb(path, opts = {}) {
  const r = await fetch(process.env.SUPABASE_URL + '/rest/v1/' + path, {
    ...opts,
    headers: { 'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY, 'Authorization': 'Bearer ' + process.env.SUPABASE_SERVICE_ROLE_KEY, 'Content-Type': 'application/json', 'Prefer': 'return=representation', ...(opts.headers || {}) }
  });
  return { data: await r.json(), ok: r.ok };
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://echoemotion.com');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!isAuth(req)) return res.status(401).json({ error: 'Non autorisé' });

  if (req.method === 'GET') {
    const { data, ok } = await sb('orders?select=*&order=created_at.desc');
    return ok ? res.json(data) : res.status(500).json({ error: 'Erreur' });
  }

  if (req.method === 'PATCH') {
    const { id, status } = req.body;
    if (!['paid','shipped','delivered'].includes(status)) return res.status(400).json({ error: 'Statut invalide' });
    if (!/^[0-9a-f-]{36}$/i.test(id)) return res.status(400).json({ error: 'ID invalide' });

    // Récupérer la commande pour envoyer l'email
    const { data: orders } = await sb(`orders?id=eq.${id}&select=*`);
    const order = orders[0];

    const { data, ok } = await sb(`orders?id=eq.${id}`, { method: 'PATCH', body: JSON.stringify({ status }) });

    // Envoyer email si expédié
    if (ok && status === 'shipped' && order) {
      fetch(process.env.BACKEND_URL + '/api/send-shipped', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: order.id, customer: order.customer, items: order.items, total: order.total })
      }).catch(() => {});
    }

    return ok ? res.json(data) : res.status(500).json({ error: 'Erreur' });
  }

  return res.status(405).end();
};

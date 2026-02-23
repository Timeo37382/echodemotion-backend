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
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!isAuth(req)) return res.status(401).json({ error: 'Non autorisé' });

  if (req.method === 'GET') {
    const { data, ok } = await sb('promo_codes?select=*&order=created_at.desc');
    return ok ? res.json(data) : res.status(500).json({ error: 'Erreur' });
  }
  if (req.method === 'POST') {
    const { data, ok } = await sb('promo_codes', { method: 'POST', body: JSON.stringify(req.body) });
    return ok ? res.json(data) : res.status(500).json({ error: 'Erreur' });
  }
  if (req.method === 'PATCH') {
    const { id, ...updates } = req.body;
    const { data, ok } = await sb(`promo_codes?id=eq.${Number(id)}`, { method: 'PATCH', body: JSON.stringify(updates) });
    return ok ? res.json(data) : res.status(500).json({ error: 'Erreur' });
  }
  if (req.method === 'DELETE') {
    const { id } = req.body;
    const { ok } = await sb(`promo_codes?id=eq.${Number(id)}`, { method: 'DELETE' });
    return ok ? res.json({ ok: true }) : res.status(500).json({ error: 'Erreur' });
  }
  return res.status(405).end();
};

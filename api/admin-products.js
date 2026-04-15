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
  // Handle responses without JSON body properly (like 204 No Content)
  let data = null;
  const text = await r.text();
  if (text) {
    try { data = JSON.parse(text); } catch { data = text; }
  }
  return { data, ok: r.ok };
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://echoemotion.com');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!isAuth(req)) return res.status(401).json({ error: 'Non autorisé' });

  if (req.method === 'GET') {
    const { data, ok } = await sb('products?select=*&order=id.asc');
    return ok ? res.json(data) : res.status(500).json({ error: 'Erreur GET products' });
  }

  if (req.method === 'PUT') {
    const products = req.body || [];
    if (!Array.isArray(products)) return res.status(400).json({ error: 'Le corps doit être un tableau' });

    // 1. Lire tous les IDs existants
    const selectRes = await sb('products?select=id');
    if (!selectRes.ok) return res.status(500).json({ error: 'Erreur lecture des produits existants' });
    
    const existingIds = (selectRes.data || []).map(r => Number(r.id));
    const currentIds = products.map(p => Number(p.id));
    const idsToDelete = existingIds.filter(id => !currentIds.includes(id));

    // 2. Supprimer ceux absents
    if (idsToDelete.length) {
      const { ok: delOk } = await sb(`products?id=in.(${idsToDelete.join(',')})`, { method: 'DELETE' });
      if (!delOk) return res.status(500).json({ error: 'Erreur lors de la suppression' });
    }

    // 3. Upsert
    if (products.length) {
      const { data: upsertData, ok: upsertOk } = await sb('products?on_conflict=id', {
        method: 'POST',
        headers: { 'Prefer': 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify(products)
      });
      if (!upsertOk) return res.status(500).json({ error: 'Erreur lors de la mise à jour' });
    }

    return res.status(200).json({ ok: true, count: products.length });
  }

  return res.status(405).end();
};

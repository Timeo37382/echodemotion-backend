// api/admin-products.js
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

async function sbFetch(path, opts = {}) {
  const r = await fetch(process.env.SUPABASE_URL + '/rest/v1/' + path, {
    ...opts,
    headers: {
      'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY,
      'Authorization': 'Bearer ' + process.env.SUPABASE_SERVICE_ROLE_KEY,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation',
      ...(opts.headers || {})
    }
  });
  const text = await r.text();
  let data = null;
  try { data = JSON.parse(text); } catch { data = null; }
  return { data, ok: r.ok, status: r.status };
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://echoemotion.com');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!isAuth(req)) return res.status(401).json({ error: 'Non autorisé' });

  // ── GET : retourner le tableau de produits ──
  if (req.method === 'GET') {
    const { data, ok } = await sbFetch('products?select=data&order=id.asc&limit=1');
    if (!ok) return res.status(500).json({ error: 'Erreur lecture Supabase' });

    // Supabase retourne : [{ data: [...produits] }]
    // On extrait le tableau de produits directement
    const products = (Array.isArray(data) && data.length > 0 && Array.isArray(data[0].data))
      ? data[0].data
      : [];

    return res.status(200).json(products);
  }

  // ── PATCH : sauvegarder le tableau de produits ──
  if (req.method === 'PATCH') {
    const { products } = req.body || {};
    if (!Array.isArray(products)) {
      return res.status(400).json({ error: 'Format invalide : products doit être un tableau' });
    }

    // Chercher si une ligne existe déjà
    const { data: rows, ok: readOk } = await sbFetch('products?select=id&limit=1');
    if (!readOk) return res.status(500).json({ error: 'Erreur lecture' });

    if (!rows || rows.length === 0) {
      // Aucune ligne → créer
      const { ok } = await sbFetch('products', {
        method: 'POST',
        body: JSON.stringify({ data: products })
      });
      if (!ok) return res.status(500).json({ error: 'Erreur création' });
    } else {
      // Ligne existante → mettre à jour
      const rowId = rows[0].id;
      const { ok } = await sbFetch(`products?id=eq.${rowId}`, {
        method: 'PATCH',
        body: JSON.stringify({ data: products, updated_at: new Date().toISOString() })
      });
      if (!ok) return res.status(500).json({ error: 'Erreur mise à jour' });
    }

    // Retourner les produits sauvegardés pour confirmation
    return res.status(200).json({ ok: true, count: products.length });
  }

  return res.status(405).end();
};

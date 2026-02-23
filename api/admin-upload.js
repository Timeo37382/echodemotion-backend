// api/admin-upload.js
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

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://echoemotion.com');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-file-name, x-file-type');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!isAuth(req)) return res.status(401).json({ error: 'Non autorisé' });
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const fileName = req.headers['x-file-name'];
    const fileType = req.headers['x-file-type'];

    if (!fileName || !fileType) {
      return res.status(400).json({ error: 'Nom ou type de fichier manquant' });
    }

    // Lire le body brut (le fichier binaire)
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const fileBuffer = Buffer.concat(chunks);

    // Upload vers Supabase Storage avec la clé service_role
    const uploadRes = await fetch(
      `${process.env.SUPABASE_URL}/storage/v1/object/produits/${fileName}`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
          'Content-Type': fileType,
          'x-upsert': 'true'
        },
        body: fileBuffer
      }
    );

    if (!uploadRes.ok) {
      const err = await uploadRes.text();
      return res.status(500).json({ error: 'Erreur upload Supabase: ' + err });
    }

    const publicUrl = `${process.env.SUPABASE_URL}/storage/v1/object/public/produits/${fileName}`;
    return res.status(200).json({ url: publicUrl });

  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};

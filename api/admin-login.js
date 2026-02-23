// api/admin-login.js
const crypto = require('crypto');

function createToken(secret) {
  const payload = Buffer.from(JSON.stringify({ role: 'admin', ts: Date.now() })).toString('base64');
  const sig = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  return `${payload}.${sig}`;
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://echoemotion.com');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { username, password } = req.body || {};
  await new Promise(r => setTimeout(r, 500));

  if (username !== process.env.ADMIN_USERNAME || password !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Identifiants incorrects' });
  }

  const token = createToken(process.env.ADMIN_SESSION_SECRET);

  // SameSite=None obligatoire pour les cookies cross-domaine (echoemotion.com → vercel.app)
  res.setHeader('Set-Cookie', `admin_session=${token}; HttpOnly; Secure; SameSite=None; Max-Age=${60 * 60 * 8}; Path=/`);
  return res.status(200).json({ ok: true });
};

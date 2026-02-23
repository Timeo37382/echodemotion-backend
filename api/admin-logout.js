// api/admin-logout.js
module.exports = function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://echoemotion.com');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // SameSite=None obligatoire pour les cookies cross-domaine
  res.setHeader('Set-Cookie', 'admin_session=; HttpOnly; Secure; SameSite=None; Max-Age=0; Path=/');
  return res.status(200).json({ ok: true });
};

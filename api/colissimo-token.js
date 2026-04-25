
const ALLOWED_ORIGIN = 'https://echoemotion.com';

module.exports = async function(req, res) {
  // CORS restrictif
  const origin = req.headers.origin;
  if (origin === ALLOWED_ORIGIN) {
    res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Vary', 'Origin');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).end();

  const login = process.env.COLISSIMO_LOGIN;
  const password = process.env.COLISSIMO_PASSWORD;

  if (!login || !password) {
    return res.status(500).json({ error: 'Identifiants Colissimo non configurés sur le serveur.' });
  }

  try {
    const colissimoRes = await fetch('https://ws.colissimo.fr/widget-colissimo/rest/authenticate.rest', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        login: login,
        password: password
      })
    });

    const data = await colissimoRes.json();
    
    // Colissimo renvoie généralement { token: '...' } ou une erreur
    if (data && data.token) {
      res.status(200).json({ token: data.token });
    } else {
      res.status(400).json({ error: 'Erreur d\'authentification Colissimo.', details: data });
    }
  } catch (err) {
    console.error('Erreur API Colissimo:', err);
    res.status(500).json({ error: 'Erreur interne lors de la connexion à La Poste.' });
  }
};

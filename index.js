const http = require('http');
const PORT = process.env.PORT || 3000;

console.log('🚀 Démarrage API de test...');

const server = http.createServer((req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    return res.end();
  }

  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200);
    return res.end(JSON.stringify({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      message: 'Test API fonctionne !'
    }));
  }

  if (req.method === 'GET' && req.url === '/') {
    res.writeHead(200);
    return res.end(JSON.stringify({
      service: 'Test API',
      endpoints: {
        'GET /health': 'Health check',
        'POST /generate': 'Test generation'
      }
    }));
  }

  if (req.method === 'POST' && req.url === '/generate') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const { text } = JSON.parse(body);
        
        res.writeHead(200);
        res.end(JSON.stringify({
          ok: true,
          message: 'Test réussi !',
          receivedText: text,
          timestamp: new Date().toISOString(),
          note: 'Ceci est un test sans génération d\'image'
        }));
      } catch (error) {
        res.writeHead(400);
        res.end(JSON.stringify({ ok: false, error: error.message }));
      }
    });
    return;
  }

  res.writeHead(404);
  res.end(JSON.stringify({ error: 'Not found' }));
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ API de test démarrée sur http://0.0.0.0:${PORT}`);
  console.log(`🏥 Health: http://0.0.0.0:${PORT}/health`);
});

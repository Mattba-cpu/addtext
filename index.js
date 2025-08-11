const fs = require('fs');
const http = require('http');
const { URL } = require('url');
const sharp = require('sharp');

// Configuration Sharp pour éviter les crashes
sharp.cache(false);
sharp.concurrency(1);

const TextToSVG = require('text-to-svg');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// Configuration
const inputImagePath = 'template.png';
const MAX_TEXT_LENGTH = 300;
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

console.log(`🚀 Démarrage du service API...`);
console.log(`📋 Configuration: PORT=${PORT}, HOST=${HOST}, ENV=${process.env.NODE_ENV || 'development'}`);

// Supabase setup
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Variables d\'environnement manquantes:');
  console.error(`   - SUPABASE_URL: ${supabaseUrl ? '✅' : '❌'}`);
  console.error(`   - SUPABASE_KEY: ${supabaseKey ? '✅' : '❌'}`);
  process.exit(1);
}

let supabase;
try {
  supabase = createClient(supabaseUrl, supabaseKey);
  console.log('✅ Client Supabase initialisé');
} catch (error) {
  console.error('❌ Erreur Supabase:', error.message);
  process.exit(1);
}

// Chargement police
let textToSVG;
try {
  if (fs.existsSync('./Montserrat-Bold.ttf')) {
    textToSVG = TextToSVG.loadSync('./Montserrat-Bold.ttf');
    console.log('✅ Police Montserrat-Bold.ttf chargée');
  } else {
    textToSVG = TextToSVG.loadSync();
    console.log('✅ Police système chargée');
  }
} catch (error) {
  textToSVG = TextToSVG.loadSync();
  console.log('⚠️ Police système utilisée par défaut');
}

// Vérification template
if (!fs.existsSync(inputImagePath)) {
  console.error(`❌ Template introuvable: ${inputImagePath}`);
  process.exit(1);
}
console.log('✅ Template vérifié');

// Utilitaires
function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function wrapText(text, maxWidth, fontSize) {
  const words = text.split(' ');
  const lines = [];
  let currentLine = '';

  for (const word of words) {
    const testLine = (currentLine + word + ' ').trim();
    let width;
    
    try {
      const metrics = textToSVG.getMetrics(testLine, { fontSize });
      width = metrics.width;
    } catch (error) {
      width = testLine.length * fontSize * 0.6;
    }
    
    if (width > maxWidth && currentLine !== '') {
      lines.push(currentLine.trim());
      currentLine = word + ' ';
    } else {
      currentLine = testLine + ' ';
    }
  }
  
  if (currentLine.trim()) {
    lines.push(currentLine.trim());
  }
  
  return lines;
}

function generateSVG({ width, height, box, lines, fontSize }) {
  const lineHeight = fontSize * 1.4;
  const verticalShift = -20;
  const startY = box.y + box.height / 2 + verticalShift - ((lines.length - 1) * lineHeight) / 2;

  const svgLines = lines
    .map((line, i) => {
      const y = startY + i * lineHeight;
      return `<text x="${box.x + box.width / 2}" y="${y}" text-anchor="middle" dominant-baseline="middle">${escapeHtml(line)}</text>`;
    })
    .join('');

  return `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <style>
      @font-face {
        font-family: 'Montserrat';
        src: url('Montserrat-Bold.ttf');
      }
      text {
        font-family: 'Montserrat', sans-serif;
        font-size: ${fontSize}px;
        fill: #000000;
        font-weight: bold;
      }
    </style>
    ${svgLines}
  </svg>`;
}

// Fonction principale
async function generateAndUpload(texte) {
  const startTime = Date.now();
  console.log(`🔄 Génération: "${texte?.slice(0, 50)}..." (${texte?.length}/${MAX_TEXT_LENGTH} chars)`);
  
  if (!texte || !texte.trim()) {
    throw new Error('Aucun texte fourni');
  }
  if (texte.length > MAX_TEXT_LENGTH) {
    throw new Error(`Texte trop long: ${texte.length}/${MAX_TEXT_LENGTH} caractères`);
  }

  // Traitement image
  let baseImage;
  let width, height;
  
  try {
    baseImage = sharp(inputImagePath);
    const metadata = await baseImage.metadata();
    width = metadata.width;
    height = metadata.height;
    console.log(`✅ Image: ${width}x${height}px`);
  } catch (error) {
    throw new Error(`Erreur image: ${error.message}`);
  }

  // Zone de texte
  const box = {
    x: Math.round(width * 0.18),
    y: Math.round(height * 0.56),
    width: Math.round(width * 0.63),
    height: Math.round(height * 0.23),
  };
  
  const fontSize = Math.round(box.height * 0.18);
  const lines = wrapText(texte, box.width * 0.9, fontSize);

  // SVG
  const svgContent = generateSVG({ width, height, box, lines, fontSize });
  const svgBuffer = Buffer.from(svgContent, 'utf-8');

  // Composition
  let finalBuffer;
  try {
    finalBuffer = await baseImage
      .composite([{ 
        input: svgBuffer, 
        top: 0, 
        left: 0,
        blend: 'over'
      }])
      .png({ quality: 90, compressionLevel: 6 })
      .toBuffer();
    
    console.log(`✅ Image composée: ${Math.round(finalBuffer.length / 1024)}KB`);
  } catch (error) {
    throw new Error(`Erreur composition: ${error.message}`);
  }

  // Upload Supabase avec retry
  const timestamp = Date.now();
  const safeText = texte
    .slice(0, 30)
    .replace(/[^a-z0-9\s]/gi, '')
    .replace(/\s+/g, '_')
    .toLowerCase();
  const fileName = `citation_${safeText}_${timestamp}.png`;

  let uploadResult;
  const maxRetries = 3;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      uploadResult = await supabase.storage
        .from('citation')
        .upload(fileName, finalBuffer, {
          contentType: 'image/png',
          cacheControl: '3600',
          upsert: false
        });
        
      if (uploadResult.error) {
        throw new Error(uploadResult.error.message);
      }
      
      console.log(`✅ Upload réussi (tentative ${attempt})`);
      break;
      
    } catch (error) {
      console.error(`❌ Tentative ${attempt}/${maxRetries}:`, error.message);
      
      if (attempt >= maxRetries) {
        throw new Error(`Upload échoué après ${maxRetries} tentatives: ${error.message}`);
      }
      
      await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
    }
  }

  // URL publique
  const { data: { publicUrl } } = supabase.storage
    .from('citation')
    .getPublicUrl(fileName);

  const totalTime = Date.now() - startTime;
  console.log(`✅ Terminé en ${totalTime}ms - ${fileName}`);

  return { 
    fileName, 
    publicUrl, 
    processingTime: totalTime,
    fileSize: Math.round(finalBuffer.length / 1024),
    textLength: texte.length
  };
}

// Gestion arrêt gracieux
process.on('SIGTERM', () => {
  console.log('🛑 SIGTERM - Arrêt gracieux...');
  server.close(() => process.exit(0));
});

process.on('SIGINT', () => {
  console.log('🛑 SIGINT - Arrêt gracieux...');
  server.close(() => process.exit(0));
});

// Serveur HTTP pour API
const server = http.createServer(async (req, res) => {
  const startTime = Date.now();
  
  // Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Content-Type', 'application/json');
  
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    
    // CORS preflight
    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      return res.end();
    }

    // Health check (ESSENTIEL pour Coolify)
    if (req.method === 'GET' && (url.pathname === '/health' || url.pathname === '/healthz')) {
      const health = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: Math.round(process.uptime()),
        memory: {
          used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
          total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024)
        },
        pid: process.pid
      };
      
      res.writeHead(200);
      return res.end(JSON.stringify(health, null, 2));
    }

    // Readiness check
    if (req.method === 'GET' && url.pathname === '/ready') {
      try {
        // Vérifications critiques
        if (!fs.existsSync(inputImagePath)) throw new Error('Template manquant');
        if (!textToSVG) throw new Error('Police non chargée');
        if (!supabase) throw new Error('Supabase non initialisé');
        
        res.writeHead(200);
        res.end(JSON.stringify({ status: 'ready', timestamp: new Date().toISOString() }));
      } catch (error) {
        res.writeHead(503);
        res.end(JSON.stringify({ status: 'not ready', error: error.message }));
      }
      return;
    }

    // API Info - Documentation basique pour n8n
    if (req.method === 'GET' && url.pathname === '/') {
      const apiDoc = {
        service: 'Text to Image Generator API',
        version: '1.0.0',
        endpoints: {
          'POST /generate': {
            description: 'Génère une image avec du texte',
            body: {
              text: 'string (requis, max 300 caractères)'
            },
            response: {
              ok: 'boolean',
              fileName: 'string',
              publicUrl: 'string',
              processingTime: 'number (ms)',
              fileSize: 'number (KB)',
              textLength: 'number'
            }
          },
          'GET /health': 'Health check pour monitoring',
          'GET /ready': 'Readiness check'
        },
        limits: {
          maxTextLength: MAX_TEXT_LENGTH,
          imageFormat: 'PNG',
          storage: 'Supabase'
        }
      };
      
      res.writeHead(200);
      return res.end(JSON.stringify(apiDoc, null, 2));
    }

    // API principale pour n8n
    if (req.method === 'POST' && url.pathname === '/generate') {
      let body = '';
      
      req.on('data', chunk => {
        body += chunk;
        if (body.length > 10000) { // Limite sécurité
          res.writeHead(413);
          res.end(JSON.stringify({ ok: false, error: 'Payload trop volumineux' }));
          return;
        }
      });
      
      req.on('end', async () => {
        try {
          const { text } = JSON.parse(body || '{}');
          
          if (!text || typeof text !== 'string') {
            res.writeHead(400);
            return res.end(JSON.stringify({ 
              ok: false, 
              error: 'Paramètre "text" requis (string)',
              received: typeof text
            }));
          }
          
          const result = await generateAndUpload(text);
          
          res.writeHead(200);
          res.end(JSON.stringify({ 
            ok: true, 
            ...result,
            timestamp: new Date().toISOString()
          }));
          
        } catch (error) {
          console.error('❌ Erreur génération:', error.message);
          const statusCode = error.message.includes('trop long') ? 400 : 500;
          
          res.writeHead(statusCode);
          res.end(JSON.stringify({ 
            ok: false, 
            error: error.message,
            timestamp: new Date().toISOString()
          }));
        }
      });
      
      return;
    }

    // Métriques pour monitoring
    if (req.method === 'GET' && url.pathname === '/metrics') {
      const metrics = {
        uptime: Math.round(process.uptime()),
        memory: process.memoryUsage(),
        cpu: process.cpuUsage(),
        platform: process.platform,
        nodeVersion: process.version,
        pid: process.pid
      };
      
      res.writeHead(200);
      return res.end(JSON.stringify(metrics, null, 2));
    }

    // 404
    res.writeHead(404);
    res.end(JSON.stringify({ 
      ok: false, 
      error: 'Endpoint non trouvé',
      availableEndpoints: ['GET /', 'POST /generate', 'GET /health', 'GET /ready', 'GET /metrics']
    }));

  } catch (error) {
    console.error('❌ Erreur serveur:', error);
    
    if (!res.headersSent) {
      res.writeHead(500);
      res.end(JSON.stringify({ 
        ok: false, 
        error: 'Erreur interne du serveur'
      }));
    }
  }
});

// Gestion erreurs serveur
server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`❌ Port ${PORT} déjà utilisé`);
    process.exit(1);
  }
  console.error('❌ Erreur serveur:', error);
});

// Démarrage
server.listen(PORT, HOST, () => {
  console.log(`\n✅ === SERVICE API DÉMARRÉ ===`);
  console.log(`🌐 Adresse: http://${HOST}:${PORT}`);
  console.log(`🏥 Health: http://${HOST}:${PORT}/health`);
  console.log(`📡 API: POST http://${HOST}:${PORT}/generate`);
  console.log(`🆔 PID: ${process.pid}`);
  console.log(`===============================\n`);
});

// Monitoring mémoire en production
if (process.env.NODE_ENV === 'production') {
  setInterval(() => {
    const mem = process.memoryUsage();
    const used = Math.round(mem.heapUsed / 1024 / 1024);
    const total = Math.round(mem.heapTotal / 1024 / 1024);
    if (used > 100) { // Log si > 100MB
      console.log(`💾 Mémoire: ${used}MB/${total}MB`);
    }
  }, 300000); // 5 minutes
}

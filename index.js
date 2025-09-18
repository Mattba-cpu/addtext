const fs = require('fs');
const http = require('http');
const { URL } = require('url');

// Chargement conditionnel de Sharp avec gestion d'erreur
let sharp;
try {
  sharp = require('sharp');
  sharp.cache(false);
  sharp.concurrency(1);
  console.log('✅ Sharp chargé avec succès');
} catch (error) {
  console.error('❌ Erreur Sharp:', error.message);
  console.log('⚠️ Mode dégradé sans traitement d\'image');
}

// Chargement conditionnel des autres dépendances
let TextToSVG, supabase;
try {
  const TextToSVGLib = require('text-to-svg');
  const { createClient } = require('@supabase/supabase-js');
  require('dotenv').config();

  // Configuration
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_KEY;

  if (supabaseUrl && supabaseKey) {
    supabase = createClient(supabaseUrl, supabaseKey);
    console.log('✅ Client Supabase initialisé');
  }

  // Police
  if (fs.existsSync('./Montserrat-Bold.ttf')) {
    TextToSVG = TextToSVGLib.loadSync('./Montserrat-Bold.ttf');
    console.log('✅ Police Montserrat-Bold.ttf chargée');
  } else {
    TextToSVG = TextToSVGLib.loadSync();
    console.log('✅ Police système chargée');
  }
} catch (error) {
  console.error('❌ Erreur initialisation:', error.message);
}

const inputImagePath = 'template.png';
const MAX_TEXT_LENGTH = 300;
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

console.log(`🚀 Démarrage du service API...`);
console.log(`📋 Configuration: PORT=${PORT}, HOST=${HOST}`);

// Vérification template
const templateExists = fs.existsSync(inputImagePath);
if (templateExists) {
  console.log('✅ Template vérifié');
} else {
  console.warn('⚠️ Template manquant, certaines fonctions seront limitées');
}

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
  if (!TextToSVG) return [text];
  
  const words = text.split(' ');
  const lines = [];
  let currentLine = '';

  for (const word of words) {
    const testLine = (currentLine + word + ' ').trim();
    let width;
    
    try {
      const metrics = TextToSVG.getMetrics(testLine, { fontSize });
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
  if (!TextToSVG) throw new Error('TextToSVG non disponible');

  // Espacement interlignes "propre" (évite la sensation de décentrage vertical)
  const lineHeight = Math.round(fontSize * 1.3);

  // Hauteur totale du bloc de texte (toutes les lignes)
  const totalTextHeight = lines.length * lineHeight;

  // Point de départ parfaitement centré dans la box (sans décalage arbitraire)
  const startY = Math.round(
    box.y + (box.height - totalTextHeight) / 2 + lineHeight / 2
  );

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
        fill: #DF864E;
        font-weight: bold;
      }
    </style>
    ${svgLines}
  </svg>`;
}

// Fonction principale avec gestion d'erreurs robuste
async function generateAndUpload(texte) {
  const startTime = Date.now();
  console.log(`🔄 Génération: "${texte?.slice(0, 50)}..." (${texte?.length}/${MAX_TEXT_LENGTH} chars)`);
  
  // Vérifications préalables
  if (!texte || !texte.trim()) {
    throw new Error('Aucun texte fourni');
  }
  if (texte.length > MAX_TEXT_LENGTH) {
    throw new Error(`Texte trop long: ${texte.length}/${MAX_TEXT_LENGTH} caractères`);
  }
  if (!sharp) {
    throw new Error('Sharp non disponible - traitement d\'image impossible');
  }
  if (!supabase) {
    throw new Error('Supabase non configuré');
  }
  if (!templateExists) {
    throw new Error('Template d\'image manquant');
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

// Emplacement du texte
function getAdaptiveBox(width, height, textLength) {
  if (textLength < 30) {
    return {
      x: Math.round(width * 0.18),
      y: Math.round(height * 0.45),
      width: Math.round(width * 0.63),
      height: Math.round(height * 0.15),
    };
  } else if (textLength < 100) {
    return {
      x: Math.round(width * 0.18),
      y: Math.round(height * 0.40),
      width: Math.round(width * 0.63),
      height: Math.round(height * 0.25),
    };
  } else {
    return {
      x: Math.round(width * 0.15),
      y: Math.round(height * 0.30),
      width: Math.round(width * 0.70),
      height: Math.round(height * 0.40),
    };
  }
}

const box = getAdaptiveBox(width, height, texte.length);
  
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

// Serveur HTTP
const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Content-Type', 'application/json');
  
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    
    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      return res.end();
    }

    // Health check
    if (req.method === 'GET' && (url.pathname === '/health' || url.pathname === '/healthz')) {
      const health = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: Math.round(process.uptime()),
        components: {
          sharp: !!sharp,
          supabase: !!supabase,
          textToSVG: !!TextToSVG,
          template: templateExists
        },
        memory: {
          used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
          total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024)
        },
        pid: process.pid
      };
      
      res.writeHead(200);
      return res.end(JSON.stringify(health, null, 2));
    }

    // Documentation API
    if (req.method === 'GET' && url.pathname === '/') {
      const apiDoc = {
        service: 'Text to Image Generator API',
        version: '1.0.0',
        status: {
          sharp: !!sharp,
          supabase: !!supabase,
          template: templateExists
        },
        endpoints: {
          'POST /generate': {
            description: 'Génère une image avec du texte',
            body: { text: 'string (requis, max 300 caractères)' },
            available: !!(sharp && supabase && templateExists)
          },
          'GET /health': 'Health check pour monitoring'
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

    // API génération
    if (req.method === 'POST' && url.pathname === '/generate') {
      let body = '';
      
      req.on('data', chunk => {
        body += chunk;
        if (body.length > 10000) {
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
              error: 'Paramètre "text" requis (string)'
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

    // 404
    res.writeHead(404);
    res.end(JSON.stringify({ 
      ok: false, 
      error: 'Endpoint non trouvé',
      availableEndpoints: ['GET /', 'POST /generate', 'GET /health']
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

// Démarrage
server.listen(PORT, HOST, () => {
  console.log(`\n✅ === SERVICE API DÉMARRÉ ===`);
  console.log(`🌐 Adresse: http://${HOST}:${PORT}`);
  console.log(`🏥 Health: http://${HOST}:${PORT}/health`);
  console.log(`📡 API: POST http://${HOST}:${PORT}/generate`);
  console.log(`🆔 PID: ${process.pid}`);
  console.log(`===============================\n`);
});

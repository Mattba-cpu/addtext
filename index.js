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

// Supabase setup avec vérification
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Variables SUPABASE_URL et SUPABASE_KEY requises');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Police
let textToSVG;
try {
  textToSVG = TextToSVG.loadSync('./Montserrat-Bold.ttf');
  console.log('✅ Police Montserrat chargée');
} catch (e) {
  console.warn('⚠️ Police système utilisée (Montserrat introuvable)');
  textToSVG = TextToSVG.loadSync();
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
  const words = text.split(' ');
  const lines = [];
  let currentLine = '';

  for (const word of words) {
    const testLine = (currentLine + word + ' ').trim();
    const { width } = textToSVG.getMetrics(testLine, { fontSize });
    
    if (width > maxWidth && currentLine !== '') {
      lines.push(currentLine.trim());
      currentLine = word + ' ';
    } else {
      currentLine = testLine + ' ';
    }
  }
  lines.push(currentLine.trim());
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
      }
    </style>
    ${svgLines}
  </svg>`;
}

// Fonction principale
async function generateAndUpload(texte) {
  console.log(`🔄 Début génération pour: "${texte?.slice(0, 30)}..."`);
  
  if (!texte || !texte.trim()) {
    throw new Error('Aucun texte fourni.');
  }
  if (texte.length > MAX_TEXT_LENGTH) {
    throw new Error(`Texte trop long (max ${MAX_TEXT_LENGTH} caractères).`);
  }
  
  console.log(`📁 Vérification fichier: ${inputImagePath}`);
  if (!fs.existsSync(inputImagePath)) {
    throw new Error(`Template introuvable : ${inputImagePath}`);
  }

  // Traitement de l'image avec gestion d'erreur
  console.log(`🖼️ Chargement image...`);
  let baseImage;
  let width, height;
  
  try {
    baseImage = sharp(inputImagePath);
    const metadata = await baseImage.metadata();
    width = metadata.width;
    height = metadata.height;
    console.log(`✅ Image chargée: ${width}x${height}`);
  } catch (error) {
    console.error(`❌ Erreur Sharp:`, error);
    throw new Error(`Erreur traitement image: ${error.message}`);
  }

  // Zone de texte
  const box = {
    x: width * 0.18,
    y: height * 0.56,
    width: width * 0.63,
    height: height * 0.23,
  };

  const fontSize = Math.round(box.height * 0.18);
  console.log(`📝 Génération texte, fontSize: ${fontSize}`);
  const lines = wrapText(texte, box.width * 0.9, fontSize);

  // Création du SVG
  console.log(`🎨 Création SVG...`);
  const svgBuffer = Buffer.from(
    generateSVG({ width, height, box, lines, fontSize }),
    'utf-8'
  );

  // Composition de l'image finale
  console.log(`🔧 Composition image...`);
  let finalBuffer;
  try {
    finalBuffer = await baseImage
      .composite([{ input: svgBuffer, top: 0, left: 0 }])
      .png()
      .toBuffer();
    console.log(`✅ Image composée, taille: ${finalBuffer.length} bytes`);
  } catch (error) {
    console.error(`❌ Erreur composition:`, error);
    throw new Error(`Erreur composition: ${error.message}`);
  }

  // Upload vers Supabase
  const timestamp = Date.now();
  const safeText = texte.slice(0, 30).replace(/[^a-z0-9]/gi, '_').toLowerCase();
  const fileName = `citation_${safeText}_${timestamp}.png`;

  console.log(`📤 Upload Supabase: ${fileName}`);
  
  let uploadResult;
  try {
    uploadResult = await supabase.storage
      .from('citation')
      .upload(fileName, finalBuffer, {
        contentType: 'image/png',
        cacheControl: '3600'
      });
      
    if (uploadResult.error) {
      console.error('❌ Erreur upload Supabase:', uploadResult.error);
      throw new Error(`Upload failed: ${uploadResult.error.message}`);
    }
    console.log(`✅ Upload réussi`);
  } catch (error) {
    console.error(`❌ Erreur Supabase:`, error);
    throw new Error(`Supabase error: ${error.message}`);
  }

  // URL publique
  const { data: { publicUrl } } = supabase.storage
    .from('citation')
    .getPublicUrl(fileName);

  return { fileName, publicUrl };
}

// Serveur HTTP pour Coolify
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  
  try {
    // Health check pour Coolify
    if (req.method === 'GET' && url.pathname === '/health') {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      return res.end('OK');
    }

    // Page d'accueil
    if (req.method === 'GET' && url.pathname === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Text to Image Generator</title>
          <meta charset="utf-8">
          <style>
            body { font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; }
            .form-group { margin: 20px 0; }
            textarea { width: 100%; height: 100px; padding: 10px; }
            button { background: #007bff; color: white; padding: 10px 20px; border: none; border-radius: 5px; cursor: pointer; }
            button:hover { background: #0056b3; }
            .result { margin-top: 20px; padding: 15px; background: #f8f9fa; border-radius: 5px; }
            .error { background: #f8d7da; color: #721c24; }
            .success { background: #d4edda; color: #155724; }
          </style>
        </head>
        <body>
          <h1>🖼️ Générateur d'Image avec Texte</h1>
          <form id="textForm">
            <div class="form-group">
              <label for="text">Votre texte (max ${MAX_TEXT_LENGTH} caractères):</label>
              <textarea id="text" name="text" placeholder="Entrez votre texte ici..." maxlength="${MAX_TEXT_LENGTH}"></textarea>
            </div>
            <button type="submit">Générer l'image</button>
          </form>
          <div id="result"></div>

          <script>
            document.getElementById('textForm').addEventListener('submit', async (e) => {
              e.preventDefault();
              const text = document.getElementById('text').value;
              const resultDiv = document.getElementById('result');
              
              if (!text.trim()) {
                resultDiv.innerHTML = '<div class="result error">Veuillez entrer un texte.</div>';
                return;
              }

              resultDiv.innerHTML = '<div class="result">⏳ Génération en cours...</div>';

              try {
                const response = await fetch('/generate', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ text })
                });

                const data = await response.json();

                if (data.ok) {
                  resultDiv.innerHTML = \`
                    <div class="result success">
                      <h3>✅ Image générée avec succès!</h3>
                      <p><strong>Nom:</strong> \${data.fileName}</p>
                      <p><a href="\${data.publicUrl}" target="_blank">🔗 Voir l'image</a></p>
                      <img src="\${data.publicUrl}" alt="Image générée" style="max-width: 100%; margin-top: 10px;">
                    </div>
                  \`;
                } else {
                  resultDiv.innerHTML = \`<div class="result error">❌ Erreur: \${data.error}</div>\`;
                }
              } catch (error) {
                resultDiv.innerHTML = \`<div class="result error">❌ Erreur réseau: \${error.message}</div>\`;
              }
            });
          </script>
        </body>
        </html>
      `);
    }

    // API endpoint pour générer l'image
    if (req.method === 'POST' && url.pathname === '/generate') {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', async () => {
        try {
          const { text } = JSON.parse(body || '{}');
          console.log(`🔄 Génération pour: "${text?.slice(0, 50)}..."`);
          
          const result = await generateAndUpload(text);
          console.log(`✅ Succès: ${result.fileName}`);
          
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true, ...result }));
        } catch (error) {
          console.error('❌ Erreur:', error.message);
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: error.message }));
        }
      });
      return;
    }

    // 404
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: 'Not found' }));

  } catch (error) {
    console.error('❌ Erreur serveur:', error);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: 'Internal Server Error' }));
  }
});

// Démarrage du serveur
server.listen(PORT, () => {
  console.log(`✅ Serveur démarré sur le port ${PORT}`);
  console.log(`🌐 Health check: http://localhost:${PORT}/health`);
});

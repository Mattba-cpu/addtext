/*
 * addTextToImageSharp.js
 *
 * Version réécrite pour utiliser la librairie "sharp" au lieu de "canvas".
 * Elle conserve toutes les fonctionnalités :
 *   • prise d'un texte en argument de la CLI
 *   • insertion du texte dans un gabarit d'image (centré dans une boîte)
 *   • upload du résultat dans le bucket "citation" de Supabase Storage
 *
 * Dépendances :
 *   npm install sharp text-to-svg @supabase/supabase-js dotenv
 *   # (optionnel) assure‑toi d'avoir la police Montserrat dans le même dossier
 *
 * Utilisation :
 *   node addTextToImageSharp.js "Ton texte ici"
 */

const fs = require('fs');
const sharp = require('sharp');
const TextToSVG = require('text-to-svg');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

console.log('🔍 SUPABASE_URL =', process.env.SUPABASE_URL);
console.log('🔍 SUPABASE_KEY =', process.env.SUPABASE_KEY ? 'clé détectée' : '❌ clé absente');

// === 1. RÉCUPÉRER LE TEXTE EN ARGUMENT DE LIGNE DE COMMANDE ===
const args = process.argv.slice(2);
if (args.length === 0) {
  console.error('❌ Tu dois fournir un texte à afficher. Exemple :');
  console.error('   node addTextToImageSharp.js "Ton texte ici"');
  process.exit(1);
}
const texte = args.join(' ');

// === 2. CONFIGURATION DE BASE ===
const inputImagePath = 'Pink Simple Inspirational Instagram Post.png';

// === 3. CHARGER LA POLICE POUR LES MESURES ===
let textToSVG;
try {
  textToSVG = TextToSVG.loadSync('./Montserrat-Bold.ttf');
  console.log('✅ Police Montserrat chargée');
} catch (e) {
  console.warn('⚠️ Police Montserrat non trouvée, on utilisera la police système');
  textToSVG = TextToSVG.loadSync(); // chargement par défaut
}

// === 4. INITIALISATION SUPABASE ===
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// === 5. FONCTIONS UTILITAIRES ===
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
  const startY =
    box.y + box.height / 2 + verticalShift - ((lines.length - 1) * lineHeight) / 2;

  const svgLines = lines
    .map((line, i) => {
      const y = startY + i * lineHeight;
      return `<text x="${box.x + box.width / 2}" y="${y}" text-anchor="middle" dominant-baseline="middle">${escapeHtml(
        line
      )}</text>`;
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

// === 6. FONCTION PRINCIPALE ===
(async () => {
  try {
    const baseImage = sharp(inputImagePath);
    const metadata = await baseImage.metadata();
    const { width, height } = metadata;

    const box = {
      x: width * 0.18,
      y: height * 0.56,
      width: width * 0.63,
      height: height * 0.23,
    };

    const fontSize = Math.round(box.height * 0.18);

    const lines = wrapText(texte, box.width * 0.9, fontSize);
    const svgBuffer = Buffer.from(
      generateSVG({ width, height, box, lines, fontSize }),
      'utf-8'
    );

    const finalBuffer = await baseImage
      .composite([{ input: svgBuffer, top: 0, left: 0 }])
      .png()
      .toBuffer();

    // === 7. NOM DU FICHIER ===
    const safeText = texte
      .slice(0, 30)
      .replace(/[^a-z0-9]/gi, '_')
      .toLowerCase();
    const fileName = `output_${safeText}.png`;

    // === 8. UPLOAD VERS SUPABASE ===
    const { data, error } = await supabase.storage
      .from('citation')
      .upload(fileName, finalBuffer, {
        contentType: 'image/png',
        upsert: true,
      });

    if (error) {
      console.error('❌ Erreur upload Supabase :', error.message);
    } else {
      const publicUrl = `${supabaseUrl}/storage/v1/object/public/citation/${fileName}`;
      console.log(`✅ Image uploadée sur Supabase : ${fileName}`);
      console.log(`🔗 URL publique : ${publicUrl}`);
    }
  } catch (err) {
    console.error('❌ Erreur générale :', err.message);
  }
})();

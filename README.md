# 🖼️ Text to Image API Service

Service API pour générer des images avec du texte personnalisé. Compatible avec **n8n** et **Coolify**.

## 🚀 Déploiement Coolify

### 1. Créer le service sur Coolify
- Importer ce repository GitHub
- Type: `Node.js`
- Port: `3000`

### 2. Variables d'environnement requises
```bash
SUPABASE_URL=your_supabase_project_url
SUPABASE_KEY=your_supabase_anon_key
PORT=3000
NODE_ENV=production
```

### 3. Fichiers requis
- `template.png` - Image de base (obligatoire)
- `Montserrat-Bold.ttf` - Police (optionnel)

## 📡 API Endpoints

### POST /generate
Génère une image avec du texte.

**Request:**
```json
{
  "text": "Votre texte à incruster (max 300 caractères)"
}
```

**Response:**
```json
{
  "ok": true,
  "fileName": "citation_votre_texte_1640995200000.png",
  "publicUrl": "https://your-supabase.storage.co/image.png",
  "processingTime": 1250,
  "fileSize": 245,
  "textLength": 25,
  "timestamp": "2024-01-01T12:00:00.000Z"
}
```

### GET /health
Health check pour Coolify (essentiel).

### GET /ready  
Readiness check - vérifie que tous les composants sont opérationnels.

### GET /
Documentation API basique.

## 🔧 Configuration n8n

### HTTP Request Node
- **Method:** `POST`
- **URL:** `https://your-coolify-domain.com/generate`
- **Headers:** `Content-Type: application/json`
- **Body:** 
```json
{
  "text": "{{ $json.message }}"
}
```

### Exemple de workflow n8n
1. **Trigger** (webhook, schedule, etc.)
2. **HTTP Request** → votre API
3. **Set** → récupérer `publicUrl`
4. **Action** → utiliser l'image générée

## 🏗️ Structure du projet

```
text-to-image-api/
├── index.js              # Code principal
├── package.json          # Dépendances Node.js
├── Dockerfile           # Configuration Docker
├── template.png         # Image de base (à ajouter)
├── Montserrat-Bold.ttf  # Police (optionnel)
└── README.md           # Documentation
```

## ⚙️ Configuration Supabase

### 1. Créer un bucket
```sql
-- Dans Supabase SQL Editor
INSERT INTO storage.buckets (id, name, public) 
VALUES ('citation', 'citation', true);
```

### 2. Politique de sécurité
```sql
-- Autoriser les uploads
CREATE POLICY "Allow uploads" ON storage.objects 
FOR INSERT TO anon WITH CHECK (bucket_id = 'citation');

-- Autoriser la lecture publique
CREATE POLICY "Allow public access" ON storage.objects 
FOR SELECT TO anon USING (bucket_id = 'citation');
```

## 🔍 Monitoring

### Logs Coolify
Les logs incluent :
- ✅ Statut des composants au démarrage
- 🔄 Détails de chaque génération
- ❌ Erreurs avec contexte
- 💾 Utilisation mémoire (production)

### Endpoints de monitoring
- `GET /health` - État général
- `GET /metrics` - Métriques système détaillées

## 🐛 Troubleshooting

### Erreurs communes

**Template manquant:**
```
❌ Template introuvable: template.png
```
→ Ajouter le fichier `template.png` à la racine

**Variables Supabase manquantes:**
```
❌ Variables SUPABASE_URL et SUPABASE_KEY requises
```
→ Configurer les variables d'environnement dans Coolify

**Erreur Sharp:**
```
❌ Erreur traitement image
```
→ Le Dockerfile installe automatiquement les dépendances

### Vérification santé
```bash
curl https://your-domain.com/health
```

## 📝 Exemples d'utilisation

### cURL
```bash
curl -X POST https://your-domain.com/generate \
  -H "Content-Type: application/json" \
  -d '{"text": "Hello World!"}'
```

### JavaScript
```javascript
const response = await fetch('https://your-domain.com/generate', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ text: 'Hello World!' })
});

const result = await response.json();
console.log(result.publicUrl); // URL de l'image générée
```

## 🔒 Sécurité

- CORS activé pour tous les domaines
- Limitation de taille des payloads (10KB)
- Utilisateur non-root dans Docker
- Validation stricte des entrées
- Retry automatique avec backoff

## 📊 Performances

- Traitement moyen: ~1-2 secondes
- Taille image: ~200-500KB
- Limite texte: 300 caractères
- Retry automatique: 3 tentatives

---

🎯 **Prêt pour la production avec Coolify + n8n !**

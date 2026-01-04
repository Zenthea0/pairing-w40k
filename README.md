# Moteur de Pairing W40K - PWA

Application de pairing pour tournois Warhammer 40K en équipe.

## Fichiers

- `index.html` - Page principale
- `app.jsx` - Code React de l'application
- `sw.js` - Service Worker pour le fonctionnement offline
- `manifest.json` - Manifest PWA pour l'installation
- `icon-192.png` - Icône 192x192
- `icon-512.png` - Icône 512x512

## Déploiement sur GitHub Pages

### Étape 1 : Créer un repository GitHub

1. Va sur https://github.com et connecte-toi
2. Clique sur le bouton **"+"** en haut à droite → **"New repository"**
3. Nom du repository : `pairing-w40k` (ou ce que tu veux)
4. Laisse "Public" coché
5. **NE COCHE PAS** "Add a README file"
6. Clique sur **"Create repository"**

### Étape 2 : Télécharger les fichiers sur GitHub

**Option A : Via l'interface web (plus simple)**

1. Sur la page de ton nouveau repository, clique sur **"uploading an existing file"**
2. Glisse-dépose TOUS les fichiers du dossier :
   - `index.html`
   - `app.jsx`
   - `sw.js`
   - `manifest.json`
   - `icon-192.png`
   - `icon-512.png`
3. En bas, écris un message de commit : "Initial commit"
4. Clique sur **"Commit changes"**

**Option B : Via Git (si tu l'as installé)**

```bash
cd /chemin/vers/pairing-app-pwa
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/TON_USERNAME/pairing-w40k.git
git push -u origin main
```

### Étape 3 : Activer GitHub Pages

1. Dans ton repository, va dans **Settings** (onglet en haut)
2. Dans le menu à gauche, clique sur **Pages**
3. Sous "Source", sélectionne **"Deploy from a branch"**
4. Sous "Branch", sélectionne **"main"** et **"/ (root)"**
5. Clique sur **Save**
6. Attends 1-2 minutes

### Étape 4 : Accéder à l'application

Ton application sera accessible à :
```
https://TON_USERNAME.github.io/pairing-w40k/
```

## Installation sur tablette Android

1. Ouvre Chrome sur ta tablette
2. Va à l'adresse de ton application (https://TON_USERNAME.github.io/pairing-w40k/)
3. Attends que la page charge complètement
4. Appuie sur les **3 points** en haut à droite de Chrome
5. Sélectionne **"Ajouter à l'écran d'accueil"** ou **"Installer l'application"**
6. Confirme l'installation

L'application apparaîtra sur ton écran d'accueil comme une vraie application !

## Fonctionnalités

- ✅ Fonctionne hors-ligne une fois chargée
- ✅ Données sauvegardées automatiquement (IndexedDB)
- ✅ Installation comme application native
- ✅ Interface tactile optimisée

## Résolution de problèmes

### Les données ne se sauvegardent pas
- Vérifie que tu n'es pas en navigation privée
- Assure-toi d'avoir assez d'espace de stockage

### L'application ne se charge pas hors-ligne
- Charge d'abord la page avec une connexion internet
- Attends que tout soit chargé avant de passer hors-ligne

### L'installation ne fonctionne pas
- Utilise Chrome (pas Firefox ou Safari)
- Assure-toi que le site utilise HTTPS (GitHub Pages le fait automatiquement)

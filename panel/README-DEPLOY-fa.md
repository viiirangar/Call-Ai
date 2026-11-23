# Guide complet — tout dans un seul dépôt GitHub (panneau + appli Android)

Ce paquet contient **tout** : le panneau serveur (Next.js) + l'appli Android répondeur d'appels + l'action de build automatique de l'APK.

```
Votre dépôt GitHub
├── src / public / prisma / package.json ...   ← panneau serveur (Vercel l'exécute depuis la racine)
├── android-call-app/                           ← projet de l'appli Android (Actions construit depuis ce dossier)
└── .github/workflows/build-apk.yml             ← action de build automatique de l'APK
```

## Étape 1 — Un dépôt neuf sur GitHub

Supprimez l'ancien dépôt (Call-AI) qui ne contenait que l'appli, pour ne pas mélanger deux versions :
1. Dans le dépôt → **Settings** → en bas de page, section **Danger Zone** → **Delete this repository** → tapez son nom et confirmez
2. Créez un nouveau dépôt : nom `french-assistant`, cochez **Private** → Create

## Étape 2 — Déposer ce paquet

1. Décompressez le ZIP (Extract)
2. Dans le dépôt neuf : **Add file → Upload files** → glissez tous les fichiers et dossiers du paquet
3. Le dossier `.github` ne peut pas être téléversé par glisser-déposer (message « hidden ») — c'est normal
4. **Add file → Create new file** → tapez exactement le nom du fichier : `.github/workflows/build-apk.yml`
5. Collez ce contenu dedans et faites un Commit :

```yaml
name: Build APK

on: [push, workflow_dispatch]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Set up JDK 17
        uses: actions/setup-java@v4
        with:
          distribution: temurin
          java-version: '17'

      - name: Set up Gradle
        uses: gradle/actions/setup-gradle@v4

      - name: Build debug APK
        run: |
          chmod +x gradlew
          ./gradlew assembleDebug --no-daemon
        working-directory: android-call-app

      - name: Upload APK
        uses: actions/upload-artifact@v4
        with:
          name: callbot-apk
          path: android-call-app/app/build/outputs/apk/debug/app-debug.apk
```

C'est tout — à partir de maintenant : l'onglet Actions = construction de l'APK, et Vercel = le panneau. Chaque push met les deux à jour.

## Étape 3 — Récupérer l'APK (comme avant)

Onglet **Actions** → tâche « Build APK » → 3 à 5 minutes → **Artifacts** → `callbot-apk` → dedans `app-debug.apk`

## Étape 4 — Base de données gratuite Neon

1. [neon.tech](https://neon.tech) → inscription avec GitHub → **New Project** (valeurs par défaut)
2. Copiez la chaîne **Connection string** (ressemblant à `postgresql://user:pass@ep-xxx.neon.tech/neondb?sslmode=require`)

## Étape 5 — Vercel (panneau 24h/24)

1. [vercel.com](https://vercel.com) → **Continue with GitHub**
2. **Add New → Project** → **Import** du dépôt
3. **Avant le Deploy**, créez deux variables dans Environment Variables :
   - `DATABASE_URL` = la chaîne Neon de l'étape 4
   - `WORKER_KEY` = une phrase de votre choix comme `my-secret-123`
4. **Deploy** — environ 2 à 3 minutes ; les tables de la base sont créées automatiquement
5. L'adresse de votre nouveau panneau devient par ex. `https://french-assistant.vercel.app`

## Étape 6 — Configurer le nouveau panneau

La base de données cloud démarre de zéro, donc encore une fois :
1. Onglet **« Connexion & réglages »** → token du bot → « Connecter et démarrer le bot » (le webhook est configuré automatiquement — message « actif 24h/24 »)
2. Service IA (Gemini/Groq) et clé → enregistrer
3. Remplir de nouveau l'onglet **« Personnalité & connaissances »**
4. Onglet **« Appels téléphoniques »** → « Générer un code » → « Enregistrer les réglages d'appel » → copiez le code

## Étape 7 — Appli Android

1. Dans l'appli du téléphone : URL du serveur = adresse Vercel, code de sécurité = nouveau code du panneau → enregistrer
2. Autorisations + sortie de l'optimisation de batterie → **Tester la connexion au serveur**
3. Appelez depuis un autre téléphone

## Remarque sur la voix

Sur serveur cloud, l'assistante parle pendant l'appel avec **la voix du téléphone lui-même** (TTS français).
Les modes « Ma propre voix (clone) » et « Voix Microsoft » ne fonctionnent que dans l'aperçu du panneau de cet environnement.

## Mises à jour ultérieures

À chaque nouvelle version livrée : remplacez uniquement les fichiers modifiés dans le dépôt (même nom de fichier = remplacement).
Chaque push : nouvel APK dans Actions + nouveau déploiement sur Vercel — les deux automatiquement.

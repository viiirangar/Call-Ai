# Mon Assistant Français — bot répondant Telegram + répondeur d'appels automatique

Deux choses avec un seul cerveau :
1) **Un bot Telegram** qui répond aux messages à votre place et en français.
2) **Une appli Android répondeur d'appels** qui répond aux appels entrants de votre téléphone et parle en français.
Le panneau de contrôle (cette web-app) est le cerveau des deux : identité, base de connaissances, tons et heures de travail — et il s'installe sur l'écran d'accueil du téléphone.

---

## Vue d'ensemble du fonctionnement

```
Interlocuteur ──message──▶ Votre bot Telegram ──▶ Moteur IA (clé gratuite Gemini / Groq)
                                        │
                                        ▼
                        Réponse en français avec le ton adapté (client / ami / collègue)
                                        │
                                        ▼
                        Interlocuteur + enregistrement dans le panneau pour consultation et réglage
```

- **Bot Telegram** : un identifiant séparé servant d'assistant. Quiconque écrit au bot reçoit une réponse en français.
  Cette méthode est totalement légale et votre compte personnel n'est jamais en risque de bannissement.
- **Panneau de contrôle (cette web-app)** : pour programmer l'esprit du bot — votre identité, votre activité, les questions fréquentes, les tons, les heures de travail.
- **Moteur d'intelligence artificielle** : fonctionne avec une clé gratuite (Gemini ou Groq) ; tant que vous n'avez pas fourni de clé, le « mode démo » du panneau ne sert qu'à tester les réponses.

## Répondeur automatique d'appels (appli Android)

Dans l'onglet **« Appels téléphoniques »** du panneau :

- Vous générez et copiez l'**URL du serveur** et le **code de sécurité d'appel**
- Vous réglez les phrases fixes françaises d'appel (accueil / au revoir)
- Interrupteur d'activation de la réponse aux appels
- **Simulateur d'appel** : testez tout le flux de conversation sans téléphone

Construction de l'appli Android :

1. Mettez le fichier `android-call-app.zip` (fourni dans ce panneau/cette conversation) sur GitHub
2. L'action prête du projet (`Build APK`) construit l'APK automatiquement — gratuit et sans rien installer
3. Installez l'APK sur le téléphone, entrez les deux valeurs de l'étape 1, accordez les autorisations téléphone et micro, et sortez de l'optimisation de batterie
4. Appelez depuis un autre téléphone — l'appli répond, parle en français et la conversation est enregistrée dans l'onglet « Conversations »

Guide complet et dépannage dans le projet lui-même : `android-call-app/README-fa.md`

Limitations importantes : Android 8 ou supérieur uniquement (impossible sur iPhone à cause des règles d'Apple) ; chaque réponse a 2 à 4 secondes de délai ; le téléphone doit être allumé et en ligne ; la voix par défaut est la voix française naturelle d'Android (le clonage de votre voix est l'étape suivante).

## Structure des fichiers importants

| Chemin | Rôle |
| --- | --- |
| `src/lib/brain.ts` | Construction du prompt (cerveau du bot) + réponse toujours dans la langue cible |
| `src/lib/processor.ts` | Logique de traitement de chaque message Telegram (enregistrement, commandes, heures de travail, réponse) |
| `src/lib/telegram.ts` | Fonctions Telegram Bot API |
| `src/app/api/telegram/webhook/route.ts` | Webhook Telegram (pour déploiement sur Vercel, etc.) |
| `src/app/api/telegram/process/route.ts` | Traitement des mises à jour brutes — le service Polling appelle cette route |
| `src/app/api/telegram/connect/route.ts` | Validation du token + démarrage du Polling |
| `src/app/api/test-chat/route.ts` | Simulateur de conversation du panneau |
| `src/app/api/call/turn/route.ts` | Point d'entrée de l'appli Android répondeur (authentification par code de sécurité + cerveau partagé) |
| `src/components/panel/calls-tab.tsx` | Onglet « Appels téléphoniques » du panneau : réglages, code de sécurité, simulateur |
| `download/android-call-app.zip` | Projet complet de l'appli Android (Kotlin + action de build APK + guide) |
| `mini-services/bot-worker/` | Service Polling Telegram (port 3010) + superviseur du serveur principal |
| `prisma/schema.prisma` | Base de données : réglages, conversations, messages |

---

## Mise en route en 5 étapes (10 minutes)

### Étape 1 — Créer le bot sur Telegram

1. Dans Telegram, cherchez : **@BotFather**
2. Envoyez `Start` puis la commande `/newbot`
3. Donnez un **nom d'affichage** (ex. `Arash Paris`) — vos interlocuteurs verront ce nom
4. Donnez un **username** unique qui doit se terminer par `bot` (ex. `arash_paris_bot`)
5. BotFather donne un token comme `123456789:AAHxxxx...` — copiez-le

### Étape 2 — Clé IA gratuite

**Option recommandée — Google Gemini (gratuit, sans carte bancaire) :**
1. Allez sur `https://aistudio.google.com/apikey` et connectez-vous avec un compte Google
2. `Create API key` — copiez la clé

**Deuxième option — Groq (gratuit et très rapide) :**
1. Allez sur `https://console.groq.com/apikey` et inscrivez-vous
2. Créez la clé (préfixe `gsk_`)

### Étape 3 — Panneau : connexion

1. Ouvrez l'onglet **« Connexion & réglages »**
2. Collez le token du bot dans le premier champ → bouton **« Connecter et démarrer le bot »**
3. Mettez le fournisseur sur `Google Gemini` ou `Groq`, entrez la clé → **« Enregistrer les réglages »**
4. Onglet **« Test en direct »** : envoyez quelques messages (même en persan !) — la réponse doit être en français

### Étape 4 — Panneau : identité et connaissances

1. Onglet **« Personnalité & connaissances »** :
   - Écrivez votre nom, métier, activité, services, prix, heures de travail et tout ce que les interlocuteurs demandent
   - Entrez les questions fréquentes + leurs réponses précises **en français** dans la section FAQ
   - Réglez séparément le ton pour client / ami / collègue
2. Identifiant propriétaire : envoyez `/start` au bot depuis votre compte → entrez l'identifiant numérique dans « Connexion & réglages »
   - Ensuite : `/pause` pour désactiver, `/resume` pour réactiver, `/status` pour l'état

### Étape 5 — Installer le panneau sur le téléphone (PWA)

- **Android (Chrome) :** menu trois points → `Add to Home screen`
- **iPhone (Safari) :** bouton partager → `Add to Home Screen`

---

## Exécution permanente 24h/24

Tant que cet environnement d'aperçu est ouvert, le bot est actif ici même. Pour un fonctionnement permanent, deux voies :

### Première voie — votre ordinateur / portable (la plus simple)

```bash
# Prérequis : installer Bun depuis bun.sh ou Node.js version 20+
bun install
bun run db:push          # création de la base de données
bun run dev              # panneau sur le port 3000
cd mini-services/bot-worker && bun run dev   # service du bot sur le port 3010
```
Panneau : `http://localhost:3000` — tant que le système est allumé, le bot répond.

### Deuxième voie — déploiement gratuit sur Vercel (sans laisser le système allumé)

1. Mettez le projet dans un dépôt GitHub
2. Sur [vercel.com](https://vercel.com) (plan Hobby gratuit), importez le projet
3. Base de données : créez un **Turso** ou **Neon** gratuit (le plus simple : créer une base gratuite depuis le marketplace de Vercel et renseigner `DATABASE_URL`)
4. Variables d'environnement sur Vercel :
   - `DATABASE_URL` = chaîne de connexion de la base
   - `WORKER_KEY` = une phrase aléatoire (ex. `my-secret-123`)
5. Après le déploiement, l'adresse du site devient par ex. `https://your-app.vercel.app`
6. Appelez cette adresse dans le navigateur pour configurer le webhook :

```
https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://your-app.vercel.app/api/telegram/webhook&secret_token=<WORKER_KEY>
```

(en remplaçant `<TOKEN>` par le token du bot et `<WORKER_KEY>` par la valeur de la variable d'environnement)

C'est fait — le bot répond 24h/24 sur le serveur gratuit Vercel et le panneau, à la même adresse, s'installe sur le téléphone.

> Remarque : en mode Vercel, le service Polling (`bot-worker`) n'est pas nécessaire ; le webhook transmet lui-même les messages.

---

## Variables d'environnement

| Variable | Défaut | Description |
| --- | --- | --- |
| `DATABASE_URL` | `file:./db/custom.db` | Chemin de la base de données |
| `WORKER_KEY` | `worker-secret-2024` | Clé d'authentification du service Polling |
| `MAIN_APP_URL` | `http://localhost:3000` | Adresse de l'application principale pour le worker |

## Commandes du propriétaire sur Telegram

| Commande | Action |
| --- | --- |
| `/start` | Accueil + affichage de l'identifiant propriétaire |
| `/status` | État du bot et statistiques |
| `/pause` | Arrêt temporaire de la réponse automatique |
| `/resume` | Reprise de la réponse automatique |

## Sécurité et confidentialité

- Le token du bot et la clé IA sont stockés uniquement sur votre propre serveur et affichés masqués dans le panneau (`12345•••••`)
- La route de traitement interne (`/api/telegram/process`) n'accepte que localhost
- Le webhook est validé avec l'en-tête secret `X-Telegram-Bot-Api-Secret-Token`
- Les messages du propriétaire ne reçoivent pas de réponse automatique et sont enregistrés comme notes

## Questions fréquentes

**Si l'interlocuteur écrit en persan ou en anglais ?** La réponse arrive toujours dans la langue réglée (français par défaut).

**Si le bot ne connaît pas la réponse ?** Il n'invente rien ; il dit votre phrase « je ne sais pas » et la conversation est marquée
« nécessite votre attention » dans le panneau.

**Les messages de groupes ?** Ils sont ignorés — seuls les chats privés reçoivent une réponse.

**Le plan gratuit suffit-il ?** Largement pour un bot personnel ; changez de modèle/service si besoin.

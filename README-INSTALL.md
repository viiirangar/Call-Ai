# Guide d'installation sur serveur Hetzner — version complète avec votre propre voix

Ce paquet est préparé pour votre serveur :
- Serveur : Hetzner CX23 — Ubuntu 22.04 — IP `167.233.27.50` — sans nom de domaine
- Panneau sur le **port 4000** (comme demandé, pas 3000)
- Serveur vocal (OpenVoice) sur le port **3020**, interne uniquement (non accessible de l'extérieur — sécurisé)
- Résultat : la standardiste parle au téléphone **avec votre propre voix**

Interface du panneau : **français** par défaut, avec un commutateur **FR / NL** en haut (le choix est mémorisé).

Contenu du paquet :

| Dossier/fichier | Description |
|---|---|
| `panel/` | Panneau (Next.js) + cerveau des appels + robot Telegram |
| `voice/` | Serveur vocal : TTS Microsoft + timbre de votre voix (OpenVoice v2) |
| `systemd/` | Deux services pour un fonctionnement 24h/24, redémarrage automatique inclus |
| `install.sh` | Installation en une seule commande |

Remarque : le fichier du modèle `checkpoint.pth` (131 Mo) est volontairement absent du paquet car GitHub refuse les fichiers de plus de 100 Mo — le script d'installation le télécharge directement sur le serveur depuis la source officielle.

---

## Étape 1 — Envoi sur GitHub

1. Sur GitHub, créez un nouveau dépôt **Private** (par exemple `callbot-server`)
2. Téléversez le contenu du dossier `hetzner-deploy` (pas le dossier lui-même, mais **les fichiers qu'il contient**, avec Ctrl+A) à la racine du dépôt
3. Si vous voyez « this file is hidden », cela concerne un fichier commençant par un point — ils ne sont pas importants, ignorez

## Étape 2 — Ouvrir le port 4000 dans le firewall Hetzner

1. Dans le panneau Hetzner, ouvrez le serveur → onglet **Firewalls** → cliquez sur `firewall-1`
2. Ajoutez une nouvelle règle : Direction = **In** , Protocol = **TCP** , Port = **4000**
3. Enregistrez
   (N'ouvrez PAS le port 3020 — il est interne et ne doit pas être visible de l'extérieur)

## Étape 3 — Créer un token GitHub (pour cloner le dépôt sur le serveur)

Comme le dépôt est privé, le serveur a besoin d'un token :

1. GitHub → photo de profil → **Settings** → tout en bas → **Developer settings**
2. **Personal access tokens → Tokens (classic) → Generate new token (classic)**
3. Note : ce que vous voulez ; Expiration : 90 jours (ou No expiration) ; cochez **repo**
4. Copiez le token généré (il commence par `ghp_`) — il n'est affiché qu'une seule fois

## Étape 4 — Installation sur le serveur

Connectez-vous (depuis votre ordinateur) :

```
ssh root@167.233.27.50
```

Puis tapez ces commandes une par une — remplacez `TOKEN`, `USERNAME` et `REPO` par vos valeurs :

```
git clone https://TOKEN@github.com/USERNAME/REPO.git /opt/callbot-deploy
bash /opt/callbot-deploy/install.sh
```

L'installation dure environ 10 à 20 minutes (téléchargement de torch, du modèle, compilation du panneau). À la fin, le script affiche le mot de passe de la base de données et le WORKER_KEY — notez-les (ils sont aussi dans `/opt/callbot/panel/.env`).

Si une erreur apparaît pendant l'installation, envoyez-moi le texte de l'erreur.

## Étape 5 — Tester le panneau

Ouvrez cette adresse dans le navigateur de votre ordinateur ou téléphone :

```
http://167.233.27.50:4000
```

Le panneau doit s'afficher en français. Ensuite :
1. Onglet « Connexion et réglages » → token du robot Telegram + service d'IA (clé gratuite Gemini ou Groq) → Enregistrer
2. Remplissez l'onglet « Personnalité et connaissances » (la base de données du serveur démarre à zéro)
3. Utilisez les boutons **FR / NL** en haut à droite pour passer l'interface en néerlandais si besoin

## Étape 6 — Enregistrer votre propre voix

1. Dans l'onglet « Voix de la standardiste », choisissez le mode **« Ma propre voix (clone) »**
2. Enregistrez au moins **6 secondes** de votre voix naturelle (lisez un texte en français) et validez
3. Cliquez sur « Préchauffer les phrases fréquentes » — sur le CPU du serveur, cela accélère les réponses pendant les appels

## Étape 7 — Application Android

1. Dans l'application du téléphone, entrez l'**adresse du serveur** : `http://167.233.27.50:4000`
2. Copiez le **code de sécurité des appels** depuis l'onglet « Appel téléphonique » du nouveau panneau
3. Enregistrer → « Tester la connexion » → appelez depuis un autre téléphone

## Mises à jour ultérieures

Chaque fois que vous recevez une nouvelle version des fichiers :

```
cd /opt/callbot-deploy && git pull
bash install.sh
```

(Le script est intelligent : il remplace uniquement les fichiers modifiés.)

## Commandes utiles sur le serveur

```
systemctl status callbot-panel   # état du panneau
systemctl status callbot-voice   # état du serveur vocal
journalctl -u callbot-panel -n 50    # derniers logs du panneau
journalctl -u callbot-voice -n 50    # derniers logs du vocal
systemctl restart callbot-panel  # redémarrer le panneau
```

Après un redémarrage complet du serveur, les deux services se lancent automatiquement.

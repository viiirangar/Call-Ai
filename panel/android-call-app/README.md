# Répondeur d'appel automatique — Guide complet (français)

Cette application Android répond automatiquement aux appels entrants de votre téléphone et converse en français.
Le cerveau des réponses est votre panneau « Mon Assistant Français » que vous avez déjà — l'application n'est que les « oreilles » et la « bouche ».

## Comment ça fonctionne ?

1. Un appel arrive → l'application demande au serveur « la réponse d'appel est-elle activée ? » (si le panneau est désactivé, le téléphone sonne normalement)
2. L'application décroche l'appel et active le haut-parleur
3. Le message d'accueil en français est diffusé
4. La voix de l'appelant est captée par le microphone et convertie en texte français
5. Le texte est envoyé au serveur du panneau, qui génère une réponse en français à partir de votre base de connaissances
6. La réponse est diffusée avec une voix professionnelle issue du serveur — en mode « ma propre voix », avec votre timbre de voix (si le serveur n'envoie pas d'audio, le TTS français du téléphone est utilisé)
7. Après deux silences consécutifs ou la fin de l'appel, l'application salue et raccroche
8. Toute la conversation est enregistrée dans l'onglet « Conversations » du panneau

## Étape 1 — Récupérer deux valeurs depuis le panneau

Dans le panneau, ouvrez l'onglet **« Appels téléphoniques »** :
- **Adresse du serveur** : l'adresse à laquelle le panneau s'ouvre (par exemple `https://your-panel.vercel.app`)
- **Code de sécurité des appels** : s'il n'est pas encore créé, appuyez sur le bouton « Générer le code » puis sur **Enregistrer les réglages d'appel**
- Copiez les deux valeurs

## Étape 2 — Générer le fichier APK (deux méthodes)

### Méthode A : avec GitHub Actions (sans rien installer — recommandée)

1. Créez un compte gratuit sur [github.com](https://github.com) (si vous n'en avez pas)
2. Créez un nouveau dépôt (Repository) privé
3. Déposez-y tout le contenu de ce dossier (Upload files ou via git push)
4. Ouvrez l'onglet **Actions** — le travail « Build APK » s'exécute automatiquement
5. Une fois terminé (environ 3 à 5 minutes), cliquez sur l'exécution et téléchargez le fichier `callbot-apk` dans la section **Artifacts**
6. Le fichier ZIP contient `app-debug.apk` — envoyez-le sur votre téléphone (par exemple via Telegram)

### Méthode B : avec Android Studio (sur ordinateur)

1. Installez [Android Studio](https://developer.android.com/studio)
2. Ouvrez ce dossier (Open) et attendez la fin de la synchronisation
3. Menu `Build → Build Bundle(s) / APK(s) → Build APK(s)`
4. L'APK est généré dans `app/build/outputs/apk/debug/`

## Étape 3 — Installation et configuration sur le téléphone

1. Ouvrez le fichier APK — si le message « source inconnue » apparaît, autorisez l'installation
2. Ouvrez l'application et saisissez :
   - Adresse du serveur → depuis l'étape 1
   - Code de sécurité → depuis l'étape 1
3. Appuyez sur **Enregistrer les réglages**
4. Appuyez sur **Accorder les autorisations téléphone et microphone** et acceptez les trois autorisations
5. Appuyez sur **Désactiver l'optimisation de la batterie** et autorisez (pour que le système ne tue pas l'application)
6. Appuyez sur **Tester la connexion au serveur** — le message d'accueil en français doit s'afficher

## Étape 4 — Test réel

Appelez votre propre numéro depuis un autre téléphone (ou demandez à un ami) :
- Le téléphone peut être verrouillé — l'application allume elle-même l'écran, puis décroche l'appel
- Après environ 1 à 2 secondes de sonnerie, l'application répond automatiquement
- Le message d'accueil en français est diffusé
- Posez une question (par exemple « Quel est votre diplôme ? ») et écoutez la réponse vocale
- Dans le panneau, l'onglet « Conversations » affiche la conversation

## Réglages importants dans le panneau

- Onglet **« Personnalité et connaissances »** : tout ce que vous écrivez ici (diplômes, expérience, services, FAQ) sera répondu par la secrétaire lors des appels — c'est la partie la plus importante
- Onglet **« Appels téléphoniques »** : message d'accueil et d'au revoir en français + interrupteur activé/désactivé de la réponse d'appel
- Interrupteur « Réponse automatique » dans l'en-tête du panneau : désactive tout (appels + messages)

## Remarques et limites

- Uniquement **Android 8 et supérieur** ; impossible sur iPhone en raison des règles d'Apple
- Chaque réponse a un délai de 2 à 4 secondes — c'est normal, comme une secrétaire qui réfléchit
- La qualité audio est moyenne (haut-parleur + microphone) ; dans un environnement bruyant, l'écoute peut être difficile
- Le téléphone doit être **allumé et connecté** ; après chaque redémarrage du téléphone, ouvrez l'application une fois
- Quand le téléphone est verrouillé, l'application allume l'écran à la sonnerie et la conversation se déroule avec l'écran allumé (pas besoin de garder le téléphone déverrouillé). L'écran n'est allumé que pendant la conversation — c'est volontaire, car le microphone et la reconnaissance vocale ne fonctionnent pas bien sur l'écran verrouillé de certains téléphones
- Pendant l'appel, l'application diffuse le son par le haut-parleur — ne branchez pas d'écouteurs (la voix de l'appelant ne serait pas entendue)
- Si on pose à la secrétaire une question financière/juridique particulière absente de la base de connaissances, elle dit « Je ne sais pas » et l'appel est marqué « nécessite votre attention » dans le panneau
- La voix de la secrétaire se règle depuis le panneau : « ma propre voix (clonée) » avec OpenVoice sur une base neuronale Microsoft, ou des voix professionnelles prêtes à l'emploi (Denise/Henri, etc.) — l'application récupère chaque réponse audio depuis le serveur et, si elle n'arrive pas, la diffuse avec la voix du téléphone

## Dépannage

| Problème | Solution |
|---|---|
| L'application ne décroche pas | Interrupteur d'activation dans l'application + interrupteur « Réponse d'appel » dans le panneau + code de sécurité identique + autorisations |
| Elle décroche mais ne parle pas | Activez manuellement le haut-parleur ; installez la voix TTS française de Google (Réglages → Langue et saisie → Synthèse vocale) ; vérifiez l'état du « Service audio » dans le panneau |
| Elle n'entend pas les questions | Environnement plus calme ; vérifiez le serveur avec le « Test de connexion » ; vérifiez l'internet du téléphone |
| L'application ne fonctionne pas après redémarrage du téléphone | Ouvrez l'application une fois ; revérifiez l'exclusion de l'optimisation de la batterie |
| Téléphone verrouillé, pas de réponse | Samsung : Réglages → Batterie → « Limites d'utilisation en arrière-plan » (Background usage limits) → ajoutez l'application à la liste « Applications jamais mises en veille » (Never sleeping apps) ; et dans Réglages → Applications → cette application → Batterie → « Sans restriction » (Unrestricted) |
| Erreur 401 au test de connexion | Le code de sécurité n'est pas identique dans l'application et le panneau — recopiez-le depuis le panneau |

## Confidentialité

- Les conversations sont enregistrées uniquement dans la base de données de votre propre panneau
- Ne partagez le code de sécurité avec personne — quiconque possède le code peut utiliser le cerveau du robot
- Pour générer un nouveau code, appuyez sur le bouton « Générer le code » dans le panneau et mettez-le à jour dans l'application

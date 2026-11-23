#!/bin/bash
# ============================================================
# Installation complète de « Mon Assistant Français » — serveur Hetzner
# Ubuntu 22.04 | Panneau : port 4000 | Serveur vocal (OpenVoice) : port 3020 (interne)
# Exécution :  sudo bash install.sh
# ============================================================
set -e

echo "==> [1/9] Installation des paquets système"
apt-get update -y
apt-get install -y curl git ffmpeg build-essential python3-venv python3-dev \
    postgresql postgresql-contrib ssl-cert

if ! command -v node >/dev/null 2>&1 || [ "$(node -v | cut -dv -f2 | cut -d. -f1)" -lt 18 ]; then
    echo "==> Installation de Node.js 20"
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
fi
echo "Node : $(node -v)"

echo "==> [2/9] Création du swap (sécurité RAM sur 4 Go)"
if [ ! -f /swapfile_callbot ]; then
    fallocate -l 2G /swapfile_callbot
    chmod 600 /swapfile_callbot
    mkswap /swapfile_callbot
    swapon /swapfile_callbot
    echo '/swapfile_callbot none swap sw 0 0' >> /etc/fstab
else
    swapon /swapfile_callbot 2>/dev/null || true
fi

BASE=/opt/callbot
DEPLOY_DIR="$(cd "$(dirname "$0")" && pwd)"
mkdir -p "$BASE"
echo "==> [3/9] Copie des fichiers vers $BASE"
rm -rf "$BASE/panel" "$BASE/voice"
cp -r "$DEPLOY_DIR/panel" "$BASE/panel"
cp -r "$DEPLOY_DIR/voice" "$BASE/voice"

echo "==> [4/9] Dépendances Python + modèle OpenVoice (5 à 10 minutes)"
cd "$BASE/voice"
python3 -m venv venv
venv/bin/pip install --upgrade pip
venv/bin/pip install torch --index-url https://download.pytorch.org/whl/cpu
venv/bin/pip install -r requirements.txt
mkdir -p OpenVoice/checkpoints_v2/converter
CKPT=OpenVoice/checkpoints_v2/converter/checkpoint.pth
if [ ! -f "$CKPT" ]; then
    wget -q -O "$CKPT" \
      "https://myshell-public-repo-host.s3.amazonaws.com/openvoice/checkpoints_v2/converter/checkpoint.pth" \
      || curl -fsSL -o "$CKPT" \
      "https://myshell-public-repo-host.s3.amazonaws.com/openvoice/checkpoints_v2/converter/checkpoint.pth"
fi
ls -la "$CKPT"

echo "==> [5/9] Création de la base de données PostgreSQL"
DBPASS="${DBPASS:-$(head -c 18 /dev/urandom | base64 | tr -dc 'a-zA-Z0-9' | head -c 20)}"
sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='callbot'" | grep -q 1 \
  || sudo -u postgres psql -c "CREATE USER callbot WITH PASSWORD '$DBPASS';"
sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='callbot'" | grep -q 1 \
  || sudo -u postgres psql -c "CREATE DATABASE callbot OWNER callbot;"
WORKER_KEY="${WORKER_KEY:-$(head -c 18 /dev/urandom | base64 | tr -dc 'a-zA-Z0-9' | head -c 24)}"

echo "==> [6/9] Création du fichier .env du panneau"
cat > "$BASE/panel/.env" <<EOF
DATABASE_URL=postgresql://callbot:$DBPASS@127.0.0.1:5432/callbot
WORKER_KEY=$WORKER_KEY
VOICE_SERVER_URL=http://127.0.0.1:3020
EOF
chmod 600 "$BASE/panel/.env"

echo "==> [7/9] Compilation du panneau (npm install + base de données + build)"
cd "$BASE/panel"
npm install
npx prisma db push
npm run build

echo "==> [8/9] Installation des services systemd"
cp "$DEPLOY_DIR/systemd/callbot-panel.service" /etc/systemd/system/
cp "$DEPLOY_DIR/systemd/callbot-voice.service" /etc/systemd/system/
systemctl daemon-reload
systemctl enable callbot-voice callbot-panel
systemctl restart callbot-voice
sleep 3
systemctl restart callbot-panel

echo "==> [9/9] Vérification de l'état"
sleep 3
systemctl --no-pager --lines=3 status callbot-voice || true
systemctl --no-pager --lines=3 status callbot-panel || true
echo ""
echo "=============================================="
echo " Installation terminée"
echo " Panneau :      http://IP-DU-SERVEUR:4000"
echo " Serveur vocal : 127.0.0.1:3020 (interne uniquement)"
echo " Mot de passe DB : $DBPASS  (stocké dans $BASE/panel/.env)"
echo " WORKER_KEY :    $WORKER_KEY"
echo " Rappel : ouvrez le port TCP 4000 dans le firewall Hetzner"
echo "=============================================="

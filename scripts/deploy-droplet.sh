#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/var/www/admin"
PRIMARY_PM2_APP="stallion-admin"
FALLBACK_PM2_APP="stallionadmin"

cd "$APP_DIR"

git fetch origin
git reset --hard origin/main
git clean -fd

npm ci
npm run build

if pm2 describe "$PRIMARY_PM2_APP" >/dev/null 2>&1; then
  pm2 restart "$PRIMARY_PM2_APP"
elif pm2 describe "$FALLBACK_PM2_APP" >/dev/null 2>&1; then
  pm2 restart "$FALLBACK_PM2_APP"
else
  pm2 start ecosystem.config.cjs --env production
fi

pm2 save

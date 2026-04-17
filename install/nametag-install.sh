#!/usr/bin/env bash

# Copyright (c) 2021-2026 community-scripts ORG
# Author: Adeel Ahmad (adeelahmad)
# License: MIT | https://github.com/community-scripts/ProxmoxVE/raw/main/LICENSE
# Source: https://github.com/adeelahmad/nametag

source /dev/stdin <<<"$FUNCTIONS_FILE_PATH"
color
verb_ip6
catch_errors
setting_up_container
network_check
update_os

msg_info "Installing Dependencies"
$STD apt-get install -y \
  git \
  build-essential \
  ca-certificates \
  gnupg \
  openssl
msg_ok "Installed Dependencies"

NODE_VERSION="20" NODE_MODULE="prisma" setup_nodejs
PG_VERSION="16" setup_postgresql
PG_DB_NAME="nametag_db" \
  PG_DB_USER="nametag" \
  PG_DB_SKIP_ALTER_ROLE="true" \
  setup_postgresql_db

msg_info "Cloning ${APPLICATION:-Nametag}"
RELEASE=$(curl -fsSL "https://api.github.com/repos/adeelahmad/nametag/releases/latest" 2>/dev/null | grep '"tag_name"' | sed -E 's/.*"([^"]+)".*/\1/' || true)
mkdir -p /opt/nametag
if [ -n "${RELEASE}" ] && [ "${RELEASE}" != "null" ]; then
  $STD curl -fsSL "https://github.com/adeelahmad/nametag/archive/refs/tags/${RELEASE}.tar.gz" | tar -xz --strip-components=1 -C /opt/nametag
  echo "${RELEASE}" >/opt/nametag/.app_version
else
  $STD git clone --depth 1 https://github.com/adeelahmad/nametag.git /opt/nametag
  cd /opt/nametag && echo "$(git rev-parse --short HEAD)" >/opt/nametag/.app_version
fi
msg_ok "Cloned ${APPLICATION:-Nametag}"

msg_info "Configuring Environment"
NEXTAUTH_SECRET="$(openssl rand -base64 32)"
CRON_SECRET="$(openssl rand -base64 24 | tr -dc 'a-zA-Z0-9' | head -c24)"
mkdir -p /opt/nametag/data/photos
cat <<EOF >/opt/nametag/.env
DATABASE_URL=postgresql://${PG_DB_USER}:${PG_DB_PASS}@localhost:5432/${PG_DB_NAME}
DB_HOST=localhost
DB_PORT=5432
DB_NAME=${PG_DB_NAME}
DB_USER=${PG_DB_USER}
DB_PASSWORD=${PG_DB_PASS}
NEXTAUTH_URL=http://$(hostname -I | awk '{print $1}'):3000
NEXTAUTH_SECRET=${NEXTAUTH_SECRET}
AUTH_SECRET=${NEXTAUTH_SECRET}
NODE_ENV=production
PORT=3000
CRON_SECRET=${CRON_SECRET}
PHOTO_STORAGE_PATH=/opt/nametag/data/photos
EOF
chmod 600 /opt/nametag/.env
msg_ok "Configured Environment"

msg_info "Building Application"
cd /opt/nametag
set -a
source /opt/nametag/.env
set +a
$STD npm ci --include=dev
$STD npx prisma generate
$STD npx prisma migrate deploy
$STD npx esbuild prisma/seed.production.ts --platform=node --format=cjs --outfile=prisma/seed.production.js --bundle --external:@prisma/client --external:pg
$STD node prisma/seed.production.js || true
$STD npm run build
mkdir -p /opt/nametag/.next/standalone/.next
cp -r /opt/nametag/.next/static /opt/nametag/.next/standalone/.next/static
cp -r /opt/nametag/public /opt/nametag/.next/standalone/public
cp -r /opt/nametag/locales /opt/nametag/.next/standalone/locales
msg_ok "Built Application"

msg_info "Creating Service"
cat <<EOF >/etc/systemd/system/nametag.service
[Unit]
Description=Nametag Personal CRM
After=network.target postgresql.service
Requires=postgresql.service

[Service]
Type=simple
WorkingDirectory=/opt/nametag
EnvironmentFile=/opt/nametag/.env
ExecStart=/usr/bin/node /opt/nametag/.next/standalone/server.js
Restart=always
RestartSec=10
SyslogIdentifier=nametag

[Install]
WantedBy=multi-user.target
EOF
systemctl enable -q --now nametag
msg_ok "Created Service"

msg_info "Configuring Cron Jobs"
cat <<EOF >/etc/cron.d/nametag
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/sbin:/bin:/usr/sbin:/usr/bin

0 8 * * * root curl -sf -H "Authorization: Bearer ${CRON_SECRET}" http://localhost:3000/api/cron/send-reminders > /dev/null 2>&1
0 3 * * * root curl -sf -H "Authorization: Bearer ${CRON_SECRET}" http://localhost:3000/api/cron/purge-deleted > /dev/null 2>&1
0 2,10,18 * * * root curl -sf -H "Authorization: Bearer ${CRON_SECRET}" http://localhost:3000/api/cron/carddav-sync > /dev/null 2>&1
*/30 * * * * root curl -sf -H "Authorization: Bearer ${CRON_SECRET}" http://localhost:3000/api/cron/gmail-sync > /dev/null 2>&1
EOF
chmod 644 /etc/cron.d/nametag
msg_ok "Configured Cron Jobs"

motd_ssh
customize
cleanup_lxc

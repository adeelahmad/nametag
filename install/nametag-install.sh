#!/usr/bin/env bash

# Copyright (c) 2021-2026 community-scripts ORG
# Author: Adeel Ahmad
# License: MIT | https://github.com/community-scripts/ProxmoxVED/raw/main/LICENSE
# Source: https://github.com/adeelahmad/nametag

source /dev/stdin <<<"$FUNCTIONS_FILE_PATH"
color
verb_ip6
catch_errors
setting_up_container
network_check
update_os

msg_info "Installing Dependencies"
$STD apt install -y \
  git \
  build-essential \
  ca-certificates \
  gnupg \
  openssl \
  sudo
msg_ok "Installed Dependencies"

NODE_VERSION="20" NODE_MODULE="prisma" setup_nodejs
PG_VERSION="16" setup_postgresql

DB_NAME="nametag_db"
DB_USER="nametag"
DB_PASS="$(openssl rand -base64 18 | tr -dc 'a-zA-Z0-9' | head -c24)"
PG_DB_NAME="$DB_NAME" \
  PG_DB_USER="$DB_USER" \
  PG_DB_PASS="$DB_PASS" \
  PG_DB_SKIP_ALTER_ROLE="true" \
  setup_postgresql_db

fetch_and_deploy_gh_release "nametag" "adeelahmad/nametag" "tarball" "latest" "/opt/nametag"

msg_info "Configuring Environment"
NEXTAUTH_SECRET="$(openssl rand -base64 32)"
CRON_SECRET="$(openssl rand -base64 24 | tr -dc 'a-zA-Z0-9' | head -c24)"
HOST_IP="$(hostname -I | awk '{print $1}')"

mkdir -p /opt/nametag/data/photos
cat <<EOF >/opt/nametag/.env
# Database
DATABASE_URL=postgresql://${DB_USER}:${DB_PASS}@localhost:5432/${DB_NAME}
DB_HOST=localhost
DB_PORT=5432
DB_NAME=${DB_NAME}
DB_USER=${DB_USER}
DB_PASSWORD=${DB_PASS}

# Application
NEXTAUTH_URL=http://${HOST_IP}:3000
NEXTAUTH_SECRET=${NEXTAUTH_SECRET}
AUTH_SECRET=${NEXTAUTH_SECRET}
NODE_ENV=production
PORT=3000

# Cron
CRON_SECRET=${CRON_SECRET}

# Photo Storage
PHOTO_STORAGE_PATH=/opt/nametag/data/photos

# Google Integration (optional - configure from Settings > Integrations)
# GOOGLE_CLIENT_ID=your-client-id
# GOOGLE_CLIENT_SECRET=your-client-secret
# GOOGLE_VISION_ENABLED=false
EOF
chmod 600 /opt/nametag/.env
{
  echo "Database User: ${DB_USER}"
  echo "Database Password: ${DB_PASS}"
  echo "Database Name: ${DB_NAME}"
  echo "Cron Secret: ${CRON_SECRET}"
  echo "NextAuth Secret: ${NEXTAUTH_SECRET}"
} >~/nametag.creds
msg_ok "Configured Environment"

msg_info "Building Application"
cd /opt/nametag
set -a
source /opt/nametag/.env
set +a
$STD npm ci
$STD npx prisma generate
$STD npx prisma migrate deploy
$STD node prisma/seed.production.js || true
$STD npm run build
cp -r /opt/nametag/.next/static /opt/nametag/.next/standalone/.next/static
cp -r /opt/nametag/public /opt/nametag/.next/standalone/public
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
StandardOutput=journal
StandardError=journal
SyslogIdentifier=nametag

[Install]
WantedBy=multi-user.target
EOF
systemctl enable -q --now nametag
msg_ok "Created Service"

msg_info "Configuring Cron Jobs"
cat <<EOF >/etc/cron.d/nametag
# Nametag scheduled jobs
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/sbin:/bin:/usr/sbin:/usr/bin

# Send reminders - daily at 8 AM
0 8 * * * root curl -sf -H "Authorization: Bearer ${CRON_SECRET}" http://localhost:3000/api/cron/send-reminders > /dev/null 2>&1

# Purge deleted records - daily at 3 AM
0 3 * * * root curl -sf -H "Authorization: Bearer ${CRON_SECRET}" http://localhost:3000/api/cron/purge-deleted > /dev/null 2>&1

# CardDAV sync - 3 times daily
0 2,10,18 * * * root curl -sf -H "Authorization: Bearer ${CRON_SECRET}" http://localhost:3000/api/cron/carddav-sync > /dev/null 2>&1

# Gmail/Drive/Calendar sync - every 30 minutes
*/30 * * * * root curl -sf -H "Authorization: Bearer ${CRON_SECRET}" http://localhost:3000/api/cron/gmail-sync > /dev/null 2>&1
EOF
chmod 644 /etc/cron.d/nametag
msg_ok "Configured Cron Jobs"

motd_ssh
customize

msg_info "Cleaning up"
$STD apt -y autoremove
$STD apt -y autoclean
msg_ok "Cleaned"

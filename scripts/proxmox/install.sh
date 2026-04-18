#!/usr/bin/env bash

# Nametag LXC Install Script for Proxmox
# Compatible with Proxmox community-scripts (tteck) format
#
# Usage:
#   Inside an LXC container (Debian 12 / Ubuntu 22.04+):
#   curl -sSL https://raw.githubusercontent.com/adeelahmad/nametag/master/scripts/proxmox/install.sh | bash
#
# Or manually:
#   bash scripts/proxmox/install.sh
#
# Requirements:
#   - Debian 12+ or Ubuntu 22.04+ LXC container
#   - At least 1GB RAM, 4GB disk
#   - Internet access

set -euo pipefail

# ============================================
# Configuration
# ============================================
APP_NAME="nametag"
APP_USER="nametag"
APP_DIR="/opt/nametag"
DATA_DIR="/opt/nametag/data"
PHOTOS_DIR="/opt/nametag/data/photos"
DB_NAME="nametag_db"
DB_USER="nametag"
DB_PASS=$(openssl rand -base64 16 | tr -dc 'a-zA-Z0-9' | head -c 24)
NEXTAUTH_SECRET=$(openssl rand -base64 32)
CRON_SECRET=$(openssl rand -base64 24 | tr -dc 'a-zA-Z0-9' | head -c 24)
NODE_VERSION="20"
PORT=3000

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info()  { echo -e "${BLUE}[INFO]${NC} $1"; }
log_ok()    { echo -e "${GREEN}[OK]${NC} $1"; }
log_warn()  { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# ============================================
# Pre-flight checks
# ============================================
if [ "$(id -u)" -ne 0 ]; then
  log_error "This script must be run as root"
  exit 1
fi

log_info "Starting Nametag installation..."

# ============================================
# System Update
# ============================================
log_info "Updating system packages..."
apt-get update -qq
apt-get upgrade -y -qq
apt-get install -y -qq curl wget gnupg2 lsb-release ca-certificates sudo openssl
log_ok "System packages updated"

# ============================================
# PostgreSQL
# ============================================
log_info "Installing PostgreSQL..."
if ! command -v psql &>/dev/null; then
  sh -c 'echo "deb http://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" > /etc/apt/sources.list.d/pgdg.list'
  wget -qO - https://www.postgresql.org/media/keys/ACCC4CF8.asc | gpg --dearmor -o /usr/share/keyrings/pgdg.gpg
  echo "deb [signed-by=/usr/share/keyrings/pgdg.gpg] http://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" > /etc/apt/sources.list.d/pgdg.list
  apt-get update -qq
  apt-get install -y -qq postgresql-16
fi

systemctl enable --now postgresql
log_ok "PostgreSQL installed"

log_info "Configuring PostgreSQL database..."
sudo -u postgres psql -tc "SELECT 1 FROM pg_roles WHERE rolname='${DB_USER}'" | grep -q 1 || \
  sudo -u postgres psql -c "CREATE USER ${DB_USER} WITH PASSWORD '${DB_PASS}';"
sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'" | grep -q 1 || \
  sudo -u postgres createdb -O "${DB_USER}" "${DB_NAME}"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE ${DB_NAME} TO ${DB_USER};"
log_ok "PostgreSQL database configured"

# ============================================
# Node.js
# ============================================
log_info "Installing Node.js ${NODE_VERSION}..."
if ! command -v node &>/dev/null || [[ "$(node -v)" != v${NODE_VERSION}* ]]; then
  curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | bash -
  apt-get install -y -qq nodejs
fi
log_ok "Node.js $(node -v) installed"

# ============================================
# Application User
# ============================================
if ! id "${APP_USER}" &>/dev/null; then
  useradd -r -m -d "${APP_DIR}" -s /bin/bash "${APP_USER}"
  log_ok "Created user: ${APP_USER}"
fi

# ============================================
# Download & Install Nametag
# ============================================
log_info "Fetching latest Nametag release..."
LATEST_TAG=$(curl -s https://api.github.com/repos/adeelahmad/nametag/releases/latest | grep '"tag_name"' | sed -E 's/.*"([^"]+)".*/\1/')
if [ -z "$LATEST_TAG" ]; then
  # Fallback: clone from branch
  log_warn "No release found, cloning from repository..."
  apt-get install -y -qq git
  if [ -d "${APP_DIR}/.git" ]; then
    cd "${APP_DIR}" && git pull
  else
    git clone https://github.com/adeelahmad/nametag.git "${APP_DIR}"
  fi
else
  VERSION="${LATEST_TAG#v}"
  log_info "Downloading Nametag ${VERSION}..."
  mkdir -p "${APP_DIR}"
  curl -sSL "https://github.com/adeelahmad/nametag/archive/refs/tags/${LATEST_TAG}.tar.gz" | \
    tar -xz --strip-components=1 -C "${APP_DIR}"
fi
log_ok "Nametag downloaded to ${APP_DIR}"

# ============================================
# Environment Configuration
# ============================================
log_info "Creating environment configuration..."
mkdir -p "${DATA_DIR}" "${PHOTOS_DIR}"

cat > "${APP_DIR}/.env" <<EOF
# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=${DB_NAME}
DB_USER=${DB_USER}
DB_PASSWORD=${DB_PASS}

# Application
NEXTAUTH_URL=http://$(hostname -I | awk '{print $1}'):${PORT}
NEXTAUTH_SECRET=${NEXTAUTH_SECRET}
NODE_ENV=production
PORT=${PORT}

# Cron
CRON_SECRET=${CRON_SECRET}

# Photo Storage
PHOTO_STORAGE_PATH=${PHOTOS_DIR}

# Google Integration (optional - configure from Settings > Integrations)
# Get credentials from https://console.cloud.google.com/apis/credentials
# GOOGLE_CLIENT_ID=your-client-id
# GOOGLE_CLIENT_SECRET=your-client-secret
# GOOGLE_VISION_ENABLED=false
EOF

chown -R "${APP_USER}:${APP_USER}" "${APP_DIR}"
chmod 600 "${APP_DIR}/.env"
log_ok "Environment configured"

# ============================================
# Install Dependencies & Build
# ============================================
log_info "Installing dependencies..."
cd "${APP_DIR}"
sudo -u "${APP_USER}" npm ci --production=false 2>&1 | tail -1
log_ok "Dependencies installed"

log_info "Generating Prisma client..."
sudo -u "${APP_USER}" npx prisma generate 2>&1 | tail -1
log_ok "Prisma client generated"

log_info "Running database migrations..."
sudo -u "${APP_USER}" npx prisma migrate deploy 2>&1 | tail -1
log_ok "Migrations complete"

log_info "Seeding database..."
sudo -u "${APP_USER}" node prisma/seed.production.js 2>/dev/null || true
log_ok "Database seeded"

log_info "Building application (this may take a few minutes)..."
sudo -u "${APP_USER}" npm run build 2>&1 | tail -3
log_ok "Application built"

# next.config uses output:'standalone'. The standalone server.js expects
# .next/static and public next to it, but `next build` does not copy them.
log_info "Copying static assets into standalone tree..."
sudo -u "${APP_USER}" rm -rf "${APP_DIR}/.next/standalone/.next/static" "${APP_DIR}/.next/standalone/public"
sudo -u "${APP_USER}" cp -r "${APP_DIR}/.next/static" "${APP_DIR}/.next/standalone/.next/static"
if [ -d "${APP_DIR}/public" ]; then
  sudo -u "${APP_USER}" cp -r "${APP_DIR}/public" "${APP_DIR}/.next/standalone/public"
fi
log_ok "Static assets staged"

# ============================================
# Systemd Service
# ============================================
log_info "Creating systemd service..."
cat > /etc/systemd/system/nametag.service <<EOF
[Unit]
Description=Nametag Personal CRM
After=network.target postgresql.service
Requires=postgresql.service

[Service]
Type=simple
User=${APP_USER}
Group=${APP_USER}
WorkingDirectory=${APP_DIR}
EnvironmentFile=${APP_DIR}/.env
ExecStart=/usr/bin/node ${APP_DIR}/.next/standalone/server.js
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=nametag

# Security hardening
NoNewPrivileges=true
ProtectSystem=strict
ReadWritePaths=${DATA_DIR}
ProtectHome=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --now nametag
log_ok "Nametag service created and started"

# ============================================
# Cron Jobs
# ============================================
log_info "Setting up cron jobs..."
cat > /etc/cron.d/nametag <<EOF
# Nametag scheduled jobs
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/sbin:/bin:/usr/sbin:/usr/bin

# Send reminders - daily at 8 AM
0 8 * * * root curl -sf -H "Authorization: Bearer ${CRON_SECRET}" http://localhost:${PORT}/api/cron/send-reminders > /dev/null 2>&1

# Purge deleted records - daily at 3 AM
0 3 * * * root curl -sf -H "Authorization: Bearer ${CRON_SECRET}" http://localhost:${PORT}/api/cron/purge-deleted > /dev/null 2>&1

# CardDAV sync - 3 times daily
0 2,10,18 * * * root curl -sf -H "Authorization: Bearer ${CRON_SECRET}" http://localhost:${PORT}/api/cron/carddav-sync > /dev/null 2>&1

# Gmail/Drive/Calendar sync - every 30 minutes
*/30 * * * * root curl -sf -H "Authorization: Bearer ${CRON_SECRET}" http://localhost:${PORT}/api/cron/gmail-sync > /dev/null 2>&1
EOF

chmod 644 /etc/cron.d/nametag
log_ok "Cron jobs configured"

# ============================================
# Summary
# ============================================
IP=$(hostname -I | awk '{print $1}')

echo ""
echo "============================================"
echo -e "${GREEN}  Nametag installed successfully!${NC}"
echo "============================================"
echo ""
echo -e "  ${BLUE}Web UI:${NC}     http://${IP}:${PORT}"
echo -e "  ${BLUE}Service:${NC}    systemctl status nametag"
echo -e "  ${BLUE}Logs:${NC}       journalctl -u nametag -f"
echo -e "  ${BLUE}Config:${NC}     ${APP_DIR}/.env"
echo -e "  ${BLUE}Data:${NC}       ${DATA_DIR}"
echo ""
echo "  Database credentials:"
echo -e "    User:     ${DB_USER}"
echo -e "    Password: ${DB_PASS}"
echo -e "    Database: ${DB_NAME}"
echo ""
echo "  Google Integration:"
echo "    1. Go to https://console.cloud.google.com/apis/credentials"
echo "    2. Create OAuth 2.0 Client ID"
echo "    3. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to ${APP_DIR}/.env"
echo "    4. Restart: systemctl restart nametag"
echo "    5. Each user connects their own account from Settings > Integrations"
echo ""
echo "============================================"

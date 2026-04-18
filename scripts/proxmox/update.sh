#!/usr/bin/env bash

# Nametag LXC Update Script
# Run inside the LXC container to update to the latest version
#
# Usage: bash /opt/nametag/scripts/proxmox/update.sh

set -euo pipefail

APP_DIR="/opt/nametag"
APP_USER="nametag"

RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info()  { echo -e "${BLUE}[INFO]${NC} $1"; }
log_ok()    { echo -e "${GREEN}[OK]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

if [ "$(id -u)" -ne 0 ]; then
  log_error "This script must be run as root"
  exit 1
fi

cd "${APP_DIR}"

# Get current version
CURRENT=$(node -e "console.log(require('./package.json').version)" 2>/dev/null || echo "unknown")
log_info "Current version: ${CURRENT}"

# Stop service
log_info "Stopping Nametag..."
systemctl stop nametag

# Backup .env
cp "${APP_DIR}/.env" "${APP_DIR}/.env.backup"

# Fetch latest
log_info "Fetching latest release..."
LATEST_TAG=$(curl -s https://api.github.com/repos/adeelahmad/nametag/releases/latest | grep '"tag_name"' | sed -E 's/.*"([^"]+)".*/\1/')

if [ -z "$LATEST_TAG" ]; then
  if [ -d "${APP_DIR}/.git" ]; then
    log_info "No release found, pulling from git..."
    sudo -u "${APP_USER}" git pull
  else
    log_error "No release found and not a git repo. Cannot update."
    systemctl start nametag
    exit 1
  fi
else
  VERSION="${LATEST_TAG#v}"
  log_info "Updating to ${VERSION}..."
  curl -sSL "https://github.com/adeelahmad/nametag/archive/refs/tags/${LATEST_TAG}.tar.gz" | \
    tar -xz --strip-components=1 -C "${APP_DIR}"
fi

# Restore .env
cp "${APP_DIR}/.env.backup" "${APP_DIR}/.env"

# Tarball extracts as root — restore ownership so the app user can write to node_modules, .next, etc.
chown -R "${APP_USER}:${APP_USER}" "${APP_DIR}"

# Rebuild
log_info "Installing dependencies..."
sudo -u "${APP_USER}" npm ci --include=dev

log_info "Generating Prisma client..."
sudo -u "${APP_USER}" npx prisma generate

log_info "Running migrations..."
sudo -u "${APP_USER}" npx prisma migrate deploy

log_info "Building application..."
sudo -u "${APP_USER}" npm run build

# Restart
log_info "Starting Nametag..."
systemctl start nametag

NEW=$(node -e "console.log(require('./package.json').version)" 2>/dev/null || echo "unknown")
log_ok "Updated: ${CURRENT} -> ${NEW}"
echo ""
echo -e "  ${BLUE}Status:${NC} systemctl status nametag"
echo -e "  ${BLUE}Logs:${NC}   journalctl -u nametag -f"

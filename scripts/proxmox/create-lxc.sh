#!/usr/bin/env bash

# Nametag LXC Container Creator for Proxmox VE
#
# Run this on the Proxmox host (not inside a container):
#   bash create-lxc.sh
#
# Creates a Debian 12 LXC container and installs Nametag inside it.
# Compatible with Proxmox VE 7.x and 8.x.

set -euo pipefail

# ============================================
# Configuration (edit these as needed)
# ============================================
CTID="${CTID:-$(pvesh get /cluster/nextid)}"
HOSTNAME="${HOSTNAME:-nametag}"
TEMPLATE="${TEMPLATE:-local:vztmpl/debian-12-standard_12.7-1_amd64.tar.zst}"
STORAGE="${STORAGE:-local-lvm}"
DISK_SIZE="${DISK_SIZE:-8}"       # GB
RAM="${RAM:-1024}"                # MB
SWAP="${SWAP:-512}"               # MB
CORES="${CORES:-2}"
BRIDGE="${BRIDGE:-vmbr0}"
PASSWORD="${PASSWORD:-$(openssl rand -base64 12)}"

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
# Pre-flight
# ============================================
if ! command -v pct &>/dev/null; then
  log_error "This script must be run on a Proxmox VE host"
  exit 1
fi

# Check template exists
if ! pveam list local 2>/dev/null | grep -q "debian-12"; then
  log_info "Downloading Debian 12 template..."
  pveam download local debian-12-standard_12.7-1_amd64.tar.zst || {
    log_warn "Template download failed. Listing available templates:"
    pveam available --section system | grep debian
    echo ""
    echo "Download one with: pveam download local <template-name>"
    exit 1
  }
fi

echo ""
echo "============================================"
echo -e "${BLUE}  Nametag LXC Container Setup${NC}"
echo "============================================"
echo ""
echo "  Container ID:  ${CTID}"
echo "  Hostname:      ${HOSTNAME}"
echo "  RAM:           ${RAM} MB"
echo "  Disk:          ${DISK_SIZE} GB"
echo "  Cores:         ${CORES}"
echo "  Bridge:        ${BRIDGE}"
echo ""
read -rp "Proceed? (y/N) " confirm
[[ "$confirm" =~ ^[yY]$ ]] || { echo "Aborted."; exit 0; }

# ============================================
# Create Container
# ============================================
log_info "Creating LXC container ${CTID}..."

pct create "${CTID}" "${TEMPLATE}" \
  --hostname "${HOSTNAME}" \
  --storage "${STORAGE}" \
  --rootfs "${STORAGE}:${DISK_SIZE}" \
  --memory "${RAM}" \
  --swap "${SWAP}" \
  --cores "${CORES}" \
  --net0 "name=eth0,bridge=${BRIDGE},ip=dhcp" \
  --unprivileged 1 \
  --features nesting=1 \
  --onboot 1 \
  --password "${PASSWORD}" \
  --start 0

log_ok "Container ${CTID} created"

# ============================================
# Start and Install
# ============================================
log_info "Starting container..."
pct start "${CTID}"

# Wait for network
log_info "Waiting for network..."
for i in $(seq 1 30); do
  if pct exec "${CTID}" -- ping -c 1 -W 1 8.8.8.8 &>/dev/null; then
    break
  fi
  sleep 1
done

IP=$(pct exec "${CTID}" -- hostname -I 2>/dev/null | awk '{print $1}')
log_ok "Container started at ${IP}"

# ============================================
# Run Install Script
# ============================================
log_info "Running Nametag install script inside container..."
pct exec "${CTID}" -- bash -c "
  apt-get update -qq && apt-get install -y -qq curl
  curl -sSL https://raw.githubusercontent.com/adeelahmad/nametag/master/scripts/proxmox/install.sh | bash
"

# ============================================
# Summary
# ============================================
IP=$(pct exec "${CTID}" -- hostname -I 2>/dev/null | awk '{print $1}')

echo ""
echo "============================================"
echo -e "${GREEN}  Nametag LXC Container Ready!${NC}"
echo "============================================"
echo ""
echo -e "  ${BLUE}Container:${NC}  ${CTID} (${HOSTNAME})"
echo -e "  ${BLUE}IP:${NC}         ${IP}"
echo -e "  ${BLUE}Web UI:${NC}     http://${IP}:3000"
echo -e "  ${BLUE}Console:${NC}    pct enter ${CTID}"
echo -e "  ${BLUE}Root PW:${NC}    ${PASSWORD}"
echo ""
echo "  Management:"
echo "    pct start ${CTID}"
echo "    pct stop ${CTID}"
echo "    pct enter ${CTID}"
echo "    journalctl -u nametag -f    (inside container)"
echo ""
echo "============================================"

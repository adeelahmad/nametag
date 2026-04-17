#!/usr/bin/env bash
source <(curl -fsSL https://raw.githubusercontent.com/community-scripts/ProxmoxVE/main/misc/build.func)
# Copyright (c) 2021-2026 community-scripts ORG
# Author: Adeel Ahmad (adeelahmad)
# License: MIT | https://github.com/community-scripts/ProxmoxVE/raw/main/LICENSE
# Source: https://github.com/adeelahmad/nametag

APP="Nametag"
var_tags="${var_tags:-contacts;crm}"
var_cpu="${var_cpu:-2}"
var_ram="${var_ram:-2048}"
var_disk="${var_disk:-8}"
var_os="${var_os:-debian}"
var_version="${var_version:-13}"
var_unprivileged="${var_unprivileged:-1}"

# Shim curl so build.func pulls install/nametag-install.sh from this fork
# (community-scripts/ProxmoxVE does not host it).
curl() {
  for arg in "$@"; do
    if [[ "$arg" == *"/install/nametag-install.sh" ]]; then
      command curl -fsSL "https://raw.githubusercontent.com/adeelahmad/nametag/master/install/nametag-install.sh"
      return $?
    fi
  done
  command curl "$@"
}

header_info "$APP"
variables
color
catch_errors

function update_script() {
  header_info
  check_container_storage
  check_container_resources

  if [[ ! -d /opt/nametag ]]; then
    msg_error "No ${APP} Installation Found!"
    exit
  fi

  if check_for_gh_release "nametag" "adeelahmad/nametag"; then
    msg_info "Stopping Service"
    systemctl stop nametag
    msg_ok "Stopped Service"

    msg_info "Backing up Data"
    cp /opt/nametag/.env /opt/nametag.env.bak
    cp -r /opt/nametag/data /opt/nametag_data_backup
    msg_ok "Backed up Data"

    CLEAN_INSTALL=1 fetch_and_deploy_gh_release "nametag" "adeelahmad/nametag" "tarball" "latest" "/opt/nametag"

    cd /opt/nametag
    cp /opt/nametag.env.bak /opt/nametag/.env
    set -a
    source /opt/nametag/.env
    set +a
    $STD npm ci --include=dev
    $STD npx prisma generate
    $STD npx prisma migrate deploy
    $STD npm run build
    cp -r /opt/nametag/.next/static /opt/nametag/.next/standalone/.next/static
    cp -r /opt/nametag/public /opt/nametag/.next/standalone/public

    msg_info "Restoring Data"
    mkdir -p /opt/nametag/data
    cp -r /opt/nametag_data_backup/. /opt/nametag/data/
    rm -f /opt/nametag.env.bak
    rm -rf /opt/nametag_data_backup
    msg_ok "Restored Data"

    msg_info "Starting Service"
    systemctl start nametag
    msg_ok "Started Service"
    msg_ok "Updated successfully!"
  fi
  exit
}

start
build_container
description

msg_ok "Completed Successfully!\n"
echo -e "${CREATING}${GN}${APP} setup has been successfully initialized!${CL}"
echo -e "${INFO}${YW} Access it using the following URL:${CL}"
echo -e "${TAB}${GATEWAY}${BGN}http://${IP}:3000${CL}"

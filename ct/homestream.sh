#!/usr/bin/env bash
_cs_boot="${COMMUNITY_SCRIPTS_CORE_DIR:-$(dirname "${BASH_SOURCE[0]}")/../../core}/core/build.func"
source "$_cs_boot" 2>/dev/null || source <(curl -fsSL "${COMMUNITY_SCRIPTS_CORE_URL:-https://raw.githubusercontent.com/community-scripts/core/main}/core/build.func")
# Copyright (c) 2021-2026 community-scripts ORG
# Author: Eckobrew
# License: MIT | https://github.com/community-scripts/ProxmoxVE/raw/main/LICENSE
# Source: https://github.com/Eckobrew/HomeStream

APP="HomeStream"
var_tags="${var_tags:-media;streaming}"
var_cpu="${var_cpu:-2}"
var_ram="${var_ram:-2048}"
var_disk="${var_disk:-8}"
var_os="${var_os:-debian}"
var_version="${var_version:-12}"
var_arm64="${var_arm64:-yes}"
var_unprivileged="${var_unprivileged:-1}"

# Point COMMUNITY_SCRIPTS_URL to HomeStream repository so build.func resolves install/homestream-install.sh
export COMMUNITY_SCRIPTS_URL="${COMMUNITY_SCRIPTS_URL:-https://raw.githubusercontent.com/Eckobrew/HomeStream/main}"

header_info "$APP"
variables
color
catch_errors

function update_script() {
  header_info
  check_container_storage
  check_container_resources
  TARGET_DIR="/opt/homestream"
  if [[ ! -d "$TARGET_DIR" && -d /opt/homeflix ]]; then
    TARGET_DIR="/opt/homeflix"
  fi

  if [[ ! -d "$TARGET_DIR" ]]; then
    msg_error "No ${APP} Installation Found!"
    exit 1
  fi

  SERVICE_NAME="homestream"
  if systemctl is-active --quiet homeflix; then
    SERVICE_NAME="homeflix"
  fi

  msg_info "Stopping Service"
  systemctl stop "$SERVICE_NAME"
  msg_ok "Stopped Service"

  msg_info "Updating ${APP}"
  cd "$TARGET_DIR"
  $STD git fetch origin
  $STD git reset --hard origin/main
  $STD npm install
  export NEXT_TELEMETRY_DISABLED=1
  export NODE_ENV=production
  $STD npm run build
  msg_ok "Updated ${APP}"

  msg_info "Starting Service"
  systemctl start "$SERVICE_NAME"
  msg_ok "Started Service"
  msg_ok "Updated successfully!"
  exit
}

start
build_container
description

msg_ok "Completed successfully!\n"
echo -e "${CREATING}${GN}${APP} setup has been successfully initialized!${CL}"
echo -e "${INFO}${YW}Access it using the following URL:${CL}"
echo -e "${GATEWAY}${BGN}http://${IP}:3000${CL}"

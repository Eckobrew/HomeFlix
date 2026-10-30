#!/usr/bin/env bash
_cs_boot="${COMMUNITY_SCRIPTS_CORE_DIR:-$(dirname "${BASH_SOURCE[0]}")/../../core}/core/build.func"
source "$_cs_boot" 2>/dev/null || source <(curl -fsSL "${COMMUNITY_SCRIPTS_CORE_URL:-https://raw.githubusercontent.com/community-scripts/core/main}/core/build.func")
# Copyright (c) 2021-2026 community-scripts ORG
# Author: Eckobrew
# License: MIT | https://github.com/community-scripts/ProxmoxVE/raw/main/LICENSE
# Source: https://github.com/Eckobrew/HomeStream

APP="HomeFlix"
var_tags="${var_tags:-media;streaming}"
var_cpu="${var_cpu:-2}"
var_ram="${var_ram:-2048}"
var_disk="${var_disk:-8}"
var_os="${var_os:-debian}"
var_version="${var_version:-12}"
var_arm64="${var_arm64:-yes}"
var_unprivileged="${var_unprivileged:-1}"

# Point COMMUNITY_SCRIPTS_URL to HomeStream repository so build.func resolves install/homeflix-install.sh
export COMMUNITY_SCRIPTS_URL="${COMMUNITY_SCRIPTS_URL:-https://raw.githubusercontent.com/Eckobrew/HomeStream/main}"

header_info "$APP"
variables
color
catch_errors

function update_script() {
  header_info
  check_container_storage
  check_container_resources
  if [[ ! -d /opt/homeflix ]]; then
    msg_error "No ${APP} Installation Found!"
    exit 1
  fi

  msg_info "Stopping Service"
  systemctl stop homeflix
  msg_ok "Stopped Service"

  msg_info "Updating ${APP}"
  cd /opt/homeflix
  $STD git fetch origin
  $STD git reset --hard origin/main
  $STD npm install
  export NEXT_TELEMETRY_DISABLED=1
  export NODE_ENV=production
  $STD npm run build
  msg_ok "Updated ${APP}"

  msg_info "Starting Service"
  systemctl start homeflix
  msg_ok "Started Service"
  msg_ok "Updated successfully!"
  exit
}

start
build_container

# Auto-detect and configure GPU hardware acceleration if available on host
if [ -e "/dev/dri/renderD128" ]; then
  msg_info "Configuring Hardware Acceleration (VA-API /dev/dri)"
  pct set "$CTID" -dev0 /dev/dri/renderD128,mode=0666
  if [ -e "/dev/dri/card0" ]; then
    pct set "$CTID" -dev1 /dev/dri/card0,mode=0666
  elif [ -e "/dev/dri/card1" ]; then
    pct set "$CTID" -dev1 /dev/dri/card1,mode=0666
  fi
  msg_ok "Configured Hardware Acceleration"
fi

if [ -e "/dev/nvidiactl" ]; then
  msg_info "Configuring Hardware Acceleration (NVIDIA GPU)"
  pct set "$CTID" -dev2 /dev/nvidia0,mode=0666 2>/dev/null || true
  pct set "$CTID" -dev3 /dev/nvidiactl,mode=0666 2>/dev/null || true
  pct set "$CTID" -dev4 /dev/nvidia-uvm,mode=0666 2>/dev/null || true
  msg_ok "Configured NVIDIA GPU Passthrough"
fi

description

msg_ok "Completed successfully!\n"
echo -e "${CREATING}${GN}${APP} setup has been successfully initialized!${CL}"
echo -e "${INFO}${YW}Access it using the following URL:${CL}"
echo -e "${GATEWAY}${BGN}http://${IP}:3000${CL}"

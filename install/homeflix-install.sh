#!/usr/bin/env bash

# Copyright (c) 2021-2026 community-scripts ORG
# Author: Eckobrew
# License: MIT | https://github.com/community-scripts/ProxmoxVE/raw/main/LICENSE
# Source: https://github.com/Eckobrew/HomeFlix

source /dev/stdin <<<"$FUNCTIONS_FILE_PATH"
color
verb_ip6
catch_errors
setting_up_container
network_check
update_os

msg_info "Installing Dependencies"
$STD apt install -y \
  curl \
  sudo \
  git \
  jq \
  build-essential
msg_ok "Installed Dependencies"

NODE_VERSION="20" setup_nodejs

msg_info "Installing HomeFlix (Patience)"
$STD git clone https://github.com/Eckobrew/HomeFlix.git /opt/homeflix
cd /opt/homeflix
$STD npm install
export NEXT_TELEMETRY_DISABLED=1
export NODE_ENV=production
$STD npm run build

if [[ ! -f /opt/homeflix/.env ]]; then
  cp /opt/homeflix/.env.example /opt/homeflix/.env
fi
chmod 600 /opt/homeflix/.env
msg_ok "Installed HomeFlix"

msg_info "Creating Service"
cat <<EOF >/etc/systemd/system/homeflix.service
[Unit]
Description=HomeFlix Streaming Companion
After=network.target
StartLimitIntervalSec=0

[Service]
Type=simple
Restart=always
RestartSec=3
User=root
WorkingDirectory=/opt/homeflix
EnvironmentFile=-/opt/homeflix/.env
Environment=NODE_ENV=production
Environment=PORT=3000
Environment=NEXT_TELEMETRY_DISABLED=1
ExecStart=/opt/homeflix/node_modules/.bin/next start

[Install]
WantedBy=multi-user.target
EOF

systemctl enable -q --now homeflix
msg_ok "Created Service"

motd_ssh
customize
cleanup_lxc

#!/usr/bin/env bash
# HomeFlix Proxmox VE LXC Helper Script (community-scripts.org format)
# https://github.com/Eckobrew/HomeFlix

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" 2>/dev/null && pwd)"
if [[ -f "${SCRIPT_DIR}/../ct/homeflix.sh" ]]; then
  exec bash "${SCRIPT_DIR}/../ct/homeflix.sh" "$@"
else
  exec bash -c "$(curl -fsSL https://raw.githubusercontent.com/Eckobrew/HomeFlix/main/ct/homeflix.sh)" "$@"
fi

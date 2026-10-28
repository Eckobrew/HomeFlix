#!/usr/bin/env bash

# ==============================================================================
# HomeFlix Proxmox VE LXC Installer & Deployment Script
# ==============================================================================
# Installs HomeFlix either:
# 1) Directly on Proxmox VE Host (automatically creates a dedicated Debian LXC)
# 2) Inside an existing LXC container / Debian / Ubuntu machine
# ==============================================================================

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

echo -e "${RED}"
cat << "EOF"
  _    _                          ______ _ _      
 | |  | |                        |  ____| (_)     
 | |__| | ___  _ __ ___   ___    | |__  | |___  __
 |  __  |/ _ \| '_ ` _ \ / _ \   |  __| | | \ \/ /
 | |  | | (_) | | | | | |  __/   | |    | | |>  < 
 |_|  |_|\___/|_| |_| |_|\___|   |_|    |_|_/_/\_\
EOF
echo -e "${NC}"
echo -e "${CYAN}=== HomeFlix - Netflix Clone for Jellyfin & Seerr ===${NC}\n"

# Function to detect if running on Proxmox VE host
is_pve() {
  if [ -f "/etc/pve/pve-root-ca.pem" ] || command -v pveversion >/dev/null 2>&1; then
    return 0
  else
    return 1
  fi
}

# ------------------------------------------------------------------------------
# Mode A: Running on Proxmox VE Host
# ------------------------------------------------------------------------------
if is_pve; then
  echo -e "${GREEN}[INFO] Detected Proxmox VE Host!${NC}"
  echo -e "This wizard will create a lightweight Debian 12 LXC container for HomeFlix.\n"

  # Find next available CTID
  NEXT_ID=$(pvesh get /cluster/nextid 2>/dev/null || echo "110")
  read -r -p "Enter Container ID [Default: $NEXT_ID]: " CT_ID
  CT_ID=${CT_ID:-$NEXT_ID}

  read -r -p "Enter Container Hostname [Default: homeflix]: " CT_NAME
  CT_NAME=${CT_NAME:-homeflix}

  read -r -p "Enter Disk Size in GB [Default: 8]: " CT_DISK
  CT_DISK=${CT_DISK:-8}

  read -r -p "Enter RAM in MB [Default: 1024]: " CT_RAM
  CT_RAM=${CT_RAM:-1024}

  read -r -p "Enter CPU Cores [Default: 1]: " CT_CORES
  CT_CORES=${CT_CORES:-1}

  # Storage for Container Rootfs / Disks (supports 'rootdir')
  DEFAULT_ROOT_STORAGE=$(pvesm status -content rootdir 2>/dev/null | awk 'NR>1 {print $1}' | grep -v "Plugin" | head -n 1)
  DEFAULT_ROOT_STORAGE=${DEFAULT_ROOT_STORAGE:-local-lvm}
  read -r -p "Enter Target Storage for Container Disk [Default: $DEFAULT_ROOT_STORAGE]: " TARGET_STORAGE
  TARGET_STORAGE=${TARGET_STORAGE:-$DEFAULT_ROOT_STORAGE}

  # Storage for OS Templates (must support 'vztmpl', usually 'local')
  DEFAULT_TMPL_STORAGE=$(pvesm status -content vztmpl 2>/dev/null | awk 'NR>1 {print $1}' | grep -v "Plugin" | head -n 1)
  DEFAULT_TMPL_STORAGE=${DEFAULT_TMPL_STORAGE:-local}
  read -r -p "Enter Template Storage [Default: $DEFAULT_TMPL_STORAGE]: " TMPL_STORAGE
  TMPL_STORAGE=${TMPL_STORAGE:-$DEFAULT_TMPL_STORAGE}

  echo -e "\n${YELLOW}[1/4] Checking Debian 12 container template...${NC}"
  pveam update 2>/dev/null || true
  TEMPLATE=$(pveam available -section system 2>/dev/null | grep "debian-12-standard" | tail -n 1 | awk '{print $2}')
  if [ -z "$TEMPLATE" ]; then
    TEMPLATE="debian-12-standard_12.12-1_amd64.tar.zst"
  fi
  
  if ! pveam list "$TMPL_STORAGE" 2>/dev/null | grep -q "debian-12"; then
    echo "Downloading template $TEMPLATE to storage '$TMPL_STORAGE'..."
    pveam download "$TMPL_STORAGE" "$TEMPLATE"
  else
    echo "Debian 12 template already present on '$TMPL_STORAGE'."
  fi
  TEMPLATE_PATH=$(pveam list "$TMPL_STORAGE" 2>/dev/null | grep "debian-12" | tail -n 1 | awk '{print $1}')

  echo -e "\n${YELLOW}[2/4] Creating LXC Container (ID: $CT_ID, Name: $CT_NAME)...${NC}"
  pct create "$CT_ID" "$TEMPLATE_PATH" \
    --ostype debian \
    --hostname "$CT_NAME" \
    --cores "$CT_CORES" \
    --memory "$CT_RAM" \
    --swap 512 \
    --rootfs "${TARGET_STORAGE}:${CT_DISK}" \
    --net0 name=eth0,bridge=vmbr0,ip=dhcp,type=veth \
    --features nesting=1,keyctl=1 \
    --unprivileged 1 \
    --onboot 1

  echo -e "\n${YELLOW}[3/4] Starting Container and provisioning environment...${NC}"
  pct start "$CT_ID"
  
  echo "Waiting for container network to be ready..."
  for i in {1..20}; do
    if pct exec "$CT_ID" -- ping -c 1 -W 1 1.1.1.1 >/dev/null 2>&1; then
      break
    fi
    sleep 1
  done

  # Run package installation inside container
  pct exec "$CT_ID" -- bash -c "export DEBIAN_FRONTEND=noninteractive && apt-get update && apt-get install -y curl git sudo ca-certificates"
  
  # Install Docker inside LXC
  pct exec "$CT_ID" -- bash -c "curl -fsSL https://get.docker.com | sh"
  
  # Clone HomeFlix
  pct exec "$CT_ID" -- bash -c "mkdir -p /opt/homeflix"
  pct exec "$CT_ID" -- bash -c "git clone https://github.com/Eckobrew/HomeFlix.git /opt/homeflix || (cd /opt/homeflix && git pull)"
  
  # Setup docker compose service
  pct exec "$CT_ID" -- bash -c "cd /opt/homeflix && cp -n .env.example .env || true"
  pct exec "$CT_ID" -- bash -c "cd /opt/homeflix && docker compose up -d"

  IP_ADDR=$(pct exec "$CT_ID" -- ip -4 addr show eth0 | grep -oP '(?<=inet\s)\d+(\.\d+){3}' | head -n 1 || echo "container-ip")

  echo -e "\n${GREEN}================================================================${NC}"
  echo -e "${GREEN}🎉 HomeFlix successfully deployed in Proxmox LXC container $CT_ID!${NC}"
  echo -e "${GREEN}================================================================${NC}"
  echo -e "Access HomeFlix Web UI at: ${CYAN}http://${IP_ADDR}:3000${NC}"
  echo -e "Configure your Jellyfin & Seerr server URLs in the web settings dialog (⚙️)."
  exit 0
fi

# ------------------------------------------------------------------------------
# Mode B: Running Inside Existing LXC Container or Linux Machine
# ------------------------------------------------------------------------------
echo -e "${GREEN}[INFO] Installing HomeFlix in the current environment...${NC}"

if [ "$EUID" -ne 0 ]; then
  echo -e "${RED}[ERROR] Please run as root (or with sudo).${NC}"
  exit 1
fi

echo -e "\n${YELLOW}[1/3] Checking prerequisites...${NC}"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y curl git ca-certificates gnupg

if ! command -v docker >/dev/null 2>&1; then
  echo -e "${YELLOW}Installing Docker...${NC}"
  curl -fsSL https://get.docker.com | sh
fi

echo -e "\n${YELLOW}[2/3] Setting up HomeFlix...${NC}"
INSTALL_DIR="/opt/homeflix"
mkdir -p "$INSTALL_DIR"

if [ -f "docker-compose.yml" ]; then
  cp -r ./* "$INSTALL_DIR/"
else
  git clone https://github.com/Eckobrew/HomeFlix.git "$INSTALL_DIR" || (cd "$INSTALL_DIR" && git pull)
fi

cd "$INSTALL_DIR"
if [ ! -f .env ]; then
  cp .env.example .env
fi

echo -e "\n${YELLOW}[3/3] Starting HomeFlix with Docker Compose...${NC}"
docker compose up -d

LOCAL_IP=$(hostname -I | awk '{print $1}' || echo "localhost")

echo -e "\n${GREEN}================================================================${NC}"
echo -e "${GREEN}🎉 HomeFlix is up and running!${NC}"
echo -e "${GREEN}================================================================${NC}"
echo -e "Web Interface: ${CYAN}http://${LOCAL_IP}:3000${NC}"
echo -e "To configure settings, open the web interface and click the Settings icon."
echo -e "To edit server details manually: nano ${INSTALL_DIR}/.env && docker compose restart"

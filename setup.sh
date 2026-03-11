#!/bin/bash
# =============================================================================
# ANDROID DEVICE FARM - SETUP SCRIPT
# Ubuntu 22.04 LTS ARM64 — Full Installation
# Autor: AI Architect | Versão: 1.0.0
# =============================================================================

set -euo pipefail
IFS=$'\n\t'

# ─── CORES E FORMATAÇÃO ──────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # No Color

# ─── CONFIGURAÇÕES GLOBAIS ───────────────────────────────────────────────────
FARM_BASE_DIR="/opt/android-farm"
SDK_DIR="$FARM_BASE_DIR/sdk"
AVD_HOME="$FARM_BASE_DIR/avds"
TOOLS_DIR="$FARM_BASE_DIR/tools"
LOGS_DIR="$FARM_BASE_DIR/logs"
APP_DIR="/home/root/webapp"

ANDROID_SDK_VERSION="11076708_latest"  # cmdline-tools versão mais recente
ANDROID_API_LEVEL="33"                  # Android 13 (Tiramisu)
SYSTEM_IMAGE="system-images;android-${ANDROID_API_LEVEL};google_apis_playstore;arm64-v8a"
BUILD_TOOLS_VERSION="33.0.2"
PLATFORM_VERSION="android-${ANDROID_API_LEVEL}"

NODE_VERSION="20"
JAVA_VERSION="17"

LOG_FILE="$LOGS_DIR/setup-$(date +%Y%m%d-%H%M%S).log"

# ─── FUNÇÕES UTILITÁRIAS ─────────────────────────────────────────────────────
log()     { echo -e "${GREEN}[✔]${NC} $*" | tee -a "$LOG_FILE"; }
warn()    { echo -e "${YELLOW}[⚠]${NC} $*" | tee -a "$LOG_FILE"; }
error()   { echo -e "${RED}[✘]${NC} $*" | tee -a "$LOG_FILE"; }
info()    { echo -e "${CYAN}[ℹ]${NC} $*" | tee -a "$LOG_FILE"; }
section() { echo -e "\n${BOLD}${BLUE}══════════════════════════════════════════${NC}"; \
            echo -e "${BOLD}${BLUE}  $*${NC}"; \
            echo -e "${BOLD}${BLUE}══════════════════════════════════════════${NC}\n" | tee -a "$LOG_FILE"; }

check_root() {
    if [[ $EUID -ne 0 ]]; then
        error "Este script precisa ser executado como root (sudo)."
        exit 1
    fi
}

check_arch() {
    local arch
    arch=$(uname -m)
    if [[ "$arch" != "aarch64" ]]; then
        warn "Arquitetura detectada: $arch. Este script é otimizado para ARM64 (aarch64)."
        read -rp "Deseja continuar mesmo assim? [y/N]: " resp
        [[ "$resp" =~ ^[Yy]$ ]] || exit 1
    else
        log "Arquitetura ARM64 confirmada: $arch"
    fi
}

check_kvm() {
    if [[ -e /dev/kvm ]]; then
        log "KVM disponível: /dev/kvm detectado."
        chmod 660 /dev/kvm || true
        # Adiciona o usuário ao grupo kvm
        usermod -aG kvm "${SUDO_USER:-root}" 2>/dev/null || true
    else
        warn "KVM NÃO detectado. Os emuladores vão rodar mais lentos sem aceleração por hardware."
        warn "Verifique se a virtualização aninhada está habilitada no hypervisor host."
    fi
}

spinner() {
    local pid=$1
    local msg=$2
    local spin='⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏'
    local i=0
    while kill -0 "$pid" 2>/dev/null; do
        printf "\r${CYAN}[%s]${NC} %s..." "${spin:$i:1}" "$msg"
        i=$(( (i+1) % ${#spin} ))
        sleep 0.1
    done
    printf "\r${GREEN}[✔]${NC} %s        \n" "$msg"
}

# ─── INÍCIO ──────────────────────────────────────────────────────────────────
clear
echo -e "${BOLD}${BLUE}"
cat << 'BANNER'
  _____             _         _     _   _____
 |  __ \           (_)       (_)   | | |  __ \
 | |  | | _____   ___  ___ ___  __| | | |  | | _____   __
 | |  | |/ _ \ \ / / |/ __/ _ \/ _` | | |  | |/ _ \ \ / /
 | |__| |  __/\ V /| | (_|  __/ (_| | | |__| |  __/\ V /
 |_____/ \___| \_/ |_|\___\___|\__,_| |_____/ \___| \_/

          Android Device Farm — Setup ARM64
          Ubuntu 22.04 LTS | API 33 | KVM
BANNER
echo -e "${NC}"

# Cria diretório de logs ANTES de qualquer operação que grave no log
mkdir -p "$LOGS_DIR"

check_root
check_arch

section "FASE 1: Preparação do Sistema"

# ── 1.1 Atualização do sistema ────────────────────────────────────────────────
info "Atualizando listas de pacotes e sistema..."
apt-get update -y >> "$LOG_FILE" 2>&1 &
spinner $! "apt-get update"

DEBIAN_FRONTEND=noninteractive apt-get upgrade -y >> "$LOG_FILE" 2>&1 &
spinner $! "apt-get upgrade"

# ── 1.2 Dependências essenciais ────────────────────────────────────────────────
info "Instalando dependências essenciais do sistema..."
DEBIAN_FRONTEND=noninteractive apt-get install -y \
    curl wget git unzip zip \
    software-properties-common \
    apt-transport-https \
    ca-certificates \
    gnupg lsb-release \
    build-essential \
    pkg-config \
    libssl-dev \
    ufw \
    htop \
    net-tools \
    socat \
    telnet \
    screen \
    tmux \
    xvfb \
    >> "$LOG_FILE" 2>&1 &
spinner $! "Dependências base"

log "Dependências essenciais instaladas."

section "FASE 2: Java (OpenJDK ${JAVA_VERSION})"

# ── 2.1 Instalar Java ─────────────────────────────────────────────────────────
if java -version 2>/dev/null | grep -q "17\|11"; then
    warn "Java já instalado. Pulando..."
else
    DEBIAN_FRONTEND=noninteractive apt-get install -y \
        "openjdk-${JAVA_VERSION}-jdk" \
        "openjdk-${JAVA_VERSION}-jre" \
        >> "$LOG_FILE" 2>&1 &
    spinner $! "OpenJDK $JAVA_VERSION"
fi

JAVA_HOME_PATH=$(dirname $(dirname $(readlink -f $(which java))))
log "Java instalado: $(java -version 2>&1 | head -1)"
log "JAVA_HOME detectado: $JAVA_HOME_PATH"

section "FASE 3: Node.js ${NODE_VERSION} + PM2"

# ── 3.1 Instalar Node.js via NodeSource ────────────────────────────────────────
if command -v node &>/dev/null && node --version | grep -q "^v${NODE_VERSION}"; then
    warn "Node.js $NODE_VERSION já instalado. Pulando..."
else
    curl -fsSL "https://deb.nodesource.com/setup_${NODE_VERSION}.x" | bash - >> "$LOG_FILE" 2>&1 &
    spinner $! "NodeSource repo setup"

    DEBIAN_FRONTEND=noninteractive apt-get install -y nodejs >> "$LOG_FILE" 2>&1 &
    spinner $! "Node.js $NODE_VERSION"
fi

log "Node.js: $(node --version)"
log "npm: $(npm --version)"

# ── 3.2 Instalar PM2 e ferramentas Node globais ────────────────────────────────
npm install -g pm2 >> "$LOG_FILE" 2>&1 &
spinner $! "PM2 (Process Manager)"

log "PM2 instalado: $(pm2 --version)"

section "FASE 4: QEMU / KVM e Ferramentas de Virtualização"

# ── 4.1 QEMU + KVM ────────────────────────────────────────────────────────────
info "Instalando QEMU/KVM e ferramentas de virtualização..."
DEBIAN_FRONTEND=noninteractive apt-get install -y \
    qemu-kvm \
    qemu-utils \
    qemu-system-aarch64 \
    libvirt-daemon-system \
    libvirt-clients \
    bridge-utils \
    virtinst \
    cpu-checker \
    >> "$LOG_FILE" 2>&1 &
spinner $! "QEMU/KVM stack"

# Verifica suporte KVM
check_kvm

log "QEMU instalado: $(qemu-system-aarch64 --version | head -1)"

section "FASE 5: Android SDK (Command Line Tools)"

# ── 5.1 Criar estrutura de diretórios ─────────────────────────────────────────
info "Criando estrutura de diretórios do Android Farm..."
mkdir -p "$SDK_DIR/cmdline-tools"
mkdir -p "$AVD_HOME"
mkdir -p "$TOOLS_DIR"
mkdir -p "$FARM_BASE_DIR/instances"
mkdir -p "$FARM_BASE_DIR/profiles"
mkdir -p "$FARM_BASE_DIR/backups"
chmod -R 755 "$FARM_BASE_DIR"

# ── 5.2 Baixar Android Command Line Tools ─────────────────────────────────────
CMDLINE_TOOLS_URL="https://dl.google.com/android/repository/commandlinetools-linux-${ANDROID_SDK_VERSION}.zip"
CMDLINE_TOOLS_ZIP="/tmp/cmdline-tools.zip"

if [[ -f "$SDK_DIR/cmdline-tools/latest/bin/sdkmanager" ]]; then
    warn "Android SDK cmdline-tools já instalados. Pulando download..."
else
    info "Baixando Android Command Line Tools..."
    info "URL: $CMDLINE_TOOLS_URL"

    wget -q --show-progress \
        --progress=bar:force:noscroll \
        -O "$CMDLINE_TOOLS_ZIP" \
        "$CMDLINE_TOOLS_URL" 2>&1 | tee -a "$LOG_FILE" &
    spinner $! "Download Android cmdline-tools"

    info "Extraindo cmdline-tools..."
    unzip -q "$CMDLINE_TOOLS_ZIP" -d "/tmp/cmdline-extract" >> "$LOG_FILE" 2>&1

    # Move para a estrutura correta exigida pelo SDK
    mv "/tmp/cmdline-extract/cmdline-tools" "$SDK_DIR/cmdline-tools/latest"
    rm -f "$CMDLINE_TOOLS_ZIP"
    rm -rf "/tmp/cmdline-extract"

    log "Android cmdline-tools instalados em: $SDK_DIR/cmdline-tools/latest"
fi

# ── 5.3 Configurar variáveis de ambiente globais ──────────────────────────────
info "Configurando variáveis de ambiente do Android SDK..."
cat > /etc/profile.d/android-farm.sh << ENVEOF
# Android Device Farm — Environment Variables
export ANDROID_SDK_ROOT="$SDK_DIR"
export ANDROID_HOME="$SDK_DIR"
export ANDROID_AVD_HOME="$AVD_HOME"
export JAVA_HOME="$JAVA_HOME_PATH"
export PATH="\$PATH:\$ANDROID_SDK_ROOT/cmdline-tools/latest/bin"
export PATH="\$PATH:\$ANDROID_SDK_ROOT/emulator"
export PATH="\$PATH:\$ANDROID_SDK_ROOT/platform-tools"
export PATH="\$PATH:\$ANDROID_SDK_ROOT/build-tools/$BUILD_TOOLS_VERSION"
export FARM_BASE_DIR="$FARM_BASE_DIR"
ENVEOF

chmod +x /etc/profile.d/android-farm.sh
source /etc/profile.d/android-farm.sh

export ANDROID_SDK_ROOT="$SDK_DIR"
export ANDROID_HOME="$SDK_DIR"
export ANDROID_AVD_HOME="$AVD_HOME"
export PATH="$PATH:$SDK_DIR/cmdline-tools/latest/bin:$SDK_DIR/emulator:$SDK_DIR/platform-tools"

log "Variáveis de ambiente configuradas."

# ── 5.4 Aceitar licenças do SDK automaticamente ───────────────────────────────
info "Aceitando licenças do Android SDK..."
yes | sdkmanager --sdk_root="$SDK_DIR" --licenses >> "$LOG_FILE" 2>&1 || true
log "Licenças aceitas."

section "FASE 6: Instalando Componentes do Android SDK"

# ── 6.1 Platform Tools, Build Tools e Emulator ────────────────────────────────
info "Instalando platform-tools, build-tools e emulator..."
sdkmanager --sdk_root="$SDK_DIR" \
    "platform-tools" \
    "platforms;$PLATFORM_VERSION" \
    "build-tools;$BUILD_TOOLS_VERSION" \
    "emulator" \
    >> "$LOG_FILE" 2>&1 &
spinner $! "SDK core components"

log "Componentes core do SDK instalados."

# ── 6.2 Imagem do Sistema Android (Play Store + ARM64) ────────────────────────
info "Baixando imagem do Android $ANDROID_API_LEVEL com Google Play Store (ARM64)..."
warn "⚠  Este passo pode levar vários minutos dependendo da sua conexão..."
info "Imagem: $SYSTEM_IMAGE"

sdkmanager --sdk_root="$SDK_DIR" \
    "$SYSTEM_IMAGE" \
    >> "$LOG_FILE" 2>&1 &
spinner $! "Android $ANDROID_API_LEVEL (Google Play Store + ARM64)"

log "Imagem do sistema Android instalada: $SYSTEM_IMAGE"

section "FASE 7: Dependências do Backend (Node.js)"

# ── 7.1 Instalar dependências Node do backend ─────────────────────────────────
BACKEND_DIR="$APP_DIR/backend"

cat > "$BACKEND_DIR/package.json" << 'PKGJSON'
{
  "name": "android-farm-backend",
  "version": "1.0.0",
  "description": "Android Device Farm - Backend API",
  "main": "src/server.js",
  "scripts": {
    "start": "node src/server.js",
    "dev": "nodemon src/server.js",
    "lint": "eslint src/"
  },
  "dependencies": {
    "express": "^4.18.2",
    "express-async-handler": "^1.2.0",
    "cors": "^2.8.5",
    "helmet": "^7.1.0",
    "morgan": "^1.10.0",
    "ws": "^8.16.0",
    "socket.io": "^4.7.2",
    "uuid": "^9.0.0",
    "dotenv": "^16.4.1",
    "joi": "^17.12.0",
    "winston": "^3.11.0",
    "node-schedule": "^2.1.1",
    "systeminformation": "^5.21.20",
    "node-pty": "^1.0.0",
    "ssh2": "^1.15.0"
  },
  "devDependencies": {
    "nodemon": "^3.0.3",
    "eslint": "^8.56.0"
  }
}
PKGJSON

cd "$BACKEND_DIR" && npm install >> "$LOG_FILE" 2>&1 &
spinner $! "npm install (backend)"

cd "$APP_DIR"
log "Dependências do backend instaladas."

section "FASE 8: Dependências do Frontend (React + Vite)"

# ── 8.1 Criar e instalar dependências do frontend ─────────────────────────────
FRONTEND_DIR="$APP_DIR/frontend"

cat > "$FRONTEND_DIR/package.json" << 'PKGJSON'
{
  "name": "android-farm-frontend",
  "version": "1.0.0",
  "description": "Android Device Farm - Web Dashboard",
  "scripts": {
    "dev": "vite --host 0.0.0.0 --port 5173",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "react-router-dom": "^6.22.0",
    "socket.io-client": "^4.7.2",
    "axios": "^1.6.7",
    "zustand": "^4.5.0",
    "react-query": "^3.39.3",
    "@tanstack/react-query": "^5.20.5",
    "framer-motion": "^11.0.3",
    "lucide-react": "^0.323.0",
    "recharts": "^2.12.0",
    "react-hot-toast": "^2.4.1",
    "clsx": "^2.1.0",
    "tailwind-merge": "^2.2.1"
  },
  "devDependencies": {
    "@types/react": "^18.2.55",
    "@types/react-dom": "^18.2.19",
    "@vitejs/plugin-react": "^4.2.1",
    "vite": "^5.1.1",
    "tailwindcss": "^3.4.1",
    "postcss": "^8.4.35",
    "autoprefixer": "^10.4.17"
  }
}
PKGJSON

cd "$FRONTEND_DIR" && npm install >> "$LOG_FILE" 2>&1 &
spinner $! "npm install (frontend)"

cd "$APP_DIR"
log "Dependências do frontend instaladas."

section "FASE 9: Configuração de Firewall (UFW)"

# ── 9.1 Configurar regras de firewall ─────────────────────────────────────────
info "Configurando firewall UFW..."
ufw --force reset >> "$LOG_FILE" 2>&1
ufw default deny incoming >> "$LOG_FILE" 2>&1
ufw default allow outgoing >> "$LOG_FILE" 2>&1
ufw allow ssh >> "$LOG_FILE" 2>&1
ufw allow 3001/tcp comment 'Android Farm Backend API' >> "$LOG_FILE" 2>&1
ufw allow 5173/tcp comment 'Android Farm Frontend Dev' >> "$LOG_FILE" 2>&1
ufw allow 8080/tcp comment 'Android Farm Frontend Prod' >> "$LOG_FILE" 2>&1
# Portas dos emuladores (5554-5600 para até 24 instâncias)
ufw allow 5554:5600/tcp comment 'Android Emulators Console' >> "$LOG_FILE" 2>&1
# ws-scrcpy ports
ufw allow 8886:8910/tcp comment 'ws-scrcpy WebSocket Ports' >> "$LOG_FILE" 2>&1
ufw --force enable >> "$LOG_FILE" 2>&1

log "Firewall UFW configurado."

section "FASE 10: Configuração do Android SDK Verification"

# ── 10.1 Verificar instalação ─────────────────────────────────────────────────
info "Verificando instalação do Android SDK..."

source /etc/profile.d/android-farm.sh

SDKMANAGER="$SDK_DIR/cmdline-tools/latest/bin/sdkmanager"
AVDMANAGER="$SDK_DIR/cmdline-tools/latest/bin/avdmanager"
EMULATOR="$SDK_DIR/emulator/emulator"
ADB="$SDK_DIR/platform-tools/adb"

echo ""
info "=== Status dos Componentes ==="
[[ -f "$SDKMANAGER" ]]   && log "sdkmanager:  OK ($SDKMANAGER)"   || warn "sdkmanager:  NÃO ENCONTRADO"
[[ -f "$AVDMANAGER" ]]   && log "avdmanager:  OK ($AVDMANAGER)"   || warn "avdmanager:  NÃO ENCONTRADO"
[[ -f "$EMULATOR" ]]     && log "emulator:    OK ($EMULATOR)"     || warn "emulator:    NÃO ENCONTRADO"
[[ -f "$ADB" ]]          && log "adb:         OK ($ADB)"          || warn "adb:         NÃO ENCONTRADO"

info "=== Imagens Instaladas ==="
"$SDKMANAGER" --sdk_root="$SDK_DIR" --list_installed 2>/dev/null | grep "system-images" | tee -a "$LOG_FILE" || true

section "FASE 11: Criar AVD de Teste (Template Base)"

# ── 11.1 Criar um AVD template para validação ─────────────────────────────────
info "Criando AVD template 'farm_template_api33'..."

echo "no" | "$AVDMANAGER" \
    --silent create avd \
    --name "farm_template_api33" \
    --package "$SYSTEM_IMAGE" \
    --device "pixel_6" \
    --force \
    >> "$LOG_FILE" 2>&1 && \
    log "AVD template criado com sucesso." || \
    warn "Falha ao criar AVD template. Verifique os logs."

section "CONCLUÍDO!"

echo -e "${BOLD}${GREEN}"
cat << 'DONE'
  ╔══════════════════════════════════════════════════╗
  ║   INSTALAÇÃO CONCLUÍDA COM SUCESSO!              ║
  ║                                                  ║
  ║   Android Device Farm está pronto para uso.      ║
  ╚══════════════════════════════════════════════════╝
DONE
echo -e "${NC}"

info "Próximos passos:"
echo -e "  ${CYAN}1.${NC} source /etc/profile.d/android-farm.sh"
echo -e "  ${CYAN}2.${NC} cd $APP_DIR/backend  && npm start"
echo -e "  ${CYAN}3.${NC} cd $APP_DIR/frontend && npm run dev"
echo -e ""
info "Log completo disponível em: $LOG_FILE"
info "SDK Android instalado em:   $SDK_DIR"
info "AVDs armazenados em:        $AVD_HOME"

echo ""
warn "Reinicie a sessão (logout/login) para aplicar as variáveis de ambiente!"
echo ""

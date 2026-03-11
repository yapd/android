#!/bin/bash
# /opt/android-farm/startup.sh
# Auto-start script for Android Device Farm
# Runs on boot via systemd android-farm.service
# 
# Order:
#   1. Load kernel modules (binder_linux)
#   2. Mount binderfs
#   3. Start Docker (if not running)
#   4. Start PM2 (android-farm-api)
#   5. Restore previously running instances

set -e

LOG=/var/log/android-farm-startup.log
ADB=/opt/android-farm/sdk/platform-tools/adb

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG"; }

log "=== Android Farm Startup ==="

# ── 1. Kernel modules ─────────────────────────────────────────────────────────
log "[1] Carregando módulos do kernel..."
modprobe binder_linux 2>/dev/null  && log "  binder_linux OK" || log "  binder_linux falhou (pode já estar carregado)"
modprobe ashmem_linux 2>/dev/null  || true

# ── 2. Mount binderfs ─────────────────────────────────────────────────────────
log "[2] Montando binderfs..."
mkdir -p /dev/binderfs
if ! mount | grep -q '/dev/binderfs'; then
    mount -t binder binder /dev/binderfs && log "  binderfs montado" || log "  binderfs falhou"
else
    log "  binderfs já montado"
fi

# ── 3. Docker ─────────────────────────────────────────────────────────────────
log "[3] Verificando Docker..."
if ! systemctl is-active --quiet docker; then
    systemctl start docker
    sleep 3
fi
log "  Docker: $(docker --version 2>/dev/null | head -1)"

# Pull Redroid image if not present
if ! docker image inspect redroid/redroid:13.0.0-latest >/dev/null 2>&1; then
    log "  Baixando imagem Redroid..."
    docker pull redroid/redroid:13.0.0-latest
fi

# ── 4. ADB server ─────────────────────────────────────────────────────────────
log "[4] Iniciando ADB server..."
$ADB kill-server 2>/dev/null || true
sleep 1
$ADB start-server 2>/dev/null
log "  ADB pronto"

# ── 5. PM2 (android-farm-api) ─────────────────────────────────────────────────
log "[5] Iniciando API Node.js com PM2..."
cd /home/root/webapp

# Se pm2 já tem o processo salvo, usa resurrect
if pm2 list 2>/dev/null | grep -q android-farm-api; then
    pm2 restart android-farm-api 2>/dev/null && log "  API reiniciada" || true
else
    # Inicia pela primeira vez
    pm2 start backend/src/server.js \
        --name android-farm-api \
        --log /var/log/android-farm-api.log \
        --error /var/log/android-farm-api-error.log \
        --restart-delay 3000 \
        --max-restarts 10 \
        -- 2>/dev/null && log "  API iniciada"
fi
pm2 save 2>/dev/null || true

# ── 6. ws-scrcpy (remote screen control) ─────────────────────────────────────
log "[6] Iniciando ws-scrcpy na porta 8886..."
if pm2 list 2>/dev/null | grep -q ws-scrcpy; then
    pm2 restart ws-scrcpy 2>/dev/null || true
else
    cd /home/root/webapp
    pm2 start "npx @yume-chan/ws-scrcpy --port 8886" \
        --name ws-scrcpy \
        --log /var/log/ws-scrcpy.log \
        --error /var/log/ws-scrcpy-error.log \
        2>/dev/null && log "  ws-scrcpy iniciado na porta 8886" || log "  ws-scrcpy falhou (instalar com npm install)"
fi
pm2 save 2>/dev/null || true

log "=== Startup concluído ==="
log "API:       http://localhost:3001"
log "scrcpy:    ws://localhost:8886"

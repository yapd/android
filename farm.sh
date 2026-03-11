#!/bin/bash
# =============================================================================
# Script de Gerenciamento do Android Device Farm
# Uso: ./farm.sh [start|stop|restart|status|logs]
# =============================================================================
set -euo pipefail

APP_DIR="/home/root/webapp"
FARM_ENV="ANDROID_SDK_ROOT=/opt/android-farm/sdk ANDROID_AVD_HOME=/opt/android-farm/avds FARM_BASE_DIR=/opt/android-farm"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'

case "${1:-status}" in
  start)
    echo -e "${CYAN}[Farm]${NC} Iniciando serviços..."

    # Backend
    cd "$APP_DIR/backend"
    env $FARM_ENV pm2 start src/server.js \
      --name "farm-backend" \
      --env production \
      --restart-delay 3000 \
      --max-restarts 10 2>/dev/null || \
    env $FARM_ENV pm2 restart farm-backend

    # Frontend (production build + preview) ou dev
    cd "$APP_DIR/frontend"
    if [[ -d "dist" ]]; then
      pm2 start "npm" --name "farm-frontend" -- run preview 2>/dev/null || pm2 restart farm-frontend
    else
      pm2 start "npm" --name "farm-frontend" -- run dev 2>/dev/null || pm2 restart farm-frontend
    fi

    pm2 status
    echo -e "${GREEN}[Farm]${NC} Serviços iniciados!"
    echo -e "  Dashboard: ${CYAN}http://localhost:5173${NC}"
    echo -e "  API:       ${CYAN}http://localhost:3001/api/health${NC}"
    ;;

  stop)
    echo -e "${YELLOW}[Farm]${NC} Parando serviços..."
    pm2 stop farm-backend farm-frontend 2>/dev/null || true
    echo -e "${GREEN}[Farm]${NC} Serviços parados."
    ;;

  restart)
    "$0" stop
    sleep 2
    "$0" start
    ;;

  status)
    echo -e "${CYAN}[Farm]${NC} Status dos serviços:"
    pm2 status 2>/dev/null || echo "PM2 não está rodando."

    echo -e "\n${CYAN}[Farm]${NC} Health Check:"
    curl -s http://localhost:3001/api/health 2>/dev/null | python3 -m json.tool 2>/dev/null || echo "Backend offline."
    ;;

  logs)
    SERVICE="${2:-farm-backend}"
    pm2 logs "$SERVICE" --lines 50
    ;;

  build)
    echo -e "${CYAN}[Farm]${NC} Construindo frontend para produção..."
    cd "$APP_DIR/frontend" && npm run build
    echo -e "${GREEN}[Farm]${NC} Build concluído em: $APP_DIR/frontend/dist"
    ;;

  *)
    echo "Uso: $0 [start|stop|restart|status|logs|build]"
    exit 1
    ;;
esac

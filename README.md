# Android Device Farm

> Sistema de Gerenciamento de Emuladores Android para Servidores ARM64
> Ubuntu 22.04 LTS | Android API 33 | Google Play Store | Spoofing + KVM

---

## 🗂️ Estrutura do Projeto

```
android-farm/
├── setup.sh                    ← Script de instalação do servidor (rodar como root)
├── farm.sh                     ← Gerenciador de serviços (start/stop/status)
│
├── backend/                    ← API Node.js + Socket.IO
│   ├── src/
│   │   ├── server.js           ← Ponto de entrada
│   │   ├── controllers/
│   │   │   ├── instanceController.js  ← CRUD + lifecycle de emuladores
│   │   │   ├── profileController.js   ← Perfis de dispositivos
│   │   │   └── systemController.js    ← Métricas do servidor
│   │   ├── services/
│   │   │   ├── avdService.js   ← Motor principal (AVD, spoofing, GPS, bateria, GSM)
│   │   │   └── socketService.js← Eventos em tempo real via Socket.IO
│   │   ├── models/
│   │   │   ├── instanceStore.js← In-memory store de instâncias
│   │   │   └── deviceProfiles.js← Catálogo de dispositivos (Samsung, Xiaomi, Pixel...)
│   │   ├── routes/             ← Rotas Express
│   │   ├── middleware/         ← Error handler
│   │   └── utils/logger.js     ← Winston logger
│   └── .env                    ← Configurações (portas, paths, etc.)
│
├── frontend/                   ← Dashboard React + Vite + Tailwind
│   ├── src/
│   │   ├── App.jsx             ← Roteamento
│   │   ├── pages/
│   │   │   ├── DashboardPage.jsx    ← Métricas + gráficos em tempo real
│   │   │   ├── InstancesPage.jsx    ← Grid de emuladores com CRUD
│   │   │   ├── InstanceDetailPage.jsx← Controle remoto + spoofing
│   │   │   └── SystemPage.jsx       ← Métricas do servidor host
│   │   ├── components/
│   │   │   ├── common/         ← Layout, Sidebar, UI components
│   │   │   └── emulator/       ← InstanceCard, ControlPanel, ScrcpyViewer
│   │   ├── services/api.js     ← Axios client
│   │   └── store/socketStore.js← Zustand + Socket.IO state
│
└── infrastructure/
    ├── avd-profiles/           ← Templates de config.ini por dispositivo
    └── configs/                ← Configurações de produção
```

---

## 🚀 Instalação (Servidor ARM64)

### 1. Instalação Base

```bash
# Clone o repositório ou copie os arquivos para /home/root/webapp
# Execute o script de instalação como root:

sudo bash setup.sh
```

O `setup.sh` irá:
- Atualizar o sistema Ubuntu 22.04
- Instalar Java 17, Node.js 20, QEMU/KVM
- Baixar o Android SDK (cmdline-tools)
- Instalar a imagem `Android 33 + Google Play Store (arm64-v8a)`
- Aceitar todas as licenças automaticamente
- Configurar firewall (UFW)
- Instalar dependências npm do backend e frontend
- Criar um AVD template de validação

### 2. Iniciar os Serviços

```bash
# Desenvolvimento
cd backend  && npm start       # API na porta 3001
cd frontend && npm run dev     # Dashboard na porta 5173

# Produção com PM2
bash farm.sh start

# Status
bash farm.sh status

# Logs
bash farm.sh logs farm-backend
```

---

## 🌐 Acessar o Dashboard

| Serviço   | URL                            |
|-----------|--------------------------------|
| Dashboard | http://SEU_IP:5173             |
| API REST  | http://SEU_IP:3001/api         |
| Health    | http://SEU_IP:3001/api/health  |

---

## 📡 API REST

### Instâncias

| Método   | Endpoint                        | Descrição               |
|----------|---------------------------------|-------------------------|
| GET      | `/api/instances`                | Listar todas            |
| POST     | `/api/instances`                | Criar nova instância    |
| GET      | `/api/instances/:id`            | Detalhes de uma         |
| POST     | `/api/instances/:id/start`      | Iniciar emulador        |
| POST     | `/api/instances/:id/stop`       | Parar emulador          |
| POST     | `/api/instances/:id/reboot`     | Reiniciar               |
| POST     | `/api/instances/:id/wipe`       | Limpar dados (Wipe)     |
| DELETE   | `/api/instances/:id`            | Excluir                 |
| PATCH    | `/api/instances/:id/gps`        | Definir localização GPS |
| PATCH    | `/api/instances/:id/battery`    | Spoofing de bateria     |
| PATCH    | `/api/instances/:id/gsm`        | Spoofing GSM/operadora  |
| POST     | `/api/instances/:id/sms`        | Injetar SMS falso       |

### Criar Instância — Exemplo

```json
POST /api/instances
{
  "name": "Meu Galaxy S23",
  "profileId": "samsung-s23",
  "gpsLat": "-23.5505",
  "gpsLng": "-46.6333",
  "batteryLevel": 85,
  "batteryStatus": "charging",
  "networkOperator": "Claro BR",
  "networkStrength": 4
}
```

### Perfis Disponíveis

```bash
GET /api/profiles
```

| ID             | Dispositivo          |
|----------------|----------------------|
| `samsung-s23`  | Samsung Galaxy S23   |
| `xiaomi-13`    | Xiaomi 13            |
| `pixel-7`      | Google Pixel 7       |
| `motorola-g84` | Motorola Moto G84    |
| `oneplus-11`   | OnePlus 11           |

---

## 🎭 Sistema de Spoofing

### O que é injetado em cada emulador:

| Camada        | O que é alterado                                        |
|---------------|---------------------------------------------------------|
| `config.ini`  | Resolução, DPI, RAM, hardware, fabricante, modelo       |
| `build.prop`  | `ro.product.*`, `ro.build.fingerprint`, `ro.hardware`   |
| Console GSM   | Operadora, força do sinal (via Telnet port)             |
| Console GPS   | Latitude / Longitude em tempo real                      |
| Console Bat.  | Nível e status de carregamento                          |
| SMS           | Injeção de mensagens via console do emulador            |

### ⚠️ Limitações Conhecidas

> Mesmo com todo o spoofing de software:
> - **Play Integrity "Strong"**: Não é possível passar sem chip HSM físico
> - **Apps bancários de alto nível**: Detectam QEMU via canais de hardware
> - **Target**: Passar nos níveis **Basic** e **Device** da Play Integrity API

---

## 📺 Controle Remoto (ws-scrcpy)

Para ativar o "Paper View" (tela remota no browser):

```bash
# Instalar ws-scrcpy
npm install -g @yume-chan/ws-scrcpy

# Iniciar para um emulador específico
ws-scrcpy --port 8886
```

Após iniciar, o Dashboard exibirá automaticamente a tela remota na página de detalhes da instância.

---

## 🔧 Variáveis de Ambiente (.env)

```env
PORT=3001
ANDROID_SDK_ROOT=/opt/android-farm/sdk
ANDROID_AVD_HOME=/opt/android-farm/avds
FARM_BASE_DIR=/opt/android-farm
MAX_INSTANCES=20
EMULATOR_BASE_PORT=5554
WS_SCRCPY_BASE_PORT=8886
```

---

## 📋 Portas Utilizadas

| Porta       | Serviço                          |
|-------------|----------------------------------|
| 3001        | Backend API + Socket.IO          |
| 5173        | Frontend (dev)                   |
| 8080        | Frontend (produção)              |
| 5554-5600   | Consoles dos emuladores (telnet) |
| 8886-8910   | ws-scrcpy WebSocket streams      |

---

*Android Device Farm v1.0.0 — ARM64 Native*

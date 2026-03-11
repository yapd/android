#!/bin/bash
# Setup Redroid (Docker-based Android) on Ubuntu 22.04 ARM64
set -e

echo "=== Redroid Host Setup ==="

# 1. Install Docker
if ! command -v docker &>/dev/null; then
  echo "Installing Docker..."
  curl -fsSL https://get.docker.com | sh
  systemctl enable docker
  systemctl start docker
fi

# 2. Install kernel modules package (provides binder_linux, ashmem_linux)
echo "Installing linux-modules-extra..."
apt-get install -y linux-modules-extra-$(uname -r) 2>/dev/null || \
  apt-get install -y linux-modules-extra-generic

# 3. Load modules
modprobe binder_linux
modprobe ashmem_linux 2>/dev/null || true

# 4. Mount binderfs
mkdir -p /dev/binderfs
mount -t binder binder /dev/binderfs 2>/dev/null || true

# 5. Persist modules on boot
cat > /etc/modules-load.d/redroid.conf << 'MEOF'
binder_linux
ashmem_linux
MEOF

# 6. Persist binderfs mount
if ! grep -q binderfs /etc/fstab 2>/dev/null; then
  echo "binder /dev/binderfs binder defaults 0 0" >> /etc/fstab
fi

# 7. Pull Redroid image
echo "Pulling Redroid Android 13..."
docker pull redroid/redroid:13.0.0-latest

echo ""
echo "=== Redroid setup complete ==="
echo "Test: docker run -d --privileged -v /dev/binderfs:/dev/binderfs -p 5556:5555 redroid/redroid:13.0.0-latest"
echo "ADB:  adb connect 127.0.0.1:5556"

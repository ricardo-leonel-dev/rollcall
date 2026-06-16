#!/bin/bash
set -e

echo ""
echo "╔═══════════════════════════════════════════╗"
echo "║     AI Stack Local — 2 GPUs + Tailscale   ║"
echo "╚═══════════════════════════════════════════╝"
echo ""

# Verificar prerequisitos
echo "► Verificando prerequisitos..."

if ! command -v docker &> /dev/null; then
    echo "✗ Docker no instalado — https://docs.docker.com/engine/install/"
    exit 1
fi

if ! docker compose version &> /dev/null; then
    echo "✗ Docker Compose no disponible"
    exit 1
fi

GPU_COUNT=$(nvidia-smi --query-gpu=name --format=csv,noheader 2>/dev/null | wc -l)
if [ "$GPU_COUNT" -lt 2 ]; then
    echo "✗ Se necesitan 2 GPUs. Detectadas: $GPU_COUNT"
    exit 1
fi

echo "✓ GPUs detectadas: $GPU_COUNT"
nvidia-smi --query-gpu=index,name,memory.total --format=csv,noheader

# Verificar auth key de Tailscale
if [ ! -f ".env" ]; then
    echo ""
    echo "✗ No existe el archivo .env"
    echo "  Crea el archivo .env con tu auth key de Tailscale:"
    echo "  echo 'TS_AUTHKEY=tskey-auth-XXXX' > .env"
    echo ""
    echo "  Genera tu auth key en:"
    echo "  https://login.tailscale.com/admin/settings/keys"
    echo "  (marca Reusable: Yes, Expiration: No expiry)"
    exit 1
fi

if grep -q "XXXXXXXX" .env; then
    echo ""
    echo "✗ Debes reemplazar la auth key de Tailscale en el archivo .env"
    echo "  Genera la tuya en: https://login.tailscale.com/admin/settings/keys"
    exit 1
fi

echo "✓ Archivo .env encontrado"

echo ""
echo "► Levantando contenedores..."
docker compose up -d --build

# Esperar Tailscale
echo ""
echo "► Esperando Tailscale..."
sleep 5
until docker exec tailscale tailscale status > /dev/null 2>&1; do
    echo "  ... conectando a Tailscale"
    sleep 3
done
echo "✓ Tailscale conectado"
echo ""
echo "  Estado de la red Tailscale:"
docker exec tailscale tailscale status

# Esperar ollama-chat
echo ""
echo "► Esperando ollama-chat (GPU 0)..."
until curl -s http://localhost:11434/api/tags > /dev/null 2>&1; do
    echo "  ... esperando"
    sleep 5
done
echo "✓ ollama-chat listo"

# Esperar ollama-vision
echo "► Esperando ollama-vision (GPU 1)..."
until curl -s http://localhost:11435/api/tags > /dev/null 2>&1; do
    echo "  ... esperando"
    sleep 5
done
echo "✓ ollama-vision listo"

# Descargar modelos
echo ""
echo "► Descargando modelos..."

echo "  [GPU 0] qwen2.5:7b — chat general (~4.7GB)..."
docker exec ollama-chat ollama pull qwen2.5:7b
echo "  ✓ qwen2.5:7b listo en GPU 0"

echo ""
echo "  [GPU 1] qwen2.5vl:7b — visión/OCR (~5.5GB)..."
docker exec ollama-vision ollama pull qwen2.5vl:7b
echo "  ✓ qwen2.5vl:7b listo en GPU 1"

# Pre-cargar modelos en VRAM
echo ""
echo "► Pre-cargando modelos en VRAM..."
curl -s -X POST http://localhost:11434/api/generate \
    -d '{"model":"qwen2.5:7b","prompt":"hola","stream":false}' > /dev/null
echo "  ✓ qwen2.5:7b cargado en GPU 0"

curl -s -X POST http://localhost:11435/api/generate \
    -d '{"model":"qwen2.5vl:7b","prompt":"hola","stream":false}' > /dev/null
echo "  ✓ qwen2.5vl:7b cargado en GPU 1"

# Verificar agente OCR
echo ""
echo "► Verificando agente OCR..."
until curl -s http://localhost:8001/health > /dev/null 2>&1; do
    echo "  ... esperando agente OCR"
    sleep 3
done
echo "✓ Agente OCR listo"

# Obtener IP de Tailscale
TAILSCALE_IP=$(docker exec tailscale tailscale ip -4 2>/dev/null | head -1)

echo ""
echo "╔═══════════════════════════════════════════╗"
echo "║           Stack listo                      ║"
echo "╠═══════════════════════════════════════════╣"
echo "║                                            ║"
echo "║  Acceso LOCAL (en casa):                   ║"
echo "║  → http://localhost:3000                   ║"
echo "║                                            ║"
echo "║  Acceso REMOTO (Tailscale):                ║"
echo "║  → http://ai-rig:3000                      ║"
if [ -n "$TAILSCALE_IP" ]; then
echo "║  → http://$TAILSCALE_IP:3000              ║"
fi
echo "║                                            ║"
echo "║  Agente OCR:                               ║"
echo "║  → http://ai-rig:8001  (remoto)            ║"
echo "║  → http://localhost:8001  (local)          ║"
echo "║                                            ║"
echo "╚═══════════════════════════════════════════╝"
echo ""
echo "► Próximos pasos para la familia:"
echo "  1. Instalar Tailscale en cada dispositivo"
echo "     Android/iPhone: buscar 'Tailscale' en la tienda"
echo "     Linux/Mac: curl -fsSL https://tailscale.com/install.sh | sh"
echo "     Windows: https://tailscale.com/download"
echo ""
echo "  2. Iniciar sesión con la misma cuenta de Tailscale"
echo ""
echo "  3. Abrir http://ai-rig:3000 desde cualquier lugar"
echo ""
echo "► Estado de GPUs:"
nvidia-smi --query-gpu=index,name,memory.used,memory.total \
    --format=csv,noheader
echo ""

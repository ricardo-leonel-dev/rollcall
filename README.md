# AI Stack Local — 2 GPUs

Stack completo de AI local sin hot-swap ni esperas:

| GPU | Contenedor | Modelo | Para qué |
|---|---|---|---|
| GPU 0 | ollama-chat | qwen2.5:7b | Chat familiar (Open WebUI) |
| GPU 1 | ollama-vision | qwen2.5vl:7b | OCR escritura a mano → Excel |

Ambos modelos viven permanentemente en VRAM. Cero hot-swap.

---

## Requisitos

- Linux (Ubuntu 20.04+)
- Docker + Docker Compose
- Drivers NVIDIA + nvidia-container-toolkit
- 2x GTX 1660 6GB (o superior) conectadas con risers
- ~15GB espacio en disco para modelos

### Instalar nvidia-container-toolkit (si no lo tienes)

```bash
curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey | \
  sudo gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg

curl -s -L https://nvidia.github.io/libnvidia-container/stable/deb/nvidia-container-toolkit.list | \
  sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g' | \
  sudo tee /etc/apt/sources.list.d/nvidia-container-toolkit.list

sudo apt-get update && sudo apt-get install -y nvidia-container-toolkit
sudo systemctl restart docker
```

### Verificar que Docker ve las GPUs

```bash
docker run --rm --gpus all nvidia/cuda:12.1-base nvidia-smi
# Debe mostrar todas tus GPUs
```

---

## Instalación

```bash
chmod +x setup.sh test-ocr.sh
./setup.sh
```

El setup tarda 10-20 minutos la primera vez (descarga ~10GB de modelos).

---

## Accesos

| Servicio | URL | Para quién |
|---|---|---|
| Open WebUI | http://localhost:3000 | Toda la familia |
| Agente OCR | http://localhost:8001 | API directa |
| Ollama chat (GPU 0) | http://localhost:11434 | Desarrollo |
| Ollama vision (GPU 1) | http://localhost:11435 | Desarrollo |
| PostgreSQL | localhost:5432 | Desarrollo |

### Desde otros dispositivos en la red local

```bash
# Ver IP del rig
ip addr show | grep "inet " | grep -v 127.0.0.1
# Ejemplo: http://192.168.1.100:3000
```

---

## Probar el OCR

```bash
# Con tu propia foto
./test-ocr.sh /ruta/a/foto_asistencia.jpg

# Solo ver JSON extraído (más rápido para debuggear)
curl -X POST http://localhost:8001/procesar/json \
  -F "foto=@foto.jpg"

# Generar Excel directamente
curl -X POST http://localhost:8001/procesar \
  -F "foto=@foto.jpg" \
  -o asistencia.xlsx
```

---

## Configurar Open WebUI para la familia

1. Abre `http://localhost:3000`
2. La primera cuenta que crees será administrador
3. Ve a **Admin Panel → Users** para crear cuentas a la familia
4. Cada persona tiene su propio historial de conversaciones

---

## Comandos útiles

```bash
# Estado de los contenedores
docker compose ps

# Ver uso de VRAM en tiempo real
watch -n 2 nvidia-smi

# Logs de un servicio
docker compose logs -f ollama-chat
docker compose logs -f ollama-vision
docker compose logs -f agente-ocr

# Reiniciar un servicio
docker compose restart agente-ocr

# Apagar todo
docker compose down

# Apagar y borrar datos (cuidado)
docker compose down -v

# Ver modelos descargados por instancia
docker exec ollama-chat ollama list
docker exec ollama-vision ollama list

# Agregar más modelos al chat (GPU 0)
docker exec ollama-chat ollama pull phi4-mini
```

---

## Verificar que cada modelo está en su GPU

```bash
# Después de setup, verificar VRAM usada por GPU
nvidia-smi --query-gpu=index,name,memory.used,memory.total \
  --format=csv,noheader

# Resultado esperado:
# 0, NVIDIA GeForce GTX 1660, 5000 MiB, 6144 MiB  ← qwen2.5:7b
# 1, NVIDIA GeForce GTX 1660, 5500 MiB, 6144 MiB  ← qwen2.5vl:7b
```

---

## Conectar opencode a tu stack local

En tu `opencode.json`:

```json
{
  "providers": {
    "local-chat": {
      "baseURL": "http://localhost:11434/v1",
      "apiKey": "ollama"
    }
  },
  "models": {
    "default": "local-chat/qwen2.5:7b"
  }
}
```

---

## Solución de problemas

**Docker no ve las GPUs por separado:**
```bash
# Verificar IDs de GPU
nvidia-smi -L
# Output: GPU 0: ..., GPU 1: ...
# Esos son los device_ids que van en el compose
```

**qwen2.5vl:7b no cabe en 6GB:**
```bash
# Usar versión cuantizada más ligera
docker exec ollama-vision ollama pull qwen2.5vl:7b-q4_0
# Actualizar VISION_MODEL en docker-compose.yml
```

**Open WebUI no conecta:**
```bash
docker compose restart open-webui
curl http://localhost:11434/api/tags  # debe responder
```

**El OCR da resultados incorrectos:**
- La foto debe tener buena iluminación
- Lista no muy inclinada (menos de 15 grados)
- Usa `/procesar/json` primero para ver qué extrajo el modelo
- Si falla consistentemente, la foto necesita más luz o enfoque

---

## Estructura del proyecto

```
ai-stack/
├── docker-compose.yml     ← 2 Ollamas + WebUI + OCR + Postgres
├── setup.sh               ← instalación completa
├── test-ocr.sh            ← prueba rápida del OCR
├── README.md
├── agente-ocr/
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── main.py            ← API FastAPI del agente OCR
│   └── output/            ← Excels generados aquí
└── postgres/
    └── init.sql           ← tablas iniciales
```

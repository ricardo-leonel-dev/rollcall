#!/bin/bash
# test-ocr.sh — prueba el agente OCR con una imagen

echo ""
echo "► Test del Agente OCR"
echo ""

if [ -z "$1" ]; then
    echo "Uso: ./test-ocr.sh /ruta/a/foto.jpg"
    echo ""
    echo "Ejemplo con imagen de prueba generada..."
    
    # Crear imagen de prueba simple con Python si no se pasa imagen
    python3 - <<'PYEOF'
from PIL import Image, ImageDraw, ImageFont
import os

# Crear imagen de lista de asistencia simulada
img = Image.new('RGB', (600, 700), color='white')
draw = ImageDraw.Draw(img)

contenido = [
    "Lista de Asistencia",
    "Fecha: 04/06/2026",
    "Grupo: Empleados Bodega",
    "",
    "1. Juan Pérez          ✓",
    "2. María González      ✓",
    "3. Carlos Rodríguez    X",
    "4. Ana Martínez        ✓",
    "5. Luis García         T",
    "6. Carmen López        ✓",
    "7. Pedro Sánchez       X",
    "8. Rosa Fernández      ✓",
]

y = 40
for linea in contenido:
    draw.text((40, y), linea, fill='black')
    y += 45

img.save('/tmp/test_asistencia.jpg', 'JPEG', quality=95)
print("✓ Imagen de prueba creada: /tmp/test_asistencia.jpg")
PYEOF
    
    FOTO="/tmp/test_asistencia.jpg"
else
    FOTO="$1"
fi

if [ ! -f "$FOTO" ]; then
    echo "✗ No se encontró el archivo: $FOTO"
    exit 1
fi

echo "► Enviando foto al agente OCR..."
echo "  Archivo: $FOTO"
echo ""

# Probar endpoint JSON primero (más rápido de ver)
echo "► Resultado JSON del modelo:"
curl -s -X POST http://localhost:8001/procesar/json \
    -F "foto=@$FOTO" | python3 -m json.tool

echo ""
echo "► Generando Excel..."
OUTPUT="asistencia_$(date +%Y%m%d_%H%M%S).xlsx"
HTTP_CODE=$(curl -s -o "$OUTPUT" -w "%{http_code}" \
    -X POST http://localhost:8001/procesar \
    -F "foto=@$FOTO")

if [ "$HTTP_CODE" = "200" ]; then
    echo "✓ Excel generado: $OUTPUT"
    echo "  Tamaño: $(du -h $OUTPUT | cut -f1)"
else
    echo "✗ Error al generar Excel (HTTP $HTTP_CODE)"
    cat "$OUTPUT"
    rm -f "$OUTPUT"
fi

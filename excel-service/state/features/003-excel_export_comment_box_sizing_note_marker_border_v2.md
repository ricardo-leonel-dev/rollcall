---
feature_number: 3
name: excel_export_comment_box_sizing_note_marker_border_v2
title: Excel export: comment box sizing + note marker border
status: done
created_at: 2026-08-31T07:22:53.000Z
updated_at: 2026-08-31T08:17:37.000Z
---

## Description
Los comentarios de celda (nota + motivo de justificación) usan la caja VML por defecto de excelize, que es fija y chica, así que texto largo queda visualmente cortado sin autofit. Además no hay forma de saber si una celda F/AT/J tiene nota: el triangulito rojo indicador de comentario es fijo (no configurable) y se camufla contra el fill rojo de las celdas F. Agregar (1) cálculo dinámico de ancho/alto de la caja de comentario según el largo del texto, y (2) un borde diagonal fino doble (de abajo hacia arriba, terminando arriba a la derecha) en celdas F/AT/J que tengan nota, sin tocar el valor de texto de la celda para no romper fórmulas/COUNTIF que dependen de él.

## Acceptance
- [ ] El alto de la caja de comentario escala con el largo del texto de la nota (con mínimo y máximo razonables) para que notas cortas queden compactas y notas largas no se corten sin redimensionar a mano
- [ ] Celdas F/AT/J con nota (de reg.notes y/o justificationReason) reciben un borde diagonal doble adicional (diagonalUp, estilo double) sobre su fill/borde existente, distinguible sin importar el color de fondo
- [ ] Celdas sin nota mantienen su estilo actual sin cambios; el valor de texto de la celda (F/AT/J) no se modifica
- [ ] dedupeCommentShapeIDs sigue funcionando correctamente en hojas con múltiples celdas con nota

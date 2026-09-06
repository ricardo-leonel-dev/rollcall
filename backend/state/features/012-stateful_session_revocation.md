---
feature_number: 12
name: stateful_session_revocation
title: Sesiones con estado para revocar tokens individualmente
status: pending
created_at: 2026-09-05T08:20:22.000Z
updated_at: 2026-09-05T08:20:38.000Z
---

## Description
Hoy el JWT es completamente stateless: POST /api/auth/logout no invalida nada en el servidor (auth.controller.ts no hace más que responder 200) y no existe forma de revocar un token específico antes de su expiración natural (JWT_EXPIRES_IN, 7 días por defecto). Si un token se filtra (robo, dispositivo compartido, sospecha de compromiso), hoy no hay ninguna forma de darlo de baja sin esperar a que expire solo. Se requiere introducir un identificador único por sesión (jti) en el JWT y un registro de esa sesión en Redis (que ya corre en el stack para BullMQ), para poder revocar sesiones individualmente sin tener que invalidar todas las sesiones del usuario a la vez.

## Acceptance
- [ ] Cada JWT emitido en login incluye un jti (UUID v4) único por sesión, ademas del payload actual (id, username, roleId, roleName, institutionId)
- [ ] Al emitir el JWT se crea en Redis un registro session:<jti> con userId, roleId, institutionId, issuedAt, userAgent, ip y lastSeenAt, con TTL igual al tiempo de vida restante del token
- [ ] Se mantiene un Set en Redis user_sessions:<userId> con los jti activos de ese usuario
- [ ] authMiddleware (pasa a ser async) verifica, ademas de firma/expiracion del JWT como hoy, que session:<jti> exista en Redis; si no existe responde 401 igual que un token invalido
- [ ] lastSeenAt se actualiza en Redis con throttling (solo si pasaron mas de 5 minutos desde la ultima actualizacion) para no golpear Redis en cada request
- [ ] POST /api/auth/logout borra unicamente session:<jti> de la sesion actual y la remueve del Set del usuario (hoy no hace nada en el servidor)
- [ ] Nuevo endpoint GET /api/auth/me/sessions devuelve las sesiones activas del usuario autenticado con su metadata, marcando cual es la sesion actual (current: true)
- [ ] Nuevo endpoint DELETE /api/auth/me/sessions/:jti revoca una sesion especifica del propio usuario, rechazando con 403/404 si el jti no pertenece al usuario autenticado
- [ ] Nuevo endpoint POST /api/auth/me/sessions/revoke-others revoca todas las sesiones del usuario excepto la actual
- [ ] PUT /api/auth/me/password revoca automaticamente todas las demas sesiones del usuario al cambiar la contrasena exitosamente
- [ ] Los flujos existentes de autenticacion/autorizacion (institutionId, courseIds, requirePermission) siguen funcionando sin cambios de comportamiento

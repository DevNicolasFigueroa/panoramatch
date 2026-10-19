# Tasks 002 — Modo Colaborativo: Lista de aportes (checklist)

Orden secuencial; cada tarea es un paso alcanzable y verificable.

## Fase 1 — Lógica pura (con tests primero)

- [x] T1 — Módulo puro del checklist en `src/core/`: tipos + reglas — ítems (texto normalizado, máx. 10, duplicados bloqueados), autorización de reclamo (creador + «Voy» dentro del cupo; espera y espectadores nunca), tomar solo ítems libres (un responsable por ítem), liberar solo el propio, una persona con varios ítems, bloqueo de eliminación con responsable (solo creador elimina libres), liberación automática al dejar de ser «Voy», orden libres primero + luego tomados (creación dentro de cada grupo) y progreso «X de Y» (sin «0 de 0»).
- [x] T2 — Tests del módulo: 18 casos de las reglas (autorización con cupo, reclamo/liberación, dropClaims encadenado, orden con libres primero y progreso). **Verde: 42/42.**

## Fase 2 — Persistencia (migración + RLS + repo)

- [x] T3 — Migración vía MCP: `create_checklist_items` — tabla con cascada al panorama, texto, `claimed_by_ref` nullable (`'creator'` o id de participante) e índice por panorama + fecha de creación.
- [x] T4 — RLS + privilegios: `checklist_item_rls` (lectura pública; creador inserta/actualiza lo suyo y borra SOLO ítems libres; invitado inserta items libres y toca SOLO su reclamo con el secreto en header; nadie más escribe) + `checklist_item_privileges_fix` (revoca grants generales de tabla que anulaban el grant por columna). **13 pruebas REST en verde**: insert libre ✓ · insert con reclamo prefabricado ✗ · not_going/maybe ✗ · claim propio ✓ · tomar ítem ajeno ✗ · tocar columnas sin privilegio ✗ · DELETE del invitado ✗ · secreto equivocado ✗ · reclamar como 'creator' ✗ · liberar tras dejar de ir ✓ · re-tomar sin ir ✗ · lectura pública con apikey ✓ · cascada al borrar panorama 0 filas ✓. Fixtures eliminadas (0/0).
- [x] T5 — Repositorio: `fetchChecklistItems`, `insertChecklistItemRow` (id de cliente opcional), `deleteChecklistItemRow`, `claimChecklistItemRow`, `releaseChecklistItemRow` y `releaseChecklistClaimsOfRow` (libera en lote al dejar de ir); mapeo snake_case → dominio core.

## Fase 3 — Orquestación e interfaz

- [x] T6 — Store: `checklist` cargado al abrir/crear Colaborativo; acciones `addChecklistItem` / `removeChecklistItem` / `claimCreatorChecklistItem` / `releaseCreatorChecklistItem` con escritura optimista y reversión; siembra inicial junto al panorama; `changeFriendStatus` suelta los reclamos del invitado que dejó de ser «Voy» (local + `releaseChecklistClaimsOfRow` en la base) en el mismo flujo que rueda en Social con los votos.
- [x] T7 — Formulario de creación: en Colaborativo, campo opcional «¿Qué hay que llevar?» (un ítem por línea, máx. 10, ≤40 caracteres) agregado a `CreateEventInput.checklistItems`; vacío es válido.
- [x] T8 — Sección «¿Qué hay que llevar?» en el dashboard (solo Colaborativo): progreso «X de Y» arriba (sin «0 de 0»), lista ordenada por core (libres primero) con el nombre de quien lleva cada ítem, «Yo lo llevo» / «Liberar» del creador, ✕ solo en libres y añadir desde el panel.
- [x] T9 — Sección en la vista del enlace (`GuestContributionList`): misma lista y progreso con nombres; el invitado «Voy» dentro del cupo añade/toma/libera con su identidad sin cuenta; el efecto RF-3 libera sus ítems al dejar de ir; espera y espectadores solo lectura.

## Fase 4 — Verificación y cierre

- [x] T10-a — `npm run test` 42/42 · `npx tsc --noEmit` limpio · `npm run build` EXIT=0.
- [ ] T10-b — Smoke del dueño en 375px: crear Colaborativo con lista, responder por enlace en ventana privada (tomar/liberar/añadir), espectador ve nombres, responsable se baja y libera solo, máximo y duplicados, cupo llena la espera y suelta reclamos.
- [ ] T11 — Spec/plan/tasks finalizados y **commit SOLO con autorización del dueño** (sin push salvo permiso aparte); registro posterior en AGENTS/MEMORY si el dueño lo pide.

# Tasks 002 — Modo Colaborativo: Lista de aportes (checklist)

Orden secuencial; cada tarea es un paso alcanzable y verificable.

## Fase 1 — Lógica pura (con tests primero)

- [x] T1 — Módulo puro del checklist en `src/core/`: tipos + reglas — ítems (texto normalizado, máx. 10, duplicados bloqueados), autorización de reclamo (creador + «Voy» dentro del cupo; espera y espectadores nunca), tomar solo ítems libres (un responsable por ítem), liberar solo el propio, una persona con varios ítems, bloqueo de eliminación con responsable (solo creador elimina libres), liberación automática al dejar de ser «Voy», orden libres primero + luego tomados (creación dentro de cada grupo) y progreso «X de Y» (sin «0 de 0»).
- [x] T2 — Tests del módulo: 18 casos de las reglas (autorización con cupo, reclamo/liberación, dropClaims encadenado, orden con libres primero y progreso). **Verde: 42/42.**

## Fase 2 — Persistencia (migración + RLS + repo)

- [x] T3 — Migración vía MCP: `create_checklist_items` — tabla con cascada al panorama, texto, `claimed_by_ref` nullable (`'creator'` o id de participante) e índice por panorama + fecha de creación.
- [x] T4 — RLS + privilegios: `checklist_item_rls` (lectura pública; creador inserta/actualiza lo suyo y borra SOLO ítems libres; invitado inserta items libres y toca SOLO su reclamo con el secreto en header; nadie más escribe) + `checklist_item_privileges_fix` (revoca grants generales de tabla que anulaban el grant por columna). **13 pruebas REST en verde**: insert libre ✓ · insert con reclamo prefabricado ✗ · not_going/maybe ✗ · claim propio ✓ · tomar ítem ajeno ✗ · tocar columnas sin privilegio ✗ · DELETE del invitado ✗ · secreto equivocado ✗ · reclamar como 'creator' ✗ · liberar tras dejar de ir ✓ · re-tomar sin ir ✗ · lectura pública con apikey ✓ · cascada al borrar panorama 0 filas ✓. Fixtures eliminadas (0/0).
- [ ] T5 — Repositorio: fetch de la lista del panorama, insertar ítem, eliminar ítem libre, tomar ítem (rellenar responsable), liberar ítem (vaciar); mapeo hacia el dominio core con la identidad del reclamante.

## Fase 3 — Orquestación e interfaz

- [ ] T6 — Store: estado del checklist cargado al abrir/crear Colaborativo; acciones añadir/eliminar/tomar/liberar con escritura optimista y reversión; al cambiar un asistente fuera de «Voy», sus reclamos se sueltan en el mismo flujo del evento.
- [ ] T7 — Formulario de creación: en Colaborativo, campo opcional «¿Qué hay que llevar?» (un ítem por línea, máx. 10) registrado junto al panorama; vacío es válido.
- [ ] T8 — Sección «Lista de aportes» en el dashboard (solo Colaborativo): progreso «X de Y» arriba, lista ordenada por core (libres primero), botones según autorización, eliminar ítems libres del creador y añadir desde el panel.
- [ ] T9 — Sección en la vista del enlace: misma lista y progreso; invitado «Voy» dentro del cupo añade/toma/libera con su identidad sin cuenta; espera y espectadores solo lectura con nombres visibles.

## Fase 4 — Verificación y cierre

- [ ] T10-a — `npm run test` verde (tests core de la 002) · `npx tsc --noEmit` limpio · `npm run build` EXIT=0.
- [ ] T10-b — Smoke del dueño en 375px: crear Colaborativo con lista, responder por enlace en ventana privada (tomar/liberar/añadir), espectador ve nombres, responsable se baja y libera solo, máximo y duplicados, cupo llena la espera y suelta reclamos.
- [ ] T11 — Spec/plan/tasks finalizados y **commit SOLO con autorización del dueño** (sin push salvo permiso aparte); registro posterior en AGENTS/MEMORY si el dueño lo pide.

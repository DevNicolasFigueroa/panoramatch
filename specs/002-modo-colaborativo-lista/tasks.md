# Tasks 002 — Modo Colaborativo: Lista de aportes (checklist)

Orden secuencial; cada tarea es un paso alcanzable y verificable.

## Fase 1 — Lógica pura (con tests primero)

- [ ] T1 — Módulo puro del checklist en `src/core/`: tipos + reglas — ítems (texto normalizado, máx. 10, duplicados bloqueados), autorización de reclamo (creador + «Voy» dentro del cupo; espera y espectadores nunca), tomar solo ítems libres (un responsable por ítem), liberar solo el propio, una persona con varios ítems, bloqueo de eliminación con responsable (solo creador elimina libres), liberación automática al dejar de ser «Voy», orden libres primero + luego tomados (creación dentro de cada grupo) y progreso «X de Y» (sin «0 de 0»).
- [ ] T2 — Tests del módulo: cada regla anterior con su caso (incluye creador «Voy» permanente, invitado del enlace sin cuenta, anotado a mano sin identidad no reclama, liberación encadenada) — puerta `npm run test` verde antes de seguir.

## Fase 2 — Persistencia (migración + RLS + repo)

- [ ] T3 — Migración vía MCP: tabla nueva de ítems por panorama (referencia al panorama con cascada, texto, orden de creación y responsable nullable como referencia: `"creator"` o id de participante; índice por panorama para el listado).
- [ ] T4 — RLS + privilegios: lectura pública de la lista; creador añade/elimina ítems de su panorama; invitado «Voy» añade ítems y toca SOLO la columna de su propio reclamo (tomar ítem libre con su header, liberar el que él lleva); espectadores sin escritura. Pruebas REST empíricas antes de conectar la interfaz (mismo método de la 001; fixtures eliminadas al final).
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

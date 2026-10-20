# Tasks 003 — Modo Deportivo: Organizador de Equipos

Orden secuencial; cada tarea es un paso alcanzable y verificable. Inicia solo con orden del dueño.

## Fase 1 — Lógica pura (con tests primero)

- [x] T1 — Módulo puro de equipos en `src/core/team-organizer.ts`: tipos + reglas — estado de equipos (nombres A/B, asignaciones por referencia «creator»/participante, vacantes ordenadas por antigüedad), lectura de titulares reales (organizador incluido, orden de confirmación) con purga de asignaciones huérfanas, sorteo equilibrado determinista con semilla (mantiene fijos, reparte libres alternando al equipo más chico, desempate por semilla, diferencia ≤ 1 cuando es alcanzable), movimiento a dedo (entre equipos o a «sin equipo»), mínimos y avisos (2 titulares para sortear; sin libres → no cambia nada), baja de titular (sale al instante y deja vacante) y herencia FIFO del suplente (o «sin equipo» si no hay vacantes), y validación de nombres (no vacío, máximo 30, distinto del otro equipo ignorando mayúsculas y espacios de sobra). Nada de CLP ni fechas: este módulo solo consume las reglas vigentes de cupo/titulares.
- [x] T2 — Tests del módulo con `node --test` (27 casos en `team-organizer.test.ts`): determinismo, balance par/impar, fijos no tocados, fijos concentrados 4-0 (se acerca con los libres), mínimos, sin libres, baja con vacante (simple y doble FIFO), herencia, movimiento a dedo, purga de huérfanas/huérfanos, nombres y mensajes en español. **Verde: 99/99 (72 previos + 27 nuevos) · `npx tsc --noEmit` limpio.**

## Fase 2 — Persistencia (migración + RLS + repo)

- [ ] T3 — Migración vía MCP: columnas `team_a_name` / `team_b_name` (nullable → núcleo usa los nombres por defecto) + tablas `team_members` (panorama con cascada, equipo con check `a`/`b`, referencia del jugador con check «creator»/uuid, una asignación por jugador por panorama) y `team_vacancies` (panorama con cascada, equipo con check, sello de tiempo) + índices por panorama.
- [ ] T4 — RLS + privilegios por columna: lectura con sesión; el creador inserta/mueve/elimina cualquiera de sus asignaciones y borra vacantes de su panorama; un participante con sesión SOLO inserta/elimina su propia fila (con su fila «Voy» dentro del cupo: liberar al bajarse, heredar al subir); espera y espectadores sin escrituras; nadie anónimo (todo revoca al rol `anon`, patrón vigente). Fixtures REST probadas antes de conectar la interfaz; grants por columna explícitos (lección 002). Transacción/función segura para el reclamo FIFO de la vacante (fila bloqueada, segundo aspirante toma la siguiente) — el WARN de definer es intencional si aplica.
- [ ] T5 — Repositorio: leer nombres + asignaciones + vacantes al abrir un Deportivo; crear liberar asignación propia, reclamar vacante (servidor), asignar/mover/retar (creador), sortear (lote determinista calculado por el núcleo y aplicado en una escritura), renombrar (columnas del panorama); mapeo snake_case → dominio core con default legacy a nombres por defecto.

## Fase 3 — Orquestación e interfaz

- [ ] T6 — Store: estado de equipos cargado al abrir/crear Deportivo; acciones `drawTeams` (genera semilla en el toque, núcleo calcula, lote optimista con reversión), `movePlayer`, `renameTeam`, `removeFromTeam` (creador) y los encadenados automáticos: liberar asignación + crear vacante al bajar de «Voy», y herencia FIFO (o «sin equipo») al subir un suplente — en el mismo flujo que ya rueda la reclasificación de cupos.
- [ ] T7 — Sección «Organizador de Equipos» en el dashboard (solo Deportivo): dos tarjetas de equipo (kit de color fijo por equipo: mismo par siempre; cabezal con nombre editable inline solo creador + conteo), jugadores en orden de confirmación con controles de mover/retar solo del creador, fila visible «Sin equipo», botón de sorteo con estados inhibidos visibles (< 2 titulares; «no hay titulares libres»).
- [ ] T8 — Sección en la vista del enlace: mismos equipos y fila, todo en solo lectura para titulares, suplentes y espectadores (completa: nombres, conteo, kits) para cualquiera con sesión que no sea el creador.
- [ ] T9 — Retro-compat y chip de modo: etiquetas genéricas «Deportivo» intactas; los Deportivos previos abren con equipos vacíos y nombres por defecto sin migración de datos; Social/Colaborativo no muestran nada nuevo.

## Fase 4 — Verificación y cierre

- [ ] T10-a — `npm run test` (72/72 + batería nueva en verde) · `npx tsc --noEmit` limpio · `npm run build` EXIT=0.
- [ ] T10-b — Smoke en 375px (vía navegador): crear Deportivo con 0 confirmados (invitación visible), subir a 2/3/4 titulares (sorteo par/impar con diferencia ≤ 1), fijos a dedo + re-sorteo que los respeta, movimiento entre equipos y a «sin equipo», renombrado válido e inválido (30 car., duplicado), bajarse un titular (vacante + salida al instante) y suplente subiendo heredando el asiento más antiguo (doble renuncia), enlace en ventana privada con sesión (solo lectura, equipos visibles) y persistencia tras recarga. Lado del creador probado también por el dueño con su sesión real.
- [ ] T11 — Spec/plan/tasks actualizados a estado final y commit con autorización explícita del dueño; fusión a `develop` (sin push a `main`); memoria actualizada en el mismo flujo de cierre.

## Checks transversales (en cada fase)

- `confirm_order` solo del trigger; el módulo nunca lo escribe.
- Sin `toISOString()` ni `new Date("AAAA-MM-DD")`; si se ordena por antigüedad de vacante, el sello de tiempo sale de la fila del servidor.
- Textos en español, código en inglés; sin variantes `dark:` (solo tokens de `globals.css`).
- Nada de cálculos de equipos dentro de componentes: todo pasa por el módulo puro.

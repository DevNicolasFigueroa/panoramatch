# MEMORY.md — PanoraMatch

Memoria del proyecto entre sesiones. Máximo ~50 líneas: resume o elimina lo que ya no aporte.

## Estado actual
- **Spec 001 implementada (rama `feat/001-modo-social-match` → `develop`)**: votación de lugares del modo Social completa: form opcional de candidatos, tablero "¿A dónde vamos?" en dashboard (votar propio/delegado, declarar Match) y en el enlace del invitado (vota y propone solo si va "Voy"), conteos públicos, cierre definitivo tras Match.
- **Spec 002 implementada y fusionada a `develop` («lista de aportes» del Colaborativo)**: checklist «¿Qué hay que llevar?» — núcleo puro `src/core/contribution-list.ts` (máx 10 ítems y ≤40 caracteres, duplicados normalizados, un responsable por ítem; toma/libera por identidad; creador «Voy» permanente; liberación automática RF-3 al dejar de ir; libres primero y progreso «X de Y» sin «0 de 0»), tabla `checklist_items` con RLS probada vía REST (13 casos) y UI completa: formulario de siembra en el creador + sección en el dashboard + `GuestContributionList` en el enlace. Puertas: 42/42 · tsc limpio · build EXIT=0. Smoke del enlace verificado en navegador; el lado del creador lo probó el dueño en producción.
- **Login con Google funcionando E2E** (dashboard protegido, `/login`, `/auth/callback`); provider activo por Dashboard (manual).
- Tablas: `profiles`, `panoramas`, `participants`, `place_candidates`, `place_votes`, `checklist_items` (+ `panoramas.match_candidate_id` / `creator_name`), todas con RLS.
- Migraciones MCP: `create_panoramatch_tables`, `panoramatch_rls_and_triggers`, `grant_client_side_participant_ids`, `hardening_function_security`, `create_place_vote_tables`, `place_vote_rls`, `place_votes_guest_delete`, `place_vote_polish_index`, `place_votes_update_privileges_fix`, `add_panorama_creator_name`, `create_checklist_items`, `checklist_item_rls`, `checklist_item_privileges_fix` (002).
- RLS de lugares y checklist probados empíricamente con REST (12 + 13 casos): solo "Voy" con su header toca su voto/reclamo; `delegated` bloqueado por privilegio de columna; Match cerrado = sin escrituras; lectura pública; el invitado del checklist solo actualiza `claimed_by_ref`.
- Advisors: queda configurar "Leaked password protection" (Dashboard → Auth). WARN `multiple_permissive_policies` es patrón aceptado (público + dueño + invitado), igual en V2.

## Decisiones (y por qué)
- **D6 empieza vacío en la nube**: nada se importa del localStorage viejo (`migrateLegacyStore` viva en core).
- **D1/D2**: creador con sesión Google; invitado sin cuenta con `guest_secret` por header `x-participant-secret`, jamás en URL.
- **D3 `starts_at` es texto local** `'YYYY-MM-DDTHH:mm'` (check DB); nunca `toISOString()` ni `new Date("AAAA-MM-DD")`.
- **D7 Social sin titulares/suplentes**: votan creador + todos los "Voy" (incluso con cupo definido); delegación del creador SOLO para confirmados anotados a mano (`creatorAdded`, derivado de fila sin `guest_secret` ni `auth_user_id`).
- **D8 voto mutable hasta el Match**: `match_candidate_id` en la fila del panorama cierra TODO (insert/update/candidatos) en RLS; conteo congelado.
- **D9 un voto vigente por votante**: índice único `(panorama_id, voter_ref)` + upsert `onConflict`; cambiar voto = update de su fila.
- **D10 tests sin dependencias nuevas**: `tsconfig.test.json` compila `src/core` a `.test-build/` (CommonJS, gitignore) y `npm run test` corre `node --test ".test-build/**/*.test.js"`; resuelve el problema de imports sin extensión.
- **D11 creador «Voy» implícito** (aprobada por el dueño): el creador ES un asistente: «Voy» fijo, orden 0, ocupa cupo (puede desplazar invitados a espera), boleta entre n+1 y «Van» en las tres vistas; quórum SOLO invitados (el panorama no nace verde); nombre real de Google en `panoramas.creator_name` (null → «El creador»), reservado ante invitados y anotados a mano; jamás delegable; fila con chip «Organizador» sin botones de estado.
- **D12 sin lenguaje de partido en Social**: las listas NO llevan chips «Titular»/«Suplente N» (decision del dueño: "no es un partido"); solo queda «Organizador» en la fila del creador.
- **D13 lista de aportes del Colaborativo (spec 002, aprobada por el dueño)**: creador + confirmados «Voy» dentro del cupo añaden ítems (tras crear o por el form); cada uno solo toma/libera los suyos («Yo lo llevo», referencia `'creator'` o id de participante en `claimed_by_ref`); si el responsable deja de ser «Voy» o cae a espera, sus ítems se liberan en el mismo flujo (RF-3); el creador elimina SOLO ítems libres; espectadores ven los nombres; orden libres-primero por core; cantidad dentro del texto (máx 10, ≤40).
- **Privilegios de la 002**: los grants de tabla por defecto anulan el grant por columna — en `checklist_items` se revocó el paquete y se re-otorgó al mínimo (invitado: solo update de `claimed_by_ref`); recrear la lección en tablas futuras.
- **Escritura optimista + reversión** en store; candidatos iniciales del form se insertan con ids del cliente.

## Aprendizajes y errores a evitar
- Los updaters de `setState` NO corren sincrónicamente: validar duplicados antes de `setState`.
- Efectos SSR-sensibles solo tras montar (reload del reloj, identidad de invitado).
- Windows: `npm.cmd`/`npx.cmd`/`curl.exe` (PowerShell bloquea `npm.ps1`); `Select-String` sobre build puede devolver exit code 1 falso — verificar con `echo $LASTEXITCODE`.
- RLS: comparar `voter_ref`/`claimed_by_ref` (text) con uuid usando `q.id::text` (uuid = text lanza 42883); secrets de invitado comparar como `(q.guest_secret)::text = participant_request_secret()` (el helper devuelve uuid); `auth.uid()` envuelto en `(select auth.uid())` cuando toque escribir políticas nuevas.
- PostgREST upsert requiere el índice único exacto en `onConflict`; el payload del invitado NO incluye `delegated` (privilegio de columna lo prohíbe).
- `AGENTS.md` solo comandos verificables; MCP en `mcp.servers` de `opencode.json`.
- Los PATCH de RLS «negados» responden sin error aparente (filas afectadas 0): verificar SIEMPRE el estado real de la fila por SQL, no solo el HTTP 204.
- **Regla del dueño (proceso)**: jamás hacer commits, push, specs nuevas ni registros de features sin su autorización explícita; los cambios quedan en el working tree hasta que lo apruebe (y el registro en AGENTS/MEMORY en el momento del commit puntual que él pida).
- Usuario de pruebas pendiente de borrar en Auth Admin: `panoramatch.rls.test.*@gmail.com` (perfil `60310436-e6fa-4963-88a4-5f0a73a200ae`).

## Próximos pasos
- Considerar Realtime para tablero vivo (listas de lugares y aportes).
- Specs siguientes: Deportivo (puntos en la cancha) y gastos por partida — solo con orden del dueño.
- Limpieza pendiente: usuarios de prueba `panoramatch.rls.test.*@gmail.com` (perfil `60310436-…`) — borrado manual en Auth Admin; "Leaked password protection" en Dashboard → Auth.

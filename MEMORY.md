# MEMORY.md — PanoraMatch

Memoria del proyecto entre sesiones. Máximo ~50 líneas: resume o elimina lo que ya no aporte.

## Estado actual
- **Spec 001 implementada (rama `feat/001-modo-social-match` → `develop`)**: votación de lugares del modo Social completa: form opcional de candidatos, tablero "¿A dónde vamos?" en dashboard (votar propio/delegado, declarar Match) y en el enlace del invitado (vota y propone solo si va "Voy"), conteos públicos, cierre definitivo tras Match.
- **Commit único «Creacion del tipo social» (aprobado por el dueño, SIN spec)**: el creador del panorama cuenta como «Voy» — asistente virtual (`id: "creator"`, orden 0) que ocupa cupo, entra en la boleta (n+1, CLP con pozo intacto) y en «Van»; quórum solo invitados; nombre real persistido en `panoramas.creator_name` (columna ya migrada antes, sin migración nueva) y reservado ante invitados y anotados a mano; listas del Social SIN chips de cargo («Titular»/«Suplente N» fuera; solo «Organizador»). Puertas: `npm run test` 24/24 · `tsc` limpio · `build` EXIT=0.
- **Login con Google funcionando E2E** (dashboard protegido, `/login`, `/auth/callback`); provider activo por Dashboard (manual).
- Tablas: `profiles`, `panoramas`, `participants`, `place_candidates`, `place_votes` (+ `panoramas.match_candidate_id`), todas con RLS.
- Migraciones MCP: `create_panoramatch_tables`, `panoramatch_rls_and_triggers`, `grant_client_side_participant_ids`, `hardening_function_security`, `create_place_vote_tables`, `place_vote_rls`, `place_votes_guest_delete`, `place_vote_polish_index`, `place_votes_update_privileges_fix`, `add_panorama_creator_name` (columna `panoramas.creator_name` nullable + backfill; el código de «Creacion del tipo social» la consume).
- RLS de lugares probado empíricamente con REST (12 casos): solo "Voy" con su header toca su voto `voter_ref = participant_id`; `delegated` bloqueado por privilegio de columna; Match cerrado = sin escrituras; lectura pública.
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
- **Escritura optimista + reversión** en store; candidatos iniciales del form se insertan con ids del cliente.

## Aprendizajes y errores a evitar
- Los updaters de `setState` NO corren sincrónicamente: validar duplicados antes de `setState`.
- Efectos SSR-sensibles solo tras montar (reload del reloj, identidad de invitado).
- Windows: `npm.cmd`/`npx.cmd`/`curl.exe` (PowerShell bloquea `npm.ps1`); `Select-String` sobre build puede devolver exit code 1 falso — verificar con `echo $LASTEXITCODE`.
- RLS: comparar `voter_ref` (text) con uuid usando `q.id::text = voter_ref` (uuid = text lanza 42883); `auth.uid()` envuelto en `(select auth.uid())` cuando toque escribir políticas nuevas.
- PostgREST upsert requiere el índice único exacto en `onConflict`; el payload del invitado NO incluye `delegated` (privilegio de columna lo prohíbe).
- `AGENTS.md` solo comandos verificables; MCP en `mcp.servers` de `opencode.json`.
- **Regla del dueño (proceso)**: jamás hacer commits, push, specs nuevas ni registros de features sin su autorización explícita; los cambios quedan en el working tree hasta que lo apruebe (y el registro en AGENTS/MEMORY en el momento del commit puntual que él pida).
- Usuario de pruebas pendiente de borrar en Auth Admin: `panoramatch.rls.test.*@gmail.com` (perfil `60310436-e6fa-4963-88a4-5f0a73a200ae`).

## Próximos pasos
- **Smoke del dueño 375px** del commit «Creacion del tipo social»: boleta con el creador contado (n+1 con pozo), «Van» con chip «Organizador» de primero y demás filas limpias (sin «Titular»/«Suplente N»), invitado en ventana privada ve al organizador y NO puede anotarse como él, cupo llena la Lista de Espera, quórum pendiente al inicio.
- Specs 002/003: Colaborativo (gastos por partida) y Deportivo (puntos en la cancha) — solo con orden del dueño.
- Considerar Realtime para tablero vivo.

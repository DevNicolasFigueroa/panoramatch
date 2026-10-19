# MEMORY.md — PanoraMatch

Memoria del proyecto entre sesiones. Máximo ~50 líneas: resume o elimina lo que ya no aporte.

## Estado actual
- **Auth universal obligatoria implementada (`feat/003-auth-obligatoria`, SIN commit aún)**: nadie interactúa en un panorama sin sesión (Google o correo). `core/auth-validation.ts` (contraseña ≥8, correo, nombre ≤40, `next` interno) con tests (60/60 · tsc limpio · build EXIT=0). Middleware protege `/p/*` con redirect `/login?next=`; login con pestañas Google/Entrar/Crear cuenta; el callback regresa al `next` (anti open-redirect solo `/` y `/p/<uuid>`).
- **Identidad por cuenta**: fila `participants` con `auth_user_id` (índice único parcial `(panorama_id, auth_user_id)`); nombre sale del perfil (`full_name` del metadata), sin input de nombre en el enlace; `creatorAdded` = fila sin uid ni secret (anotada a mano). `guest-identity.ts` queda SOLO lectura para adopción; `createGuestSupabaseClient` eliminado (todo via cliente de sesión con cookies).
- **Adopción de fila legacy**: `adopt_anonymous_participant(panorama, secret)` (SECURITY DEFINER, solo execute a `authenticated`): valida uid de sesión, fila anónima con secret, y que el usuario no tenga fila en ese panorama; setea uid y anula el secret (uso único). El invitado que vuelve con cuenta recupera su respuesta anterior desde el mismo dispositivo.
- **Escrituras anónimas eliminadas**: políticas guest (participantes, place_votes, checklist_items, place_candidates) borradas + revokes a `anon`; políticas `*_user_*` por `auth_user_id = (select auth.uid())` (votos ALL con `voter_ref=q.id` y `delegated=false`; checklist insert/claim con `status='going'`; candidatos con Match abierto); `profiles_insert_own` (el perfil lo crea trigger `on_auth_user_created`).
- Migraciones nuevas (15 → 18): `auth_users_participation`, `auth_users_votes_and_claims`, `auth_users_place_candidates`.
- RLS con cuenta probada REST: adopción (anón 401 → 200 uid → repetido null), join propio 201/duplicado 409/uid falsificado 403, votos propio OK / ajeno y `delegated` denegados, claims propio OK / ajeno intocable / insert solo «Voy», perfiles `own` exclusivo, fila a mano intocable, ANON sin ninguna escritura (401).
- Smoke navegador 375px OK: enlace sin sesión → login con `next` intacto; errores de acceso amables; login correo → vuelve al enlace; Social con voto propio; Colaborativo con ítem tomado y RF-3 liberando al bajar a «En duda»; dashboard reconoce cuenta de correo.
- **Incidencia resuelta «no se guardan los panoramas»**: usuarios de auth sin fila en `profiles` (trigger `on_auth_user_created` fallido/limpieza) reventaban el FK `panoramas_creator_id_fkey` al guardar. Reparación en vivo por SQL + **auto-reparación cliente** `ensureOwnProfileRow` (upsert `profiles_insert_own` al abrir el dashboard, en el store). AVISO: los panoramas viejos del dueño murieron en CASACADA al borrarse el perfil de la cuenta del 16-oct — solo recuperables desde backups del panel.

## Decisiones (y por qué)
- **D6 empieza vacío en la nube**: nada se importa del localStorage viejo (`migrateLegacyStore` viva en core).
- **D3 `starts_at` es texto local** `'YYYY-MM-DDTHH:mm'`; nunca `toISOString()` ni `new Date("AAAA-MM-DD")`.
- **D7/D8/D9/D10/D11/D12/D13**: creato implícito, Match cierra, voto único mutable, tests node --test, lenguaje sin partido, lista de aportes — ver commits previos de `develop`.
- **D14 auth universal (aprobada por el dueño)**: sesión obligatoria en cualquier panorama; contraseña mínima 8; confirmación de correo DESACTIVADA (a configurar en Dashboard); nombre fijo del perfil (choque de duplicado → error); mantener delegación Social y anotados a mano; fila anónima vieja se adopta con `guest_secret` local.
- **Privilegios de tabla**: los grants por defecto anulan el grant por columna — revocar paquete y re-otorgar al mínimo (lección `checklist_item_privileges_fix`).

## Aprendizajes y errores a evitar
- Los updaters de `setState` NO corren sincrónicamente: validar duplicados antes de `setState`.
- Windows: `npm.cmd`/`npx.cmd`; exit codes con `echo $LASTEXITCODE`.
- RLS: comparar refs de texto con uuid vía `q.id::text`; `(select auth.uid())`; PATCH negado responde 204 silencioso — verificar fila por SQL.
- `execute_sql` de MCP devuelve SOLO el resultado de la última sentencia: las verificaciones de estado van una por llamada.
- Supabase signUp sin session + sin error = email coincidente con confirmación activada: mensaje de UI neutral («revisa tu correo o entra»). El plan pide DESACTIVAR la confirmación en Dashboard.
- **Regla del dueño (proceso)**: jamás commits, push ni specs sin su autorización explícita; el trabajo queda en el working tree.

## Próximos pasos
- Pendientes del dueño en Dashboard: (1) Desactivar «Confirm email» (Auth → Providers); (2) activar «Leaked password protection»; (3) borrar usuarios de prueba en Auth Admin: `panoramatch.rls003@gmail.com` y `panoramatch.cre003@gmail.com` (+ el legacy `panoramatch.rls.test.*`).
- Commit/push de `feat/003-auth-obligatoria` y fusión `--ff-only` a `develop`: SOLO con orden del dueño.
- Specs futuras: Deportivo y gastos por partida; Realtime para tableros.

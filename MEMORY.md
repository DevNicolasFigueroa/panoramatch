# MEMORY.md — PanoraMatch

Memoria del proyecto entre sesiones. Máximo ~50 líneas: resume o elimina lo que ya no aporte.

## Estado actual
- **Integración Supabase (rama `feature/supabase-base`, desde `develop`)**: auth Google (`/login` + `/auth/callback`), dashboard `/` protegido server-side, tablas `profiles`/`panoramas`/`participants` con RLS, y votación de invitados externos sin cuenta en `/p/<panorama_id>`. `tsc` + `build` limpios; humo server-side OK (`/login` 200, `/` 307→login si no hay sesión, enlace inválido 404). Falta el E2E con Google real: el provider Google aún no está activado (acción del dueño: Google Cloud OAuth + Dashboard Supabase, redirect `https://zxtldkpyngghfeigbnxt.supabase.co/auth/v1/callback`).
- Migraciones aplicadas vía MCP: `create_panoramatch_tables`, `panoramatch_rls_and_triggers`, `grant_client_side_participant_ids`, `hardening_function_security`. Advisors de seguridad: solo queda el WARN `auth_leaked_password_protection` (activarlo en Dashboard → Auth).
- Voto de invitado probado real contra la API: PATCH `participants` CON header secreto actualiza y el trigger asigna `confirmed_order`; sin header o con secreto malo queda bloqueado (RLS).

## Decisiones (y por qué)
- **Empieza vacío en la nube (D6)**: nada se importa automáticamente del localStorage viejo; ese legado queda solo como respaldo y el usuario crea fresco. `migrateLegacyStore` sigue viva en core para lecturas V1.0.
- **Creador gestiona desde su cuenta (D1)**: solo con sesión Google; el invitado externo siempre sin cuenta.
- **`guest_secret` + RLS por header (D2)**: el secreto (uuid) nace de la primera votación y vive en `panoramatch-guest-v1` del navegador del invitado; viaja en header `x-participant-secret` (NUNCA en la URL). Evita Edge Function y lo verificamos empíricamente.
- **`starts_at` es texto local `'YYYY-MM-DDTHH:mm'` (D3)**: conserva el orden lexicográfico y las reglas de core sin riesgo UTC; check de formato en la DB.
- **Título único por creador (D4)**, nombre de participante único por panorama, ambos case-insensitive en la DB.
- **`confirmed_order` solo lo fija el trigger DB** (con lock por panorama): ni creador ni invitados manipulan la fila de titulares; el ascenso de suplentes usan simplemente la clasificación de `core/`.
- **Escritura optimista + reversión**: el store muta el estado local de inmediato y escribe en Supabase después; si falla, revierte y muestra el error en español (banner dismissible en el dashboard).

## Aprendizajes y errores a evitar
- Los updaters de `setState` NO corren sincrónicamente: validar duplicados antes de `setState`.
- Soporte de login (localStorage, sesión) SOLO en `useEffect` tras montar: render inicial sin efecto rompe la hidratación SSR.
- Node ESM no resuelve imports sin extensión al testear `src/core/` directo: copiar a temp añadiendo `.ts` a los `from "./x"`.
- `AGENTS.md` solo comandos verificables; en `opencode.json` los MCP van en `mcp.servers` (raíz `mcp` deprecada).
- Windows: `npm.ps1` está bloqueado por la política de ejecución — usar `npm.cmd`, `npx.cmd`, `curl.exe`.
- `current_setting('request.headers', true)::json ->> 'x-participant-secret'` funciona en RLS de Supabase (probado); apikey publishable `sb_publishable_*` sirve como header `apikey` en el REST.
- Pendiente de limpieza: usuario de auth de prueba (email `panoramatch.rls.test.*@gmail.com`, id perfil `60310436-e6fa-4963-88a4-5f0a73a200ae`); borrarlo desde Auth Admin, no por SQL.

## Próximos pasos
- E2E real: activar provider Google, crear panorama, votar como invitado en ventana privada (cupo, espera y conflicto de nombre incluidos).
- Considerar Realtime (actualización en vivo del tablero) como fase siguiente del dueño.

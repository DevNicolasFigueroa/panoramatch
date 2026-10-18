## AGENTS.md — PanoraMatch

Aplicación web para organizar panoramas con amigos (salidas, asados o partidos), confirmar asistencia con gestión de cupos y dividir gastos en Pesos Chilenos (CLP).

## Stack y estructura
- Next.js (App Router), React, TypeScript estricto y Tailwind CSS.
- `src/core/`: lógica de negocio en funciones puras (`currency-clp.ts`, `quota-manager.ts`, `panorama-collection.ts`, `guest-participation.ts`), 100% aislada de React, DOM, red y almacenamiento.
- `src/components/`: interfaz. `src/lib/`: hook de estado (`use-panorama-store.ts`), sesión (`use-auth-session.ts`), repositorio de datos (`supabase-panorama-repo.ts`), identidad de invitados (`guest-identity.ts`) y clientes de Supabase (`supabase-client.ts`, `supabase-env.ts`).
- Backend Supabase (PostgreSQL + Auth Google) gestionado vía MCP de Supabase (`mcp.servers.supabase` en `opencode.json`): tablas `profiles`, `panoramas`, `participants` con RLS; migraciones aplicadas con `apply_migration` (revisables con `list_migrations`).
- Credenciales públicas en `.env.local` (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`; ignorado en git). El provider de Google se activa a mano en el Dashboard de Supabase.
- El dashboard (`/`, creador autenticado) es client-side con estado `{ panoramas: SavedPanorama[], activeId: null }` sincronizado escritura-optimista contra Supabase. Los panoramas guardan sus propios `attendees` (participantes). Persistencias de invitados en `localStorage`: identidad en `panoramatch-guest-v1` y tema en `panoramatch-ui-theme`; la clave legacy `panoramatch-v1-data` ya no se usa (migración legacy V1.0 permanece en `storage.ts`).

## Comandos
- Desarrollo: `npm run dev` → http://localhost:3000 (requiere `.env.local` con las credenciales de Supabase).
- Compilación y tipos: `npm run build`; typecheck rápido: `npx tsc --noEmit`.
- Tests de lógica pura: `npm run test` (compila `src/core` a `.test-build/` con `tsconfig.test.json` y corre `node --test`; sin dependencias nuevas).
- Esquema de Supabase: solo vía MCP (`apply_migration`, `execute_sql` de solo lectura), nunca desde un script SQL local aplicado a mano.
- Git: principal `main`, rama de trabajo `develop` (remoto `origin` = github.com/DevNicolasFigueroa/panoramatch). Flujo: crear `feature/*` desde `develop`, subir con `git push -u origin <rama>` y fusionar a `main` con `--ff-only`. Primer push abre login de navegador (Git Credential Manager; el CLI `gh` no está instalado).

## Convenciones
- Código (variables, funciones, tipos, archivos) en inglés; textos de la interfaz y comentarios en español.
- Diseño *UI-first* "Cuentas claras en la cancha": tokens de color en `globals.css` (@theme: paper/elev/ink/cancha + kits por modo: social, ember, deporte). Tipografía vía `next/font`: Bricolage Grotesque (display y montos) + Instrument Sans (UI). Sin sombras suaves genéricas: bordes de tinta, sombra dura solo en la boleta.
- Diseño mobile-first; el color codifica información (modo, quórum, estado), nunca decoración.
- Etiquetas de modo genéricas en toda la UI de listado/dashboard (Social / Colaborativo / Deportivo, chips/tarjetas); la descripción larga de cada modo vive únicamente en el selector del creador.
- Tema claro/oscuro: solo overrides de variables bajo `html[data-theme="dark"]` en `globals.css` — NO crear variantes `dark:` en componentes. Preferencia persistida en la clave separada `panoramatch-ui-theme` ('light'|'dark', no en el store de datos); el script anti-flash de `layout.tsx` fija `data-theme` antes del primer pintado y `use-ui-theme.ts` solo lee ese atributo. `src/core/` jamás sabe del tema.
- Si cambias la estructura de datos o el schema de Supabase, conserva retrocompatibilidad: `loadPanoramaStore` migra el shape legacy `{ event, attendees }` de la V1.0 y descarta ítems corruptos sin tirar la app.

## Reglas de dominio / trampas conocidas
- **Moneda CLP (sin decimales)**: montos enteros `$XX.XXX`. División inexacta entre confirmados ⇒ redondeo UP al múltiplo de `$100` (`Math.ceil((total / n) / 100) * 100`) y se muestra el sobrante como pozo común.
- **Cupos y Suplentes**: titulares = primeros N `Voy` por orden de confirmación (`confirmedOrder`); sobrantes van a Lista de Espera. Si un titular pasa a `No puedo`, el primer suplente sube automáticamente al reclasificar.
- **Creador «Voy» implícito**: quien crea el panorama ES un asistente («Voy» fijo, orden 0, ocupa cupo): cuenta en la boleta CLP (n+1) y en «Van» de dashboard, enlace y tarjetas. Es un asistente **virtual** (`id: "creator"`, `isCreator`), sin fila en `participants` ni RLS nueva; su nombre vive en `panoramas.creator_name` (null → «El creador») y está reservado ante invitados y anotados a mano. El semáforo de quórum mide SOLO invitados; jamás delegable en la votación de lugares. En las listas del modo Social NO hay chips de cargo («Titular»/«Suplente N», no es un partido): solo la fila del creador lleva chip «Organizador».
- **Fechas locales**: siempre hora local (`America/Santiago`), formato `'YYYY-MM-DDTHH:mm'`. Nunca `toISOString()` ni `new Date("AAAA-MM-DD")`: se interpretan en UTC y desplazan el día. El orden del listado compara el string local lexicográficamente.
- **Listado de panoramas**: no se permiten títulos duplicados (`isDuplicatePanoramaTitle`); en DB el título es único **por creador** (`unique (creator_id, lower(trim(title)))`). Eliminar un panorama activo deja `activeId: null`. Validar duplicados ANTES de `setState` (los updaters no corren de forma sincrónica).
- **Auth y flujos**: crear/gestionar panoramas exige sesión Google (rutas `/login`, `/auth/callback`, `/` protegida server-side). El invitado externo participa en `/p/<panorama_id>` sin cuenta: escribe nombre y marca Voy / En duda / No puedo.
- **Secreto de invitado**: NO viaja en la URL. Se genera al votar (`guest_secret`, uuid) y vive en `localStorage` (`panoramatch-guest-v1`) junto al `participantId`; el cliente de invitado lo envía en header `x-participant-secret` y la RLS valida ese header para permitir el cambio de voto. Sin secreto, no se puede tocar la fila.
- **`confirmed_order` es de la base**: lo asigna SOLO el trigger `assign_confirmed_order` (con lock por panorama); el cliente jamás lo envía en inserts/updates del flujo del invitado. Privilegios por columna: un invitado toca únicamente `status`.
- **Nombres de participantes únicos por panorama** (`unique (panorama_id, lower(trim(name)))`): el duplicado se bloquea con error bajo el campo, igual que antes; formatear nombres con `normalizeAttendeeName`.

## Memoria
- Al empezar, lee `MEMORY.md` para conocer el estado del proyecto y las decisiones tomadas.
- Al terminar una tarea, actualízalo: estado actual, decisiones importantes (con su porqué) y errores a evitar.
- Mantenlo breve (máximo ~50 líneas). Reglas permanentes van aquí, no en memoria.
- No guardes nunca datos sensibles (claves, tokens, datos personales).

## Forma de trabajar
- SDD (Spec-Driven Development): lee `docs/constitution.md` y la spec activa (`specs/NNN-*/`) antes de tocar código.
- Haz solo lo que se pide: no añadas funcionalidades por tu cuenta.
- En tareas grandes o refactors, planifica antes de tocar código. Cambios pequeños y enfocados; no reescribas lo que ya funciona.
- Lógica/reglas nuevas: primero en `src/core/`, luego se consumen desde la interfaz.
- Al terminar, resume qué has cambiado y cualquier decisión que deba revisar.

## Límites
- **Siempre**: respetar las reglas de CLP, cupos, listado y fechas locales; textos en español; actualizar `MEMORY.md` al terminar.
- **Pregunta antes**: instalar dependencias nuevas, crear archivos fuera de la estructura o cambiar el formato de datos.
- **Nunca**: mezclar cálculos de `src/core/` dentro de componentes visuales ni usar decimales en dinero.

## Verificación
- `npx tsc --noEmit` sin errores y `npm run build` exitoso.
- Probar el flujo en navegador (vista móvil 375px): login con Google → crear, listar, abrir y eliminar panoramas; copiar enlace y responder como invitado en **ventana privada** (sin sesión): nombre + estado, tablero visible y cambio de respuesta; con cupo lleno, verificar lista de espera.
- En `/p/<id>` caído: eliminar el panorama con la sesión activa y recargar el enlace → pantalla "Panorama no disponible".
- Salud de datos y RLS: revisar advisors de seguridad y rendimiento vía MCP (`get_advisors`).
- Reiniciar localStorage de invitado: DevTools → Application → Local Storage → borrar `panoramatch-guest-v1` (la clave `panoramatch-v1-data` es legacy).

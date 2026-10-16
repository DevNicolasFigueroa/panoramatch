# MEMORY.md — PanoraMatch

Memoria del proyecto entre sesiones. Máximo ~50 líneas: resume o elimina lo que ya no aporte.

## Estado actual
- **V1.3 modo dual claro/oscuro** con botón sol/luna en la cabecera: paleta nocturna "Cancha nocturna" vía overrides de tokens (`html[data-theme="dark"]`), anti-flash con script pre-pintado, `color-scheme` para pickers nativos, tema inicial desde el sistema y elección recordada en `panoramatch-ui-theme` (clave separada de los datos).
- **V1.2 "Cuentas claras en la cancha"** (rediseño visual completo): sistema de tokens en `globals.css` (@theme: papel `#F4EFE3`, tinta `#26303A`, cancha `#17533B`, kits de color por modo), tipografía Bricolage Grotesque + Instrument Sans, y la calculadora financiera presentada como boleta troquelada (el elemento distintivo, con picos de perforado alineados a su línea). El color codifica información; sin sombras SaaS. Lógica intacta: solo presentación.
- **V1.1 "Mis Panoramas Guardados" funcionando**: listado persistente `{ panoramas: SavedPanorama[], activeId }` en `panoramatch-v1-data`. Resumen por tarjeta, apertura del panel activo y botones "Mis panoramas" / "Crear uno nuevo" en el dashboard.
- **Respaldo en GitHub**: remoto `origin` = https://github.com/DevNicolasFigueroa/panoramatch. Flujo elegido: `develop` (trabajo) y `main` (principal); `master` fue renombrado a `main`. Autenticación con login de navegador vía Git Credential Manager en el primer push.
- V1 base intacta: formulario con validaciones, confirmación rápida (`Voy`/`En duda`/`No puedo`), lista de espera con ascenso automático, calculadora CLP con redondeo a $100.
- Lógica nueva en `src/core/panorama-collection.ts` (upsert/remove por id, título no duplicado, orden por fecha próxima primero, resumen y migración del shape legacy).
- Verificado: `tsc --noEmit` + `npm run build` limpios y smoke test de core con Node (CLP, suplentes, migración legacy, orden lexicográfico sin Date).

## Decisiones (y por qué)
- **Modo oscuro por volcado de tokens, no variantes `dark:`**: los componentes usan utilidades de tokens (`bg-paper`, `text-ink`…), así el app entero cambia de piel sobrescribiendo variables en `html[data-theme="dark"]` — cero código duplicado de estilos. Tema inicial desde el sistema (`prefers-color-scheme`), y la elección manual queda recordada por encima del sistema.
- **Preferencia de tema en clave propia (`panoramatch-ui-theme`)**: el store de datos (`panoramatch-v1-data`) no cambia de shape y no hace falta migración; además el tema es cosmético.
- **Script anti-flash en `<body>` + `suppressHydrationWarning`**: el atributo `data-theme` se aplica antes del primer pintado (evita flash del tema equivocado) y pre-hidratación, así que React podría avisar por mismatch — se suprime en `<html>`.
- **Git flujo Feature-Branch**: `develop` es la rama de trabajo y `main` la principal; el trabajo previo entró en un commit único ("V1: base + Mis Panoramas Guardados") porque ambas fases comparten los mismos archivos, así que separar commits implicaba reconstruir estados intermedios con riesgo de error. `main` fusiona `develop` con `--ff-only`.
- **Cada `SavedPanorama` guarda sus propios `attendees`**: las tarjetas necesitan derivar quórum/costo por panorama; el ascenso de suplentes sigue usando solo `core/quota-manager.ts`.
- **Migración automática del shape legacy (`{event, attendees}`) en `loadPanoramaStore`, abriendo el panorama viejo como activo**: nadie pierde datos al actualizar y no se crean claves nuevas de localStorage.
- **Títulos únicos y eliminación sin límite**: decisión explícita del dueño del proyecto (duplicados bloqueados con error bajo el campo; eliminar pide `window.confirm` porque es irreversible en local).
- **Orden del listado lexicográfico por `startsAt`** (fecha próxima primero): determinista y sin riesgo de UTC, ya que el formato local `YYYY-MM-DDTHH:mm` ordena bien como string.
- Ítems corruptos de localStorage se descartan en el load (name/estado/monto/fecha validados por contrato), no rompen la app.

## Aprendizajes y errores a evitar
- Los updaters de `setState` NO corren sincrónicamente: validar duplicados (nombre de amigo, título de panorama) contra el estado actual antes de llamar `setState`, o el retorno `boolean` miente.
- localStorage y `getTodayLocalValue()` solo leen en `useEffect` tras montar: leerlos en el render inicial quiebra la hidratación SSR.
- Atributos mutados pre-hidratación en `<html>` (data-theme) exigen `suppressHydrationWarning`; y `color-scheme` por tema es lo que pinta los pickers nativos (datetime-local) en oscuro.
- Node ESM no resuelve imports sin extensión al testear `src/core/` directo: copiar los módulos a temp añadiendo `.ts` a los `from "./x"` (Next/tsconfig sí los toleran; no cambiar el código por el test).
- `AGENTS.md` debe reflejar solo comandos verificables: llegó a listar `npm run lint`/`npm test` inexistentes. Si falta algo (lint, tests), proponlo, no lo inventes.

## Próximos pasos
- Botón de compartir por WhatsApp: decidir flujo (texto prellenado vs link con datos).
- Formalizar tests y lint (pedir go al dueño antes).
- Desplegar a Supabase: `SavedPanorama[]` con sus asistentes es el contrato natural de tablas `panoramas`/`attendees`.
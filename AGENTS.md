Aplicación web para organizar panoramas con amigos (salidas, asados o partidos), confirmar asistencia con gestión de cupos y dividir gastos en Pesos Chilenos (CLP).

## Stack y estructura
- Next.js (App Router), React, TypeScript estricto y Tailwind CSS.
- `src/core/`: lógica de negocio en funciones puras (`currency-clp.ts`, `quota-manager.ts`, `panorama-collection.ts`), 100% aislada de React, DOM y almacenamiento.
- `src/components/`: interfaz. `src/lib/`: hook de estado (`use-panorama-store.ts`) y persistencia (`storage.ts`).
- Estado persistido en `localStorage` bajo la clave `panoramatch-v1-data` (previo a migrar a Supabase): `{ panoramas: SavedPanorama[], activeId: string | null }`. Cada panorama guarda su propio `attendees`.

## Comandos
- Desarrollo: `npm run dev` → http://localhost:3000
- Compilación y tipos: `npm run build`; typecheck rápido: `npx tsc --noEmit`.
- Aún NO existe lint ni test suite formal; la lógica pura de `src/core/` se puede verificar con `node` (importando por `file:///`).
- Git: principal `main`, rama de trabajo `develop` (remoto `origin` = github.com/DevNicolasFigueroa/panoramatch). Flujo: crear `feature/*` desde `develop`, subir con `git push -u origin <rama>` y fusionar a `main` con `--ff-only`. Primer push abre login de navegador (Git Credential Manager; el CLI `gh` no está instalado).

## Convenciones
- Código (variables, funciones, tipos, archivos) en inglés; textos de la interfaz y comentarios en español.
- Diseño *UI-first* "Cuentas claras en la cancha": tokens de color en `globals.css` (@theme: paper/elev/ink/cancha + kits por modo: social, ember, deporte). Tipografía vía `next/font`: Bricolage Grotesque (display y montos) + Instrument Sans (UI). Sin sombras suaves genéricas: bordes de tinta, sombra dura solo en la boleta.
- Diseño mobile-first; el color codifica información (modo, quórum, estado), nunca decoración.
- Si cambias la estructura de datos, conserva retrocompatibilidad: `loadPanoramaStore` migra el shape legacy `{ event, attendees }` y descarta ítems corruptos sin tirar la app.

## Reglas de dominio / trampas conocidas
- **Moneda CLP (sin decimales)**: montos enteros `$XX.XXX`. División inexacta entre confirmados ⇒ redondeo UP al múltiplo de `$100` (`Math.ceil((total / n) / 100) * 100`) y se muestra el sobrante como pozo común.
- **Cupos y Suplentes**: titulares = primeros N `Voy` por orden de confirmación (`confirmedOrder`); sobrantes van a Lista de Espera. Si un titular pasa a `No puedo`, el primer suplente sube automáticamente al reclasificar.
- **Fechas locales**: siempre hora local (`America/Santiago`), formato `'YYYY-MM-DDTHH:mm'`. Nunca `toISOString()` ni `new Date("AAAA-MM-DD")`: se interpretan en UTC y desplazan el día. El orden del listado compara el string local lexicográficamente.
- **Listado de panoramas**: no se permiten títulos duplicados (`isDuplicatePanoramaTitle`). Eliminar un panorama activo deja `activeId: null`. Validar duplicados ANTES de `setState` (los updaters no corren de forma sincrónica).

## Memoria
- Al empezar, lee `MEMORY.md` para conocer el estado del proyecto y las decisiones tomadas.
- Al terminar una tarea, actualízalo: estado actual, decisiones importantes (con su porqué) y errores a evitar.
- Mantenlo breve (máximo ~50 líneas). Reglas permanentes van aquí, no en memoria.
- No guardes nunca datos sensibles (claves, tokens, datos personales).

## Forma de trabajar
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
- Probar el flujo en navegador (vista móvil 375px): crear, listar, abrir y eliminar panoramas.
- Reiniciar datos de prueba: DevTools → Application → Local Storage → borrar `panoramatch-v1-data`.

# Constitución de PanoraMatch

Principios innegociables: un cambio que viole uno no se fusiona, sin excepciones.

1. **Stack controlado**: solo Next.js (App Router), TypeScript estricto, Tailwind CSS y Supabase (base de datos + Auth de Google). Ninguna dependencia nueva sin permiso explícito del dueño.
2. **La spec manda**: todo cambio se implementa desde su spec en `specs/NNN-nombre/` (`spec.md`, `plan.md`, `tasks.md`); si código y spec divergen, se corrige el código o se enmienda la spec; si falta una decisión, se detiene la tarea y se pregunta.
3. **Lógica pura**: `src/core/` no conoce React, DOM, red, tema ni almacenamiento; el "ahora/hoy" entra siempre como parámetro (`now`); solo interfaz/almacenamiento tocan el reloj y los datos.
4. **Puerta de tests**: `node --test` en verde antes de avanzar; reglas nuevas de `src/core/` llegan con su test primero; jamás instalar paquetes de testing.
5. **Datos y dominio sagrados**: retrocompatibilidad siempre (`localStorage/panoramatch-*` y la BD); montos CLP enteros con redondeo chileno a $100 hacia arriba en divisiones inexactas; fechas solo en hora local `'YYYY-MM-DDTHH:mm'` (jamás UTC/toISOString); RLS y secreto de invitado intactos.
6. **Idiomas fijos**: código e identificadores en inglés; interfaz, comentarios, specs y docs en español.

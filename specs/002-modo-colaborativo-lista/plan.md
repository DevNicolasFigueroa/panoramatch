# Plan 002 — Modo Colaborativo: Lista de aportes (checklist)

**Estado:** borrador (v0.1, 2026-10-19) — el «cómo» que implementa `specs/002-modo-colaborativo-lista/spec.md` ya aprobada (v0.1).

## Enfoque (por capas, de adentro hacia afuera)

1. **Lógica pura primero** (`src/core/`, módulo nuevo): el dominio completo del checklist como funciones sin React/DOM/red — ítems (texto normalizado, máx. 10, duplicados bloqueados), regla de reclamo (solo «Voy» dentro del cupo, un responsable por ítem, libera solo quien lo lleva, una persona puede llevar varios), liberación automática al dejar de ser «Voy», bloqueo de eliminación con responsable (solo el creador elimina ítems libres) y el orden **libres primero, luego tomados** (orden de creación dentro de cada grupo). El cálculo del progreso «X de Y» también nace aquí, para que panel y enlace muestren siempre la misma cuenta.
2. **Persistencia** (capa de datos): una tabla nueva de ítems por panorama ligada por cascada (`panorama_id`, texto, orden de creación y referencia nullable del responsable: `"creator"` o el id del participante). RLS con los principios ya probados en la 001: el creador domina su lista (añadir/eliminar libres); el invitado «Voy» añade ítems y toca **solo su propio reclamo** (tomar un ítem libre o liberar el que él lleva) validado por el secreto en el header; espera y espectadores: solo lectura; jamás escrituras sobre el reclamo ajeno.
3. **Orquestación**: entra al store del dashboard y a la vista del enlace una sección nueva «Lista de aportes» (solo Colaborativo), con escritura optimista y reversión como en los lugares. Cuando un participante cambia su estado fuera de «Voy», el mismo evento de cambio suelta sus reclamos (análogo al retiro de votos del caso límite 6 de la 001).
4. **UI**: el formulario de creación admite la lista opcional de ítems (mismo patrón que los candidatos del Social); el panel del creador y el enlace comparten la sección con distinta autorización (botones «Yo lo llevo»/«Liberar» solo para quien puede; los demás solo leen con nombres). El progreso «X de Y» va encima de la lista.

## Decisiones de diseño

- **Reclamo nullable en la fila del ítem**: el responsable es un dato de la fila con una referencia (creador o participante); tomar = llenarla, liberar = vaciarla. No hay tabla separada de «reclamos»: un ítem tiene 0 o 1 responsable por definición — la regla «un responsable por ítem» vive directamente en el modelo.
- **Identidad real para reclamar**: solo reclaman el creador y quienes tienen identidad propia (enlace con secreto o cuenta). Los anotados a mano sin cuenta no toman ítems (coherente con el alcance de la spec: nada de asignar a nombre de otro); el organizador puede tomar lo que quiera en su propio nombre.
- **El orden se resuelve en la lógica pura**: libres primero y tomados después sale de una única función del módulo core, para que panel y enlace nunca muestren la lista ordenada de forma distinta (mismo principio del desempate alfabético de la 001).
- **Liberación automática en la puerta de estados**: el cambio de estado del asistente es el único disparador; al salir de «Voy» se limpian sus reclamos en la misma escritura optimista, sin trabajos en segundo plano ni temporizadores.
- **Retro-compat gratis**: la tabla nace vacía — panoramas Colaborativos anteriores (si los hay) muestran el checklist vacío con invitación (RF-7) y no se migra nada.

## Riesgos / mitigaciones

- **RLS del reclamo sobre columnas**: dejar al invitado tocar la columna de responsable solo para su propia fila es el patrón de privilegio por columna que ya resolvió el tema de los votos de lugares; escribir el privilegio explícito y la política del dueño del reclamo, y probarlo con REST antes de conectar la interfaz.
- **Escritura optimista con reversión**: un reclamo o liberación fallido revierte la fila local al estado previo con mensaje en español (mismo mecanismo ya usado en candidatos y votos).
- **Orden congelado por test**: el test puro fija el orden esperado (libres primero por creación) para que ninguna presentación de la UI reordene distinto entre panel y enlace.
- **Progreso engañoso**: con lista vacía la UI no muestra «0 de 0» (invitación en su lugar) — cubierto como caso límite con test del cálculo del progreso.

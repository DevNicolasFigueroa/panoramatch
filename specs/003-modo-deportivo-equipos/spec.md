# Spec 003 — Modo Deportivo: Organizador de Equipos

**Estado:** implementado (v0.2, 2026-10-20) · Decisiones del dueño integradas en las preguntas del borrador: sorteo/movimiento **solo del creador**, el sorteo **mantiene a los fijos** y reparte a los libres, el suplente que sube **hereda el asiento vaciente (más antigua, FIFO)**, módulo desde **2 titulares**, equipos **«Equipo A» vs «Equipo B»** renombrables **en cualquier momento y solo por el creador** (máximo 30 caracteres), y el reparto **persiste en la nube** como la asistencia. Ver también `docs/constitution.md`. T1–T9 en `tasks.md` completados; verificación final T10 en verde (tests 99/99, `tsc --noEmit` limpio, build EXIT=0, smoke 375px en dos rondas).

**Depende de:** constitución (`docs/constitution.md`) y las reglas vigentes: creador «Voy» implícito (titular de orden 0, ocupa cupo), titulares = primeros «Voy» por orden de confirmación, Lista de Espera para los sobrantes, modo Deportivo exige cupo mínimo de 2, y auth universal (crear/gestionar exige sesión).

## Contexto y objetivo

Cuando el panorama es de modo **Deportivo (Fútbol/Partido)**, además de la asistencia y los gastos aparece la pregunta típica del partido: **¿quiénes juegan en cada equipo?** Hoy el tablero muestra la lista de titulares y su banco (Lista de Espera), pero repartirlos es un baile de mensajes («tú con ellos, yo con estos»).

Objetivo: un módulo **Organizador de Equipos** en el panel del panorama Deportivo que mantiene a los dos equipos listos en un solo lugar: el creador arma los equipos contra los **titulares reales** (los «Voy» dentro del cupo; el organizador incluido), con un **sorteo equilibrado** de un toque y **movimientos a dedo**, y los equipos se mantienen honestos solos cuando alguien se baja o ya no juega.

Regla de modo: los equipos viven en el panorama Deportivo; los modos Social y Colaborativo no tienen organizador de equipos.

## Usuarios / actores

| Actor | Rol |
| --- | --- |
| **Creador** (autenticado) | Único que ejecuta el sorteo, mueve jugadores entre equipos, los retira a «sin equipo» y renombra los equipos. Es a la vez **jugador titular** (su «Voy» fijo) y puede estar en un equipo como cualquiera. |
| **Titular «Voy» dentro del cupo** (con cuenta o por enlace) | Aparece como jugador de un equipo o en la fila «sin equipo»; ve su equipo y el del rival en todo momento. No puede tocar equipos: es solo lectura para él. |
| **Suplente en Lista de Espera** | No está en ningún equipo; cuando sube a titular hereda el asiento vaciente (RF-8) y pasa a ser jugador visible. |
| **Espectadores** (En duda / No puedo / anotados a mano sin confirmar) | Ven los dos equipos con nombres, conteo y jugadores, en solo lectura. |

## Historias de usuario

- **HU-1** — Como creador de un panorama Deportivo, quiero ver a mis titulares repartidos en dos equipos con su nombre, para dejar de coordinar equipos por chat.
- **HU-2** — Como creador, quiero lanzar un sorteo equilibrado con un toque, para que los equipos queden parejos sin discusiones.
- **HU-3** — Como creador, quiero que el sorteo mantenga a los jugadores que puse a dedo y solo reparta a los que faltan, para que el equipo armado con intención no se desarme.
- **HU-4** — Como creador, quiero mover un jugador de equipo (o sacarlo del equipo) a dedo, para ajustar el partido según quién realmente juega.
- **HU-5** — Como creador, quiero renombrar «Equipo A» y «Equipo B» con los apodos reales del grupo, para que el partido se sienta el nuestro.
- **HU-6** — Como titular o espectador, quiero ver los dos equipos y quién quedó dónde, sin poder tocar nada, para saber con quién jugaré antes de llegar a la cancha.
- **HU-7** — Como grupo, quiero que los equipos se actualicen solos cuando un titular se baja o un suplente sube, para que la alineación no mienta.

## Requisitos funcionales (criterios EARS en español)

**RF-1 · Módulo solo en Deportivo, visible para todos.**
CUANDO el panorama esté en modo Deportivo, EL SISTEMA DEBERÁ mostrar el Organizador de Equipos con los dos equipos en el panel del creador y en la vista del enlace.
SIEMPRE QUE el panorama sea Social o Colaborativo, EL SISTEMA NO DEBERÁ mostrar el módulo.

**RF-2 · Nombres de los equipos.**
CUANDO se cree un panorama Deportivo, EL SISTEMA DEBERÁ inicializar los equipos con los nombres «Equipo A» y «Equipo B» (sin pedir nombres al crear).
CUANDO el creador renombre un equipo (en cualquier momento), EL SISTEMA DEBERÁ aceptar el nombre nuevo de hasta 30 caracteres (no vacío y distinto del otro equipo, sin contar mayúsculas ni espacios de sobra) y conservar intactas las asignaciones de jugadores.
SIEMPRE QUE un no-creador intente renombrar, EL SISTEMA NO DEBERÁ permitirlo.

**RF-3 · Composición: solo titulares, organizador incluido.**
EL SISTEMA DEBERÁ considerar jugadores elegibles para los equipos únicamente a los titulares («Voy» dentro del cupo, **organizador incluido** como titular de orden 0).
SIEMPRE QUE alguien esté en Lista de Espera o sea espectador (En duda / No puedo), EL SISTEMA NO DEBERÁ incluirlo en ningún equipo ni en la fila «sin equipo».

**RF-4 · Sorteo equilibrado del creador.**
CUANDO el creador lance el sorteo, EL SISTEMA DEBERÁ repartir entre ambos equipos a los titulares que estén **sin equipo**, **manteniendo tal cual** a los que ya tienen equipo (asignados a dedo o por herencia).
EL SISTEMA DEBERÁ lograr tras el sorteo una diferencia de jugadores entre los dos equipos de como máximo 1 (p. ej. con 5 titulares: 3 contra 2).
SI existan menos de 2 titulares, EL SISTEMA NO DEBERÁ permitir sortear y mostrará la invitación a esperar confirmaciones.
SI no existan titulares sin equipo al sortear, EL SISTEMA DEBERÁ informarlo y no alterar ningún equipo.

**RF-5 · Sorteo determinista y comprobable.**
SIEMPRE QUE se ejecute el sorteo con los mismos datos de entrada (mismos titulares, mismas asignaciones vigentes y misma semilla), EL SISTEMA DEBERÁ producir exactamente el mismo reparto; con otra semilla, otro reparto legítimo permitido.
EL SISTEMA DEBERÁ definir el balance como regla fija de la lógica y la variedad solo por la semilla (regla 100% determinista, comprobable con pruebas puras; sin azar invisible).

**RF-6 · Movimiento a dedo del creador.**
CUANDO el creador mueva un titular de un equipo al otro (o lo retire a «sin equipo»), EL SISTEMA DEBERÁ aplicar el cambio al instante y dejar los equipos consistentes, sin necesidad de re-sorteo.
SIEMPRE QUE un no-creador intente mover jugadores, EL SISTEMA NO DEBERÁ permitirlo (solo lectura).

**RF-7 · Baja automática del titular.**
SIEMPRE QUE un titular asignado a un equipo deje de ser titular (pase a «En duda», a «No puedo» o caiga a Lista de Espera), EL SISTEMA DEBERÁ sacarlo de su equipo al momento y dejar **vacante un asiento en su equipo** (sin reordenar a los demás).

**RF-8 · Herencia del suplente que sube.**
CUANDO un suplente suba a titular, EL SISTEMA DEBERÁ asignarle automáticamente el asiento vaciente **más antigua disponible (FIFO)**, heredando ese equipo.
DONDE no existan asientos vacientes, EL SISTEMA DEBERÁ dejarlo en la fila «sin equipo», listo para el siguiente sorteo o para que el creador lo mueva a dedo.

**RF-9 · Estado visible, con conteo y persistente.**
EL SISTEMA DEBERÁ mostrar a todos los actores los dos equipos (nombre, conteo de jugadores y jugadores en orden de confirmación), la fila «sin equipo» cuando exista y la invitación o el estado del sorteo cuando corresponda.
EL SISTEMA DEBERÁ reflejar cualquier cambio (sorteo, movimiento, renombrado, baja, herencia) al instante para todos, y el reparto **debe sobrevivir recargas y cambio de dispositivo** (vive en la nube con el panorama, igual que la asistencia y las votaciones).

## Requisitos no funcionales

- **Determinismo puro**: las reglas del sorteo, balance, herencia y baja viven en la lógica pura del núcleo y son 100% comprobables con `node --test` (constitución P3/P4): misma entrada → misma salida, sin reloj ni azar invisible.
- **Accesibilidad móvil**: botones de al menos 44px en táctil, referencia 375px; textos en español (constitución, P6).
- **Color como información**: cada equipo se distingue con un par de kits de color vigentes del sistema, siempre el mismo par (identidad estable del equipo, no decoración).
- **Confianza**: si un cambio no logra grabarse en la nube, se revierte y se avisa en español; los equipos jamás muestran un reparto que no coincida con los titulares reales.
- **Retrocompatibilidad**: los panoramas Deportivos creados antes abren con equipos vacíos («Equipo A»/«Equipo B») y no pierden nada existente.

## Casos límite

1. Deportivo recién creado (0 titulares) → módulo visible con equipos vacíos; sorteo bloqueado con invitación a esperar confirmaciones.
2. Un solo titular → solo lectura con invitación a esperar; no se puede sortear (mínimo 2).
3. Titulares impares → sorteo deja diferencia 1 (3 contra 2); nadie queda «sin equipo» tras el sorteo.
4. Todos los titulares ya tienen equipo → el sorteo avisa «no hay titulares libres para repartir» y no cambia nada.
5. El organizador es jugador y el creador (él mismo) lo mueve → permitido; no existe «el organizador se baja» (su Voy es fijo).
6. Sortear dos veces con la misma semilla → resultados idénticos (nadie cambia de equipo).
7. Fijos concentrados en un equipo (desbalance a dedo) → permitido; el sorteo rellena solo los libres y no traslada fijos para «equilibrar», dejando la diferencia final ≤ 1 incorporando a los libres.
8. Titular se baja → sale del equipo dejando vacante; el equipo puede quedar momentáneamente desbalanceado hasta que un suplente herede (RF-8) o el creador mueva a dedo.
9. Dos titulares se bajan (uno por equipo) y suben dos suplentes → cada suplente hereda la vacante más antigua, una por una (FIFO).
10. Sube un suplente sin vacientes → queda «sin equipo» hasta sorteo o movimiento a dedo.
11. Renombrar un equipo con jugadores → nombres cambian, asignaciones intactas.
12. Renombrar con texto vacío, más de 30 caracteres o equivalente al otro equipo (mayúsculas/espacios de sobra) → bloqueado con mensaje en español.
13. Espectador o suplente intenta sortear/mover/renombrar → bloqueado; su vista es de solo lectura, aunque ve los equipos completos.
14. Un titular «anotado a mano» (agregado por el creador) confirmado «Voy» dentro del cupo → jugador elegible como cualquier otro.
15. Los equipos siempre existen en Deportivo (los dos, con nombre) → nunca hay tercer grupo ni titulares huérfanos ocultos: la fila «sin equipo» es visible y con nombre.

## Fuera de alcance (esta versión)

- Marcador, goles, faltas, minutos, tarjetas o cronómetro del partido.
- Más de dos equipos o equipos por jornada (la base es tú contra ellos: 2 equipos fijos).
- Balance por habilidad, posición o rating (solo equilibrio por **cantidad**).
- Auto-asignación del jugador a sí mismo (los equipos los decide el creador).
- Historial de sorteos y deshacer específico (corregir a dedo es la vía).
- Cambiar el cupo luego de creado (si aumentara, el nuevo titular queda «sin equipo» por RF-8).
- Exportar/compartir la alineación como imagen; comentarios por equipo; afinidades («quiero jugar con X»).
- Equipos en los modos Social y Colaborativo.
- Persistencia local alternativa del reparto (sigue la misma vía de la nube que la asistencia).

## Criterios de finalización

- Cada RF verificado uno a uno contra su criterio EARS.
- Los 15 casos límite revisados manualmente en navegador (referencia 375px): creación Deportiva 0 titulares, mínimo 2, sorteo par/impar, fijos conservados, movimiento a dedo, renombrado (máximo/distinto), baja de titular con vacante, herencia FIFO del suplente (simple y doble), bloqueos de solo-lectura y persistencia tras recarga/cambio de dispositivo.
- Puerta `node --test` en verde cubriendo las reglas nuevas: determinismo (misma semilla = mismo reparto; otra semilla = otro), balance ≤ 1, fijos no tocados, mínimo de titulares, baja automática con vacante, herencia FIFO y validación de nombres (no vacío/máximo 30/distinto del otro).
- Revisión del dueño: crear Deportivo, confirmar jugadores, sorteos reales con movimientos a dedo en el medio, bajarse un titular y ver al suplente heredar su asiento — en panel y enlace (ventana privada con sesión).

## Dudas abiertas

- Ninguna: las tres del borrador quedaron integradas con las recomendaciones — **persistencia en la nube** (como la asistencia), **herencia FIFO** de la vacante más antigua y **renombrado en cualquier momento** con máximo de 30 caracteres.

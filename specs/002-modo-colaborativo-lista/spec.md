# Spec 002 — Modo Colaborativo: Lista de aportes (checklist)

**Estado:** aprobada por el dueño (v0.1, 2026-10-19) · Decisiones integradas durante la redacción: espectadores ven los nombres y los ítems libres van primero.
**Depende de:** constitución (`docs/constitution.md`) y las reglas de panorama ya vigentes con la spec 001 (creador con sesión, invitados sin cuenta por enlace, cupos y Lista de Espera, creador «Voy» implícito).

## Contexto y objetivo

Al crear un panorama en modo **Colaborativo (Asado/Junta)**, el creador puede — opcionalmente — armar una lista de **cosas necesarias para llevar** (ej. «Carbón», «2 bolsas de hielo», «Bebidas», «Parrilla»). Esta lista es un **checklist de aportes**: los asistentes que van confirman qué cargan con un «Yo lo llevo» y pueden liberar el ítem si deja de poder llevarlo. El resto del grupo ve en todo momento quién lleva qué y cuánta lista ya tiene responsable.

Objetivo: reemplazar el ping-pong «¿quién lleva el carbón?» por una lista viva donde el compromiso queda anotado, visible y con progreso.

Regla de modo: la lista vive en el panorama Colaborativo; los otros dos modos (Social, Deportivo) no tienen checklist de aportes.

## Usuarios / actores

| Actor                                                                 | Rol                                                                                                                                                                                             |
| --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Creador** (autenticado)                                             | Crea el panorama con la lista opcional; añade ítems nuevos; elimina **solo ítems libres**. Es «Voy» permanente (asistente implícito): puede asignarse y liberar como cualquiera de los que van. |
| **Confirmado «Voy» dentro del cupo** (cuenta propia o enlace)         | Ve el checklist, se asigna ítems libres («Yo lo llevo»), libera los que él lleva y propone ítems que faltaron.                                                                                  |
| **Confirmado en Lista de Espera** (solo con cupo definido)            | Ve el checklist con responsables, progreso y su posición; **no** puede asignarse ni liberar nada.                                                                                               |
| **Espectadores** (En duda / No puedo / anotados a mano sin confirmar) | Ven la lista con el estado de cada ítem (incluido el **nombre** de quién lo lleva) y el progreso general; no tocan nada.                                                                        |

## Historias de usuario

- **HU-1** — Como creador, al crear un panorama Colaborativo quiero anotar una lista de cosas a llevar (opcional), para que el grupo sepa qué necesita el asado desde el minuto uno.
- **HU-2** — Como confirmado «Voy», quiero asignarme un ítem libre con «Yo lo llevo» (uno o varios), para que nadie más lo duplique y quede claro qué traigo.
- **HU-3** — Como confirmado «Voy», quiero liberar un ítem que ya no puedo llevar, para que otro tome su lugar y la lista no quede mintiendo.
- **HU-4** — Como creador o confirmado «Voy», quiero sumar al checklist algo que se nos olvidó cuando el panorama ya existe (ej. «lechuga»), para que la lista crezca con las necesidades reales.
- **HU-5** — Como creador, quiero eliminar un ítem libre que ya no aplica (ej. la parrilla la traigo yo siempre), para que la lista no acumule basura.
- **HU-6** — Como espectador, quiero ver quién lleva cada ítem y cuánta lista tiene responsable, para enterarme del avance aunque no participe.

## Requisitos funcionales (criterios EARS en español)

**RF-1 · Lista opcional al crear (modo Colaborativo).**
CUANDO el usuario selecciona el modo Colaborativo al crear un panorama, EL SISTEMA DEBERÁ ofrecer añadir ítems a la lista de aportes de forma opcional.
SI la lista queda vacía, EL SISTEMA DEBERÁ permitir crear el panorama igual (checklist parte «sin ítems»).

**RF-2 · Añadir ítems después del creado.**
CUANDO el panorama esté creado, EL SISTEMA DEBERÁ permitir al creador y a los confirmados «Voy» dentro del cupo añadir ítems (texto breve).
SIEMPRE QUE existan ya 10 ítems, EL SISTEMA DEBERÁ rechazar el 11.º indicando el máximo.
SI un ítem repite nombre de otro (sin mayúsculas ni espacios de sobra), EL SISTEMA DEBERÁ bloquearlo con mensaje visible; la cantidad es parte del texto («2 bolsas de hielo»), no un dato aparte.

**RF-3 · Asignación «Yo lo llevo».**
CUANDO un confirmado «Voy» dentro del cupo (creador incluido) marque un ítem **libre** como «Yo lo llevo», EL SISTEMA DEBERÁ asignarlo con su nombre al instante, sin confirmación previa de nadie.
SIEMPRE QUE un ítem ya tenga responsable, EL SISTEMA NO DEBERÁ permitir que otra persona se lo asigne (un responsable por ítem).
EL SISTEMA DEBERÁ permitir que una misma persona lleve varios ítems a la vez.

**RF-4 · Liberar el ítem propio.**
CUANDO el responsable de un ítem lo libere, EL SISTEMA DEBERÁ devolverlo a «sin responsable» y quedará disponible para que otro «Voy» lo tome.
SIEMPRE QUE alguien que no es el responsable actual intente liberar el ítem, EL SISTEMA NO DEBERÁ permitirlo (libera solo quien lo lleva).

**RF-5 · Liberación automática por salida.**
SIEMPRE QUE el responsable de un ítem deje de estar «Voy» (pase a «En duda», a «No puedo» o caiga a Lista de Espera por el cupo), EL SISTEMA DEBERÁ liberar automáticamente todos sus ítems al momento, sin pasos extra para nadie.

**RF-6 · Eliminar ítems.**
CUANDO el creador quiera eliminar un ítem **libre**, EL SISTEMA DEBERÁ permitirlo.
SIEMPRE QUE el ítem tenga responsable, EL SISTEMA NO DEBERÁ permitir eliminarlo: se muestra a la persona que lo lleva, quien debe liberarlo primero.
EL SISTEMA NO DEBERÁ permitir a asistentes eliminar ítems (ni los que ellos mismos propusieron).

**RF-7 · Progreso y estado visibles, ítems libres primero.**
EL SISTEMA DEBERÁ mostrar a todos (incluidos espectadores y el enlace) el estado de cada ítem («libre» o el **nombre** de su responsable) y el progreso general «X de Y ítems ya tienen responsable».
EL SISTEMA DEBERÁ ordenar la lista con los ítems **libres primero** y después los que ya tienen responsable (así lo próximo por tomar es lo primero que se ve); dentro de cada grupo se conserva el orden de creación.
DONDE la lista esté completa (X = Y), EL SISTEMA DEBERÁ mostrar el progreso como completo.
DONDE la lista esté vacía, EL SISTEMA DEBERÁ mostrar una invitación a añadir lo primero en lugar de un progreso engañoso.

**RF-8 · Permisos de espera y espectadores.**
SIEMPRE QUE un confirmado en Lista de Espera o un espectador (En duda / No puedo) intente asignarse o liberar un ítem, EL SISTEMA NO DEBERÁ permitirlo y le mostrará la lista solo de lectura (con nombres de responsables, RF-7).

## Requisitos no funcionales

- **Accesibilidad móvil**: botones de al menos 44px en táctil, referencia 375px; todo en español (constitución, P6).
- **Color como información**: «libre» vs. «llevado por alguien» usan los kits de color vigentes para invitar la acción correcta (libre invita a tomar, llevado muestra compromiso); sin decoración extra.
- **Eficiencia**: asignar o liberar un ítem en un toque como máximo desde la fila; la lista y el progreso sobreviven recargas y cambio de dispositivo para quien tenga el enlace.
- **Confianza**: si un cambio no logra grabarse en la nube, se revierte y se avisa en español (la lista jamás miente a medias).

## Casos límite

1. Colaborativo creado sin ítems → checklist arranca vacío con invitación a añadir; el progreso no se muestra como «0 de 0».
2. Ítem 11.º → rechazado con mensaje del máximo 10.
3. Ítem duplicado con variaciones de mayúsculas/espacios → bloqueado; mismo texto normalizado cuenta como repetido.
4. El responsable pasa a «En duda» o «No puedo» → sus ítems quedan libres al momento (RF-5) y otros toman.
5. El responsable entra a Lista de Espera (cupo lleno) → sus ítems quedan libres igual; al volver a subir dentro del cupo no recupera los que ya tomó otro.
6. Una persona lleva 2 ítems y libera uno → el otro sigue con su nombre intacto.
7. Creador intenta eliminar un ítem que alguien lleva → bloqueado con aviso de quién lo lleva.
8. Un invitado del enlace «Voy» se asigna y luego libera → funciona con su identidad sin cuenta igual que con cuenta.
9. En espera / En duda / No puedo intentan «Yo lo llevo» → bloqueado con mensaje en español; la vista es de solo lectura para ellos (pero ven quiénes llevan qué).
10. El creador (que es «Voy» permanente) se asigna ítems → permitido; al no poder salir nunca de «Voy», no existe el caso de liberación por bajada para él.
11. Al liberar un ítem, este vuelve al grupo de arriba (libres) y aparece al tope para que otro lo tome.
12. Todos los ítems con responsable → progreso completo y destacado, sin bloquear que alguien libere.

## Fuera de alcance (esta versión)

- Contribuciones monetarias: los ítems **no** alteran el costo total ni la boleta CLP; el aporte es en especie (la balanza de gastos por partida queda para un feature propio).
- Marcar ítems como «ya lo dejé en la casa», entregado o auditado.
- Campo de cantidad separado (número + unidad); la cantidad vive dentro del texto del ítem.
- Varios responsables por el mismo ítem (reparto compartido).
- Editar el texto de un ítem ya creado (radica en: se elimina el libre y se crea uno nuevo).
- Comentarios, fotos, enlaces de compra o reacciones por ítem.
- Notificaciones (push/email) cuando alguien tome o libere algo.
- Checklist de aportes en los modos Social y Deportivo.
- Reasignación a dedo por parte del creador (asignar a nombre de otro).

## Criterios de finalización

- Cada RF verificado uno a uno contra su criterio EARS.
- Los 12 casos límite revisados manualmente en navegador (referencia 375px): creación con y sin ítems, asignar/liberar, añadir después, liberación automática al bajarse, orden de libres primero, bloqueos de espera/espectadores, máximo y duplicados.
- Puerta `node --test` en verde cubriendo las reglas nuevas: autorización de asignar/liberar, un responsable por ítem, liberación automática por salida, orden libres-primero, máximo 10, duplicados y bloqueo de eliminación con responsable.
- Revisión del dueño: crear Colaborativo con lista, responder del invitado por enlace en ventana privada, progreso y liberación en pantalla.

## Dudas abiertas

- Ninguna: la spec quedó aprobada en v0.1 con las dos decisiones del borrador integradas — los espectadores **ven el nombre** de quién lleva cada ítem y el listado ordena **ítems libres primero** y luego los tomados.

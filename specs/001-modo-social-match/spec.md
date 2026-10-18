# Spec 001 — Modo Social: Match de lugares

**Estado:** aprobada por el dueño (v1.0, 2026-10-18)
**Depende de:** constitución (`docs/constitution.md`), integración Supabase + invitados sin cuenta (V2).

## Contexto y objetivo

Al crear un panorama en modo **Social**, el creador puede — opcionalmente — armar una lista de **lugares candidatos** ("¿a qué bar vamos?"), y añadir más después. Los votantes autorizados eligen **un** lugar favorito; pueden cambiarlo mientras la votación esté abierta. El lugar más votado es el **Match**; el creador puede declararlo y al hacerlo la votación se cierra para siempre. En empate, el creador decide.

Regla de modo: en **Social no existen titulares ni suplentes** (no es un partido). Votan el creador y **todos los participantes "Voy"**, incluso si el panorama lleva cupo definido.

Objetivo: reemplazar el "¿dónde vamos?" interminable por una votación simple, visible para todos, sin obligar a registrarse.

## Usuarios / actores

| Actor | Rol |
|---|---|
| **Creador** (autenticado) | Añade/elimina candidatos, vota por sí, **vota a nombre de** los confirmados que él anotó (delegación), declara el Match y desempata. |
| **Confirmado "Voy"** (participante del panorama) | Propone candidatos y vota desde su vista (cuenta propia o enlace). |
| **Invitado externo sin cuenta** | Si su estado es "Voy": propone y vota desde el enlace. Cualquier otro estado del enlace: solo lectura. |
| **Espectadores** (En duda / No puedo / invitados sin estado "Voy") | Ven candidatos, conteos exactos y el estado del Match; no votan. |

## Historias de usuario

- **HU-1** — Como creador, al crear un panorama Social quiero anotar lugares candidatos (opcional) y añadir más con el panorama abierto, para que el grupo elija el destino sin battles de WhatsApp.
- **HU-2** — Como confirmado "Voy", quiero proponer un lugar nuevo y votar mi favorito, para que mi propuesta entre a la lista.
- **HU-3** — Como creador, quiero el lugar con más votos marcado como "Match" y poder declararlo, para fijar el plan oficial.
- **HU-4** — Como creador, quiero desempatar eligiendo entre empatados, para que la decisión no quede trizada.
- **HU-5** — Como creador, quiero votar a nombre de cada confirmado que yo anoté, para que también cuente su preferencia (la persona no tiene acceso al enlace; pero es confirmada).
- **HU-6** — Como espectador, quiero ver la lista con conteos exactos, para enterarme aunque no vote.

## Requisitos funcionales (criterios EARS en español)

**RF-1 · Candidatos al crear (modo Social).**
CUANDO el usuario selecciona el modo Social al crear un panorama, EL SISTEMA DEBERÁ ofrecer añadir lugares candidatos de forma opcional.
SI la lista queda vacía, EL SISTEMA DEBERÁ permitir crear el panorama igual (votación parte "sin candidatos").

**RF-2 · Candidatos después del creado.**
CUANDO el panorama esté abierto y no exista Match declarado, EL SISTEMA DEBERÁ permitir a creador y confirmados "Voy" añadir candidatos (texto breve).
SIEMPRE QUE existan ya 10 candidatos, EL SISTEMA DEBERÁ rechazar el 11.º indicando el máximo.
SI un candidato repite nombre de otro (sin mayúsculas ni espacios de sobra), EL SISTEMA DEBERÍA bloquearlo con mensaje visible.
CUANDO un candidato tenga 0 votos, EL SISTEMA DEBERÁ permitir al creador eliminarlo.

**RF-3 · Un voto por votante / panorama.**
CUANDO un votante (creador o confirmado "Voy") marque un candidato con la votación abierta, EL SISTEMA DEBERÁ registrar un único voto vigente para ese votante y panorama.
CUANDO el mismo votante marque otro candidato con la votación abierta, EL SISTEMA DEBERÁ reemplazar su voto (cambiar es permitido mientras esté abierta).

**RF-4 · Delegación del creador.**
CUANDO el creador clasificara la lista de votantes que él mismo anotó y esté "Voy", EL SISTEMA DEBERÁ permitirle votar a nombre de ese participante (un voto por persona).
DONDE exista un confirmado con identidad propia (añadido vía enlace o sesión de Google), EL SISTEMA NO DEBERÁ permitir al creador votar en su reemplazo: esa persona decide por sí misma.

**RF-5 · Match y empate en pantalla.**
SIEMPRE QUE exista candidato líder único con ≥ 1 voto y no haya Match declarado, EL SISTEMA DEBERÁ mostrarlo como "Match actual".
CUANDO dos o más candidatos empaten en el liderato, EL SISTEMA DEBERÁ mostrar explícitamente el estado "empate".
SI nadie ha votado, EL SISTEMA DEBERÁ mostrar "sin votos todavía".

**RF-6 · Declarar Match y cierre.**
CUANDO el creador pulse "Declarar Match" con líder único, EL SISTEMA DEBERÁ fijar ese candidato como Match.
CUANDO haya empate, EL SISTEMA DEBERÁ pedir al creador elegir entre los empatados antes de declarar.
CUANDO el Match esté declarado, EL SISTEMA DEBERÁ cerrar la votación: no se podrá votar, cambiar votos, ni añadir/eliminar candidatos; el Match se muestra como definitivo.
El conteo con la votación cerrada queda congelado tal como estaba.

**RF-7 · Conteos visibles.**
EL SISTEMA DEBERÁ mostrar a todos (incluso no votantes) la lista ordenada por votos descendente, con el número exacto de votos por candidato; empates rotos por orden alfabético.
DONDE exista el enlace compartido, EL SISTEMA DEBERÁ mostrar la misma lista con conteos a los invitados.

**RF-8 · Deuda técnica: la fecha actual se inyecta.**
CUALQUIER función de la lógica que necesite el "hoy/ahora" DEBERÁ recibirlo como parámetro explícito; la lógica no lo obtiene por sí sola. La fecha real se lee en la capa de interfaz y pasa hacia abajo. El cálculo del "hoy por defecto" del formulario se considera parte de esta deuda.

## Requisitos no funcionales

- **Accesibilidad/tabla móvil**: botones ≥ 44px táctiles, 375px de referencia; español (constitución, P6).
- **Color como información**: candidato líder / empate / sin votos usan los kits de color vigentes; sin decoración extra.
- **Eficiencia**: votar o proponer ≤ 2 toques; los conteos y el Match sobreviven recargas y cambio de dispositivo por quien tenga el enlace guardado.

## Casos límite

1. Panorama Social creado sin candidatos → sección "¿A dónde vamos?" arranca vacía con invitación a proponer.
2. Candidato 11.º → rechazado con mensaje de máximo 10.
3. Candidato duplicado (mayúsculas/espaces distintos) → bloqueado; el mismo texto normalizado cuenta como repetido.
4. Eliminar candidato con 0 votos solo por el creador → permitido; con ≥1 votos → bloqueado (se muestra el conteo y se ofrece cambiar votos).
5. Quedan solo 2 candidatos o solo uno → la votación sigue operando con lo presente.
6. Confirmado pasa a "En duda"/"No puedo" con voto vigente → su voto expira al momento (comienza a contar desde otras personas).
7. Confirmado "Voy" fuera de cupo (panorama con cupo en Social) → es votante igual (Social no distingue titular/suplente).
8. Empate total (dos o más candidatos dentro del conteo) → estado "empate" y desempate solo del creador.
9. Cambio de voto tras Match declarado → rechazado (votación cerrada).
10. Un candidato añadido después de otros → el Match puede ser un lugar añadido tarde (no requiere antigüedad).

## Fuera de alcance (esta versión)

- Mapas, horarios de concurrir y enlaces externos (Google Maps etc.).
- Reabrir la votación una vez que el Match fue declarado.
- Comentarios, fotos, categorías o reacciones por candidato.
- Votación de lugares en Colaborativo/Deportivo (specs 002/003).
- Notificaciones (push/email) ante cambios del Match.
- Dejar cambiar el Match declarado, Prism any extension/deadline.

## Criterios de finalización

- Cada RF verificado uno a uno contra su criterio EARS.
- Los 10 casos límite revisados manualmente en navegador.
- Puerta `node --test` en verde cubriendo las reglas nuevas (conteo, empate, válido/autorizado, máximo, duplicados, cierre).
- RF-8 saldado: la función de "hoy" local acepta el valor como parámetro y la UI pasa su valor.
- Revisión del dueño (375px): creación con candidatos, voto/cambio de voto, desempate, Match declarado, vista del enlace.

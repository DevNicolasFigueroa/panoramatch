# Plan 003 — Modo Deportivo: Organizador de Equipos

**Estado:** borrador (v0.1, 2026-10-20) — el «cómo» que implementa `specs/003-modo-deportivo-equipos/spec.md` (v0.2, pendiente de aprobación explícita del dueño).

## Enfoque (por capas, de adentro hacia afuera)

1. **Lógica pura primero** (módulo nuevo en `src/core/`): el dominio completo de equipos sin React/DOM/red — estado de equipos (nombres A/B + asignaciones de titulares + vacantes por orden de antigüedad), sorteo equilibrado determinista con semilla, movimiento a dedo, reglas de nombres (≤30 car., no vacío, distinto del otro sin mayúsculas ni espacios de sobra) y las dos transiciones automáticas: baja de titular (libera su asiento y DEJA una vacante ordenada) y subida de suplente (hereda la vacante más antigua, FIFO; sin vacantes queda «sin equipo»). Toda transición recibe los titulares reales como entrada: los equipos son SIEMPRE un subconjunto de los titulares vigentes (cualquier asignación huérfana se purga al recalcular).
2. **Persistencia**: dos piezas — nombres de equipos como columnas nuevas legibles del panorama (nullable: los Deportivos anteriores caen en «Equipo A»/«Equipo B», retro-compat gratis) y filas de asignación/vacante en tablas nuevas por panorama con cascada. La vacante es una fila con sello de tiempo: se crea al renunciar un titular y se elimina cuando un suplente la hereda; la fila de asignación apunta al jugador por referencia (`'creator'` para el organizador virtual o id de participante — mismo patrón de referencia que los reclamos de la 002, ya que el creador no tiene fila en `participants`).
3. **Orquestación**: entra al store y a la vista del enlace como sección nueva «Organizador de Equipos» (solo Deportivo), con escritura optimista y reversión como en la asistencia. La baja de titular (cambio de estado a «En duda»/«No puedo»/espera) encadena en la misma escritura: liberar la asignación + crear la vacante; la subida del suplente encadena heredar la vacante más antigua disponible. La semilla del sorteo la genera la interfaz en el momento del toque (el determinismo vive en la función pura para pruebas; no se persiste).
4. **UI**: sección compartida por panel y enlace con dos tarjetas de equipo (nombre editable inline solo para el creador, cabezal con conteo), fila visible «Sin equipo» cuando exista, botón de sorteo habilitado desde 2 titulares y avisos en español según el estado («no hay titulares libres para repartir» incluido). Los no-creadores ven todo en solo lectura. Cada equipo lleva SIEMPRE uno de los dos kits de color del sistema (mismo par fijo: identidad estable, color = información).

## Decisiones de diseño

- **Vacante explícita en tabla propia**: el «asiento dejado por quien se bajó» es un dato (con antigüedad), no algo derivable de las asignaciones vivas; así la herencia FIFO de la spec es una consulta exacta y el historial de renuncias sobrevive recargas sin reconstruir nada.
- **Un único escritor para lo manual + «fila propia» para lo automático**: movimiento a dedo, sorteo y renombrado los ejecuta el creador contra su sesión; pero la baja (el titular se baja él mismo) y la herencia (el suplente sube al responder «Voy») las gatilla un no-creador. El modelo RLS separa ambas vías: nadie excepto el creador toca asignaciones AGENAS, mientras que cada participante puede liberar SU propia asignación y heredar su propia fila al subir (atado a que su fila esté «Voy» dentro del cupo).
- **Balance pragmático cuando los fijos no lo permiten**: la regla del núcleo es alternar los libres hacia el equipo más chico con desempate por semilla; la diferencia ≤ 1 se alcanza siempre que sea posible, y cuando los fijos concentrados la hacen inalcanzable (ej. 4 fijos vs 0), el sorteo se acerca lo máximo posible SIN tocar fijos ni mover gente en contra (caso límite 7 de la spec).
- **El orden dentro del equipo es el orden de confirmación**: la alineación se lista por `confirmedOrder` (organizador primero); la posición en el equipo no es una columna más, se lee de las reglas vigentes — cero estado duplicado.
- **Purga por recálculo en la puerta de estados**: cada vez que cambian los titulares, el núcleo recalcula y descarta asignaciones de jugadores que ya no son titulares; los equipos jamás muestran a alguien que no juega.
- **Retro-compat gratis**: columnas nulas + tablas que nacen vacías; los Deportivos previos abren con equipos vacíos y nombres por defecto sin migración de datos.

## Riesgos / mitigaciones

- **Carrera en la herencia FIFO**: dos suplentes subiendo a la vez pueden apuntar a la misma vacante. Mitigación: reclamar por «eliminar la vacante y devolverla» (el segundo obtiene la siguiente más antigua) y, como cinturón, transacción definida en el servidor para el reclamo con fila bloqueada — mismo espíritu del lock por panorama de `confirmed_order`.
- **RLS de dos vías (creador vs fila propia)**: probar con REST antes de conectar la interfaz: el creador inserta/mueve/borra cualquiera de sus asignaciones; un participante solo toca la suya; los espectadores y espera no insertan nada; nadie renombra sin ser creador. Grants por columna explícitos desde el inicio (lección de la 002).
- **Escritura encadenada (estado + asignación + vacante) a medias**: si el cambio de estado se graba pero la vacante no, el reparto miente. Mitigación: encadenar en una sola acción del store con reversión completa y, para la herencia, la operación transaccional del servidor.
- **Botón de sorteo confuso**: inhibido con razón visible (< 2 titulares; «no hay titulares libres») y deshabilitado, jamás silencioso; el determinismo garantiza que probar dos veces no «desarme» equipos fijos.

## Constrains heredados (no negociables)

- Los montos CLP, fechas locales `'YYYY-MM-DDTHH:mm'`, el creador «Voy» implícito y `confirmed_order` asignado solo por el trigger NO cambian: este módulo solo LEE esas reglas del núcleo, no las reimplementa.
- Textos e interfaz en español, etiqueta de modo genérica («Deportivo») y código/funciones en inglés.
- Nada de esto toca Social/Colaborativo: sus secciones ni pantallas no se modifican.

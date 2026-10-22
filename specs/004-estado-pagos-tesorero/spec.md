# Spec 004 — Control de Pagos y Tesorería

**Estado:** borrador (v0.2, 2026-10-21) · Decisiones del dueño cerradas en la sesión de borrador: estados de pago en 3 pasos (**Pendiente → En revisión «Ya transferí» → Pagado**) más el cierre **«Reembolsada»** para devoluciones; datos bancarios en **un solo bloque de texto libre** copiable en un toque (opcional); se cobra siempre la **cuota actual** (titulares vigentes, redondeo chileno a $100 hacia arriba); **Caso A**: baja de un pagado → devolución por el 100% de lo transferido; **Caso B**: la cuota baja por nuevos confirmados → «Devolución / Saldo a favor» por la diferencia; **cuota que sube tras un pago → adeudo de la diferencia**; módulo en **los tres modos** pero **desestimado si el organizador no provee datos bancarios**; costo total $0 **oculta el módulo**; en el enlace el tablero es **solo lectura** con acción **solo sobre la fila propia**. Ver también `docs/constitution.md`.

**Depende de:** constitución y las reglas vigentes: creador «Voy» implícito (titular de orden 0, ocupa cupo), titulares = primeros «Voy» por orden de confirmación, moneda CLP entera con redondeo a $100 hacia arriba en divisiones inexactas (la cuota que ya compone la boleta), costo total opcional (0 = sin gasto) y auth universal (crear/gestionar exige sesión).

## Contexto y objetivo

Hoy la boleta divide el costo total entre los titulares y muestra cuánto paga cada uno, pero **nadie sabe si la plata llegó**: el cobro vive en WhatsApp con capturas, cuentas al ojo y reembolsos olvidados. El módulo **Control de Pagos y Tesorería** mantiene el ciclo completo de la cuota en un solo lugar: datos de transferencia copiables en un toque, cada asistente titular marca **«Ya transferí»**, el organizador confirma **«Pagado»** con el monto exacto, y cuando alguien se baja o la cuota baja, el sistema **calcula las devoluciones** automáticamente con su registro de monto y su cierre «Reembolsada».

Regla de modo: el módulo vive en los tres modos (Social, Colaborativo y Deportivo), en el panel del creador y en el enlace; solo depende de que exista **cuota que cobrar** y **datos bancarios definidos**.

## Usuarios / actores

- **Creador / organizador (sesión)**: dueño de la tesorería. Define y edita el bloque de datos bancarios; confirma «Pagado» y sus montos (también a filas anotadas a mano); marca devoluciones como «Reembolsada»; revierte estados por error; ve los totales de tesorería. Él también es un **titular** (orden 0): aparece en el tablero y puede llevar su propio pago.
- **Asistente titular con cuenta (invitado del enlace)**: ve el tablero completo solo lectura y actúa **solo en su fila**: marcar «Ya transferí» y retractarse mientras no esté confirmado.
- **Asistentes sin acción propia**: suplentes (Lista de Espera), «En duda» y «No puedo»: no pagan ni cobran como titulares (una devolución ya registrada puede seguirles visible, ver Caso A).
- **Anotados a mano** (filas sin cuenta en la vista del enlace): solo el organizador marca sus estados; no pueden «Ya transferí» por sí mismos.

## Historias de usuario

1. **HU-1** · Como organizador quiero **pegar una sola vez mis datos de transferencia** (RUT, banco, cuenta, correo) para que cada asistente los copie en un toque y me transfiera sin pedirlos por chat.
2. **HU-2** · Como asistente titular quiero marcar **«Ya transferí»** por mi cuenta para que el organizador revise su transferencia sin escribirle.
3. **HU-3** · Como organizador quiero **confirmar cada pago con el monto exacto** transferido para llevar la boleta al día y detectar deudores sin mirar el banco.
4. **HU-4** · Como organizador quiero ver **de un vistazo quién adeuda, quién pagó y a quién debo devolver cuánto** (incluidos los que se bajaron y los que pagaron de más por cambios de cuota) para cerrar las cuentas al final.
5. **HU-5** · Como asistente que pagó y luego se bajó, quiero que quede **registrada mi devolución** para no perder la plata que transferí.
6. **HU-6** · Como asistente que pagó una cuota mayor que la de hoy, quiero ver mi **saldo a favor** como devolución para saber cuánto me sobra.

## Requisitos funcionales

### RF-1 — Disponibilidad del módulo
El módulo está activo en un panorama **solo si** el costo total es mayor a $0 **y** el bloque de datos de transferencia tiene contenido (no vacío tras limpiar espacios).

**Criterios (EARS):**
- SI el costo total es $0 (o no se definió) O no hay datos bancarios definidos, ENTONCES el sistema NO DEBE mostrar el módulo ni en el panel ni en el enlace.
- CUANDO el organizador define datos bancarios con costo total > $0, EL SISTEMA MOSTRARÁ el módulo con todos los titulares vigentes en «Pendiente».
- SI existen pagos o devoluciones registradas, ENTONCES el módulo PERMANECERÁ visible aunque el costo total se edite a $0 o se borre el texto bancario (para poder cerrar devoluciones); SI no queda ningún registro de pago, ENTONCES vuelve la ocultación (RF-2/RF-4).

### RF-2 — Datos de transferencia (texto libre)
Un único cuadro de texto libre, editable **solo por el creador**, con el formato clásico de WhatsApp (RUT, banco, cuenta, correo): el sistema no estructura ni valida sus campos internos.

**Criterios:**
- EL SISTEMA DEBERÁ aceptar un bloque de hasta **500 caracteres** (decisión por defecto), no vacío tras limpiar espacios de los bordes.
- CUANDO el creador guarde el bloque, EL SISTEMA DEBERÁ mostrarlo de inmediato a creador y asistentes (panel y enlace) y persistirlo en la nube.
- SI el creador edita o borra el bloque, ENTONCES la vista mostrará la versión vigente para todos (el borrado oculta el módulo solo si no hay montos registrados, RF-1).

### RF-3 — Copia al portapapeles en un toque
- EL SISTEMA DEBERÁ ofrecer un botón «Copiar» junto al bloque bancario, disponible para **todos** los actores (creador y asistentes del enlace).
- CUANDO se toque el botón, EL SISTEMA DEBERÁ copiar el texto completo del bloque al portapapeles y confirmarlo visiblemente («Copiado») sin navegar fuera de la página.

### RF-4 — Cuota actual siempre vigente
La única cuota que cobra el módulo es la **cuota actual**: techo al múltiplo de $100 de `costo total ÷ titulares vigentes` (organizador incluido). La cuota histórica jamás se congela como objetivo de cobro; es el **pagado acumulado** de cada titular el que se compara contra la cuota vigente.

**Criterios:**
- CUANDO cambie el número de titulares vigentes (confirmaciones, bajas de titulares, herencia de asiento) o el costo total, EL SISTEMA DEBERÁ recalcular la cuota actual y revaluar la situación monetaria de cada titular en pantalla, SIN cambiar los estados de flujo (RF-5) ni los montos ya registrados.
- SI la división es inexacta, ENTONCES se aplicará el redondeo a $100 hacia arriba y el sobrante se mostrará como pozo común (texto vigente de la boleta, reutilizado).

### RF-5 — Estados de pago por titular (3 pasos + registro de monto)
Cada titular vigente tiene un estado de flujo: **Pendiente** (inicial), **En revisión** («Ya transferí») y **Pagado** (con monto registrado en CLP entero). El **pagado acumulado** vigente de un titular es la suma de los montos de sus confirmaciones vigentes (una reversión retira el monto del acumulado pero conserva el registro en el historial, auditable).

**Criterios:**
- CUANDO alguien pasa a ser titular vigente («Voy» dentro del cupo, incluidos suplentes que heredan asiento), ENTONCES su estado de pago inicial será «Pendiente»; la herencia no transfiere pagos ni estados de otra fila.
- SI el asistente con cuenta es titular vigente, ENTONCES podrá marcar «Ya transferí» únicamente sobre SU fila y solo desde «Pendiente».
- SI el titular se retracta de su marca mientras está «En revisión», ENTONCES podrá volver a «Pendiente» él mismo (toque errado); estando «Pagado», solo el creador mueve el estado.
- CUANDO el creador confirme «Pagado», EL SISTEMA DEBERÁ registrar el monto transferido (CLP entero) y la fecha/hora local del registro; el monto se **predetermina con la cuota vigente y el creador puede ajustarlo antes de guardar** (validación CLP entero; decisión por defecto).
- CUANDO el creador confirme «Pagado», ENTONCES podrá hacerlo desde «En revisión» o directamente desde «Pendiente» (el paso intermedio no es obligatorio), y podrá **revertir** un «Pagado» a «En revisión» o «Pendiente» por error (el monto sale del acumulado vigente y queda en el historial).
- SI la fila es de una persona anotada a mano, ENTONCES solo el creador podrá marcar sus estados.
- LOS NO titulares (suplentes, «En duda», «No puedo») NO DEBEN poder marcar «Ya transferí».
- EL ORGANIZADOR DEBERÁ poder aplicar sobre su propia fila tanto las acciones de titular como las del creador.

### RF-6 — Alineamiento monetario contra la cuota vigente
Junto al estado de flujo, cada fila muestra la situación calculada del titular: **al día** (pagado acumulado = cuota vigente), **adeudo** (pagado < cuota vigente) o **saldo a favor** (pagado > cuota vigente, RF-8).

**Criterios (cuota que sube tras un pago — decisión del dueño):**
- SI la cuota vigente sube por encima del pagado acumulado de un titular, ENTONCES su fila mostrará el **adeudo de la diferencia** (ej. pagó $3.500 y la cuota hoy es $5.000 → adeudo $1.500) sin borrar el pago anterior ni degradar injustamente su historial; la vista pasará a «pago incompleto».
- CUANDO un titular con adeudo pague la diferencia, ENTONCES el monto confirmado se SUMARÁ al pagado acumulado (la fila vuelve a «al día» cuando pagado = cuota vigente); el titular podrá marcar «Ya transferí» nuevamente para esa diferencia y el creador confirmarla igual que cualquier pago.

### RF-7 — Caso A: devolución por baja de un pagado
- CUANDO un titular con pagado acumulado > $0 deja de ser titular (pasa a espera, «En duda» o «No puedo»), EL SISTEMA DEBERÁ registrar una **devolución pendiente por el 100% de su pagado acumulado**, con alerta visible de «Devolución» y sumando al total global por devolver del organizador (RF-10).
- SI la devolución aún no fue «Reembolsada» y la persona vuelve a ser titular en el mismo panorama, ENTONCES la devolución pendiente se cierra automáticamente (desaparece como alerta) y su pagado acumulado vuelve a compararse contra la cuota vigente (RF-6).
- SI un ex-titular estaba «En revisión» sin confirmar al bajarse, ENTONCES no nace devolución; el creador PODRÁ confirmar el pago de manera retroactiva si la plata igual llegó (decisión por defecto): una vez confirmado, nace la devolución por ese monto.
- SI un titular «Pendiente» se baja, ENTONCES no se registra nada (nunca pagó).

### RF-8 — Saldo a favor de un titular vigente (Caso B)
- CUANDO la cuota vigente baje por debajo del pagado acumulado de un titular **que sigue vigente**, EL SISTEMA DEBERÁ mostrar la diferencia como «Devolución / Saldo a favor» en su fila (ej. pagó $5.000 con 7 titulares y la cuota hoy es $3.500 con 10 → saldo $1.500), sin cambiar su estado de flujo «Pagado».
- CUANDO exista un saldo a favor, ENTONCES su monto suma al total global por devolver (RF-10) y el creador podrá marcarlo como «Reembolsada» (RF-9) aunque el titular siga jugando.
- SI la cuota vuelve a subir y la fila queda al día (pagado ≤ cuota), ENTONCES el saldo pendiente se desactiva (desaparece como alerta); un saldo ya «Reembolsada» conserva su registro de tesorería.

### RF-9 — Estado de cierre «Reembolsada»
Cada devolución (Caso A y saldo a favor del Caso B) es un registro con monto y cierre.

**Criterios:**
- EL SISTEMA DEBERÁ mostrar toda devolución pendiente con alerta («Por devolver») hasta que el creador la marque «Reembolsada».
- CUANDO el creador marque «Reembolsada», EL SISTEMA DEBERÁ registrar el monto devuelto (el monto completo de esa devolución; decisión por defecto: sin parcialidades en v1) y la fecha/hora local del reembolso, apagar la alerta de esa devolución y descontarla del total global por devolver.
- SI el creador se arrepiente de una «Reembolsada», ENTONCES podrá revertirla a pendiente (el monto vuelve a sumar al total por devolver).
- LA marca «Reembolsada» NO DEBE alterar el estado de flujo de pago de ninguna fila: es un registro de tesorería aparte; un asistente bajado ya no aparece como titular, pero su devolución permanece visible hasta resolverse.

### RF-10 — Totales de tesorería (solo creador)
- EL SISTEMA DEBERÁ mostrar en el panel del creador tres totales en CLP entero: **recaudado** (suma de pagados acumulados vigentes), **por cobrar** (suma de adeudos vigentes, incluida la fila del organizador si adeuda) y **por devolver** (suma de devoluciones y saldos a favor no «Reembolsada»).
- CUANDO cambie cualquier estado, monto, titularidad o el costo total, ENTONCES los totales DEBEN recalcularse al instante.

### RF-11 — Visibilidad y permisos
- EN EL PANEL DEL CREADOR, EL SISTEMA DEBERÁ permitir: editar el bloque bancario, confirmar/revertir estados (con monto), marcar/revertir «Reembolsada» y ver los totales de tesorería.
- EN EL ENLACE `/p/<id>`, EL SISTEMA DEBERÁ mostrar a los asistentes con sesión el **tablero completo de estados, montos y devoluciones en solo lectura** (con la codificación de color por estado), el bloque bancario con su botón copiar y la acción «Ya transferí»/retractar SOLO para su propia fila si es titular vigente.
- SI el actor no tiene acción posible sobre una fila, ENTONCES no verá controles de acción (solo lectura).
- EL BLOQUE BANCARIO y su copia NO DEBEN exigir acciones previas del creador para ser visibles en el enlace.

### RF-12 — Lenguaje y color-estado
- LA INTERFAZ DEBERÁ usar los nombres amables y consistentes en toda la app: «Pendiente», «Ya transferí» (en revisión), «Pagado», «Adeudo», «Devolución / Saldo a favor» y «Reembolsada».
- EL COLOR DEBERÁ codificar el estado (chips por estado en cada fila, con el lenguaje visual de boleta); nunca decoración: los fondos fuertes corresponden solo a devoluciones pendientes y adeudos.

## Requisitos no funcionales

- **RNF-1** · Moneda: solo CLP enteros, jamás decimales; redondeo a $100 hacia arriba idéntico al de la boleta vigente (constitución).
- **RNF-2** · Fechas de registro de pago y reembolso en hora local `'YYYY-MM-DDTHH:mm'` (nunca `toISOString()` ni UTC).
- **RNF-3** · Retrocompatibilidad total: los panoramas anteriores abren sin el módulo cuando no se cumplen las condiciones de RF-1, sin migrar datos viejos.
- **RNF-4** · Toda la lógica de cuota, pagados acumulados, adeudos, saldos y devoluciones vive en funciones puras testeables al estándar de los módulos previos, con «ahora» como parámetro.
- **RNF-5** · Persistencia optimista con reversión al fallar la red, como la asistencia y los equipos.
- **RNF-6** · Diseño «Cuentas claras en la cancha»: lenguaje visual de la boleta, mobile-first, color = información.
- **RNF-7** · Español en interfaz, textos y comentarios; inglés en código e identificadores.

## Casos límite

1. **El organizador es titular**: aparece en el tablero con su fila (orden 0) y combina las acciones de titular con las de creador (autocobro posible).
2. **Costo editado tras pagos**: recálculo inmediato de adeudos y saldos de todos contra sus pagados acumulados; nada queda «al día» por memoria.
3. **Costo total → $0 con pagos registrados**: el módulo sigue visible (RF-1) hasta cerrar devoluciones; con cuota $0 todos los titulares vigentes quedan «al día» automáticamente y los ex-titulares con devolución mantienen su registro (decisión por defecto).
4. **Datos bancarios borrados con pagos registrados**: módulo sigue visible por los registros; el bloque copiable ya no aparece.
5. **«En revisión» que se baja**: sin devolución automática; el creador puede confirmar ex post si la plata llegó (RF-7).
6. **Suplente que hereda asiento**: arranca «Pendiente»; lo pagado por quien perdió el asiento ya quedó como su devolución (RF-7), nunca transfiere su pago al nuevo.
7. **Revertir «Pagado» por error**: el estado vuelve atrás y el monto sale del acumulado vigente, conservándose el registro en el historial (auditable); el pagado acumulado solo vuelve a crecer con confirmaciones posteriores.
8. **Toques dobles / carrera de «Ya transferí»**: idempotente (una fila solo puede estar «En revisión» una vez a la vez).
9. **Panorama eliminado**: pagos y devoluciones viven dentro del panorama y se borran en cascada con él; no existe historial financiero global del usuario fuera de sus panoramas.

## Fuera de alcance

- Pasarelas de pago, enlaces de cobro e integraciones (Mercado Pago, transferencias automatizadas, webhooks).
- Comprobantes o adjuntos (fotos de la transferencia): la confirmación es siempre manual del creador.
- Notificaciones push/correo de cobro o recordatorios automáticos.
- Pagos de suplentes (solo titulares vigentes pagan la cuota).
- División por rubros o gastos parciales: se cobra el costo total único del panorama.
- Múltiples cuentas bancarias por organizador o selección de métodos de pago.
- Otras divisas y conversiones.
- Historial financiero global del usuario fuera de sus panoramas.

## Criterios de finalización

1. Spec aprobada por el dueño y `plan.md` siguiente con la arquitectura (SDD paso a paso).
2. Lógica pura (cuota, pagados acumulados, adeudos, saldos, devoluciones, flujo de estados) con su batería de tests en verde antes de la interfaz (puerta de tests).
3. Persistencia y migraciones aplicadas solo vía MCP, retrocompatibles con panoramas anteriores.
4. Smoke en navegador 375px: definir y copiar datos bancarios; «Ya transferí» + retracto; confirmación con monto y ajuste del monto; adeudo por cuota al alza; Caso A (baja de pagado → devolución 100% → «Reembolsada»); Caso B (nuevos confirmados → saldo a favor → «Reembolsada»); reversiones por error; ocultación con costo $0 y sin datos bancarios; enlace solo lectura con acción propia.
5. `tsc --noEmit` limpio, `npm run build` exitoso y tests en verde al cierre.

## Dudas abiertas

Ninguna. Las marcas `[NECESITA ACLARACIÓN]` del borrador v0.1 quedaron resueltas con las recomendaciones aceptadas por el dueño (21-oct): monto predeterminado con la cuota vigente y editable antes de guardar; «En revisión» bajado confirmable ex post por el creador; costo $0 con pagos deja a todos «al día» manteniendo devoluciones; revertir «Pagado» saca el monto del acumulado conservando el historial; «Reembolsada» por monto completo sin parcialidades; bloque bancario máx. 500 caracteres. Quedan además vetables en revisión dos decisiones por defecto no preguntadas: (1) el invitado puede retractar su propio «Ya transferí» mientras no esté confirmado; (2) el organizador aparece en el tablero de pagos y se paga a sí mismo con poderes de titular y creador.

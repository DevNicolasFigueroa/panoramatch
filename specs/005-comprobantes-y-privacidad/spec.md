# Spec 005 — Comprobantes de Pago y Privacidad del Invitado

**Estado:** borrador (v0.2, 2026-10-29; dudas D1–D4 cerradas) · Decisiones del dueño cerradas en la sesión de borrador: **privacidad total de pagos para el invitado (2A)** — en la vista de tesorería solo ve métricas generales anónimas, el bloque bancario y **su propia tarjeta de pago**; **comprobante obligatorio para el invitado (1A)** — sin imagen adjunta no puede pasar a «En revisión» (JPG/PNG/WEBP, máx. 5 MB), mientras el **organizador siempre puede marcar «Pagado» a mano sin comprobante**; **un solo comprobante vigente a la vez** (se reemplaza, no se acumula); **edición libre mientras «En revisión» (Decisión 3)** y bloqueo absoluto al confirmarse «Pagado»; **revisión del organizador (Decisión 4)** — abre el comprobante, compara el monto en CLP contra su transferencia recibida y **confirma o rechaza** (vuelta a «Pendiente» con nota opcional de motivo); imágenes **reemplazadas o rechazadas se eliminan** del almacenamiento (solo queda la vigente o la confirmada como respaldo); requisito de comprobante **fijo global** (no configurable por panorama); si el invitado **se baja con marca «En revisión» la imagen se conserva** (el organizador decide ex post). Ver `specs/004-estado-pagos-tesorero/spec.md`, `docs/constitution.md`, `AGENTS.md` y `MEMORY.md`.

**Depende de:** la spec 004 completa (estados de pago Pendiente → En revisión «Ya transferí» → Pagado, cuota vigente CLP, devoluciones derivadas, bloque bancario copiable, totales de tesorería) con **las enmiendas vigentes ya aplicadas por el dueño**, que quedan registradas aquí como línea base:

- El módulo de pagos está **activo con costo > $0 aunque falten los datos bancarios** (el bloque vacío se llena desde el propio módulo); la condición «Apagado» capturada por datos bancarios se elimina.
- La **fila del organizador nunca adeuda**: él es quien recibe las transferencias; su fila es informativa («Recibe las transferencias») con chip «Organizador», y su cuota no suma al «por cobrar».
- El pagado de cada persona y el «recaudado» se muestran **netos**: lo entrado menos lo ya devuelto en cierres «Reembolsada» confirmados.
- Vocabulario visible: «Confirmados» (no «titulares»), «Pago al día» (no «Al día»).
- La boleta y el Control de pagos viven **solo en la página dedicada de Tesorería** del panel del creador (sin boleta ni pagos embebidos en el tablero).

## Contexto y objetivo

La spec 004 dejó la marca «Ya transferí» como una promesa verbal: el organizador confirma de oído y, además, el resto de los asistentes ve los montos, saldos y estados de **todos**, algo que en la vida real no se comparte (quién le debe a quién es un asunto privado). Esta spec resuelve los dos vacíos a la vez:

1. **Privacidad (2A):** el tablero completo de pagos pasa a ser **solo del organizador**; el invitado ve un resumen **anónimo y agregado** del pozo, el bloque bancario copiable y **exclusivamente su propia tarjeta**, con su estado y su monto.
2. **Comprobantes (1A, 3, 4):** la marca «Ya transferí» ya no es fe ciega: el invitado **adjunta la imagen de su comprobante** en el mismo gesto, puede **reemplazarla** mientras esté en revisión, y el organizador la **abre, la compara contra su transferencia y confirma o rechaza**. La confirmación manual sin comprobante permanece como excepción del organizador (pagos en efectivo presencial) y las filas anotadas a mano siguen gestionándose solo desde su panel.

## Usuarios / actores

- **Creador / organizador (con sesión):** dueño de la tesorería. Ve el tablero completo (todas las filas, estados, montos, devoluciones) y ahora además **abre y revisa el comprobante de cada invitado**; confirma «Pagado» (con o sin comprobante), **rechaza comprobantes con nota opcional**, edita el bloque bancario y los totales; sigue siendo el único que puede revertir estados y marcar «Reembolsada». Recibe las transferencias: su fila es informativa y nunca adeuda.
- **Asistente invitado con sesión y confirmado vigente:** ve métricas anónimas del pozo, el bloque bancario con copia y **su tarjeta personal de pago** (su nombre, monto a pagar o devolución pendiente propia, y estado). Puede **subir y reemplazar su comprobante** solo sobre su tarjeta y solo mientras su pago esté «Pendiente»/«En revisión», y marcar «Ya transferí» o retractarse como en 004.
- **Asistente invitado no confirmado** (lista de espera, «En duda», «No puedo»): ve lo anónimo y su tarjeta sin acciones de pago (una devolución propia ya registrada sí le es visible, herencia de 004).
- **Anotados a mano** (filas sin cuenta): sin tarjeta propia ni comprobantes; solo el organizador gestiona su estado de pago desde su panel.
- **Sistemas:** almacenamiento privado de imágenes del proyecto, con objetos por panorama y participante; capacidad no compartida con otros servicios.

## Historias de usuario

1. **HU-1** · Como invitado quiero **subir la foto de mi comprobante** al marcar «Ya transferí», para que el organizador confirme mirando la imagen y no de memoria.
2. **HU-2** · Como invitado quiero **ver solo mi estado y mi monto** (más el resumen general del pozo), para que mis finanzas no sean visibles al resto de los asistentes.
3. **HU-3** · Como invitado quiero **reemplazar mi comprobante si subí la captura equivocada** mientras mi pago esté en revisión, para corregir mi error sin pedirle ayuda al organizador.
4. **HU-4** · Como organizador quiero **abrir el comprobante de cada invitado** (banco y monto en CLP) para compararlo con mi transferencia recibida antes de confirmar «Pagado».
5. **HU-5** · Como organizador quiero **rechazar un comprobante** que no corresponde, con una nota opcional de motivo, para que el invitado vuelva a «Pendiente» y suba la imagen correcta.
6. **HU-6** · Como organizador quiero poder **confirmar sin comprobante** (pago en efectivo o fuera de la app), para no bloquear la tesorería por casos fuera del flujo.
7. **HU-7** · Como invitado que se bajó con pago en revisión quiero que **mi comprobante quede resguardado**, para que el organizador pueda confirmar ex post si la plata llegó (herencia RF-7 de 004).

## Requisitos funcionales

### RF-1 — Alcance del módulo (enmienda de 004, línea base)

El módulo de pagos está activo en un panorama si el costo total es mayor a $0 **o** existen registros de pago o devolución.

**Criterios (EARS):**
- SI el costo total es $0 y no quedan registros de pago ni devoluciones, ENTONCES el sistema NO DEBE mostrar el módulo en ninguna vista.
- SI el costo total es > $0, ENTONCES el sistema DEBE mostrar el módulo **aunque aún no existan datos de transferencia** (el bloque vacío se llena desde el propio módulo).
- SI existen pagos vigentes o cierres «Reembolsada», ENTONCES el módulo PERMANECERÁ visible aunque el costo se edite a $0 o el bloque bancario quede vacío.

### RF-2 — Privacidad del invitado (Decisión 2A)

La vista de pagos del invitado en el enlace muestra **tres capas, y solo esas**: (a) métricas generales anónimas del pozo, (b) el bloque de datos bancarios con su botón «Copiar» y (c) su propia tarjeta de pago personal. El tablero con todas las filas, estados individuales, saldos de terceros y comprobantes ajenos es **solo del organizador** (página de Tesorería del panel).

**Criterios:**
- EL SISTEMA DEBERÁ mostrar al invitado el costo total, la cuota por confirmado, la barra de progreso del pozo, el porcentaje recaudado y el conteo anónimo «N de M pagados» (sin nombres ni estados individuales de terceros).
- CUANDO el invitado esté confirmado vigente, EL SISTEMA DEBERÁ mostrarle su tarjeta personal con su nombre, su estado de flujo — «Pendiente» / «En revisión» / «Pagado» — y su situación propia (cuota a pagar, adeudo propio o devolución pendiente propia).
- EL SISTEMA NO DEBERÁ exponer al invitado, en ninguna vista, la lista de pagos, estados, saldos, montos pagados ni comprobantes de otros asistentes.
- SI el invitado pasa a confirmado vigente, ENTONCES su tarjeta gana las acciones de RF-3/RF-4 sin revelar nada ajeno.
- ESTE confinamiento se aplica también a las reglas de acceso de la capa de datos: cada invitado solo puede leer su propia fila y su propio adjunto.

### RF-3 — Comprobante obligatorio para «Ya transferí» (Decisión 1A)

El paso a «En revisión» de un invitado confirmado exige una imagen de comprobante válida adjunta en el mismo flujo.

**Criterios:**
- CUANDO el invitado en «Pendiente» toque «Ya transferí» sin comprobante adjunto, EL SISTEMA NO DEBERÁ registrar la marca y le ofrecerá adjuntar la imagen (su estado sigue «Pendiente»).
- CUANDO adjunte una imagen válida (JPG, PNG o WEBP de ≤ 5 MB) y confirme, EL SISTEMA DEBERÁ guardar el comprobante asociado solo a su fila del panorama y registrar la marca «En revisión».
- SI el guardado de la imagen falla, ENTONCES la marca NO DEBERÁ quedar registrada (el estado queda «Pendiente» con un aviso amable en español); nunca debe existir «En revisión» sin comprobante.
- CUANDO el organizador confirme «Pagado» directamente, EL SISTEMA NO DEBERÁ exigir comprobante (excepción del organizador: efectivo presencial y filas anotadas a mano).
- LOS INVITADOS no confirmados vigentes NO DEBEN poder adjuntar ni marcar; el comprobante es un atributo de la marca vigente de un invitado con sesión y confirmado.
- LAS MARCAS «EN REVISIÓN» HEREDADAS de la era 004 (pre-005, sin imagen) QUEDAN como están, sin aviso ni salto de exigencia (Decisión D2): la exigencia de comprobante aplica solo a marcas nuevas realizadas desde esta spec.

### RF-4 — Reemplazo del comprobante mientras «En revisión» (Decisión 3)

Mientras el pago esté «En revisión» (aún no confirmado como «Pagado»), el invitado ve la miniatura de su comprobante y puede reemplazarla; al confirmarse «Pagado», queda bloqueado.

**Criterios:**
- SI el pago del invitado está «En revisión», ENTONCES su tarjeta DEBERÁ mostrar la miniatura de su comprobante y la acción «Reemplazar» (misma política de formatos y peso de RF-3).
- CUANDO el invitado reemplace el comprobante, EL SISTEMA DEBERÁ sustituir la imagen vigente por la nueva y eliminar la versión anterior del almacenamiento (siempre hay exactamente un comprobante vigente).
- SI el pago está confirmado como «Pagado», ENTONCES el reemplazo NO DEBE estar disponible ni para el invitado ni para el organizador (el archivo queda como respaldo del cierre).
- SI una fila quedó «Pagado» confirmada a mano (sin comprobante) y el invitado trae después su imagen, ENTONCES PODRÁ adjuntarla como respaldo informativo: no cambia estados, no habilita reemplazos posteriores y pasa a ser su único comprobante asociado (Decisión D4: respaldo opcional).
- CUANDO el organizador confirme con comprobante vigente, ENTONCES ese comprobante quedará asociado al «Pagado» como respaldo, conservado hasta que el panorama se elimine.

### RF-5 — Revisión del organizador: confirmar o rechazar (Decisión 4)

Sobre cada invitado con marca vigente y comprobante, el organizador abre la imagen y decide.

**Criterios:**
- CUANDO el organizador toque la miniatura de un comprobante, EL SISTEMA DEBERÁ abrirla ampliada (visor con cierre), visible solo para él dentro de su panorama.
- CUANDO el organizador revise un comprobante, PODRÁ confirmar «Pagado» (fluye igual que en 004) o rechazarlo.
- CUANDO el organizador rechace, EL SISTEMA DEBERÁ: (i) devolver la fila del invitado a «Pendiente», (ii) eliminar la imagen rechazada del almacenamiento y (iii) registrar opcionalmente una nota de motivo que el invitado verá en su tarjeta hasta su próxima marca.
- LA nota de rechazo NO DEBE ser obligatoria ni bloquear el rechazo si se deja vacía.
- MIENTRAS la fila siga en «Pendiente» tras un rechazo (sin nueva marca del invitado), EL ORGANIZADOR PODRÁ editar la nota de motivo cuando quiera (Decisión D3: nota editable).
- CUANDO el invitado vuelva a marcar con un nuevo comprobante, ENTONCES la nota anterior dejará de mostrarse.

### RF-6 — Almacenamiento privado de comprobantes

Los comprobantes son archivos privados del panorama, atados a la fila del participante.

**Criterios:**
- EL SISTEMA DEBERÁ aceptar solo imágenes JPG/PNG/WEBP de ≤ 5 MB (validación en la interfaz antes de subir y al guardar) y rechazar otros tipos o pesos con mensaje en español.
- EL SISTEMA DEBERÁ mantener un solo comprobante vigente por marca vigente; al confirmarse «Pagado», el archivo queda preservado como respaldo hasta la eliminación del panorama.
- LOS ARCHIVOS NO DEBEN ser públicos ni adivinables: solo el organizador del panorama y el dueño de la fila (su comprobante propio) pueden consumirlos.
- CUANDO se reemplace o rechace un comprobante, ENTONCES la versión descartada DEBERÁ eliminarse del almacenamiento (sin versiones huérfanas).
- CUANDO el panorama se elimine, ENTONCES todos sus comprobantes DEBERÁN eliminarse con él (cascada).
- EL FLUJO DE COMPROBANTES DEPENDE de la sesión y el almacenamiento en nube: sin ellos queda simplemente inaccesible, sin modo degradado (Decisión D1; coherente con la app, que ya exige sesión).

### RF-7 — Métricas anónimas y netas del pozo

Resumen visible al invitado y a los no confirmados; usa los totales netos ya definidos en la línea base.

**Criterios:**
- LA barra de progreso DEBERÁ reflejar recaudado neto ÷ (recaudado neto + por cobrar de los invitados), con el porcentaje redondeado al entero.
- CUANDO se cierre una devolución («Reembolsada»), ENTONCES el recaudado neto y el porcentaje del pozo DEBERÁN reflejar su efecto (los cierres descuentan del recaudado).
- EL CONTEO «N de M pagados» DEBERÁ contar invitados confirmados con flujo «Pagado» vigente (el organizador no se cuenta a sí como pagador).
- ESTOS MISMOS totales netos son los que ve el organizador en su panel (RF-10 de 004, con la enmienda: el organizador nunca suma al por cobrar).

### RF-8 — Baja de confirmado con marca vigente (complementa RF-7 de 004)

- CUANDO un invitado con pago «En revisión» y comprobante adjunto deje de estar confirmado, ENTONCES su comprobante PERMANECERÁ guardado y visible para el organizador (decisión del dueño: conservar); el invitado pierde las acciones sobre su ex-tarjeta.
- SI el organizador luego confirma ex post («Pagado»), ENTONCES nace la devolución por ese monto (Caso A de 004) y el comprobante queda como respaldo del cierre.
- SI el organizador rechaza (RF-5), ENTONCES la fila vuelve a «Pendiente» y el comprobante se elimina.

## Requisitos no funcionales

- **RNF-1** · Privacidad por defecto: la capa de datos debe garantizar que un invitado jamás lea filas ajenas ni adjuntos ajenos; un intento denegado no revela información (respuestas genéricas en español).
- **RNF-2** · Retrocompatibilidad total (constitución): panoramas de la era 004 con «Ya transferí» sin comprobante abren igual; la confirmación retroactiva del organizador no exige comprobante; ningún dato viejo se pierde en la transición.
- **RNF-3** · Moneda CLP entera y cuota con redondeo chileno a $100 hacia arriba idénticos a 004; el comprobante NUNCA altera los montos registrados (es evidencia, no dato contable).
- **RNF-4** · Fechas y sellos de marca/cierre en hora local `'YYYY-MM-DDTHH:mm'`; «ahora» siempre como parámetro.
- **RNF-5** · Las reglas de validación (formato/peso, transiciones con y sin comprobante, confinamiento de visibilidad, métricas netas del pozo) viven en funciones puras de `src/core/` con tests al estándar previo y sin conocer red, DOM ni almacenamiento.
- **RNF-6** · Persistencia optimista con reversión: subir/reemplazar comprobante muestra un estado de subida (y error amable si falla) sin trabar el resto del tablero; nunca queda un estado intermedio roto.
- **RNF-7** · Diseño «Cuentas claras en la cancha» (mobile-first): subir el comprobante es un gesto de un dedo (cámara/galería); la miniatura es pequeña y el visor ampliado legible; el color sigue codificando el estado.
- **RNF-8** · Español en interfaz y mensajes (validación, rechazo, errores); inglés en código e identificadores.

## Casos límite

1. **«En revisión» que se baja (con comprobante)**: imagen conservada para el organizador; fila sin acciones para el invitado; confirmación ex post posible (RF-8).
2. **Rechazo del comprobante**: fila «Pendiente» + imagen eliminada + nota opcional visible en la tarjeta del invitado; sin nota, el rechazo funciona igual.
3. **Confirmación manual sin comprobante (efectivo)**: permitida siempre para el organizador; la fila queda «Pagado» sin respaldo de imagen; el reemplazo está bloqueado por estar «Pagado», pero el invitado puede adjuntar después su imagen como respaldo informativo sin cambiar estados (D4).
4. **Filas anotadas a mano**: nunca tienen comprobante ni tarjeta en el enlace; solo el organizador las gestiona, sin exigencia de imagen.
5. **Organizador que recibe las transferencias**: su fila es informativa (nunca adeuda, no marca «Ya transferí», no sube comprobante sobre sí).
6. **Adeudo de diferencia (RF-6 de 004)**: sobre un pago ya confirmado, la marca nueva por la diferencia exige un comprobante nuevo vigente (una imagen por marca activa).
7. **Dobles toques / carreras**: el reemplazo es idempotente; dos «Ya transferí» con imagen no duplican marcas ni archivos (solo queda un adjunto vigente).
8. **Falla de red al subir/reemplazar**: la imagen no queda vigente si la subida falló; la marca/estado vuelve al punto anterior con aviso amable (nada queda «En revisión» sin imagen).
9. **Invitado en varios panoramas**: cada fila lleva sus propios comprobantes; no existe historial financiero fuera del panorama (004).
10. **Panorama eliminado**: comprobantes, filas y cierres se borran en cascada; nada queda flotando en el almacenamiento.

## Fuera de alcance

- Lectura automática del comprobante (OCR de monto, banco o documento) y comparación automática contra el pago recibido: la comparación es siempre humana (organizador).
- Formatos distintos de JPG/PNG/WEBP (incluido PDF).
- Comprobantes de las **devoluciones** (el sistema solo marca «Reembolsada»; el registro humano queda fuera).
- Notificaciones push/correo al rechazar o confirmar (la nota vive en la tarjeta del invitado).
- Editar o reemplazar el comprobante después del «Pagado», por cualquier actor.
- Varios comprobantes vigentes simultáneos o galería de versiones (decisiones cerradas: 1 vigente, versiones anteriores eliminadas).
- Visibilidad de comprobantes entre invitados o al público (2A y RF-6 lo prohíben).
- Requisito de comprobante configurable por panorama (el dueño cerró: obligatorio fijo global).
- Modo degradado para comprobantes sin nube (D1 cerró: sin nube el flujo queda inaccesible).
- Pasarelas de pago e integraciones bancarias (004).

## Criterios de finalización

1. Spec aprobada por el dueño; después, `plan.md` con la arquitectura (SDD paso a paso) y luego `tasks.md`.
2. Reglas puras en `src/core/` (transiciones con/rechazo, permisos de visibilidad por actor, métricas netas del pozo, validación de formato/peso) con su batería de tests primero y en verde (puerta de tests).
3. Persistencia y almacenamiento configurados solo vía MCP, retrocompatibles con 004 (acceso de invitado limitado a su fila y su adjunto; archivos privados por fila).
4. Smoke en navegador 375px: invitado marca con imagen (y NO pasa a «En revisión» sin imagen), reemplaza en revisión, el organizador abre, confirma y rechaza con nota; privacidad — el invitado NO ve filas ni montos de terceros y sí ve su tarjeta; el organizador ve el tablero completo; baja con marca en revisión conserva la imagen; confirmación manual sin comprobante sigue posible.
5. `tsc --noEmit` limpio, `npm run build` exitoso y tests en verde al cierre.

## Decisiones cerradas de la sesión de borrador (D1–D4)

- **D1 — Sin nube:** sin sesión/almacenamiento disponible, el flujo de comprobantes queda simplemente inaccesible (sin modo degradado).
- **D2 — Filas legacy:** la exigencia de comprobante aplica solo a marcas nuevas (post-005); las marcas «En revisión» heredadas de la era 004 quedan como están, sin aviso ni salto de exigencia.
- **D3 — Nota de rechazo:** editable por el organizador en cualquier momento mientras la fila siga en «Pendiente» tras el rechazo (hasta la próxima marca del invitado).
- **D4 — Comprobante tras cierre a mano:** el invitado puede adjuntar su imagen después como respaldo informativo (sin cambiar estados y sin reemplazo posterior); si ya existe comprobante confirmado, sigue bloqueado.

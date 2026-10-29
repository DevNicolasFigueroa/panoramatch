# MEMORY.md — PanoraMatch

Memoria del proyecto entre sesiones. Máximo ~50 líneas: resume o elimina lo que ya no aporte.

## Estado actual
- **Spec 005 — Comprobantes y Privacidad: FASE 2 (migraciones) APLICADA (29-oct)** — Fase 1 (T1–T2, 203/203) + **T3 y T4 aplicados vía MCP** (`receipts_boot`, `receipts_indexes`, `receipt_flow_functions`+`_2`, `receipt_functions_anon_deny`+`_2`, `receipt_privacy_hardening`): tabla `panorama_payment_receipts` (único (pano,participante), CHECKs MIME/peso), bucket privado `panorama-comprobantes` con policies propias, RPCs del flujo (`submit_transfer_claim` con copia atómica de marca y comprobante, `update_payment_receipt`, `retract`, `reject`, `attach`, `update_rejection_note`, `record_payment` sella, `get_panorama_receipts_state`, `get_treasury_summary`), trigger de limpieza de storage, RLS 2A (pagos/cierres solo fila propia; claimed_at/nota solo vía vista definer `participant_payment_state` o RPCs del creador); advisors: `security_definer_view` ERROR intencional y documentado, resto deuda preexistente. **PENDIENTE: batería REST con JWTs de cuentas (pedir credenciales al dueño)**, Fase 3 (store+UI). T5 repo HECHA (`supabase-panorama-repo.ts` + sección comprobantes: filas/vistas/RPCs/storage con URL firmada y huérfanos best-effort; tsc limpio, 203/203). El panel/invitado 004 queda intencionalmente roto hasta Fase 3. Decisiones del dueño cerradas: (2A) privacidad total — invitado solo métricas anónimas + bloque bancario + SU tarjeta; (1A) comprobante obligatorio JPG/PNG/WEBP ≤5 MB para «En revisión»; organizador puede «Pagado» a mano sin comprobante; (3) reemplazo libre mientras «En revisión», bloqueado al «Pagado»; (4) organizador confirma o rechaza (vuelta a «Pendiente» + nota opcional); 1 comprobante vigente a la vez; versiones reemplazadas/rechazadas SE ELIMINAN del storage; baja con «En revisión» CONSERVA imagen; requisito fijo global. Dudas cerradas: D1 sin nube = flujo inaccesible (sin modo degradado); D2 exigencia solo para marcas nuevas (legacy queda); D3 nota de rechazo EDITABLE hasta la próxima marca; D4 comprobante tras cierre a mano = respaldo opcional sin cambiar estados. **Plan define**: tabla `panorama_payment_receipts` (índice único (panorama,participant) = «solo 1» en base), bucket privado + URLs firmadas, RPC definer `submit_transfer_claim` (marca+comprobante atómicos), `reject_payment_transfer` (nota en columna nullable de `participants`), RPC de conteos `get_treasury_summary` para métricas anónimas, RLS de pagos acotada a fila propia (2A). **Tasks (4 fases)**: ~~T1-T2 núcleo+tests (HECHA, 53 casos, 203/203)~~ ~~T3-T4 RPCs/RLS/bucket (APLICADAS; batería REST pendiente de credenciales)~~ · T5 repo · T6-T8 store+UI invitado 3 capas+UI Tesorería · T9 retro-compat · T10 verificación · T11 cierre. **SIGUIENTE: pedir credenciales de cuentas de prueba para la batería REST, luego T5 (repo)**. NO commits sin orden.
- **Rediseño visual Stitch + enmiendas 004 en working tree (rama actual `feat/005-comprobantes-y-privacidad`, SIN commit — no perder)**: vocabulario «Confirmados» (no «Titulares»), boleta y Control de pagos SOLO en página de Tesorería, módulo visible sin datos bancarios (`isPaymentModuleActive` = hasMoney || costo > 0), fila del organizador nunca adeuda (`isOrganizer`, «Recibe las transferencias», excluido del por cobrar), pagado NETO (`getNetPaidTotalCLP`) y recaudado neto (collected − resolvedRefunds, floor 0), «Pago al día», equipos lado a lado siempre con avatares de iniciales, 100% responsive. Tests **150/150** y `tsc` limpios tras cada cambio.
- Rama actual creada desde el árbol con cambios sin commit del rediseño anterior; commits/push SOLO con orden expresa del dueño.
- Dev server de :3001 murió repetidas veces (`Shell.NotFoundError`) — levantar de nuevo para verificación en pantalla (fila del organizador en Tesorería).

## Historial
- **Spec 004 en `main` y `develop` (24-oct, `a4e25db`)**: pagos Pendiente→En revisión→Pagado + «Reembolsada»; 32 migraciones; RPCs definer `claim/retract_payment_transfer`, `revoke_payment(uuid,bigint)`, `record_payment` devuelve id (`payment_record_returns_id`); cierres = INSERT, reabrir = DELETE. Smoke 375px del agente y del dueño (T10-b) hecho. Deploy producción: https://panoramatch.vercel.app (Vercel conectado; push `main` = producción, `develop` = preview).
- Specs 001–003 fusionadas (última:equipos 20-oct, `6a73833`); deuda de vistas previas pública `/p/<id>` + redirect post-login resuelta (29-oct).
- Reparación «no se guardan panoramas»: usuarios auth sin fila `profiles` → auto-reparación cliente `ensureOwnProfileRow`.

## Decisiones (y por qué)
- Creador «Voy» implícito ocupa cupo; cuota = titulares vigentes con redondeo a $100; el organizador RECIBE transferencias (su fila informativa, jamás adeudada).
- Moneda CLP entera; fechas en texto local 'YYYY-MM-DDTHH:mm' (Intl America/Santiago), nunca `toISOString`.
- Auth universal: crear Y participar exige sesión; filas anónimas viejas se adoptan con `guest_secret` (RPC definer; después la fila deja de ser anónima).
- D6 empieza vacío en la nube; delegación Social y anotados a mano se mantienen.

## Aprendizajes y errores a evitar
- Updaters de setState NO corren sincrónicos: validar antes. Windows: `npm.cmd`/`npx.cmd`.
- RLS: refs de texto vs uuid via `::text`; `(select auth.uid())`; PATCH denegado responde 204 — verificar por SQL; refetch tras join (la RLS oculta filas a ajenos).
- Grants: el upsert replica TODAS las columnas del payload — el grant por columna debe cubrirlas; revocar paquete y re-otorgar al mínimo. Para RPCs «solo con sesión»: revoke execute de anon Y de public (public hereda a todos).
- Storage desde SQL: `storage.objects` con guard — DELETE directo exige `select set_config('storage.allow_delete_query','true',true)` primero (misma sentencia/función); los objetos se borran con trigger definer que usa esa GUC.
- `execute_sql` MCP devuelve solo la última sentencia: una verificación por llamada.
- No correr `npm run build` con `next dev` activo (pisa el `.next` de HMR).
- **Regla del dueño (proceso)**: jamás commits, push ni fusiones sin su autorización explícita; aprendido del reinicio del rediseño «Marcador abierto»: consignar en commit apenas apruebe un diseño en pantalla.

## Pendientes / próximas
- Redactado `tasks.md` de la spec 005 (fases de implementación); **Fase 1 (T1–T2) COMPLETADA**: núcleo `payment-receipt.ts` + 53 tests → 203/203 verde. **Siguiente: Fase 2 (migraciones MCP: tabla `panorama_payment_receipts` + bucket privado + RPCs definer + RLS 2A)**, solo con orden del dueño. NO commits sin orden.
- Dashboard Supabase pendiente del dueño: desactivar «Confirm email»; activar «Leaked password protection»; borrar cuentas de prueba (`panoramatch.ts003a/b/c@gmail.com`, `panoramatch.rls003@`, `panoramatch.cre003@`, legacy `rls.test.*`).
- Datos de prueba vivos: panorama «Partido de prueba 004» en ts003a.
- Specs futuras: gastos por partida; Realtime para tableros.

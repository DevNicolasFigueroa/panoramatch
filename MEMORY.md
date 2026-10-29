# MEMORY.md — PanoraMatch

Memoria del proyecto entre sesiones. Máximo ~50 líneas: resume o elimina lo que ya no aporte.

## Estado actual
- **Spec 005 — Comprobantes y Privacidad: FASES 1–3 COMPLETADAS (29-oct), Fase 3 SIN commit**. Commits F1/F2: `f905b9c` (núcleo puro + 53 tests → 203/203) y `11809b4` (migraciones MCP `receipts_boot`/`receipts_indexes`/`receipt_flow_functions`+`_2`/`receipt_functions_anon_deny`+`_2`/`receipt_privacy_hardening` + repo sección 005). RLS 2A: creador ALL en pagos/cierres/pagos, resto own_read; claimed_at/nota solo vía vista definer `participant_payment_state` o RPCs del creador. Advisors: `security_definer_view` ERROR intencional, resto deuda preexistente.
- **Fase 3 (T6–T8, working tree)**: T6 store — loaders en el repo: `fetchCreatorTreasuryState` (base + RPC `get_panorama_receipts_state` fusionada: claims/notas/comprobantes), `fetchGuestTreasuryState` (pagos propios + vista propia filtrada por panorama + comprobante propio + resumen anónimo de `get_treasury_summary`); `fetchPaymentsState` → `fetchPaymentsBaseState` SIN `payment_transfer_claimed_at` (columna revocada: la leía y moría); `claimSelfTransferRow` eliminada; store con estado `receipts`, acciones `rejectPaymentTransfer`/`updateRejectionNote` y `confirmPayment` sella comprobante (RF-4). T7 — `guest-payment-treasury.tsx` NUEVO: 3 capas (métricas anónimas del SERVIDOR, bloque bancario, SU tarjeta con miniatura/visor firmado/reemplazo/retracto/nota; un solo `onPickReceipt` decide claim/replace/attach — valida con el núcleo antes de subir, limpia huérfano si la RPC falla; tablero completo REMOVIDO del enlace). T8 — panel Tesorería solo-creador: miniaturas con URL firmada, visor Confirmar/Rechazar con nota ≤500, nota editable en «Pendiente» (D3), chips «respaldo»/«sin respaldo»/«marca heredada sin imagen». Verificado por SQL: RPC es LEFT JOIN de todos los participantes (D2 legacy sale con storage_path null). `tsc` limpio + **203/203**.
- **PENDIENTE**: Fase 4 (T9 retro-compat, T10 build+smoke navegador con sesión real del dueño, T11 cierre); batería REST T4/T10 sin credenciales de prueba. Commits solo con orden del dueño.
- Datos vivos: 1 panorama «Fiesta Halloween» (`f4726ad8-2a15-4986-a244-8441b5cfc576`), 0 participantes/pagos/comprobantes.
- Rediseño visual Stitch + enmiendas 004 siguen en el working tree (sin commit; conservar).

## Historial
- **Spec 004 en `main` y `develop` (24-oct, `a4e25db`)**: pagos Pendiente→En revisión→Pagado + «Reembolsada»; cierres = INSERT, reabrir = DELETE. Deploy: https://panoramatch.vercel.app (`main` = producción, `develop` = preview).
- Specs 001–003 fusionadas (última: equipos 20-oct); reparación «no se guardan panoramas»: auto-reparación fila `profiles` en cliente.

## Decisiones (y por qué)
- Creador «Voy» implícito ocupa cupo; cuota = titulares con redondeo a $100; el organizador RECIBE transferencias (fila informativa jamás adeudada).
- CLP entero; fechas texto local 'YYYY-MM-DDTHH:mm' (America/Santiago), nunca `toISOString`.
- Auth universal; filas anónimas legacy se adoptan con `guest_secret` (RPC definer).
- 005: privacidad 2A (invitado = métricas anónimas + bloque bancario + SU tarjeta); comprobante obligatorio JPG/PNG/WEBP ≤5 MB para marca nueva (D2 legacy sin imagen se respeta); reemplazo libre en «En revisión», bloqueado al «Pagado» (sella); rechazo → «Pendiente» + nota editable D3; baja con marca CONSERVA imagen (RF-8); respaldo post-cierre D4.

## Aprendizajes y errores a evitar
- Updaters de setState NO corren sincrónicos: validar antes. Windows: `npm.cmd`/`npx.cmd`; `cd /c npm run test` compila y corre node --test.
- RLS: refs de texto vs uuid `::text`; `(select auth.uid())`; PATCH denegado responde 204; refetch tras join/adopción (la RLS oculta filas a ajenos).
- Grants por columna: revocar claimed_at/nota rompió TODO select que las incluyera — al tocar columnas, auditar cada select del repo.
- Storage desde SQL: borrar exige `set_config('storage.allow_delete_query','true',true)` en la misma función; los objetos se limpian con trigger definer del servidor; el cliente solo limpia el huérfano de una subida fallida.
- `execute_sql` MCP: una verificación por llamada; `pg_get_functiondef` para revisar RPCs; `pg_policies` para RLS.
- No correr `npm run build` con `next dev` activo (pisa el `.next` de HMR).
- **Regla del dueño (proceso)**: jamás commits, push ni fusiones sin su autorización explícita; consignar commit apenas apruebe.

## Pendientes / próximas
- Fase 4 spec 005 (T9–T11). Dashboard pendiente del dueño: desactivar «Confirm email»; activar «Leaked password protection»; borrar cuentas de prueba ts003a/b/c, rls003, cre003.
- Specs futuras: gastos por partida; Realtime para tableros.

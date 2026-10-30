# MEMORY.md — PanoraMatch

Memoria del proyecto entre sesiones. Máximo ~50 líneas: resume o elimina lo que ya no aporte.

## Estado actual
- **Spec 005 — COMPLETADA: fases 1–4 commiteadas** (`f905b9c`, `11809b4`, `c42ea6f`, `0474aa2` — T11 cierre). Verificación: `tsc` limpio · **203/203** · build EXIT=0 · smoke invitado en verde (Voy → marca «En revisión» con visor firmado → reemplazo → retracto con limpieza real; 2A ✓; sin imagen no hay «En revisión»). **Junto al dueño sigue pendiente**: hacer el smoke del lado CREADOR con su sesión Google; batería REST (sin credenciales de prueba); decidir fusión a `develop`/`main` y push (con orden explícita).
- **Fase 4 aplicada (incluida en commit `0474aa2`, excepto esta memoria)**: migración `fix_receipts_objects_policies_foldername_objects_name` — las 4 policies de storage usaban `storage.foldername(pt.name)` (el NOMBRE del participante, sin `/` ⇒ insert denegado 403) — recreadas resolviendo sobre `objects.name`. Backfill de `profiles` para ts003a/b/c (cuentas previas al trigger `handle_new_user` bloqueaban el «Voy» con FK violation) — aprobado por el dueño.
- **PENDIENTE**: smoke del lado creador (checklist en tasks.md T10-b); batería REST T4; la fila de Prueba 003A queda confirmada en «Fiesta Halloween» (limpieza a discreción del dueño; retract ya limpió pagos). Las cuentas ts003a/b/c ya tienen fila en `profiles` (respaldo OK).
- Datos vivos: «Fiesta Halloween» (`f4726ad8…`), participante Prueba 003A «Voy» (sin marca ni pagos). Dev server en background `sh_189cd64a7001Ns2LXZM2g3gs3b` (apagar antes de compilar).
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
- **En policies de storage, el path del objeto es `objects.name`**: referenciar la columna `name` de otra tabla (ej. `students.name`) silenciosamente rompe el EXISTS (403 «row-level security» en el upload).
- `execute_sql` MCP: una verificación por llamada; `pg_get_functiondef` para revisar RPCs; `pg_policies` para RLS; los 400 de storage envuelven un 403 real (leer el cuerpo).
- No correr `npm run build` con `next dev` activo (pisa el `.next` de HMR).
- **Regla del dueño (proceso)**: jamás commits, push ni fusiones sin su autorización explícita; consignar commit apenas apruebe.

## Pendientes / próximas
- Fase 4 spec 005 (T9–T11). Dashboard pendiente del dueño: desactivar «Confirm email»; activar «Leaked password protection»; borrar cuentas de prueba ts003a/b/c, rls003, cre003.
- Specs futuras: gastos por partida; Realtime para tableros.

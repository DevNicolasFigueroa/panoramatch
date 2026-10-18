# Tasks 001 — Modo Social: Match de lugares

Orden secuencial; cada tarea es un paso alcanzable y verificable.

## Fase 1 — Lógica pura + deuda RF-8

- [x] T1 — Deuda: `getTodayLocalValue(now: Date)` — el "hoy" entra como parámetro; actualizar su única llamada actual en la capa de interfaz (lee el reloj en `useEffect`).
- [x] T2 — Módulo puro de lugares en `src/core/place-vote.ts`: tipos + reglas — candidatos (máx. 10, nombre único normalizado, eliminar solo 0 votos, cerrada tras Match), autorización de votante Social (creador + "Voy", sin titular/suplente), cambio de voto mientras abierta, delegación (solo confirmados anotados por el creador), conteo ordenado/empate alfabético y estado del Match (sin votos / líder único / empate / declarado).
- [x] T3 — Puerta `node --test`: compilación de la lógica con `tsconfig.test.json` (solo TypeScript ya instalado) y script `test` del paquete; 14 tests de las reglas nuevas (incluida la fecha como parámetro). **Verde: 14/14.**

## Fase 2 — Persistencia (capa de almacenamiento)

- [x] T4 — Migración vía MCP: `create_place_vote_tables` (tablas `place_candidates`, `place_votes`, columna `panoramas.match_candidate_id`, índices únicos por votante y por nombre de candidato).
- [x] T5 — RLS + privilegios: `place_vote_rls` + `place_votes_guest_delete` (borra su fila al dejar de "Voy") + `place_vote_polish_index`. **12 pruebas REST empíricas en verde**: invitado "Voy" vota/cambia/propropone ✓; "En duda", sin secreto y suplantación bloqueados ✓; fila ajena intocable ✓; `delegated` prohibido por privilegio de columna ✓; Match declarado cierra insert/update/candidatos ✓; lectura pública ✓. Fixtures eliminados tras la prueba (cascada verificada).
- [x] T6 — Repositorio: `fetchPlaceData`, `insertPlaceCandidateRow`, `deletePlaceCandidateRow`, `upsertPlaceVoteRow` (conflicto `panorama_id+voter_ref`), `deletePlaceVoteRow`, `declareMatchRow`; mapeo de participantes con `creatorAdded` (fila sin secret y sin auth_user_id).

## Fase 3 — Orquestación e interfaz

- [x] T7 — Store (`use-panorama-store.ts`): estado `place` cargado al abrir/crear Social, acciones `addPlaceCandidate`, `removePlaceCandidate`, `castCreatorVote` (propio y delegación), `declarePlaceMatch`, retiro del voto cuando alguien deja de ir (caso límite 6) y candidatos iniciales al crear.
- [x] T7-bis — Componente `place-vote-section.tsx` en el dashboard: lista con conteos, votar propio/delegado (selector "a nombre de"), declarar Match por candidato (empate = elegir), quitar sin votos, proponer; bloque de cierre con 🏆.
- [x] T8 — Vista del enlace: `guest-place-vote.tsx` integrado en `guest-participation-view.tsx`: votar y proponer solo si es "Voy" y abierta; espectadores leen los mismos conteos; su voto se retira si deja de ir.
- [x] T9 — Formulario: en Social, campo opcional "¿A dónde pueden ir?" (un lugar por línea, máx. 10) registrado junto al panorama; vacío es válido.

## Fase 4 — Verificación y cierre

- [x] T10-a — `npx tsc --noEmit` limpio · `npm run build` EXIT=0 · `npm run test` 14/14.
- [ ] T10-b — Smoke en navegador 375px (dueño): crear Social con lugares, votar/cambiar, delegación, empate con desempate, Match declarado, enlace de invitado en ventana privada, cupo lleno + espera.
- [x] T11 — `AGENTS.md`/`MEMORY.md` actualizados (nuevo comando `npm run test`, reglas del modo Social, decisiones D7–D10); consolidación pendiente de `feat/001-modo-social-match` → `develop` → `main`.

# Plan 001 — Modo Social: Match de lugares

**Estado:** aprobado · Implementación de `specs/001-modo-social-match/spec.md`.

## Enfoque

El cambio entra por capas, de adentro hacia afuera, respetando la constitución:

1. **Lógica pura primero** (`src/core/`): un módulo nuevo del dominio de lugares con la regla completa: candidatos (máx. 10, nombre único normalizado), autorización de votante para Social (creador + todos los "Voy", sin titular/suplente), un voto vigente por votante (cambiable mientras esté abierta), delegación (solo para confirmados añadidos por el creador), conteo con orden/empate y estados de Match (sin votos / líder único / empate / declarado). Los datos de entrada son listas simples; nada conoce Supabase ni React.
2. **Deuda RF-8**: `getTodayLocalValue` pasa a recibir la fecha como parámetro; su única llamadora (el formulario) lee el reloj en su `useEffect` y lo pasa hacia abajo.
3. **Persistencia** (capa de almacenamiento): dos tablas nuevas ligadas por cascada al panorama (`place_candidates`, `place_votes`) y la referencia del Match declarado en la fila del panorama. RLS misifestada por la integridad del usuario: creador dueño de todo el domino de lugares de su panorama; el invitado "Voy" inscribe/cambia SOLO su voto validado por el secreto (header), prohibido mientras haya Match; espectador solo lectura.
4. **Orquestación y UI**: entra al store del dashboard y a la vista del enlace compartido una sección única "¿A dónde vamos?" (lista con conteos, proponer, votar, delegar y declarar). El mismo componente sirve en ambas vistas con distinta autorización.

## Decisiones de diseño

- **Un voto vigente por fila**: para dejar haber votos por su ownership, las filas registran el "quién vota" con una referencia única (creador o participante) y el candidato marcado; cambiar de voto actualiza la fila, no agrega historia.
- **Estado del Match en el panorama**: declarar Match es la única mutación que cierra todo — se guarda en la fila del panorama y las reglas en cascada consultan ese estado.
- **Delegación por "origen"**: la distinción de quién fue anotado a mano por el creador vive en la fila del participante (existe solo en su lista), y ese flag lo obtiene la capa de mapa al transformar las filas hacia el dominio.
- **Social vota sin titulares**: la autorización depende solo del estado "Voy", no del cupo; si el panorama Social lleva cupo, cumple suplente igual.
- **Tests sin dependencias nuevas**: TypeScript ya instalado y `node --test`, compilar la lógica (con tests de integración rápida) y correr `node --test` sobre el resultado; la puerta es el script `test` del paquete (construcción incluida).

## Riesgos / mitigaciones

- **RLS interna**: el mismo secreto de invitado (header) valida el voto; una sola clave conceptual reutilizada, ya probada en V2.
- **Empate/ordenamento**: el orden de empate alfabético en la lógica pura evita diferencias de presentación entre panel y enlace.
- **Regresiones de feastas/CLP**: el test de la deuda RF-8 (uke無 manejo con fecha en marzo les pasadas) asegurará que la hora local no involucre fecha de desfase.

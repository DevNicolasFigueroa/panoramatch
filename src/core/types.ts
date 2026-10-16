/**
 * Tipos y catálogo del dominio PanoraMatch.
 * Todo el estado se describe aquí para que la lógica (core) y la interfaz
 * (components) compartan un único contrato tipado.
 */

/** Modos / plantillas de panorama disponibles en V1. */
export type PanoramaMode = "social" | "colaborativo" | "deportivo";

/** Metadatos de presentación de cada modo (los textos son de la UI). */
export interface PanoramaModeInfo {
  id: PanoramaMode;
  label: string;
  description: string;
}

export const PANORAMA_MODES: readonly PanoramaModeInfo[] = [
  {
    id: "social",
    label: "Social",
    description: "Salida a comer, bar o carrete",
  },
  {
    id: "colaborativo",
    label: "Colaborativo",
    description: "Asado o junta en casa",
  },
  {
    id: "deportivo",
    label: "Deportivo",
    description: "Fútbol, tenis, pádel, básquetbol",
  },
] as const;

/** Estados de asistencia de un amigo. */
export type AttendanceStatus = "going" | "maybe" | "not_going";

/** Un amigo invitado al panorama. */
export interface Attendee {
  id: string;
  name: string;
  status: AttendanceStatus;
  /**
   * Numeración incremental que indica en qué momento confirmó ("Voy").
   * Define quién es titular y quién suplente cuando hay cupo máximo.
   */
  confirmedOrder: number | null;
}

/** Resultado de clasificar la lista de asistentes según el cupo. */
export interface AttendeeClassification {
  /** Confirmados "Voy" dentro del cupo (juegan / asisten). */
  titulars: Attendee[];
  /** Confirmados "Voy" fuera del cupo: lista de espera (suplentes). */
  waitlist: Attendee[];
  /** Invitados "En duda". */
  maybe: Attendee[];
  /** Invitados "No pueden". */
  declined: Attendee[];
}

/** El evento (panorama) creado. */
export interface PanoramaEvent {
  id: string;
  title: string;
  mode: PanoramaMode;
  /** Fecha y hora local como 'YYYY-MM-DDTHH:mm' (hora de Chile). */
  startsAt: string;
  /** Cupo máximo de titulares. `null` significa sin límite. */
  maxCapacity: number | null;
  /** Costo total estimado o fijo en CLP (entero). */
  totalCostCLP: number;
}

/** Semáforo de quórum del panorama. */
export type QuorumStatus = "pending" | "partial" | "ready";

/** Un panorama guardado en el listado, con su propia lista de asistentes. */
export interface SavedPanorama {
  /** Igual a PanoramaEvent.id: garantiza unicidad en el listado. */
  id: string;
  event: PanoramaEvent;
  attendees: Attendee[];
}

/** Resumen derivado (calculado en core) para las tarjetas del listado. */
export interface SavedPanoramaSummary {
  id: string;
  title: string;
  mode: PanoramaMode;
  /** Fecha ya formateada en español, en hora local. */
  formattedDate: string;
  quorum: QuorumStatus;
  quorumLabel: string;
  titularCount: number;
  maxCapacity: number | null;
  totalCostCLP: number;
}

/** Estado completo persistido en localStorage (clave 'panoramatch-v1-data'). */
export interface PanoramaStoreState {
  /** Listado persistente de todos los panoramas creados. */
  panoramas: SavedPanorama[];
  /** Panorama abierto en el panel activo; null = vista de creación/listado. */
  activeId: string | null;
}

/** Estado inicial vacío, usado antes de crear el primer panorama. */
export const EMPTY_PANORAMA_STORE: PanoramaStoreState = {
  panoramas: [],
  activeId: null,
};

/**
 * Shape legacy de la V1.0 ({ event, attendees }). Solo existe aquí para que
 * `loadPanoramaStore` pueda migrar datos ya guardados sin perderlos.
 */
export interface LegacyPanoramaStoreShape {
  event: PanoramaEvent | null;
  attendees: Attendee[];
}

/** Datos crudos que entrega el formulario antes de validarlos. */
export interface CreateEventInput {
  title: string;
  mode: PanoramaMode;
  startsAt: string;
  maxCapacity: number | null;
  totalCostCLP: number;
}

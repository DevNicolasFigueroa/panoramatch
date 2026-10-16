/**
 * Utilidades de fecha y hora local (hora de Chile, America/Santiago).
 *
 * Regla del producto: NUNCA usar toISOString() ni conversiones UTC para la
 * entrada/salida visual, porque desplazan el día. Todo se maneja con la
 * representación local 'YYYY-MM-DDTHH:mm' (= formato del input datetime-local).
 *
 * Este módulo es puro: sin React, sin DOM y sin dependencias externas.
 */

const LOCAL_DATETIME_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

const MONTH_NAMES_ES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
] as const;

const WEEKDAY_NAMES_ES = [
  "lunes",
  "martes",
  "miércoles",
  "jueves",
  "viernes",
  "sábado",
  "domingo",
] as const;

/** Valida el formato local 'YYYY-MM-DDTHH:mm'. */
export function isValidLocalDatetime(value: string): boolean {
  return LOCAL_DATETIME_PATTERN.test(value) && !Number.isNaN(new Date(value).getTime());
}

/** Fecha/hora actual en formato 'YYYY-MM-DDTHH:mm', construida con hora local pura. */
export function getTodayLocalValue(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
}

/**
 * Formatea la fecha local del evento para la cabecera del panel:
 * "jueves 16 de octubre · 21:00 hrs" (sin riesgo de desplazamiento UTC).
 */
export function formatPanoramaStartsAt(localValue: string): string {
  const match = LOCAL_DATETIME_PATTERN.exec(localValue);
  if (match === null) {
    return "Fecha sin definir";
  }
  const [, year, month, day, hours, minutes] = match;
  // new Date(año, mes-1, día) se interpreta en zona local: nunca se corren días.
  const weekday = WEEKDAY_NAMES_ES[
    (new Date(Number(year), Number(month) - 1, Number(day)).getDay() + 6) % 7
  ];
  const monthName = MONTH_NAMES_ES[Number(month) - 1];
  return `${weekday} ${Number(day)} de ${monthName} · ${hours}:${minutes} hrs`;
}

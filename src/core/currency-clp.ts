/**
 * Reglas financieras en Pesos Chilenos (CLP).
 *
 * Regla de oro del producto: los CLP jamás tienen decimales. Todo monto es un
 * entero y, al dividir gastos, se usa el redondeo práctico chileno hacia
 * arriba al múltiplo de $100 más cercano.
 *
 * Este módulo es puro: sin React, sin DOM y sin dependencias externas.
 */

/** El "paso" práctico de moneda al dividir cuentas en Chile. */
const CLP_STEP = 100;

/** Valida que un monto sea un entero CLP (entero >= 0). */
export function isValidCLPAmount(value: number): boolean {
  return Number.isInteger(value) && value >= 0;
}

/** Redondea hacia arriba al múltiplo de $100 más cercano (ej. 11666.66 -> 11700). */
export function roundUpToCLPStep(amount: number): number {
  return Math.ceil(amount / CLP_STEP) * CLP_STEP;
}

/** Formatea un entero CLP como texto visual: $XX.XXX (sin decimales, punto de miles). */
export function formatCLP(amount: number): string {
  if (!isValidCLPAmount(amount)) {
    return "$0";
  }
  // Formato manual para garantizar el punto como separador de miles en cualquier entorno.
  return `$${String(amount).replace(/\B(?=(\d{3})+(?!\d))/g, ".")}`;
}

/** Resultado completo de dividir el costo entre los confirmados titulares. */
export interface CostSplit {
  /** Costo total del panorama en CLP. */
  totalCostCLP: number;
  /** Cantidad de confirmados "Voy" titulares con los que se dividió. */
  confirmedCount: number;
  /** Cuánto paga cada confirmado titular en CLP. */
  perHeadCLP: number;
  /** true si la división fue exacta (sin redondeo). */
  isExactDivision: boolean;
  /** Dinero que sobra a favor del pozo común por el redondeo. */
  surplusCLP: number;
  /** false cuando aún no hay confirmados y la cuenta no puede dividirse. */
  canSplit: boolean;
}

/**
 * Divide el costo total entre los confirmados titulares aplicando la regla
 * chilena: si la división no es exacta, cada uno paga el múltiplo de $100
 * hacia arriba y la diferencia queda explícita como pozo común.
 */
export function splitCost(totalCostCLP: number, confirmedCount: number): CostSplit {
  const split: CostSplit = {
    totalCostCLP,
    confirmedCount,
    perHeadCLP: 0,
    isExactDivision: false,
    surplusCLP: 0,
    canSplit: false,
  };

  if (confirmedCount <= 0) {
    // Sin confirmados todavía no se puede dividir la cuenta.
    return split;
  }

  split.canSplit = true;
  const exactPerHead = totalCostCLP / confirmedCount;

  if (Number.isInteger(exactPerHead)) {
    // División exacta: cada uno paga el monto justo.
    split.perHeadCLP = exactPerHead;
    split.isExactDivision = true;
    split.surplusCLP = 0;
    return split;
  }

  // Redondeo práctico chileno hacia arriba al múltiplo de $100.
  split.perHeadCLP = roundUpToCLPStep(exactPerHead);
  split.isExactDivision = false;
  split.surplusCLP = split.perHeadCLP * confirmedCount - totalCostCLP;
  return split;
}

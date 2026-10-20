/**
 * Iniciales del nombre visible, para la foto de perfil de la identidad de la
 * app (avatar del usuario con sesión en la cabecera). 2 letras máximo:
 * las primeras de la primera y última palabra, en mayúscula.
 */

export function initialsFromName(displayName: string): string {
  const trimmed = displayName.trim();
  if (trimmed === "") {
    return "";
  }
  const words = trimmed.split(/\s+/);
  const firstInitial = words[0]!.charAt(0).toUpperCase();
  if (words.length === 1) {
    return firstInitial;
  }
  const lastInitial = words[words.length - 1]!.charAt(0).toUpperCase();
  return `${firstInitial}${lastInitial}`;
}

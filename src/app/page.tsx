import PanoramaApp from "@/components/panorama-app";

/**
 * Página única de PanoraMatch V1.
 * El flujo completo (creador rápido + panel activo) vive en un componente
 * cliente porque el estado es local (localStorage) en esta versión.
 */
export default function HomePage() {
  return <PanoramaApp />;
}

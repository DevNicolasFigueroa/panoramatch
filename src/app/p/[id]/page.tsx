import { notFound } from "next/navigation";

import GuestParticipationView from "@/components/guest-participation-view";
import { isPanoramaIdLike } from "@/core/guest-participation";

/**
 * Vista del enlace compartido (Requisito 3): el invitado externo responde
 * Voy / En duda / No puedo sin crear cuenta ni iniciar sesión.
 */
export default async function ParticipantPanoramaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!isPanoramaIdLike(id)) {
    notFound();
  }
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-5 px-4 pt-7 pb-12 sm:max-w-lg">
      <GuestParticipationView panoramaId={id} />
    </main>
  );
}

import { notFound } from "next/navigation";

import GuestParticipationView from "@/components/guest-participation-view";
import { isPanoramaIdLike } from "@/core/guest-participation";

/**
 * Vista del enlace compartido (Requisito 3): el participante tiene sesión
 * (Google o correo; el middleware protege /p/*) y responde Voy / En duda /
 * No puedo con su cuenta.
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
    <main className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col gap-5 px-4 pt-5 pb-12 sm:px-6 sm:pt-7 lg:px-8">
      <GuestParticipationView panoramaId={id} />
    </main>
  );
}

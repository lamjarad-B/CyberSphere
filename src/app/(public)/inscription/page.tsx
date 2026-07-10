import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { RegisterForm } from "@/components/auth/register-form";
import { cardClass } from "@/components/ui";

export const metadata: Metadata = { title: "Inscription" };

export default async function InscriptionPage() {
  const session = await getSession();
  if (session) redirect("/");

  return (
    <div className="mx-auto max-w-md py-8">
      <div className={`${cardClass} p-8`}>
        <h1 className="mb-1 text-2xl font-bold">Inscription</h1>
        <p className="mb-6 text-sm text-muted">
          Créez votre compte pour rejoindre la communauté et commenter.
        </p>
        <RegisterForm />
      </div>
    </div>
  );
}

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { LoginForm } from "@/components/auth/login-form";
import { cardClass } from "@/components/ui";

export const metadata: Metadata = { title: "Connexion" };

export default async function ConnexionPage({
  searchParams,
}: {
  searchParams: Promise<{ redirection?: string }>;
}) {
  const session = await getSession();
  if (session) redirect("/");

  const { redirection } = await searchParams;

  return (
    <div className="mx-auto max-w-md py-8">
      <div className={`${cardClass} p-8`}>
        <h1 className="mb-1 text-2xl font-bold">Connexion</h1>
        <p className="mb-6 text-sm text-muted">
          Connectez-vous pour commenter les articles.
        </p>
        <LoginForm redirection={redirection} />
      </div>
    </div>
  );
}

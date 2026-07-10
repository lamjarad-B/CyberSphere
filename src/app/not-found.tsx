import Link from "next/link";
import { buttonClass } from "@/components/ui";

export default function NotFound() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 px-4 py-24 text-center">
      <p className="font-mono text-sm text-accent">HTTP/1.1 404 Not Found</p>
      <h1 className="text-4xl font-bold">Page introuvable</h1>
      <p className="max-w-md text-muted">
        La page que vous cherchez n&apos;existe pas ou a été déplacée.
      </p>
      <Link href="/" className={buttonClass}>
        Retour à l&apos;accueil
      </Link>
    </div>
  );
}

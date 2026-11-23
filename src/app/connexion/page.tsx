import Link from "next/link";
import { AuthForm } from "./auth-form";

export const metadata = { title: "Connexion" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ suite?: string; erreur?: string }>;
}) {
  const { suite, erreur } = await searchParams;
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <Link href="/" className="font-display text-2xl font-bold">
          Paye<span className="text-brand">Facile</span>
        </Link>
        <div className="card mt-6">
          {erreur && <p className="mb-3 text-sm text-risk">Le lien a expiré ou n&apos;est plus valide.</p>}
          <AuthForm next={suite ?? "/app"} />
        </div>
        <p className="mt-4 text-xs text-slate-500">Facturation des loyers et des abonnements Wi-Fi.</p>
      </div>
    </main>
  );
}

import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { IconBall } from "@/components/icons";
import { LoginForm } from "./LoginForm";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/");
  return (
    <main className="grid min-h-dvh place-items-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <span className="mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-accent/15 text-accent"><IconBall className="h-8 w-8" /></span>
          <h1 className="text-2xl font-semibold">Football Odds Scanner</h1>
          <p className="mt-1 text-sm text-muted">Prijavite se da biste nastavili</p>
        </div>
        <div className="rounded-2xl border border-line bg-panel p-6"><LoginForm /></div>
      </div>
    </main>
  );
}

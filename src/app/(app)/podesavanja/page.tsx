import { PageHeader, Card } from "@/components/ui";
import { getSettings } from "@/lib/settings-repo";
import { requireUser } from "@/lib/auth/session";
import { SettingsForm } from "./SettingsForm";
import { PasswordForm } from "./PasswordForm";
import { oddsPapiKey } from "@/lib/robot/providers";
import { apiFootballKey } from "@/lib/results/apifootball";

export default async function SettingsPage() {
  const [settings, user] = await Promise.all([getSettings(), requireUser()]);
  return (
    <>
      <PageHeader title="Podešavanja" subtitle="Kvota, ulog, izvori podataka i nalog." />
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
        <Card>
          <h2 className="mb-4 font-semibold">Pravila skeniranja i simulacije</h2>
          <SettingsForm maxOdds={settings.maxOdds} stake={settings.stakePerSelection} maxRequests={settings.maxRequestsPerScan} checkMinutes={settings.resultCheckMinutes} opChecks={settings.oddsPapiResultChecksPerDay} goalsPair={settings.excludeGoalsPair} combine={settings.combineResultGoals} fallback={settings.comboFallback} />
        </Card>
        <Card>
          <h2 className="mb-4 font-semibold">Promena lozinke</h2>
          <PasswordForm />
        </Card>
        </div>
        <div className="space-y-4">
          <Card>
            <h2 className="mb-3 font-semibold">Izvori podataka</h2>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between gap-3"><dt className="text-muted">Kvote</dt><dd>{oddsPapiKey() ? "OddsPapi (srpske kladionice)" : "Samo DEMO (nema API ključa)"}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-muted">Rezultati</dt><dd>{apiFootballKey() ? "API-Football + OddsPapi" : oddsPapiKey() ? "Samo OddsPapi" : "Nije podešeno"}</dd></div>
            </dl>
          </Card>
          <Card>
            <h2 className="mb-3 font-semibold">Nalog</h2>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between gap-3"><dt className="text-muted">Email</dt><dd className="truncate">{user.email}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-muted">Uloga</dt><dd>{user.role === "ADMIN" ? "Administrator" : "Korisnik"}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-muted">Vremenska zona</dt><dd>{settings.timezone}</dd></div>
            </dl>
          </Card>
          <Card>
            <h2 className="mb-3 font-semibold">Rezervna kopija i izvoz</h2>
            <p className="mb-3 text-xs text-muted">CSV se otvara u Excel-u (svi tipovi, rezultati i profit). JSON je kompletna kopija podataka aplikacije.</p>
            <div className="flex flex-wrap gap-2 text-sm">
              <a href="/api/export?format=csv" className="rounded-xl border border-accent/50 px-3 py-2 text-accent hover:bg-accent/10">Preuzmi CSV</a>
              <a href="/api/export?format=json" className="rounded-xl border border-line px-3 py-2 text-muted hover:text-text">Preuzmi JSON backup</a>
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}

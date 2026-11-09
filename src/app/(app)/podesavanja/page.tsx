import { PageHeader, Card } from "@/components/ui";
import { getSettings } from "@/lib/settings-repo";
import { requireUser } from "@/lib/auth/session";
import { SettingsForm } from "./SettingsForm";

export default async function SettingsPage() {
  const [settings, user] = await Promise.all([getSettings(), requireUser()]);
  return (
    <>
      <PageHeader title="Podešavanja" subtitle="Kvota, ulog, izvori podataka i nalog." />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <h2 className="mb-4 font-semibold">Pravila skeniranja i simulacije</h2>
          <SettingsForm maxOdds={settings.maxOdds} stake={settings.stakePerSelection} />
        </Card>
        <div className="space-y-4">
          <Card>
            <h2 className="mb-3 font-semibold">Izvori podataka</h2>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between gap-3"><dt className="text-muted">Kvote</dt><dd>Nije podešeno (faza 2)</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-muted">Rezultati</dt><dd>Nije podešeno (faza 4)</dd></div>
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
        </div>
      </div>
    </>
  );
}

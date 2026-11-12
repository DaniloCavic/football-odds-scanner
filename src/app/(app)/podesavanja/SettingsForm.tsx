"use client";

import { useActionState } from "react";
import { saveSettingsAction, type SettingsState } from "./actions";

const input = "w-full rounded-xl border border-line bg-bg px-3.5 py-2.5 tabular-nums outline-none focus:border-accent focus:ring-2 focus:ring-accent/30";

export function SettingsForm({ maxOdds, stake, maxRequests, checkMinutes, opChecks, goalsPair, combine }: { maxOdds: number; stake: number; maxRequests: number; checkMinutes: number; opChecks: number; goalsPair: boolean; combine: boolean }) {
  const [state, action, pending] = useActionState<SettingsState, FormData>(saveSettingsAction, {});
  return (
    <form action={action} className="space-y-5">
      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor="maxOdds" className="mb-1.5 block text-sm text-muted">Maksimalna kvota</label>
          <input id="maxOdds" name="maxOdds" inputMode="decimal" defaultValue={maxOdds.toFixed(2)} className={input} />
          <p className="mt-1.5 text-xs text-muted">Od 1.01 do 1.30. Kvota 1.30 se prihvata, 1.31 ne.</p>
        </div>
        <div>
          <label htmlFor="stakePerSelection" className="mb-1.5 block text-sm text-muted">Ulog po tipu (RSD)</label>
          <input id="stakePerSelection" name="stakePerSelection" inputMode="decimal" defaultValue={stake.toFixed(2)} className={input} />
          <p className="mt-1.5 text-xs text-muted">Važi samo za nove obračune, stari se ne menjaju.</p>
        </div>
        <div>
          <label htmlFor="maxRequestsPerScan" className="mb-1.5 block text-sm text-muted">Limit API zahteva po skeniranju</label>
          <input id="maxRequestsPerScan" name="maxRequestsPerScan" inputMode="numeric" defaultValue={maxRequests} className={input} />
          <p className="mt-1.5 text-xs text-muted">Robot staje kad potroši ovoliko OddsPapi zahteva, da ne potroši mesečnu kvotu.</p>
        </div>
        <div>
          <label htmlFor="resultCheckMinutes" className="mb-1.5 block text-sm text-muted">Provera rezultata – interval (min)</label>
          <input id="resultCheckMinutes" name="resultCheckMinutes" inputMode="numeric" defaultValue={checkMinutes} className={input} />
          <p className="mt-1.5 text-xs text-muted">Najmanji razmak između dva API-Football zahteva za isti dan (5–240). Besplatno: 100 zahteva/dan.</p>
        </div>
        <div>
          <label htmlFor="oddsPapiResultChecksPerDay" className="mb-1.5 block text-sm text-muted">OddsPapi provere rezultata dnevno</label>
          <input id="oddsPapiResultChecksPerDay" name="oddsPapiResultChecksPerDay" inputMode="numeric" defaultValue={opChecks} className={input} />
          <p className="mt-1.5 text-xs text-muted">Rezervni izvor – 1 zahtev po utakmici, troši mesečnu OddsPapi kvotu.</p>
        </div>
      </div>
      <label className="flex items-start gap-3 rounded-xl border border-line p-3 text-sm">
        <input type="checkbox" name="excludeGoalsPair" defaultChecked={goalsPair} className="mt-0.5 accent-[var(--color-accent)]" />
        <span>
          <span className="font-medium">Izbaci utakmice gde su i 2+ i 0–3 do maks. kvote</span>
          <span className="block text-xs text-muted">Takva utakmica je praktično igra na „2 ili 3 gola“ – robot ne čuva nijedan od ta dva tipa (1 i 2 ostaju).</span>
        </span>
      </label>
      <label className="flex items-start gap-3 rounded-xl border border-line p-3 text-sm">
        <input type="checkbox" name="combineResultGoals" defaultChecked={combine} className="mt-0.5 accent-[var(--color-accent)]" />
        <span>
          <span className="font-medium">Spoji 1/2 i tip golova u jedan tip („1&2+“, „1&0–3“, „2&2+“, „2&0–3“)</span>
          <span className="block text-xs text-muted">Igra se po kvoti kladionice za spojeni tip (bez ograničenja kvote). Ako izvor nema tu kvotu, utakmica se preskače.</span>
        </span>
      </label>
      {state.error && <p role="alert" className="rounded-lg bg-lost/10 px-3 py-2 text-sm text-lost">{state.error}</p>}
      {state.ok && <p role="status" className="rounded-lg bg-won/10 px-3 py-2 text-sm text-won">Sačuvano.</p>}
      <button type="submit" disabled={pending} className="rounded-xl bg-accent px-5 py-2.5 font-semibold text-bg hover:bg-accent-strong disabled:opacity-60">
        {pending ? "Čuvanje…" : "Sačuvaj"}
      </button>
    </form>
  );
}

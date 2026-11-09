"use client";

import { useActionState } from "react";
import { saveSettingsAction, type SettingsState } from "./actions";

const input = "w-full rounded-xl border border-line bg-bg px-3.5 py-2.5 tabular-nums outline-none focus:border-accent focus:ring-2 focus:ring-accent/30";

export function SettingsForm({ maxOdds, stake }: { maxOdds: number; stake: number }) {
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
      </div>
      {state.error && <p role="alert" className="rounded-lg bg-lost/10 px-3 py-2 text-sm text-lost">{state.error}</p>}
      {state.ok && <p role="status" className="rounded-lg bg-won/10 px-3 py-2 text-sm text-won">Sačuvano.</p>}
      <button type="submit" disabled={pending} className="rounded-xl bg-accent px-5 py-2.5 font-semibold text-bg hover:bg-accent-strong disabled:opacity-60">
        {pending ? "Čuvanje…" : "Sačuvaj"}
      </button>
    </form>
  );
}

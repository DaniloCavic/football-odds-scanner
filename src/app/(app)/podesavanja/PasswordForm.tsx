"use client";

import { useActionState, useEffect, useRef } from "react";
import { changePasswordAction, type PasswordState } from "./password-actions";

const input = "w-full rounded-xl border border-line bg-bg px-3.5 py-2.5 outline-none focus:border-accent focus:ring-2 focus:ring-accent/30";

export function PasswordForm() {
  const [state, action, pending] = useActionState<PasswordState, FormData>(changePasswordAction, {});
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => { if (state.ok) ref.current?.reset(); }, [state]);
  return (
    <form ref={ref} action={action} className="space-y-3">
      <div>
        <label htmlFor="current" className="mb-1 block text-sm text-muted">Trenutna lozinka</label>
        <input id="current" name="current" type="password" autoComplete="current-password" className={input} />
      </div>
      <div>
        <label htmlFor="next" className="mb-1 block text-sm text-muted">Nova lozinka (min. 10 znakova)</label>
        <input id="next" name="next" type="password" autoComplete="new-password" className={input} />
      </div>
      <div>
        <label htmlFor="confirm" className="mb-1 block text-sm text-muted">Potvrda nove lozinke</label>
        <input id="confirm" name="confirm" type="password" autoComplete="new-password" className={input} />
      </div>
      {state.error && <p role="alert" className="rounded-lg bg-lost/10 px-3 py-2 text-sm text-lost">{state.error}</p>}
      {state.ok && <p role="status" className="rounded-lg bg-won/10 px-3 py-2 text-sm text-won">Lozinka je promenjena. Ostali uređaji su odjavljeni.</p>}
      <button type="submit" disabled={pending} className="rounded-xl bg-accent px-5 py-2.5 font-semibold text-bg hover:bg-accent-strong disabled:opacity-60">
        {pending ? "Menjam…" : "Promeni lozinku"}
      </button>
    </form>
  );
}

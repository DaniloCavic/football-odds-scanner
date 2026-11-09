"use client";

import { useActionState } from "react";
import { loginAction, type LoginState } from "./actions";

export function LoginForm() {
  const [state, action, pending] = useActionState<LoginState, FormData>(loginAction, {});
  return (
    <form action={action} className="space-y-4" noValidate>
      <div>
        <label htmlFor="email" className="mb-1.5 block text-sm text-muted">Email</label>
        <input id="email" name="email" type="email" autoComplete="email" required defaultValue={state.email}
          className="w-full rounded-xl border border-line bg-bg px-3.5 py-2.5 outline-none focus:border-accent focus:ring-2 focus:ring-accent/30" />
      </div>
      <div>
        <label htmlFor="password" className="mb-1.5 block text-sm text-muted">Lozinka</label>
        <input id="password" name="password" type="password" autoComplete="current-password" required
          className="w-full rounded-xl border border-line bg-bg px-3.5 py-2.5 outline-none focus:border-accent focus:ring-2 focus:ring-accent/30" />
      </div>
      {state.error && <p role="alert" className="rounded-lg bg-lost/10 px-3 py-2 text-sm text-lost">{state.error}</p>}
      <button type="submit" disabled={pending}
        className="w-full rounded-xl bg-accent px-4 py-2.5 font-semibold text-bg transition hover:bg-accent-strong disabled:opacity-60">
        {pending ? "Prijavljivanje…" : "Prijavi se"}
      </button>
    </form>
  );
}

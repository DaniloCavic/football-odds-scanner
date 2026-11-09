"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { NAV_ITEMS } from "./nav-items";
import {
  IconActive, IconBall, IconClose, IconDashboard, IconFilter, IconHistory, IconLogout, IconMenu, IconRobot, IconSettings, IconStats,
} from "./icons";
import { logoutAction } from "@/app/login/actions";

const ICONS = {
  dashboard: IconDashboard, robot: IconRobot, filter: IconFilter, active: IconActive,
  stats: IconStats, history: IconHistory, settings: IconSettings,
} as const;

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <ul className="space-y-1">
      {NAV_ITEMS.map((item) => {
        const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
        const Icon = ICONS[item.icon];
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                active ? "bg-accent/15 text-accent" : "text-muted hover:bg-panel-2 hover:text-text"
              }`}
            >
              <Icon />
              {item.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function Brand() {
  return (
    <div className="flex items-center gap-2.5 px-2">
      <span className="grid h-9 w-9 place-items-center rounded-xl bg-accent/15 text-accent"><IconBall /></span>
      <span className="text-[15px] font-semibold leading-tight">Football Odds<br /><span className="text-accent">Scanner</span></span>
    </div>
  );
}

function Footer({ email }: { email: string }) {
  return (
    <div className="border-t border-line pt-4">
      <p className="truncate px-3 text-xs text-muted" title={email}>{email}</p>
      <form action={logoutAction}>
        <button type="submit" className="mt-2 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-muted hover:bg-panel-2 hover:text-lost">
          <IconLogout /> Odjava
        </button>
      </form>
    </div>
  );
}

export function Sidebar({ email }: { email: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      {/* Desktop */}
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col justify-between border-r border-line bg-panel p-4 lg:flex">
        <div className="space-y-8">
          <Brand />
          <nav aria-label="Glavna navigacija"><NavLinks /></nav>
        </div>
        <Footer email={email} />
      </aside>

      {/* Mobilni header */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-line bg-panel/95 px-4 py-3 backdrop-blur lg:hidden">
        <Brand />
        <button type="button" onClick={() => setOpen(true)} className="rounded-lg p-2 text-muted hover:bg-panel-2" aria-label="Otvori meni">
          <IconMenu className="h-6 w-6" />
        </button>
      </header>

      {open && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Meni">
          <div className="absolute inset-0 bg-black/60" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col justify-between bg-panel p-4">
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <Brand />
                <button type="button" onClick={() => setOpen(false)} className="rounded-lg p-2 text-muted hover:bg-panel-2" aria-label="Zatvori meni">
                  <IconClose className="h-6 w-6" />
                </button>
              </div>
              <nav aria-label="Glavna navigacija"><NavLinks onNavigate={() => setOpen(false)} /></nav>
            </div>
            <Footer email={email} />
          </div>
        </div>
      )}
    </>
  );
}

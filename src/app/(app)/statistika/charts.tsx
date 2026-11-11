"use client";

import { useState } from "react";

const WON = "var(--color-won)";
const LOST = "var(--color-lost)";
const GRID = "var(--color-line)";
const MUTED = "var(--color-muted)";

const fmtInt = (n: number) => new Intl.NumberFormat("sr-Latn-RS").format(n);
const fmtRsd = (n: number) => (n > 0 ? "+" : "") + new Intl.NumberFormat("sr-Latn-RS", { maximumFractionDigits: 0 }).format(n) + " RSD";
const compact = (n: number) => (Math.abs(n) >= 1000 ? `${new Intl.NumberFormat("sr-Latn-RS", { maximumFractionDigits: 1 }).format(n / 1000)}K` : fmtInt(n));

function niceStep(max: number, ticks = 4) {
  const raw = max / ticks;
  const pow = 10 ** Math.floor(Math.log10(raw || 1));
  const n = raw / pow;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * pow;
}

export type PeriodPoint = { key: string; label: string; won: number; lost: number; void: number; passRate: number | null; net: number; cumulative: number };

/** pct = vodoravna pozicija u % širine grafikona; tooltip ostaje unutar okvira. */
function Tooltip({ pct, children }: { pct: number; children: React.ReactNode }) {
  return (
    <div className="pointer-events-none absolute top-6 z-10 w-[180px] rounded-lg border border-line bg-panel px-3 py-2 text-xs shadow-xl"
      style={{ left: `clamp(0px, calc(${pct}% - 90px), calc(100% - 180px))` }}>
      {children}
    </div>
  );
}

/** Prošlo / palo po periodu – naslagane kolone (2px razmak između segmenata). */
export function WonLostColumns({ data }: { data: PeriodPoint[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 720, H = 220, pl = 36, pr = 8, pt = 12, pb = 28;
  const max = Math.max(1, ...data.map((d) => d.won + d.lost));
  const step = niceStep(max);
  const top = Math.ceil(max / step) * step;
  const iw = W - pl - pr, ih = H - pt - pb;
  const band = iw / Math.max(data.length, 1);
  const bw = Math.min(24, band * 0.6);
  const y = (v: number) => pt + ih - (v / top) * ih;
  const every = Math.ceil(data.length / 10);
  return (
    <div className="relative">
      <div className="mb-2 flex gap-4 text-xs text-muted" aria-hidden>
        <span className="flex items-center gap-1.5"><i className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: WON }} />Prošlo</span>
        <span className="flex items-center gap-1.5"><i className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: LOST }} />Palo</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Prošli i pali tipovi po periodu" onMouseLeave={() => setHover(null)}>
        {Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step).map((v) => (
          <g key={v}>
            <line x1={pl} x2={W - pr} y1={y(v)} y2={y(v)} stroke={GRID} strokeWidth={1} />
            <text x={pl - 6} y={y(v) + 3} textAnchor="end" fontSize={10} fill={MUTED}>{fmtInt(v)}</text>
          </g>
        ))}
        {data.map((d, i) => {
          const cx = pl + band * i + band / 2;
          const yW = y(d.won), yL = y(d.won + d.lost);
          const gap = d.won && d.lost ? 2 : 0;
          return (
            <g key={d.key} onMouseEnter={() => setHover(i)}>
              <rect x={pl + band * i} y={pt} width={band} height={ih} fill="transparent" />
              {d.won > 0 && <path d={roundedTop(cx - bw / 2, yW, bw, y(0) - yW, d.lost ? 0 : 4)} fill={WON} opacity={hover == null || hover === i ? 1 : 0.5} />}
              {d.lost > 0 && <path d={roundedTop(cx - bw / 2, yL, bw, yW - yL - gap, 4)} fill={LOST} opacity={hover == null || hover === i ? 1 : 0.5} />}
              {i % every === 0 && <text x={cx} y={H - 10} textAnchor="middle" fontSize={10} fill={MUTED}>{d.label}</text>}
            </g>
          );
        })}
      </svg>
      {hover != null && data[hover] && (
        <Tooltip pct={((pl + band * hover + band / 2) / W) * 100}>
          <p className="font-medium">{data[hover].label}</p>
          <p className="flex justify-between"><span><i className="mr-1.5 inline-block h-2 w-2 rounded-sm" style={{ background: WON }} />Prošlo</span><b>{data[hover].won}</b></p>
          <p className="flex justify-between"><span><i className="mr-1.5 inline-block h-2 w-2 rounded-sm" style={{ background: LOST }} />Palo</span><b>{data[hover].lost}</b></p>
          <p className="flex justify-between text-muted"><span>Prolaznost</span><span>{data[hover].passRate == null ? "—" : `${data[hover].passRate!.toFixed(1)}%`}</span></p>
          <p className="flex justify-between text-muted"><span>Neto</span><span>{fmtRsd(data[hover].net)}</span></p>
        </Tooltip>
      )}
    </div>
  );
}

function roundedTop(x: number, y: number, w: number, h: number, r: number) {
  if (h <= 0) return "";
  const rr = Math.min(r, h, w / 2);
  return `M${x},${y + h} V${y + rr} Q${x},${y} ${x + rr},${y} H${x + w - rr} Q${x + w},${y} ${x + w},${y + rr} V${y + h} Z`;
}

/** Kumulativni neto profit – jedna linija, nula kao referenca. */
export function CumulativeLine({ data }: { data: PeriodPoint[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 720, H = 200, pl = 52, pr = 12, pt = 12, pb = 28;
  const vals = data.map((d) => d.cumulative);
  const lo = Math.min(0, ...vals), hi = Math.max(0, ...vals);
  const step = niceStep(Math.max(hi - lo, 1));
  const top = Math.ceil(hi / step) * step, bot = Math.floor(lo / step) * step;
  const iw = W - pl - pr, ih = H - pt - pb;
  const x = (i: number) => pl + (data.length <= 1 ? iw / 2 : (i / (data.length - 1)) * iw);
  const y = (v: number) => pt + ((top - v) / (top - bot || 1)) * ih;
  const path = data.map((d, i) => `${i ? "L" : "M"}${x(i)},${y(d.cumulative)}`).join(" ");
  const last = data[data.length - 1];
  const every = Math.ceil(data.length / 10);
  const color = last && last.cumulative < 0 ? LOST : WON;
  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Kumulativni neto profit"
        onMouseMove={(e) => {
          const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
          const px = ((e.clientX - r.left) / r.width) * W;
          const i = Math.round(((px - pl) / iw) * (data.length - 1));
          setHover(Math.max(0, Math.min(data.length - 1, i)));
        }}
        onMouseLeave={() => setHover(null)}>
        {Array.from({ length: Math.round((top - bot) / step) + 1 }, (_, i) => bot + i * step).map((v) => (
          <g key={v}>
            <line x1={pl} x2={W - pr} y1={y(v)} y2={y(v)} stroke={GRID} strokeWidth={v === 0 ? 1.5 : 1} />
            <text x={pl - 6} y={y(v) + 3} textAnchor="end" fontSize={10} fill={MUTED}>{compact(v)}</text>
          </g>
        ))}
        {data.map((d, i) => i % every === 0 && <text key={d.key} x={x(i)} y={H - 10} textAnchor="middle" fontSize={10} fill={MUTED}>{d.label}</text>)}
        <path d={path} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {hover != null && <line x1={x(hover)} x2={x(hover)} y1={pt} y2={pt + ih} stroke={MUTED} strokeWidth={1} />}
        {last && <circle cx={x(data.length - 1)} cy={y(last.cumulative)} r={4} fill={color} stroke="var(--color-panel)" strokeWidth={2} />}
        {hover != null && <circle cx={x(hover)} cy={y(data[hover].cumulative)} r={4} fill={color} stroke="var(--color-panel)" strokeWidth={2} />}
        {last && <text x={x(data.length - 1) - 6} y={y(last.cumulative) - 10} textAnchor="end" fontSize={11} fill="var(--color-text)">{fmtRsd(last.cumulative)}</text>}
      </svg>
      {hover != null && data[hover] && (
        <Tooltip pct={(x(hover) / W) * 100}>
          <p className="font-medium">{data[hover].label}</p>
          <p className="flex justify-between"><span>Ukupno do tada</span><b>{fmtRsd(data[hover].cumulative)}</b></p>
          <p className="flex justify-between text-muted"><span>Taj period</span><span>{fmtRsd(data[hover].net)}</span></p>
        </Tooltip>
      )}
    </div>
  );
}

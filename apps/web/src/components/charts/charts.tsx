"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { en } from "@/i18n/en";

/**
 * Charts in the site's own design (BRIEF §3, DESIGN.md): one series each, drawn in --text so the only
 * colours on screen stay the six faces; hairline recessive axes; a tooltip on hover and keyboard focus;
 * and every chart has a table view, so no value is reachable only by hovering.
 */

function Figure({ title, caption, table, children }: { title: string; caption?: string; table: ReactNode; children: ReactNode }) {
  const [showTable, setShowTable] = useState(false);
  return (
    <figure className="flex flex-col gap-2">
      <figcaption className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="t-subheading">{title}</span>
        <button type="button" className="btn min-h-9 px-2 t-meta" aria-pressed={showTable} onClick={() => { setShowTable((v) => !v); }}>
          {showTable ? en.analytics.showChart : en.analytics.showTable}
        </button>
      </figcaption>
      {caption !== undefined ? <p className="t-meta text-quiet">{caption}</p> : null}
      {showTable ? <div className="overflow-x-auto">{table}</div> : children}
    </figure>
  );
}

function Table({ head, rows }: { head: readonly string[]; rows: readonly (readonly string[])[] }) {
  return (
    <table className="t-meta w-full border-collapse text-left">
      <thead>
        <tr>
          {head.map((h) => (
            <th key={h} scope="col" className="border-b border-rule py-1 pr-4 font-[650]">{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={`${String(i)}-${r[0] ?? ""}`}>
            {r.map((cell, j) => (
              <td key={`${String(j)}-${cell}`} className="border-b border-rule/50 py-1 pr-4" style={{ fontVariantNumeric: j > 0 ? "tabular-nums" : undefined }}>{cell}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export interface BarRow {
  readonly label: string;
  /** Undefined draws no bar and shows `note` instead. */
  readonly value: number | undefined;
  readonly valueText: string;
  readonly note?: string;
}

/** Horizontal bars for a handful of labelled values, value at the tip. */
export function BarRows({ title, caption, rows, unit }: { title: string; caption?: string; rows: readonly BarRow[]; unit: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value ?? 0));
  const [active, setActive] = useState<string | undefined>(undefined);
  return (
    <Figure title={title} {...(caption === undefined ? {} : { caption })} table={<Table head={[en.analytics.kind, unit]} rows={rows.map((r) => [r.label, r.value === undefined ? (r.note ?? "") : r.valueText])} />}>
      <ul className="flex flex-col gap-2">
        {rows.map((r) => (
          <li key={r.label} className="grid grid-cols-[minmax(6rem,9rem)_1fr] items-center gap-3">
            <span className="t-meta">{r.label}</span>
            {r.value === undefined ? (
              <span className="t-meta text-quiet">{r.note}</span>
            ) : (
              <span
                className="grid grid-cols-[1fr_auto] items-center gap-2 outline-offset-2"
                tabIndex={0}
                aria-label={`${r.label}: ${r.valueText}`}
                onPointerEnter={() => { setActive(r.label); }}
                onPointerLeave={() => { setActive(undefined); }}
                onFocus={() => { setActive(r.label); }}
                onBlur={() => { setActive(undefined); }}
              >
                <span aria-hidden className="block h-4">
                  <span className="block h-4 rounded-r-[4px] bg-text transition-opacity" style={{ width: `${String(Math.max(2, (r.value / max) * 100))}%`, opacity: active === undefined || active === r.label ? 0.85 : 0.45 }} />
                </span>
                <span className="t-meta whitespace-nowrap" style={{ fontVariantNumeric: "tabular-nums" }}>{r.valueText}</span>
              </span>
            )}
          </li>
        ))}
      </ul>
    </Figure>
  );
}

export interface TrendDatum {
  readonly day: string;
  readonly value: number;
  readonly attempts: number;
}

/** A single-series line over practice days: 2px line, a 10% wash, a crosshair that snaps to the nearest day. */
export function TrendChart({ title, caption, data, format, domain, enough, notEnough }: { title: string; caption?: string; data: readonly TrendDatum[]; format: (v: number) => string; domain?: readonly [number, number]; enough: boolean; notEnough: string }) {
  const id = useId();
  const [hover, setHover] = useState<number | undefined>(undefined);
  // Drawn at the container's real width, so axis text stays its true size on a phone and in a column.
  const [width, setWidth] = useState(560);
  const observer = useRef<ResizeObserver | undefined>(undefined);
  // A callback ref, so the chart re-measures whichever element is mounted (chart, message or table swap).
  const box = useCallback((element: HTMLDivElement | null) => {
    observer.current?.disconnect();
    if (element === null) return;
    observer.current = new ResizeObserver((entries) => {
      const measured = entries[0]?.contentRect.width;
      if (measured !== undefined && measured > 0) setWidth(Math.round(measured));
    });
    observer.current.observe(element);
  }, []);
  useEffect(
    () => () => {
      observer.current?.disconnect();
    },
    [],
  );
  const height = 180;
  const pad = { left: 44, right: 56, top: 12, bottom: 24 };
  const { xs, ys, ticks, path, area } = useMemo(() => {
    const values = data.map((d) => d.value);
    const lo = domain?.[0] ?? Math.min(...values, 0);
    const hi = domain?.[1] ?? Math.max(...values, 1);
    const span = hi - lo || 1;
    const x = (i: number) => pad.left + (data.length <= 1 ? 0 : (i / (data.length - 1)) * (width - pad.left - pad.right));
    const y = (v: number) => pad.top + (1 - (v - lo) / span) * (height - pad.top - pad.bottom);
    const xsOut = data.map((_, i) => x(i));
    const ysOut = data.map((d) => y(d.value));
    const line = xsOut.map((px, i) => `${i === 0 ? "M" : "L"}${px.toFixed(1)},${(ysOut[i] ?? 0).toFixed(1)}`).join(" ");
    const base = y(lo);
    const wash = data.length === 0 ? "" : `${line} L${(xsOut[xsOut.length - 1] ?? 0).toFixed(1)},${base.toFixed(1)} L${(xsOut[0] ?? 0).toFixed(1)},${base.toFixed(1)} Z`;
    return { xs: xsOut, ys: ysOut, ticks: [lo, lo + span / 2, hi].map((v) => ({ v, y: y(v) })), path: line, area: wash };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- pad is a constant object
  }, [data, domain, width]);

  const table = <Table head={[en.analytics.day, en.analytics.value, en.analytics.attemptsThatDay]} rows={data.map((d) => [d.day, format(d.value), String(d.attempts)])} />;
  if (!enough || data.length === 0) {
    return (
      <Figure title={title} {...(caption === undefined ? {} : { caption })} table={table}>
        <div ref={box}>
          <p className="t-body text-quiet">{notEnough}</p>
        </div>
      </Figure>
    );
  }
  const last = data[data.length - 1];
  const shown = hover === undefined ? undefined : data[hover];
  return (
    <Figure title={title} {...(caption === undefined ? {} : { caption })} table={table}>
      <div className="relative" ref={box}>
        <svg
          viewBox={`0 0 ${String(width)} ${String(height)}`}
          width={width}
          height={height}
          className="block max-w-full touch-none"
          role="img"
          aria-labelledby={`${id}-desc`}
          tabIndex={0}
          onPointerMove={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const px = ((e.clientX - rect.left) / rect.width) * width;
            let best = 0;
            xs.forEach((x, i) => {
              if (Math.abs(x - px) < Math.abs((xs[best] ?? 0) - px)) best = i;
            });
            setHover(best);
          }}
          onPointerLeave={() => { setHover(undefined); }}
          onFocus={() => { setHover(data.length - 1); }}
          onBlur={() => { setHover(undefined); }}
          onKeyDown={(e) => {
            if (e.key === "ArrowLeft") setHover((h) => Math.max(0, (h ?? data.length - 1) - 1));
            if (e.key === "ArrowRight") setHover((h) => Math.min(data.length - 1, (h ?? 0) + 1));
          }}
        >
          <desc id={`${id}-desc`}>{`${title}. ${en.analytics.latest(last?.day ?? "", last === undefined ? "" : format(last.value))}`}</desc>
          {ticks.map((t) => (
            <g key={t.v}>
              <line x1={pad.left} x2={width - pad.right} y1={t.y} y2={t.y} stroke="var(--rule)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
              <text x={pad.left - 6} y={t.y + 4} textAnchor="end" fontSize={11} fill="var(--text-quiet)">{format(t.v)}</text>
            </g>
          ))}
          <text x={pad.left} y={height - 6} fontSize={11} fill="var(--text-quiet)">{data[0]?.day}</text>
          <text x={width - pad.right} y={height - 6} fontSize={11} textAnchor="end" fill="var(--text-quiet)">{last?.day}</text>
          <path d={area} fill="var(--text)" opacity={0.1} />
          <path d={path} fill="none" stroke="var(--text)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          {last !== undefined ? (
            <>
              <circle cx={xs[xs.length - 1]} cy={ys[ys.length - 1]} r={4} fill="var(--text)" stroke="var(--ground)" strokeWidth={2} />
              <text x={(xs[xs.length - 1] ?? 0) + 8} y={(ys[ys.length - 1] ?? 0) + 4} fontSize={12} fill="var(--text)">{format(last.value)}</text>
            </>
          ) : null}
          {hover !== undefined ? <line x1={xs[hover]} x2={xs[hover]} y1={pad.top} y2={height - pad.bottom} stroke="var(--text-quiet)" strokeWidth={1} vectorEffect="non-scaling-stroke" /> : null}
          {hover !== undefined ? <circle cx={xs[hover]} cy={ys[hover]} r={4} fill="var(--text)" stroke="var(--ground)" strokeWidth={2} /> : null}
        </svg>
        {shown !== undefined ? (
          <div role="status" className="panel pointer-events-none absolute top-0 bg-ground px-2 py-1 t-meta" style={{ left: Math.min(Math.max(0, width - 180), Math.max(0, (xs[hover ?? 0] ?? 0) - 60)) }}>
            <span className="block font-[650]" style={{ fontVariantNumeric: "tabular-nums" }}>{format(shown.value)}</span>
            <span className="block text-quiet">{en.analytics.tooltipDay(shown.day, shown.attempts)}</span>
          </div>
        ) : null}
      </div>
    </Figure>
  );
}

export interface HeatDatum {
  readonly id: string;
  readonly row: string;
  readonly col: string;
  /** 0 slowest … 4 fastest; undefined when there's no data. */
  readonly speedStep: 0 | 1 | 2 | 3 | 4 | undefined;
  readonly band: "high" | "mid" | "low" | undefined;
  readonly tooltip: string;
  readonly tableRow: readonly string[];
}

/** DESIGN.md's mastery ramp: one lightness ramp in --text at five steps, 12% to 100%. */
const SPEED_OPACITY = [0.12, 0.3, 0.55, 0.78, 1] as const;
const BORDER: Record<"high" | "mid" | "low", string> = { high: "0px", mid: "2px", low: "4px" };

/**
 * A grid where fill is recall speed (darker is faster) and the inner border is accuracy (thicker is less
 * accurate), with cells that can't occur left blank (BRIEF §8's letter-pair heatmap and 3-style grid).
 */
export function HeatGrid({ title, caption, rows, cols, rowLabel, colLabel, data, tableHead, cellSize = 22 }: { title: string; caption?: string; rows: readonly { key: string; label: string }[]; cols: readonly { key: string; label: string }[]; rowLabel: string; colLabel: string; data: ReadonlyMap<string, HeatDatum>; tableHead: readonly string[]; cellSize?: number }) {
  const [active, setActive] = useState<HeatDatum | undefined>(undefined);
  const byCell = useMemo(() => new Map([...data.values()].map((d) => [`${d.row}|${d.col}`, d])), [data]);
  // The table lists what has data; blank cells would only be rows of dashes.
  const table = <Table head={tableHead} rows={[...data.values()].filter((d) => d.speedStep !== undefined).map((d) => d.tableRow)} />;
  return (
    <Figure title={title} {...(caption === undefined ? {} : { caption })} table={table}>
      <div className="flex flex-wrap items-center gap-4 t-meta text-quiet">
        <span className="flex items-center gap-1">
          {en.analytics.slower}
          {SPEED_OPACITY.map((o) => (
            <span key={o} aria-hidden className="inline-block h-3 w-3 rounded-[2px] bg-text" style={{ opacity: o }} />
          ))}
          {en.analytics.faster}
        </span>
        <span className="flex items-center gap-2">
          {(["high", "mid", "low"] as const).map((b) => (
            <span key={b} className="flex items-center gap-1">
              <span aria-hidden className="inline-block h-3 w-3 rounded-[2px]" style={{ boxShadow: `inset 0 0 0 ${BORDER[b] === "0px" ? "1px var(--rule)" : `${BORDER[b]} var(--text)`}` }} />
              {en.analytics.bands[b]}
            </span>
          ))}
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="border-collapse" aria-label={title}>
          <thead>
            <tr>
              <th scope="col" className="t-meta sticky left-0 bg-ground pr-1 text-left text-quiet">
                <span className="sr-only">{`${rowLabel} / ${colLabel}`}</span>
              </th>
              {cols.map((c) => (
                <th key={c.key} scope="col" className="t-meta px-0 text-center font-[600]" style={{ width: cellSize }} title={c.key}>
                  <span className="casual">{c.label}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key}>
                <th scope="row" className="t-meta sticky left-0 bg-ground pr-1 text-right font-[600]" title={r.key}>
                  <span className="casual">{r.label}</span>
                </th>
                {cols.map((c) => {
                  const d = byCell.get(`${r.key}|${c.key}`);
                  return (
                    <td key={c.key} className="p-[1px]">
                      {d === undefined ? (
                        <span aria-hidden className="block" style={{ width: cellSize, height: cellSize }} />
                      ) : (
                        <span
                          tabIndex={d.speedStep === undefined ? -1 : 0}
                          aria-label={d.tooltip}
                          onPointerEnter={() => { setActive(d); }}
                          onPointerLeave={() => { setActive(undefined); }}
                          onFocus={() => { setActive(d); }}
                          onBlur={() => { setActive(undefined); }}
                          className={`relative block rounded-[3px] ${active?.id === d.id ? "outline-2 outline-offset-1 outline-[var(--focus)]" : ""}`}
                          style={{ width: cellSize, height: cellSize, boxShadow: d.band === undefined ? "inset 0 0 0 1px var(--rule)" : d.band === "high" ? "none" : `inset 0 0 0 ${BORDER[d.band]} var(--text)` }}
                        >
                          {d.speedStep !== undefined ? <span aria-hidden className="absolute inset-[4px] rounded-[2px] bg-text" style={{ opacity: SPEED_OPACITY[d.speedStep] }} /> : null}
                        </span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="t-meta min-h-5" role="status">{active?.tooltip ?? en.analytics.hoverHint}</p>
    </Figure>
  );
}

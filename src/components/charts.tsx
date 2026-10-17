import * as React from "react";

/**
 * Small server-rendered SVG charts. No client JS: every value is also in the
 * accessible <title> of its mark and in a visually hidden table.
 */

type Series = { key: string; label: string; color: string };

export function BarChart({ data, series, xKey, height = 200, yMax, stacked = false, formatY = (v: number) => String(v) }: {
  data: Record<string, string | number | null>[]; series: Series[]; xKey: string; height?: number; yMax?: number; stacked?: boolean; formatY?: (v: number) => string;
}) {
  const W = 640, H = height, padL = 34, padB = 26, padT = 10;
  const totals = data.map((d) => (stacked ? series.reduce((a, s) => a + Number(d[s.key] ?? 0), 0) : Math.max(...series.map((s) => Number(d[s.key] ?? 0)))));
  const max = yMax ?? Math.max(1, ...totals);
  const step = (W - padL) / Math.max(1, data.length);
  const bw = Math.max(4, Math.min(36, step * (stacked ? 0.6 : 0.7) / (stacked ? 1 : series.length)));
  const y = (v: number) => H - padB - (v / max) * (H - padB - padT);
  const ticks = [0, 0.5, 1].map((t) => Math.round(max * t));

  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={series.map((s) => s.label).join(", ")}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={padL} x2={W} y1={y(t)} y2={y(t)} stroke="var(--chart-grid)" />
            <text x={padL - 6} y={y(t) + 4} textAnchor="end" fontSize="11" fill="var(--text-subtle)">{formatY(t)}</text>
          </g>
        ))}
        {data.map((d, i) => {
          const cx = padL + step * i + step / 2;
          let acc = 0;
          return (
            <g key={i}>
              {series.map((s, si) => {
                const v = Number(d[s.key] ?? 0);
                const x = stacked ? cx - bw / 2 : cx - (bw * series.length) / 2 + si * bw;
                const top = stacked ? y(acc + v) : y(v);
                const h = stacked ? y(acc) - y(acc + v) : H - padB - y(v);
                acc += v;
                return <rect key={s.key} x={x} y={top} width={bw - (stacked ? 0 : 1)} height={Math.max(0, h)} rx={stacked ? 0 : 3} fill={s.color}><title>{`${d[xKey]}: ${s.label} ${v}`}</title></rect>;
              })}
              {(data.length <= 16 || i % 2 === 0) && <text x={cx} y={H - 8} textAnchor="middle" fontSize="11" fill="var(--text-subtle)">{String(d[xKey])}</text>}
            </g>
          );
        })}
      </svg>
      <Legend series={series} />
      <DataTable data={data} series={series} xKey={xKey} />
    </figure>
  );
}

export function LineChart({ data, series, xKey, height = 200, yMax = 100, formatY = (v: number) => `${v}%`, threshold }: {
  data: Record<string, string | number | null>[]; series: Series[]; xKey: string; height?: number; yMax?: number; formatY?: (v: number) => string;
  threshold?: { value: number; label: string };
}) {
  const W = 640, H = height, padL = 38, padB = 26, padT = 10;
  const step = (W - padL - 10) / Math.max(1, data.length - 1);
  const x = (i: number) => padL + step * i;
  const y = (v: number) => H - padB - (v / yMax) * (H - padB - padT);
  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={series.map((s) => s.label).join(", ")}>
        {[0, 50, 100].map((t) => t <= yMax && (
          <g key={t}>
            <line x1={padL} x2={W} y1={y(t)} y2={y(t)} stroke="var(--chart-grid)" />
            <text x={padL - 6} y={y(t) + 4} textAnchor="end" fontSize="11" fill="var(--text-subtle)">{formatY(t)}</text>
          </g>
        ))}
        {threshold && (
          <g>
            <line x1={padL} x2={W} y1={y(threshold.value)} y2={y(threshold.value)} stroke="var(--star-strong)" strokeDasharray="5 4" />
            <text x={W - 4} y={y(threshold.value) - 5} textAnchor="end" fontSize="11" fill="var(--star)">{threshold.label}</text>
          </g>
        )}
        {series.map((s) => {
          // Gaps (null) break the line rather than being drawn as zero.
          const segs: string[][] = [[]];
          data.forEach((d, i) => {
            const v = d[s.key];
            if (v === null || v === undefined) { segs.push([]); return; }
            segs[segs.length - 1].push(`${x(i)},${y(Number(v))}`);
          });
          return (
            <g key={s.key}>
              {segs.filter((p) => p.length > 1).map((p, i) => <polyline key={i} points={p.join(" ")} fill="none" stroke={s.color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />)}
              {data.map((d, i) => d[s.key] === null || d[s.key] === undefined ? null : (
                <circle key={i} cx={x(i)} cy={y(Number(d[s.key]))} r="4" fill="var(--surface)" stroke={s.color} strokeWidth="2.5"><title>{`${d[xKey]}: ${s.label} ${formatY(Number(d[s.key]))}`}</title></circle>
              ))}
            </g>
          );
        })}
        {data.map((d, i) => (data.length <= 14 || i % 2 === 0) && <text key={i} x={x(i)} y={H - 8} textAnchor="middle" fontSize="11" fill="var(--text-subtle)">{String(d[xKey])}</text>)}
      </svg>
      <Legend series={series} />
      <DataTable data={data} series={series} xKey={xKey} />
    </figure>
  );
}

function Legend({ series }: { series: Series[] }) {
  if (series.length < 2) return null;
  return (
    <figcaption className="mt-2 flex flex-wrap gap-4 text-[12px] text-[var(--text-muted)]">
      {series.map((s) => <span key={s.key} className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} />{s.label}</span>)}
    </figcaption>
  );
}

function DataTable({ data, series, xKey }: { data: Record<string, string | number | null>[]; series: Series[]; xKey: string }) {
  return (
    <table className="sr-only">
      <thead><tr><th>{xKey}</th>{series.map((s) => <th key={s.key}>{s.label}</th>)}</tr></thead>
      <tbody>{data.map((d, i) => <tr key={i}><td>{String(d[xKey])}</td>{series.map((s) => <td key={s.key}>{d[s.key] ?? "—"}</td>)}</tr>)}</tbody>
    </table>
  );
}

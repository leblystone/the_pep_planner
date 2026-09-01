import React from 'react';
import { CalendarRange } from 'lucide-react';
import logo from '../../assets/tpp_logo.png';

function toPct(date, startMs, rangeMs) {
  return Math.max(0, Math.min(100, ((date.getTime() - startMs) / rangeMs) * 100));
}

function buildMonthTicks(windowStart, windowEnd, monthInterval) {
  const ticks = [];
  const cursor = new Date(windowStart);
  cursor.setDate(1);
  cursor.setMonth(cursor.getMonth() + 1);
  const rangeMs = windowEnd.getTime() - windowStart.getTime();
  while (cursor <= windowEnd) {
    ticks.push({
      key: cursor.toISOString(),
      label: cursor.toLocaleDateString('en-US', { month: 'short' }).toUpperCase(),
      pct: toPct(cursor, windowStart.getTime(), rangeMs),
    });
    cursor.setMonth(cursor.getMonth() + monthInterval);
  }
  return ticks;
}

function buildYearTicks(windowStart, windowEnd) {
  const ticks = [];
  const cursor = new Date(windowStart.getFullYear() + 1, 0, 1);
  const rangeMs = windowEnd.getTime() - windowStart.getTime();
  while (cursor <= windowEnd) {
    ticks.push({
      key: cursor.toISOString(),
      label: cursor.getFullYear(),
      pct: toPct(cursor, windowStart.getTime(), rangeMs),
    });
    cursor.setFullYear(cursor.getFullYear() + 1);
  }
  return ticks;
}

export default function SharedHistoryCard({ item, theme }) {
  if (!item) return null;

  const lanes = Array.isArray(item.lanes) ? item.lanes : [];
  const primary    = theme?.primary      || '#7F9E95';
  const textColor  = theme?.text         || '#1E2B2A';
  const textLight  = theme?.textLight    || '#5C6E6C';
  const cardBg     = theme?.cardBackground || '#ffffff';
  const borderColor = theme?.border      || '#DDE6DE';
  const warning = theme?.warning         || '#D4A843';

  const barColor = (status) => {
    if (status === 'completed') return primary;
    if (status === 'ended_early') return textLight;
    if (status === 'rescheduled') return warning;
    if (status === 'ended_reengagement') return primary;
    return textLight;
  };

  const windowStart = item.windowStart ? new Date(item.windowStart) : (() => {
    const d = new Date(); d.setFullYear(d.getFullYear() - 1); return d;
  })();
  const windowEnd = item.windowEnd ? new Date(item.windowEnd) : new Date();
  const rangeMs = windowEnd.getTime() - windowStart.getTime();
  const rangeMonths = Math.round(rangeMs / (1000 * 60 * 60 * 24 * 30));
  const monthInterval = rangeMonths > 20 ? 4 : rangeMonths > 10 ? 2 : 1;

  const monthTicks = buildMonthTicks(windowStart, windowEnd, monthInterval);
  const yearTicks  = buildYearTicks(windowStart, windowEnd);

  const LABEL_W = 76; // px

  const usedStatuses = new Set(
    lanes.flatMap((l) => (l.runs || []).map((r) => r.completionStatus))
  );
  const visibleLanes = lanes.slice(0, 8);

  return (
    <div
      className="rounded-2xl overflow-hidden shadow-2xl"
      style={{
        fontFamily: 'Poppins, sans-serif',
        width: 340,
        backgroundColor: cardBg,
        border: `1px solid ${borderColor}`,
      }}
    >
      {/* ── Branded Header ─────────────────────────────── */}
      <div
        className="px-5 pt-5 pb-4"
        style={{
          background: `linear-gradient(145deg, ${primary}22 0%, ${primary}0a 100%)`,
          borderBottom: `1px solid ${borderColor}`,
        }}
      >
        <div className="flex items-center gap-2 mb-3">
          <img src={logo} alt="TPP" className="h-6 w-6 rounded-full object-cover shadow-sm" />
          <span className="text-[9px] font-bold uppercase tracking-[0.18em]" style={{ color: textLight }}>
            The Pep Planner
          </span>
        </div>
        <h2 className="text-xl font-black leading-tight" style={{ color: textColor }}>
          Protocol History
        </h2>
        <div
          className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold"
          style={{ backgroundColor: `${primary}20`, color: primary }}
        >
          <CalendarRange size={11} />
          {item.rangeLabel || '1Y'} view · {item.totalRuns || 0} runs
        </div>
      </div>

      {/* ── Gantt Chart ────────────────────────────────── */}
      <div className="px-4 pt-3 pb-2">
        {/* Year row */}
        {yearTicks.length > 0 && (
          <div className="flex mb-0.5" style={{ paddingLeft: LABEL_W }}>
            <div className="flex-1 relative h-3.5">
              {yearTicks.map((tick) => (
                <span
                  key={tick.key}
                  className="absolute text-[9px] font-bold transform -translate-x-1/2 select-none"
                  style={{ left: tick.pct + '%', color: textColor, opacity: 0.75, letterSpacing: '0.08em' }}
                >
                  {tick.label}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Month row */}
        <div className="flex mb-2" style={{ paddingLeft: LABEL_W }}>
          <div className="flex-1 relative h-3">
            {monthTicks.map((tick) => (
              <span
                key={tick.key}
                className="absolute text-[7.5px] font-semibold uppercase transform -translate-x-1/2 select-none"
                style={{ left: tick.pct + '%', color: textLight, opacity: 0.7 }}
              >
                {tick.label}
              </span>
            ))}
          </div>
        </div>

        {/* Swimlane rows */}
        <div className="space-y-2">
          {visibleLanes.map((lane) => (
            <div key={lane.name} className="flex items-center">
              {/* Label */}
              <div
                className="flex-shrink-0 text-right pr-2"
                style={{ width: LABEL_W }}
              >
                <span
                  className="text-[10px] font-semibold truncate block"
                  style={{ color: textColor }}
                  title={lane.name}
                >
                  {lane.name}
                </span>
              </div>

              {/* Track */}
              <div
                className="flex-1 relative rounded-md"
                style={{
                  height: 20,
                  backgroundColor: 'rgba(138, 128, 119, 0.14)',
                }}
              >
                {/* Month grid lines */}
                {monthTicks.map((tick) => (
                  <div
                    key={tick.key}
                    className="absolute top-0 bottom-0 w-px"
                    style={{ left: tick.pct + '%', backgroundColor: 'rgba(0,0,0,0.07)' }}
                  />
                ))}
                {/* Year grid lines — bolder */}
                {yearTicks.map((tick) => (
                  <div
                    key={tick.key}
                    className="absolute top-0 bottom-0 w-px"
                    style={{ left: tick.pct + '%', backgroundColor: 'rgba(0,0,0,0.15)' }}
                  />
                ))}

                {/* Bars */}
                {(lane.runs || []).map((run, idx) => {
                  const s = new Date(run.startDate || run.endDate);
                  const e = new Date(run.endDate);
                  const left  = toPct(s, windowStart.getTime(), rangeMs);
                  const right = toPct(e, windowStart.getTime(), rangeMs);
                  const width = Math.max(right - left, 1.5);
                  const color = barColor(run.completionStatus);
                  return (
                    <div
                      key={idx}
                      className="absolute rounded-sm"
                      style={{
                        top: 3, bottom: 3,
                        left: left + '%',
                        width: width + '%',
                        minWidth: 4,
                        backgroundColor: color,
                        boxShadow: `0 1px 3px ${color}55`,
                      }}
                    />
                  );
                })}
              </div>
            </div>
          ))}
          {lanes.length > 8 && (
            <p className="text-[9px] pl-1 pt-0.5" style={{ color: textLight }}>
              +{lanes.length - 8} more protocols
            </p>
          )}
        </div>
      </div>

      {/* ── Legend ─────────────────────────────────────── */}
      <div
        className="px-5 py-3 flex items-center justify-center gap-4"
        style={{ borderTop: `1px solid ${borderColor}` }}
      >
        {[
          { key: 'completed', label: 'Completed', color: barColor('completed') },
          { key: 'ended_early', label: 'Ended early', color: barColor('ended_early') },
          { key: 'rescheduled', label: 'Rescheduled', color: barColor('rescheduled') },
        ]
          .filter((row) => usedStatuses.has(row.key))
          .map((row) => (
            <span key={row.key} className="inline-flex items-center gap-1 text-[9px] font-semibold" style={{ color: row.color }}>
              <span className="w-2 h-2 rounded-sm flex-shrink-0" style={{ backgroundColor: row.color }} />
              {row.label}
            </span>
          ))}
      </div>

      {/* ── Footer ─────────────────────────────────────── */}
      <div className="px-5 pb-3 flex items-center justify-center">
        <p className="text-[8px] opacity-30 font-semibold" style={{ color: textColor }}>
          For Research &amp; Informational Purposes Only
        </p>
      </div>
    </div>
  );
}

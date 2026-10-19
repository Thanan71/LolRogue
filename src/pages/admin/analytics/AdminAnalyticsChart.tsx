import { useId } from 'react';
import { getAdminAnalyticsCopy } from '@/i18n/adminAnalytics';
import { locale } from '@/i18n/fr';
import { analyticsInteger } from './adminAnalyticsDisplay';

export interface AdminAnalyticsChartPoint {
  label: string;
  value: number | null;
}

/** Plot coordinates only; all counts and populations come from the server projection. */
export function AdminAnalyticsChart({
  label,
  points,
}: {
  label: string;
  points: readonly AdminAnalyticsChartPoint[];
}) {
  const copy = getAdminAnalyticsCopy(locale);
  const id = useId();
  const width = 640;
  const height = 180;
  const inset = 8;
  const maximum = Math.max(1, ...points.map((point) => point.value ?? 0));
  const x = (index: number) =>
    points.length === 1
      ? width / 2
      : inset + (index * (width - 2 * inset)) / Math.max(1, points.length - 1);
  const y = (value: number) => height - inset - (value / maximum) * (height - 2 * inset);
  let path = '';
  let connected = false;
  for (const [index, point] of points.entries()) {
    if (point.value === null) {
      connected = false;
      continue;
    }
    path += `${connected ? ' L' : ' M'}${x(index)},${y(point.value)}`;
    connected = true;
  }
  return (
    <figure>
      <figcaption>
        {label} · {copy.chartScale} : 0–{analyticsInteger(maximum)}
      </figcaption>
      <svg
        className="admin-analytics__chart"
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        role="img"
        aria-labelledby={`${id}-title ${id}-description`}
      >
        <title id={`${id}-title`}>
          {label} — {copy.chartLabel}
        </title>
        <desc id={`${id}-description`}>{copy.chartDescription}</desc>
        <path className="admin-analytics__chart-line" d={path} />
        {points.map((point, index) =>
          point.value === null ? null : (
            <circle
              key={`${index}-${point.label}`}
              className="admin-analytics__chart-point"
              cx={x(index)}
              cy={y(point.value)}
              r={2.5}
            >
              <title>
                {point.label} : {analyticsInteger(point.value)}
              </title>
            </circle>
          ),
        )}
      </svg>
      <div className="admin-analytics__chart-labels">
        <span>{points[0]?.label}</span>
        <span>{points.length > 1 ? points[points.length - 1]?.label : ''}</span>
      </div>
    </figure>
  );
}

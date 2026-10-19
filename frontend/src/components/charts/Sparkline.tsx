import { Line, LineChart, ResponsiveContainer } from 'recharts';

export interface SparklinePoint {
  date: string;
  close: number;
}

interface SparklineProps {
  data: SparklinePoint[];
  width?: number;
  height?: number;
}

/** Tiny 30-day price sparkline used in compact tables. */
export function Sparkline({ data, width = 110, height = 32 }: SparklineProps) {
  if (data.length === 0) {
    return <span className="text-xs" style={{ color: 'var(--muted)' }}>—</span>;
  }
  return (
    <ResponsiveContainer width={width} height={height}>
      <LineChart data={data} margin={{ top: 2, right: 2, left: 2, bottom: 2 }}>
        <Line
          type="monotone"
          dataKey="price"
          stroke="var(--chart-1)"
          strokeWidth={1.5}
          dot={false}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

import { Line, LineChart, ResponsiveContainer, Bar, BarChart } from "recharts";

interface MiniSparklineProps {
  data: Array<{ value: number }>;
  type?: "line" | "bar";
  color?: string;
  width?: number;
  height?: number;
}

export const MiniSparkline = ({
  data,
  type = "line",
  color = "hsl(var(--primary))",
  width = 88,
  height = 32,
}: MiniSparklineProps) => {
  if (!data || data.length === 0) return null;
  return (
    <div style={{ width, height }} className="pointer-events-none">
      <ResponsiveContainer width="100%" height="100%">
        {type === "line" ? (
          <LineChart data={data}>
            <Line type="monotone" dataKey="value" stroke={color} strokeWidth={1.5} dot={false} />
          </LineChart>
        ) : (
          <BarChart data={data}>
            <Bar dataKey="value" fill={color} radius={[2, 2, 0, 0]} />
          </BarChart>
        )}
      </ResponsiveContainer>
    </div>
  );
};

export default MiniSparkline;

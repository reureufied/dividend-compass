import { Line, LineChart, ResponsiveContainer, Bar, BarChart, Pie, PieChart, Cell } from "recharts";

interface MiniSparklineProps {
  data: Array<{ value: number; name?: string }>;
  type?: "line" | "bar" | "pie";
  color?: string;
  width?: number;
  height?: number;
}

const PIE_COLORS = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
];

export const MiniSparkline = ({
  data,
  type = "line",
  color = "hsl(var(--primary))",
  width = 88,
  height = 32,
}: MiniSparklineProps) => {
  if (!data || data.length === 0) return null;
  const sized = type === "pie" ? Math.max(width, height) : width;
  return (
    <div style={{ width: type === "pie" ? height : sized, height }} className="pointer-events-none">
      <ResponsiveContainer width="100%" height="100%">
        {type === "line" ? (
          <LineChart data={data}>
            <Line type="monotone" dataKey="value" stroke={color} strokeWidth={1.5} dot={false} />
          </LineChart>
        ) : type === "bar" ? (
          <BarChart data={data}>
            <Bar dataKey="value" fill={color} radius={[2, 2, 0, 0]} />
          </BarChart>
        ) : (
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="name" innerRadius="45%" outerRadius="100%" stroke="none">
              {data.map((_, i) => (
                <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
              ))}
            </Pie>
          </PieChart>
        )}
      </ResponsiveContainer>
    </div>
  );
};

export default MiniSparkline;

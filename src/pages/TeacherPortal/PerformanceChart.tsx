import React from 'react';
import { BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { CHART_COLORS, CustomTooltip } from '../../components/charts/ChartPrimitives';

interface PerformanceChartProps {
  data: { subject: string; average: number }[];
}

export default function PerformanceChart({ data }: PerformanceChartProps) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
      <h3 className="text-sm font-bold text-slate-900 mb-3">Subject Performance</h3>
      {data.length === 0 ? (
        <div className="h-48 flex items-center justify-center text-slate-400 text-xs">
          No grades recorded yet for this class/term.
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="subject" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} width={28} domain={[0, 100]} />
            <Tooltip content={<CustomTooltip />} />
            <Bar dataKey="average" radius={[4, 4, 0, 0]} name="Average %">
              {data.map((_, i) => (
                <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

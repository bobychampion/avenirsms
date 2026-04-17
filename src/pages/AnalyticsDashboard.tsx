import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, getDocs } from 'firebase/firestore';
import {
  BarChart, Bar, PieChart, Pie, Cell, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import { BarChart3, RefreshCw, Download } from 'lucide-react';
import { useSchool } from '../components/SchoolContext';
import { formatCurrency } from '../utils/formatCurrency';

const COLORS = ['#6366f1','#10b981','#f59e0b','#ef4444','#8b5cf6','#06b6d4','#f97316','#84cc16','#ec4899'];
const GRADE_ORDER = ['A1','B2','B3','C4','C5','C6','D7','E8','F9'];

export default function AnalyticsDashboard() {
  const { locale, currency } = useSchool();
  const fmt = (amount: number) => formatCurrency(amount, locale, currency);
  const [enrollment, setEnrollment] = useState<{month:string;count:number}[]>([]);
  const [gradeDist, setGradeDist] = useState<{grade:string;count:number}[]>([]);
  const [finance, setFinance] = useState<{name:string;value:number}[]>([]);
  const [kpi, setKpi] = useState({ students:0, staff:0, revenue:0, attendance:0 });
  const [loading, setLoading] = useState(false);

  const loadData = async () => {
    setLoading(true);
    const [stSnap, grSnap, attSnap, paySnap, expSnap, staffSnap] = await Promise.all([
      getDocs(collection(db,'students')),
      getDocs(collection(db,'grades')),
      getDocs(collection(db,'attendance')),
      getDocs(collection(db,'fee_payments')),
      getDocs(collection(db,'expenses')),
      getDocs(collection(db,'staff')),
    ]).catch(() => Array(6).fill({ docs:[] })) as any[];

    // enrollment trend
    const months: Record<string,number> = {};
    stSnap.docs?.forEach((d:any) => {
      const ts = d.data().enrolledAt?.seconds;
      if (ts) { const k = new Date(ts*1000).toLocaleString('default',{month:'short'}); months[k]=(months[k]||0)+1; }
    });
    setEnrollment(Object.entries(months).map(([month,count])=>({month,count: count as number})).slice(-8));

    // grade distribution
    const gc: Record<string,number> = {};
    grSnap.docs?.forEach((d:any)=>{ const g=d.data().grade; gc[g]=(gc[g]||0)+1; });
    setGradeDist(GRADE_ORDER.filter(g=>gc[g]).map(grade=>({grade,count:gc[grade]})));

    // finance
    const rev = paySnap.docs?.reduce((s:number,d:any)=>s+(d.data().amount||0),0)||0;
    const exp = expSnap.docs?.reduce((s:number,d:any)=>s+(d.data().amount||0),0)||0;
    setFinance([{name:'Revenue',value:rev},{name:'Expenses',value:exp},{name:'Balance',value:rev-exp}]);

    // attendance rate
    const total = attSnap.docs?.length||0;
    const present = attSnap.docs?.filter((d:any)=>d.data().status==='present').length||0;
    setKpi({ students: stSnap.docs?.length||0, staff: staffSnap.docs?.length||0, revenue: rev, attendance: total>0?Math.round((present/total)*100):0 });
    setLoading(false);
  };

  useEffect(()=>{ loadData(); },[]);

  const exportCSV = () => {
    const rows = [['Metric','Value'],['Total Students',kpi.students],['Total Staff',kpi.staff],['Total Revenue',kpi.revenue],['Attendance Rate',`${kpi.attendance}%`]];
    const csv = rows.map(r=>r.join(',')).join('\n');
    const a = document.createElement('a'); a.href='data:text/csv,'+encodeURIComponent(csv); a.download='analytics.csv'; a.click();
  };

  const kpiCards = [
    { label:'Total Students', value: kpi.students, color:'bg-indigo-500' },
    { label:'Total Staff', value: kpi.staff, color:'bg-purple-500' },
    { label:'Total Revenue', value: fmt(kpi.revenue), color:'bg-emerald-500' },
    { label:'Avg Attendance', value: `${kpi.attendance}%`, color:'bg-amber-500' },
  ];

  return (
    <div className="p-6 lg:p-8 max-w-6xl mx-auto">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <BarChart3 className="w-6 h-6 text-indigo-600" />Analytics Dashboard
          </h1>
          <p className="text-slate-500 mt-1 text-sm">School-wide performance insights and reporting.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={loadData} disabled={loading} className="flex items-center gap-2 px-4 py-2.5 bg-slate-100 text-slate-700 font-bold rounded-xl hover:bg-slate-200 transition-all text-sm disabled:opacity-60">
            <RefreshCw className={`w-4 h-4 ${loading?'animate-spin':''}`} /> Refresh
          </button>
          <button onClick={exportCSV} className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition-all text-sm">
            <Download className="w-4 h-4" /> Export CSV
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {kpiCards.map(k=>(
          <div key={k.label} className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
            <div className={`w-8 h-8 ${k.color} rounded-xl mb-3 flex items-center justify-center`}>
              <BarChart3 className="w-4 h-4 text-white" />
            </div>
            <p className="text-xs text-slate-500 font-medium">{k.label}</p>
            <p className="text-2xl font-bold text-slate-900 mt-0.5">{k.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Enrollment Trend */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
          <h3 className="font-bold text-slate-900 mb-4 text-sm">Student Enrollment Trend</h3>
          {enrollment.length === 0 ? <p className="text-center text-slate-400 py-12 text-sm">No data available.</p> : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={enrollment}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="month" tick={{fontSize:11}} />
                <YAxis tick={{fontSize:11}} />
                <Tooltip />
                <Bar dataKey="count" fill="#6366f1" radius={[6,6,0,0]} name="Students" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Grade Distribution */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
          <h3 className="font-bold text-slate-900 mb-4 text-sm">Grade Distribution</h3>
          {gradeDist.length === 0 ? <p className="text-center text-slate-400 py-12 text-sm">No grades data.</p> : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={gradeDist}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="grade" tick={{fontSize:11}} />
                <YAxis tick={{fontSize:11}} />
                <Tooltip />
                <Bar dataKey="count" radius={[6,6,0,0]} name="Students">
                  {gradeDist.map((_, i)=><Cell key={i} fill={COLORS[i%COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Finance Overview */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
        <h3 className="font-bold text-slate-900 mb-5 text-sm">Financial Overview</h3>
        {finance.length === 0 ? <p className="text-center text-slate-400 py-8 text-sm">No finance data.</p> : (
          <div className="flex flex-col lg:flex-row items-center gap-8">
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={finance.filter(f=>f.value>0)} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({name,percent})=>`${name} ${(percent*100).toFixed(0)}%`}>
                  {finance.filter(f=>f.value>0).map((_,i)=><Cell key={i} fill={COLORS[i]} />)}
                </Pie>
                <Tooltip formatter={(v:any)=>fmt(v)} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
            <div className="space-y-3 min-w-[200px]">
              {finance.map((f,i)=>(
                <div key={f.name} className="flex items-center justify-between gap-6">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full" style={{background:COLORS[i]}} />
                    <span className="text-sm text-slate-600">{f.name}</span>
                  </div>
                  <span className="font-bold text-slate-900 text-sm">{fmt(f.value)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

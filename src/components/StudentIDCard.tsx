import React, { useRef, useEffect, useState } from 'react';
import { Student } from '../types';
import { Printer, Download, X, GraduationCap } from 'lucide-react';

interface Props {
  student: Student;
  schoolName?: string;
  schoolAddress?: string;
  session?: string;
  onClose: () => void;
}

function getInitials(name: string) {
  return name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();
}

const GENDER_COLORS: Record<string, string> = {
  male: '#2563eb',
  female: '#db2777',
  other: '#7c3aed',
};

export default function StudentIDCard({ student, schoolName = 'Avenir School', schoolAddress = 'Lagos, Nigeria', session = '2025/2026', onClose }: Props) {
  const printRef = useRef<HTMLDivElement>(null);
  const [printing, setPrinting] = useState(false);

  const accentColor = GENDER_COLORS[student.gender?.toLowerCase()] || '#2563eb';

  const handlePrint = () => {
    setPrinting(true);
    const content = printRef.current;
    if (!content) return;
    const printWindow = window.open('', '_blank', 'width=900,height=650');
    if (!printWindow) { setPrinting(false); return; }
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>ID Card - ${student.studentName}</title>
        <meta charset="UTF-8">
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: 'Segoe UI', Arial, sans-serif; background: #f5f5f5; display: flex; justify-content: center; align-items: center; min-height: 100vh; padding: 20px; }
          .card-wrapper { display: flex; gap: 24px; flex-wrap: wrap; justify-content: center; }
          .id-card {
            width: 340px; height: 210px; background: white; border-radius: 16px;
            overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.15);
            position: relative; display: flex; flex-direction: column;
          }
          .card-header {
            background: ${accentColor}; padding: 12px 16px; display: flex; align-items: center; gap: 10px;
          }
          .card-header .school-icon {
            width: 32px; height: 32px; background: rgba(255,255,255,0.2); border-radius: 8px;
            display: flex; align-items: center; justify-content: center;
            font-size: 18px; color: white; font-weight: bold;
          }
          .card-header .school-info { color: white; }
          .card-header .school-name { font-size: 13px; font-weight: 700; line-height: 1.2; }
          .card-header .school-sub { font-size: 10px; opacity: 0.85; }
          .card-body { flex: 1; display: flex; padding: 12px 16px; gap: 12px; }
          .avatar {
            width: 68px; height: 68px; border-radius: 12px; background: #f0f0f0;
            border: 3px solid ${accentColor}; flex-shrink: 0;
            display: flex; align-items: center; justify-content: center;
            font-size: 22px; font-weight: 800; color: ${accentColor};
          }
          .details { flex: 1; }
          .student-name { font-size: 14px; font-weight: 700; color: #0f172a; margin-bottom: 4px; line-height: 1.2; }
          .detail-row { display: flex; align-items: center; gap: 4px; margin-bottom: 3px; }
          .detail-label { font-size: 9px; color: #94a3b8; font-weight: 600; text-transform: uppercase; min-width: 45px; }
          .detail-value { font-size: 11px; color: #334155; font-weight: 500; }
          .card-footer {
            background: #f8fafc; border-top: 1px solid #e2e8f0; padding: 8px 16px;
            display: flex; align-items: center; justify-content: space-between;
          }
          .student-id { font-family: monospace; font-size: 12px; font-weight: 700; color: ${accentColor}; letter-spacing: 1px; }
          .session-badge {
            background: ${accentColor}15; color: ${accentColor}; font-size: 10px; font-weight: 600;
            padding: 2px 8px; border-radius: 20px; border: 1px solid ${accentColor}30;
          }
          .stripe { position: absolute; top: 0; right: 0; width: 60px; height: 100%; background: ${accentColor}08; }
          @media print {
            body { background: white; padding: 0; }
            .card-wrapper { gap: 0; }
          }
        </style>
      </head>
      <body>
        <div class="card-wrapper">
          ${content.innerHTML}
        </div>
        <script>window.onload = () => { window.print(); window.close(); }<\/script>
      </body>
      </html>
    `);
    printWindow.document.close();
    setPrinting(false);
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-xl p-6"
        onClick={e => e.stopPropagation()}
      >
        {/* Modal header */}
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <GraduationCap className="w-5 h-5 text-indigo-600" />
            Student ID Card
          </h2>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-700">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Preview Card */}
        <div className="flex justify-center mb-6" ref={printRef}>
          <div
            className="id-card relative overflow-hidden rounded-2xl shadow-lg"
            style={{ width: 340, height: 210, background: 'white', fontFamily: 'Segoe UI, Arial, sans-serif' }}
          >
            {/* Decorative stripe */}
            <div className="absolute top-0 right-0 w-14 h-full opacity-5" style={{ background: accentColor }} />

            {/* Header */}
            <div className="flex items-center gap-2.5 px-4 py-3" style={{ background: accentColor }}>
              <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center text-white font-bold text-sm">
                {schoolName[0]}
              </div>
              <div className="text-white">
                <p className="text-sm font-bold leading-tight">{schoolName}</p>
                <p className="text-xs opacity-85">{schoolAddress}</p>
              </div>
            </div>

            {/* Body */}
            <div className="flex gap-3 px-4 py-3 flex-1">
              {/* Avatar */}
              <div
                className="w-16 h-16 rounded-xl flex-shrink-0 flex items-center justify-center text-xl font-black rounded-xl"
                style={{ background: `${accentColor}15`, border: `3px solid ${accentColor}`, color: accentColor }}
              >
                {getInitials(student.studentName)}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-slate-900 leading-tight mb-1.5 truncate">{student.studentName}</p>
                <div className="space-y-0.5">
                  {[
                    ['Class', student.currentClass],
                    ['Gender', student.gender],
                    ['DOB', student.dob ? student.dob.split('-').reverse().join('/') : '—'],
                    ...(student.bloodGroup ? [['Blood', student.bloodGroup]] : []),
                  ].map(([label, value]) => (
                    <div key={label} className="flex items-center gap-1">
                      <span className="text-slate-400 uppercase font-semibold" style={{ fontSize: 9, minWidth: 42 }}>{label}</span>
                      <span className="text-slate-700 font-medium capitalize" style={{ fontSize: 11 }}>{value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between px-4 py-2 border-t border-slate-100" style={{ background: '#f8fafc' }}>
              <span className="font-mono text-xs font-bold tracking-widest" style={{ color: accentColor }}>
                {student.studentId}
              </span>
              <span
                className="text-xs font-semibold px-2 py-0.5 rounded-full"
                style={{ background: `${accentColor}15`, color: accentColor, border: `1px solid ${accentColor}30` }}
              >
                {session}
              </span>
            </div>
          </div>
        </div>

        {/* Student quick info below card */}
        <div className="bg-slate-50 rounded-xl p-3 mb-5 grid grid-cols-2 gap-2 text-sm">
          {student.guardianName && (
            <div><span className="text-slate-400 text-xs">Guardian</span><p className="font-medium text-slate-800">{student.guardianName}</p></div>
          )}
          {student.guardianPhone && (
            <div><span className="text-slate-400 text-xs">Contact</span><p className="font-medium text-slate-800">{student.guardianPhone}</p></div>
          )}
          {student.homeAddress && (
            <div className="col-span-2"><span className="text-slate-400 text-xs">Address</span><p className="font-medium text-slate-800 truncate">{student.homeAddress}</p></div>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={handlePrint}
            disabled={printing}
            className="flex-1 flex items-center justify-center gap-2 bg-indigo-600 text-white font-semibold py-2.5 rounded-xl hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            <Printer className="w-4 h-4" />
            Print ID Card
          </button>
          <button onClick={onClose} className="flex-1 flex items-center justify-center gap-2 bg-slate-100 text-slate-700 font-semibold py-2.5 rounded-xl hover:bg-slate-200 transition-colors">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

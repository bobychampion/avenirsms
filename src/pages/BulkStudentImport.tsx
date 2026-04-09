import React, { useState, useRef } from 'react';
import { db } from '../firebase';
import { collection, addDoc, serverTimestamp, getDocs, query, where } from 'firebase/firestore';
import { Student } from '../types';
import { generateStudentId } from '../services/firestoreService';
import Papa from 'papaparse';
import toast from 'react-hot-toast';
import { motion, AnimatePresence } from 'motion/react';
import {
  Upload, Download, CheckCircle2, XCircle, AlertTriangle,
  Loader2, Users, FileSpreadsheet, ArrowLeft, RefreshCw
} from 'lucide-react';
import { Link } from 'react-router-dom';

interface CSVRow {
  studentName: string;
  email: string;
  phone: string;
  dob: string;
  gender: string;
  currentClass: string;
  guardianName?: string;
  guardianPhone?: string;
  guardianEmail?: string;
  homeAddress?: string;
  stateOfOrigin?: string;
  bloodGroup?: string;
  religion?: string;
}

interface ImportResult {
  row: number;
  name: string;
  status: 'success' | 'error' | 'duplicate';
  message?: string;
  studentId?: string;
}

function validateRow(row: CSVRow, idx: number): string | null {
  if (!row.studentName?.trim()) return `Row ${idx}: Student name is required`;
  if (!row.currentClass?.trim()) return `Row ${idx}: Class is required`;
  if (!row.gender?.trim()) return `Row ${idx}: Gender is required`;
  if (!['male', 'female', 'other'].includes(row.gender.trim().toLowerCase())) {
    return `Row ${idx}: Gender must be male, female, or other`;
  }
  return null;
}

const TEMPLATE_HEADERS = [
  'studentName', 'email', 'phone', 'dob', 'gender', 'currentClass',
  'guardianName', 'guardianPhone', 'guardianEmail', 'homeAddress', 'stateOfOrigin',
  'bloodGroup', 'religion'
];

const TEMPLATE_SAMPLE = [
  'Adaeze Okonkwo', 'adaeze@email.com', '08012345678', '2010-05-15', 'female', 'JSS 1',
  'Mrs Okonkwo', '08012345679', 'parent@email.com', '5 Main Street Lagos', 'Anambra',
  'O+', 'Christianity'
];

export default function BulkStudentImport() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<CSVRow[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [results, setResults] = useState<ImportResult[]>([]);
  const [importing, setImporting] = useState(false);
  const [done, setDone] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = (file: File) => {
    setFile(file);
    setResults([]);
    setDone(false);
    Papa.parse<CSVRow>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (result) => {
        const rows = result.data as CSVRow[];
        const validationErrors: string[] = [];
        rows.forEach((row, i) => {
          const err = validateRow(row, i + 2);
          if (err) validationErrors.push(err);
        });
        setPreview(rows);
        setErrors(validationErrors);
      },
      error: () => toast.error('Failed to parse CSV file'),
    });
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f && (f.name.endsWith('.csv') || f.type === 'text/csv')) handleFile(f);
    else toast.error('Please drop a CSV file');
  };

  const handleImport = async () => {
    if (preview.length === 0 || errors.length > 0) return;
    setImporting(true);
    const importResults: ImportResult[] = [];
    const tid = toast.loading(`Importing ${preview.length} students…`);

    for (let i = 0; i < preview.length; i++) {
      const row = preview[i];
      try {
        // Check duplicate by email
        if (row.email?.trim()) {
          const dup = await getDocs(query(collection(db, 'students'), where('email', '==', row.email.trim())));
          if (!dup.empty) {
            importResults.push({ row: i + 2, name: row.studentName, status: 'duplicate', message: 'Email already exists' });
            continue;
          }
        }

        let newId = await generateStudentId();
        // Ensure uniqueness
        let idCheck = await getDocs(query(collection(db, 'students'), where('studentId', '==', newId)));
        while (!idCheck.empty) {
          newId = await generateStudentId();
          idCheck = await getDocs(query(collection(db, 'students'), where('studentId', '==', newId)));
        }

        const student: Omit<Student, 'id'> = {
          studentName: row.studentName.trim(),
          email: row.email?.trim() || '',
          phone: row.phone?.trim() || '',
          dob: row.dob?.trim() || '',
          gender: row.gender.trim().toLowerCase(),
          nin: '',
          currentClass: row.currentClass.trim(),
          studentId: newId,
          enrolledAt: serverTimestamp(),
          applicationId: 'bulk_import',
          admissionStatus: 'active',
          guardianName: row.guardianName?.trim() || '',
          guardianPhone: row.guardianPhone?.trim() || '',
          guardianEmail: row.guardianEmail?.trim() || '',
          homeAddress: row.homeAddress?.trim() || '',
          stateOfOrigin: row.stateOfOrigin?.trim() || '',
          bloodGroup: row.bloodGroup?.trim() || '',
          religion: row.religion?.trim() || '',
        };

        await addDoc(collection(db, 'students'), student);
        importResults.push({ row: i + 2, name: row.studentName, status: 'success', studentId: newId });
      } catch (e: any) {
        importResults.push({ row: i + 2, name: row.studentName, status: 'error', message: e.message });
      }
    }

    setResults(importResults);
    setDone(true);
    setImporting(false);
    const successCount = importResults.filter(r => r.status === 'success').length;
    const dupCount = importResults.filter(r => r.status === 'duplicate').length;
    const errCount = importResults.filter(r => r.status === 'error').length;
    toast.success(`Import complete: ${successCount} added · ${dupCount} duplicates · ${errCount} errors`, { id: tid, duration: 6000 });
  };

  const downloadTemplate = () => {
    const csv = [TEMPLATE_HEADERS.join(','), TEMPLATE_SAMPLE.join(',')].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'student_import_template.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const reset = () => {
    setFile(null);
    setPreview([]);
    setErrors([]);
    setResults([]);
    setDone(false);
    if (fileRef.current) fileRef.current.value = '';
  };

  const successCount = results.filter(r => r.status === 'success').length;
  const dupCount = results.filter(r => r.status === 'duplicate').length;
  const errCount = results.filter(r => r.status === 'error').length;

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <Link to="/admin/students" className="p-2 rounded-xl hover:bg-slate-100 text-slate-500 hover:text-slate-900 transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <FileSpreadsheet className="w-6 h-6 text-indigo-600" />
            Bulk Student Import
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">Upload a CSV file to enroll multiple students at once</p>
        </div>
      </div>

      {/* Step 1: Download template */}
      <div className="bg-indigo-50 border border-indigo-200 rounded-2xl p-5 mb-6 flex items-start gap-4">
        <div className="bg-indigo-100 p-2.5 rounded-xl flex-shrink-0">
          <Download className="w-5 h-5 text-indigo-700" />
        </div>
        <div className="flex-1">
          <h3 className="font-semibold text-indigo-900 mb-1">Step 1: Download the CSV Template</h3>
          <p className="text-sm text-indigo-700 mb-3">
            Fill in student data using the exact column headers. Required columns: <strong>studentName, gender, currentClass</strong>.
            Class must be one of: Primary 1–6, JSS 1–3, SSS 1–3.
          </p>
          <button
            onClick={downloadTemplate}
            className="inline-flex items-center gap-2 bg-indigo-600 text-white text-sm font-medium px-4 py-2 rounded-xl hover:bg-indigo-700 transition-colors"
          >
            <Download className="w-4 h-4" />
            Download Template (.csv)
          </button>
        </div>
      </div>

      {/* Step 2: Upload */}
      {!done && (
        <div
          className="border-2 border-dashed border-slate-300 rounded-2xl p-10 text-center cursor-pointer hover:border-indigo-400 hover:bg-indigo-50/30 transition-all mb-6"
          onDragOver={e => e.preventDefault()}
          onDrop={handleDrop}
          onClick={() => fileRef.current?.click()}
        >
          <input
            ref={fileRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={e => { if (e.target.files?.[0]) handleFile(e.target.files[0]); }}
          />
          <Upload className="w-10 h-10 text-slate-400 mx-auto mb-3" />
          <p className="text-slate-700 font-semibold mb-1">
            {file ? file.name : 'Drop your CSV here or click to browse'}
          </p>
          <p className="text-slate-400 text-sm">Only .csv files are supported</p>
        </div>
      )}

      {/* Validation Errors */}
      <AnimatePresence>
        {errors.length > 0 && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="bg-rose-50 border border-rose-200 rounded-2xl p-4 mb-6">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="w-4 h-4 text-rose-600" />
              <span className="font-semibold text-rose-800">Validation Errors ({errors.length})</span>
            </div>
            <ul className="space-y-1">
              {errors.map((e, i) => (
                <li key={i} className="text-sm text-rose-700">• {e}</li>
              ))}
            </ul>
            <p className="text-sm text-rose-600 mt-2">Fix these errors in your CSV file and re-upload before importing.</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Preview */}
      {preview.length > 0 && !done && (
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm mb-6 overflow-hidden">
          <div className="flex items-center justify-between p-4 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-slate-500" />
              <span className="font-semibold text-slate-900">{preview.length} students ready to import</span>
            </div>
            {errors.length === 0 && (
              <span className="text-xs bg-emerald-100 text-emerald-700 font-medium px-2.5 py-1 rounded-full">
                All rows valid ✓
              </span>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  {['#', 'Name', 'Class', 'Gender', 'DOB', 'Email', 'Guardian'].map(h => (
                    <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {preview.slice(0, 20).map((row, i) => (
                  <tr key={i} className="hover:bg-slate-50">
                    <td className="px-4 py-2.5 text-slate-400">{i + 1}</td>
                    <td className="px-4 py-2.5 font-medium text-slate-900">{row.studentName}</td>
                    <td className="px-4 py-2.5 text-slate-600">{row.currentClass}</td>
                    <td className="px-4 py-2.5 text-slate-600 capitalize">{row.gender}</td>
                    <td className="px-4 py-2.5 text-slate-600">{row.dob}</td>
                    <td className="px-4 py-2.5 text-slate-500">{row.email}</td>
                    <td className="px-4 py-2.5 text-slate-500">{row.guardianName}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {preview.length > 20 && (
              <p className="px-4 py-3 text-sm text-slate-400 border-t border-slate-100">
                ... and {preview.length - 20} more rows
              </p>
            )}
          </div>
        </div>
      )}

      {/* Import button */}
      {preview.length > 0 && !done && (
        <div className="flex items-center gap-3">
          <button
            onClick={handleImport}
            disabled={importing || errors.length > 0}
            className="flex items-center gap-2 bg-indigo-600 text-white font-semibold px-6 py-2.5 rounded-xl hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            {importing ? 'Importing…' : `Import ${preview.length} Students`}
          </button>
          <button onClick={reset} className="px-4 py-2.5 text-sm text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-colors">
            Cancel
          </button>
        </div>
      )}

      {/* Results */}
      {done && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          {/* Summary */}
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 text-center">
              <CheckCircle2 className="w-6 h-6 text-emerald-600 mx-auto mb-1" />
              <p className="text-2xl font-bold text-emerald-700">{successCount}</p>
              <p className="text-sm text-emerald-600">Imported</p>
            </div>
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-center">
              <AlertTriangle className="w-6 h-6 text-amber-600 mx-auto mb-1" />
              <p className="text-2xl font-bold text-amber-700">{dupCount}</p>
              <p className="text-sm text-amber-600">Duplicates</p>
            </div>
            <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 text-center">
              <XCircle className="w-6 h-6 text-rose-600 mx-auto mb-1" />
              <p className="text-2xl font-bold text-rose-700">{errCount}</p>
              <p className="text-sm text-rose-600">Errors</p>
            </div>
          </div>

          {/* Detail table */}
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden mb-6">
            <div className="p-4 border-b border-slate-100 font-semibold text-slate-900">Import Results</div>
            <div className="overflow-x-auto max-h-72 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 sticky top-0">
                  <tr>
                    {['Row', 'Name', 'Status', 'Student ID / Note'].map(h => (
                      <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {results.map((r, i) => (
                    <tr key={i} className="hover:bg-slate-50">
                      <td className="px-4 py-2.5 text-slate-400">{r.row}</td>
                      <td className="px-4 py-2.5 font-medium text-slate-900">{r.name}</td>
                      <td className="px-4 py-2.5">
                        {r.status === 'success' && <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-medium">Success</span>}
                        {r.status === 'duplicate' && <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">Duplicate</span>}
                        {r.status === 'error' && <span className="text-xs bg-rose-100 text-rose-700 px-2 py-0.5 rounded-full font-medium">Error</span>}
                      </td>
                      <td className="px-4 py-2.5 text-slate-500 font-mono text-xs">{r.studentId || r.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex gap-3">
            <button onClick={reset} className="flex items-center gap-2 bg-indigo-600 text-white font-semibold px-5 py-2.5 rounded-xl hover:bg-indigo-700 transition-colors">
              <RefreshCw className="w-4 h-4" />
              Import Another File
            </button>
            <Link to="/admin/students" className="flex items-center gap-2 px-5 py-2.5 bg-slate-100 text-slate-700 font-semibold rounded-xl hover:bg-slate-200 transition-colors">
              <Users className="w-4 h-4" />
              View Students
            </Link>
          </div>
        </motion.div>
      )}
    </div>
  );
}

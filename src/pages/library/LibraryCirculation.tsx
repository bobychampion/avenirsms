/**
 * Library Circulation — issue books to students/staff and handle returns.
 *
 * Data model (`library_circulation`):
 *   bookId, bookTitle, borrowerId, borrowerName, borrowerType (student|staff),
 *   issuedAt (date string), dueDate, returnedAt?, status (issued|returned),
 *   issuedBy (librarian UID), schoolId
 *
 * On issue: availableCopies in `library_books` is decremented.
 * On return: availableCopies is incremented.
 */
import React, { useEffect, useState } from 'react';
import {
  collection, query, where, onSnapshot, addDoc, updateDoc,
  doc, serverTimestamp, getDocs, runTransaction,
} from 'firebase/firestore';
import { db } from '../../firebase';
import { useSchool } from '../../components/SchoolContext';
import { useAuth } from '../../components/FirebaseProvider';
import { LibraryBook } from './LibraryCatalog';
import { motion, AnimatePresence } from 'motion/react';
import {
  RotateCcw, BookOpen, Plus, X, Loader2, Search,
  AlertCircle, CheckCircle2, Calendar, User,
} from 'lucide-react';
import toast from 'react-hot-toast';

interface CirculationRecord {
  id?: string;
  bookId: string;
  bookTitle: string;
  borrowerId: string;
  borrowerName: string;
  borrowerType: 'student' | 'staff';
  issuedAt: string;
  dueDate: string;
  returnedAt?: string;
  status: 'issued' | 'returned';
  issuedBy: string;
  schoolId: string;
}

type Tab = 'issued' | 'history';

const todayStr = () => new Date().toISOString().split('T')[0];
const defaultDue = () => {
  const d = new Date();
  d.setDate(d.getDate() + 14);
  return d.toISOString().split('T')[0];
};

export default function LibraryCirculation() {
  const { schoolId } = useSchool();
  const { user, profile } = useAuth();

  const [records, setRecords] = useState<CirculationRecord[]>([]);
  const [books, setBooks] = useState<LibraryBook[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('issued');
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [bookSearch, setBookSearch] = useState('');
  const [selectedBook, setSelectedBook] = useState<LibraryBook | null>(null);
  const [returnConfirm, setReturnConfirm] = useState<CirculationRecord | null>(null);

  const [form, setForm] = useState({
    borrowerName: '',
    borrowerId: '',
    borrowerType: 'student' as 'student' | 'staff',
    dueDate: defaultDue(),
  });

  useEffect(() => {
    if (!schoolId) return;
    const qRec = query(collection(db, 'library_circulation'), where('schoolId', '==', schoolId));
    const unsubRec = onSnapshot(qRec, snap => {
      setRecords(snap.docs.map(d => ({ id: d.id, ...d.data() } as CirculationRecord)));
      setLoading(false);
    }, () => setLoading(false));

    const qBooks = query(collection(db, 'library_books'), where('schoolId', '==', schoolId));
    const unsubBooks = onSnapshot(qBooks, snap => {
      setBooks(snap.docs.map(d => ({ id: d.id, ...d.data() } as LibraryBook)));
    });

    return () => { unsubRec(); unsubBooks(); };
  }, [schoolId]);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const isOverdue = (r: CirculationRecord) =>
    r.status === 'issued' && new Date(r.dueDate) < today;

  const issued = records.filter(r =>
    r.status === 'issued' &&
    (r.borrowerName.toLowerCase().includes(search.toLowerCase()) ||
     r.bookTitle.toLowerCase().includes(search.toLowerCase()))
  );

  const history = records.filter(r =>
    r.status === 'returned' &&
    (r.borrowerName.toLowerCase().includes(search.toLowerCase()) ||
     r.bookTitle.toLowerCase().includes(search.toLowerCase()))
  );

  const filteredBooks = books.filter(b =>
    b.availableCopies > 0 &&
    (b.title.toLowerCase().includes(bookSearch.toLowerCase()) ||
     b.author.toLowerCase().includes(bookSearch.toLowerCase()))
  );

  const handleIssue = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBook?.id || !schoolId) {
      toast.error('Please select a book.');
      return;
    }
    if (!form.borrowerName.trim()) {
      toast.error('Please enter the borrower name.');
      return;
    }
    setSaving(true);
    try {
      const bookRef = doc(db, 'library_books', selectedBook.id);
      await runTransaction(db, async tx => {
        const bookSnap = await tx.get(bookRef);
        const bookData = bookSnap.data() as LibraryBook;
        if (!bookData || bookData.availableCopies < 1) {
          throw new Error('No copies available.');
        }
        // Decrement available copies
        tx.update(bookRef, { availableCopies: bookData.availableCopies - 1 });
        // Create circulation record
        const cirRef = doc(collection(db, 'library_circulation'));
        tx.set(cirRef, {
          bookId: selectedBook.id,
          bookTitle: selectedBook.title,
          borrowerId: form.borrowerId || form.borrowerName.toLowerCase().replace(/\s+/g, '_'),
          borrowerName: form.borrowerName,
          borrowerType: form.borrowerType,
          issuedAt: todayStr(),
          dueDate: form.dueDate,
          status: 'issued',
          issuedBy: profile?.displayName || user?.uid || 'librarian',
          schoolId,
        });
      });
      toast.success(`"${selectedBook.title}" issued to ${form.borrowerName}.`);
      setShowForm(false);
      setSelectedBook(null);
      setBookSearch('');
      setForm({ borrowerName: '', borrowerId: '', borrowerType: 'student', dueDate: defaultDue() });
    } catch (err: any) {
      toast.error(err.message || 'Failed to issue book.');
    } finally {
      setSaving(false);
    }
  };

  const handleReturn = async () => {
    if (!returnConfirm?.id) return;
    setSaving(true);
    try {
      const bookRef = doc(db, 'library_books', returnConfirm.bookId);
      const cirRef = doc(db, 'library_circulation', returnConfirm.id);
      await runTransaction(db, async tx => {
        const bookSnap = await tx.get(bookRef);
        const bookData = bookSnap.data() as LibraryBook;
        tx.update(bookRef, { availableCopies: (bookData?.availableCopies ?? 0) + 1 });
        tx.update(cirRef, { status: 'returned', returnedAt: todayStr() });
      });
      toast.success(`"${returnConfirm.bookTitle}" returned successfully.`);
      setReturnConfirm(null);
    } catch {
      toast.error('Failed to process return.');
    } finally {
      setSaving(false);
    }
  };

  const displayList = tab === 'issued' ? issued : history;

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-indigo-600">Library</p>
          <h1 className="mt-1 text-2xl font-extrabold text-slate-900">Issue / Return Books</h1>
          <p className="text-xs text-slate-400 mt-0.5">
            {issued.length} currently issued · {issued.filter(isOverdue).length} overdue
          </p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-bold rounded-xl hover:bg-indigo-700 transition-colors"
        >
          <Plus className="w-4 h-4" /> Issue Book
        </button>
      </div>

      {/* Issue Form Modal */}
      <AnimatePresence>
        {showForm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
            onClick={() => setShowForm(false)}
          >
            <motion.form
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onSubmit={handleIssue}
              className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6 space-y-4"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex justify-between items-center">
                <h3 className="font-bold text-slate-900 text-lg">Issue a Book</h3>
                <button type="button" onClick={() => setShowForm(false)}>
                  <X className="w-5 h-5 text-slate-400 hover:text-slate-600" />
                </button>
              </div>

              {/* Book Search */}
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Select Book *</label>
                {selectedBook ? (
                  <div className="flex items-center gap-3 p-3 rounded-xl bg-indigo-50 border border-indigo-200">
                    <BookOpen className="w-5 h-5 text-indigo-600 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-slate-900 text-sm">{selectedBook.title}</p>
                      <p className="text-xs text-slate-500">{selectedBook.author} · {selectedBook.availableCopies} available</p>
                    </div>
                    <button type="button" onClick={() => setSelectedBook(null)}>
                      <X className="w-4 h-4 text-slate-400" />
                    </button>
                  </div>
                ) : (
                  <div>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <input
                        placeholder="Search available books…"
                        value={bookSearch}
                        onChange={e => setBookSearch(e.target.value)}
                        className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>
                    {bookSearch && (
                      <div className="mt-1 bg-white border border-slate-200 rounded-xl shadow-md max-h-40 overflow-y-auto">
                        {filteredBooks.length === 0 ? (
                          <p className="px-3 py-3 text-sm text-slate-400">No available books match.</p>
                        ) : filteredBooks.slice(0, 6).map(b => (
                          <button
                            key={b.id}
                            type="button"
                            onClick={() => { setSelectedBook(b); setBookSearch(''); }}
                            className="w-full text-left px-3 py-2.5 hover:bg-indigo-50 transition-colors flex items-center justify-between gap-2"
                          >
                            <div>
                              <p className="text-sm font-bold text-slate-900">{b.title}</p>
                              <p className="text-xs text-slate-500">{b.author}</p>
                            </div>
                            <span className="text-xs font-bold text-emerald-600 shrink-0">{b.availableCopies} avail.</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Borrower Name *</label>
                  <input
                    required
                    placeholder="Full name of student or staff"
                    value={form.borrowerName}
                    onChange={e => setForm({ ...form, borrowerName: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Borrower Type</label>
                  <select
                    value={form.borrowerType}
                    onChange={e => setForm({ ...form, borrowerType: e.target.value as 'student' | 'staff' })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="student">Student</option>
                    <option value="staff">Staff</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Due Date *</label>
                  <input
                    required type="date"
                    min={todayStr()}
                    value={form.dueDate}
                    onChange={e => setForm({ ...form, dueDate: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setShowForm(false)}
                  className="px-4 py-2 text-sm font-bold text-slate-600 bg-slate-100 rounded-xl hover:bg-slate-200 transition-colors">
                  Cancel
                </button>
                <button type="submit" disabled={saving || !selectedBook}
                  className="flex items-center gap-2 px-5 py-2 text-sm font-bold text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 transition-colors disabled:opacity-50">
                  {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                  Issue Book
                </button>
              </div>
            </motion.form>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Return Confirm Modal */}
      <AnimatePresence>
        {returnConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
          >
            <motion.div
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              className="bg-white rounded-2xl shadow-xl p-6 max-w-sm w-full text-center"
            >
              <RotateCcw className="w-10 h-10 text-indigo-500 mx-auto mb-4" />
              <h3 className="font-bold text-slate-900 text-lg mb-1">Process Return?</h3>
              <p className="text-sm text-slate-500 mb-1">
                <span className="font-bold">{returnConfirm.bookTitle}</span>
              </p>
              <p className="text-xs text-slate-400 mb-6">
                Borrowed by {returnConfirm.borrowerName} · Due {returnConfirm.dueDate}
              </p>
              <div className="flex gap-3">
                <button onClick={() => setReturnConfirm(null)}
                  className="flex-1 py-2.5 bg-slate-100 text-slate-700 font-bold rounded-xl hover:bg-slate-200 transition-colors text-sm">
                  Cancel
                </button>
                <button onClick={handleReturn} disabled={saving}
                  className="flex-1 py-2.5 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition-colors text-sm flex items-center justify-center gap-2">
                  {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                  Confirm Return
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Tabs + Search */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="flex gap-1 bg-slate-100 rounded-xl p-1">
          {(['issued', 'history'] as Tab[]).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-1.5 rounded-lg text-sm font-bold transition-all capitalize ${
                tab === t ? 'bg-white shadow text-slate-900' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {t === 'issued' ? `Active (${issued.length})` : `History (${history.length})`}
            </button>
          ))}
        </div>
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            placeholder="Search name or title…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
      </div>

      {/* Records */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
        </div>
      ) : displayList.length === 0 ? (
        <div className="text-center py-16 bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200">
          <RotateCcw className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500 font-medium">
            {tab === 'issued' ? 'No books currently issued.' : 'No return history yet.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <AnimatePresence mode="popLayout">
            {displayList.map(rec => {
              const overdue = isOverdue(rec);
              return (
                <motion.div
                  key={rec.id}
                  layout
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.97 }}
                  className={`bg-white rounded-2xl border shadow-sm p-5 flex flex-col sm:flex-row items-start sm:items-center gap-4 ${
                    overdue ? 'border-rose-200' : 'border-slate-200'
                  }`}
                >
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                    overdue ? 'bg-rose-50' : rec.status === 'returned' ? 'bg-emerald-50' : 'bg-indigo-50'
                  }`}>
                    {overdue ? (
                      <AlertCircle className="w-5 h-5 text-rose-600" />
                    ) : rec.status === 'returned' ? (
                      <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                    ) : (
                      <BookOpen className="w-5 h-5 text-indigo-600" />
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-bold text-slate-900">{rec.bookTitle}</p>
                      {overdue && (
                        <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200">
                          Overdue
                        </span>
                      )}
                      {rec.status === 'returned' && (
                        <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                          Returned
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-slate-500 flex-wrap">
                      <span className="flex items-center gap-1"><User className="w-3 h-3" />{rec.borrowerName} ({rec.borrowerType})</span>
                      <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />Issued {rec.issuedAt}</span>
                      <span className={`flex items-center gap-1 ${overdue ? 'font-bold text-rose-600' : ''}`}>
                        Due {rec.dueDate}
                      </span>
                      {rec.returnedAt && (
                        <span className="flex items-center gap-1 text-emerald-600">Returned {rec.returnedAt}</span>
                      )}
                    </div>
                  </div>

                  {rec.status === 'issued' && (
                    <button
                      onClick={() => setReturnConfirm(rec)}
                      className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-indigo-600 bg-indigo-50 border border-indigo-200 rounded-xl hover:bg-indigo-100 transition-colors"
                    >
                      <RotateCcw className="w-3.5 h-3.5" /> Return
                    </button>
                  )}
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}

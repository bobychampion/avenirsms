/**
 * Library Catalog — full CRUD for the book collection.
 *
 * Data model (`library_books`):
 *   title, author, isbn, category, copies (total), availableCopies,
 *   location, publisher, year, schoolId, createdAt
 *
 * Copies available is kept in sync: when a book is issued the circulation
 * module decrements it; on return it is incremented.
 */
import React, { useEffect, useState } from 'react';
import {
  collection, query, where, onSnapshot, addDoc, updateDoc,
  doc, serverTimestamp, deleteDoc,
} from 'firebase/firestore';
import { db } from '../../firebase';
import { useSchool } from '../../components/SchoolContext';
import { useAuth } from '../../components/FirebaseProvider';
import { motion, AnimatePresence } from 'motion/react';
import {
  BookOpen, Plus, Edit2, Trash2, Search, X, Loader2,
  Library, Tag, Hash,
} from 'lucide-react';
import toast from 'react-hot-toast';

export interface LibraryBook {
  id?: string;
  title: string;
  author: string;
  isbn: string;
  category: string;
  copies: number;
  availableCopies: number;
  location: string;
  publisher: string;
  year: string;
  schoolId: string;
  createdAt: any;
  updatedAt?: any;
}

const BOOK_CATEGORIES = [
  'Fiction', 'Non-Fiction', 'Science', 'Mathematics', 'History',
  'Geography', 'Literature', 'Social Studies', 'Religious Studies',
  'ICT', 'Arts', 'Reference', 'Textbook', 'Other',
];

const emptyBook = (): Omit<LibraryBook, 'id' | 'schoolId' | 'createdAt'> => ({
  title: '',
  author: '',
  isbn: '',
  category: 'Textbook',
  copies: 1,
  availableCopies: 1,
  location: '',
  publisher: '',
  year: '',
});

export default function LibraryCatalog() {
  const { schoolId } = useSchool();
  const { user } = useAuth();

  const [books, setBooks] = useState<LibraryBook[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState('all');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<LibraryBook | null>(null);
  const [form, setForm] = useState(emptyBook());
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  useEffect(() => {
    if (!schoolId) return;
    const q = query(collection(db, 'library_books'), where('schoolId', '==', schoolId));
    const unsub = onSnapshot(q, snap => {
      setBooks(snap.docs.map(d => ({ id: d.id, ...d.data() } as LibraryBook)));
      setLoading(false);
    }, () => setLoading(false));
    return unsub;
  }, [schoolId]);

  const uniqueCategories = Array.from(new Set(books.map(b => b.category)));

  const filtered = books.filter(b =>
    (catFilter === 'all' || b.category === catFilter) &&
    (b.title.toLowerCase().includes(search.toLowerCase()) ||
     b.author.toLowerCase().includes(search.toLowerCase()) ||
     b.isbn.toLowerCase().includes(search.toLowerCase()))
  );

  const openCreate = () => {
    setEditing(null);
    setForm(emptyBook());
    setShowForm(true);
  };

  const openEdit = (b: LibraryBook) => {
    setEditing(b);
    setForm({
      title: b.title, author: b.author, isbn: b.isbn, category: b.category,
      copies: b.copies, availableCopies: b.availableCopies,
      location: b.location, publisher: b.publisher, year: b.year,
    });
    setShowForm(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!schoolId) return;
    if (form.availableCopies > form.copies) {
      toast.error('Available copies cannot exceed total copies.');
      return;
    }
    setSaving(true);
    try {
      if (editing?.id) {
        await updateDoc(doc(db, 'library_books', editing.id), {
          ...form,
          updatedAt: serverTimestamp(),
        });
        toast.success('Book updated.');
      } else {
        await addDoc(collection(db, 'library_books'), {
          ...form,
          schoolId,
          createdAt: serverTimestamp(),
        });
        toast.success('Book added to catalog.');
      }
      setShowForm(false);
    } catch {
      toast.error('Failed to save book.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'library_books', id));
      toast.success('Book removed.');
      setDeleteConfirm(null);
    } catch {
      toast.error('Failed to delete.');
    }
  };

  const availabilityColor = (b: LibraryBook) =>
    b.availableCopies === 0
      ? 'text-rose-600 bg-rose-50 border-rose-200'
      : b.availableCopies <= Math.ceil(b.copies * 0.3)
      ? 'text-amber-600 bg-amber-50 border-amber-200'
      : 'text-emerald-600 bg-emerald-50 border-emerald-200';

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-indigo-600">Library</p>
          <h1 className="mt-1 text-2xl font-extrabold text-slate-900">Book Catalog</h1>
          <p className="text-xs text-slate-400 mt-0.5">{books.length} titles · {books.reduce((s, b) => s + b.copies, 0)} total copies</p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-bold rounded-xl hover:bg-indigo-700 transition-colors"
        >
          <Plus className="w-4 h-4" /> Add Book
        </button>
      </div>

      {/* Form Modal */}
      <AnimatePresence>
        {showForm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 overflow-y-auto"
            onClick={() => setShowForm(false)}
          >
            <motion.form
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onSubmit={handleSave}
              className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6 space-y-4 my-8"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex justify-between items-center">
                <h3 className="font-bold text-slate-900 text-lg">
                  {editing ? 'Edit Book' : 'Add Book to Catalog'}
                </h3>
                <button type="button" onClick={() => setShowForm(false)}>
                  <X className="w-5 h-5 text-slate-400 hover:text-slate-600" />
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Title *</label>
                  <input
                    required
                    placeholder="Book title"
                    value={form.title}
                    onChange={e => setForm({ ...form, title: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Author *</label>
                  <input
                    required
                    placeholder="Author name"
                    value={form.author}
                    onChange={e => setForm({ ...form, author: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">ISBN</label>
                  <input
                    placeholder="978-…"
                    value={form.isbn}
                    onChange={e => setForm({ ...form, isbn: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Category</label>
                  <select
                    value={form.category}
                    onChange={e => setForm({ ...form, category: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    {BOOK_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Publisher</label>
                  <input
                    placeholder="Publisher name"
                    value={form.publisher}
                    onChange={e => setForm({ ...form, publisher: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Year Published</label>
                  <input
                    placeholder="e.g. 2023"
                    value={form.year}
                    onChange={e => setForm({ ...form, year: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Total Copies *</label>
                  <input
                    required type="number" min="1"
                    value={form.copies}
                    onChange={e => {
                      const c = parseInt(e.target.value) || 1;
                      setForm({ ...form, copies: c, availableCopies: Math.min(form.availableCopies, c) });
                    }}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Available Now</label>
                  <input
                    required type="number" min="0" max={form.copies}
                    value={form.availableCopies}
                    onChange={e => setForm({ ...form, availableCopies: Math.min(parseInt(e.target.value) || 0, form.copies) })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Shelf Location</label>
                  <input
                    placeholder="e.g. Row A, Shelf 3"
                    value={form.location}
                    onChange={e => setForm({ ...form, location: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setShowForm(false)}
                  className="px-4 py-2 text-sm font-bold text-slate-600 bg-slate-100 rounded-xl hover:bg-slate-200 transition-colors">
                  Cancel
                </button>
                <button type="submit" disabled={saving}
                  className="flex items-center gap-2 px-5 py-2 text-sm font-bold text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 transition-colors disabled:opacity-50">
                  {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                  {editing ? 'Update Book' : 'Add to Catalog'}
                </button>
              </div>
            </motion.form>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 sm:max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            placeholder="Search title, author or ISBN…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <select
          value={catFilter}
          onChange={e => setCatFilter(e.target.value)}
          className="px-3 py-2 rounded-xl border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <option value="all">All categories</option>
          {uniqueCategories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      {/* Book Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200">
          <Library className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500 font-medium">No books found.</p>
          <p className="text-xs text-slate-400 mt-1">Add your first book to start building the catalog.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left">
                <th className="px-5 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Title / Author</th>
                <th className="px-5 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Category</th>
                <th className="px-5 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">ISBN</th>
                <th className="px-5 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Location</th>
                <th className="px-5 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider text-center">Copies</th>
                <th className="px-5 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider text-center">Available</th>
                <th className="px-3 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              <AnimatePresence mode="popLayout">
                {filtered.map(book => (
                  <motion.tr
                    key={book.id}
                    layout
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="hover:bg-slate-50 transition-colors"
                  >
                    <td className="px-5 py-4">
                      <p className="font-bold text-slate-900">{book.title}</p>
                      <p className="text-xs text-slate-500">{book.author}{book.year ? ` · ${book.year}` : ''}</p>
                    </td>
                    <td className="px-5 py-4">
                      <span className="px-2 py-1 rounded-full text-[11px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                        {book.category}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-slate-500 font-mono text-xs">{book.isbn || '—'}</td>
                    <td className="px-5 py-4 text-slate-500 text-xs">{book.location || '—'}</td>
                    <td className="px-5 py-4 text-center font-bold text-slate-700">{book.copies}</td>
                    <td className="px-5 py-4 text-center">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-bold border ${availabilityColor(book)}`}>
                        {book.availableCopies}
                      </span>
                    </td>
                    <td className="px-3 py-4">
                      <div className="flex gap-1">
                        <button
                          onClick={() => openEdit(book)}
                          className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setDeleteConfirm(book.id!)}
                          className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </motion.tr>
                ))}
              </AnimatePresence>
            </tbody>
          </table>
        </div>
      )}

      {/* Delete Confirm */}
      <AnimatePresence>
        {deleteConfirm && (
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
              <Trash2 className="w-10 h-10 text-rose-500 mx-auto mb-4" />
              <h3 className="font-bold text-slate-900 text-lg mb-2">Remove Book?</h3>
              <p className="text-sm text-slate-500 mb-6">This will permanently remove the book from the catalog.</p>
              <div className="flex gap-3">
                <button onClick={() => setDeleteConfirm(null)}
                  className="flex-1 py-2.5 bg-slate-100 text-slate-700 font-bold rounded-xl hover:bg-slate-200 transition-colors text-sm">
                  Cancel
                </button>
                <button onClick={() => handleDelete(deleteConfirm)}
                  className="flex-1 py-2.5 bg-rose-600 text-white font-bold rounded-xl hover:bg-rose-700 transition-colors text-sm">
                  Remove
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

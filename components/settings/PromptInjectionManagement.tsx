'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Trash2, Edit2, Check, X, Sparkles, Save, ToggleLeft, ToggleRight, Info, Loader2 } from 'lucide-react';

interface PromptInjection {
  id: string;
  name: string;
  content: string;
  injectionPoint: string;
  templateType: string | null;
  position: string;
  isEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

const INJECTION_POINTS = [
  { id: 'INIT_PROMPT', name: 'Project Initialization', description: 'When a project is created' },
  { id: 'CHAT_MESSAGE', name: 'Chat Message', description: 'Every user message' },
];

const TEMPLATE_TYPES = [
  { id: '', name: 'Global (All Projects)' },
  { id: 'nextjs', name: 'Next.js' },
  { id: 'static-html', name: 'Static HTML' },
  { id: 'react', name: 'React' },
  { id: 'vue', name: 'Vue' },
  { id: 'flask', name: 'Python Flask' },
  { id: 'custom', name: 'Custom' },
  { id: 'git-import', name: 'Git Import' },
];

const POSITIONS = [
  { id: 'BEFORE', name: 'Before', description: 'Prepend' },
  { id: 'AFTER', name: 'After', description: 'Append' },
  { id: 'REPLACE', name: 'Replace', description: 'Override' },
];

export default function PromptInjectionManagement() {
  const [injections, setInjections] = useState<PromptInjection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  const [showForm, setShowForm] = useState(false);
  const [editingInjection, setEditingInjection] = useState<PromptInjection | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    content: '',
    injectionPoint: 'CHAT_MESSAGE',
    templateType: '' as string | null,
    position: 'BEFORE',
    isEnabled: true
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchInjections = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/prompt-injections');
      if (res.ok) {
        const data = await res.json();
        setInjections(data.data);
      } else {
        setError('Failed to load injections');
      }
    } catch (err) {
      setError('An error occurred');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchInjections();
  }, [fetchInjections]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const url = editingInjection 
        ? `/api/admin/prompt-injections/${editingInjection.id}`
        : '/api/admin/prompt-injections';
      const method = editingInjection ? 'PUT' : 'POST';
      
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      
      if (res.ok) {
        fetchInjections();
        setShowForm(false);
        setEditingInjection(null);
      } else {
        setError('Failed to save');
      }
    } catch (err) {
      setError('An error occurred');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this rule?')) return;
    try {
      const res = await fetch(`/api/admin/prompt-injections/${id}`, { method: 'DELETE' });
      if (res.ok) fetchInjections();
    } catch (err) {
      setError('Failed to delete');
    }
  };

  const handleToggle = async (injection: PromptInjection) => {
    try {
      const res = await fetch(`/api/admin/prompt-injections/${injection.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isEnabled: !injection.isEnabled }),
      });
      if (res.ok) {
        setInjections(prev => prev.map(inv => inv.id === injection.id ? { ...inv, isEnabled: !inv.isEnabled } : inv));
      }
    } catch (err) {}
  };

  if (loading && injections.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-medium text-gray-900">Prompt Injections</h3>
          <p className="text-sm text-gray-600">Templates injected into AI requests</p>
        </div>
        {!showForm && (
          <button
            onClick={() => {
              setEditingInjection(null);
              setFormData({ name: '', content: '', injectionPoint: 'CHAT_MESSAGE', templateType: '', position: 'BEFORE', isEnabled: true });
              setShowForm(true);
            }}
            className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors text-sm font-medium"
          >
            <Plus size={16} />
            Add Rule
          </button>
        )}
      </div>

      {error && (
        <div className="p-3 bg-red-100 text-red-700 rounded-lg text-sm flex items-center gap-2">
          <Info size={16} />
          {error}
        </div>
      )}

      {showForm && (
        <form onSubmit={handleSave} className="p-4 bg-gray-50 rounded-xl border border-gray-200 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-600 uppercase">Rule Name</label>
              <input
                type="text"
                required
                value={formData.name}
                onChange={e => setFormData({...formData, name: e.target.value})}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-200"
                placeholder="e.g. System Prompt"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-600 uppercase">Injection Point</label>
              <select
                value={formData.injectionPoint}
                onChange={e => setFormData({...formData, injectionPoint: e.target.value})}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-200 bg-white"
              >
                {INJECTION_POINTS.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-600 uppercase">Project Type</label>
              <select
                value={formData.templateType || ''}
                onChange={e => setFormData({...formData, templateType: e.target.value || null})}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-200 bg-white"
              >
                {TEMPLATE_TYPES.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-600 uppercase">Position</label>
            <div className="flex gap-2">
              {POSITIONS.map(p => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setFormData({...formData, position: p.id})}
                  className={`flex-1 py-2 px-3 rounded-lg text-xs font-medium transition-all border ${
                    formData.position === p.id 
                    ? 'bg-blue-600 text-white border-blue-600' 
                    : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  {p.name}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-600 uppercase">Content / Template</label>
            <textarea
              required
              value={formData.content}
              onChange={e => setFormData({...formData, content: e.target.value})}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-200 bg-white h-32 font-mono"
              placeholder="Text to inject..."
            />
          </div>

          <div className="flex items-center justify-between pt-2">
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="text-sm text-gray-500 hover:text-gray-700 font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-6 py-2 bg-[#DE7356] text-white rounded-lg hover:bg-[#c6654a] transition-colors text-sm font-medium flex items-center gap-2"
            >
              {isSubmitting ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
              {editingInjection ? 'Update Rule' : 'Save Rule'}
            </button>
          </div>
        </form>
      )}

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-50 text-gray-600 font-medium">
            <tr>
              <th className="px-6 py-4">Rule</th>
              <th className="px-6 py-4">Point</th>
              <th className="px-6 py-4">Status</th>
              <th className="px-6 py-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {injections.map((injection) => (
              <tr key={injection.id} className={`hover:bg-gray-50 transition-colors ${!injection.isEnabled ? 'opacity-60' : ''}`}>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center">
                      <Sparkles size={16} />
                    </div>
                    <div>
                      <span className="font-medium text-gray-900 line-clamp-1">{injection.name}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-gray-400 uppercase font-bold tracking-wider">{injection.position}</span>
                        {injection.templateType && (
                          <span className="text-[10px] bg-blue-50 text-blue-600 px-1 rounded font-bold uppercase">{injection.templateType}</span>
                        )}
                      </div>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-full whitespace-nowrap">
                    {INJECTION_POINTS.find(p => p.id === injection.injectionPoint)?.name}
                  </span>
                </td>
                <td className="px-6 py-4">
                  <button onClick={() => handleToggle(injection)} className="transition-transform active:scale-95">
                    {injection.isEnabled ? <ToggleRight className="text-green-500" size={24} /> : <ToggleLeft className="text-gray-300" size={24} />}
                  </button>
                </td>
                <td className="px-6 py-4 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <button
                      onClick={() => {
                        setEditingInjection(injection);
                        setFormData({
                          name: injection.name,
                          content: injection.content,
                          injectionPoint: injection.injectionPoint,
                          templateType: injection.templateType || '',
                          position: injection.position,
                          isEnabled: injection.isEnabled
                        });
                        setShowForm(true);
                      }}
                      className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                    >
                      <Edit2 size={16} />
                    </button>
                    <button
                      onClick={() => handleDelete(injection.id)}
                      className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {injections.length === 0 && !loading && (
              <tr>
                <td colSpan={4} className="px-6 py-12 text-center text-gray-400 italic">
                  No injection rules found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

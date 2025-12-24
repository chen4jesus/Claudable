'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Server, Folder, RefreshCw, Trash2, Loader2, X, AlertCircle } from 'lucide-react';

interface Project {
  id: string;
  name: string;
  status: string;
  createdAt: string;
  previewUrl?: string | null;
}

interface ResourceManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function ResourceManagementModal({ isOpen, onClose }: ResourceManagementModalProps) {
  const [activeTab, setActiveTab] = useState<'projects' | 'recycle'>('projects');
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [recycling, setRecycling] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const fetchProjects = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/projects');
      const data = await res.json();
      if (data.success) {
        setProjects(data.data);
      }
    } catch (err) {
      console.error('Failed to fetch projects:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      fetchProjects();
    }
  }, [isOpen, fetchProjects]);

  const handleDeleteProject = async (projectId: string, projectName: string) => {
    if (!confirm(`Are you sure you want to delete "${projectName}"? This action cannot be undone.`)) return;
    
    setDeletingId(projectId);
    try {
      const res = await fetch(`/api/projects/${projectId}`, { method: 'DELETE' });
      if (res.ok) {
        showToast('Project deleted successfully', 'success');
        fetchProjects();
      } else {
        const data = await res.json();
        showToast(data.error || 'Failed to delete project', 'error');
      }
    } catch (err) {
      showToast('Failed to delete project', 'error');
    } finally {
      setDeletingId(null);
    }
  };

  const handleRecycle = async () => {
    if (!confirm('This will stop ALL running preview processes. Continue?')) return;
    
    setRecycling(true);
    try {
      const res = await fetch('/api/admin/recycle', { method: 'POST' });
      const data = await res.json();
      
      if (data.success) {
        showToast('All preview processes have been stopped successfully', 'success');
        fetchProjects(); // Refresh project statuses
      } else {
        showToast(`Failed to recycle: ${data.error}`, 'error');
      }
    } catch (err) {
      showToast('Failed to stop preview processes', 'error');
    } finally {
      setRecycling(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div 
          className="absolute inset-0 bg-black/60 backdrop-blur-md"
          onClick={onClose}
        />
        
        <motion.div 
          className="relative bg-white rounded-2xl shadow-2xl w-full max-w-4xl h-[600px] border border-gray-200 flex flex-col"
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          transition={{ duration: 0.2 }}
        >
          {/* Header */}
          <div className="p-5 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-gray-600">
                  <Server size={20} />
                </span>
                <div>
                  <h2 className="text-xl font-semibold text-gray-900">Resource Management</h2>
                  <p className="text-sm text-gray-600">Manage projects and server resources</p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="text-gray-600 hover:text-gray-900 transition-colors p-1 hover:bg-gray-100 rounded-lg"
              >
                <X size={20} />
              </button>
            </div>
          </div>

          {/* Tab Navigation */}
          <div className="border-b border-gray-200">
            <nav className="flex px-5">
              {[
                { id: 'projects' as const, label: 'Projects', icon: Folder },
                { id: 'recycle' as const, label: 'Recycle Server', icon: RefreshCw },
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-all ${
                    activeTab === tab.id
                      ? 'border-[#DE7356] text-gray-900'
                      : 'border-transparent text-gray-600 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  <tab.icon size={16} />
                  {tab.label}
                </button>
              ))}
            </nav>
          </div>

          {/* Tab Content */}
          <div className="flex-1 p-6 overflow-y-auto">
            {activeTab === 'projects' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-medium text-gray-900">All Projects</h3>
                    <p className="text-sm text-gray-600">Manage project resources</p>
                  </div>
                  <button
                    onClick={fetchProjects}
                    className="px-3 py-1.5 text-xs font-medium border border-gray-200 rounded-lg bg-white hover:bg-gray-50 text-gray-700 transition-colors flex items-center gap-2"
                  >
                    <RefreshCw size={14} />
                    Refresh
                  </button>
                </div>

                {loading ? (
                  <div className="flex items-center justify-center h-48">
                    <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
                  </div>
                ) : projects.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-48 text-gray-400">
                    <Folder size={40} className="mb-4 opacity-20" />
                    <p>No projects found</p>
                  </div>
                ) : (
                  <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-gray-50 text-gray-600 font-medium">
                        <tr>
                          <th className="px-4 py-3">Project</th>
                          <th className="px-4 py-3">Status</th>
                          <th className="px-4 py-3">Created</th>
                          <th className="px-4 py-3 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {projects.map((project) => (
                          <tr key={project.id} className="hover:bg-gray-50 transition-colors">
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600">
                                  <Folder size={16} />
                                </div>
                                <span className="font-medium text-gray-900 truncate max-w-[200px]">{project.name}</span>
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                                project.status === 'running' 
                                  ? 'bg-green-100 text-green-700' 
                                  : project.status === 'error'
                                  ? 'bg-red-100 text-red-700'
                                  : 'bg-gray-100 text-gray-700'
                              }`}>
                                {project.status || 'idle'}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-gray-600">
                              {formatDate(project.createdAt)}
                            </td>
                            <td className="px-4 py-3 text-right">
                              <button
                                onClick={() => handleDeleteProject(project.id, project.name)}
                                disabled={deletingId === project.id}
                                className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all disabled:opacity-50"
                                title="Delete project"
                              >
                                {deletingId === project.id ? (
                                  <Loader2 size={16} className="animate-spin" />
                                ) : (
                                  <Trash2 size={16} />
                                )}
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'recycle' && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-medium text-gray-900 mb-2">Recycle Server Resources</h3>
                  <p className="text-sm text-gray-600">
                    Stop all running preview processes to free up server resources. This is useful when the server is under heavy load or encountering issues.
                  </p>
                </div>

                <div className="bg-orange-50 border border-orange-200 rounded-xl p-4">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="text-orange-600 flex-shrink-0 mt-0.5" size={20} />
                    <div>
                      <h4 className="font-medium text-orange-800">Warning</h4>
                      <p className="text-sm text-orange-700 mt-1">
                        This action will stop ALL running preview processes across all projects. Users with active previews will need to restart them.
                      </p>
                    </div>
                  </div>
                </div>

                <button
                  onClick={handleRecycle}
                  disabled={recycling}
                  className="px-6 py-3 bg-orange-600 text-white rounded-xl font-medium hover:bg-orange-700 transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {recycling ? (
                    <>
                      <Loader2 size={18} className="animate-spin" />
                      Stopping Processes...
                    </>
                  ) : (
                    <>
                      <RefreshCw size={18} />
                      Recycle All Preview Processes
                    </>
                  )}
                </button>
              </div>
            )}
          </div>

          {/* Toast */}
          <AnimatePresence>
            {toast && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 20 }}
                className={`absolute bottom-4 left-1/2 -translate-x-1/2 px-4 py-2 rounded-lg text-sm font-medium shadow-lg ${
                  toast.type === 'success' 
                    ? 'bg-green-600 text-white' 
                    : 'bg-red-600 text-white'
                }`}
              >
                {toast.message}
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}

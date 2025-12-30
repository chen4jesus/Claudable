'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Server, Folder, RefreshCw, Trash2, Loader2, X, AlertCircle, ExternalLink, ChevronDown, ChevronUp, Shield, Globe } from 'lucide-react';

interface Project {
  id: string;
  name: string;
  description?: string | null;
  status: string;
  createdAt: string;
  previewUrl?: string | null;
  templateType?: string | null;
  groupId?: string | null;
  groupName?: string | null;
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
  const [expandedId, setExpandedId] = useState<string | null>(null);
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
      setExpandedId(null);
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
        fetchProjects();
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

  const openPreview = (url: string) => {
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const toggleExpand = (id: string) => {
    setExpandedId(expandedId === id ? null : id);
  };

  const getTemplateLabel = (type?: string | null) => {
    const templates: Record<string, string> = {
      'nextjs': 'Next.js',
      'react': 'React',
      'vue': 'Vue',
      'flask': 'Flask',
      'fastapp': 'FastAPI',
      'static-html': 'Static HTML',
      'git-import': 'Git Import',
      'custom': 'Custom'
    };
    return type ? templates[type] || type : 'Unknown';
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
          className="relative bg-white rounded-2xl shadow-2xl w-full max-w-5xl h-[650px] border border-gray-200 flex flex-col"
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
                    <p className="text-sm text-gray-600">{projects.length} project{projects.length !== 1 ? 's' : ''}</p>
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
                  <div className="space-y-2">
                    {projects.map((project) => (
                      <div 
                        key={project.id}
                        className="bg-white border border-gray-200 rounded-xl overflow-hidden hover:shadow-md transition-shadow"
                      >
                        {/* Main Row */}
                        <div className="flex items-center gap-4 p-4">
                          {/* Project Icon & Name */}
                          <div className="flex items-center gap-3 min-w-[200px] flex-1">
                            <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600 flex-shrink-0">
                              <Folder size={18} />
                            </div>
                            <div className="min-w-0">
                              <span className="font-medium text-gray-900 block truncate">{project.name}</span>
                              {project.description && (
                                <button
                                  onClick={() => toggleExpand(project.id)}
                                  className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1 mt-0.5"
                                >
                                  {expandedId === project.id ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                                  {expandedId === project.id ? 'Hide description' : 'Show description'}
                                </button>
                              )}
                            </div>
                          </div>

                          {/* Template Type */}
                          <div className="w-24 flex-shrink-0">
                            <span className="text-[10px] text-gray-400 uppercase tracking-wider block">Template</span>
                            <span className="text-xs text-gray-700">{getTemplateLabel(project.templateType)}</span>
                          </div>

                          {/* Status */}
                          <div className="w-20 flex-shrink-0">
                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                              project.status === 'running' 
                                ? 'bg-green-100 text-green-700' 
                                : project.status === 'error'
                                ? 'bg-red-100 text-red-700'
                                : 'bg-gray-100 text-gray-700'
                            }`}>
                              {project.status || 'idle'}
                            </span>
                          </div>

                          {/* Group */}
                          <div className="w-28 flex-shrink-0">
                            {project.groupId ? (
                              <span className="inline-flex items-center gap-1 text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded border border-gray-200">
                                <Shield size={10} />
                                {project.groupName || 'Private'}
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-xs bg-green-50 text-green-600 px-2 py-1 rounded border border-green-100">
                                <Globe size={10} />
                                Public
                              </span>
                            )}
                          </div>

                          {/* Preview URL */}
                          <div className="w-24 flex-shrink-0">
                            {project.previewUrl ? (
                              <button
                                onClick={() => openPreview(project.previewUrl!)}
                                className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded transition-colors"
                                title={project.previewUrl}
                              >
                                <ExternalLink size={12} />
                                Preview
                              </button>
                            ) : (
                              <span className="text-xs text-gray-400">No preview</span>
                            )}
                          </div>

                          {/* Created Date */}
                          <div className="w-24 text-xs text-gray-600 flex-shrink-0">
                            {formatDate(project.createdAt)}
                          </div>

                          {/* Actions */}
                          <div className="flex-shrink-0">
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
                          </div>
                        </div>

                        {/* Expanded Description */}
                        <AnimatePresence>
                          {expandedId === project.id && project.description && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: 'auto', opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={{ duration: 0.2 }}
                              className="overflow-hidden"
                            >
                              <div className="px-4 pb-4 pt-0">
                                <div className="bg-gray-50 rounded-lg p-3 text-sm text-gray-700 border border-gray-100">
                                  <span className="text-[10px] text-gray-400 uppercase tracking-wider block mb-1">Description</span>
                                  {project.description}
                                </div>
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    ))}
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

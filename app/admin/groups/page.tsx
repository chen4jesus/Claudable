'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Users, Plus, Trash2, Edit2, UserPlus, Check, X, Shield, ArrowLeft, Loader2, Folder, Globe, RefreshCw } from 'lucide-react';
import { useRouter } from 'next/navigation';

interface Group {
  id: string;
  name: string;
  description: string | null;
  _count: {
    users: number;
    projects: number;
  };
}

interface User {
  id: string;
  username: string;
  role: string;
  groups?: { id: string; name: string }[];
}

interface Project {
  id: string;
  name: string;
  groupId: string | null;
  groupName?: string | null;
}

export default function AdminGroupsPage() {
  const router = useRouter();
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  // Modals
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showMembersModal, setShowMembersModal] = useState<Group | null>(null);
  const [showProjectsModal, setShowProjectsModal] = useState<Group | null>(null);
  
  // Create/Edit Form
  const [editingGroup, setEditingGroup] = useState<Group | null>(null);
  const [formData, setFormData] = useState({ name: '', description: '' });
  
  // Members Management
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [groupMembers, setGroupMembers] = useState<string[]>([]); // User IDs
  const [loadingMembers, setLoadingMembers] = useState(false);

  // Projects Management
  const [allProjects, setAllProjects] = useState<Project[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(false);

  const fetchGroups = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/groups');
      if (res.status === 401) {
        // Not authorized, redirect or show error
        router.push('/');
        return;
      }
      const data = await res.json();
      if (data.success) {
        setGroups(data.data);
      } else {
        setError(data.error);
      }
    } catch (err) {
      setError('Failed to load groups');
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    fetchGroups();
  }, [fetchGroups]);

  async function fetchUsersAndMembers(groupId: string) {
    setLoadingMembers(true);
    try {
      // Fetch all users
      const usersRes = await fetch('/api/admin/users');
      const usersData = await usersRes.json();
      
      // Fetch group details (including current members) - or we can infer if we had full list.
      // But /api/admin/users returns all users with their groups? Let's check implementation.
      // Yes, lib/services/users.ts: getAllUsers includes groups.
      
      if (usersData.success) {
        setAllUsers(usersData.data);
        // Determine members of current group
        const members = usersData.data
          .filter((u: User) => u.groups?.some((g) => g.id === groupId))
          .map((u: User) => u.id);
        setGroupMembers(members);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingMembers(false);
    }
  }

  const handleCreateOrUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const url = editingGroup 
        ? `/api/admin/groups/${editingGroup.id}`
        : '/api/admin/groups';
      const method = editingGroup ? 'PUT' : 'POST';
      
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      
      if (res.ok) {
        fetchGroups();
        setShowCreateModal(false);
        setEditingGroup(null);
        setFormData({ name: '', description: '' });
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this group?')) return;
    try {
      const res = await fetch(`/api/admin/groups/${id}`, { method: 'DELETE' });
      if (res.ok) {
        fetchGroups();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleToggleMember = async (userId: string, isMember: boolean) => {
    if (!showMembersModal) return;
    try {
      // Optimistic update
      if (isMember) {
        setGroupMembers(prev => prev.filter(id => id !== userId));
      } else {
        setGroupMembers(prev => [...prev, userId]);
      }

      await fetch(`/api/admin/groups/${showMembersModal.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: isMember ? 'remove_user' : 'add_user',
          userId
        })
      });
      // In a real app we might want to revert on failure
    } catch (err) {
      console.error(err);
      fetchUsersAndMembers(showMembersModal.id); // Revert/Reload
    }
  };

  const startEdit = (group: Group) => {
    setEditingGroup(group);
    setFormData({ name: group.name, description: group.description || '' });
    setShowCreateModal(true);
  };

  const openMembersModal = (group: Group) => {
    setShowMembersModal(group);
    fetchUsersAndMembers(group.id);
  };

  async function fetchProjects() {
    setLoadingProjects(true);
    try {
      const res = await fetch('/api/projects');
      const data = await res.json();
      if (data.success) {
        setAllProjects(data.data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingProjects(false);
    }
  }

  const openProjectsModal = (group: Group) => {
    setShowProjectsModal(group);
    fetchProjects();
  };

  const handleToggleProject = async (projectId: string, isCurrentlyInGroup: boolean) => {
    if (!showProjectsModal) return;
    try {
      // Optimistic update
      setAllProjects(prev => prev.map(p => {
        if (p.id === projectId) {
          return {
            ...p,
            groupId: isCurrentlyInGroup ? null : showProjectsModal.id,
            groupName: isCurrentlyInGroup ? 'Public' : showProjectsModal.name
          };
        }
        return p;
      }));

      await fetch(`/api/admin/groups/${showProjectsModal.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: isCurrentlyInGroup ? 'remove_project' : 'add_project',
          projectId
        })
      });
      
      // Update the group's project count in the main list
      fetchGroups();
    } catch (err) {
      console.error(err);
      fetchProjects(); // Revert/Reload
    }
  };

  if (loading) {
     return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
           <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
        </div>
     );
  }

  if (error) {
     return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 gap-4">
           <p className="text-red-500">{error}</p>
           <button onClick={() => router.push('/')} className="text-blue-500 hover:underline">Go Home</button>
        </div>
     );
  }

  return (
    <div className="min-h-screen bg-gray-50/50 p-6 md:p-12">
      <div className="max-w-6xl mx-auto space-y-8">
        
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
                 <button 
                  onClick={() => router.push('/')}
                  className="p-2 bg-white rounded-full shadow-sm border border-gray-200 hover:scale-105 transition-transform text-gray-500"
                 >
                    <ArrowLeft size={20} />
                 </button>
                 <div>
                    <h1 className="text-3xl font-bold text-gray-900 tracking-tight">User Groups</h1>
                    <p className="text-gray-500">Manage visibility and access control</p>
                 </div>
            </div>
            
            <div className="flex items-center gap-3">
              <button
                onClick={() => {
                  setEditingGroup(null);
                  setFormData({ name: '', description: '' });
                  setShowCreateModal(true);
                }}
                className="px-5 py-2.5 bg-gray-900 text-white rounded-xl font-medium shadow-lg shadow-gray-200 hover:shadow-xl hover:scale-[1.02] active:scale-95 transition-all flex items-center gap-2"
              >
                <Plus size={18} />
                Create Group
              </button>
            </div>
        </div>

        {/* Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {groups.map((group) => (
              <motion.div
                key={group.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white rounded-2xl p-6 shadow-[0_2px_8px_rgba(0,0,0,0.04)] border border-gray-100/50 hover:shadow-lg transition-shadow relative group"
              >
                  <div className="flex justify-between items-start mb-4">
                      <div className="p-3 bg-blue-50 text-blue-600 rounded-xl">
                          <Shield size={24} />
                      </div>
                      <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button 
                            onClick={() => startEdit(group)}
                            className="p-2 text-gray-400 hover:text-blue-500 hover:bg-blue-50 rounded-lg transition-colors"
                          >
                              <Edit2 size={16} />
                          </button>
                          <button 
                             onClick={() => handleDelete(group.id)}
                             className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                          >
                              <Trash2 size={16} />
                          </button>
                      </div>
                  </div>
                  
                  <h3 className="text-xl font-semibold text-gray-900 mb-1">{group.name}</h3>
                  <p className="text-sm text-gray-500 mb-6 h-10 line-clamp-2">{group.description || 'No description'}</p>
                  
                  <div className="flex items-center justify-between pt-4 border-t border-gray-50">
                      <div className="flex gap-4">
                          <div className="flex flex-col">
                              <span className="text-xs text-gray-400 font-medium uppercase tracking-wider">Users</span>
                              <span className="text-lg font-semibold text-gray-700">{group._count.users}</span>
                          </div>
                          <div className="flex flex-col">
                              <span className="text-xs text-gray-400 font-medium uppercase tracking-wider">Projects</span>
                              <span className="text-lg font-semibold text-gray-700">{group._count.projects}</span>
                          </div>
                      </div>
                      
                      <div className="flex gap-2">
                        <button 
                          onClick={() => openMembersModal(group)}
                          className="px-3 py-1.5 bg-gray-50 text-gray-600 hover:bg-gray-100 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
                        >
                            <UserPlus size={16} />
                            Members
                        </button>
                        <button 
                          onClick={() => openProjectsModal(group)}
                          className="px-3 py-1.5 bg-gray-50 text-gray-600 hover:bg-gray-100 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
                        >
                            <Folder size={16} />
                            Projects
                        </button>
                      </div>
                  </div>
              </motion.div>
            ))}
            
            {groups.length === 0 && (
                <div className="col-span-full py-12 flex flex-col items-center justify-center text-gray-400">
                    <Shield size={48} className="mb-4 opacity-20" />
                    <p>No groups found. Create one to get started.</p>
                </div>
            )}
        </div>
      </div>

      {/* Create/Edit Modal */}
      <AnimatePresence>
        {showCreateModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/20 backdrop-blur-sm"
              onClick={() => setShowCreateModal(false)}
            />
            <motion.div 
               initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
               className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 relative z-10"
            >
               <h2 className="text-2xl font-bold text-gray-900 mb-6">
                 {editingGroup ? 'Edit Group' : 'New Group'}
               </h2>
               <form onSubmit={handleCreateOrUpdate} className="space-y-4">
                  <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Group Name</label>
                      <input 
                        type="text" 
                        value={formData.name}
                        onChange={e => setFormData({...formData, name: e.target.value})}
                        className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                        placeholder="e.g. Engineering"
                        required
                      />
                  </div>
                  <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                      <textarea 
                        value={formData.description}
                        onChange={e => setFormData({...formData, description: e.target.value})}
                        className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all resize-none h-24"
                        placeholder="Optional description..."
                      />
                  </div>
                  <div className="flex gap-3 pt-4">
                      <button 
                        type="button" 
                        onClick={() => setShowCreateModal(false)}
                        className="flex-1 py-2.5 text-gray-700 font-medium hover:bg-gray-50 rounded-xl transition-colors"
                      >
                          Cancel
                      </button>
                      <button 
                        type="submit"
                        className="flex-1 py-2.5 bg-gray-900 text-white font-medium rounded-xl shadow-lg shadow-gray-200 hover:shadow-xl hover:scale-[1.02] active:scale-95 transition-all"
                      >
                          {editingGroup ? 'Save Changes' : 'Create Group'}
                      </button>
                  </div>
               </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Members Modal */}
      <AnimatePresence>
        {showMembersModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/20 backdrop-blur-sm"
              onClick={() => setShowMembersModal(null)}
            />
            <motion.div 
               initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
               className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6 relative z-10 flex flex-col max-h-[80vh]"
            >
               <div className="flex justify-between items-center mb-6">
                 <div>
                    <h2 className="text-xl font-bold text-gray-900">Manage Members</h2>
                    <p className="text-sm text-gray-500">{showMembersModal.name}</p>
                 </div>
                 <button onClick={() => setShowMembersModal(null)} className="p-2 text-gray-400 hover:text-gray-600 rounded-lg"><X size={20} /></button>
               </div>
               
               <div className="flex-1 overflow-y-auto min-h-[300px]">
                  {loadingMembers ? (
                    <div className="flex justify-center py-10"><Loader2 className="animate-spin text-gray-300" /></div>
                  ) : (
                    <div className="space-y-1">
                        {allUsers.map(user => {
                            const isMember = groupMembers.includes(user.id);
                            return (
                                <div key={user.id} className="flex items-center justify-between p-3 hover:bg-gray-50 rounded-xl transition-colors">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center text-gray-500 font-medium">
                                            {user.username.charAt(0).toUpperCase()}
                                        </div>
                                        <div>
                                            <p className="font-medium text-gray-900">{user.username}</p>
                                            <p className="text-xs text-gray-500 capitalize">{user.role}</p>
                                        </div>
                                    </div>
                                    <button
                                      onClick={() => handleToggleMember(user.id, isMember)}
                                      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                                          isMember 
                                          ? 'bg-green-50 text-green-600 hover:bg-red-50 hover:text-red-600'
                                          : 'bg-white border border-gray-200 text-gray-600 hover:border-blue-500 hover:text-blue-500'
                                      }`}
                                    >
                                        {isMember ? 'Joined' : 'Add'}
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                  )}
               </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Projects Modal */}
      <AnimatePresence>
        {showProjectsModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/20 backdrop-blur-sm"
              onClick={() => setShowProjectsModal(null)}
            />
            <motion.div 
               initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
               className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6 relative z-10 flex flex-col max-h-[80vh]"
            >
               <div className="flex justify-between items-center mb-6">
                 <div>
                    <h2 className="text-xl font-bold text-gray-900">Manage Projects</h2>
                    <p className="text-sm text-gray-500">{showProjectsModal.name}</p>
                 </div>
                 <button onClick={() => setShowProjectsModal(null)} className="p-2 text-gray-400 hover:text-gray-600 rounded-lg"><X size={20} /></button>
               </div>
               
               <div className="flex-1 overflow-y-auto min-h-[300px]">
                  {loadingProjects ? (
                    <div className="flex justify-center py-10"><Loader2 className="animate-spin text-gray-300" /></div>
                  ) : (
                    <div className="space-y-1">
                        {allProjects.map(project => {
                            const isInThisGroup = project.groupId === showProjectsModal.id;
                            const isInOtherGroup = project.groupId !== null && project.groupId !== showProjectsModal.id;
                            
                            return (
                                <div key={project.id} className="flex items-center justify-between p-3 hover:bg-gray-50 rounded-xl transition-colors gap-3">
                                    <div className="flex items-center gap-3 overflow-hidden">
                                        <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center text-blue-600">
                                            <Folder size={20} />
                                        </div>
                                        <div className="overflow-hidden">
                                            <p className="font-medium text-gray-900 truncate">{project.name}</p>
                                            <div className="flex items-center gap-1.5">
                                              {project.groupId ? (
                                                <span className="inline-flex items-center gap-1 text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded border border-gray-200">
                                                  <Shield size={10} />
                                                  {project.groupName || 'Private'}
                                                </span>
                                              ) : (
                                                <span className="inline-flex items-center gap-1 text-[10px] bg-green-50 text-green-600 px-1.5 py-0.5 rounded border border-green-100">
                                                  <Globe size={10} />
                                                  Public
                                                </span>
                                              )}
                                            </div>
                                        </div>
                                    </div>
                                    <button
                                      onClick={() => handleToggleProject(project.id, isInThisGroup)}
                                      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all flex-shrink-0 ${
                                          isInThisGroup 
                                          ? 'bg-green-50 text-green-600 hover:bg-red-50 hover:text-red-600'
                                          : isInOtherGroup
                                          ? 'bg-blue-50 text-blue-600 hover:bg-blue-100'
                                          : 'bg-white border border-gray-200 text-gray-600 hover:border-blue-500 hover:text-blue-500'
                                      }`}
                                    >
                                        {isInThisGroup ? 'In Group' : isInOtherGroup ? 'Move Here' : 'Add to Group'}
                                    </button>
                                </div>
                            );
                        })}
                        {allProjects.length === 0 && (
                          <div className="text-center py-10 text-gray-400">
                            No projects found in the system.
                          </div>
                        )}
                    </div>
                  )}
               </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}

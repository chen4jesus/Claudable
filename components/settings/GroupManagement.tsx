'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Users, Plus, Trash2, Edit2, UserPlus, Check, X, Shield, Loader2, Folder, Globe } from 'lucide-react';

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

export default function GroupManagement() {
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
  const [groupMembers, setGroupMembers] = useState<string[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);

  // Projects Management
  const [allProjects, setAllProjects] = useState<Project[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(false);

  const fetchGroups = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/groups');
      if (res.status === 401) {
        setError('Not authorized');
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
  }, []);

  useEffect(() => {
    fetchGroups();
  }, [fetchGroups]);

  async function fetchUsersAndMembers(groupId: string) {
    setLoadingMembers(true);
    try {
      const usersRes = await fetch('/api/admin/users');
      const usersData = await usersRes.json();
      
      if (usersData.success) {
        setAllUsers(usersData.data);
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
    } catch (err) {
      console.error(err);
      fetchUsersAndMembers(showMembersModal.id);
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
      
      fetchGroups();
    } catch (err) {
      console.error(err);
      fetchProjects();
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <p className="text-red-500">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-medium text-gray-900">User Groups</h3>
          <p className="text-sm text-gray-600">Manage visibility and access control</p>
        </div>
        <button
          onClick={() => {
            setEditingGroup(null);
            setFormData({ name: '', description: '' });
            setShowCreateModal(true);
          }}
          className="px-4 py-2 bg-gray-900 text-white rounded-lg font-medium hover:bg-gray-800 transition-colors flex items-center gap-2 text-sm"
        >
          <Plus size={16} />
          Create Group
        </button>
      </div>

      {/* Groups Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {groups.map((group) => (
          <div
            key={group.id}
            className="bg-gray-50 rounded-xl p-5 border border-gray-200 hover:shadow-md transition-shadow relative group/card"
          >
            <div className="flex justify-between items-start mb-3">
              <div className="p-2.5 bg-blue-50 text-blue-600 rounded-lg">
                <Shield size={20} />
              </div>
              <div className="flex gap-1 opacity-0 group-hover/card:opacity-100 transition-opacity">
                <button 
                  onClick={() => startEdit(group)}
                  className="p-1.5 text-gray-400 hover:text-blue-500 hover:bg-blue-50 rounded-lg transition-colors"
                >
                  <Edit2 size={14} />
                </button>
                <button 
                  onClick={() => handleDelete(group.id)}
                  className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
            
            <h4 className="text-base font-semibold text-gray-900 mb-1">{group.name}</h4>
            <p className="text-xs text-gray-500 mb-4 h-8 line-clamp-2">{group.description || 'No description'}</p>
            
            <div className="flex items-center justify-between pt-3 border-t border-gray-200">
              <div className="flex gap-4">
                <div className="flex flex-col">
                  <span className="text-[10px] text-gray-400 font-medium uppercase tracking-wider">Users</span>
                  <span className="text-sm font-semibold text-gray-700">{group._count.users}</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-[10px] text-gray-400 font-medium uppercase tracking-wider">Projects</span>
                  <span className="text-sm font-semibold text-gray-700">{group._count.projects}</span>
                </div>
              </div>
              
              <div className="flex gap-1.5">
                <button 
                  onClick={() => openMembersModal(group)}
                  className="px-2.5 py-1 bg-white text-gray-600 hover:bg-gray-100 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 border border-gray-200"
                >
                  <UserPlus size={12} />
                  Members
                </button>
                <button 
                  onClick={() => openProjectsModal(group)}
                  className="px-2.5 py-1 bg-white text-gray-600 hover:bg-gray-100 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 border border-gray-200"
                >
                  <Folder size={12} />
                  Projects
                </button>
              </div>
            </div>
          </div>
        ))}
        
        {groups.length === 0 && (
          <div className="col-span-full py-12 flex flex-col items-center justify-center text-gray-400">
            <Shield size={40} className="mb-4 opacity-20" />
            <p>No groups found. Create one to get started.</p>
          </div>
        )}
      </div>

      {/* Create/Edit Modal */}
      <AnimatePresence>
        {showCreateModal && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center px-4">
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/20 backdrop-blur-sm"
              onClick={() => setShowCreateModal(false)}
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 relative z-10"
            >
              <h2 className="text-xl font-bold text-gray-900 mb-5">
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
                    className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all resize-none h-20"
                    placeholder="Optional description..."
                  />
                </div>
                <div className="flex gap-3 pt-3">
                  <button 
                    type="button" 
                    onClick={() => setShowCreateModal(false)}
                    className="flex-1 py-2 text-gray-700 font-medium hover:bg-gray-50 rounded-xl transition-colors"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit"
                    className="flex-1 py-2 bg-gray-900 text-white font-medium rounded-xl hover:bg-gray-800 transition-all"
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
          <div className="fixed inset-0 z-[60] flex items-center justify-center px-4">
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/20 backdrop-blur-sm"
              onClick={() => setShowMembersModal(null)}
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6 relative z-10 flex flex-col max-h-[70vh]"
            >
              <div className="flex justify-between items-center mb-5">
                <div>
                  <h2 className="text-lg font-bold text-gray-900">Manage Members</h2>
                  <p className="text-sm text-gray-500">{showMembersModal.name}</p>
                </div>
                <button onClick={() => setShowMembersModal(null)} className="p-2 text-gray-400 hover:text-gray-600 rounded-lg"><X size={18} /></button>
              </div>
              
              <div className="flex-1 overflow-y-auto min-h-[250px]">
                {loadingMembers ? (
                  <div className="flex justify-center py-10"><Loader2 className="animate-spin text-gray-300" /></div>
                ) : (
                  <div className="space-y-1">
                    {allUsers.map(user => {
                      const isMember = groupMembers.includes(user.id);
                      return (
                        <div key={user.id} className="flex items-center justify-between p-3 hover:bg-gray-50 rounded-xl transition-colors">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 bg-gray-100 rounded-full flex items-center justify-center text-gray-500 font-medium text-sm">
                              {user.username.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <p className="font-medium text-gray-900 text-sm">{user.username}</p>
                              <p className="text-xs text-gray-500 capitalize">{user.role}</p>
                            </div>
                          </div>
                          <button
                            onClick={() => handleToggleMember(user.id, isMember)}
                            className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${
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
          <div className="fixed inset-0 z-[60] flex items-center justify-center px-4">
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/20 backdrop-blur-sm"
              onClick={() => setShowProjectsModal(null)}
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6 relative z-10 flex flex-col max-h-[70vh]"
            >
              <div className="flex justify-between items-center mb-5">
                <div>
                  <h2 className="text-lg font-bold text-gray-900">Manage Projects</h2>
                  <p className="text-sm text-gray-500">{showProjectsModal.name}</p>
                </div>
                <button onClick={() => setShowProjectsModal(null)} className="p-2 text-gray-400 hover:text-gray-600 rounded-lg"><X size={18} /></button>
              </div>
              
              <div className="flex-1 overflow-y-auto min-h-[250px]">
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
                            <div className="w-9 h-9 bg-blue-50 rounded-lg flex items-center justify-center text-blue-600">
                              <Folder size={16} />
                            </div>
                            <div className="overflow-hidden">
                              <p className="font-medium text-gray-900 truncate text-sm">{project.name}</p>
                              <div className="flex items-center gap-1.5">
                                {project.groupId ? (
                                  <span className="inline-flex items-center gap-1 text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded border border-gray-200">
                                    <Shield size={9} />
                                    {project.groupName || 'Private'}
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 text-[10px] bg-green-50 text-green-600 px-1.5 py-0.5 rounded border border-green-100">
                                    <Globe size={9} />
                                    Public
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                          <button
                            onClick={() => handleToggleProject(project.id, isInThisGroup)}
                            className={`px-3 py-1 rounded-lg text-xs font-medium transition-all flex-shrink-0 ${
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
                      <div className="text-center py-10 text-gray-400 text-sm">
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

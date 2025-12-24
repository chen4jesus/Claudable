"use client";
import { useEffect, useState, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import CreateProjectModal from '@/components/modals/CreateProjectModal';
import DeleteProjectModal from '@/components/modals/DeleteProjectModal';
import ResourceManagementModal from '@/components/modals/ResourceManagementModal';
import GlobalSettings from '@/components/settings/GlobalSettings';
import { useGlobalSettings } from '@/contexts/GlobalSettingsContext';
import { getDefaultModelForCli, getModelDisplayName } from '@/lib/constants/cliModels';
import Image from 'next/image';
import { Image as ImageIcon, LogOut, User as UserIcon, Shield, Server } from 'lucide-react';
import type { Project as ProjectSummary } from '@/types/project';
import { fetchCliStatusSnapshot, createCliStatusFallback } from '@/hooks/useCLI';
import type { CLIStatus } from '@/types/cli';
import {
  ACTIVE_CLI_BRAND_COLORS,
  ACTIVE_CLI_MODEL_OPTIONS,
  ACTIVE_CLI_OPTIONS,
  ACTIVE_CLI_OPTIONS_MAP,
  DEFAULT_ACTIVE_CLI,
  normalizeModelForCli,
  sanitizeActiveCli,
  type ActiveCliId,
} from '@/lib/utils/cliOptions';

// Ensure fetch is available
const fetchAPI = globalThis.fetch || fetch;

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? '';

// Define assistant brand colors
const ASSISTANT_OPTIONS = ACTIVE_CLI_OPTIONS.map(({ id, name, icon }) => ({
  id,
  name,
  icon,
}));

const assistantBrandColors = ACTIVE_CLI_BRAND_COLORS;

const MODEL_OPTIONS_BY_ASSISTANT = ACTIVE_CLI_MODEL_OPTIONS;

export default function HomePage() {
  const router = useRouter();
  
  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  };
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [showGlobalSettings, setShowGlobalSettings] = useState(false);
  const [showResourceManagement, setShowResourceManagement] = useState(false);
  const [globalSettingsTab, setGlobalSettingsTab] = useState<'general' | 'ai-assistant'>('ai-assistant');
  const [editingProject, setEditingProject] = useState<ProjectSummary | null>(null);
  const [deleteModal, setDeleteModal] = useState<{ isOpen: boolean; project: ProjectSummary | null }>({ isOpen: false, project: null });
  const [isDeleting, setIsDeleting] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [prompt, setPrompt] = useState('');
  const DEFAULT_ASSISTANT: ActiveCliId = DEFAULT_ACTIVE_CLI;
  const DEFAULT_MODEL = getDefaultModelForCli(DEFAULT_ASSISTANT);
  const sanitizeAssistant = useCallback(
    (cli?: string | null) => sanitizeActiveCli(cli, DEFAULT_ASSISTANT),
    [DEFAULT_ASSISTANT]
  );
  const normalizeModelForAssistant = useCallback(
    (assistant: string, model?: string | null) => normalizeModelForCli(assistant, model, DEFAULT_ASSISTANT),
    [DEFAULT_ASSISTANT]
  );

  const normalizeProjectPayload = useCallback((project: any): ProjectSummary => {
    const preferred = sanitizeAssistant(project?.preferredCli ?? project?.preferred_cli);
    const selected = normalizeModelForAssistant(preferred, project?.selectedModel ?? project?.selected_model);

    return {
      id: project.id,
      name: project.name,
      description: project.description ?? null,
      status: project.status,
      previewUrl: project.previewUrl ?? project.preview_url ?? null,
      createdAt: project.createdAt ?? project.created_at ?? new Date().toISOString(),
      updatedAt: project.updatedAt ?? project.updated_at,
      lastActiveAt: project.lastActiveAt ?? project.last_active_at ?? null,
      lastMessageAt: project.lastMessageAt ?? project.last_message_at ?? null,
      initialPrompt: project.initialPrompt ?? project.initial_prompt ?? null,
      services: project.services,
      preferredCli: preferred as ProjectSummary['preferredCli'],
      selectedModel: selected,
      fallbackEnabled: project.fallbackEnabled ?? project.fallback_enabled ?? false,
    };
  }, [sanitizeAssistant, normalizeModelForAssistant]);
  const [selectedAssistant, setSelectedAssistant] = useState<ActiveCliId>(DEFAULT_ASSISTANT);
  const [selectedModel, setSelectedModel] = useState(DEFAULT_MODEL);
  const [usingGlobalDefaults, setUsingGlobalDefaults] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [cliStatus, setCLIStatus] = useState<CLIStatus>({});
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const selectedAssistantOption = ACTIVE_CLI_OPTIONS_MAP[selectedAssistant];
  const [isAdmin, setIsAdmin] = useState(false);
  const [username, setUsername] = useState('');
  
  // Loading progress tracking
  const [loadingStages, setLoadingStages] = useState({
    auth: false,
    cli: false,
    projects: false
  });
  const isFullyLoaded = loadingStages.auth && loadingStages.cli && loadingStages.projects;
  const loadingProgress = [loadingStages.auth, loadingStages.cli, loadingStages.projects].filter(Boolean).length;
  const loadingMessage = !loadingStages.auth ? 'Checking authentication...' 
    : !loadingStages.cli ? 'Loading AI assistants...'
    : !loadingStages.projects ? 'Loading projects...'
    : 'Ready!';
  
  useEffect(() => {
    fetch('/api/auth/me')
      .then(res => res.json())
      .then(data => {
        setIsAdmin(data?.user?.role === 'admin');
        setUsername(data?.user?.username || '');
        setLoadingStages(prev => ({ ...prev, auth: true }));
      })
      .catch(() => {
        setLoadingStages(prev => ({ ...prev, auth: true }));
      });
  }, []);
  
  // Get available models based on current assistant
  const availableModels = MODEL_OPTIONS_BY_ASSISTANT[selectedAssistant] || [];
  
  // Sync with Global Settings (until user overrides locally)
  const { settings: globalSettings } = useGlobalSettings();
  
  // Check if this is a fresh page load (not navigation)
  useEffect(() => {
    const isPageRefresh = !sessionStorage.getItem('navigationFlag');
    
    if (isPageRefresh) {
      // Fresh page load or refresh - use global defaults
      sessionStorage.setItem('navigationFlag', 'true');
      setIsInitialLoad(true);
      setUsingGlobalDefaults(true);
    } else {
      // Navigation within session - check for stored selections
      const storedAssistantRaw = sessionStorage.getItem('selectedAssistant');
      const storedModelRaw = sessionStorage.getItem('selectedModel');

      if (storedModelRaw) {
        const storedAssistant = sanitizeAssistant(storedAssistantRaw);
        const storedModel = normalizeModelForAssistant(storedAssistant, storedModelRaw);
        setSelectedAssistant(storedAssistant);
        setSelectedModel(storedModel);
        setUsingGlobalDefaults(false);
        setIsInitialLoad(false);
        return;
      }
    }
    
    // Clean up navigation flag on unmount
    return () => {
      // Don't clear on navigation, only on actual page unload
    };
  }, [sanitizeAssistant, normalizeModelForAssistant]);
  
  // Apply global settings when using defaults
  useEffect(() => {
    if (!usingGlobalDefaults || !isInitialLoad) return;
    
    const cli = sanitizeAssistant(globalSettings?.default_cli);
    setSelectedAssistant(cli);
    const modelFromGlobal = globalSettings?.cli_settings?.[cli]?.model;
    setSelectedModel(normalizeModelForAssistant(cli, modelFromGlobal));
  }, [globalSettings, usingGlobalDefaults, isInitialLoad, sanitizeAssistant, normalizeModelForAssistant]);
  
  // Save selections to sessionStorage when they change
  useEffect(() => {
    if (!isInitialLoad && selectedAssistant && selectedModel) {
      const normalizedAssistant = sanitizeAssistant(selectedAssistant);
      sessionStorage.setItem('selectedAssistant', normalizedAssistant);
      sessionStorage.setItem('selectedModel', normalizeModelForAssistant(normalizedAssistant, selectedModel));
    }
  }, [selectedAssistant, selectedModel, isInitialLoad, sanitizeAssistant, normalizeModelForAssistant]);
  
  // Clear navigation flag on page unload
  useEffect(() => {
    const handleBeforeUnload = () => {
      sessionStorage.removeItem('navigationFlag');
    };
    
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);
  const [showAssistantDropdown, setShowAssistantDropdown] = useState(false);
  const [showModelDropdown, setShowModelDropdown] = useState(false);
  const [isCreatingProject, setIsCreatingProject] = useState(false);
  const [uploadedImages, setUploadedImages] = useState<{ id: string; name: string; url: string; path: string; file?: File }[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const prefetchTimers = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const fileInputRef = useRef<HTMLInputElement>(null);
  const assistantDropdownRef = useRef<HTMLDivElement>(null);
  const modelDropdownRef = useRef<HTMLDivElement>(null);

  // Check CLI installation status
  useEffect(() => {
    const checkingStatus = ASSISTANT_OPTIONS.reduce<CLIStatus>((acc, cli) => {
      acc[cli.id] = {
        installed: false,
        checking: true,
        available: false,
        configured: false,
      };
      return acc;
    }, {});
    setCLIStatus(checkingStatus);

    fetchCliStatusSnapshot()
      .then((status) => {
        setCLIStatus(status);
        setLoadingStages(prev => ({ ...prev, cli: true }));
      })
      .catch((error) => {
        console.error('Failed to check CLI status:', error);
        setCLIStatus(createCliStatusFallback());
        setLoadingStages(prev => ({ ...prev, cli: true }));
      });
  }, []);

  // Click outside handler
  useEffect(() => {
    const handleDocumentClick = (event: MouseEvent) => {
      const target = event.target as Node;

      const assistantEl = assistantDropdownRef.current;
      if (assistantEl && !assistantEl.contains(target)) {
        setShowAssistantDropdown(false);
      }

      const modelEl = modelDropdownRef.current;
      if (modelEl && !modelEl.contains(target)) {
        setShowModelDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleDocumentClick);
    return () => {
      document.removeEventListener('mousedown', handleDocumentClick);
    };
  }, []);

  // Format time for display
  const formatTime = (dateString: string | null) => {
    if (!dateString) return 'Never';
    
    // Server sends UTC time without 'Z' suffix, so we need to add it
    // to ensure it's parsed as UTC, not local time
    let utcDateString = dateString;
    
    // Check if the string has timezone info
    const hasTimezone = dateString.endsWith('Z') || 
                       dateString.includes('+') || 
                       dateString.match(/[-+]\d{2}:\d{2}$/);
    
    if (!hasTimezone) {
      // Add 'Z' to indicate UTC
      utcDateString = dateString + 'Z';
    }
    
    // Parse the date as UTC
    const date = new Date(utcDateString);
    const now = new Date();
    // Calculate the actual time difference
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 30) return `${diffDays}d ago`;
    
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric',
      year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
    });
  };

  // Format CLI and model information
  const formatCliInfo = (cli?: string, model?: string) => {
    const normalizedCli = sanitizeAssistant(cli);
    const assistantOption = ACTIVE_CLI_OPTIONS_MAP[normalizedCli];
    const cliName = assistantOption?.name ?? 'Claude Code';
    const modelId = normalizeModelForAssistant(normalizedCli, model);
    const modelLabel = getModelDisplayName(normalizedCli, modelId);
    return `${cliName} • ${modelLabel}`;
  };

  const formatFullTime = (dateString: string) => {
    return new Date(dateString).toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const load = useCallback(async () => {
    try {
      const r = await fetchAPI(`${API_BASE}/api/projects`);
      if (!r.ok) {
        console.warn('Failed to load projects: HTTP', r.status);
        setProjects([]);
        return;
      }

      const payload = await r.json();
      if (payload?.success === false) {
        console.error('Failed to load projects:', payload?.error || payload?.message);
        setProjects([]);
        return;
      }

      const items: unknown[] = Array.isArray(payload?.data)
        ? payload.data
        : Array.isArray(payload)
        ? payload
        : [];

      const normalized: ProjectSummary[] = items
        .filter((project): project is Record<string, unknown> => Boolean(project && typeof project === 'object'))
        .map((project) => normalizeProjectPayload(project));

      const sortedProjects = normalized.sort((a, b) => {
        const aTime = a.lastMessageAt ?? a.createdAt;
        const bTime = b.lastMessageAt ?? b.createdAt;
        if (!aTime) return 1;
        if (!bTime) return -1;
        return new Date(bTime).getTime() - new Date(aTime).getTime();
      });

      setProjects(sortedProjects);
      setLoadingStages(prev => ({ ...prev, projects: true }));
    } catch (error) {
      console.warn('Failed to load projects:', error);
      setProjects([]);
      setLoadingStages(prev => ({ ...prev, projects: true }));
    }
  }, [normalizeProjectPayload]);
  
  // Load projects on mount
  useEffect(() => {
    load();
  }, [load]);
  
  async function onCreated() { await load(); }
  
  async function start(projectId: string) {
    try {
      await fetchAPI(`${API_BASE}/api/projects/${projectId}/preview/start`, { method: 'POST' });
      await load();
    } catch (error) {
      console.warn('Failed to start project:', error);
    }
  }
  
  async function stop(projectId: string) {
    try {
      await fetchAPI(`${API_BASE}/api/projects/${projectId}/preview/stop`, { method: 'POST' });
      await load();
    } catch (error) {
      console.warn('Failed to stop project:', error);
    }
  }

  const showToast = useCallback((message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  }, []);

  const openDeleteModal = (project: ProjectSummary) => {
    setDeleteModal({ isOpen: true, project });
  };

  const closeDeleteModal = () => {
    setDeleteModal({ isOpen: false, project: null });
  };

  async function deleteProject() {
    if (!deleteModal.project) return;
    
    setIsDeleting(true);
    try {
      const response = await fetchAPI(`${API_BASE}/api/projects/${deleteModal.project.id}`, { method: 'DELETE' });
      
      if (response.ok) {
        showToast('Project deleted successfully', 'success');
        await load();
        closeDeleteModal();
      } else {
        const errorData = await response.json().catch(() => ({ detail: 'Failed to delete project' }));
        showToast(errorData.detail || 'Failed to delete project', 'error');
      }
    } catch (error) {
      console.warn('Failed to delete project:', error);
      showToast('Failed to delete project. Please try again.', 'error');
    } finally {
      setIsDeleting(false);
    }
  }

  async function updateProject(projectId: string, newName: string) {
    try {
      const response = await fetchAPI(`${API_BASE}/api/projects/${projectId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName })
      });
      
      if (response.ok) {
        showToast('Project updated successfully', 'success');
        await load();
        setEditingProject(null);
      } else {
        const errorData = await response.json().catch(() => ({ detail: 'Failed to update project' }));
        showToast(errorData.detail || 'Failed to update project', 'error');
      }
    } catch (error) {
      console.warn('Failed to update project:', error);
      showToast('Failed to update project. Please try again.', 'error');
    }
  }

  // Handle files (for both drag drop and file input)
  const handleFiles = useCallback(async (files: FileList | File[]) => {
    setIsUploading(true);
    
    try {
      const filesArray = Array.from(files as ArrayLike<File>);
      const imagesToAdd = filesArray
        .filter(file => file.type.startsWith('image/'))
        .map(file => ({
          id: crypto.randomUUID(),
          name: file.name,
          url: URL.createObjectURL(file),
          path: '',
          file,
        }));

      if (imagesToAdd.length > 0) {
        setUploadedImages(prev => [...prev, ...imagesToAdd]);
      }
    } catch (error) {
      console.error('Image processing failed:', error);
      showToast('Failed to process image. Please try again.', 'error');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }, [showToast]);

  // Handle image upload - store locally first, upload after project creation
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    
    await handleFiles(files);
  };

  // Drag and drop handlers
  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // Only set to false if we're leaving the container completely
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDragOver(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'copy';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleFiles(files);
    }
  };

  // Remove uploaded image
  const removeImage = (id: string) => {
    setUploadedImages(prev => {
      const imageToRemove = prev.find(img => img.id === id);
      if (imageToRemove) {
        URL.revokeObjectURL(imageToRemove.url);
      }
      return prev.filter(img => img.id !== id);
    });
  };

  const handleSubmit = async () => {
    if ((!prompt.trim() && uploadedImages.length === 0) || isCreatingProject) return;
    
    setIsCreatingProject(true);
    
    // Generate a unique project ID
    const projectId = `project-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    try {
      // Smart project type detection based on prompt keywords
      const lowerPrompt = prompt.toLowerCase();
      let detectedTemplateType = 'nextjs'; // default
      
      if (lowerPrompt.includes('flask') || lowerPrompt.includes('python') || lowerPrompt.includes('pip ')) {
        detectedTemplateType = 'flask';
      } else if (lowerPrompt.includes('vue')) {
        detectedTemplateType = 'vue';
      } else if (lowerPrompt.includes('static html') || lowerPrompt.includes('plain html') || lowerPrompt.includes('vanilla js') || lowerPrompt.includes('no framework')) {
        detectedTemplateType = 'static-html';
      } else if ((lowerPrompt.includes('react') && !lowerPrompt.includes('next')) || lowerPrompt.includes('vite') || lowerPrompt.includes('create-react-app')) {
        detectedTemplateType = 'react';
      }
      
      // Create a new project first
      const response = await fetchAPI(`${API_BASE}/api/projects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: projectId,
          name: prompt.slice(0, 50) + (prompt.length > 50 ? '...' : ''),
          initialPrompt: prompt.trim(),
          preferredCli: selectedAssistant,
          selectedModel,
          templateType: detectedTemplateType
        })
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        console.error('Failed to create project:', errorData);
        showToast('Failed to create project', 'error');
        setIsCreatingProject(false);
        return;
      }
      
      const payload = await response.json();
      const projectData = (payload && typeof payload === 'object') ? (payload.data ?? payload) : payload;
      const createdProjectId: string | undefined = projectData?.id ?? projectId;
      if (!createdProjectId) {
        console.error('Create project response missing id:', payload);
        showToast('Failed to create project (invalid response)', 'error');
        setIsCreatingProject(false);
        return;
      }
      if (createdProjectId !== projectId) {
        console.warn('Project ID mismatch between request and response:', {
          requestedId: projectId,
          responseId: createdProjectId,
          payload
        });
      }
      
      // Upload images if any
      let imageData: any[] = [];
      
      if (uploadedImages.length > 0) {
        try {
          for (let i = 0; i < uploadedImages.length; i++) {
            const image = uploadedImages[i];
            if (!image.file) continue;
            
            const formData = new FormData();
            formData.append('file', image.file);

            const uploadResponse = await fetchAPI(`${API_BASE}/api/assets/${createdProjectId}/upload`, {
              method: 'POST',
              body: formData
            });

            if (uploadResponse.ok) {
              const result = await uploadResponse.json();
              // Track image data for API
              imageData.push({
                name: result.filename || image.name,
                path: result.absolute_path,
                public_url: typeof result.public_url === 'string' ? result.public_url : undefined
              });
            }
          }
        } catch (uploadError) {
          console.error('Image upload failed:', uploadError);
          showToast('Images could not be uploaded, but project was created', 'error');
        }
      }
      
      // Execute initial prompt directly with images
      if (prompt.trim()) {
        try {
          const actResponse = await fetchAPI(`${API_BASE}/api/chat/${createdProjectId}/act`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              instruction: prompt.trim(), // Original prompt without image paths
              images: imageData,
              isInitialPrompt: true,
              cliPreference: selectedAssistant,
              selectedModel
            })
          });
          
          if (actResponse.ok) {
            // Successfully kicked off ACT with image payloads
          } else {
            console.error('❌ ACT failed:', await actResponse.text());
          }
        } catch (actError) {
          console.error('❌ ACT API error:', actError);
        }
      }
      
      // Navigate to chat page with model and CLI parameters
      uploadedImages.forEach(image => {
        if (image.url) {
          URL.revokeObjectURL(image.url);
        }
      });
      setUploadedImages([]);
      setPrompt('');

      const params = new URLSearchParams();
      if (selectedAssistant) params.set('cli', selectedAssistant);
      if (selectedModel) params.set('model', selectedModel);
      router.push(`/${createdProjectId}/chat${params.toString() ? '?' + params.toString() : ''}`);
      
    } catch (error) {
      console.error('Failed to create project:', error);
      showToast('Failed to create project', 'error');
    } finally {
      setIsCreatingProject(false);
    }
  };

  useEffect(() => { 
    load();
    
    // Handle clipboard paste for images
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      
      const imageFiles: File[] = [];
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) {
            imageFiles.push(file);
          }
        }
      }
      
      if (imageFiles.length > 0) {
        e.preventDefault();
        const fileList = {
          length: imageFiles.length,
          item: (index: number) => imageFiles[index],
          [Symbol.iterator]: function* () {
            for (let i = 0; i < imageFiles.length; i++) {
              yield imageFiles[i];
            }
          }
        } as FileList;
        
        // Convert to FileList-like object
        Object.defineProperty(fileList, 'length', { value: imageFiles.length });
        imageFiles.forEach((file, index) => {
          Object.defineProperty(fileList, index, { value: file });
        });
        
        handleFiles(fileList);
      }
    };
    
    document.addEventListener('paste', handlePaste);
    const timers = prefetchTimers.current;

    // Cleanup prefetch timers
    return () => {
      timers.forEach(timer => clearTimeout(timer));
      timers.clear();
      document.removeEventListener('paste', handlePaste);
    };
  }, [selectedAssistant, handleFiles, load]);

  // Update models when assistant changes
  const handleAssistantChange = (assistant: string) => {
    // Don't allow selecting uninstalled CLIs
    if (!cliStatus[assistant]?.installed) return;

    const sanitized = sanitizeAssistant(assistant);
    setUsingGlobalDefaults(false);
    setIsInitialLoad(false);
    setSelectedAssistant(sanitized);
    setSelectedModel(getDefaultModelForCli(sanitized));

    setShowAssistantDropdown(false);
  };

  const handleModelChange = (modelId: string) => {
    setUsingGlobalDefaults(false);
    setIsInitialLoad(false);
    setSelectedModel(normalizeModelForAssistant(selectedAssistant, modelId));
    setShowModelDropdown(false);
  };


  return (
    <div className="flex h-screen relative overflow-hidden bg-white ">
      {/* Loading Overlay */}
      {!isFullyLoaded && (
        <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-gradient-to-b from-white to-gray-50">
          <div className="w-80 flex flex-col items-center gap-8">
            {/* Logo area */}
            <div className="flex flex-col items-center gap-4">
              <div className="relative w-24 h-24">
                {/* Logo image */}
                <Image 
                  src="/faithconnect_blue.png" 
                  alt="FaithConnect" 
                  width={96} 
                  height={96}
                  className="relative z-10 rounded-2xl"
                  priority
                />
                {/* Shine effect overlay */}
                <div 
                  className="absolute inset-0 z-20 overflow-hidden rounded-2xl pointer-events-none"
                  style={{
                    background: 'linear-gradient(120deg, transparent 30%, rgba(255,255,255,0.6) 50%, transparent 70%)',
                    backgroundSize: '200% 100%',
                    animation: 'shine 2s ease-in-out infinite'
                  }}
                />
                {/* Glow effect behind logo */}
                <div className="absolute inset-0 -z-10 blur-xl opacity-40 bg-gradient-to-br from-blue-400 to-blue-600 rounded-full scale-110" />
              </div>
              <h1 className="text-2xl font-bold text-gray-900">Build Faithfully</h1>
            </div>
            
            {/* Shine animation keyframes */}
            <style jsx>{`
              @keyframes shine {
                0% { background-position: 200% 0; }
                100% { background-position: -200% 0; }
              }
            `}</style>
            
            {/* Progress bar container */}
            <div className="w-full space-y-3">
              <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-gradient-to-r from-[#DE7356] to-[#c45f45] rounded-full transition-all duration-500 ease-out"
                  style={{ width: `${(loadingProgress / 3) * 100}%` }}
                />
              </div>
              
              {/* Status message */}
              <div className="flex items-center justify-center gap-2 text-sm text-gray-600">
                <div className="w-4 h-4 border-2 border-[#DE7356] border-t-transparent rounded-full animate-spin" />
                <span>{loadingMessage}</span>
              </div>
              
              {/* Progress steps */}
              <div className="flex justify-between text-xs text-gray-400 pt-2">
                <span className={loadingStages.auth ? 'text-green-600' : ''}>
                  {loadingStages.auth ? '✓' : '○'} Auth
                </span>
                <span className={loadingStages.cli ? 'text-green-600' : ''}>
                  {loadingStages.cli ? '✓' : '○'} AI
                </span>
                <span className={loadingStages.projects ? 'text-green-600' : ''}>
                  {loadingStages.projects ? '✓' : '○'} Projects
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* Radial gradient background from bottom center */}
      <div className="absolute inset-0">
        <div className="absolute inset-0 bg-white " />
        <div 
          className="absolute inset-0 hidden transition-all duration-1000 ease-in-out"
          style={{
            background: `radial-gradient(circle at 50% 100%, 
              ${(assistantBrandColors[selectedAssistant] || assistantBrandColors.claude)}66 0%, 
              ${(assistantBrandColors[selectedAssistant] || assistantBrandColors.claude)}4D 25%, 
              ${(assistantBrandColors[selectedAssistant] || assistantBrandColors.claude)}33 50%, 
              transparent 70%)`
          }}
        />
        {/* Light mode gradient - subtle */}
        <div 
          className="absolute inset-0 block transition-all duration-1000 ease-in-out"
          style={{
            background: `radial-gradient(circle at 50% 100%, 
              ${(assistantBrandColors[selectedAssistant] || assistantBrandColors.claude)}40 0%, 
              ${(assistantBrandColors[selectedAssistant] || assistantBrandColors.claude)}26 25%, 
              transparent 50%)`
          }}
        />
      </div>
      
      {/* Content wrapper */}
      <div className="relative z-10 flex h-full w-full">
        {/* Thin sidebar bar when closed */}
        <div className={`${sidebarOpen ? 'w-0' : 'w-12'} fixed inset-y-0 left-0 z-40 bg-transparent border-r border-gray-200/20 transition-all duration-300 flex flex-col`}>
          <button
            onClick={() => setSidebarOpen(true)}
            className="w-full h-12 flex items-center justify-center text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition-colors"
            title="Open sidebar"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M3 12h18M3 6h18M3 18h18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
          
          {/* Settings, Resources, and Logout buttons when sidebar is closed */}
          <div className="mt-auto mb-2 flex flex-col gap-1">
            <button
              onClick={() => setShowGlobalSettings(true)}
              className="w-full h-10 flex items-center justify-center text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition-colors"
              title="Settings"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
            {isAdmin && (
              <button
                onClick={() => setShowResourceManagement(true)}
                className="w-full h-10 flex items-center justify-center text-gray-600 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                title="Resources"
              >
                <Server size={20} />
              </button>
            )}
            <button
              onClick={handleLogout}
              className="w-full h-10 flex items-center justify-center text-gray-600 hover:text-red-600 hover:bg-red-50 transition-colors"
              title="Logout"
            >
              <LogOut size={20} />
            </button>
          </div>
        </div>
        
        {/* Sidebar - Overlay style */}
        <div className={`${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} fixed inset-y-0 left-0 z-40 w-64 bg-white/95 backdrop-blur-2xl border-r border-gray-200 transition-transform duration-300 flex flex-col`}>
        <div className="flex flex-col h-full">
          {/* History header with close button */}
          <div className="p-3 border-b border-gray-200 ">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 px-2 py-1">
                <h2 className="text-gray-900 font-medium text-lg">History</h2>
                <button
                  onClick={() => setShowCreate(true)}
                  className="ml-2 p-1 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-full transition-all"
                  title="New Project"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
              </div>
              <button
                onClick={() => setSidebarOpen(false)}
                className="p-1 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded transition-colors"
                title="Close sidebar"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
            </div>
          </div>
          
          <div className="flex-1 overflow-y-auto p-2">
            <div className="space-y-1">
              {projects.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-gray-500 text-sm">No conversations yet</p>
                </div>
              ) : (
                projects.map((project) => {
                  const projectCli = sanitizeAssistant(project.preferredCli);
                  const projectColor = assistantBrandColors[projectCli] || assistantBrandColors[DEFAULT_ASSISTANT];
                  return (
                    <div 
                      key={project.id}
                      className="p-2 px-3 rounded-lg transition-all group"
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = `${projectColor}15`;
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = 'transparent';
                    }}
                  >
                    {editingProject?.id === project.id ? (
                      // Edit mode
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          const formData = new FormData(e.target as HTMLFormElement);
                          const newName = formData.get('name') as string;
                          if (newName.trim()) {
                            updateProject(project.id, newName.trim());
                          }
                        }}
                        className="space-y-2"
                      >
                        <input
                          name="name"
                          defaultValue={project.name}
                          className="w-full px-2 py-1 text-sm bg-white border border-gray-300 rounded text-gray-900 focus:outline-none focus:ring-2 focus:ring-orange-500"
                          autoFocus
                          onBlur={() => setEditingProject(null)}
                        />
                        <div className="flex gap-1">
                          <button
                            type="submit"
                            className="px-2 py-1 text-xs bg-orange-500 text-white rounded hover:bg-orange-600 transition-colors"
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingProject(null)}
                            className="px-2 py-1 text-xs bg-gray-500 text-white rounded hover:bg-gray-600 transition-colors"
                          >
                            Cancel
                          </button>
                        </div>
                      </form>
                    ) : (
                      // View mode
                      <div className="flex items-center justify-between gap-2">
                        <div 
                          className="flex-1 cursor-pointer min-w-0"
                          onClick={() => {
                            // Pass current model selection when navigating from sidebar
                            const params = new URLSearchParams();
                            if (selectedAssistant) params.set('cli', selectedAssistant);
                            if (selectedModel) params.set('model', selectedModel);
                            router.push(`/${project.id}/chat${params.toString() ? '?' + params.toString() : ''}`);
                          }}
                        >
                          <h3 
                            className="text-gray-900 text-sm transition-colors truncate"
                            style={{
                              '--hover-color': projectColor || '#DE7356'
                            } as React.CSSProperties}
                          >
                            <span 
                              className="group-hover:text-[var(--hover-color)]"
                              style={{
                                transition: 'color 0.2s'
                              }}
                            >
                              {project.name.length > 28 
                                ? `${project.name.substring(0, 28)}...` 
                                : project.name
                              }
                            </span>
                          </h3>
                          <div className="flex items-center gap-2 mt-1">
                            <div className="text-gray-500 text-xs">
                              {formatTime(project.lastMessageAt || project.createdAt)}
                            </div>
                            {project.preferredCli && (
                              <div className="flex items-center gap-1">
                                <span className="text-gray-400 text-xs">•</span>
                                <span
                                  className="text-xs transition-colors"
                                  style={{
                                    color: (projectColor || '#6B7280') + 'CC'
                                  }}
                                >
                                  {formatCliInfo(projectCli, project.selectedModel ?? undefined)}
                                </span>
                              </div>
                            )}
                            {project.groupName && (
                              <div className="flex items-center gap-1">
                                <span className="text-gray-400 text-xs">•</span>
                                <span className="text-[10px] font-medium px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded-md border border-gray-200">
                                  {project.groupName}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingProject(project);
                            }}
                            className="p-1 text-gray-400 hover:text-orange-500 transition-colors"
                            title="Edit project name"
                          >
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              openDeleteModal(project);
                            }}
                            className="p-1 text-gray-400 hover:text-red-500 transition-colors"
                            title="Delete project"
                          >
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
          
    <div className="p-2 border-t border-gray-200 flex flex-col gap-1"> 
            {username && (
              <div className="flex items-center gap-2 p-2 mb-1 bg-gray-50 rounded-lg border border-gray-100">
                <div className="w-8 h-8 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-sm font-bold uppercase shrink-0">
                  {username.charAt(0)}
                </div>
                <div className="flex flex-col min-w-0">
                  <span className="text-sm font-semibold text-gray-900 truncate">{username}</span>
                  <span className="text-[10px] text-gray-500 uppercase tracking-wider">{isAdmin ? 'Administrator' : 'User'}</span>
                </div>
              </div>
            )}
            <button 
              onClick={() => setShowGlobalSettings(true)}
              className="w-full flex items-center gap-2 p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-all text-sm"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Settings
            </button>
            {isAdmin && (
              <button 
                onClick={() => setShowResourceManagement(true)}
                className="w-full flex items-center gap-2 p-2 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all text-sm"
              >
                <Server size={18} />
                Resources
              </button>
            )}
            <button 
              onClick={handleLogout}
              className="w-full flex items-center gap-2 p-2 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all text-sm"
            >
              <LogOut size={18} />
              Logout
            </button>
          </div>
        </div>
      </div>
      
      {/* Main Content - Not affected by sidebar */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="w-full max-w-4xl">
            <div className="text-center mb-12">
              <div className="flex justify-center mb-6">
                <h1 
                  className="font-extrabold tracking-tight select-none transition-colors duration-1000 ease-in-out"
                  style={{
                    fontFamily: "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
                    color: (assistantBrandColors[selectedAssistant] || assistantBrandColors.claude),
                    letterSpacing: '-0.06em',
                    fontWeight: 800,
                    fontSize: '72px',
                    lineHeight: '72px'
                  }}
                >
                  Build Faithfully
                </h1>
              </div>
              <p className="text-xl text-gray-700 font-light tracking-tight">
                Build From Faith • Build With Faith • Build For Faith
              </p>
            </div>
            
            {/* Image thumbnails */}
            {uploadedImages.length > 0 && (
              <div className="mb-4 flex flex-wrap gap-2">
                {uploadedImages.map((image, index) => (
                  <div key={image.id} className="relative group">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img 
                      src={image.url} 
                      alt={image.name}
                      className="w-20 h-20 object-cover rounded-lg border border-gray-200 "
                    />
                    <div className="absolute bottom-0 left-0 right-0 bg-black bg-opacity-50 text-white text-xs px-1 py-0.5 rounded-b-lg">
                      Image #{index + 1}
                    </div>
                    <button
                      type="button"
                      onClick={() => removeImage(image.id)}
                      className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Main Input Form */}
            <form 
              onSubmit={(e) => { e.preventDefault(); handleSubmit(); }}
              onDragEnter={handleDragEnter}
              onDragLeave={handleDragLeave}
              onDragOver={handleDragOver}
              onDrop={handleDrop}
              className={`group flex flex-col gap-4 p-4 w-full rounded-[28px] border backdrop-blur-xl text-base shadow-xl transition-all duration-150 ease-in-out mb-6 relative overflow-visible ${
                isDragOver 
                  ? 'border-[#DE7356] bg-[#DE7356]/10 ' 
                  : 'border-gray-200 bg-white '
              }`}
            >
              <div className="relative flex flex-1 items-center">
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="Ask Faithful to create a blog about..."
                  disabled={isCreatingProject}
                  className="flex w-full rounded-md px-2 py-2 placeholder:text-gray-400 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 resize-none text-[16px] leading-snug md:text-base focus-visible:ring-0 focus-visible:ring-offset-0 bg-transparent focus:bg-transparent flex-1 text-gray-900 overflow-y-auto"
                  style={{ height: '120px' }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      if (e.metaKey || e.ctrlKey) {
                        e.preventDefault();
                        handleSubmit();
                      } else if (!e.shiftKey) {
                        e.preventDefault();
                        handleSubmit();
                      }
                    }
                  }}
                />
              </div>
              
              {/* Drag overlay */}
              {isDragOver && (
                <div className="absolute inset-0 bg-[#DE7356]/10 rounded-[28px] flex items-center justify-center z-10 border-2 border-dashed border-[#DE7356]">
                  <div className="text-center">
                    <div className="text-3xl mb-3">📸</div>
                    <div className="text-lg font-semibold text-[#DE7356] mb-2">
                      Drop images here
                    </div>
                    <div className="text-sm text-[#DE7356] ">
                      Supports: JPG, PNG, GIF, WEBP
                    </div>
                  </div>
                </div>
              )}
              
              <div className="flex gap-1 flex-wrap items-center">
                {/* Image Upload Button */}
                <div className="flex items-center gap-2">
                  <label 
                    className="flex items-center justify-center w-8 h-8 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Upload images"
                  >
                    <ImageIcon className="h-4 w-4" />
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={handleImageUpload}
                      disabled={isUploading || isCreatingProject}
                      className="hidden"
                    />
                  </label>
                </div>
                {/* Agent Selector */}
                <div className="relative z-[200]" ref={assistantDropdownRef}>
                  <button
                    type="button"
                    onClick={() => {
                      setShowAssistantDropdown(!showAssistantDropdown);
                      setShowModelDropdown(false);
                    }}
                    className="justify-center whitespace-nowrap text-sm font-medium transition-colors duration-100 ease-in-out focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 border border-gray-200/50 bg-transparent shadow-sm hover:bg-gray-50 hover:border-gray-300/50 px-3 py-2 flex h-8 items-center gap-1 rounded-full text-gray-700 hover:text-gray-900 focus-visible:ring-0"
                  >
                    <div className="w-4 h-4 rounded overflow-hidden">
                      <Image
                        src={selectedAssistantOption?.icon ?? '/claude.png'}
                        alt={selectedAssistantOption?.name ?? 'Claude Code'}
                        width={16}
                        height={16}
                        className="w-full h-full object-contain"
                      />
                    </div>
                    <span className="hidden md:flex text-sm font-medium">
                      {selectedAssistantOption?.name ?? 'Claude Code'}
                    </span>
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 -960 960 960" className="shrink-0 h-3 w-3 rotate-90" fill="currentColor">
                      <path d="M530-481 353-658q-9-9-8.5-21t9.5-21 21.5-9 21.5 9l198 198q5 5 7 10t2 11-2 11-7 10L396-261q-9 9-21 8.5t-21-9.5-9-21.5 9-21.5z"/>
                    </svg>
                  </button>
                  
                  {showAssistantDropdown && (
                    <div className="absolute top-full mt-1 left-0 z-[300] min-w-full whitespace-nowrap rounded-2xl border border-gray-200 bg-white backdrop-blur-xl shadow-lg">
                      {ASSISTANT_OPTIONS.map((option) => (
                        <button
                          key={option.id}
                          onClick={() => handleAssistantChange(option.id)}
                          disabled={!cliStatus[option.id]?.installed}
                          className={`w-full flex items-center gap-2 px-3 py-2 text-left first:rounded-t-2xl last:rounded-b-2xl transition-colors ${
                            !cliStatus[option.id]?.installed
                              ? 'opacity-50 cursor-not-allowed text-gray-400 '
                              : selectedAssistant === option.id 
                              ? 'bg-gray-100 text-black font-semibold' 
                              : 'text-gray-800 hover:text-black hover:bg-gray-100 '
                          }`}
                        >
                          <div className="w-4 h-4 rounded overflow-hidden">
                            <Image
                              src={option.icon ?? '/claude.png'}
                              alt={option.name}
                              width={16}
                              height={16}
                              className="w-full h-full object-contain"
                            />
                          </div>
                          <span className="text-sm font-medium">{option.name}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                
                {/* Model Selector */}
                <div className="relative z-[200]" ref={modelDropdownRef}>
                  <button
                    type="button"
                    onClick={() => {
                      setShowModelDropdown((current) => !current);
                      setShowAssistantDropdown(false);
                    }}
                    className="justify-center whitespace-nowrap text-sm font-medium transition-colors duration-100 ease-in-out focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 border border-gray-200/50 bg-transparent shadow-sm hover:bg-gray-50 hover:border-gray-300/50 px-3 py-2 flex h-8 items-center gap-1 rounded-full text-gray-700 hover:text-gray-900 focus-visible:ring-0 min-w-[140px]"
                  >
                    <span className="text-sm font-medium whitespace-nowrap">
                      {availableModels.find(m => m.id === selectedModel)?.name ?? getModelDisplayName(selectedAssistant, selectedModel)}
                    </span>
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 -960 960 960" className="shrink-0 h-3 w-3 rotate-90 ml-auto" fill="currentColor">
                      <path d="M530-481 353-658q-9-9-8.5-21t9.5-21 21.5-9 21.5 9l198 198q5 5 7 10t2 11-2 11-7 10L396-261q-9 9-21 8.5t-21-9.5-9-21.5 9-21.5z"/>
                    </svg>
                  </button>
                  
                  {showModelDropdown && (
                    <div className="absolute top-full mt-1 left-0 z-[300] min-w-full max-h-[300px] overflow-y-auto rounded-2xl border border-gray-200 bg-white backdrop-blur-xl shadow-lg">
                      {availableModels.map((model) => (
                          <button
                            key={model.id}
                            onClick={() => handleModelChange(model.id)}
                            className={`w-full px-3 py-2 text-left first:rounded-t-2xl last:rounded-b-2xl transition-colors ${
                              selectedModel === model.id 
                                ? 'bg-gray-100 text-black font-semibold' 
                                : 'text-gray-800 hover:text-black hover:bg-gray-100 '
                            }`}
                          >
                            <span className="text-sm font-medium">{model.name}</span>
                          </button>
                        ))}
                    </div>
                  )}
                </div>
                
                {/* Send Button */}
                <div className="ml-auto flex items-center gap-1">
                  <button
                    type="submit"
                    disabled={(!prompt.trim() && uploadedImages.length === 0) || isCreatingProject}
                    className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-900 text-white transition-opacity duration-150 ease-out disabled:cursor-not-allowed disabled:opacity-50 hover:scale-110"
                  >
                    {isCreatingProject ? (
                      <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 -960 960 960" className="shrink-0" fill="currentColor">
                        <path d="M442.39-616.87 309.78-487.26q-11.82 11.83-27.78 11.33t-27.78-12.33q-11.83-11.83-11.83-27.78 0-15.96 11.83-27.79l198.43-199q11.83-11.82 28.35-11.82t28.35 11.82l198.43 199q11.83 11.83 11.83 27.79 0 15.95-11.83 27.78-11.82 11.83-27.78 11.83t-27.78-11.83L521.61-618.87v348.83q0 16.95-11.33 28.28-11.32 11.33-28.28 11.33t-28.28-11.33q-11.33-11.33-11.33-28.28z"/>
                      </svg>
                    )}
                  </button>
                </div>
              </div>
            </form>
            
            {/* Example Cards */}
            <div className="flex flex-wrap gap-2 justify-center mt-8">
              {[
                { 
                  text: 'Church Website',
                  prompt: 'Design and build a modern, mobile-friendly church website that clearly communicates the church’s mission while warmly welcoming both members and first-time visitors. The site should prioritize intuitive navigation, fast loading, and responsive design, with clear access to service times, sermons, ministries, events, and online giving. Use clean typography, uplifting visuals, and Scripture-inspired language to create trust and clarity, while ensuring accessibility for all ages and abilities. The architecture should be easy to maintain and scalable, allowing future integration with livestreaming, membership tools, and digital discipleship resources.'
                },
                { 
                  text: 'Church Membership Platform',
                  prompt: 'Design and build a secure, scalable church membership system that supports both pastoral care and administrative efficiency. The system should manage member profiles, families, and spiritual milestones (such as baptism, membership status, and ministry involvement), while providing role-based access for pastors, staff, and volunteers. It should include tools for communication (email/SMS), attendance tracking, small group management, and prayer or care notes, with a strong emphasis on data privacy, simplicity, and ease of use for non-technical users. The architecture should allow future expansion—such as integration with giving, events, and learning resources—while remaining faithful to the church’s mission of discipleship, community, and stewardship.'
                },
                { 
                  text: 'Gospel Resources App',
                  prompt: 'Design and build a Gospel resources app that faithfully presents biblical truth while making sound teaching easily accessible to believers at every stage of faith. The app should organize resources such as sermons, Bible studies, articles, devotionals, and multimedia content by Scripture, theme, and spiritual maturity, with powerful search and cross-referencing. Prioritize clarity, theological integrity, and reverence, while offering a clean, distraction-free user experience across web and mobile. The system should support content curation, offline access, multilingual expansion, and future integration with community features, helping users grow in their understanding of the Gospel and apply it to daily life.'
                },
                { 
                  text: 'Devotional App',
                  prompt: 'Design and build a devotional app that helps users cultivate a consistent, Christ-centered daily rhythm of Scripture reading, reflection, and prayer. The app should deliver thoughtfully curated devotionals organized by date, theme, and spiritual focus, with features such as reading reminders, journaling, verse highlighting, and progress tracking. Emphasize a calm, reverent, and distraction-free experience with offline access and gentle notifications, while ensuring theological faithfulness and accessibility for users of all ages. The architecture should support future growth, including multilingual devotionals, audio readings, and personalization, guiding users toward deeper spiritual formation and daily obedience to God’s Word.'
                },
                { 
                  text: 'Christian Network App',
                  prompt: 'Design and build a Christian network app that fosters authentic fellowship, encouragement, and spiritual growth rooted in biblical values. The app should enable believers to create profiles, connect with others, join groups or churches, share testimonies and prayer requests, and engage in Scripture-centered discussions within a safe, moderated environment. Prioritize love, respect, and accountability through thoughtful community guidelines, privacy controls, and pastoral or leader roles. The platform should be simple, welcoming, and scalable, with room to grow into features like events, messaging, resource sharing, and discipleship pathways—supporting believers in living out their faith together in everyday life.'
                }
              ].map((example) => (
                <button
                  key={example.text}
                  onClick={() => setPrompt(example.prompt)}
                  disabled={isCreatingProject}
                  className="px-4 py-2 text-sm font-medium text-gray-500 bg-transparent border border-[#DE7356]/10 rounded-full hover:bg-gray-50 hover:border-[#DE7356]/15 hover:text-gray-700 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {example.text}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Global Settings Modal */}
      <GlobalSettings
        isOpen={showGlobalSettings}
        onClose={() => setShowGlobalSettings(false)}
      />

      {/* Resource Management Modal */}
      <ResourceManagementModal
        isOpen={showResourceManagement}
        onClose={() => setShowResourceManagement(false)}
      />

      {/* Delete Project Modal */}
      {deleteModal.isOpen && deleteModal.project && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            style={{
              backgroundColor: 'white',
              borderRadius: '0.5rem',
              padding: '1.5rem',
              maxWidth: '28rem',
              width: '100%',
              margin: '0 1rem',
              border: '1px solid rgb(229 231 235)'
            }}
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
                <svg className="w-5 h-5 text-red-600 " fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900 ">Delete Project</h3>
                <p className="text-sm text-gray-500 ">This action cannot be undone</p>
              </div>
            </div>
            
            <p className="text-gray-700 mb-6">
              Are you sure you want to delete <strong>&quot;{deleteModal.project.name}&quot;</strong>? 
              This will permanently delete all project files and chat history.
            </p>
            
            <div className="flex gap-3 justify-end">
              <button
                onClick={closeDeleteModal}
                disabled={isDeleting}
                className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={deleteProject}
                disabled={isDeleting}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {isDeleting ? (
                  <>
                    <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Deleting...
                  </>
                ) : (
                  'Delete Project'
                )}
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Toast Messages */}
      {toast && (
        <div className="fixed bottom-4 right-4 z-50">
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 50, scale: 0.9 }}
          >
            <div className={`px-6 py-4 rounded-lg shadow-lg border flex items-center gap-3 max-w-sm backdrop-blur-lg ${
              toast.type === 'success'
                ? 'bg-green-500/20 border-green-500/30 text-green-400'
                : 'bg-red-500/20 border-red-500/30 text-red-400'
            }`}>
              {toast.type === 'success' ? (
                <svg className="w-5 h-5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
              ) : (
                <svg className="w-5 h-5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
              )}
              <p className="text-sm font-medium">{toast.message}</p>
            </div>
          </motion.div>
        </div>
      )}
      
      {/* Create Project Modal */}
      <CreateProjectModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={onCreated}
        onOpenGlobalSettings={() => {
          setShowCreate(false);
          setShowGlobalSettings(true);
        }}
      />
      </div>
    </div>
  );
}

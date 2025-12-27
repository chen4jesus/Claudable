"use client";
import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence } from 'framer-motion';
import { MotionDiv, MotionP } from '@/lib/motion';
import { getModelDefinitionsForCli, getDefaultModelForCli, normalizeModelId } from '@/lib/constants/cliModels';
import { PROJECT_TYPE_OPTIONS, type ProjectType } from '@/lib/constants/projectTypes';
import { generateProjectId, validateProjectName } from '@/lib/utils';
import { fetchCliStatusSnapshot, createCliStatusFallback } from '@/hooks/useCLI';
import type { CLIStatus } from '@/types/cli';

import type { CreateProjectCLIOption, GlobalSettings } from '@/types/client';

type CLIOption = CreateProjectCLIOption;

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? '';

const DEFAULT_MODEL_ID = getDefaultModelForCli('claude');

const sanitizeModel = (cli: string, model?: string | null) => normalizeModelId(cli, model);

const CLI_OPTIONS: CLIOption[] = [
  {
    id: 'claude',
    name: 'Claude Code',
    icon: '🤖',
    description: 'Anthropic Claude with advanced reasoning',
    color: 'from-orange-500 to-red-600',
    downloadUrl: 'https://github.com/anthropics/claude-code',
    installCommand: 'npm install -g @anthropic-ai/claude-code',
    models: getModelDefinitionsForCli('claude').map(({ id, name, description, supportsImages }) => ({
      id,
      name,
      description,
      supportsImages,
    })),
    features: ['Advanced reasoning', 'Code generation', '1M context window'],
  },
  {
    id: 'codex',
    name: 'Codex CLI',
    icon: '🧠',
    description: 'OpenAI Codex agent with GPT-5 support',
    color: 'from-slate-900 to-gray-700',
    downloadUrl: 'https://github.com/openai/codex',
    installCommand: 'npm install -g @openai/codex',
    models: getModelDefinitionsForCli('codex').map(({ id, name, description, supportsImages }) => ({
      id,
      name,
      description,
      supportsImages,
    })),
    features: ['Autonomous apply_patch', 'OpenAI GPT-5 access', 'Web search integration'],
  },
  {
    id: 'cursor',
    name: 'Cursor Agent',
    icon: '🖱️',
    description: 'Cursor CLI with multi-model routing and session resume',
    color: 'from-slate-500 to-gray-600',
    downloadUrl: 'https://docs.cursor.com/en/cli/overview',
    installCommand: 'curl https://cursor.com/install -fsS | bash',
    models: getModelDefinitionsForCli('cursor').map(({ id, name, description, supportsImages }) => ({
      id,
      name,
      description,
      supportsImages,
    })),
    features: ['Autonomous workflow', 'Multi-model router', 'Session resume support'],
  },
  {
    id: 'qwen',
    name: 'Qwen Coder',
    icon: '🛠️',
    description: 'Alibaba Qwen Code CLI with sandboxed tooling',
    color: 'from-emerald-500 to-teal-600',
    downloadUrl: 'https://github.com/QwenLM/qwen-code',
    installCommand: 'npm install -g @qwen-code/qwen-code',
    models: getModelDefinitionsForCli('qwen').map(({ id, name, description, supportsImages }) => ({
      id,
      name,
      description,
      supportsImages,
    })),
    features: ['Edit/write tools', 'Sandbox approval modes', 'Great for open-source workflows'],
  },
  {
    id: 'glm',
    name: 'GLM CLI',
    icon: '🌐',
    description: 'Zhipu GLM agent running via Claude Code runtime',
    color: 'from-blue-500 to-indigo-600',
    downloadUrl: 'https://docs.z.ai/devpack/tool/claude',
    installCommand: 'zai devpack install claude',
    models: getModelDefinitionsForCli('glm').map(({ id, name, description, supportsImages }) => ({
      id,
      name,
      description,
      supportsImages,
    })),
    features: ['Claude-compatible runtime', 'GLM 4.6 reasoning', 'Text-only mode'],
  },
  {
    id: 'gemini',
    name: 'Gemini CLI',
    icon: '💎',
    description: 'Google Gemini AI coding assistant with advanced reasoning',
    color: 'from-blue-400 to-purple-600',
    downloadUrl: 'https://github.com/google-gemini/gemini-cli',
    installCommand: 'npm install -g @google/gemini-cli',
    models: getModelDefinitionsForCli('gemini').map(({ id, name, description, supportsImages }) => ({
      id,
      name,
      description,
      supportsImages,
    })),
    features: ['Autonomous agent', 'Multi-modal support', 'Code generation'],
  },
];


interface CreateProjectModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  onOpenGlobalSettings?: () => void;
  initialCLI?: string;
  initialModel?: string;
}

export default function CreateProjectModal({ 
  open, 
  onClose, 
  onCreated, 
  onOpenGlobalSettings,
  initialCLI,
  initialModel
}: CreateProjectModalProps) {
  const [projectName, setProjectName] = useState('');
  const [prompt, setPrompt] = useState('');
  const [selectedCLI, setSelectedCLI] = useState<string>('claude');
  const [selectedModel, setSelectedModel] = useState<string>(DEFAULT_MODEL_ID);
  // Fallback is removed but kept for backward compatibility
  const [fallbackEnabled, setFallbackEnabled] = useState(false);
  const [useDefaultSettings, setUseDefaultSettings] = useState(true);
  const [loading, setLoading] = useState(false);
  const [initializationStep, setInitializationStep] = useState('');
  const [showInitialization, setShowInitialization] = useState(false);
  const [initializingProjectId, setInitializingProjectId] = useState<string | null>(null);
  const [globalSettings, setGlobalSettings] = useState<GlobalSettings | null>(null);
  const [enabledCLIs, setEnabledCLIs] = useState<CLIOption[]>([]);
  const [cliStatus, setCLIStatus] = useState<CLIStatus>(() => createCliStatusFallback());
  const [imageUrl, setImageUrl] = useState('');
  const [gitRepoUrl, setGitRepoUrl] = useState('');
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [imageError, setImageError] = useState('');
  const [showImageInput, setShowImageInput] = useState(false);
  const [showWebsiteInput, setShowWebsiteInput] = useState(false);
  const [showCLIDropdown, setShowCLIDropdown] = useState(false);
  const [showModelDropdown, setShowModelDropdown] = useState(false);
  const [selectedProjectType, setSelectedProjectType] = useState<ProjectType>('nextjs');
  const [showProjectTypeDropdown, setShowProjectTypeDropdown] = useState(false);
  const [userGroups, setUserGroups] = useState<{ id: string; name: string }[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [showGroupDropdown, setShowGroupDropdown] = useState(false);
  const [currentUser, setCurrentUser] = useState<{ id: string; role: string } | null>(null);
  const router = useRouter();
  
  // Ref for poll interval cleanup
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  
  // Track if user has manually selected a type to avoid auto-switching
  const hasManuallySelectedType = useRef(false);

  // Smart Project Type Detection
  useEffect(() => {
    // If user has manually selected a type, don't override it
    if (hasManuallySelectedType.current) return;

    const lowerPrompt = prompt.toLowerCase();
    
    // Flask / Python
    if (lowerPrompt.includes('flask') || lowerPrompt.includes('python') || lowerPrompt.includes('pip ')) {
      if (selectedProjectType !== 'flask') setSelectedProjectType('flask');
      return;
    }

    // Vue
    if (lowerPrompt.includes('vue')) {
      if (selectedProjectType !== 'vue') setSelectedProjectType('vue');
      return;
    }

    // Static HTML
    if (lowerPrompt.includes('static html') || lowerPrompt.includes('plain html') || lowerPrompt.includes('vanilla js') || lowerPrompt.includes('no framework')) {
      if (selectedProjectType !== 'static-html') setSelectedProjectType('static-html');
      return;
    }

    // React (without Next.js context)
    // Be careful here as Next.js IS React. Only switch if specific React emphasis or Vite mention.
    if ((lowerPrompt.includes('react') && !lowerPrompt.includes('next')) || lowerPrompt.includes('vite') || lowerPrompt.includes('create-react-app')) {
      if (selectedProjectType !== 'react') setSelectedProjectType('react');
      return;
    }

    // Default back to Next.js if no specific keywords and current is something else derived? 
    // Actually, stick to Next.js as default.
  }, [prompt, selectedProjectType]);

  // Reset manual selection tracking when modal opens
  useEffect(() => {
    if (open) {
      hasManuallySelectedType.current = false;
    }
  }, [open]);

  const loadGlobalSettings = useCallback(async () => {
    try {
      const [settingsResponse, cliStatuses] = await Promise.all([
        fetch(`${API_BASE}/api/settings/global`),
        fetchCliStatusSnapshot(),
      ]);

      setCLIStatus(cliStatuses);

      let settings: GlobalSettings | null = null;
      if (settingsResponse.ok) {
        settings = await settingsResponse.json();
        if (settings?.cli_settings) {
          for (const [cli, config] of Object.entries(settings.cli_settings)) {
            if (config && typeof config === 'object' && 'model' in config && config.model) {
              config.model = sanitizeModel(cli, config.model as string);
            }
          }
        }
        setGlobalSettings(settings);
      }

      if (settings) {
        const enabled = CLI_OPTIONS.filter((cli) => {
          const isEnabled = settings.cli_settings?.[cli.id]?.enabled !== false;
          const isInstalled = cliStatuses[cli.id]?.installed !== false;
          const isAvailable = cli.enabled !== false;
          return isEnabled && isInstalled && isAvailable;
        });

        const effectiveCLIs = enabled.length > 0 ? enabled : CLI_OPTIONS.filter((cli) => cli.enabled !== false);
        setEnabledCLIs(effectiveCLIs);

        const defaultCLI = initialCLI || settings.default_cli || 'claude';
        const preferredCLI =
          effectiveCLIs.find((cli) => cli.id === defaultCLI)?.id ?? effectiveCLIs[0]?.id ?? 'claude';
        setSelectedCLI(preferredCLI);
        setFallbackEnabled(settings.fallback_enabled ?? true);

        const preferredModelSetting = initialModel || settings.cli_settings?.[preferredCLI]?.model;
        if (preferredModelSetting) {
          setSelectedModel(sanitizeModel(preferredCLI, preferredModelSetting as string));
        } else {
          const fallbackModel =
            effectiveCLIs.find((cli) => cli.id === preferredCLI)?.models[0]?.id ?? DEFAULT_MODEL_ID;
          setSelectedModel(sanitizeModel(preferredCLI, fallbackModel));
        }

        // If user provided initial settings, disable "Default Settings" toggle to make it clear what's happening
        if (initialCLI || initialModel) {
          setUseDefaultSettings(false);
        }
      } else {
        const available = CLI_OPTIONS.filter(
          (cli) => cliStatuses[cli.id]?.installed !== false && cli.enabled !== false
        );
        const effectiveCLIs = available.length > 0 ? available : CLI_OPTIONS.filter((cli) => cli.enabled !== false);
        setEnabledCLIs(effectiveCLIs);

        const fallbackCLI = initialCLI || effectiveCLIs[0]?.id || 'claude';
        setSelectedCLI(fallbackCLI);
        const fallbackModel = initialModel || effectiveCLIs[0]?.models[0]?.id || DEFAULT_MODEL_ID;
        setSelectedModel(sanitizeModel(fallbackCLI, fallbackModel));
        setFallbackEnabled(true);
        if (initialCLI || initialModel) {
          setUseDefaultSettings(false);
        }
      }
    } catch (error) {
      console.error('Failed to load global settings:', error);
      setCLIStatus(createCliStatusFallback());
      const available = CLI_OPTIONS.filter((cli) => cli.enabled !== false);
      setEnabledCLIs(available);
      const fallbackCLI = initialCLI || available[0]?.id || 'claude';
      setSelectedCLI(fallbackCLI);
      const fallbackModel = initialModel || available[0]?.models[0]?.id || DEFAULT_MODEL_ID;
      setSelectedModel(sanitizeModel(fallbackCLI, fallbackModel));
      setFallbackEnabled(true);
      if (initialCLI || initialModel) {
        setUseDefaultSettings(false);
      }
    }
  }, [initialCLI, initialModel]);

  // Load global settings, enabled CLIs, and groups when modal opens
  useEffect(() => {
    if (open) {
      loadGlobalSettings();
      fetchUserGroups();
    }
  }, [open, loadGlobalSettings]);

  const fetchUserGroups = async () => {
    try {
      // First get current user to check if admin
      const meRes = await fetch('/api/auth/me');
      const meData = await meRes.json();
      if (!meRes.ok) return;

      setCurrentUser(meData.user);

      // If admin, fetch all groups. If user, fetch their groups.
      const groupsUrl = meData.user.role === 'admin' 
        ? '/api/admin/groups' 
        : '/api/auth/profile'; // Assuming profile returns user's groups or we need a new endpoint
      
      // Actually, I created /api/admin/users but that's admin only.
      // Let's check how a regular user gets their groups.
      // I'll create a new endpoint /api/users/groups or use /api/auth/me if I update it.
      // For now, I'll use /api/admin/groups if admin, otherwise I'll need to fetch user's groups.
      
      const res = await fetch(meData.user.role === 'admin' ? '/api/admin/groups' : '/api/projects/groups');
      const data = await res.json();
      if (data.success) {
        setUserGroups(data.data);
        // Default to Public (null) rather than the first group
        setSelectedGroupId(null);
      }
    } catch (err) {
      console.error('Failed to fetch groups:', err);
    }
  };

  const selectedCLIOption = enabledCLIs.find(cli => cli.id === selectedCLI);
  const selectedModelOption = selectedCLIOption?.models.find(model => model.id === selectedModel);

  // Cleanup polling interval on unmount
  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
  }, []);

  // WebSocket connection for project initialization
  const connectToProjectWebSocket = (projectId: string) => {
    let reconnectAttempts = 0;
    const maxReconnectAttempts = 5;
    let reconnectTimeout: NodeJS.Timeout | null = null;
    let socket: WebSocket | null = null;

    const resolveWebSocketUrl = () => {
      const base = process.env.NEXT_PUBLIC_WS_BASE?.trim() ?? '';
      const endpoint = `/api/ws/${projectId}`;
      if (base.length > 0) {
        return `${base.replace(/\/+$/, '')}${endpoint}`;
      }
      if (typeof window !== 'undefined') {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        return `${protocol}//${window.location.host}${endpoint}`;
      }
      throw new Error('Unable to resolve WebSocket URL');
    };

    const connect = async () => {
      try {
        // Pre-initialization fetch to "boot" the WebSocket server on the backend if needed
        const httpUrl = resolveWebSocketUrl().replace(/^ws/, 'http');
        await fetch(httpUrl).catch(() => {});
        
        socket = new WebSocket(resolveWebSocketUrl());
      } catch (error) {
        console.error('Failed to initialize project WebSocket:', error);
        socket = null;
        return;
      }

      socket.onopen = () => {
        reconnectAttempts = 0;
      };

      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          if (data.type === 'project_status') {
            const { status, message } = data.data || data;
            console.debug('📊 Project status received:', status, message);

            if (message) {
              setInitializationStep(message);
            }

            if (status === 'active' || status === 'idle') {
              setTimeout(() => {
                socket?.close();
                handleInitializationComplete(projectId);
              }, 1000);
            } else if (status === 'failed' || status === 'error') {
              setInitializationStep('Project initialization failed');
              setTimeout(() => {
                socket?.close();
                setShowInitialization(false);
                setInitializingProjectId(null);
              }, 3000);
            }
          }
        } catch (error) {
          console.error('Failed to parse WebSocket message:', error);
        }
      };

      socket.onclose = (event) => {
        if (event.code !== 1000 && reconnectAttempts < maxReconnectAttempts) {
          reconnectAttempts += 1;
          const delay = Math.min(1000 * Math.pow(2, reconnectAttempts - 1), 10000);
          console.debug(`🔄 Attempting to reconnect in ${delay}ms (attempt ${reconnectAttempts}/${maxReconnectAttempts})`);
          reconnectTimeout = setTimeout(connect, delay);
        } else if (reconnectAttempts >= maxReconnectAttempts) {
          console.error('❌ Max reconnection attempts reached. Please refresh the page.');
          setInitializationStep('Connection lost. Please refresh the page.');
        }
      };

      socket.onerror = (error) => {
        console.error('❌ Initialization WebSocket error:', error);
      };
    };

    connect();

    return () => {
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
      }
      if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
        socket.close(1000, 'Component unmounting');
      }
    };
  };

  // Handle successful initialization completion
  const handleInitializationComplete = (projectId: string) => {
    // Store the initial prompt before resetting
    const initialPrompt = prompt;
    
    // Reset form
    setProjectName('');
    setPrompt('');
    setImageUrl('');
    setGitRepoUrl('');
    setWebsiteUrl('');
    setShowImageInput(false);
    setShowWebsiteInput(false);
    setUseDefaultSettings(true);
    setImageError('');
    setShowInitialization(false);
    setInitializingProjectId(null);
    
    // Reset to global defaults or fallback
    if (globalSettings) {
      setSelectedCLI(globalSettings.default_cli || 'claude');
      setFallbackEnabled(globalSettings.fallback_enabled ?? true);
      const cliSettings = globalSettings.cli_settings?.[globalSettings.default_cli || 'claude'];
      setSelectedModel(sanitizeModel(globalSettings.default_cli || 'claude', cliSettings?.model));
    } else {
      setSelectedCLI('claude');
      setSelectedModel(DEFAULT_MODEL_ID);
      setFallbackEnabled(true);
    }
    setSelectedProjectType('nextjs');
    hasManuallySelectedType.current = false;
    
    // Close modal and navigate to chat with initial prompt
    onClose();
    
    // Construct the URL with initial prompt as a query parameter if it exists
    const chatUrl = initialPrompt 
      ? `/${projectId}/chat?initial_prompt=${encodeURIComponent(initialPrompt)}`
      : `/${projectId}/chat`;
    
    router.push(chatUrl);
  };


  // Check for image compatibility
  useEffect(() => {
    if (imageUrl && selectedModelOption && !selectedModelOption.supportsImages) {
      setImageError(`The selected model "${selectedModelOption.name}" does not support image inputs. Please choose a different model or remove the image.`);
    } else {
      setImageError('');
    }
  }, [imageUrl, selectedModelOption]);

  const handleCLIChange = (cliId: string) => {
    setUseDefaultSettings(false);
    setSelectedCLI(cliId);
    // Auto-select first model for the selected CLI
    const cli = enabledCLIs.find(c => c.id === cliId);
    if (cli?.models.length) {
      setSelectedModel(sanitizeModel(cliId, cli.models[0].id));
    }
    setShowCLIDropdown(false);
  };

  const handleModelChange = (modelId: string) => {
    setUseDefaultSettings(false);
    setSelectedModel(sanitizeModel(selectedCLI, modelId));
    setShowModelDropdown(false);
  };

  async function submit() {
    if (!projectName.trim()) return;
    if (selectedProjectType !== 'git-import' && !prompt.trim()) return;
    
    // Determine CLI and model based on useDefaultSettings
    let finalCLI = selectedCLI;
    let finalModel = selectedModel;
    
    if (useDefaultSettings && globalSettings) {
      finalCLI = globalSettings.default_cli || 'claude';
      const cliSettings = globalSettings.cli_settings?.[finalCLI];
      finalModel = sanitizeModel(finalCLI, cliSettings?.model || selectedModel || DEFAULT_MODEL_ID);
    }
    
    if (!finalCLI || !finalModel) {
      console.error('Missing CLI or model selection:', { finalCLI, finalModel, useDefaultSettings, globalSettings });
      return;
    }
    
    // Check image compatibility before submitting
    if (imageUrl && selectedModelOption && !selectedModelOption.supportsImages) {
      return; // Don't submit if there's an image compatibility error
    }
    
    console.debug('Creating project with:', { finalCLI, finalModel, useDefaultSettings, globalSettings });
    
    const name = projectName.trim() || 'New Project';
    const projectUuid = generateProjectId();
    
    // 1. Show loading spinner immediately
    setLoading(false); // Turn off button loading
    setShowInitialization(true); // Show initialization spinner immediately
    setInitializationStep('Preparing project...');
    setInitializingProjectId(projectUuid);
    
    // 2. Start WebSocket connection
    const wsCleanup = connectToProjectWebSocket(projectUuid);
    
    try {
      const projectData: any = {
        project_id: projectUuid,
        name,
        description: prompt,
        initialPrompt: prompt,
        preferredCli: finalCLI,
        fallbackEnabled,
        selectedModel: finalModel,
        templateType: selectedProjectType,
        groupId: selectedGroupId,
        cli_settings: {
          [finalCLI]: {
            model: finalModel
          }
        }
      };

      if (websiteUrl) {
        projectData.websiteUrl = websiteUrl;
      }
      if (imageUrl) {
        projectData.imageUrl = imageUrl;
      }
      if (selectedProjectType === 'git-import') {
        if (!gitRepoUrl) {
           alert('Please enter a Git repository URL');
           return;
        }
        projectData.gitRepoUrl = gitRepoUrl;
        projectData.initialPrompt = `Importing project from ${gitRepoUrl}. Please analyze the codebase and help me understand and improve it.`;
        projectData.description = `Imported from ${gitRepoUrl}`;
      }
      
      
      console.debug('Sending project data:', JSON.stringify(projectData, null, 2));
      
      // 3. Project creation request
      setInitializationStep('Creating project...');
      
      const apiUrl = `${API_BASE}/api/projects/`;
      const r = await fetch(apiUrl, { 
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' }, 
        body: JSON.stringify(projectData) 
      });
      
      if (!r.ok) {
        const errorText = await r.text();
        setInitializationStep(`Failed to create project: ${errorText}`);
        setTimeout(() => {
          setShowInitialization(false);
          alert(`Error: ${errorText}`);
        }, 2000);
        return;
      }
      
      // 4. On success, wait for real-time progress via WebSocket
      setInitializationStep('Setting up environment...');
      onCreated();
      
      // Add fallback timeout and polling mechanism in case WebSocket doesn't respond
      let pollInterval: NodeJS.Timeout | null = null;
      
      // Start polling project status as a fallback
      pollIntervalRef.current = setInterval(async () => {
        try {
          console.debug('📊 Polling project status for:', projectUuid);
          const response = await fetch(`${API_BASE}/api/projects/${projectUuid}`);
          if (response.ok) {
            const payload = await response.json();
            const project = payload?.data ?? payload;
            console.debug('📊 Project status from polling:', project?.status);
            
            if (project?.status === 'active' || project?.status === 'idle') {
              if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
              pollIntervalRef.current = null;
              setInitializationStep('Project ready! Redirecting...');
              setTimeout(() => {
                handleInitializationComplete(projectUuid);
              }, 1000);
            } else if (project?.status === 'failed' || project?.status === 'error') {
              if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
              pollIntervalRef.current = null;
              setInitializationStep('Project initialization failed');
              setTimeout(() => {
                setShowInitialization(false);
                setInitializingProjectId(null);
              }, 3000);
            }
          }
        } catch (error) {
          console.error('Error polling project status:', error);
        }
      }, 3000); // Poll every 3 seconds
      
      // Ultimate fallback timeout
      setTimeout(() => {
        if (showInitialization && initializingProjectId === projectUuid) {
          console.debug('⏰ Ultimate timeout reached, redirecting to chat page as fallback');
          if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
          pollIntervalRef.current = null;
          setInitializationStep('Project ready! Redirecting...');
          setTimeout(() => {
            handleInitializationComplete(projectUuid);
          }, 1000);
        }
      }, 60000); // 60 second ultimate timeout
      
    } catch (error) {
      console.error('Error creating project:', error);
      setShowInitialization(false);
      setInitializingProjectId(null);
      alert(`An error occurred during execution: ${error}`);
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    }
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      if (useDefaultSettings && globalSettings) {
        submit();
      }
    }
  };

  if (!open) return null;
  
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onKeyDown={handleKeyDown}>
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Modal Content */}
      <div 
        className="relative bg-white rounded-2xl shadow-2xl w-full max-w-3xl mx-auto max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 ">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 ">Create New Project</h1>
            <p className="text-sm text-gray-500 mt-1">
              Describe your project and configure your AI assistant
            </p>
          </div>
          
          <button
            onClick={onClose}
            className="p-2 transition-colors text-gray-400 hover:text-gray-600 "
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </div>

        <div className="p-6">
          {/* Project Name and Description */}
          <div className="space-y-4 mb-6">
            {/* Project Name */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Project Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                placeholder="My awesome project"
                className="w-full px-4 py-3 border border-gray-200 rounded-lg bg-white text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                maxLength={100}
              />
            </div>

          </div>

          {/* Project Description */}
          <div className="text-center mb-6">
            <div className="text-4xl mb-3">✨</div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">
              {selectedProjectType === 'git-import' ? 'Which repository to clone?' : 'What would you like to build?'}
            </h2>
            <p className="text-gray-600 ">
              {selectedProjectType === 'git-import' 
                ? 'Enter the public HTTPS URL of the Git repository' 
                : 'Describe your project idea in detail'}
            </p>
          </div>

          {selectedProjectType === 'git-import' ? (
             <div className="mb-6">
                <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
                  <input
                    type="url"
                    value={gitRepoUrl}
                    onChange={(e) => setGitRepoUrl(e.target.value)}
                    placeholder="https://github.com/username/repo.git"
                    className="w-full px-4 py-3 border border-gray-200 rounded-lg bg-white text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    autoFocus
                  />
                  <p className="text-xs text-gray-500 mt-2">
                    Note: Only public repositories are currently supported. The repo will be cloned into your new project.
                  </p>
                </div>
             </div>
          ) : (
          <div className="flex flex-col">
          <div className="bg-gray-50 rounded-xl p-4 border border-gray-200 mb-4">
            <textarea 
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="I want to build a social media app with user profiles, posts, and real-time chat..."
              className="w-full h-32 border-none outline-none resize-none bg-transparent text-gray-700 placeholder-gray-500 leading-relaxed"
              autoFocus
              maxLength={1000}
            />
            
            {/* Input Actions Row */}
            <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-200 ">
              <div className="flex items-center gap-2">
                {/* Image Upload Button */}
                <button
                  onClick={() => setShowImageInput(!showImageInput)}
                  className={`p-2 rounded-lg transition-colors ${
                    showImageInput || imageUrl
                      ? 'bg-blue-100 text-blue-600 '
                      : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100 '
                  }`}
                  title="Add reference image"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" stroke="currentColor" strokeWidth="2"/>
                    <circle cx="8.5" cy="8.5" r="1.5" stroke="currentColor" strokeWidth="2"/>
                    <polyline points="21,15 16,10 5,21" stroke="currentColor" strokeWidth="2"/>
                  </svg>
                </button>

                {/* Website URL Button */}
                <button
                  onClick={() => setShowWebsiteInput(!showWebsiteInput)}
                  className={`p-2 rounded-lg transition-colors ${
                    showWebsiteInput || websiteUrl
                      ? 'bg-blue-100 text-blue-600 '
                      : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100 '
                  }`}
                  title="Add reference website"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/>
                    <line x1="2" y1="12" x2="22" y2="12" stroke="currentColor" strokeWidth="2"/>
                    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" stroke="currentColor" strokeWidth="2"/>
                  </svg>
                </button>
              </div>

              <span className="text-xs text-gray-500 ">
                {prompt.length}/1000 characters
              </span>
            </div>
          </div>

          {/* Dynamic Input Fields */}
          <AnimatePresence>
            {showImageInput && (
              <MotionDiv
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="mb-4"
              >
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <label className="block text-sm font-medium text-blue-800 mb-2">
                    🖼️ Reference Image URL
                  </label>
                  <input
                    type="url"
                    value={imageUrl}
                    onChange={(e) => setImageUrl(e.target.value)}
                    placeholder="https://example.com/image.jpg"
                    className="w-full px-3 py-2 border border-blue-200 rounded-lg bg-white text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  {imageError && (
                    <div className="mt-2 p-3 bg-red-50 border border-red-200 rounded-lg">
                      <p className="text-sm text-red-600 ">{imageError}</p>
                    </div>
                  )}
                </div>
              </MotionDiv>
            )}

            {showWebsiteInput && (
              <MotionDiv
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="mb-4"
              >
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <label className="block text-sm font-medium text-green-800 mb-2">
                    🌐 Reference Website URL
                  </label>
                  <input
                    type="url"
                    value={websiteUrl}
                    onChange={(e) => setWebsiteUrl(e.target.value)}
                    placeholder="https://example.com"
                    className="w-full px-3 py-2 border border-green-200 rounded-lg bg-white text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                </div>
              </MotionDiv>
            )}
          </AnimatePresence>
          </div>
          )}

          {/* Project Type Selection */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Project Type <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <button
                onClick={() => setShowProjectTypeDropdown(!showProjectTypeDropdown)}
                className="w-full p-3 bg-white border border-gray-200 rounded-lg text-left flex items-center justify-between hover:border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <div className="flex items-center gap-3">
                  <span className="text-lg">
                    {PROJECT_TYPE_OPTIONS.find(t => t.id === selectedProjectType)?.icon || '📁'}
                  </span>
                  <div>
                    <div className="font-medium text-gray-900 ">
                      {PROJECT_TYPE_OPTIONS.find(t => t.id === selectedProjectType)?.name}
                    </div>
                    <div className="text-xs text-gray-500 ">
                      {PROJECT_TYPE_OPTIONS.find(t => t.id === selectedProjectType)?.description}
                    </div>
                  </div>
                </div>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className={`transition-transform ${showProjectTypeDropdown ? 'rotate-180' : ''}`}>
                  <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>

              <AnimatePresence>
                {showProjectTypeDropdown && (
                  <MotionDiv
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-30 overflow-hidden max-h-60 overflow-y-auto"
                  >
                    {PROJECT_TYPE_OPTIONS.map((type) => (
                      <button
                        key={type.id}
                        onClick={() => {
                          setSelectedProjectType(type.id);
                          setShowProjectTypeDropdown(false);
                          hasManuallySelectedType.current = true;
                        }}
                        className={`w-full p-3 text-left hover:bg-gray-50 flex items-center gap-3 border-b border-gray-100 last:border-b-0 ${
                          selectedProjectType === type.id ? 'bg-blue-50' : ''
                        }`}
                      >
                        <span className="text-lg">{type.icon || '📁'}</span>
                        <div className="flex-1">
                          <div className="font-medium text-gray-900 ">{type.name}</div>
                          <div className="text-xs text-gray-500 ">{type.description}</div>
                        </div>
                        {selectedProjectType === type.id && (
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="text-blue-600">
                            <path d="M20 6L9 17L4 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        )}
                      </button>
                    ))}
                  </MotionDiv>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* Group Selection */}
          {userGroups.length > 0 && (
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Project Visibility (Group)
              </label>
              <div className="relative">
                <button
                  onClick={() => setShowGroupDropdown(!showGroupDropdown)}
                  className="w-full p-3 bg-white border border-gray-200 rounded-lg text-left flex items-center justify-between hover:border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-lg">{selectedGroupId ? '👥' : '🌍'}</span>
                    <div>
                      <div className="font-medium text-gray-900">
                        {selectedGroupId 
                          ? (userGroups.find(g => g.id === selectedGroupId)?.name || 'Unnamed Group')
                          : 'Default (Public)'}
                      </div>
                      <div className="text-xs text-gray-500">
                        {selectedGroupId 
                          ? 'Only members of this group will see this project.' 
                          : 'Visible to everyone in the system.'}
                      </div>
                    </div>
                  </div>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className={`transition-transform ${showGroupDropdown ? 'rotate-180' : ''}`}>
                    <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>

                <AnimatePresence>
                  {showGroupDropdown && (
                    <MotionDiv
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-20 overflow-hidden max-h-48 overflow-y-auto"
                    >
                      <button
                        onClick={() => {
                          setSelectedGroupId(null);
                          setShowGroupDropdown(false);
                        }}
                        className={`w-full p-3 text-left hover:bg-gray-50 flex items-center gap-3 border-b border-gray-100 last:border-b-0 ${
                          selectedGroupId === null ? 'bg-blue-50' : ''
                        }`}
                      >
                        <span className="text-lg">🌍</span>
                        <div className="flex-1">
                          <div className="font-medium text-gray-900">Default (Public)</div>
                          <div className="text-xs text-gray-500">Visible to everyone</div>
                        </div>
                        {selectedGroupId === null && (
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="text-blue-600">
                            <path d="M20 6L9 17L4 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        )}
                      </button>
                      {userGroups.map((group) => (
                        <button
                          key={group.id}
                          onClick={() => {
                            setSelectedGroupId(group.id);
                            setShowGroupDropdown(false);
                          }}
                          className={`w-full p-3 text-left hover:bg-gray-50 flex items-center gap-3 border-b border-gray-100 last:border-b-0 ${
                            selectedGroupId === group.id ? 'bg-blue-50' : ''
                          }`}
                        >
                          <span className="text-lg">👥</span>
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-gray-900 truncate">
                              {group.name || 'Unnamed Group'}
                            </div>
                          </div>
                          {selectedGroupId === group.id && (
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="text-blue-600">
                              <path d="M20 6L9 17L4 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          )}
                        </button>
                      ))}
                    </MotionDiv>
                  )}
                </AnimatePresence>
              </div>
            </div>
          )}

          {/* AI Configuration */}
          <div className="space-y-4 mb-6">
            {/* Use Default Settings Toggle */}
            <div className="flex items-start gap-3">
              <button
                onClick={() => setUseDefaultSettings(!useDefaultSettings)}
                className="mt-0.5 flex-shrink-0"
              >
                <div className={`w-5 h-5 border-2 rounded transition-colors ${
                  useDefaultSettings 
                    ? 'bg-gray-900 border-gray-900 ' 
                    : 'border-gray-300 '
                }`}>
                  {useDefaultSettings && (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="text-white ">
                      <path d="M20 6L9 17L4 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  )}
                </div>
              </button>
              <div className="flex-1">
                <label 
                  onClick={() => setUseDefaultSettings(!useDefaultSettings)}
                  className="text-sm font-medium text-gray-900 cursor-pointer"
                >
                  Use default AI settings
                </label>
                <p className="text-xs text-gray-500 mt-1">
                  {globalSettings ? (
                    <>Use {enabledCLIs.find(cli => cli.id === globalSettings.default_cli)?.name || 'default'} AI with your preferred model. Change this in <button 
                      onClick={() => {
                        onClose();
                        onOpenGlobalSettings?.();
                      }}
                      className="text-gray-900 hover:underline"
                    >Global Settings</button>.</>
                  ) : (
                    <>Quick start with Claude AI. Customize AI preferences in <button 
                      onClick={() => {
                        onClose();
                        onOpenGlobalSettings?.();
                      }}
                      className="text-gray-900 hover:underline"
                    >Global Settings</button>.</>
                  )}
                </p>
              </div>
            </div>

            {/* AI Selection Dropdowns */}
            {!useDefaultSettings && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* CLI Selection Dropdown */}
                <div className="relative">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    AI Assistant
                  </label>
                  <div className="relative">
                    <button
                      onClick={() => setShowCLIDropdown(!showCLIDropdown)}
                      className="w-full p-3 bg-white border border-gray-200 rounded-lg text-left flex items-center justify-between hover:border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-lg">{selectedCLIOption?.icon}</span>
                        <div>
                          <div className="font-medium text-gray-900 ">{selectedCLIOption?.name}</div>
                          <div className="text-xs text-gray-500 ">{selectedCLIOption?.description}</div>
                        </div>
                      </div>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className={`transition-transform ${showCLIDropdown ? 'rotate-180' : ''}`}>
                        <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </button>

                    <AnimatePresence>
                      {showCLIDropdown && (
                        <MotionDiv
                          initial={{ opacity: 0, y: -10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -10 }}
                          className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-10 max-h-60 overflow-y-auto"
                        >
                          {enabledCLIs.map((cli) => {
                            const cliStatusInfo = cliStatus?.[cli.id];
                            const isInstalled = cliStatusInfo?.installed ?? true;
                            
                            return (
                              <button
                                key={cli.id}
                                onClick={() => handleCLIChange(cli.id)}
                                className="w-full p-3 text-left hover:bg-gray-50 flex items-center gap-3 border-b border-gray-100 last:border-b-0"
                              >
                                <span className="text-lg">{cli.icon}</span>
                                <div className="flex-1">
                                  <div className="flex items-center gap-2">
                                    <div className="font-medium text-gray-900 ">{cli.name}</div>
                                    {isInstalled ? (
                                      <span className="text-xs bg-green-100 text-green-600 px-2 py-1 rounded-full">
                                        ✓
                                      </span>
                                    ) : (
                                      <span className="text-xs bg-yellow-100 text-yellow-600 px-2 py-1 rounded-full">
                                        !
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-xs text-gray-500 ">{cli.description}</div>
                                </div>
                              </button>
                            );
                          })}
                        </MotionDiv>
                      )}
                    </AnimatePresence>
                  </div>
                </div>

                {/* Model Selection Dropdown */}
                <div className="relative">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Model
                  </label>
                  <div className="relative">
                    <button
                      onClick={() => setShowModelDropdown(!showModelDropdown)}
                      className="w-full p-3 bg-white border border-gray-200 rounded-lg text-left flex items-center justify-between hover:border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <div className="font-medium text-gray-900 ">{selectedModelOption?.name}</div>
                          {selectedModelOption?.supportsImages && (
                            <span className="text-xs bg-green-100 text-green-600 px-2 py-1 rounded-full">
                              📷
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-gray-500 ">{selectedModelOption?.description}</div>
                      </div>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className={`transition-transform ${showModelDropdown ? 'rotate-180' : ''}`}>
                        <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </button>

                    <AnimatePresence>
                      {showModelDropdown && selectedCLIOption && (
                        <MotionDiv
                          initial={{ opacity: 0, y: -10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -10 }}
                          className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-10 max-h-60 overflow-y-auto"
                        >
                          {selectedCLIOption.models.map((model) => (
                            <button
                              key={model.id}
                              onClick={() => handleModelChange(model.id)}
                              className="w-full p-3 text-left hover:bg-gray-50 border-b border-gray-100 last:border-b-0"
                            >
                              <div className="flex items-center gap-2 mb-1">
                                <div className="font-medium text-gray-900 ">{model.name}</div>
                                {model.supportsImages && (
                                  <span className="text-xs bg-green-100 text-green-600 px-2 py-1 rounded-full">
                                    📷
                                  </span>
                                )}
                              </div>
                              <div className="text-xs text-gray-500 ">{model.description}</div>
                            </button>
                          ))}
                        </MotionDiv>
                      )}
                    </AnimatePresence>
                  </div>
                </div>
              </div>
            )}

          </div>

          {/* Footer */}
          <div className="flex justify-end pt-4 border-t border-gray-200 ">
            <button 
               className="bg-gray-900 hover:bg-gray-800 text-white px-8 py-3 rounded-xl font-semibold transition-all duration-200 shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={submit}
              disabled={loading || !projectName.trim() || (selectedProjectType !== 'git-import' && !prompt.trim()) || !!imageError}
            >
              {loading ? 'Creating Project...' : 'Create Project'}
            </button>
          </div>
        </div>
      </div>
      
      {/* Project Initialization Loading Modal */}
      <AnimatePresence>
        {showInitialization && (
          <MotionDiv 
            className="fixed inset-0 z-[60] flex items-center justify-center p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
            
            {/* Modal Content */}
            <MotionDiv 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative bg-black/90 backdrop-blur-md rounded-2xl shadow-2xl p-8 max-w-md mx-auto text-center border border-gray-800"
            >
              {/* Sophisticated Multi-Layer Spinner */}
              <div className="relative mb-10 flex justify-center">
                {/* Outer ring */}
                <MotionDiv
                  className="absolute w-20 h-20 border-2 border-gray-700 rounded-full"
                  animate={{ rotate: 360 }}
                  transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
                />
                
                {/* Middle ring */}
                <MotionDiv
                  className="absolute w-16 h-16 border-2 border-t-white border-r-gray-500 border-b-gray-500 border-l-gray-500 rounded-full"
                  animate={{ rotate: -360 }}
                  transition={{ duration: 2.5, repeat: Infinity, ease: "linear" }}
                />
                
                {/* Inner ring */}
                <MotionDiv
                  className="w-12 h-12 border-2 border-t-gray-300 border-r-gray-600 border-b-gray-600 border-l-gray-600 rounded-full"
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
                />
                
                {/* Center dot */}
                <MotionDiv
                  className="absolute top-1/2 left-1/2 w-2 h-2 bg-white rounded-full transform -translate-x-1/2 -translate-y-1/2"
                  animate={{ 
                    scale: [1, 1.2, 1],
                    opacity: [0.7, 1, 0.7]
                  }}
                  transition={{ duration: 2, repeat: Infinity }}
                />
              </div>
              
              {/* Content */}
              <h3 className="text-xl font-semibold text-white mb-3">
                Setting Up Your Project
              </h3>
              
              <MotionP 
                key={initializationStep}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-gray-300 mb-8"
              >
                {initializationStep || 'Preparing workspace...'}
              </MotionP>
              
              {/* Progress indicator dots */}
              <div className="flex justify-center space-x-2">
                {[0, 1, 2].map((i) => (
                  <MotionDiv
                    key={i}
                    className="w-2 h-2 bg-gray-500 rounded-full"
                    animate={{
                      backgroundColor: ['#6B7280', '#E5E7EB', '#6B7280'],
                      scale: [1, 1.2, 1]
                    }}
                    transition={{
                      duration: 1.5,
                      repeat: Infinity,
                      delay: i * 0.3
                    }}
                  />
                ))}
              </div>
            </MotionDiv>
          </MotionDiv>
        )}
      </AnimatePresence>
    </div>
  );
}

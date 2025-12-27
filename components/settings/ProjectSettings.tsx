/**
 * Project Settings Component (Refactored)
 * Main settings modal with tabs
 */
import React, { useEffect, useMemo, useState } from 'react';
import { FaCog, FaRobot, FaLock, FaPlug } from 'react-icons/fa';
import { Database } from 'lucide-react';
import { SettingsModal } from './SettingsModal';
import { GeneralSettings } from './GeneralSettings';
import { AIAssistantSettings } from './AIAssistantSettings';
import { EnvironmentSettings } from './EnvironmentSettings';
import { ServiceSettings } from './ServiceSettings';
import GlobalSettings from './GlobalSettings';
import { TerraformSettings } from './TerraformSettings';

interface ProjectSettingsProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  projectName: string;
  projectDescription?: string | null;
  initialTab?: SettingsTab;
  onProjectUpdated?: (update: { name: string; description?: string | null }) => void;
}

type SettingsTab = 'general' | 'ai-assistant' | 'environment' | 'services' | 'infrastructure';

export function ProjectSettings({
  isOpen,
  onClose,
  projectId,
  projectName,
  projectDescription = '',
  initialTab = 'general',
  onProjectUpdated,
}: ProjectSettingsProps) {
  const isProjectScoped = Boolean(projectId && projectId !== 'global-settings');

  const tabs = useMemo(
    () =>
      [
        {
          id: 'general' as SettingsTab,
          label: 'General',
          icon: <span className="w-4 h-4 inline-flex"><FaCog /></span>,
          hidden: !isProjectScoped,
        },
        {
          id: 'ai-assistant' as SettingsTab,
          label: 'Agent',
          icon: <span className="w-4 h-4 inline-flex"><FaRobot /></span>,
        },
        {
          id: 'environment' as SettingsTab,
          label: 'Envs',
          icon: <span className="w-4 h-4 inline-flex"><FaLock /></span>,
        },
        {
          id: 'services' as SettingsTab,
          label: 'Services',
          icon: <span className="w-4 h-4 inline-flex"><FaPlug /></span>,
        },
        {
          id: 'infrastructure' as SettingsTab,
          label: 'Infrastructure',
          icon: <span className="w-4 h-4 inline-flex"><Database className="w-4 h-4" /></span>,
        },
      ].filter(tab => !('hidden' in tab) || !tab.hidden),
    [isProjectScoped]
  );

  const resolvedInitialTab = useMemo<SettingsTab>(() => {
    const availableTabs = tabs.map(tab => tab.id);
    if (initialTab && availableTabs.includes(initialTab)) {
      return initialTab;
    }
    return tabs[0]?.id ?? 'ai-assistant';
  }, [initialTab, tabs]);

  const [activeTab, setActiveTab] = useState<SettingsTab>(resolvedInitialTab);

  useEffect(() => {
    setActiveTab(resolvedInitialTab);
  }, [resolvedInitialTab]);

  const [showGlobalSettings, setShowGlobalSettings] = useState(false);

  const availableTabs = tabs.length ? tabs : [
    {
      id: 'ai-assistant' as SettingsTab,
      label: 'Agent',
      icon: <span className="w-4 h-4 inline-flex"><FaRobot /></span>,
    },
  ];

  return (
    <>
    <SettingsModal
      isOpen={isOpen}
      onClose={onClose}
      title="Project Settings"
      className={activeTab === 'infrastructure' ? 'max-w-7xl' : 'max-w-4xl'}
      icon={<svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>}
    >
        <div className="flex h-full">
          {/* Sidebar Tabs - Condensed */}
          <div className="w-48 bg-white border-r border-gray-100 shrink-0">
          <nav className="p-2.5 space-y-0.5 mt-1">
            {availableTabs.map(tab => {
              const isActive = activeTab === tab.id;
              const isInfra = tab.id === 'infrastructure';
              
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left transition-all duration-200 relative group ${
                    isActive
                      ? isInfra 
                        ? 'bg-slate-900 text-white shadow-lg border border-slate-800'
                        : 'bg-indigo-50 text-indigo-600 font-bold border border-indigo-100'
                      : 'hover:bg-gray-50 text-slate-500 hover:text-slate-900'
                  }`}
                >
                  <span className={`${isActive ? (isInfra ? 'text-indigo-300' : 'text-indigo-600') : 'text-slate-400'} transition-colors scale-90`}>
                    {tab.icon}
                  </span>
                  <span className={`text-[13px] tracking-tight ${isActive ? 'font-bold' : 'font-medium'}`}>
                    {tab.label}
                  </span>
                  
                  {isActive && isInfra && (
                    <div className="absolute right-2 w-1 h-1 rounded-full bg-emerald-500 animate-pulse" />
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto bg-white ">
          {activeTab === 'general' && isProjectScoped && (
            <GeneralSettings
              projectId={projectId}
              projectName={projectName}
              projectDescription={projectDescription ?? ''}
              onProjectUpdated={onProjectUpdated}
            />
          )}
          
          {activeTab === 'ai-assistant' && (
            <AIAssistantSettings projectId={projectId} />
          )}
          
          {activeTab === 'environment' && (
            <EnvironmentSettings projectId={projectId} />
          )}
          
          {activeTab === 'services' && (
            <ServiceSettings 
              projectId={projectId} 
              onOpenGlobalSettings={() => {
                // Open Global Settings with services tab
                setShowGlobalSettings(true);
                onClose(); // Close current modal
              }}
            />
          )}

          {activeTab === 'infrastructure' && (
            <TerraformSettings projectId={projectId} />
          )}
        </div>
      </div>
    </SettingsModal>
    
    {/* Global Settings Modal */}
    {showGlobalSettings && (
      <GlobalSettings 
        isOpen={showGlobalSettings}
        onClose={() => {
          setShowGlobalSettings(false);
          // Note: We could reopen ProjectSettings here if needed
        }}
        initialTab="services"
      />
    )}
    </>
  );
}

export default ProjectSettings;

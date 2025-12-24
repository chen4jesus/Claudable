"use client";
import { useState, useEffect } from 'react';
import ProjectSettings from '@/components/settings/ProjectSettings';
import { usePathname, useRouter } from 'next/navigation';
import { LogOut } from 'lucide-react';
import Image from 'next/image';

export default function Header() {
  const [globalSettingsOpen, setGlobalSettingsOpen] = useState(false);
  const pathname = usePathname() ?? '';
  const router = useRouter();

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  };

  // Extract project ID from pathname if we're in a project page
  const projectId = pathname.match(/^\/([^\/]+)\/(chat|page)?$/)?.[1];
  const [isAdmin, setIsAdmin] = useState(false);
  const [username, setUsername] = useState('');

  useEffect(() => {
    fetch('/api/auth/me')
      .then(res => res.json())
      .then(data => {
        setIsAdmin(data?.user?.role === 'admin');
        setUsername(data?.user?.username || '');
      })
      .catch(() => {});
  }, []);

  // Hide header on chat pages, main page, and login page
  const isChatPage = pathname.includes('/chat');
  const isMainPage = pathname === '/';
  const isLoginPage = pathname === '/login';

  if (isChatPage || isMainPage || isLoginPage) {
    return null;
  }

  return (
    <header className="bg-white border-b border-gray-200 sticky top-0 z-40">
      <div className="max-w-7xl mx-auto py-4 px-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* Back button - only show on project pages */}
            {projectId && (
              <button
                onClick={() => {
                  window.location.href = '/';
                }}
                className="flex items-center justify-center w-8 h-8 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors"
                title="Back to projects"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M19 12H5M12 19l-7-7 7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            )}
            <div className="h-16">
              <Image
                src="/faithconnect_blue.png"
                alt="FaithConnect"
                width={256}
                height={64}
                className="h-16 w-auto"
                priority
              />
            </div>
            <nav className="flex items-center gap-3" />
          </div>
          <div className="flex items-center gap-3">
            {isAdmin && (
               <button
                  className="flex items-center justify-center w-10 h-10 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all duration-200"
                  onClick={() => router.push('/admin/groups')}
                  title="Admin Settings (Groups)"
                >
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <circle cx="9" cy="7" r="4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M16 3.13a4 4 0 0 1 0 7.75" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
            )}
            {username && (
              <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-50 rounded-full border border-gray-100">
                <div className="w-6 h-6 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-xs font-bold uppercase">
                  {username.charAt(0)}
                </div>
                <span className="text-sm font-medium text-gray-700">{username}</span>
              </div>
            )}
            {/* Global settings */}
            <button
              className="flex items-center justify-center w-10 h-10 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-all duration-200"
              onClick={() => setGlobalSettingsOpen(true)}
              title="Global Settings"
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path
                  d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>

            {/* Logout button */}
            <button
              className="flex items-center justify-center w-10 h-10 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all duration-200"
              onClick={handleLogout}
              title="Logout"
            >
              <LogOut size={20} />
            </button>
          </div>
        </div>
      </div>

      {/* Global Settings Modal */}
      <ProjectSettings
        isOpen={globalSettingsOpen}
        onClose={() => setGlobalSettingsOpen(false)}
        projectId="global-settings"
        projectName="Global Settings"
        initialTab="ai-assistant"
      />
    </header>
  );
}

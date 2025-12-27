import { useState, useEffect } from 'react';
import { Upload, Trash2, RefreshCw, ExternalLink, Globe, Eye, EyeOff } from 'lucide-react';
import { StatusModal, type ModalType } from '../modals/StatusModal';

interface TerraformSettingsProps {
  projectId: string;
}

interface TerraformStatus {
    status: 'idle' | 'running' | 'success' | 'error' | 'not_found';
    message?: string;
    resourceInfo?: {
        id: string;
        region: string;
        status: string;
        rootPass?: string;
    };
}

export function TerraformSettings({ projectId }: TerraformSettingsProps) {
  const [region, setRegion] = useState('us-east');
  const [type, setType] = useState('g6-nanode-1');
  const [domainName, setDomainName] = useState('');
  const [domainEmail, setDomainEmail] = useState('');
  const [cloudflareToken, setCloudflareToken] = useState('');
  const [cloudflareEmail, setCloudflareEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [logs, setLogs] = useState<string>('');
  const [deploymentStatus, setDeploymentStatus] = useState<'idle' | 'deploying' | 'success' | 'error'>('idle');
  const [infraStatus, setInfraStatus] = useState<TerraformStatus | null>(null);

  // Status Modal State
  const [statusModal, setStatusModal] = useState<{
    isOpen: boolean;
    type: ModalType;
    title: string;
    message: string;
    confirmLabel?: string;
    onConfirm?: () => void;
  }>({
    isOpen: false,
    type: 'info',
    title: '',
    message: '',
  });

  const showStatus = (type: ModalType, title: string, message: string, onConfirm?: () => void, confirmLabel?: string) => {
    setStatusModal({ isOpen: true, type, title, message, onConfirm, confirmLabel });
  };

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isPinging, setIsPinging] = useState(false);
  const [isOnline, setIsOnline] = useState<boolean | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  
  // Password confirmation for destructive actions
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [isVerifyingPassword, setIsVerifyingPassword] = useState(false);

  const handlePing = async (ip: string) => {
    setIsPinging(true);
    try {
      const res = await fetch(`/api/terraform/ping?ip=${ip}`);
      const data = await res.json();
      setIsOnline(data.online);
    } catch (err) {
      console.error("Ping failed", err);
      setIsOnline(false);
    } finally {
      setIsPinging(false);
    }
  };

  const fetchStatus = async () => {
      setIsRefreshing(true);
      try {
          const res = await fetch(`/api/terraform/status?projectId=${projectId}`);
          const data = await res.json();
          setInfraStatus(data);
          
          if (data.status === 'success' && data.resourceInfo?.ip) {
            handlePing(data.resourceInfo.ip);
          }
      } catch (err) {
          console.error("Failed to fetch status", err);
      } finally {
          setIsRefreshing(false);
      }
  };

  // Load/Save persisted settings
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const res = await fetch(`/api/projects/${projectId}/services`);
        if (res.ok) {
          const services = await res.json();
          const linode = services.find((s: any) => s.provider === 'linode');
          if (linode?.serviceData) {
            if (linode.serviceData.region) setRegion(linode.serviceData.region);
            if (linode.serviceData.type) setType(linode.serviceData.type);
            if (linode.serviceData.domainName) setDomainName(linode.serviceData.domainName);
            if (linode.serviceData.domainEmail) setDomainEmail(linode.serviceData.domainEmail);
            if (linode.serviceData.cloudflareToken) setCloudflareToken(linode.serviceData.cloudflareToken);
            if (linode.serviceData.cloudflareEmail) setCloudflareEmail(linode.serviceData.cloudflareEmail);
          }
        }
      } catch (err) {
        console.error("Failed to load Linode settings", err);
      }
    };
    loadSettings();
    fetchStatus();
  }, [projectId]);

  const saveSettings = async (newRegion: string, newType: string, newDomain: string, newDomainEmail: string, newCfToken: string, newCfEmail: string) => {
    try {
      await fetch(`/api/projects/${projectId}/services`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          provider: 'linode',
          serviceData: { 
            region: newRegion, 
            type: newType, 
            domainName: newDomain,
            domainEmail: newDomainEmail,
            cloudflareToken: newCfToken,
            cloudflareEmail: newCfEmail
          }
        })
      });
    } catch (err) {
      console.error("Failed to save Linode settings", err);
    }
  };

  const handleDeploy = async () => {
    setIsLoading(true);
    setDeploymentStatus('deploying');
    setLogs('Starting deployment...');

    try {
      // Ensure settings are saved before deploy
      await saveSettings(region, type, domainName, domainEmail, cloudflareToken, cloudflareEmail);

      const response = await fetch('/api/terraform/deploy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          region,
          type,
          domainName,
          domainEmail,
          cloudflareToken,
          cloudflareEmail
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Deployment failed');
      }

      setLogs(data.logs || 'Deployment successful!');
      setDeploymentStatus('success');
      fetchStatus();
    } catch (error: any) {
      setLogs(prev => prev + '\nError: ' + error.message);
      setDeploymentStatus('error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDestroy = async () => {
    showStatus(
      'confirm',
      'Destroy Infrastructure',
      'Are you sure you want to destroy this infrastructure? This action cannot be undone and will stop any running services.',
      () => {
        // Close the status modal and open password modal
        setStatusModal(prev => ({ ...prev, isOpen: false }));
        setConfirmPassword('');
        setPasswordError('');
        setShowPasswordModal(true);
      },
      'Yes, Continue'
    );
  };

  const handlePasswordConfirmDestroy = async () => {
    if (!confirmPassword) {
      setPasswordError('Password is required');
      return;
    }

    setIsVerifyingPassword(true);
    setPasswordError('');

    try {
      // Verify password
      const verifyRes = await fetch('/api/auth/verify-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: confirmPassword })
      });

      if (!verifyRes.ok) {
        const err = await verifyRes.json();
        setPasswordError(err.error || 'Incorrect password');
        setIsVerifyingPassword(false);
        return;
      }

      // Password verified, proceed with destruction
      setShowPasswordModal(false);
      setIsLoading(true);
      setLogs('Password verified. Starting destruction...');
      
      const response = await fetch('/api/terraform/destroy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId })
      });
      
      if (!response.ok) throw new Error("Destroy failed");
      
      setLogs("Infrastructure destroyed successfully.");
      setDeploymentStatus('idle');
      fetchStatus();
      showStatus('success', 'Success', 'Infrastructure destroyed successfully.');
    } catch (error: any) {
      setLogs("Error destroying: " + error.message);
      showStatus('error', 'Error', 'Failed to destroy infrastructure: ' + error.message);
    } finally {
      setIsLoading(false);
      setIsVerifyingPassword(false);
      setConfirmPassword('');
    }
  };

  const hasInfra = infraStatus?.status === 'success' && infraStatus.resourceInfo;

  return (
    <div className="max-w-full px-4 sm:px-10 mx-auto space-y-12 pb-20 animate-in fade-in slide-in-from-bottom-4 duration-700">
      {/* Header Section - More Spacing */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 border-b border-slate-200 pb-10">
        <div className="space-y-2">
          <h2 className="text-4xl font-extrabold text-slate-900 tracking-tight">Infrastructure</h2>
          <p className="text-slate-500 text-lg font-medium">Provision and manage server resources with real-time monitoring.</p>
        </div>
        <button
          onClick={fetchStatus}
          disabled={isRefreshing || isLoading}
          className="group flex items-center gap-3 px-6 py-3 text-sm bg-white text-slate-700 border border-slate-200 rounded-xl hover:bg-slate-50 hover:border-slate-300 font-bold transition-all shadow-sm active:scale-95"
        >
          <RefreshCw className={`w-5 h-5 text-slate-400 group-hover:text-slate-600 ${isRefreshing ? 'animate-spin' : ''}`} />
          Refresh Status
        </button>
      </div>

      {/* Main Dashboard Area - Single Column for Width */}
      {hasInfra ? (
        <div className="space-y-12">
          {/* Status & Connection Card - Full Width */}
          <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-2xl shadow-slate-200/60 overflow-hidden">
            {/* Card Header */}
            <div className="bg-slate-50/80 px-10 py-6 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-white rounded-2xl shadow-sm border border-slate-100">
                  <Globe className="w-6 h-6 text-emerald-500" />
                </div>
                <div>
                  <h3 className="text-xl font-black text-slate-800 tracking-tight">Active Instance</h3>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-0.5">Bare Metal Cloud</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className={`flex items-center gap-2 px-4 py-2 rounded-2xl text-xs font-black uppercase tracking-widest border transition-all ${
                  isOnline === true ? 'bg-emerald-50 text-emerald-600 border-emerald-100 shadow-sm shadow-emerald-100' :
                  isOnline === false ? 'bg-rose-50 text-rose-600 border-rose-100 shadow-sm shadow-rose-100' :
                  'bg-slate-50 text-slate-500 border-slate-100'
                }`}>
                  {isPinging ? <RefreshCw className="w-4 h-4 animate-spin" /> : 
                   <div className={`w-2.5 h-2.5 rounded-full ${isOnline === true ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300'}`} />}
                  {isOnline === true ? 'Online & Healthy' : isOnline === false ? 'Connection Failed' : 'Scanning Status...'}
                </span>
              </div>
            </div>

            {/* Content Grid - More Space */}
            <div className="p-10 grid grid-cols-1 lg:grid-cols-2 gap-16">
              {/* Connection Specs */}
              <div className="space-y-8">
                {/* Fixed Overlap - Switched to Flex for better flow */}
                <div className="flex flex-col sm:flex-row items-start gap-12">
                  <div className="space-y-2 min-w-0">
                    <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest block px-1">IP Address</label>
                    <div className="flex items-center gap-3 group">
                      <code className="text-md font-black text-slate-700 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-100 shadow-inner truncate">
                        {infraStatus.resourceInfo?.ip}
                      </code>
                      <button 
                        onClick={() => handlePing(infraStatus.resourceInfo!.ip)}
                        disabled={isPinging}
                        className="p-2.5 bg-slate-50 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all border border-slate-100 hover:border-indigo-100 shadow-sm active:scale-90 shrink-0"
                        title="Manual Ping"
                      >
                        <RefreshCw className={`w-5 h-5 ${isPinging ? 'animate-spin' : ''}`} />
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2 shrink-0">
                    <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest block px-1">Region</label>
                    <p className="text-md font-bold text-slate-700 flex items-center gap-3 mt-1.5 px-1 bg-white py-1">
                       <span className="capitalize whitespace-nowrap">{infraStatus.resourceInfo?.region.replace('-', ' ')}</span>
                       <span className="text-[10px] font-mono text-slate-400 bg-slate-100 px-2 py-1 rounded-lg uppercase tracking-wider">{infraStatus.resourceInfo?.region}</span>
                    </p>
                  </div>
                </div>

                <div className="space-y-3">
                  <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest block px-1">Live Endpoint</label>
                  {domainName ? (
                    <a 
                      href={`https://${domainName}`} 
                      target="_blank" 
                      rel="noopener noreferrer" 
                      className="group/link inline-flex items-center gap-3 text-indigo-600 hover:text-indigo-700 transition-all bg-indigo-50/50 hover:bg-indigo-50 px-4 py-2.5 rounded-2xl border border-indigo-100/50"
                    >
                      <span className="text-2xl font-black tracking-tight">{domainName}</span>
                      <div className="p-2 bg-white rounded-xl shadow-sm border border-indigo-100 group-hover/link:shadow-md transition-all">
                        <ExternalLink className="w-5 h-5 opacity-70 group-hover/link:opacity-100 group-hover/link:scale-110 transition-all" />
                      </div>
                    </a>
                  ) : (
                    <div className="bg-slate-50 border border-slate-100 rounded-2xl px-5 py-3 inline-block">
                      <span className="text-slate-400 text-sm font-bold italic tracking-tight">Domain configuration pending...</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Security Specs */}
              <div className="bg-slate-50/30 rounded-3xl p-8 border border-slate-100 space-y-6">
                <div>
                  <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest block mb-3 px-1">Access Credentials</label>
                  <div className="space-y-4">
                    <div className="flex flex-col gap-2">
                       <span className="text-xs font-bold text-slate-500 ml-1">SSH Authentication (Root)</span>
                       <div className="flex items-center gap-3">
                        <div className="flex-1 flex items-center gap-3 bg-slate-900 rounded-[1.25rem] px-6 py-4 group/pass border border-slate-800 shadow-2xl">
                          <span className="font-mono text-base font-bold text-indigo-300 flex-1 truncate tracking-wider">
                            {showPassword ? infraStatus.resourceInfo?.rootPass : '••••••••••••••••••••'}
                          </span>
                          <button
                            onClick={() => setShowPassword(!showPassword)}
                            className="p-2 text-slate-400 hover:text-white hover:bg-white/5 rounded-xl transition-all"
                          >
                            {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                          </button>
                        </div>
                        <div className="px-3 py-1.5 rounded-xl text-[10px] font-black bg-white text-emerald-600 border border-emerald-100 shadow-sm uppercase tracking-tighter">RSA Encrypted</div>
                      </div>
                    </div>
                  </div>
                </div>
                
                <div className="pt-4 flex items-center gap-4 text-slate-400 px-2">
                   <div className="h-px bg-slate-200 flex-1" />
                   <span className="text-[10px] uppercase font-black tracking-[0.2em] opacity-50">Cloud Operator Only</span>
                   <div className="h-px bg-slate-200 flex-1" />
                </div>
              </div>
            </div>

            {/* Critical Operations Footer */}
            <div className="px-10 py-6 bg-rose-50/20 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                 <div className="p-2 bg-white rounded-xl border border-rose-100 shadow-sm">
                   <Trash2 className="w-5 h-5 text-rose-500" />
                 </div>
                 <p className="text-xs text-rose-800/60 font-bold max-w-sm leading-relaxed">
                   Destruction is immediate and permanent. Ensure all persistent data or database volumes are backed up.
                 </p>
              </div>
              <button 
                onClick={handleDestroy}
                disabled={isLoading}
                className="w-full sm:w-auto flex items-center justify-center gap-2 px-8 py-3.5 text-xs font-black uppercase tracking-widest text-rose-600 border-2 border-rose-500/20 bg-white hover:bg-rose-600 hover:text-white hover:border-rose-600 rounded-2xl transition-all shadow-sm active:scale-95 disabled:opacity-50"
              >
                Destroy Infrastructure
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
            {/* Configuration Form - Now wider 8-cols */}
            <div className="lg:col-span-12 xl:col-span-8 bg-white rounded-[2.5rem] border border-slate-200 shadow-sm p-10 space-y-10">
              <div className="border-b border-slate-100 pb-8">
                <h3 className="text-2xl font-black text-slate-800 tracking-tight">Orchestration Parameters</h3>
                <p className="text-slate-500 text-base font-medium mt-1">Configure domain resolution and SSL automation for upcoming deployments.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                {/* Domain Group */}
                <div className="space-y-6">
                  <div className="flex items-center gap-3 px-1">
                    <div className="w-8 h-8 rounded-xl bg-indigo-50 flex items-center justify-center border border-indigo-100 shadow-sm">
                      <Globe className="w-4 h-4 text-indigo-500" />
                    </div>
                    <h4 className="text-xs font-black text-slate-800 uppercase tracking-widest">Routing Settings</h4>
                  </div>
                  
                  <div className="space-y-2">
                    <label className="text-sm font-bold text-slate-600 ml-1">Canonical Domain</label>
                    <input
                      type="text"
                      value={domainName}
                      onChange={(e) => setDomainName(e.target.value)}
                      placeholder="try.lumalearn.com"
                      className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-5 py-4 text-slate-700 text-lg focus:bg-white focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none transition-all font-bold placeholder:text-slate-300 shadow-sm"
                      disabled={isLoading}
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-bold text-slate-600 ml-1">Let's Encrypt Email</label>
                    <input
                      type="text"
                      value={domainEmail}
                      onChange={(e) => setDomainEmail(e.target.value)}
                      placeholder="ops@yourdomain.com"
                      className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-5 py-4 text-slate-700 text-lg focus:bg-white focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none transition-all font-bold placeholder:text-slate-300 shadow-sm"
                      disabled={isLoading}
                    />
                  </div>
                </div>

                {/* Cloudflare Group */}
                <div className="space-y-6">
                  <div className="flex items-center gap-3 px-1">
                    <div className="w-8 h-8 rounded-xl bg-orange-50 flex items-center justify-center border border-orange-100 shadow-sm">
                       <div className="w-2.5 h-2.5 rounded-full bg-orange-500" />
                    </div>
                    <h4 className="text-xs font-black text-slate-800 uppercase tracking-widest">Cloudflare Auth</h4>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-bold text-slate-600 ml-1">API Execution Token</label>
                    <div className="relative group/input">
                      <input
                        type="password"
                        value={cloudflareToken}
                        onChange={(e) => setCloudflareToken(e.target.value)}
                        placeholder="••••••••••••••••••••••••••••"
                        className="w-full bg-slate-50 border border-slate-200 rounded-2xl pl-5 pr-12 py-4 text-slate-700 text-lg focus:bg-white focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none transition-all font-bold placeholder:text-slate-300 shadow-sm"
                        disabled={isLoading}
                      />
                      <div className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within/input:text-indigo-400 transition-colors pointer-events-none">
                        <Eye className="w-5 h-5" />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-bold text-slate-600 ml-1">Global Operator Email</label>
                    <input
                      type="text"
                      value={cloudflareEmail}
                      onChange={(e) => setCloudflareEmail(e.target.value)}
                      placeholder="admin@cloudflare.com"
                      className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-5 py-4 text-slate-700 text-lg focus:bg-white focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none transition-all font-bold placeholder:text-slate-300 shadow-sm"
                      disabled={isLoading}
                    />
                  </div>
                </div>
              </div>

              <div className="flex flex-col md:flex-row items-center gap-8 pt-8 border-t border-slate-100">
                <button
                  onClick={async () => {
                    setIsLoading(true);
                    await saveSettings(region, type, domainName, domainEmail, cloudflareToken, cloudflareEmail);
                    setIsLoading(false);
                    showStatus('success', 'Parameters Saved', 'Persistent configuration updated. Changes will take effect on next server sync.');
                  }}
                  disabled={isLoading}
                  className="w-full md:w-auto px-12 py-5 bg-slate-900 text-white rounded-[1.5rem] font-black text-sm uppercase tracking-[0.2em] hover:bg-slate-800 transition-all hover:shadow-2xl hover:shadow-slate-300 active:scale-95 disabled:opacity-50"
                >
                  Apply Settings
                </button>
                <div className="flex items-start gap-4 max-w-lg">
                  <div className="p-2 bg-amber-50 rounded-xl border border-amber-100 shadow-sm shrink-0">
                    <RefreshCw className="w-5 h-5 text-amber-500" />
                  </div>
                  <p className="text-xs font-bold text-slate-400 leading-relaxed italic mt-1">
                    System Note: Domain logic requires a 'targeted deployment' to re-verify SSL certificates and update Caddy proxy headers.
                  </p>
                </div>
              </div>
            </div>

            {/* Terminal Info Card - 4 Cols */}
            <div className="lg:col-span-12 xl:col-span-4 bg-indigo-600 rounded-[2.5rem] p-10 text-white shadow-2xl shadow-indigo-600/30 flex flex-col justify-between group">
               <div className="space-y-6">
                 <h4 className="text-xs font-black uppercase tracking-[0.3em] opacity-80 mb-2">Host Access</h4>
                 <p className="text-lg font-bold leading-snug text-indigo-50">
                   Manage your server directly using standard Unix terminal tools.
                 </p>
                 <div className="space-y-4 pt-4">
                    <div className="bg-indigo-900/40 rounded-2xl p-5 font-mono text-sm leading-relaxed border border-white/10 shadow-inner group-hover:bg-indigo-900/60 transition-all">
                      <span className="text-indigo-300 opacity-60 ml-1 block mb-2 text-[10px] font-black tracking-widest">SSH COMMAND</span>
                      <span className="select-all break-all block">ssh root@{infraStatus.resourceInfo?.ip}</span>
                    </div>
                    <div className="bg-indigo-900/40 rounded-2xl p-5 font-mono text-sm leading-relaxed border border-white/10 shadow-inner group-hover:bg-indigo-900/60 transition-all">
                      <span className="text-indigo-300 opacity-60 ml-1 block mb-2 text-[10px] font-black tracking-widest">PORT POLICY</span>
                      <span className="font-bold">443 (HTTPS), 80 (HTTP), 22 (SSH)</span>
                    </div>
                 </div>
               </div>
            </div>
          </div>

          {/* Deployment Console - Moved to the bottom and widened */}
          <div className="bg-slate-900 rounded-[2.5rem] p-10 shadow-2xl border border-slate-800 space-y-8">
            <div className="flex items-center justify-between px-4">
              <div className="flex items-center gap-4">
                <div className="w-3 h-3 rounded-full bg-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.6)] animate-pulse" />
                <h3 className="text-sm font-black text-slate-400 uppercase tracking-[0.3em]">Deployment Console (STDOUT)</h3>
              </div>
            </div>
            
            <div className="bg-black/40 rounded-[2rem] p-10 font-mono text-xs low-scrollbar overflow-y-auto min-h-[400px] leading-relaxed border border-white/5 shadow-inner">
              {logs ? (
                <div className="space-y-1.5">
                  {logs.split('\n').map((line, i) => (
                    <div key={i} className="group flex gap-6 hover:bg-white/5 px-2 py-0.5 rounded-lg transition-colors">
                      <span className="text-slate-700 select-none font-bold text-right w-8">{i + 1}</span>
                      <span className={
                        line.includes('Error') || line.includes('FATAL') ? 'text-rose-400 font-bold' :
                        line.includes('Success') || line.includes('Complete') ? 'text-emerald-400 font-bold' :
                        line.includes('$') ? 'text-indigo-400 font-black tracking-tight' :
                        'text-slate-300 opacity-90'
                      }>
                        {line}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-full min-h-[300px] text-slate-700 space-y-6 opacity-30">
                  <RefreshCw className="w-16 h-16 opacity-10 animate-[spin_10s_linear_infinite]" />
                  <span className="font-black tracking-[0.4em] uppercase text-xs">Awaiting Infrastructure Events</span>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        /* Empty State / Create Infrastructure - Widened and spaced */
        <div className="max-w-3xl mx-auto py-24 text-center space-y-12 animate-in zoom-in-95 duration-500">
           <div className="relative group">
              <div className="absolute inset-0 bg-indigo-500/20 blur-3xl rounded-full group-hover:scale-125 transition-transform duration-1000" />
              <div className="relative w-32 h-32 bg-white rounded-[3rem] flex items-center justify-center mx-auto shadow-2xl border border-slate-100 group-hover:rotate-12 transition-all duration-500">
                <Globe className="w-16 h-16 text-indigo-500" />
              </div>
           </div>
           
           <div className="space-y-4">
             <h3 className="text-5xl font-black text-slate-900 tracking-tight">Provision Cluster</h3>
             <p className="text-slate-500 text-xl font-medium max-w-xl mx-auto leading-relaxed opacity-80">
               Spin up a high-performance Linode instance and automate your deployment in one click.
             </p>
           </div>

           <div className="bg-white border border-slate-200 rounded-[3.5rem] p-16 shadow-[0_32px_64px_-16px_rgba(0,0,0,0.1)] text-left space-y-12">
             <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                <div className="space-y-4">
                  <label className="text-[11px] font-black uppercase text-slate-400 tracking-[0.3em] block ml-2">Hardware Affinity</label>
                  <div className="relative group">
                    <select
                      value={region}
                      onChange={(e) => {
                        const val = e.target.value;
                        setRegion(val);
                        saveSettings(val, type, domainName, domainEmail, cloudflareToken, cloudflareEmail);
                      }}
                      className="w-full bg-slate-50 border-2 border-slate-100 rounded-3xl px-8 py-5 text-slate-900 text-lg focus:bg-white focus:ring-8 focus:ring-indigo-500/5 focus:border-indigo-500 outline-none transition-all font-black appearance-none cursor-pointer shadow-sm capitalize"
                      disabled={isLoading}
                    >
                      <option value="us-east">Atlantic East (Newark)</option>
                      <option value="us-west">Pacific West (Fremont)</option>
                      <option value="us-central">Central Plains (Dallas)</option>
                      <option value="us-southeast">Southern Hub (Atlanta)</option>
                      <option value="eu-central">Europe Central (Frankfurt)</option>
                      <option value="eu-west">Europe West (London)</option>
                    </select>
                    <div className="absolute right-6 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 group-focus-within:text-indigo-500 transition-colors">
                      <RefreshCw className="w-5 h-5 opacity-40" />
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <label className="text-[11px] font-black uppercase text-slate-400 tracking-[0.3em] block ml-2">Compute Power</label>
                  <div className="relative group">
                    <select
                      value={type}
                      onChange={(e) => {
                        const val = e.target.value;
                        setType(val);
                        saveSettings(region, val, domainName, domainEmail, cloudflareToken, cloudflareEmail);
                      }}
                      className="w-full bg-slate-50 border-2 border-slate-100 rounded-3xl px-8 py-5 text-slate-900 text-lg focus:bg-white focus:ring-8 focus:ring-indigo-500/5 focus:border-indigo-500 outline-none transition-all font-black appearance-none cursor-pointer shadow-sm"
                      disabled={isLoading}
                    >
                      <option value="g6-nanode-1">Nanode (1vCPU / 1GB)</option>
                      <option value="g6-standard-1">Standard (1vCPU / 2GB)</option>
                      <option value="g6-standard-2">Standard (2vCPU / 4GB)</option>
                    </select>
                    <div className="absolute right-6 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 group-focus-within:text-indigo-500 transition-colors">
                       <RefreshCw className="w-5 h-5 opacity-40" />
                    </div>
                  </div>
                </div>
             </div>

             <div className="bg-indigo-50/50 rounded-3xl p-8 border border-indigo-100 flex items-center gap-6">
               <div className="p-4 bg-white rounded-2xl shadow-md border border-indigo-100 ring-4 ring-white/50">
                 <RefreshCw className={`w-8 h-8 text-indigo-500 ${isLoading ? 'animate-spin' : ''}`} />
               </div>
               <div className="space-y-1">
                 <p className="text-lg font-black text-slate-800 tracking-tight">Zero-Touch Provisioning</p>
                 <p className="text-sm font-bold text-indigo-900/40 leading-relaxed italic">
                   Infrastructure automatically mounts Docker, Git, and Caddy SSL proxy.
                 </p>
               </div>
             </div>

             <button
              onClick={handleDeploy}
              disabled={isLoading}
              className={`group relative overflow-hidden flex items-center justify-center gap-4 w-full py-8 px-12 rounded-3xl text-sm font-black uppercase tracking-[0.3em] text-white transition-all shadow-2xl active:scale-[0.98] ${
                isLoading 
                   ? 'bg-indigo-300 cursor-not-allowed shadow-none' 
                   : 'bg-indigo-600 hover:bg-slate-900 shadow-indigo-600/30'
              }`}
            >
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:animate-[shimmer_2s_infinite] pointer-events-none" />
              {isLoading ? (
                <>
                  <RefreshCw className="animate-spin h-6 w-6" />
                  Orchestrating Cluster Infrastructure...
                </>
              ) : (
                <>
                  <Upload className="w-6 h-6 group-hover:scale-125 transition-transform duration-500" />
                  Initiate Secure Provisioning
                </>
              )}
            </button>
           </div>
        </div>
      )}

      {/* Persistence Modal Wrapper */}
      <StatusModal
        isOpen={statusModal.isOpen}
        onClose={() => setStatusModal(prev => ({ ...prev, isOpen: false }))}
        type={statusModal.type}
        title={statusModal.title}
        message={statusModal.message}
        confirmLabel={statusModal.confirmLabel}
        onConfirm={statusModal.onConfirm}
      />

      {/* Password Confirmation Modal */}
      {showPasswordModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setShowPasswordModal(false)} />
          <div className="relative w-full max-w-md bg-white rounded-[2rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300 border border-slate-200">
            <div className="px-8 py-8 border-b border-slate-100 bg-rose-50/30">
              <div className="w-12 h-12 bg-rose-100 rounded-2xl flex items-center justify-center mb-4">
                <Trash2 className="w-6 h-6 text-rose-600" />
              </div>
              <h3 className="text-2xl font-black text-rose-900 leading-none">Confirm Destruction</h3>
              <p className="text-sm text-rose-700/70 font-bold mt-2 leading-relaxed">
                This is a destructive action. All infrastructure and ephemeral data will be lost.
              </p>
            </div>
            
            <div className="p-8 space-y-6">
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest block ml-1">Administrator Password</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => {
                    setConfirmPassword(e.target.value);
                    setPasswordError('');
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handlePasswordConfirmDestroy();
                  }}
                  placeholder="Verify authorization..."
                  className={`w-full bg-slate-50 border rounded-2xl px-5 py-4 font-bold outline-none transition-all placeholder:font-medium placeholder:text-slate-300 ${
                    passwordError ? 'border-rose-500 ring-4 ring-rose-500/10' : 'border-slate-200 focus:bg-white focus:ring-4 focus:ring-slate-900/5 focus:border-slate-900'
                  }`}
                  autoFocus
                  disabled={isVerifyingPassword}
                />
                {passwordError && (
                  <p className="text-xs font-bold text-rose-600 mt-2 px-1 flex items-center gap-1.5">
                    <div className="w-1 h-1 rounded-full bg-rose-600" />
                    {passwordError}
                  </p>
                )}
              </div>
              
              <div className="flex gap-4 pt-2">
                <button
                  onClick={() => {
                    setShowPasswordModal(false);
                    setConfirmPassword('');
                    setPasswordError('');
                  }}
                  disabled={isVerifyingPassword}
                  className="flex-1 px-4 py-4 text-xs font-black uppercase tracking-widest text-slate-500 bg-slate-100 rounded-2xl hover:bg-slate-200 transition-all font-bold"
                >
                  Regret
                </button>
                <button
                  onClick={handlePasswordConfirmDestroy}
                  disabled={isVerifyingPassword || !confirmPassword}
                  className={`flex-1 px-4 py-4 text-xs font-black uppercase tracking-widest text-white rounded-2xl transition-all flex items-center justify-center gap-2 shadow-lg ${
                    isVerifyingPassword || !confirmPassword
                      ? 'bg-rose-300 cursor-not-allowed'
                      : 'bg-rose-600 hover:bg-rose-700 shadow-rose-600/20'
                  }`}
                >
                  {isVerifyingPassword ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    'Destroy'
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

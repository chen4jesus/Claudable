import { useState, useEffect, useRef, useCallback } from 'react';
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
  const logContainerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll logs to bottom
  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs]);

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

  const fetchStatus = useCallback(async () => {
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
  }, [projectId]);

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
  }, [projectId, fetchStatus]);

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
    <div className="max-w-full px-4 mx-auto space-y-4 pb-4 animate-in fade-in slide-in-from-bottom-2 duration-500">
      {/* Header Section - Extreme Density */}
      <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-2.5 mt-1">
        <div className="flex items-center gap-2">
          <Globe className="w-4 h-4 text-indigo-500" />
          <h2 className="text-lg font-black text-slate-800 tracking-tight">Infrastructure</h2>
          <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest hidden sm:inline-block border-l border-slate-100 pl-2">Status & Controls</span>
        </div>
        <button
          onClick={fetchStatus}
          disabled={isRefreshing || isLoading}
          className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] bg-white text-slate-500 border border-slate-200 rounded-md hover:bg-slate-50 font-black transition-all shadow-sm"
        >
          <RefreshCw className={`w-3 h-3 ${isRefreshing ? 'animate-spin' : ''}`} />
          SYNC
        </button>
      </div>

      {/* Main Dashboard Area - Single Column for Width */}
      {hasInfra ? (
        <div className="space-y-4">
          {/* Status & Connection Card - Extreme Density */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            {/* Card Header */}
            <div className="bg-slate-50/30 px-4 py-2 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-1 bg-white rounded border border-slate-100 shadow-sm">
                  <Globe className="w-3.5 h-3.5 text-emerald-500" />
                </div>
                <h3 className="text-sm font-black text-slate-700 tracking-tight uppercase">Active Cluster</h3>
              </div>
              <div className="flex items-center gap-2">
                <span className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all ${
                  isOnline === true ? 'bg-emerald-50 text-emerald-600 border-emerald-100 shadow-sm shadow-emerald-100' :
                  isOnline === false ? 'bg-rose-50 text-rose-600 border-rose-100 shadow-sm shadow-rose-100' :
                  'bg-slate-50 text-slate-500 border-slate-100'
                }`}>
                  {isPinging ? <RefreshCw className="w-3 h-3 animate-spin" /> : 
                   <div className={`w-2 h-2 rounded-full ${isOnline === true ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300'}`} />}
                  {isOnline === true ? 'Online' : isOnline === false ? 'Offline' : 'Scanning...'}
                </span>
              </div>
            </div>

            {/* Content Grid - Extreme Density */}
            <div className="p-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Connection Specs */}
              <div className="space-y-4">
                <div className="flex flex-col sm:flex-row items-center gap-6">
                  <div className="space-y-1 min-w-0">
                    <label className="text-[9px] font-black uppercase text-slate-300 tracking-widest block">IP Address</label>
                    <code className="text-sm font-black text-slate-600 bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-100 truncate block">
                      {infraStatus.resourceInfo?.ip}
                    </code>
                  </div>
                  <div className="space-y-1 shrink-0">
                    <label className="text-[9px] font-black uppercase text-slate-300 tracking-widest block">Region</label>
                    <span className="text-xs font-bold text-slate-600 bg-white border border-slate-100 px-2 py-1 rounded-lg uppercase tracking-tight">
                      {infraStatus.resourceInfo?.region}
                    </span>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[9px] font-black uppercase text-slate-300 tracking-wider block">Endpoint</label>
                  {domainName ? (
                    <a href={`https://${domainName}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-indigo-600 hover:text-indigo-700 font-black text-sm tracking-tight">
                      {domainName}
                      <ExternalLink className="w-3 h-3 opacity-50" />
                    </a>
                  ) : (
                    <span className="text-slate-400 text-[10px] font-bold italic">Unconfigured</span>
                  )}
                </div>
              </div>

              {/* Server Stats */}
              <div className="bg-slate-50/50 rounded-lg p-3 grid grid-cols-3 gap-3 border border-slate-100">
                <div className="space-y-0.5">
                  <span className="text-[8px] font-black text-slate-400 uppercase leading-none">CPU</span>
                  <div className="text-sm font-bold text-slate-700">1 Core</div>
                </div>
                <div className="space-y-0.5 border-x border-slate-100 px-3">
                  <span className="text-[8px] font-black text-slate-400 uppercase leading-none">RAM</span>
                  <div className="text-sm font-bold text-slate-700">2 GB</div>
                </div>
                <div className="space-y-0.5">
                  <span className="text-[8px] font-black text-slate-400 uppercase leading-none">TYPE</span>
                  <div className="text-[10px] font-black text-indigo-500 uppercase truncate">
                    {infraStatus.resourceInfo?.type.split('-')[1]}
                  </div>
                </div>
              </div>
            </div>

            {/* Actions Footer */}
            <div className="px-4 py-2 bg-slate-50/30 border-t border-slate-100 flex items-center justify-between">
              <button onClick={fetchStatus} className="text-[10px] font-black text-slate-400 hover:text-indigo-500 transition-all flex items-center gap-1.5 uppercase">
                <RefreshCw className="w-2.5 h-2.5" />
                Refresh
              </button>
              <div className="flex gap-2">
                <button onClick={() => window.open(`https://manager.linode.com`, '_blank')} className="text-[10px] font-black text-slate-400 hover:text-slate-600 uppercase">Console</button>
                <button onClick={handleDestroy} className="text-[10px] font-black text-rose-500 hover:text-rose-600 uppercase">Destroy</button>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            {/* Configuration Form - Condensed */}
            <div className="lg:col-span-8 bg-white rounded-xl border border-slate-200 p-4 space-y-4">
              <div className="border-b border-slate-50 pb-2 flex items-center justify-between">
                <h3 className="text-xs font-black text-slate-800 uppercase tracking-tight">Orchestration</h3>
                <button
                  onClick={async () => {
                    setIsLoading(true);
                    await saveSettings(region, type, domainName, domainEmail, cloudflareToken, cloudflareEmail);
                    setIsLoading(false);
                    showStatus('success', 'Saved', 'Configuration updated.');
                  }}
                  className="px-3 py-1 bg-slate-900 text-white rounded-md font-black text-[10px] uppercase tracking-widest hover:bg-slate-800 transition-all"
                >
                  Apply
                </button>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <div className="space-y-1">
                    <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-1">Domain</label>
                    <input
                      type="text"
                      value={domainName}
                      onChange={(e) => setDomainName(e.target.value)}
                      placeholder="try.lumalearn.com"
                      className="w-full bg-slate-50 border border-slate-100 rounded-md px-2 py-1 text-xs font-bold outline-none focus:bg-white focus:border-indigo-500 transition-all"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-1">Email</label>
                    <input
                      type="text"
                      value={domainEmail}
                      onChange={(e) => setDomainEmail(e.target.value)}
                      placeholder="ops@yourdomain.com"
                      className="w-full bg-slate-50 border border-slate-100 rounded-md px-2 py-1 text-xs font-bold outline-none focus:bg-white focus:border-indigo-500 transition-all"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="space-y-1">
                    <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-1">CF Token</label>
                    <input
                      type="password"
                      value={cloudflareToken}
                      onChange={(e) => setCloudflareToken(e.target.value)}
                      placeholder="••••••••••••"
                      className="w-full bg-slate-50 border border-slate-100 rounded-md px-2 py-1 text-xs font-bold outline-none focus:bg-white focus:border-indigo-500 transition-all"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-1">CF Email</label>
                    <input
                      type="text"
                      value={cloudflareEmail}
                      onChange={(e) => setCloudflareEmail(e.target.value)}
                      placeholder="admin@cloudflare.com"
                      className="w-full bg-slate-50 border border-slate-100 rounded-md px-2 py-1 text-xs font-bold outline-none focus:bg-white focus:border-indigo-500 transition-all"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Access Info Card - Condensed */}
            <div className="lg:col-span-4 bg-indigo-600 rounded-xl p-4 text-white shadow-lg shadow-indigo-100 flex flex-col justify-between">
               <div className="space-y-3">
                 <h4 className="text-[9px] font-black uppercase tracking-[0.2em] opacity-80">Root Access</h4>
                 <div className="flex flex-col gap-2">
                    <div className="bg-indigo-900/40 rounded-lg p-2 font-mono text-[11px] border border-white/5 relative group/ssh">
                      <span className="text-indigo-300 opacity-60 block text-[8px] font-black mb-1">SSH</span>
                      <code className="select-all block truncate">ssh root@{infraStatus.resourceInfo?.ip}</code>
                    </div>
                    
                    <div className="space-y-1">
                       <label className="text-[8px] font-black uppercase text-indigo-300 tracking-widest ml-1">Password</label>
                       <div className="flex items-center gap-2 bg-indigo-900/40 rounded-lg px-2 py-1.5 border border-white/5">
                        <span className="font-mono text-xs font-bold text-indigo-100 flex-1 truncate">
                          {showPassword ? infraStatus.resourceInfo?.rootPass : '••••••••'}
                        </span>
                        <button onClick={() => setShowPassword(!showPassword)} className="p-1 hover:bg-white/10 rounded-md">
                          {showPassword ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                        </button>
                       </div>
                    </div>
                 </div>
               </div>
            </div>
          </div>

          {/* Log Viewer - Condensed */}
          <div className="bg-slate-900 rounded-xl overflow-hidden border border-slate-800">
            <div className="bg-slate-800/50 px-4 py-2 flex items-center justify-between border-b border-slate-700/50">
              <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                <RefreshCw className="w-2.5 h-2.5 animate-spin text-emerald-500" />
                SYSTEM LOGS
              </p>
            </div>
            <div ref={logContainerRef} className="p-4 h-[250px] overflow-y-auto font-mono text-[11px] leading-tight space-y-0.5 bg-slate-950/50">
              {logs ? logs.split('\n').map((line, i) => (
                <div key={i} className="flex gap-3 text-slate-400 hover:text-slate-300 transition-colors">
                  <span className="text-slate-800 select-none w-4 text-right shrink-0">{(i + 1)}</span>
                  <span className={line.includes('Error') ? 'text-rose-400' : line.includes('Success') ? 'text-emerald-400' : ''}>{line}</span>
                </div>
              )) : (
                <div className="h-full flex items-center justify-center text-slate-800 text-[10px] font-black uppercase tracking-widest opacity-30">No Logs</div>
              )}
            </div>
          </div>
        </div>
      ) : (
        /* Empty State / Create Infrastructure - Ultra Low Profile */
        <div className="mx-auto py-1 text-center space-y-3 animate-in zoom-in-95 duration-500 max-w-xl">
           <div className="space-y-0.5">
             <h3 className="text-lg font-black text-slate-800 tracking-tight">Provision Infrastructure</h3>
             <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest opacity-60">
               Initialize cloud resources for project runtime
             </p>
           </div>

           <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm text-left space-y-5">
             <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[9px] font-black uppercase text-slate-400 tracking-widest ml-1">Hardware Affinity</label>
                  <div className="relative">
                    <select
                      value={region}
                      onChange={(e) => {
                        const val = e.target.value;
                        setRegion(val);
                        saveSettings(val, type, domainName, domainEmail, cloudflareToken, cloudflareEmail);
                      }}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:bg-white focus:ring-2 focus:ring-indigo-500/5 focus:border-indigo-500 outline-none transition-all font-bold appearance-none cursor-pointer shadow-sm capitalize"
                      disabled={isLoading}
                    >
                      <option value="us-east">Atlantic East (Newark)</option>
                      <option value="us-west">Pacific West (Fremont)</option>
                      <option value="us-central">Central Plains (Dallas)</option>
                      <option value="us-southeast">Southern Hub (Atlanta)</option>
                      <option value="eu-central">Europe Central (Frankfurt)</option>
                      <option value="eu-west">Europe West (London)</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[9px] font-black uppercase text-slate-400 tracking-widest ml-1">Compute Power</label>
                  <div className="relative">
                    <select
                      value={type}
                      onChange={(e) => {
                        const val = e.target.value;
                        setType(val);
                        saveSettings(region, val, domainName, domainEmail, cloudflareToken, cloudflareEmail);
                      }}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:bg-white focus:ring-2 focus:ring-indigo-500/5 focus:border-indigo-500 outline-none transition-all font-bold appearance-none cursor-pointer shadow-sm"
                      disabled={isLoading}
                    >
                      <option value="g6-nanode-1">Nanode (1vCPU / 1GB)</option>
                      <option value="g6-standard-1">Standard (1vCPU / 2GB)</option>
                      <option value="g6-standard-2">Standard (2vCPU / 4GB)</option>
                    </select>
                  </div>
                </div>
             </div>

             {/* Setup Orchestration Parameters - Extreme Density */}
             <div className="space-y-4 pt-4 border-t border-slate-50">
                <div className="space-y-0.5">
                  <h4 className="text-xs font-black text-slate-800 uppercase tracking-tight">Network Orchestration</h4>
                  <p className="text-slate-400 text-[10px] font-medium leading-none">Automatic SSL & Routing Control</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-3">
                    <div className="space-y-1">
                      <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider ml-1">Canonical Domain</label>
                      <input
                        type="text"
                        value={domainName}
                        onChange={(e) => setDomainName(e.target.value)}
                        placeholder="try.domain.com"
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-700 focus:bg-white focus:ring-2 focus:ring-indigo-500/5 focus:border-indigo-500 outline-none transition-all font-bold placeholder:text-slate-300 shadow-sm"
                        disabled={isLoading}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider ml-1">SSL Email</label>
                      <input
                        type="text"
                        value={domainEmail}
                        onChange={(e) => setDomainEmail(e.target.value)}
                        placeholder="ops@domain.com"
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-700 focus:bg-white focus:ring-2 focus:ring-indigo-500/5 focus:border-indigo-500 outline-none transition-all font-bold placeholder:text-slate-300 shadow-sm"
                        disabled={isLoading}
                      />
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="space-y-1">
                      <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider ml-1">Cloudflare Token</label>
                      <div className="relative">
                        <input
                          type="password"
                          value={cloudflareToken}
                          onChange={(e) => setCloudflareToken(e.target.value)}
                          placeholder="••••••••••••"
                          className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-700 focus:bg-white focus:ring-2 focus:ring-indigo-500/5 focus:border-indigo-500 outline-none transition-all font-bold placeholder:text-slate-300 shadow-sm"
                          disabled={isLoading}
                        />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider ml-1">Operator Email</label>
                      <input
                        type="text"
                        value={cloudflareEmail}
                        onChange={(e) => setCloudflareEmail(e.target.value)}
                        placeholder="admin@cloudflare.com"
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-700 focus:bg-white focus:ring-2 focus:ring-indigo-500/5 focus:border-indigo-500 outline-none transition-all font-bold placeholder:text-slate-300 shadow-sm"
                        disabled={isLoading}
                      />
                    </div>
                  </div>
                </div>
             </div>

             <div className="bg-slate-50/50 rounded-lg p-3 border border-slate-100 flex items-center gap-3">
               <div className="p-1.5 bg-white rounded-md shadow-sm border border-slate-100 shrink-0">
                 <RefreshCw className={`w-3 h-3 text-indigo-400 ${isLoading ? 'animate-spin' : ''}`} />
               </div>
               <p className="text-[10px] font-bold text-slate-400 leading-tight italic">
                 Automated: Docker, Git, and Caddy SSL proxy setup included.
               </p>
             </div>

             <button
              onClick={handleDeploy}
              disabled={isLoading}
              className={`group relative overflow-hidden flex items-center justify-center gap-2 w-full py-3 rounded-xl text-[10px] font-black uppercase tracking-widest text-white transition-all shadow-md active:scale-[0.98] ${
                isLoading 
                   ? 'bg-indigo-300 cursor-not-allowed shadow-none' 
                   : 'bg-indigo-600 hover:bg-slate-900 shadow-indigo-600/10'
              }`}
            >
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent -translate-x-full group-hover:animate-[shimmer_2s_infinite] pointer-events-none" />
              {isLoading ? (
                <>
                   <RefreshCw className="animate-spin h-4 w-4" />
                   INITIALIZING...
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4" />
                  PROVISION INFRASTRUCTURE
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

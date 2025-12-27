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
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-gray-900">Infrastructure Management</h2>
        <button
          onClick={fetchStatus}
          disabled={isRefreshing || isLoading}
          className="flex items-center gap-2 px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 font-medium transition-colors"
        >
          <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          Refresh Status
        </button>
      </div>
      
      {/* Existing Infrastructure Card */}
      {hasInfra && (
          <div className="bg-white border border-green-200 rounded-xl p-6 shadow-sm">
              <div className="flex items-start justify-between">
                  <div>
                      <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                        <Globe className="w-5 h-5 text-green-600"/>
                        Active Infrastructure
                      </h3>
                      <div className="mt-2 space-y-2 text-sm text-gray-600">
                          <p className="flex items-center gap-2">
                            Status: 
                            <span className="font-medium capitalize text-green-700">{infraStatus.resourceInfo?.status}</span>
                            <span className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                              isOnline === true ? 'bg-green-100 text-green-700' : 
                              isOnline === false ? 'bg-red-100 text-red-700' : 
                              'bg-gray-100 text-gray-600'
                            }`}>
                              {isPinging ? <RefreshCw className="w-2.5 h-2.5 animate-spin" /> : null}
                              {isOnline === true ? 'Online' : isOnline === false ? 'Offline' : 'Checking...'}
                            </span>
                          </p>
                          <p>Region: <span className="font-mono">{infraStatus.resourceInfo?.region}</span></p>
                          <p className="flex items-center gap-2">
                              IP Address: 
                              <a href={`http://${infraStatus.resourceInfo?.ip}`} target="_blank" rel="noopener noreferrer" className="font-mono text-blue-600 hover:underline flex items-center gap-1">
                                  {infraStatus.resourceInfo?.ip}
                                  <ExternalLink className="w-3 h-3" />
                              </a>
                              <button 
                                onClick={() => handlePing(infraStatus.resourceInfo!.ip)}
                                disabled={isPinging}
                                className="p-1 hover:bg-gray-100 rounded transition-colors"
                                title="Ping Server"
                              >
                                <RefreshCw className={`w-3 h-3 ${isPinging ? 'animate-spin' : ''}`} />
                              </button>
                          </p>
                          <p className="flex items-center gap-2">
                            Live URL:
                            {domainName ? (
                              <a href={`https://${domainName}`} target="_blank" rel="noopener noreferrer" className="font-mono text-blue-600 hover:underline flex items-center gap-1 font-bold">
                                https://{domainName}
                                <ExternalLink className="w-3 h-3" />
                              </a>
                            ) : (
                              <a href={`http://${infraStatus.resourceInfo?.ip}`} target="_blank" rel="noopener noreferrer" className="font-mono text-blue-600 hover:underline flex items-center gap-1">
                                http://{infraStatus.resourceInfo?.ip}
                                <ExternalLink className="w-3 h-3" />
                                <span className="text-[10px] text-gray-500 font-normal">(no domain configured)</span>
                              </a>
                            )}
                          </p>
                          {infraStatus.resourceInfo?.rootPass && (
                            <div className="flex items-center gap-2">
                              <span>Root Password:</span>
                              <div className="flex items-center gap-1 bg-gray-100 px-1.5 py-0.5 rounded border">
                                <span className="font-mono text-gray-800">
                                  {showPassword ? infraStatus.resourceInfo.rootPass : '••••••••••••••••'}
                                </span>
                                <button
                                  onClick={() => setShowPassword(!showPassword)}
                                  className="p-1 hover:bg-gray-200 rounded-md transition-colors text-gray-500 hover:text-gray-700"
                                  title={showPassword ? "Hide password" : "Show password"}
                                >
                                  {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                                </button>
                              </div>
                              <span className="text-[10px] text-amber-600 font-medium bg-amber-50 px-1 rounded border border-amber-100 uppercase">Secure</span>
                            </div>
                          )}
                      </div>
                  </div>
                  <div className="flex flex-col gap-2">
                       <button 
                        onClick={handleDestroy}
                        disabled={isLoading}
                        className="px-3 py-1.5 text-sm bg-red-50 text-red-700 rounded-lg hover:bg-red-100 font-medium transition-colors flex items-center gap-2"
                      >
                          <Trash2 className="w-3 h-3"/>
                           Destroy Infrastructure
                      </button>
                  </div>
              </div>


          </div>
      )}

      {/* Configuration Settings (Always visible if Infra exists) */}
      {hasInfra && (
        <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
           <h3 className="text-lg font-semibold text-gray-900 mb-4">Configuration</h3>
           <div className="grid gap-6 max-w-xl">
             <div>
               <label className="block text-sm font-medium text-gray-700 mb-2">
                 Domain Name & Email
               </label>
               <div className="grid grid-cols-2 gap-4">
                   <input
                     type="text"
                     value={domainName}
                     onChange={(e) => setDomainName(e.target.value)}
                     placeholder="example.com"
                     className="w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                     disabled={isLoading}
                   />
                   <input
                     type="text"
                     value={domainEmail}
                     onChange={(e) => setDomainEmail(e.target.value)}
                     placeholder="admin@example.com (SSL)"
                     className="w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                     disabled={isLoading}
                   />
               </div>
               <p className="text-xs text-gray-500 mt-1">
                 Update domain settings. These will be applied on the next deployment.
               </p>
            </div>

            <div>
               <label className="block text-sm font-medium text-gray-700 mb-2">
                 Cloudflare Credentials
               </label>
               <input
                 type="password"
                 value={cloudflareToken}
                 onChange={(e) => setCloudflareToken(e.target.value)}
                 placeholder="API Token or Global API Key"
                 className="w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                 disabled={isLoading}
               />
               <input
                 type="text"
                 value={cloudflareEmail}
                 onChange={(e) => setCloudflareEmail(e.target.value)}
                 placeholder="Email (Required for Global Key)"
                 className="w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 mt-2"
                 disabled={isLoading}
               />
            </div>
            
            <div className="flex gap-4">
                <button
                    onClick={async () => {
                        setIsLoading(true);
                        await saveSettings(region, type, domainName, domainEmail, cloudflareToken, cloudflareEmail);
                        setIsLoading(false);
                        showStatus('success', 'Settings Saved', 'Configuration saved. Please redeploy or publish to apply changes.');
                    }}
                    disabled={isLoading}
                    className="px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors text-sm font-medium"
                >
                    Save Configuration
                </button>
            </div>
           </div>
        </div>
      )}

      {/* Deployment Configuration */}
      {!hasInfra && (
      <div>
        <h3 className="text-lg font-medium text-gray-900 mb-4">Create Infrastructure</h3>
        <p className="text-sm text-gray-600 mb-6">
          Deploy your project to Linode using Terraform. The server will clone your code directly from GitHub.
        </p>

        <div className="mb-6 p-4 bg-amber-50 rounded-lg border border-amber-200">
           <h4 className="text-sm font-semibold text-amber-800 mb-2">Before you deploy</h4>
           <ul className="text-sm text-amber-700 list-disc list-inside space-y-1">
             <li>Ensure you have connected your GitHub repository in Settings.</li>
             <li><strong>Push your latest changes</strong> to GitHub using the Publish button in the chat.</li>
             <li>The deployment will use the default branch (e.g., main) of your repository.</li>
           </ul>
        </div>

        <div className="grid gap-6 max-w-xl">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Region
            </label>
            <select
              value={region}
              onChange={(e) => {
                const val = e.target.value;
                setRegion(val);
                saveSettings(val, type, domainName, domainEmail, cloudflareToken, cloudflareEmail);
              }}
              className="w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              disabled={isLoading}
            >
              <option value="us-east">Newark, NJ (us-east)</option>
              <option value="us-west">Fremont, CA (us-west)</option>
              <option value="us-central">Dallas, TX (us-central)</option>
              <option value="us-southeast">Atlanta, GA (us-southeast)</option>
              <option value="eu-central">Frankfurt, DE (eu-central)</option>
              <option value="eu-west">London, UK (eu-west)</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Plan Type
            </label>
            <select
              value={type}
              onChange={(e) => {
                const val = e.target.value;
                setType(val);
                saveSettings(region, val, domainName, domainEmail, cloudflareToken, cloudflareEmail);
              }}
              className="w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              disabled={isLoading}
            >
              <option value="g6-nanode-1">Nanode 1GB ($5/mo)</option>
              <option value="g6-standard-1">Linode 2GB ($12/mo)</option>
              <option value="g6-standard-2">Linode 4GB ($24/mo)</option>
            </select>
          </div>

          <div>
             <label className="block text-sm font-medium text-gray-700 mb-2">
               Domain Name & Email (Optional)
             </label>
             <div className="grid grid-cols-2 gap-4">
                 <input
                   type="text"
                   value={domainName}
                   onChange={(e) => setDomainName(e.target.value)}
                   placeholder="example.com"
                   className="w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                   disabled={isLoading}
                 />
                 <input
                   type="text"
                   value={domainEmail}
                   onChange={(e) => setDomainEmail(e.target.value)}
                   placeholder="admin@example.com (SSL)"
                   className="w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                   disabled={isLoading}
                 />
             </div>
             <p className="text-xs text-gray-500 mt-1">
               If specified, this domain will be configured in Caddy. Email is used for Let's Encrypt SSL.
             </p>
          </div>

          <div>
             <label className="block text-sm font-medium text-gray-700 mb-2">
               Cloudflare Credentials (Optional)
             </label>
             <input
               type="password"
               value={cloudflareToken}
               onChange={(e) => setCloudflareToken(e.target.value)}
               placeholder="API Token or Global API Key"
               className="w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
               disabled={isLoading}
             />
             <input
               type="text"
               value={cloudflareEmail}
               onChange={(e) => setCloudflareEmail(e.target.value)}
               placeholder="Email (Required for Global Key)"
               className="w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 mt-2"
               disabled={isLoading}
             />
             <p className="text-xs text-gray-500 mt-1">
               Provide Email only if using a Global API Key. For API Tokens, just the token is needed.
             </p>
          </div>

          <button
            onClick={handleDeploy}
            disabled={isLoading}
            className={`flex items-center justify-center gap-2 w-full py-3 px-4 rounded-lg text-white font-medium transition-colors ${
              isLoading 
                ? 'bg-blue-400 cursor-not-allowed' 
                : 'bg-blue-600 hover:bg-blue-700'
            }`}
          >
            {isLoading ? (
              <>
                <RefreshCw className="animate-spin h-5 w-5" />
                Deploying...
              </>
            ) : (
              <>
                <Upload className="w-4 h-4" />
                Deploy to Linode
              </>
            )}
          </button>
        </div>
      </div>
      )}

      {/* Logs / Output */}
      <div className="border rounded-xl overflow-hidden bg-gray-900 text-gray-100 font-mono text-xs">
        <div className="flex items-center justify-between px-4 py-2 bg-gray-800 border-b border-gray-700">
            <span className="font-semibold">Deployment Logs</span>
            <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold ${
                deploymentStatus === 'success' ? 'bg-green-500/20 text-green-400' :
                deploymentStatus === 'error' ? 'bg-red-500/20 text-red-400' :
                deploymentStatus === 'deploying' ? 'bg-blue-500/20 text-blue-400' :
                'bg-gray-700 text-gray-400'
            }`}>
                {deploymentStatus}
            </span>
        </div>
        <div className="p-4 h-64 overflow-y-auto whitespace-pre-wrap">
            {logs || <span className="text-gray-500 italic">No deployment logs yet.</span>}
        </div>
      </div>

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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowPasswordModal(false)} />
          <div className="relative w-full max-w-md bg-white rounded-xl shadow-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200 bg-red-50">
              <h3 className="text-lg font-semibold text-red-800 flex items-center gap-2">
                <Trash2 className="w-5 h-5" />
                Confirm Destruction
              </h3>
              <p className="text-sm text-red-700 mt-1">
                Enter your password to authorize this destructive action.
              </p>
            </div>
            
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Admin Password
                </label>
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
                  placeholder="Enter your password"
                  className={`w-full rounded-lg border shadow-sm focus:ring-2 focus:ring-red-500 focus:border-red-500 ${
                    passwordError ? 'border-red-500' : 'border-gray-300'
                  }`}
                  autoFocus
                  disabled={isVerifyingPassword}
                />
                {passwordError && (
                  <p className="text-sm text-red-600 mt-1">{passwordError}</p>
                )}
              </div>
              
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => {
                    setShowPasswordModal(false);
                    setConfirmPassword('');
                    setPasswordError('');
                  }}
                  disabled={isVerifyingPassword}
                  className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handlePasswordConfirmDestroy}
                  disabled={isVerifyingPassword || !confirmPassword}
                  className={`flex-1 px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors flex items-center justify-center gap-2 ${
                    isVerifyingPassword || !confirmPassword
                      ? 'bg-red-400 cursor-not-allowed'
                      : 'bg-red-600 hover:bg-red-700'
                  }`}
                >
                  {isVerifyingPassword ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      Verifying...
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-4 h-4" />
                      Destroy Now
                    </>
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

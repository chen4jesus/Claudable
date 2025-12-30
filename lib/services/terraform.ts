import fs from 'fs/promises';
import path from 'path';
import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import { createWriteStream } from 'fs';
import { getProjectById } from '@/lib/services/project';
import { getPlainServiceToken } from '@/lib/services/tokens';
import { getProjectService } from '@/lib/services/project-services';
import * as crypto from 'crypto';

const execAsync = promisify(exec);
const isWindows = process.platform === 'win32';
const LOCAL_TF_PATH = path.join(process.cwd(), 'bin', isWindows ? 'terraform.exe' : 'terraform');

// Use local binary if it exists, otherwise fall back to system 'terraform'
let TF_BINARY = 'terraform';

async function resolveTfBinary() {
  try {
    await fs.access(LOCAL_TF_PATH);
    TF_BINARY = LOCAL_TF_PATH;
    // ensure executable on linux/mac
    if (!isWindows) {
      await fs.chmod(LOCAL_TF_PATH, 0o755).catch(() => {});
    }
  } catch {
    TF_BINARY = 'terraform';
  }
}

// Initialize binary resolution
resolveTfBinary();


export interface TerraformConfig {
  projectId: string;
  region: string;
  type: string;
  label?: string;
  token: string;
  rootPass?: string;
  repoUrl?: string; // Authenticated URL for git clone
  sourcePath?: string; // Kept for backward compatibility or future use, but optional now
  ensureExisting?: boolean;
  domainName?: string;
  domainEmail?: string;
  cloudflareToken?: string;
  cloudflareEmail?: string;
  customEnvVars?: Record<string, string>; // Custom environment variables from docker-compose
}

export interface TerraformState {
  status: 'idle' | 'running' | 'success' | 'error' | 'not_found';
  message?: string;
  lastRun?: string;
  resourceInfo?: {
      id: string;
      ip: string;
      region: string;
      type: string;
      status: string; // from provider
      rootPass?: string;
      cpu?: number;
      ram?: number;
  };
}

const INSTANCE_SPECS: Record<string, { cpu: number; ram: number }> = {
  'g6-nanode-1': { cpu: 1, ram: 1 },
  'g6-standard-1': { cpu: 1, ram: 2 },
  'g6-standard-2': { cpu: 2, ram: 4 },
};

// Simple in-memory state for tracking background operations
const activeOperations = new Map<string, 'deploying' | 'destroying'>();

export async function getProjectStatus(projectId: string): Promise<TerraformState> {
    const activeOp = activeOperations.get(projectId);
    
    try {
        const dir = await ensureTfDir(projectId);
        const stateFile = path.join(dir, 'terraform.tfstate');
        
        let infrastructureFound = true;
        try {
            await fs.access(stateFile);
        } catch {
             infrastructureFound = false;
        }

        if (!infrastructureFound) {
            if (activeOp) {
                return { status: 'running', message: activeOp === 'deploying' ? 'Deployment in progress...' : 'Destruction in progress...' };
            }
            return { status: 'not_found', message: 'No infrastructure found.' };
        }

        const content = await fs.readFile(stateFile, 'utf-8');
        const state = JSON.parse(content);
        
        // Naive parsing for single resource "web"
        const passResource = state.resources?.find((r: any) => r.type === 'random_string' && r.name === 'root_pass');
        const rootPass = passResource?.instances?.[0]?.attributes?.result;

        const linodeResource = state.resources?.find((r: any) => r.type === 'linode_instance' && r.name === 'web');
        const instance = linodeResource?.instances?.[0]?.attributes;

        if (instance) {
            return {
                status: activeOp ? 'running' : 'success',
                message: activeOp ? (activeOp === 'deploying' ? 'Updating infrastructure...' : 'Destroying infrastructure...') : 'Infrastructure active',
                resourceInfo: {
                    id: instance.id,
                    ip: instance.ip_address,
                    region: instance.region,
                    type: instance.type,
                    status: instance.status,
                    rootPass: rootPass,
                    cpu: INSTANCE_SPECS[instance.type]?.cpu || 1,
                    ram: INSTANCE_SPECS[instance.type]?.ram || 1
                }
            };
        }
        
        return { 
            status: activeOp ? 'running' : 'success', 
            message: activeOp ? 'Processing...' : 'State file exists but no instance found.' 
        };

    } catch (error: any) {
        return { status: 'error', message: error.message };
    }
}

const TF_DIR_BASE = path.join(process.cwd(), 'data', 'terraform');

async function ensureTfDir(projectId: string) {
  const dir = path.join(TF_DIR_BASE, projectId);
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

export async function checkTerraformInstalled(): Promise<boolean> {
  try {
    // Check if binary exists and is executable
    await resolveTfBinary();
    await execAsync(`${TF_BINARY} --version`);
    return true;
  } catch (error) {
    return false;
  }
}

function generateSecurePassword(): string {
  const length = 16;
  const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*";
  let retVal = "";
  for (let i = 0, n = charset.length; i < length; ++i) {
    retVal += charset.charAt(crypto.randomInt(0, n));
  }
  return retVal + "Ab1!"; 
}

/**
 * Generate shell commands to create .env file with all environment variables
 */
function generateEnvFileCommands(config: TerraformConfig): string {
  const envLines: string[] = [];
  
  // Add infrastructure variables (DOMAIN_NAME, ACME_EMAIL)
  if (config.domainName) {
    envLines.push(`DOMAIN_NAME=${config.domainName}`);
  }
  
  const safeDomainEmail = config.domainEmail ? config.domainEmail.trim().replace(/['"\\s]/g, '') : '';
  const safeCfEmail = config.cloudflareEmail ? config.cloudflareEmail.trim().replace(/['"\\s]/g, '') : '';
  const effectiveEmail = safeDomainEmail || safeCfEmail;
  if (effectiveEmail) {
    envLines.push(`ACME_EMAIL=${effectiveEmail}`);
  }
  
  // Add custom environment variables from docker-compose
  if (config.customEnvVars) {
    for (const [key, value] of Object.entries(config.customEnvVars)) {
      // Skip DOMAIN_NAME and ACME_EMAIL if already set above
      if (key === 'DOMAIN_NAME' || key === 'ACME_EMAIL') continue;
      // Escape single quotes in values
      const safeValue = value.replace(/'/g, "'\\''");
      envLines.push(`${key}=${safeValue}`);
    }
  }
  
  // Generate shell commands
  const commands: string[] = [];
  if (envLines.length === 0) {
    commands.push(`"echo '# No environment variables configured' > .env"`);
  } else {
    // First line uses > to create/overwrite, rest use >> to append
    commands.push(`"echo '${envLines[0]}' > .env"`);
    for (let i = 1; i < envLines.length; i++) {
      commands.push(`"echo '${envLines[i]}' >> .env"`);
    }
  }
  
  // Also add DOMAIN_NAME from instance IP if not provided
  if (!config.domainName) {
    commands.unshift(`"echo DOMAIN_NAME=` + '${linode_instance.web.ip_address}' + ` > .env"`);
  }
  
  return commands.join(',\n      ');
}

function generateLinqodeConfig(config: TerraformConfig, port: number = 3000): string {
  const deployId = Date.now().toString();
  
  return `
terraform {
  required_providers {
    linode = {
      source = "linode/linode"
      version = "2.13.0"
    }
    random = {
      source = "hashicorp/random"
      version = "3.6.2"
    }
  }
}

provider "linode" {
  token = "\${var.linode_token}"
}

provider "random" {}

variable "linode_token" {
  type = string
  sensitive = true
}

variable "domain_name" {
  type    = string
  default = "${config.domainName || ""}"
}

resource "random_string" "root_pass" {
  length           = 16
  special          = true
  upper            = true
  lower            = true
  numeric          = true
  min_upper        = 1
  min_lower        = 1
  min_numeric      = 1
  min_special      = 1
  override_special = "!@#$%^&*"
}

resource "linode_instance" "web" {
  label = "${config.label || config.projectId}"
  image = "linode/ubuntu24.04"
  region = "${config.region}"
  type = "${config.type}"
  root_pass = random_string.root_pass.result
  
  connection {
    type     = "ssh"
    user     = "root"
    password = random_string.root_pass.result
    host     = self.ip_address
    timeout  = "5m"
  }
}

resource "null_resource" "app_deployment" {
  triggers = {
    deploy_id = "${deployId}"
  }

  depends_on = [linode_instance.web]

  connection {
    type     = "ssh"
    user     = "root"
    password = random_string.root_pass.result
    host     = linode_instance.web.ip_address
    timeout  = "5m"
  }

  provisioner "remote-exec" {
    inline = [
      "export DEBIAN_FRONTEND=noninteractive",
      "apt-get update",
      "apt-get install -y curl git",
      "command -v docker >/dev/null 2>&1 || curl -fsSL https://get.docker.com | sh",
      
      "cd /root",
      "if [ -d /root/app ]; then echo 'Stopping existing services...'; cd /root/app; docker compose down --remove-orphans || true; cd /root; fi",
      "rm -rf app",
      "git clone ${config.repoUrl} app",
      
      "cd /root/app",
      "echo 'Generating environment configuration...'",
      ${generateEnvFileCommands(config)},
      
      "echo 'Starting deployment with Docker Compose...'",
      "docker compose up -d --build --remove-orphans",
      
      "echo 'Deployment complete.'"
    ]
  }
}
`;
}

async function runCommandWithLog(command: string, cwd: string, logFile: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const stream = createWriteStream(logFile, { flags: 'a' });
    stream.write(`\n$ ${command}\n`);
    
    const child = spawn(command, { 
      cwd, 
      shell: true,
      env: { ...process.env, CLI_FORCE_INTERACTIVE: 'false' } 
    });

    let stdoutBuffer = '';
    let stderrBuffer = '';

    child.stdout.on('data', (data) => {
      const str = data.toString();
      stdoutBuffer += str;
      stream.write(str);
    });

    child.stderr.on('data', (data) => {
      const str = data.toString();
      stderrBuffer += str;
      stream.write(str);
    });

    child.on('close', (code) => {
      stream.end();
      if (code === 0) {
        resolve(stdoutBuffer);
      } else {
        const error = new Error(`Command failed with code ${code}`);
        (error as any).stdout = stdoutBuffer + stderrBuffer;
        reject(error);
      }
    });

    child.on('error', (err) => {
      stream.end();
      reject(err);
    });
  });
}

/**
 * Internal function to handle the actual deployment steps
 */
async function performDeployment(config: TerraformConfig, projectPort: number, dir: string, logFile: string) {
    const projectId = config.projectId;
    activeOperations.set(projectId, 'deploying');
    
    try {
        await fs.writeFile(logFile, `[${new Date().toISOString()}] Starting background deployment...\n`);
        
        // 1. Optimize init - check if .terraform exists
        const dotTfDir = path.join(dir, '.terraform');
        let needsInit = true;
        try {
            await fs.access(dotTfDir);
            needsInit = false;
        } catch {}

        if (needsInit) {
            await runCommandWithLog(`${TF_BINARY} init`, dir, logFile);
        } else {
            await fs.appendFile(logFile, "Skipping init, .terraform directory already exists.\n");
        }
        
        const currentStatus = await getProjectStatus(projectId);
        const isUpdate = currentStatus.status === 'success' || (currentStatus.status === 'running' && currentStatus.resourceInfo);

        let command = `${TF_BINARY} apply -auto-approve -var="linode_token=${config.token}"`;
        if (isUpdate) {
            await fs.appendFile(logFile, `\nInfrastructure exists, performing targeted app deployment...\n`);
            command += ' -target="null_resource.app_deployment"';
        }

        const stdout = await runCommandWithLog(command, dir, logFile);
        
        if (config.domainName && config.cloudflareToken) {
            try {
                const status = await getProjectStatus(projectId);
                const ip = status.resourceInfo?.ip;
                if (ip) {
                    await fs.appendFile(logFile, `\nUpdate Cloudflare DNS: ${config.domainName} -> ${ip}\n`);
                    await updateCloudflareDNS(config.domainName, ip, config.cloudflareToken, config.cloudflareEmail);
                    await fs.appendFile(logFile, "DNS Update Successful\n");
                }
            } catch (dnsError: any) {
                 await fs.appendFile(logFile, `\nWARNING: Cloudflare DNS Update Failed: ${dnsError.message}\n`);
            }
        }

        if (config.domainName) {
            await fs.appendFile(logFile, `\nVerifying SSL for https://${config.domainName} (this may take several minutes)...\n`);
            // We don't block the status for this, but we log it.
            waitForSSL(config.domainName, logFile).then(success => {
                if (success) {
                    fs.appendFile(logFile, `\n[${new Date().toISOString()}] SSL Verification Successful!\n`);
                } else {
                    fs.appendFile(logFile, `\n[${new Date().toISOString()}] WARNING: SSL Verification timed out or failed.\n`);
                }
            });
        }

        await fs.appendFile(logFile, `\n[${new Date().toISOString()}] Deployment Complete.\n`);
    } catch (error: any) {
        await fs.appendFile(logFile, `\n[${new Date().toISOString()}] FATAL ERROR: ${error.message}\n`);
        if (error.stdout) {
            await fs.appendFile(logFile, `\nSTDOUT/STDERR:\n${error.stdout}\n`);
        }
    } finally {
        activeOperations.delete(projectId);
    }
}

export async function deployProject(
  config: TerraformConfig
): Promise<{ success: boolean; logs?: string; error?: string }> {
  // If ensureExisting is true, verify infrastructure is already up and use deployed values
  if (config.ensureExisting) {
    const status = await getProjectStatus(config.projectId);
    if ((status.status !== 'success' && status.status !== 'running') || !status.resourceInfo) {
      throw new Error("No active infrastructure found. Please set up a server in Settings before publishing.");
    }
    // We can proceed even if status is 'running' if resourceInfo exists (it means instance is up but something is updating)
    config.region = status.resourceInfo.region;
    config.type = status.resourceInfo.type;

    try {
      const storedLinode = await getProjectService(config.projectId, 'linode');
      if (storedLinode && storedLinode.serviceData) {
        const sd = storedLinode.serviceData as any;
        if (!config.domainName && sd.domainName) {
            config.domainName = sd.domainName;
        }
        if (!config.domainEmail && sd.domainEmail) config.domainEmail = sd.domainEmail;
        if (!config.cloudflareToken && sd.cloudflareToken) config.cloudflareToken = sd.cloudflareToken;
        if (!config.cloudflareEmail && sd.cloudflareEmail) config.cloudflareEmail = sd.cloudflareEmail;
      }
    } catch (e) {
      console.warn("[Terraform] Failed to fetch stored service data", e);
    }
  }

  // Detect port from project Dockerfile
  let projectPort = 3000;
  try {
    const projectDir = path.join(process.cwd(), 'data', 'projects', config.projectId);
    const dockerfilePath = path.join(projectDir, 'Dockerfile');
    const dockerfileContent = await fs.readFile(dockerfilePath, 'utf-8');
    const exposeMatch = dockerfileContent.match(/^EXPOSE\s+(\d+)/m);
    if (exposeMatch) {
      projectPort = parseInt(exposeMatch[1], 10);
      console.log(`🚀 Detected port ${projectPort} for project ${config.projectId}`);
    }
  } catch (e) {
    console.warn(`Could not detect port for project ${config.projectId}, defaulting to 3000`, e);
  }

  // 1. Fetch GitHub Token and Repo Details to construct authenticated URL
  try {
    const token = await getPlainServiceToken('github');
    if (!token) {
      throw new Error("GitHub token not found. Please connect GitHub in settings.");
    }

    const service = await getProjectService(config.projectId, 'github');
    if (!service || !service.serviceData) {
      throw new Error("GitHub repository not connected. Please connect the project to GitHub first.");
    }

    const data = service.serviceData as any;
    const cloneUrl = data.clone_url;
    const owner = data.owner;

    if (!cloneUrl) {
      throw new Error("Could not find repository clone URL.");
    }

    const authUrl = cloneUrl.replace('https://', `https://${owner || 'git'}:${token}@`);
    config.repoUrl = authUrl;

  } catch (error: any) {
    return { success: false, error: error.message, logs: '' };
  }

  const dir = await ensureTfDir(config.projectId);
  const tfFile = path.join(dir, 'main.tf');
  const logFile = path.join(dir, 'deploy.log');

  await fs.writeFile(tfFile, generateLinqodeConfig(config, projectPort));
  
  // Trigger background deployment
  performDeployment(config, projectPort, dir, logFile);

  return { 
    success: true, 
    logs: 'Deployment initiated in background. You can follow the logs in the console.' 
  };
}

async function updateCloudflareDNS(domain: string, ip: string, token: string, email?: string) {
    const headers: Record<string, string> = {
        'Content-Type': 'application/json'
    };

    let rawToken = token.trim();
    if (rawToken.toLowerCase().startsWith('bearer ')) {
        rawToken = rawToken.slice(7).trim();
    }
    const safeToken = rawToken.replace(/[^a-zA-Z0-9_\-\.]/g, '');

    if (email && email.trim()) {
        headers['X-Auth-Email'] = email.trim();
        headers['X-Auth-Key'] = safeToken;
    } else {
        headers['Authorization'] = `Bearer ${safeToken}`;
    }
    
    const zonesRes = await fetch('https://api.cloudflare.com/client/v4/zones', { headers });
    if (!zonesRes.ok) {
        const errorText = await zonesRes.text();
        throw new Error(`Failed to list zones: ${zonesRes.status} - ${errorText}`);
    }
    const zonesData = await zonesRes.json();
    if (!zonesData.success) throw new Error(`Cloudflare API Error (Zones)`);
    
    const matchingZones = zonesData.result.filter((z: any) => domain === z.name || domain.endsWith(`.${z.name}`));
    matchingZones.sort((a: any, b: any) => b.name.length - a.name.length);
    const zone = matchingZones[0];
    if (!zone) throw new Error(`No Cloudflare zone found for ${domain}`);
    
    const zoneId = zone.id;

    const upsertRecord = async (type: 'A' | 'CNAME', name: string, content: string, proxied: boolean = true) => {
        const recordsRes = await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records?type=${type}&name=${name}`, { headers });
        const recordsData = await recordsRes.json();
        const existingRecord = recordsData.result.find((r: any) => r.name === name);

        if (existingRecord) {
            if (existingRecord.content === content && existingRecord.proxied === proxied) return;
            await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records/${existingRecord.id}`, {
                method: 'PUT',
                headers,
                body: JSON.stringify({ type, name, content, ttl: 1, proxied })
            });
        } else {
            await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ type, name, content, ttl: 1, proxied })
            });
        }
    };

    await upsertRecord('A', domain, ip);
    if (domain === zone.name) await upsertRecord('CNAME', `www.${domain}`, domain);
}

export async function destroyProject(projectId: string, token: string) {
    const dir = await ensureTfDir(projectId);
    const config: TerraformConfig = {
        projectId,
        region: 'us-east',
        type: 'g6-nanode-1',
        token
      };
    
    const logFile = path.join(dir, 'deploy.log');
    await fs.writeFile(path.join(dir, 'main.tf'), generateLinqodeConfig(config));
    
    // Background destruction
    const doDestroy = async () => {
        activeOperations.set(projectId, 'destroying');
        try {
            await fs.writeFile(logFile, `[${new Date().toISOString()}] Starting background destruction...\n`);
            await runCommandWithLog(`${TF_BINARY} destroy -auto-approve -var="linode_token=${token}"`, dir, logFile);
            await fs.appendFile(logFile, `\n[${new Date().toISOString()}] Destruction Complete.\n`);
        } catch (error: any) {
            await fs.appendFile(logFile, `\n[${new Date().toISOString()}] Destruction Failed: ${error.message}\n`);
        } finally {
            activeOperations.delete(projectId);
        }
    };
    
    doDestroy();
    
    return { success: true, message: "Destruction initiated in background." };
}

async function waitForSSL(domain: string, logFile: string): Promise<boolean> {
    const maxAttempts = 30;
    const delayMs = 10000;
    for (let i = 0; i < maxAttempts; i++) {
        try {
            await fs.appendFile(logFile, `Attempt ${i + 1}/${maxAttempts}: Pinging https://${domain}...\n`);
            const res = await fetch(`https://${domain}`, { 
                method: 'HEAD',
                signal: (AbortSignal as any).timeout ? (AbortSignal as any).timeout(5000) : undefined
            });
            if (res.ok || res.status < 500) return true;
        } catch (e) { }
        await new Promise(r => setTimeout(r, delayMs));
    }
    return false;
}

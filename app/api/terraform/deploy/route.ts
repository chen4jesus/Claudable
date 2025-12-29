import { NextRequest, NextResponse } from 'next/server';
import { deployProject, TerraformConfig } from '@/lib/services/terraform';
import { getPlainServiceToken } from '@/lib/services/tokens';
import { getProjectService } from '@/lib/services/project-services';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { projectId, region, type, label, ensureExisting } = body;

    if (!projectId || !region || !type) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: projectId, region, type' },
        { status: 400 }
      );
    }
    
    // Fetch Linode token securely
    const token = await getPlainServiceToken('linode');
    
    if (!token) {
        return NextResponse.json(
            { success: false, error: 'Linode API token not configured. Please configure it in Global Settings.' },
            { status: 400 }
        );
    }

    // Fetch saved docker-env variables
    let customEnvVars: Record<string, string> = {};
    try {
      const dockerEnvService = await getProjectService(projectId, 'docker-env');
      if (dockerEnvService?.serviceData) {
        customEnvVars = (dockerEnvService.serviceData as any).variables || {};
      }
    } catch (e) {
      console.warn('[API] Failed to fetch docker-env variables:', e);
    }

    const config: TerraformConfig = {
      projectId,
      region,
      type,
      label,
      token,
      ensureExisting,
      domainName: body.domainName,
      domainEmail: body.domainEmail,
      cloudflareToken: body.cloudflareToken,
      cloudflareEmail: body.cloudflareEmail,
      customEnvVars
    };

    console.log(`[API] Deploy Config: Domain=${config.domainName}, DomainEmail=${config.domainEmail}, CFEmail=${config.cloudflareEmail}, CustomEnvVars=${Object.keys(customEnvVars).length}`);

    // Trigger deployment in background
    const result = await deployProject(config);

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error, logs: result.logs },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, logs: result.logs });
  } catch (error: any) {
    console.error('Deployment API error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}


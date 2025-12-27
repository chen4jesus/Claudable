import { NextRequest, NextResponse } from 'next/server';
import { deployProject, TerraformConfig } from '@/lib/services/terraform';
import { getPlainServiceToken } from '@/lib/services/tokens';

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
      cloudflareEmail: body.cloudflareEmail
    };

    console.log(`[API] Deploy Config: Domain=${config.domainName}, DomainEmail=${config.domainEmail}, CFEmail=${config.cloudflareEmail}`);

    // Trigger deployment
    // TODO: Ideally this should suffer from a background job queue, but for now we await (or fire and forget if long running)
    // Since terraform apply can take time, we might want to return "Processing" and let frontend poll.
    // However, the service awaits execution.
    
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

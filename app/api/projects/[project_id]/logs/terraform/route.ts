import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

export async function GET(request: Request, { params }: { params: Promise<{ project_id: string }> }) {
    const { project_id } = await params;
    
    // Path to the deploy.log file
    const logPath = path.join(process.cwd(), 'data', 'terraform', project_id, 'deploy.log');

    if (!fs.existsSync(logPath)) {
        return NextResponse.json({ logs: "" });
    }

    try {
        const content = fs.readFileSync(logPath, 'utf8');
        return NextResponse.json({ logs: content });
    } catch (e) {
        console.error("Failed to read Terraform logs:", e);
        return NextResponse.json({ error: "Failed to read logs" }, { status: 500 });
    }
}

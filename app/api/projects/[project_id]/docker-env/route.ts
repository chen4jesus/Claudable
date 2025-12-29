import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import { getProjectService, upsertProjectServiceConnection } from '@/lib/services/project-services';

interface EnvVariable {
  name: string;
  defaultValue: string;
  currentValue: string;
  isRequired: boolean;
  isSensitive: boolean;
  description?: string;
}

interface DockerComposeService {
  environment?: (string | Record<string, string>)[];
  env_file?: string[];
}

interface DockerCompose {
  services?: Record<string, DockerComposeService>;
}

/**
 * Parse environment variable definition from docker-compose format
 * Handles formats like:
 * - VAR_NAME=${VAR_NAME:-default_value}
 * - VAR_NAME=${VAR_NAME}
 * - VAR_NAME=value
 */
function parseEnvVariable(envLine: string): EnvVariable | null {
  // Handle string format: "VAR_NAME=value" or "VAR_NAME=${VAR_NAME:-default}"
  if (typeof envLine !== 'string') return null;
  
  const match = envLine.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/i);
  if (!match) return null;
  
  const name = match[1];
  let value = match[2];
  let defaultValue = '';
  
  // Parse ${VAR:-default} or ${VAR} format
  const varMatch = value.match(/^\$\{([^}]+)\}$/);
  if (varMatch) {
    const inner = varMatch[1];
    const defaultMatch = inner.match(/^([^:-]+):-(.*)$/);
    if (defaultMatch) {
      defaultValue = defaultMatch[2];
    }
  } else {
    // Direct value assignment
    defaultValue = value;
  }
  
  // Determine if sensitive based on common naming patterns
  const sensitivePatterns = ['SECRET', 'KEY', 'TOKEN', 'PASSWORD', 'PASS', 'API_KEY', 'PRIVATE'];
  const isSensitive = sensitivePatterns.some(pattern => name.toUpperCase().includes(pattern));
  
  return {
    name,
    defaultValue,
    currentValue: '',
    isRequired: !defaultValue,
    isSensitive
  };
}

/**
 * Simple YAML parser for docker-compose.yml
 * Handles the environment section specifically
 */
function parseDockerCompose(content: string): EnvVariable[] {
  const variables: EnvVariable[] = [];
  const lines = content.split('\n');
  
  let inEnvironment = false;
  let environmentIndent = 0;
  
  for (const line of lines) {
    const trimmed = line.trim();
    
    // Detect environment: section
    if (trimmed === 'environment:') {
      inEnvironment = true;
      environmentIndent = line.search(/\S/);
      continue;
    }
    
    // If we're in environment section
    if (inEnvironment) {
      const currentIndent = line.search(/\S/);
      
      // If line is not indented more than environment:, we've left the section
      if (currentIndent <= environmentIndent && trimmed !== '' && !trimmed.startsWith('#')) {
        inEnvironment = false;
        continue;
      }
      
      // Skip comments and empty lines
      if (trimmed.startsWith('#') || trimmed === '') continue;
      
      // Parse list item format: - VAR=value
      if (trimmed.startsWith('- ')) {
        const envLine = trimmed.substring(2).trim();
        const parsed = parseEnvVariable(envLine);
        if (parsed) {
          // Avoid duplicates
          if (!variables.find(v => v.name === parsed.name)) {
            variables.push(parsed);
          }
        }
      }
    }
  }
  
  return variables;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ project_id: string }> }
) {
  try {
    const { project_id } = await params;
    const projectDir = path.join(process.cwd(), 'data', 'projects', project_id);
    const dockerComposePath = path.join(projectDir, 'docker-compose.yml');
    
    // Check if docker-compose.yml exists
    try {
      await fs.access(dockerComposePath);
    } catch {
      return NextResponse.json({
        exists: false,
        variables: [],
        message: 'No docker-compose.yml found in project'
      });
    }
    
    // Read and parse docker-compose.yml
    const content = await fs.readFile(dockerComposePath, 'utf-8');
    const variables = parseDockerCompose(content);
    
    // Load any previously saved values
    try {
      const service = await getProjectService(project_id, 'docker-env');
      if (service?.serviceData) {
        const savedVars = (service.serviceData as any).variables || {};
        for (const variable of variables) {
          if (savedVars[variable.name] !== undefined) {
            variable.currentValue = savedVars[variable.name];
          }
        }
      }
    } catch {
      // No saved values, that's fine
    }
    
    return NextResponse.json({
      exists: true,
      variables,
      message: `Found ${variables.length} environment variables`
    });
  } catch (error: any) {
    console.error('Error parsing docker-compose:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ project_id: string }> }
) {
  try {
    const { project_id } = await params;
    const body = await request.json();
    const { variables } = body;
    
    if (!variables || typeof variables !== 'object') {
      return NextResponse.json(
        { error: 'Invalid variables object' },
        { status: 400 }
      );
    }
    
    // Save variables to project service
    await upsertProjectServiceConnection(project_id, 'docker-env', { variables });
    
    return NextResponse.json({
      success: true,
      message: 'Environment variables saved'
    });
  } catch (error: any) {
    console.error('Error saving docker env vars:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}

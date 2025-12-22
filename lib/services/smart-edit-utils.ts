import fs from 'fs/promises';
import path from 'path';

/**
 * Remove AI Smart Edit injection markers from a content string
 */
export function cleanupSmartEditContent(content: string): string {
  let result = content;
  
  // 1. Handle HTML injection pattern with START/END markers
  const startMarker = '<!-- AI SMART EDIT INJECTION START -->';
  const endMarker = '<!-- AI SMART EDIT INJECTION END -->';
  
  while (true) {
    const startIndex = result.indexOf(startMarker);
    if (startIndex === -1) break;
    
    const endIndex = result.indexOf(endMarker, startIndex);
    if (endIndex === -1) break;
    
    let removeStart = startIndex;
    let removeEnd = endIndex + endMarker.length;
    
    // Symmetrical cleanup: remove one leading and one trailing newline if they exist
    // this matches the "\n" + injection + "\n" pattern in injectIntoHtmlFile
    if (removeStart > 0 && result[removeStart - 1] === '\n') {
      removeStart--;
      if (removeStart > 0 && result[removeStart - 1] === '\r') {
        removeStart--;
      }
    }
    
    if (removeEnd < result.length && result[removeEnd] === '\r') {
      removeEnd++;
    }
    if (removeEnd < result.length && result[removeEnd] === '\n') {
      removeEnd++;
    }
    
    result = result.substring(0, removeStart) + result.substring(removeEnd);
  }
  
  // 2. Handle JSX/TSX pattern
  const jsxPattern = /\s*\{\/\*\s*AI_SMART_EDIT_INJECTED\s*\*\/\}\s*\n?\s*<Script[^>]*ai-smart-edit\.js[^>]*\/>\s*\n?/g;
  result = result.replace(jsxPattern, '');
  
  // 3. Handle standalone Script components
  const scriptOnlyPattern = /<Script[^>]*ai-smart-edit\.js[^>]*\/>\s*\n?/g;
  result = result.replace(scriptOnlyPattern, '');
  
  // 4. Remove the Script import if no longer used
  const scriptUsageCount = (result.match(/<Script/g) || []).length;
  if (scriptUsageCount === 0) {
    const importPattern = /import\s+Script\s+from\s+['"]next\/script['"];?\s*\n?/g;
    result = result.replace(importPattern, '');
  }
  
  return result;
}

/**
 * Remove AI Smart Edit injection from Next.js layout/app files
 */
async function removeSmartEditFromNextJsFile(filePath: string, log: (msg: string) => void): Promise<void> {
  try {
    const content = await fs.readFile(filePath, 'utf8');
    const cleaned = cleanupSmartEditContent(content);
    
    if (cleaned !== content) {
      await fs.writeFile(filePath, cleaned, 'utf8');
      log(`Cleaned up AI Smart Edit from ${path.basename(filePath)}`);
    }
  } catch (e) {
    log(`Failed to cleanup ${path.basename(filePath)}: ${e}`);
  }
}

/**
 * Remove AI Smart Edit injection from HTML files
 */
async function removeScriptFromHtmlFile(filePath: string, log: (msg: string) => void): Promise<void> {
  try {
    const content = await fs.readFile(filePath, 'utf8');
    const cleaned = cleanupSmartEditContent(content);
    
    if (cleaned !== content) {
      await fs.writeFile(filePath, cleaned, 'utf8');
      log(`Removed AI Smart Edit script from ${path.basename(filePath)}`);
    }
  } catch (e) {
    log(`Failed to cleanup ${path.basename(filePath)}: ${e}`);
  }
}

/**
 * Cleanup AI Smart Edit scripts and markers from a directory recursively
 */
export async function cleanupSmartEditScript(projectPath: string, log: (msg: string) => void): Promise<void> {
  // 1. Clean up HTML files (static/Flask)
  const scanRecursively = async (dir: string) => {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (['node_modules', '.git', '.next', 'venv', '__pycache__', 'backups'].includes(entry.name)) continue;
          await scanRecursively(fullPath);
        } else if (entry.isFile() && entry.name.endsWith('.html')) {
          await removeScriptFromHtmlFile(fullPath, log);
        }
      }
    } catch (e) {
      log(`Failed to scan directory ${dir}: ${e}`);
    }
  };
  await scanRecursively(projectPath);

  // 2. Clean up Next.js App Router (layout.tsx / layout.js)
  const nextAppFiles = [
    'app/layout.tsx', 'app/layout.jsx', 'app/layout.js',
    'src/app/layout.tsx', 'src/app/layout.jsx', 'src/app/layout.js'
  ];
  for (const file of nextAppFiles) {
    await removeSmartEditFromNextJsFile(path.join(projectPath, file), log);
  }

  // 3. Clean up Next.js Pages Router (_app.tsx / _app.js)
  const nextPagesFiles = [
    'pages/_app.tsx', 'pages/_app.jsx', 'pages/_app.js',
    'src/pages/_app.tsx', 'src/pages/_app.jsx', 'src/pages/_app.js'
  ];
  for (const file of nextPagesFiles) {
    await removeSmartEditFromNextJsFile(path.join(projectPath, file), log);
  }

  // 4. Remove the public/scripts/ai-smart-edit.js if it exists
  const copiedScriptPath = path.join(projectPath, 'public', 'scripts', 'ai-smart-edit.js');
  try {
    await fs.unlink(copiedScriptPath);
    log(`Removed ai-smart-edit.js from public/scripts/`);
  } catch {
    // File doesn't exist or already removed - ignore
  }
}

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
  
  // 5. Remove Source-ID attributes
  const srcIdPattern = /\s*data-ai-src-id=["'][^"']*["']/g;
  result = result.replace(srcIdPattern, '');
  
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

/**
 * Tag content with unique Source-IDs for granular editing
 */
export function tagContentWithSourceIds(content: string, relPath: string): string {
  let counter = 0;
  // Normalize path and use it as a prefix to ensure uniqueness across files
  const prefix = relPath.replace(/\\/g, '/').replace(/^\.\//, '');
  
  // Replace only opening tags of common elements that might be edited
  const tagRegex = /<([a-zA-Z0-9]+)([^>]*?)(?=\/?>)/g;
  
  return content.replace(tagRegex, (match, tagName, attrs) => {
    // Skip if already has an ID or is a system tag we don't want to edit
    if (attrs.includes('data-ai-src-id') || ['script', 'style', 'link', 'meta', 'br', 'hr', 'base'].includes(tagName.toLowerCase())) {
      return match;
    }
    
    const srcId = `${prefix}::${counter++}`;
    return `<${tagName}${attrs} data-ai-src-id="${srcId}"`;
  });
}

/**
 * Apply granular changes (from CSS selectors or Source-IDs) to source content
 */
export function applyGranularChanges(content: string, changes: any[]): string {
  let result = content;

  for (const change of changes) {
    const { selector, srcId, type, value, attrName } = change;
    
    // Prioritize Source-ID if available
    if (srcId) {
      try {
        if (type === 'html') {
          result = updateElementHtmlBySrcId(result, srcId, value);
        } else if (type === 'attr' && attrName) {
          result = updateElementAttrBySrcId(result, srcId, attrName, value);
        }
        continue; // Successfully handled by srcId
      } catch (e) {
        console.warn(`[GranularSave] Failed to apply change for srcId "${srcId}":`, e);
      }
    }

    // Fallback to selector-based matching (less precise)
    if (selector) {
      try {
        if (type === 'html') {
          result = updateElementHtml(result, selector, value);
        } else if (type === 'attr' && attrName) {
          result = updateElementAttr(result, selector, attrName, value);
        }
      } catch (e) {
        console.warn(`[GranularSave] Failed to apply change for selector "${selector}":`, e);
      }
    }
  }

  return result;
}

function updateElementHtmlBySrcId(content: string, srcId: string, newHtml: string): string {
  // Escape special characters in srcId for regex (though it should be mostly alphanumeric + / + ::)
  const escapedId = srcId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(<[a-zA-Z0-9]+[^>]*\\bdata-ai-src-id=["']${escapedId}["'][^>]*>)([\\s\\S]*?)(<\\/([a-zA-Z0-9]+)>)`, 'i');
  const match = content.match(regex);
  
  if (match) {
    return content.replace(regex, `$1${newHtml}$3`);
  }
  throw new Error(`Element with data-ai-src-id="${srcId}" not found for HTML update`);
}

function updateElementAttrBySrcId(content: string, srcId: string, attrName: string, attrValue: string): string {
  const escapedId = srcId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const tagRegex = new RegExp(`(<[a-zA-Z0-9]+[^>]*\\bdata-ai-src-id=["']${escapedId}["'][^>]*>)`, 'i');
  const match = content.match(tagRegex);
  
  if (match) {
    const fullTag = match[1];
    const attrRegex = new RegExp(`(\\b${attrName}=["'])([^"']*?)(["'])`, 'i');
    
    if (fullTag.match(attrRegex)) {
      const updatedTag = fullTag.replace(attrRegex, `$1${attrValue}$3`);
      return content.replace(fullTag, updatedTag);
    } else {
      const updatedTag = fullTag.includes('/>') 
        ? fullTag.replace(/\s*\/>$/, ` ${attrName}="${attrValue}" />`)
        : fullTag.replace(/>$/, ` ${attrName}="${attrValue}">`);
      return content.replace(fullTag, updatedTag);
    }
  }
  throw new Error(`Element with data-ai-src-id="${srcId}" not found for attribute update`);
}

function updateElementHtml(content: string, selector: string, newHtml: string): string {
  // Simple ID-based matching is most reliable
  if (selector.startsWith('#')) {
    const id = selector.substring(1);
    const regex = new RegExp(`(<[a-zA-Z0-9]+[^>]*\\bid=["']${id}["'][^>]*>)([\\s\\S]*?)(<\\/([a-zA-Z0-9]+)>)`, 'i');
    const match = content.match(regex);
    
    if (match) {
      // Basic sanity check: ensure closing tag matches opening tag (simplified)
      return content.replace(regex, `$1${newHtml}$3`);
    }
  }

  // Fallback or complex path matching: This is much harder without a parser.
  // For now, only IDs are fully supported for high-precision saving.
  // We can try a best-effort tag + class match for others.
  const parts = selector.split(' > ');
  const targetPart = parts[parts.length - 1];
  
  if (targetPart) {
    const tagMatch = targetPart.match(/^([a-z0-9]+)/i);
    const classes = targetPart.match(/\.([a-z0-9_-]+)/gi)?.map(c => c.substring(1));
    
    if (tagMatch) {
      const tagName = tagMatch[1];
      let classRegex = '';
      if (classes && classes.length > 0) {
        classRegex = classes.map(c => `(?=.*\\b${c}\\b)`).join('');
      }
      
      const regex = new RegExp(`(<${tagName}[^>]*class=["'][^"']*${classRegex}[^"']*["'][^>]*>)([\\s\\S]*?)(<\\/${tagName}>)`, 'i');
      if (content.match(regex)) {
        return content.replace(regex, `$1${newHtml}$3`);
      }
    }
  }

  return content;
}

function updateElementAttr(content: string, selector: string, attrName: string, attrValue: string): string {
  if (selector.startsWith('#')) {
    const id = selector.substring(1);
    const tagRegex = new RegExp(`(<[a-zA-Z0-9]+[^>]*\\bid=["']${id}["'][^>]*>)`, 'i');
    const match = content.match(tagRegex);
    
    if (match) {
      const fullTag = match[1];
      const attrRegex = new RegExp(`(\\b${attrName}=["'])([^"']*?)(["'])`, 'i');
      
      if (fullTag.match(attrRegex)) {
        const updatedTag = fullTag.replace(attrRegex, `$1${attrValue}$3`);
        return content.replace(fullTag, updatedTag);
      } else {
        // Attribute not found, try to inject it before the closing bracket of the tag
        const updatedTag = fullTag.replace(/>$/, ` ${attrName}="${attrValue}">`);
        return content.replace(fullTag, updatedTag);
      }
    }
  }

  // Best-effort for tag + class
  const parts = selector.split(' > ');
  const targetPart = parts[parts.length - 1];
  if (targetPart) {
    const tagMatch = targetPart.match(/^([a-z0-9]+)/i);
    const classes = targetPart.match(/\.([a-z0-9_-]+)/gi)?.map(c => c.substring(1));
    
    if (tagMatch) {
      const tagName = tagMatch[1];
      let classRegex = '';
      if (classes && classes.length > 0) {
        classRegex = classes.map(c => `(?=.*\\b${c}\\b)`).join('');
      }
      
      const tagRegex = new RegExp(`(<${tagName}[^>]*class=["'][^"']*${classRegex}[^"']*["'][^>]*>)`, 'i');
      const match = content.match(tagRegex);
      if (match) {
        const fullTag = match[1];
        const attrRegex = new RegExp(`(\\b${attrName}=["'])([^"']*?)(["'])`, 'i');
        if (fullTag.match(attrRegex)) {
          const updatedTag = fullTag.replace(attrRegex, `$1${attrValue}$3`);
          return content.replace(fullTag, updatedTag);
        } else {
          const updatedTag = fullTag.replace(/>$/, ` ${attrName}="${attrValue}">`);
          return content.replace(fullTag, updatedTag);
        }
      }
    }
  }

  return content;
}

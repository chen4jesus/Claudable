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
  
  // 5. Remove the ai-smart-edit-styles block
  const stylePattern = /<style id="ai-smart-edit-styles">[\s\S]*?<\/style>\s*\n?/g;
  result = result.replace(stylePattern, '');
  
  // 6. Remove Source-ID attributes
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
          if (['node_modules', '.git', '.next', 'venv', '__pycache__', 'backups', '.claude', '.claudable'].includes(entry.name)) continue;
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
    const lowerTagName = tagName.toLowerCase();
    // Skip if already has an ID or is a system tag we don't want to edit
    if (attrs.includes('data-ai-src-id') || 
        ['script', 'style', 'link', 'meta', 'br', 'hr', 'base'].includes(lowerTagName)) {
      return match;
    }
    
    const srcId = `${prefix}::${counter++}`;
    return `<${tagName}${attrs} data-ai-src-id="${srcId}"`;
  });
}

/**
 * Extract raw source fragment for a given srcId
 */
export async function getSourceFragmentBySrcId(projectPath: string, srcId: string): Promise<string> {
  const [relPath, indexStr] = srcId.split('::');
  if (indexStr === undefined) throw new Error(`Invalid srcId format: ${srcId}`);
  const targetIndex = parseInt(indexStr, 10);
  const filePath = path.join(projectPath, relPath);
  const baselinePath = path.join(projectPath, '.claudable', 'baselines', relPath);
  
  let content: string;
  try {
    content = await fs.readFile(baselinePath, 'utf8');
  } catch {
    content = await fs.readFile(filePath, 'utf8');
  }
  
  let counter = 0;
  
  // Mirror the tagRegex used in tagContentWithSourceIds
  const tagRegex = /<([a-zA-Z0-9]+)([^>]*?)(?=\/?>)/g;
  let match;
  
  while ((match = tagRegex.exec(content)) !== null) {
    const tagName = match[1];
    const attrs = match[2];
    
    // Skip system tags same as tagContentWithSourceIds
    if (attrs.includes('data-ai-src-id') || ['script', 'style', 'link', 'meta', 'br', 'hr', 'base'].includes(tagName.toLowerCase())) {
      continue;
    }
    
    if (counter === targetIndex) {
      const startIndexInContent = match.index;
      const openingTagFull = match[0];
      const isSelfClosing = content[startIndexInContent + openingTagFull.length] === '/' || content[startIndexInContent + openingTagFull.length + 1] === '/>';
      
      if (isSelfClosing) {
        const endOfTag = content.indexOf('>', startIndexInContent) + 1;
        return content.substring(startIndexInContent, endOfTag);
      }

      // Balance tags to find the end
      let balance = 1;
      const searchRegex = new RegExp(`(<${tagName}\\b[^>]*>)|(</${tagName}>)`, 'gi');
      searchRegex.lastIndex = startIndexInContent + openingTagFull.length;
      
      let smatch;
      while ((smatch = searchRegex.exec(content)) !== null) {
        if (smatch[1]) {
          if (!smatch[1].endsWith('/>')) balance++;
        } else if (smatch[2]) {
          balance--;
        }
        
        if (balance === 0) {
          return content.substring(startIndexInContent, smatch.index + smatch[0].length);
        }
      }
      // Fallback
      return content.substring(startIndexInContent, content.indexOf('>', startIndexInContent) + 1);
    }
    
    counter++;
  }
  
  throw new Error(`Source fragment not found for srcId: ${srcId}`);
}

/**
 * Apply granular changes (from CSS selectors or Source-IDs) to source content.
 * This function now performs "In-Memory Tagging" to keep source files clean.
 */
export function applyGranularChanges(content: string, changes: any[], relPath: string): string {
  // 1. Tag the content in memory so that srcId matches work
  let taggedContent = tagContentWithSourceIds(content, relPath);
  let result = taggedContent;

  for (const change of changes) {
    const { selector, srcId, type, value, attrName } = change;
    
    // Prioritize Source-ID if available
    if (srcId) {
      try {
        if (type === 'html') {
          result = updateElementHtmlBySrcId(result, srcId, value, change.originalHTML);
        } else if (type === 'attr' && attrName) {
          result = updateElementAttrBySrcId(result, srcId, attrName, value);
        }
        continue; // Successfully handled by srcId
      } catch (e) {
        console.warn(`[GranularSave] Failed to apply change for srcId "${srcId}":`, e);
      }
    }

    // Fallback to selector-based matching
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

  // 2. Strip tags before returning to ensure the source file stays clean
  return cleanupSmartEditContent(result);
}

/**
 * Performs a 3-way merge between original source, original rendered, and updated rendered HTML.
 * The goal is to preserve dynamic template tags (e.g. {{ var }}) while applying static text changes.
 */
export function performThreeWayMerge(source: string, originalRendered: string, finalRendered: string): string {
  // If no source or original rendered, we can't do a merge, just return final
  if (!source || !originalRendered) return finalRendered;
  
  // If rendered hasn't changed, return source
  if (originalRendered === finalRendered) return source;
  
  // Heuristic: If source doesn't contain template tags, just return final (fully static)
  const templatePattern = /\{\{.*?\}\}|\{%.*?%\}|<%.*?%>|\$\{.*?\}/;
  if (!templatePattern.test(source)) return finalRendered;

  // Find the largest common prefix and suffix between original and final.
  let prefixLen = 0;
  while (prefixLen < originalRendered.length && 
         prefixLen < finalRendered.length && 
         originalRendered[prefixLen] === finalRendered[prefixLen]) {
    prefixLen++;
  }
  
  let suffixLen = 0;
  while (suffixLen < (originalRendered.length - prefixLen) && 
         suffixLen < (finalRendered.length - prefixLen) && 
         originalRendered[originalRendered.length - 1 - suffixLen] === finalRendered[finalRendered.length - 1 - suffixLen]) {
    suffixLen++;
  }
  
  const originalMiddle = originalRendered.substring(prefixLen, originalRendered.length - suffixLen);
  const finalMiddle = finalRendered.substring(prefixLen, finalRendered.length - suffixLen);
  
  if (originalMiddle === finalMiddle) return source; // No real change

  // Pure insertion logic
  if (originalMiddle === "") {
    // We need both a unique prefix and a unique suffix to safely identify the insertion point
    const sourcePrefix = originalRendered.substring(Math.max(0, prefixLen - 50), prefixLen);
    const sourceSuffix = originalRendered.substring(originalRendered.length - suffixLen, originalRendered.length - suffixLen + 50);

    // Search for this specific combination: [prefix][source_content][suffix]
    // Since originalMiddle is "", in the source we expect [prefix][suffix] with POSSIBLY template tags between them.
    const sPrefixIdx = source.indexOf(sourcePrefix);
    const sSuffixIdx = source.lastIndexOf(sourceSuffix);

    if (sPrefixIdx !== -1 && sSuffixIdx !== -1 && sSuffixIdx >= sPrefixIdx + sourcePrefix.length) {
      // Insertion point is at the end of the prefix
      const insertionPoint = sPrefixIdx + sourcePrefix.length;
      return source.substring(0, insertionPoint) + finalMiddle + source.substring(insertionPoint);
    }
  }

  const sourceIndex = source.indexOf(originalMiddle);
  if (sourceIndex !== -1) {
    return source.substring(0, sourceIndex) + finalMiddle + source.substring(sourceIndex + originalMiddle.length);
  }

  // ADVANCED HEURISTIC: If exact middle match fails, try to "fuzzy" match it 
  // by identifying parts of originalMiddle that are definitely static.
  // We split originalMiddle by what looks like dynamic content in Source? 
  // No, we can't easily do that since originalMiddle IS rendered (static).
  
  // Try matching prefix and suffix individually in Source.
  const sourcePrefix = originalRendered.substring(0, prefixLen);
  const sourceSuffix = originalRendered.substring(originalRendered.length - suffixLen);
  
  // We search for the prefix and suffix in source, allowing template tags in between.
  const sPrefixIdx = source.indexOf(sourcePrefix);
  const sSuffixIdx = source.lastIndexOf(sourceSuffix);
  
  if (sPrefixIdx !== -1 && sSuffixIdx !== -1 && sPrefixIdx < sSuffixIdx) {
     // We found the boundaries!
     // Now, what's between sPrefixIdx + sourcePrefix.length and sSuffixIdx in source?
     const currentSourceMiddle = source.substring(sPrefixIdx + sourcePrefix.length, sSuffixIdx);
     
     // If the currentSourceMiddle contains template tags, we must be careful.
     // If the user's change doesn't overlap with where the template tags likely are, we can try to preserve them.
     // But a safer "Greater" approach: if there are template tags, we only replace the static text.
     
     // For now, let's implement a "Tag-Aware Replace":
     // If the middle has tags, we try to preserve them by assuming they are placeholders.
     // This is complex. A simpler way: if the change is a complete overwrite of the middle,
     // and it's static, we might have to lose the tags IF they were part of what was replaced.
     
     // However, usually the user edits the text AROUND the tags.
     // Let's try to find the template tags in currentSourceMiddle and put them back.
     const tags = [];
     let tagMatch;
     const tagRegex = /\{\{.*?\}\}|\{%.*?%\}|<%.*?%>|\$\{.*?\}/g;
     while ((tagMatch = tagRegex.exec(currentSourceMiddle)) !== null) {
       tags.push({ content: tagMatch[0], index: tagMatch.index });
     }
     
     if (tags.length > 0) {
       // We have tags! We should try to merge them into finalMiddle.
       // This is the "Holy Grail" of template preservation.
       // Heuristic: If the originalMiddle had some text that we can correlate to finalMiddle, 
       // we can position the tags.
       
       // Simplified: just return the source but with the text modifications applied to the static parts.
       // For now, let's do a safer fallback: if we found the boundaries and there are tags,
       // and we can't do a perfect merge, we'll try to keep the tags and just swap the text if possible.
     }
  }
  
  // Final fallback: If we can't find the insertion point, we MUST NOT prepend or guess.
  // Returning source means "Discard this change" which is safer than corruption.
  return source;
}

function updateElementHtmlBySrcId(content: string, srcId: string, newHtml: string, originalHtml?: string): string {
  // Escape special characters in srcId for regex
  const escapedId = srcId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  
  // 1. Find the opening tag with the specific srcId
  // We capture the tag name so we can find the matching closing tag
  const openTagRegex = new RegExp(`(<([a-zA-Z0-9]+)[^>]*\\bdata-ai-src-id=["']${escapedId}["'][^>]*>)`, 'i');
  const openMatch = content.match(openTagRegex);
  
  if (!openMatch) {
    throw new Error(`Element with data-ai-src-id="${srcId}" not found for HTML update`);
  }
  
  const openingTag = openMatch[1];
  const tagName = openMatch[2];
  const startIndex = openMatch.index! + openingTag.length;
  
  // 2. Find the matching closing tag with balancing
  // We need to handle nested tags of the same name
  let balance = 1;
  const searchRegex = new RegExp(`(<${tagName}\\b[^>]*>)|(</${tagName}>)`, 'gi');
  searchRegex.lastIndex = startIndex;
  
  let match;
  let closingTagMatch = null;
  
  while ((match = searchRegex.exec(content)) !== null) {
    if (match[1]) {
      // Found another opening tag of the same name
      // Skip self-closing tags (e.g., <div />) as they don't increment balance
      if (!match[1].endsWith('/>') && !match[1].endsWith('/ >')) {
        balance++;
      }
    } else if (match[2]) {
      // Found a closing tag of the same name
      balance--;
    }
    
    if (balance === 0) {
      closingTagMatch = match;
      break;
    }
  }
  
  if (closingTagMatch) {
    const preContent = content.substring(0, openMatch.index!);
    const postContent = content.substring(closingTagMatch.index! + closingTagMatch[0].length);
    
    // Original raw source for this tag
    const sourceFragment = content.substring(openMatch.index!, closingTagMatch.index! + closingTagMatch[0].length);
    
    // Extract inner content from source fragment
    const sourceInner = sourceFragment.substring(openingTag.length, sourceFragment.length - closingTagMatch[0].length);
    
    let replacementInner = newHtml;
    
    if (originalHtml) {
       // Perform 3-way merge to preserve template tags
       replacementInner = performThreeWayMerge(sourceInner, originalHtml, newHtml);
    }
    
    const replacement = openingTag + replacementInner + closingTagMatch[0];
    return preContent + replacement + postContent;
  }
  
  // Fallback: If balancing fails (e.g., malformed HTML), use a simple name-aware regex
  const escapedTagName = tagName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const fallbackRegex = new RegExp(`(${openTagRegex.source})([\\s\\S]*?)(<\\/${escapedTagName}>)`, 'i');
  return content.replace(fallbackRegex, `$1${newHtml}$3`);
}

function updateElementAttrBySrcId(content: string, srcId: string, attrName: string, attrValue: string): string {
  const escapedId = srcId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const tagRegex = new RegExp(`(<[a-zA-Z0-9]+[^>]*\\bdata-ai-src-id=["']${escapedId}["'][^>]*>)`, 'i');
  const match = content.match(tagRegex);
  
  if (match) {
    const fullTag = match[1];
    // Use a regex with backreferences to match quotes correctly: (\2) matches whatever (["']) matched
    const attrRegex = new RegExp(`(\\b${attrName}=)(["'])(.*?)\\2`, 'i');
    
    if (fullTag.match(attrRegex)) {
      const updatedTag = fullTag.replace(attrRegex, `$1$2${attrValue}$2`);
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
      const attrRegex = new RegExp(`(\\b${attrName}=)(["'])(.*?)\\2`, 'i');
      
      if (fullTag.match(attrRegex)) {
        const updatedTag = fullTag.replace(attrRegex, `$1$2${attrValue}$2`);
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
        const attrRegex = new RegExp(`(\\b${attrName}=)(["'])(.*?)\\2`, 'i');
        if (fullTag.match(attrRegex)) {
          const updatedTag = fullTag.replace(attrRegex, `$1$2${attrValue}$2`);
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

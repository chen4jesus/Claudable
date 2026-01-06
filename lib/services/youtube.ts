import path from 'path';
import fs from 'fs/promises';
import { getProjectById } from './project';
import { tagContentWithSourceIds } from './smart-edit-utils';
import { previewManager } from './preview';

export interface YouTubeVideo {
  title: string;
  author: string;
  date: string;
  link: string;
}

/**
 * Scrape a specific video page to get the precise upload date.
 */
async function scrapeVideoDate(url: string): Promise<string> {
  try {
    const separator = url.includes('?') ? '&' : '?';
    const localizedUrl = `${url}${separator}hl=en-US`;
    const response = await fetch(localizedUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });
    if (!response.ok) return 'Unknown Date';
    const html = await response.text();
    
    // 1. Try meta tag (most reliable for exact ISO date)
    const metaMatch = html.match(/<meta\s+itemprop=["']datePublished["']\s+content=["']([^"']*)["']/i);
    if (metaMatch && metaMatch[1]) {
       const d = new Date(metaMatch[1]);
       if (!isNaN(d.getTime())) {
         return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
       }
       return metaMatch[1];
    }
    
    // 2. Try ytInitialData as fallback
    const dataMatch = html.match(/var ytInitialData = ({.*?});/);
    if (dataMatch) {
      try {
        const data = JSON.parse(dataMatch[1]);
        const results = data.contents?.twoColumnWatchNextResults?.results?.results?.contents;
        const primaryInfo = results?.find((c: any) => c.videoPrimaryInfoRenderer)?.videoPrimaryInfoRenderer;
        const dateText = primaryInfo?.dateText?.simpleText || primaryInfo?.publishDate?.simpleText;
        if (dateText) return dateText.replace('Premiered ', '').replace('Published ', '').replace('•', '').trim();
      } catch (e) {
        // ignore parse errors
      }
    }
    
    return 'Unknown Date';
  } catch (e) {
    console.error(`[YouTubeService] Failed to scrape video date for ${url}:`, e);
    return 'Unknown Date';
  }
}

/**
 * Scrape a YouTube playlist and return a list of video details.
 */
export async function scrapeYouTubePlaylist(url: string, limit: number = 6) {
  try {
    if (!url.includes('youtube.com/playlist') && !url.includes('list=')) {
      throw new Error('Invalid YouTube playlist URL');
    }

    const separator = url.includes('?') ? '&' : '?';
    const localizedUrl = `${url}${separator}hl=en-US`;
    const response = await fetch(localizedUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch YouTube page: ${response.statusText}`);
    }

    const html = await response.text();
    const match = html.match(/var ytInitialData = ({.*?});/);
    if (!match) {
      throw new Error('Could not find playlist data in page');
    }

    const data = JSON.parse(match[1]);
    const contents = data.contents?.twoColumnBrowseResultsRenderer?.tabs?.[0]?.tabRenderer?.content?.sectionListRenderer?.contents?.[0]?.itemSectionRenderer?.contents?.[0]?.playlistVideoListRenderer?.contents;

    if (!contents) {
      throw new Error('Playlist structure not recognized');
    }

    const videos = contents
      .map((item: any): YouTubeVideo | null => {
        if (!item.playlistVideoRenderer) return null;
        const v = item.playlistVideoRenderer;
        return {
          title: v.title?.runs?.[0]?.text || 'Unknown Title',
          author: v.shortBylineText?.runs?.[0]?.text || 'Unknown Author',
          date: v.publishedTimeText?.simpleText || 'Unknown Date',
          link: `https://www.youtube.com/watch?v=${v.videoId}`,
        };
      })
      .filter((v: YouTubeVideo | null): v is YouTubeVideo => v !== null)
      .slice(0, limit);

    // Enhancement: Fetch precise dates for each video
    console.log(`[YouTubeService] Fetching precise dates for ${videos.length} videos...`);
    const enhancedVideos: YouTubeVideo[] = await Promise.all(
      videos.map(async (v: YouTubeVideo) => {
        const preciseDate = await scrapeVideoDate(v.link);
        return {
          ...v,
          date: preciseDate !== 'Unknown Date' ? preciseDate : v.date
        };
      })
    );

    return enhancedVideos;
  } catch (err) {
    console.error('[YouTubeService] Scraper Error:', err);
    throw err;
  }
}

/**
 * Generate the HTML for a carousel section based on a list of videos (fallback/default).
 */
export function generateCarouselHtml(videos: YouTubeVideo[]) {
  const itemsHtml = videos.map((v: YouTubeVideo, i: number) => `
                        <!-- Item ${i + 1} -->
                        <div class="carousel-item" style="flex: 0 0 calc(33.333% - 14px); box-sizing: border-box;">
                            <div class="card" style="border: 1px solid #ddd; border-radius: 8px; padding: 15px; height: 100%; background: #fff; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                                <div class="card-body">
                                    <h3 class="card-title" style="margin-top: 0; font-size: 1.1rem;">${v.title.replace(/\n/g, '<br>')}</h3>
                                    <p>Date: ${v.date}</p>
                                    <p>Speaker: ${v.author}</p>
                                    <br>
                                    <a href="${v.link}" target="_blank" class="btn btn-secondary youtube-btn" style="display: inline-block; padding: 6px 12px; background: #6c757d; color: #fff; text-decoration: none; border-radius: 4px;">
                                        Watch on YouTube
                                    </a>
                                </div>
                            </div>
                        </div>`).join('');

  return `
            <style id="youtube-carousel-default-styles">
                .carousel-container { position: relative; width: 100%; overflow: hidden; margin: 20px 0; }
                .carousel-wrapper { width: 100%; overflow: hidden; }
                .carousel-track { display: flex; transition: transform 0.5s ease; gap: 20px; }
                .carousel-btn { 
                    position: absolute; top: 50%; transform: translateY(-50%); 
                    background: rgba(0,0,0,0.5); color: white; border: none; 
                    width: 40px; height: 40px; cursor: pointer; border-radius: 50%; z-index: 10;
                    display: flex; align-items: center; justify-content: center; font-size: 20px;
                }
                .carousel-btn-prev { left: 10px; }
                .carousel-btn-next { right: 10px; }
                @media (max-width: 768px) { .carousel-item { flex: 0 0 calc(50% - 10px) !important; } }
                @media (max-width: 480px) { .carousel-item { flex: 0 0 100% !important; } }
            </style>

            <div class="carousel-container" style="margin-bottom: 40px;">
                <div class="carousel-wrapper">
                    <div class="carousel-track" style="transform: translateX(0);">
                        ${itemsHtml}
                    </div>
                </div>

                <!-- Carousel controls -->
                <button class="carousel-btn carousel-btn-prev" id="prevBtn">&lt;</button>
                <button class="carousel-btn carousel-btn-next" id="nextBtn">&gt;</button>
            </div>
            
            <script id="youtube-carousel-default-script">
                (function() {
                    const track = document.querySelector('.carousel-track');
                    if (!track) return;
                    
                    const prevBtn = document.getElementById('prevBtn');
                    const nextBtn = document.getElementById('nextBtn');
                    if (!prevBtn || !nextBtn) return;
                    
                    let index = 0;
                    
                    function updateCarousel() {
                        const items = track.querySelectorAll('.carousel-item');
                        if (items.length === 0) return;
                        
                        const itemsToShow = window.innerWidth > 768 ? 3 : (window.innerWidth > 480 ? 2 : 1);
                        const maxIndex = Math.max(0, items.length - itemsToShow);
                        index = Math.min(index, maxIndex);
                        
                        const itemWidth = items[0].offsetWidth + 20; // width + gap
                        track.style.transform = 'translateX(-' + (index * itemWidth) + 'px)';
                    }
                    
                    prevBtn.addEventListener('click', function() {
                        index = Math.max(0, index - 1);
                        updateCarousel();
                    });
                    
                    nextBtn.addEventListener('click', function() {
                        const items = track.querySelectorAll('.carousel-item');
                        const itemsToShow = window.innerWidth > 768 ? 3 : (window.innerWidth > 480 ? 2 : 1);
                        const maxIndex = Math.max(0, items.length - itemsToShow);
                        index = Math.min(maxIndex, index + 1);
                        updateCarousel();
                    });
                    
                    window.addEventListener('resize', updateCarousel);
                    // Initial update
                    setTimeout(updateCarousel, 100);
                })();
            </script>`;
}

/**
 * Apply video data to an HTML template snippet.
 */
function applyVideoToTemplate(template: string, video: YouTubeVideo): string {
  // Strip existing data-ai-src-id to ensure fresh ones are generated
  let result = template.replace(/\s*data-ai-src-id=["'][^"']*["']/g, '');

  console.log(`[YouTubeService] Applying video to template: ${video.title}`);

  // 1. Replace Link (href of the first <a> tag)
  result = result.replace(/(<a\s+[^>]*href=["'])([^"']*)(["'])/i, `$1${video.link}$3`);

  // 2. Replace Title (surgical)
  const titleRegex = /(<[^>]*class=["'][^"']*card-title[^"']*["'][^>]*>)([\s\S]*?)(<\/[^>]+>)|(<h[3-5][^>]*>)([\s\S]*?)(<\/h[3-5]>)/i;
  result = result.replace(titleRegex, (match, p1, p2, p3, p4, p5, p6) => {
    const openTag = p1 || p4;
    const closeTag = p3 || p6;
    const newTitle = video.title.replace(/\n/g, '<br>');
    return `${openTag}${newTitle}${closeTag}`;
  });

  // 3. Replace Date
  result = result.replace(/(Date:\s*)([\s\S]*?)(<\/p>|<\/div>|<br>|<\/span>)/i, `$1${video.date}$3`);

  // 4. Replace Speaker/Author
  result = result.replace(/(Speaker:\s*|Author:\s*)([\s\S]*?)(<\/p>|<\/div>|<br>|<\/span>)/i, `$1${video.author}$3`);

  return result;
}

/**
 * Scrape a YouTube playlist and inject a carousel into a target HTML file.
 */
export async function injectYoutubeCarousel(projectId: string, relFilePath: string, playlistUrl: string, limit: number = 6) {
  console.log(`[YouTubeService] Starting injection for project ${projectId}, file ${relFilePath}`);
  const project = await getProjectById(projectId);
  if (!project) throw new Error('Project not found');

  const repoPath = project.repoPath || path.join('data', 'projects', project.id);
  const projectPath = path.isAbsolute(repoPath) ? repoPath : path.resolve(process.cwd(), repoPath);
  const filePath = path.join(projectPath, relFilePath);

  try {
    const videos = await scrapeYouTubePlaylist(playlistUrl, limit);
    console.log(`[YouTubeService] Scraped ${videos.length} videos`);
    if (videos.length > 0) {
      console.log(`[YouTubeService] First video: "${videos[0].title}"`);
    } else {
      console.warn('[YouTubeService] No videos found to inject');
    }

    let content = await fs.readFile(filePath, 'utf-8');
    const originalLength = content.length;

    const trackClass = 'carousel-track';
    const itemClass = 'carousel-item';

    // 1. Try to find the carousel-track
    const trackRegex = new RegExp(`<div[^>]*class=["'][^"']*${trackClass}[^"']*["'][^>]*>`, 'i');
    const trackMatch = content.match(trackRegex);

    if (trackMatch) {
      console.log(`[YouTubeService] Identified ${trackClass} at index ${trackMatch.index}`);
      const trackStartIndex = trackMatch.index!;
      const childrenStartIndex = trackStartIndex + trackMatch[0].length;
      
      // Find the closing </div> of the track
      let openDivs = 1;
      let trackEndIndex = -1;
      for (let i = childrenStartIndex; i < content.length - 5; i++) {
        if (content.substring(i, i + 4).toLowerCase() === '<div') openDivs++;
        else if (content.substring(i, i + 6).toLowerCase() === '</div>') {
          openDivs--;
          if (openDivs === 0) {
            trackEndIndex = i;
            break;
          }
        }
      }

      if (trackEndIndex !== -1) {
        const trackInnerHtml = content.substring(childrenStartIndex, trackEndIndex);
        
        // 2. Try to extract a template item
        const itemRegex = new RegExp(`<div[^>]*class=["'][^"']*${itemClass}[^"']*["'][^>]*>`, 'i');
        const itemMatch = trackInnerHtml.match(itemRegex);
        let template = '';
        
        if (itemMatch) {
          const itemStartIndex = itemMatch.index!;
          const itemChildrenStartIndex = itemStartIndex + itemMatch[0].length;
          let itemOpenDivs = 1;
          let itemEndIndex = -1;
          
          for (let i = itemChildrenStartIndex; i < trackInnerHtml.length - 5; i++) {
            if (trackInnerHtml.substring(i, i + 4).toLowerCase() === '<div') itemOpenDivs++;
            else if (trackInnerHtml.substring(i, i + 6).toLowerCase() === '</div>') {
              itemOpenDivs--;
              if (itemOpenDivs === 0) {
                itemEndIndex = i + 6;
                break;
              }
            }
          }
          
          if (itemEndIndex !== -1) {
            template = trackInnerHtml.substring(itemStartIndex, itemEndIndex);
            console.log(`[YouTubeService] Extracted template item (length ${template.length})`);
          }
        }

        if (template && videos.length > 0) {
          const newItemsHtml = videos.map(video => applyVideoToTemplate(template, video)).join('\n');
          content = content.substring(0, childrenStartIndex) + '\n' + newItemsHtml + '\n' + content.substring(trackEndIndex);
          console.log(`[YouTubeService] Replaced track content using template.`);
        } else {
          // Fallback: Just replace the content of the track with generated HTML
          const generatedItems = videos.map((v, i) => `
                        <div class="carousel-item" style="flex: 0 0 33.3333%;">
                            <div class="card">
                                <div class="card-body">
                                    <h3 class="card-title">${v.title.replace(/\n/g, '<br>')}</h3>
                                    <p>Date: ${v.date}</p>
                                    <p>Speaker: ${v.author}</p>
                                    <br>
                                    <a href="${v.link}" target="_blank" class="btn btn-secondary youtube-btn">
                                        <i class="fab fa-youtube"></i> Watch on YouTube
                                    </a>
                                </div>
                            </div>
                        </div>`).join('\n');
          content = content.substring(0, childrenStartIndex) + '\n' + generatedItems + '\n' + content.substring(trackEndIndex);
          console.log(`[YouTubeService] Replaced track content using fallback generator.`);
        }
      }
    } else {
      // 3. Fallback: No track found, inject a new carousel container
      console.log(`[YouTubeService] No ${trackClass} found, injecting full carousel container.`);
      const carouselHtml = generateCarouselHtml(videos);
      if (content.includes('</h2>')) {
        content = content.replace('</h2>', '</h2>\n' + carouselHtml);
      } else if (content.includes('</body>')) {
        content = content.replace('</body>', carouselHtml + '\n</body>');
      } else {
        content += '\n' + carouselHtml;
      }
    }

    const taggedContent = tagContentWithSourceIds(content, relFilePath);
    await fs.writeFile(filePath, taggedContent, 'utf-8');
    
    console.log(`[YouTubeService] Injection complete. Final length: ${taggedContent.length} (diff: ${taggedContent.length - originalLength})`);
    
    await previewManager.updateProjectFileBaseline(projectId, relFilePath);
    
    return { success: true, videoCount: videos.length };
  } catch (err) {
    console.error('[YouTubeService] carousel injection failed:', err);
    throw err;
  }
}

import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const { url } = await req.json();

    if (!url) {
      return NextResponse.json({ success: false, error: 'URL is required' }, { status: 400 });
    }

    if (!url.includes('youtube.com/playlist') && !url.includes('list=')) {
      return NextResponse.json({ success: false, error: 'Invalid YouTube playlist URL' }, { status: 400 });
    }

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    });

    if (!response.ok) {
      return NextResponse.json({ success: false, error: `Failed to fetch YouTube page: ${response.statusText}` }, { status: response.status });
    }

    const html = await response.text();
    
    // Extract ytInitialData
    const match = html.match(/var ytInitialData = ({.*?});/);
    if (!match) {
      return NextResponse.json({ success: false, error: 'Could not find playlist data in page' }, { status: 500 });
    }

    const data = JSON.parse(match[1]);
    let videos = [];

    try {
      // Navigate to the video list
      const contents = data.contents?.twoColumnBrowseResultsRenderer?.tabs?.[0]?.tabRenderer?.content?.sectionListRenderer?.contents?.[0]?.itemSectionRenderer?.contents?.[0]?.playlistVideoListRenderer?.contents;

      if (!contents) {
        return NextResponse.json({ success: false, error: 'Playlist structure not recognized' }, { status: 500 });
      }

      videos = contents
        .map((item: any) => {
          if (!item.playlistVideoRenderer) return null;
          const v = item.playlistVideoRenderer;
          return {
            title: v.title?.runs?.[0]?.text || 'Unknown Title',
            author: v.shortBylineText?.runs?.[0]?.text || 'Unknown Author',
            date: v.publishedTimeText?.simpleText || 'Unknown Date',
            link: `https://www.youtube.com/watch?v=${v.videoId}`,
          };
        })
        .filter((v: any) => v !== null);

    } catch (err) {
      console.error('Error parsing YouTube data:', err);
      return NextResponse.json({ success: false, error: 'Failed to parse playlist data' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      data: {
        title: data.metadata?.playlistMetadataRenderer?.title || 'YouTube Playlist',
        videoCount: videos.length,
        videos,
      },
    });
  } catch (err) {
    console.error('YouTube Scraper Error:', err);
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : 'Internal Server Error' }, { status: 500 });
  }
}

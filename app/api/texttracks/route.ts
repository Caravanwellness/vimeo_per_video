import { NextResponse } from "next/server";

const VIMEO_TOKEN = process.env.VIMEO_TOKEN!;
const API_SECRET = process.env.API_SECRET;

// Fetch texttracks for a single video by ID
async function getTextTracksForVideo(videoId: string) {
  try {
    // Fetch video info
    const videoResponse = await fetch(`https://api.vimeo.com/videos/${videoId}`, {
      headers: {
        Authorization: `Bearer ${VIMEO_TOKEN}`,
        Accept: "application/vnd.vimeo.*+json;version=3.4",
      },
    });

    if (!videoResponse.ok) {
      const text = await videoResponse.text();
      return NextResponse.json({ error: "Video not found or access denied", detail: text }, { status: videoResponse.status });
    }

    const videoData = await videoResponse.json();

    // Fetch texttracks for this video
    const texttrackResponse = await fetch(`https://api.vimeo.com/videos/${videoId}/texttracks`, {
      headers: {
        Authorization: `Bearer ${VIMEO_TOKEN}`,
        Accept: "application/vnd.vimeo.*+json;version=3.4",
      },
    });

    if (!texttrackResponse.ok) {
      const text = await texttrackResponse.text();
      return NextResponse.json({ error: "Failed to fetch texttracks", detail: text }, { status: texttrackResponse.status });
    }

    const texttrackData = await texttrackResponse.json();

    if (!texttrackData.data || texttrackData.data.length === 0) {
      return NextResponse.json({
        success: true,
        video: {
          uri: videoData.uri,
          name: videoData.name,
          texttracks: { data: [] }
        }
      });
    }

    // Fetch each texttrack's content
    const texttracksWithContent = await Promise.all(
      texttrackData.data.map(async (track: any) => {
        try {
          // Fetch the actual VTT/SRT content if link exists
          let vttContent = null;
          if (track.link) {
            const vttResponse = await fetch(track.link);
            if (vttResponse.ok) {
              vttContent = await vttResponse.text();
            }
          }

          return {
            ...track,
            vtt_content: vttContent
          };
        } catch (err) {
          return { ...track, vtt_content: null, error: "Error fetching track content" };
        }
      })
    );

    return NextResponse.json({
      success: true,
      video: {
        uri: videoData.uri,
        name: videoData.name,
        texttracks: { data: texttracksWithContent }
      }
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}

export async function GET(req: Request) {
  try {
    // Check API secret
    const authHeader = req.headers.get('authorization');
    const providedSecret = authHeader?.replace('Bearer ', '');

    if (!API_SECRET || !providedSecret || providedSecret !== API_SECRET) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!VIMEO_TOKEN) {
      return NextResponse.json({ error: "Missing VIMEO_TOKEN" }, { status: 500 });
    }

    const searchParams = new URL(req.url).searchParams;
    const videoId = searchParams.get("video_id");

    // video_id is required
    if (!videoId) {
      return NextResponse.json(
        { error: "video_id parameter is required" },
        { status: 400 }
      );
    }

    return await getTextTracksForVideo(videoId);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}

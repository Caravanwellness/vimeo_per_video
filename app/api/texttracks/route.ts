import { NextResponse } from "next/server";

const VIMEO_TOKEN = process.env.VIMEO_TOKEN!;
const USER_ID = process.env.VIMEO_USER_ID;        // for Project/Folder
const PROJECT_ID = process.env.VIMEO_PROJECT_ID;  // for Project/Folder
const ALBUM_ID = process.env.VIMEO_ALBUM_ID;      // for Album/Showcase
const API_SECRET = process.env.API_SECRET;

// Get text tracks from all videos in album or project
function vimeoUrl(searchParams: URLSearchParams) {
  const page = searchParams.get("page") ?? "1";
  const perPage = searchParams.get("per_page") ?? "20";

  const base = ALBUM_ID
    ? `https://api.vimeo.com/albums/${ALBUM_ID}/videos`
    : `https://api.vimeo.com/users/${USER_ID}/projects/${PROJECT_ID}/videos`;

  const url = new URL(base);
  url.searchParams.set("page", page);
  url.searchParams.set("per_page", perPage);
  url.searchParams.set("fields", "uri,name,texttracks");
  return url.toString();
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
    if (!ALBUM_ID && !(USER_ID && PROJECT_ID)) {
      return NextResponse.json(
        { error: "Set either VIMEO_ALBUM_ID or both VIMEO_USER_ID and VIMEO_PROJECT_ID" },
        { status: 500 }
      );
    }

    const url = vimeoUrl(new URL(req.url).searchParams);

    const r = await fetch(url, {
      headers: {
        Authorization: `Bearer ${VIMEO_TOKEN}`,
        Accept: "application/vnd.vimeo.*+json;version=3.4",
      },
      cache: "no-store",
    });

    if (!r.ok) {
      const text = await r.text();
      return NextResponse.json({ error: "Vimeo error", detail: text }, { status: r.status });
    }

    const data = await r.json();

    // Fetch texttrack content for each video
    const videosWithTexttracks = await Promise.all(
      data.data.map(async (video: any) => {
        if (!video.texttracks || video.texttracks.data.length === 0) {
          return { ...video, texttrack_content: null };
        }

        // Fetch each texttrack's content
        const texttracksWithContent = await Promise.all(
          video.texttracks.data.map(async (track: any) => {
            try {
              const trackResponse = await fetch(`https://api.vimeo.com${track.uri}`, {
                headers: {
                  Authorization: `Bearer ${VIMEO_TOKEN}`,
                  Accept: "application/vnd.vimeo.*+json;version=3.4",
                },
              });

              if (!trackResponse.ok) {
                return { ...track, content: null, error: "Failed to fetch content" };
              }

              const trackData = await trackResponse.json();

              // Also fetch the actual VTT/SRT content if link exists
              let vttContent = null;
              if (trackData.link) {
                const vttResponse = await fetch(trackData.link);
                if (vttResponse.ok) {
                  vttContent = await vttResponse.text();
                }
              }

              return {
                ...track,
                metadata: trackData,
                vtt_content: vttContent
              };
            } catch (err) {
              return { ...track, content: null, error: "Error fetching track" };
            }
          })
        );

        return { ...video, texttracks: { data: texttracksWithContent } };
      })
    );

    return NextResponse.json({
      success: true,
      data: {
        ...data,
        data: videosWithTexttracks
      }
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}

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

    return NextResponse.json({
      success: true,
      data: data
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}

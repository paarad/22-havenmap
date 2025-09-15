import { NextRequest, NextResponse } from "next/server";
import { runSuggestPipeline } from "@/lib/pipeline";

export const runtime = "edge";

export async function POST(req: NextRequest) {
	const { lat, lng, phase } = await req.json();
	if (typeof lat !== "number" || typeof lng !== "number") {
		return NextResponse.json({ error: "lat/lng required" }, { status: 400 });
	}
	const res = await runSuggestPipeline({ lat, lng }, { mode: "full", phase });
	return NextResponse.json(res, {
		headers: { "Cache-Control": "public, max-age=60, s-maxage=60" }
	});
} 
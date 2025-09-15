import { NextRequest, NextResponse } from "next/server";
import { runSuggestPipeline } from "@/lib/pipeline";

export const runtime = "edge";

type Origin = { lat: number; lng: number; name?: string };

type Candidate = {
	id: string;
	name: string;
	lat: number;
	lng: number;
	distanceKm: number;
	rationale: string;
	waterKm?: number;
	forestKm?: number;
	hasRiver?: boolean;
	hasLake?: boolean;
	hasWater?: boolean;
	hasForest?: boolean;
	place?: string;
	population?: number;
	bearingDeg?: number;
	score?: number;
	riskDelta?: number;
};

export async function POST(req: NextRequest) {
	try {
		const { origin } = (await req.json()) as { origin: Origin };
		if (!origin || typeof origin.lat !== "number" || typeof origin.lng !== "number") {
			return NextResponse.json({ candidates: [] }, { status: 400 });
		}
		const out = await runSuggestPipeline({ lat: origin.lat, lng: origin.lng, name: origin.name }, { mode: "lite" });
		return NextResponse.json(out as { candidates: Candidate[] }, { status: 200 });
	} catch (e) {
		return NextResponse.json({ candidates: [] }, { status: 200 });
	}
} 
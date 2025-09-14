import { NextRequest, NextResponse } from "next/server";
import { haversineKm } from "@/lib/heuristics";

export const runtime = "edge";

type Origin = { lat: number; lng: number; name?: string };

type Candidate = {
	id: string;
	name: string;
	lat: number;
	lng: number;
	distanceKm: number;
	rationale: string;
};

export async function POST(req: NextRequest) {
	try {
		const { origin } = (await req.json()) as { origin: Origin };
		if (!origin || typeof origin.lat !== "number" || typeof origin.lng !== "number") {
			return NextResponse.json({ candidates: [] }, { status: 400 });
		}
		const radiusM = 30000; // 30 km
		const lat = origin.lat;
		const lon = origin.lng;
		const overpass = `[
			out:json][timeout:10];
		(
			node["place"~"^(town|village|hamlet)$"](around:${radiusM},${lat},${lon});
		);
		out center 50;
		// nearby water and forest
		(
			way["waterway"="river"](around:${radiusM},${lat},${lon});
			relation["waterway"="river"](around:${radiusM},${lat},${lon});
			node["natural"="water"](around:${radiusM},${lat},${lon});
			way["natural"="water"](around:${radiusM},${lat},${lon});
			way["landuse"="forest"](around:${radiusM},${lat},${lon});
			way["natural"="wood"](around:${radiusM},${lat},${lon});
		);
		out center 200;
		`;
		const res = await fetch("https://overpass-api.de/api/interpreter", {
			method: "POST",
			headers: { "Content-Type": "application/x-www-form-urlencoded" },
			body: new URLSearchParams({ data: overpass }),
		});
		if (!res.ok) return NextResponse.json({ candidates: [] }, { status: 200 });
		const data = (await res.json()) as { elements?: any[] };
		const elements = data.elements || [];
		const places = elements.filter((e) => e.type === "node" && e.tags && e.tags.place);
		const waters = elements.filter((e) => (e.tags?.waterway === "river") || e.tags?.natural === "water");
		const forests = elements.filter((e) => e.tags?.landuse === "forest" || e.tags?.natural === "wood");

		const placeCandidates: Candidate[] = places
			.map((p) => {
				const plat = p.lat ?? p.center?.lat;
				const plon = p.lon ?? p.center?.lon;
				if (typeof plat !== "number" || typeof plon !== "number") return null;
				const distanceKm = haversineKm({ lat, lng: lon }, { lat: plat, lng: plon });
				return {
					id: String(p.id),
					name: p.tags?.name || p.tags?.["name:en"] || p.tags?.place || "Locality",
					lat: plat,
					lng: plon,
					distanceKm,
					rationale: "",
				} as Candidate;
			})
			.filter(Boolean) as Candidate[];

		// Helper to find nearest distance in km
		const nearestDistance = (arr: any[], lat0: number, lon0: number): number | null => {
			let best: number | null = null;
			for (const f of arr) {
				const flat = f.lat ?? f.center?.lat;
				const flon = f.lon ?? f.center?.lon;
				if (typeof flat !== "number" || typeof flon !== "number") continue;
				const d = haversineKm({ lat: lat0, lng: lon0 }, { lat: flat, lng: flon });
				if (best === null || d < best) best = d;
			}
			return best;
		};

		const enriched: Candidate[] = placeCandidates
			.filter((c) => c.distanceKm >= 8 && c.distanceKm <= 40)
			.slice(0, 24)
			.map((c) => {
				const waterKm = nearestDistance(waters, c.lat, c.lng);
				const forestKm = nearestDistance(forests, c.lat, c.lng);
				const parts: string[] = [];
				if (typeof waterKm === "number") parts.push(`perennial water ~${Math.round(waterKm)} km`);
				if (typeof forestKm === "number") parts.push(`tree cover within ~${Math.round(forestKm)} km`);
				const rationale = parts.length ? parts.join("; ") : "outside major clusters";
				return { ...c, rationale };
			});

		// Sort by distance ascending
		const sorted = enriched.sort((a, b) => a.distanceKm - b.distanceKm).slice(0, 12);
		return NextResponse.json({ candidates: sorted }, { status: 200 });
	} catch (e) {
		return NextResponse.json({ candidates: [] }, { status: 200 });
	}
} 
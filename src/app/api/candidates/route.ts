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

type OverpassElement = {
	id: number | string;
	type: "node" | "way" | "relation";
	lat?: number;
	lon?: number;
	center?: { lat: number; lon: number };
	tags?: Record<string, string>;
};

export async function POST(req: NextRequest) {
	try {
		const { origin } = (await req.json()) as { origin: Origin };
		if (!origin || typeof origin.lat !== "number" || typeof origin.lng !== "number") {
			return NextResponse.json({ candidates: [] }, { status: 400 });
		}
		const radiusM = 80000; // 80 km
		const lat = origin.lat;
		const lon = origin.lng;
		const overpass = `[
			out:json][timeout:15];
		(
			node["place"~"^(town|village|hamlet)$"](around:${radiusM},${lat},${lon});
		);
		out center 200;
		// nearby water and forest
		(
			way["waterway"="river"](around:${radiusM},${lat},${lon});
			relation["waterway"="river"](around:${radiusM},${lat},${lon});
			node["natural"="water"](around:${radiusM},${lat},${lon});
			way["natural"="water"](around:${radiusM},${lat},${lon});
			way["landuse"="forest"](around:${radiusM},${lat},${lon});
			way["natural"="wood"](around:${radiusM},${lat},${lon});
		);
		out center 400;
		`;
		const res = await fetch("https://overpass-api.de/api/interpreter", {
			method: "POST",
			headers: { "Content-Type": "application/x-www-form-urlencoded" },
			body: new URLSearchParams({ data: overpass }),
		});
		if (!res.ok) return NextResponse.json({ candidates: [] }, { status: 200 });
		const data = (await res.json()) as { elements?: OverpassElement[] };
		const elements = data.elements || [];
		const places = elements.filter((e) => e.type === "node" && e.tags && e.tags.place);
		const rivers = elements.filter((e) => e.tags?.waterway === "river");
		const lakes = elements.filter((e) => e.tags?.natural === "water");
		const forests = elements.filter((e) => e.tags?.landuse === "forest" || e.tags?.natural === "wood");

		const toBearing = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
			const dLon = ((lon2 - lon1) * Math.PI) / 180;
			const y = Math.sin(dLon) * Math.cos((lat2 * Math.PI) / 180);
			const x = Math.cos((lat1 * Math.PI) / 180) * Math.sin((lat2 * Math.PI) / 180) - Math.sin((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.cos(dLon);
			const brng = (Math.atan2(y, x) * 180) / Math.PI;
			return (brng + 360) % 360;
		};

		const placeCandidates: Candidate[] = places
			.map((p) => {
				const plat = p.lat ?? p.center?.lat;
				const plon = p.lon ?? p.center?.lon;
				if (typeof plat !== "number" || typeof plon !== "number") return null;
				const distanceKm = haversineKm({ lat, lng: lon }, { lat: plat, lng: plon });
				const pop = p.tags?.population ? Number(p.tags.population) : undefined;
				return {
					id: String(p.id),
					name: p.tags?.name || p.tags?.["name:en"] || (p.tags as Record<string, string>)?.place || "Locality",
					lat: plat,
					lng: plon,
					distanceKm,
					rationale: "",
					place: p.tags?.place,
					population: Number.isFinite(pop) ? pop : undefined,
					bearingDeg: toBearing(lat, lon, plat, plon),
				} as Candidate;
			})
			.filter(Boolean) as Candidate[];

		const nearestDistance = (arr: OverpassElement[], lat0: number, lon0: number): number | null => {
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

		const scoreDistance = (d: number): number => {
			// Peak at ~40 km, drop to 0 near 5 km and 100 km
			const peak = 40;
			const spread = 35;
			const val = Math.max(0, 1 - Math.abs(d - peak) / spread);
			return Math.round(val * 12); // up to 12 points
		};

		const enriched: Candidate[] = placeCandidates
			.filter((c) => c.distanceKm >= 15 && c.distanceKm <= 90)
			.slice(0, 300)
			.map((c) => {
				const riverKm = nearestDistance(rivers, c.lat, c.lng) ?? undefined;
				const lakeKm = nearestDistance(lakes, c.lat, c.lng) ?? undefined;
				const forestKm = nearestDistance(forests, c.lat, c.lng) ?? undefined;
				const finite = (n?: number) => (typeof n === "number" && isFinite(n) ? n : undefined);
				const r = finite(riverKm);
				const l = finite(lakeKm);
				const waterKm = r != null && l != null ? Math.min(r, l) : (r ?? l);
				const hasRiver = typeof riverKm === "number" && riverKm <= 2; // was 5
				const hasLake = typeof lakeKm === "number" && lakeKm <= 1.5; // was 3
				const hasWater = (hasRiver || hasLake) || (typeof waterKm === "number" && waterKm <= 2); // was 5
				const hasForest = typeof forestKm === "number" && forestKm <= 5; // was 10
				const waterScore = typeof waterKm === "number" ? (waterKm <= 1 ? 20 : waterKm <= 2 ? 12 : waterKm <= 3 ? 6 : 0) : 0;
				const forestScore = typeof forestKm === "number" ? (forestKm <= 3 ? 10 : forestKm <= 5 ? 6 : 0) : 0;
				const distScore = scoreDistance(c.distanceKm);
				const placePenalty = c.place === "town" ? -4 : c.place === "village" ? 0 : 2;
				const popPenalty = c.population ? (c.population > 20000 ? -6 : c.population > 5000 ? -3 : c.population > 1500 ? -1 : 0) : 0;
				const score = waterScore + forestScore + distScore + placePenalty + popPenalty;
				// Deterministic relative risk improvement based on score; clamp to [-40, -8]
				const riskDelta = -Math.min(40, Math.max(8, 10 + Math.round(score)));
				const parts: string[] = [];
				if (typeof waterKm === "number") parts.push(`water ~${Math.round(waterKm)} km`);
				if (typeof forestKm === "number") parts.push(`forest ~${Math.round(forestKm)} km`);
				parts.push(`${Math.round(c.distanceKm)} km from city`);
				const rationale = parts.join(" • ");
				return { ...c, rationale, waterKm, forestKm, hasRiver, hasLake, hasWater, hasForest, score, riskDelta };
			});

		// Diversify by bearing (8 bins), greedy pick top by score
		const bins = new Map<number, number>();
		const byScore = enriched.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
		const picked: Candidate[] = [];
		for (const c of byScore) {
			const bin = Math.floor(((c.bearingDeg ?? 0) + 22.5) / 45) % 8;
			const count = bins.get(bin) ?? 0;
			if (count >= 1) continue; // at most 1 per bin initially
			picked.push(c);
			bins.set(bin, count + 1);
			if (picked.length >= 6) break;
		}
		// If less than 6 (sparse area), fill remaining by score
		if (picked.length < 6) {
			for (const c of byScore) {
				if (picked.find((p) => p.id === c.id)) continue;
				picked.push(c);
				if (picked.length >= 6) break;
			}
		}

		return NextResponse.json({ candidates: picked }, { status: 200 });
	} catch (e) {
		return NextResponse.json({ candidates: [] }, { status: 200 });
	}
} 
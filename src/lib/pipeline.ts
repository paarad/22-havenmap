import { RULES } from "@/config/scoring";
import { computeScores, Facts as Facts2 } from "@/lib/scoring2";
import { haversineKm } from "@/lib/heuristics";
import { latLngToCell } from "h3-js";

export type Origin = { lat: number; lng: number; name?: string };

export type PipelineOptions = { mode: "full" | "lite"; phase?: "panic" | "transit" | "recovery" };

export type SuggestItem = { id: string; name?: string; facts: Facts2; scores: { risk:number; resources:number; access:number; stability:number; hazards:number; total:number } };
export type SuggestResponse = { items: SuggestItem[]; meta: { phase: "panic"|"transit"|"recovery"; version: string } };

export type LiteCandidate = {
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
export type LiteResponse = { candidates: LiteCandidate[]; meta: { phase: "panic"|"transit"|"recovery"; version: string } };

export async function runSuggestPipeline(origin: Origin, opts: PipelineOptions): Promise<SuggestResponse | LiteResponse> {
	const radiusM = 80000;
	const lat = origin.lat;
	const lon = origin.lng;
	const overpass = `[
		out:json][timeout:25];
	(
		node["place"~"^(town|village|hamlet)$"](around:${radiusM},${lat},${lon});
	);
	out center 200;
	(
		way["waterway"="river"](around:${radiusM},${lat},${lon});
		relation["waterway"="river"](around:${radiusM},${lat},${lon});
		node["natural"="water"](around:${radiusM},${lat},${lon});
		way["natural"="water"](around:${radiusM},${lat},${lon});
		way["landuse"="forest"](around:${radiusM},${lat},${lon});
		way["natural"="wood"](around:${radiusM},${lat},${lon});
		node["amenity"="clinic"](around:${radiusM},${lat},${lon});
		node["amenity"="hospital"](around:${radiusM},${lat},${lon});
		way["amenity"="hospital"](around:${radiusM},${lat},${lon});
		node["amenity"="pharmacy"](around:${radiusM},${lat},${lon});
		node["amenity"="fuel"](around:${radiusM},${lat},${lon});
		node["shop"~"^(supermarket|hypermarket)$"](around:${radiusM},${lat},${lon});
		node["amenity"="mall"](around:${radiusM},${lat},${lon});
		node["highway"="motorway_junction"](around:${radiusM},${lat},${lon});
		way["highway"~"^(motorway|trunk|primary)$"](around:${radiusM},${lat},${lon});
	);
	out center 400;`;
	const res = await fetch("https://overpass-api.de/api/interpreter", {
		method: "POST",
		headers: { "Content-Type": "application/x-www-form-urlencoded" },
		body: new URLSearchParams({ data: overpass }),
	});
	if (!res.ok) return opts.mode === "lite" ? { candidates: [], meta: { phase: opts.phase ?? RULES.phase, version: "v1" } } : { items: [], meta: { phase: opts.phase ?? RULES.phase, version: "v1" } };
	const data = (await res.json()) as { elements?: OverpassElement[] };
	const elements = data.elements || [];

	const places = elements.filter((e) => e.type === "node" && e.tags && e.tags.place);
	const rivers = elements.filter((e) => e.tags?.waterway === "river");
	const lakes = elements.filter((e) => e.tags?.natural === "water");
	const forests = elements.filter((e) => e.tags?.landuse === "forest" || e.tags?.natural === "wood");
	const clinics = elements.filter((e) => e.tags?.amenity === "clinic");
	const hospitals = elements.filter((e) => e.tags?.amenity === "hospital");
	const pharmacies = elements.filter((e) => e.tags?.amenity === "pharmacy");
	const fuel = elements.filter((e) => e.tags?.amenity === "fuel");
	const hypermarkets = elements.filter((e) => e.tags?.shop === "hypermarket" || e.tags?.shop === "supermarket" || e.tags?.amenity === "mall");
	const junctions = elements.filter((e) => e.tags?.highway === "motorway_junction");
	const townPlaces = places.filter((p) => p.tags?.place === "town");

	const toBearing = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
		const dLon = ((lon2 - lon1) * Math.PI) / 180;
		const y = Math.sin(dLon) * Math.cos((lat2 * Math.PI) / 180);
		const x = Math.cos((lat1 * Math.PI) / 180) * Math.sin((lat2 * Math.PI) / 180) - Math.sin((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.cos(dLon);
		const brng = (Math.atan2(y, x) * 180) / Math.PI;
		return (brng + 360) % 360;
	};

	const placeCandidates: LiteCandidate[] = places
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
			} as LiteCandidate;
		})
		.filter(Boolean) as LiteCandidate[];

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
	const countWithin = (arr: OverpassElement[], lat0: number, lon0: number, km: number): number => {
		let n = 0;
		for (const f of arr) {
			const flat = f.lat ?? f.center?.lat;
			const flon = f.lon ?? f.center?.lon;
			if (typeof flat !== "number" || typeof flon !== "number") continue;
			const d = haversineKm({ lat: lat0, lng: lon0 }, { lat: flat, lng: flon });
			if (d <= km) n++;
		}
		return n;
	};

	const itemsEnriched = placeCandidates
		.filter((c) => c.distanceKm >= 15 && c.distanceKm <= 120)
		.slice(0, 300)
		.map((c) => {
			const riverKm = nearestDistance(rivers, c.lat, c.lng) ?? undefined;
			const lakeKm = nearestDistance(lakes, c.lat, c.lng) ?? undefined;
			const forestKm = nearestDistance(forests, c.lat, c.lng) ?? undefined;
			const waterKm = Math.min(riverKm ?? Infinity, lakeKm ?? Infinity);
			const hasRiver = typeof riverKm === "number" && riverKm <= RULES.thresholds.waterRiverKm;
			const hasLake = typeof lakeKm === "number" && lakeKm <= RULES.thresholds.waterLakeKm;
			const hasWater = hasRiver || hasLake || (typeof waterKm === "number" && isFinite(waterKm) && waterKm <= RULES.thresholds.waterRiverKm);
			const hasForest = typeof forestKm === "number" && forestKm <= RULES.thresholds.forestKm;
			const nearestTownKm = nearestDistance(townPlaces, c.lat, c.lng) ?? 1e9;
			const urbanWithin5 = (c.place === "town") || (nearestTownKm <= RULES.thresholds.urbanWithinKm);
			const facts: Facts2 = {
				lat: c.lat,
				lng: c.lng,
				dist_km_from_user: c.distanceKm,
				river_km: riverKm,
				lake_km: lakeKm,
				forest_within_km: forestKm,
				gardenable_within3km: false,
				fish_possible: hasWater,
				urban_within5km: urbanWithin5,
				pop_density: undefined,
				delta_risk_vs_city: undefined,
				exits_count10km: countWithin(junctions, c.lat, c.lng, 10),
				clinic_km: nearestDistance(clinics, c.lat, c.lng) ?? undefined,
				hospital_km: nearestDistance(hospitals, c.lat, c.lng) ?? undefined,
				floodplain: undefined,
				wildfire_risk: undefined,
				storm_surge: undefined,
				single_bridge: undefined,
				elevation_m: undefined,
				slope_pct: undefined,
				magnets: {
					bigHospitals: countWithin(hospitals, c.lat, c.lng, RULES.thresholds.lootRadiusKm),
					hypermarkets: countWithin(hypermarkets, c.lat, c.lng, RULES.thresholds.lootRadiusKm),
					fuel: countWithin(fuel, c.lat, c.lng, RULES.thresholds.lootRadiusKm),
					pharmacies: countWithin(pharmacies, c.lat, c.lng, RULES.thresholds.lootRadiusKm),
				},
			};
			const scores = computeScores(facts, opts.phase);
			return { base: c, facts, scores, hasWater, hasForest, waterKm, riverKm, lakeKm } as const;
		});

	// Prefilter: lite keeps resource-rich areas even if near towns; full stays rural + resource
	let prefiltered = itemsEnriched.filter((x) => {
		const resourceOk = x.hasWater || x.hasForest;
		if (opts.mode === "lite") return resourceOk;
		return resourceOk && !x.facts.urban_within5km;
	});
	if (opts.mode === "lite" && prefiltered.length === 0) {
		// Fallback: if nothing resource-qualified, allow top-scoring anywhere
		prefiltered = itemsEnriched;
	}
	if (!prefiltered.length) return opts.mode === "lite" ? { candidates: [], meta: { phase: opts.phase ?? RULES.phase, version: "v1" } } : { items: [], meta: { phase: opts.phase ?? RULES.phase, version: "v1" } };

	const sorted = [...prefiltered].sort((a, b) => {
		if (b.scores.total !== a.scores.total) return b.scores.total - a.scores.total;
		const ar = a.facts.delta_risk_vs_city ?? 0;
		const br = b.facts.delta_risk_vs_city ?? 0;
		if (br !== ar) return br - ar;
		const aid = latLngToCell(a.facts.lat, a.facts.lng, RULES.h3Res);
		const bid = latLngToCell(b.facts.lat, b.facts.lng, RULES.h3Res);
		return aid.localeCompare(bid);
	});

	const pickMax = opts.mode === "lite" ? 6 : RULES.suggestions;
	const chosen: typeof prefiltered = [];
	for (const c of sorted) {
		const farEnough = chosen.every((d) => haversineKm({ lat: c.base.lat, lng: c.base.lng }, { lat: d.base.lat, lng: d.base.lng }) >= 20);
		if (farEnough) chosen.push(c);
		if (chosen.length >= pickMax) break;
	}
	if (chosen.length < pickMax) {
		for (const c of sorted) {
			if (chosen.find((p) => p.base.id === c.base.id)) continue;
			chosen.push(c);
			if (chosen.length >= pickMax) break;
		}
	}

	// Normalize totals to riskDelta for lite
	const totals = chosen.map((x) => x.scores.total);
	const minT = Math.min(...totals);
	const maxT = Math.max(...totals);
	const toRiskDelta = (t: number) => {
		const z = (t - minT) / Math.max(1e-6, maxT - minT);
		return -Math.round(Math.min(40, Math.max(8, 8 + z * 32)));
	};

	if (opts.mode === "lite") {
		const candidates: LiteCandidate[] = chosen.map((x) => {
			const parts: string[] = [];
			if (typeof x.waterKm === "number" && isFinite(x.waterKm)) parts.push(`water ~${Math.round(x.waterKm)} km`);
			if (typeof x.facts.forest_within_km === "number" && isFinite(x.facts.forest_within_km)) parts.push(`forest ~${Math.round(x.facts.forest_within_km)} km`);
			parts.push(`${Math.round(x.base.distanceKm)} km from city`);
			return {
				...x.base,
				rationale: parts.join(" • "),
				waterKm: isFinite(x.waterKm) ? x.waterKm : undefined,
				forestKm: x.facts.forest_within_km,
				hasRiver: x.riverKm != null && x.riverKm <= RULES.thresholds.waterRiverKm,
				hasLake: x.lakeKm != null && x.lakeKm <= RULES.thresholds.waterLakeKm,
				hasWater: x.hasWater,
				hasForest: x.hasForest,
				score: Math.round(x.scores.total * 10) / 10,
				riskDelta: toRiskDelta(x.scores.total),
			};
		});
		return { candidates, meta: { phase: opts.phase ?? RULES.phase, version: "v1" } };
	}

	const round1 = (n?: number) => (typeof n === "number" && isFinite(n) ? Math.round(n * 10) / 10 : undefined);
	const items: SuggestItem[] = chosen.map((x) => {
		const id = latLngToCell(x.facts.lat, x.facts.lng, RULES.h3Res);
		const facts: Facts2 = {
			...x.facts,
			river_km: round1(x.facts.river_km),
			lake_km: round1(x.facts.lake_km),
			forest_within_km: round1(x.facts.forest_within_km),
			clinic_km: round1(x.facts.clinic_km),
			hospital_km: round1(x.facts.hospital_km),
			dist_km_from_user: round1(x.facts.dist_km_from_user) ?? 0,
		};
		return { id, name: x.base.name, facts, scores: x.scores };
	});
	return { items, meta: { phase: opts.phase ?? RULES.phase, version: "v1" } };
}

type OverpassElement = {
	id: number | string;
	type: "node" | "way" | "relation";
	lat?: number;
	lon?: number;
	center?: { lat: number; lon: number };
	tags?: Record<string, string>;
}; 
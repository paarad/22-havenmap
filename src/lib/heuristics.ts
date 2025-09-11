import { CityQuery, Coordinates, ResourceScore, ResultSet, RiskBreakdown, RiskScore, ZoneSuggestion } from "./types";

// Bands for overall risk score
export function toRiskBand(score: number): RiskScore["band"] {
	if (score < 34) return "Low";
	if (score < 67) return "Medium";
	return "High";
}

// Distance helper (approx great-circle)
export function haversineKm(a: Coordinates, b: Coordinates): number {
	const R = 6371; // km
	const dLat = deg2rad(b.lat - a.lat);
	const dLon = deg2rad(b.lng - a.lng);
	const lat1 = deg2rad(a.lat);
	const lat2 = deg2rad(b.lat);
	const sinDLat = Math.sin(dLat / 2);
	const sinDLon = Math.sin(dLon / 2);
	const h = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLon * sinDLon;
	return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

function deg2rad(deg: number): number {
	return (deg * Math.PI) / 180;
}

// Placeholder calculators: In MVP, we’ll use coarse proxies and transparent text.
export function computeRiskBreakdown(origin: CityQuery): RiskBreakdown {
	// For MVP, return mid values; these will be replaced by layer-driven values.
	return {
		targetProximity: 60,
		falloutExposure: 55,
		populationStress: 65,
		infrastructureFragility: 50,
		terrainShelterAdvantage: 20,
	};
}

export function computeRiskScore(origin: CityQuery): RiskScore {
	const b = computeRiskBreakdown(origin);
	const raw =
		0.35 * b.targetProximity +
		0.25 * b.falloutExposure +
		0.2 * b.populationStress +
		0.15 * b.infrastructureFragility -
		0.05 * b.terrainShelterAdvantage;
	const total = clamp(raw, 0, 100);
	const band = toRiskBand(total);
	const reasons: string[] = [
		"Dense population and strategic vicinity",
		"Prevailing winds increase exposure",
		"Infrastructure shows single points of failure",
	];
	return { total, band, breakdown: b, reasons: reasons.slice(0, 3) };
}

export function computeResourceScore(point: Coordinates): ResourceScore {
	// Placeholder proxies; in MVP later, query raster/vector masks.
	const waterBonus = 10; // e.g., river within 5 km
	const forestBonus = 12; // tree cover >= 20% within 10 km
	const urbanPenalty = 8; // within 5 km of urban/suburban
	const total = clamp(waterBonus + forestBonus - urbanPenalty, -20, 40);
	const reasons = [
		"Perennial water nearby",
		"Tree cover ~25% within 10 km",
		"Outside major urban clusters",
	];
	return { waterBonus, forestBonus, urbanPenalty, total, reasons };
}

export function rankSaferNearby(
	origin: CityQuery,
	candidates: { id: string; name: string; centroid: Coordinates; roadAccessProxy?: number }[],
	originRisk: RiskScore
): ZoneSuggestion[] {
	// Compute suggestion metrics
	const suggestions = candidates.map((c) => {
		const distanceKm = haversineKm(origin.coordinates, c.centroid);
		const resource = computeResourceScore(c.centroid);
		const candidateRiskTotal = Math.max(0, originRisk.total - 25 + Math.random() * 10); // placeholder safer-ish
		const riskDelta = clamp(candidateRiskTotal - originRisk.total, -80, 20);
		const rationale = `Rural feel; ${resource.reasons[0].toLowerCase()}; ${resource.reasons[1].toLowerCase()}`;
		return {
			id: c.id,
			name: c.name,
			centroid: c.centroid,
			distanceKm,
			riskDelta,
			resourceScore: resource.total,
			roadAccessProxy: c.roadAccessProxy,
			rationale,
		} satisfies ZoneSuggestion;
	});

	// Sort per spec: lower risk (delta), then resource score, then distance, then road access
	return suggestions
		.sort((a, b) => {
			if (a.riskDelta !== b.riskDelta) return a.riskDelta - b.riskDelta; // more negative (safer) first
			if (a.resourceScore !== b.resourceScore) return b.resourceScore - a.resourceScore;
			if (Math.abs(a.distanceKm - b.distanceKm) > 1) return a.distanceKm - b.distanceKm;
			return (b.roadAccessProxy ?? 0) - (a.roadAccessProxy ?? 0);
		})
		.slice(0, 7);
}

export function buildResultSet(origin: CityQuery): ResultSet {
	const riskAtOrigin = computeRiskScore(origin);
	// Placeholder candidates in a 50–300 km ring, hard-coded nearby offsets
	const base = origin.coordinates;
	const km = (dLat: number, dLng: number): Coordinates => ({ lat: base.lat + dLat, lng: base.lng + dLng });
	const candidates = [
		{ id: "1", name: "North Ridge", centroid: km(0.8, 0.0), roadAccessProxy: 6 },
		{ id: "2", name: "River Bend", centroid: km(0.4, 0.7), roadAccessProxy: 7 },
		{ id: "3", name: "Pine Valley", centroid: km(-0.9, 0.2), roadAccessProxy: 5 },
		{ id: "4", name: "Quiet Heath", centroid: km(0.6, -0.6), roadAccessProxy: 4 },
		{ id: "5", name: "Lakeview Spur", centroid: km(-0.5, -0.7), roadAccessProxy: 6 },
	];
	const suggestions = rankSaferNearby(origin, candidates, riskAtOrigin);
	const checklist = ["Water nearby", "Fuel/wood source", "Lower density access road"];
	return { origin, riskAtOrigin, suggestions, printChecklist: checklist };
}

function clamp(n: number, min: number, max: number): number {
	return Math.max(min, Math.min(max, n));
} 
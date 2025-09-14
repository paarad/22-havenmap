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
		// Safer total nudged by distance: closer generally small delta, further can be larger
		const baseDelta = originRisk.band === "High" ? -30 : originRisk.band === "Medium" ? -22 : -16;
		const distanceFactor = Math.max(-12, -distanceKm / 6); // at 12km ≈ -2, at 60km ≈ -10
		const riskDelta = clamp(baseDelta + distanceFactor + (Math.random() * 4 - 2), -80, 0);
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
	const band = riskAtOrigin.band;
	// Generate closer candidates for Low/Medium risk origins; a bit wider if High
	const base = origin.coordinates;
	const kmOffset = (kmNorth: number, kmEast: number): Coordinates => ({
		lat: base.lat + kmNorth / 111,
		lng: base.lng + (kmEast / 111) / Math.cos((base.lat * Math.PI) / 180),
	});
	const ring: Array<[number, number, string, number]> =
		band === "High"
			? [
				[20, 0, "North Ridge", 6],
				[15, 25, "River Bend", 7],
				[-22, 10, "Pine Valley", 5],
				[18, -18, "Quiet Heath", 4],
				[-14, -20, "Lakeview Spur", 6],
			]
			: [
				[8, 0, "North Ridge", 6],
				[10, 12, "River Bend", 7],
				[-16, 4, "Pine Valley", 5],
				[14, -10, "Quiet Heath", 4],
				[-12, -14, "Lakeview Spur", 6],
			];
	const candidates = ring.map(([nKm, eKm, name, access], idx) => ({
		id: String(idx + 1),
		name,
		centroid: kmOffset(nKm, eKm),
		roadAccessProxy: access,
	}));
	const suggestions = rankSaferNearby(origin, candidates, riskAtOrigin);
	const checklist = ["Water nearby", "Fuel/wood source", "Lower density access road"];
	return { origin, riskAtOrigin, suggestions, printChecklist: checklist };
}

function clamp(n: number, min: number, max: number): number {
	return Math.max(min, Math.min(max, n));
} 
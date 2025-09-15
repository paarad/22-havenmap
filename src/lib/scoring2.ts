import { RULES } from "@/config/scoring";

export type Magnets = {
	bigHospitals: number;
	hypermarkets: number;
	fuel: number;
	pharmacies: number;
};

export type Facts = {
	lat: number; lng: number;
	dist_km_from_user: number;

	// Resources
	river_km?: number; lake_km?: number; forest_within_km?: number;
	gardenable_within3km?: boolean; fish_possible?: boolean;

	// Risk & context
	urban_within5km?: boolean; pop_density?: number; delta_risk_vs_city?: number;

	// Access & care
	exits_count10km?: number; clinic_km?: number; hospital_km?: number;

	// Hazards & terrain
	floodplain?: boolean; wildfire_risk?: "low"|"med"|"high"; storm_surge?: boolean; single_bridge?: boolean;
	elevation_m?: number; slope_pct?: number;

	// Loot magnets
	magnets?: Magnets;
};

export type Scores = { risk:number; resources:number; access:number; stability:number; hazards:number; total:number };

function hasWater(f:Facts){
	return ((f.river_km ?? 1e9) <= RULES.thresholds.waterRiverKm) || ((f.lake_km ?? 1e9) <= RULES.thresholds.waterLakeKm);
}

function resourcesScore(f:Facts){
	let s=0;
	if (hasWater(f)) s += RULES.resourceWeights.waterBonus;
	if ((f.forest_within_km ?? 1e9) <= RULES.thresholds.forestKm) s += RULES.resourceWeights.forestBonus;
	if (f.gardenable_within3km) s += RULES.resourceWeights.gardenBonus;
	if (hasWater(f)) s += RULES.resourceWeights.fishBonus;
	if (f.urban_within5km) s -= RULES.penalties.urbanProximity;
	const okElev = (f.elevation_m ?? 0) >= RULES.thresholds.elevationMin && (f.elevation_m ?? 1e9) <= RULES.thresholds.elevationMax;
	const okSlope = (f.slope_pct ?? 100) <= RULES.thresholds.slopePctMax;
	if (okElev && okSlope) s += 2;
	return s;
}

function accessScore(f:Facts){
	let s=0;
	s += Math.min((f.exits_count10km ?? 0), 3);
	if ((f.dist_km_from_user ?? 1e9) < 120) s += 0.5;
	return s;
}

function uShape(dist:number|undefined, range:[number,number]){
	if (dist==null) return 0;
	const [lo,hi] = range;
	if (dist < lo*0.7) return -0.5;
	if (dist >= lo && dist <= hi) return 1.0;
	if (dist > hi && dist <= hi*1.3) return 0.5;
	return 0;
}
function edgeOfCare(f:Facts){
	const c = uShape(f.clinic_km, RULES.thresholds.clinicSweet);
	const h = uShape(f.hospital_km, RULES.thresholds.hospitalSweet);
	return c + h;
}
function lootMagnetPenalty(f:Facts){
	const m = f.magnets ?? {bigHospitals:0,hypermarkets:0,fuel:0,pharmacies:0};
	const base = m.bigHospitals*RULES.lootWeights.hospitalBig + m.hypermarkets*RULES.lootWeights.hypermarket + m.fuel*RULES.lootWeights.fuel + m.pharmacies*RULES.lootWeights.pharmacy;
	const densityFactor = Math.min(1, (f.pop_density ?? 0) / 1500);
	return - base * densityFactor;
}
function stabilityScore(f:Facts, phaseOverride?: "panic"|"transit"|"recovery"){
	const phase = phaseOverride ?? RULES.phase;
	const { edge:we, loot:wl } = RULES.phaseWeights[phase];
	return we*edgeOfCare(f) + wl*lootMagnetPenalty(f);
}

function hazardsScore(f:Facts){
	let p=0;
	if (f.floodplain) p += RULES.penalties.floodplain;
	if (f.storm_surge) p += RULES.penalties.stormSurge;
	if (f.wildfire_risk === "high") p += RULES.penalties.wildfire;
	if (f.single_bridge) p += RULES.penalties.singleBridge;
	return -p;
}

export function computeScores(f:Facts, phaseOverride?: "panic"|"transit"|"recovery"): Scores {
	const risk = -(f.delta_risk_vs_city ?? 0);
	const resources = resourcesScore(f);
	const access = accessScore(f);
	const stability = stabilityScore(f, phaseOverride);
	const hazards = hazardsScore(f);
	const total = RULES.weights.risk*risk + RULES.weights.resources*resources + RULES.weights.access*access + RULES.weights.stability*stability + 0.0*hazards;
	return { risk, resources, access, stability, hazards, total };
} 
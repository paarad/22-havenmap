export type Coordinates = {
	lat: number;
	lng: number;
};

export type CityQuery = {
	name: string;
	coordinates: Coordinates;
	countryCode?: string;
};

export type RiskBreakdown = {
	targetProximity: number; // 0-100
	falloutExposure: number; // 0-100
	populationStress: number; // 0-100
	infrastructureFragility: number; // 0-100
	terrainShelterAdvantage: number; // 0-100 (benefit component)
};

export type RiskScore = {
	total: number; // 0-100
	band: "Low" | "Medium" | "High";
	breakdown: RiskBreakdown;
	reasons: string[]; // 2-3 bullets
};

export type ResourceScore = {
	waterBonus: number; // points added if water near
	forestBonus: number; // points added if forest cover nearby
	urbanPenalty: number; // points subtracted for urban proximity
	total: number; // composite resource/self-reliance proxy
	reasons: string[]; // short bullets like "River 2.4 km E"
};

export type ZoneSuggestion = {
	id: string;
	name: string; // e.g., "Sierra Norte"
	centroid: Coordinates;
	distanceKm: number;
	riskDelta: number; // negative is safer relative to origin city
	resourceScore: number;
	roadAccessProxy?: number; // higher is better access, avoid dead ends
	rationale: string; // one sentence rationale
};

export type ResultSet = {
	origin: CityQuery;
	riskAtOrigin: RiskScore;
	suggestions: ZoneSuggestion[]; // 3–7
	printChecklist: string[]; // water, wood/forage, population cue
}; 
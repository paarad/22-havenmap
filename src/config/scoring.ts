export const RULES = {
	radiusKm: 300,
	h3Res: 7,
	candidates: 200,
	suggestions: 5,

	thresholds: {
		waterRiverKm: 2,
		waterLakeKm: 1.5,
		forestKm: 5,
		gardenWithinKm: 3,
		elevationMin: 200,
		elevationMax: 800,
		slopePctMax: 15,
		urbanWithinKm: 5,
		clinicSweet: [15, 60] as [number, number],
		hospitalSweet: [30, 120] as [number, number],
		lootRadiusKm: 10,
	},

	weights: {
		risk: 0.55,
		resources: 0.30,
		access: 0.05,
		stability: 0.10,
	},

	resourceWeights: {
		waterBonus: 8,
		forestBonus: 5,
		gardenBonus: 3,
		fishBonus: 2,
	},

	penalties: {
		urbanProximity: 10,
		floodplain: 10,
		wildfire: 6,
		stormSurge: 10,
		singleBridge: 5,
	},

	lootWeights: { hospitalBig: 3, hypermarket: 1.5, fuel: 1.5, pharmacy: 1 },

	phase: "transit" as "panic" | "transit" | "recovery",
	phaseWeights: {
		panic: { edge: 0.2, loot: 1.0 },
		transit: { edge: 0.6, loot: 0.8 },
		recovery: { edge: 1.0, loot: 0.4 },
	},
}; 
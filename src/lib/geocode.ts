export type GeocodeFeature = {
	name: string;
	lat: number;
	lng: number;
	countryCode?: string;
};

export async function geocodeCity(query: string): Promise<GeocodeFeature | null> {
	const q = query.trim();
	if (!q) return null;
	try {
		// Placeholder: implement MapTiler/Photon later; this is a no-key public endpoint example for dev
		const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=1`;
		const res = await fetch(url, { cache: "force-cache" });
		if (!res.ok) throw new Error("failed");
		const data = await res.json();
		const feat = data?.features?.[0];
		if (!feat) return null;
		const name = feat.properties?.name || q;
		const countryCode = feat.properties?.countrycode?.toUpperCase();
		const [lng, lat] = feat.geometry?.coordinates ?? [];
		if (typeof lat !== "number" || typeof lng !== "number") return null;
		return { name, lat, lng, countryCode };
	} catch {
		return null;
	}
}

export async function reverseGeocode(lat: number, lng: number): Promise<{ name: string; admin?: string } | null> {
	try {
		const params = new URLSearchParams({ lat: String(lat), lon: String(lng), limit: "1", lang: "en" });
		// Prefer locality/village/town/city layers for readable names
		const url = `https://photon.komoot.io/reverse?${params.toString()}`;
		const res = await fetch(url, { cache: "force-cache" });
		if (!res.ok) return null;
		const data = await res.json();
		const feat = data?.features?.[0];
		if (!feat) return null;
		const props = feat.properties || {};
		const locality = props.name || props.city || props.town || props.village || props.county;
		const admin = props.state || props.region || props.country;
		if (!locality) return null;
		return { name: locality, admin };
	} catch {
		return null;
	}
} 
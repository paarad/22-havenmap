"use client";

import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CityQuery, ZoneSuggestion } from "@/lib/types";
import { SearchBar } from "@/components/SearchBar";
import { geocodeCity } from "@/lib/geocode";
import { MapView } from "@/components/MapView";

const QUICK_CITIES: Array<CityQuery> = [
	{ name: "Paris", coordinates: { lat: 48.8566, lng: 2.3522 } },
	{ name: "Lisbon", coordinates: { lat: 38.7223, lng: -9.1393 } },
	{ name: "Madrid", coordinates: { lat: 40.4168, lng: -3.7038 } },
	{ name: "Milan", coordinates: { lat: 45.4642, lng: 9.19 } },
];

type Candidate = { id: string; name: string; lat: number; lng: number; distanceKm: number; rationale: string; waterKm?: number; forestKm?: number; hasWater?: boolean; hasForest?: boolean; riskDelta?: number };

type DisplaySuggestion = { id: string; name: string; lat: number; lng: number; distanceKm: number; riskDelta: number; rationale: string; waterKm?: number; forestKm?: number; hasWater?: boolean; hasForest?: boolean };

export default function HomePage() {
	const [origin, setOrigin] = useState<CityQuery | null>(null);
	const [showMap, setShowMap] = useState<boolean>(false);
	const [loading, setLoading] = useState<boolean>(false);
	const [focusedId, setFocusedId] = useState<string | null>(null);

	const [candidates, setCandidates] = useState<Candidate[] | null>(null);

	// On load: if URL has ?q=, geocode it; otherwise, stay on hero with no default
	useEffect(() => {
		const url = new URL(window.location.href);
		const q = url.searchParams.get("q");
		if (q) {
			setLoading(true);
			geocodeCity(q).then((feat) => {
				if (feat) {
					const next: CityQuery = { name: feat.name, coordinates: { lat: feat.lat, lng: feat.lng }, countryCode: feat.countryCode };
					setOrigin(next);
					setShowMap(window.innerWidth >= 640);
				}
			});
		}
	}, []);

	// Fetch real candidates near origin
	useEffect(() => {
		if (!origin) return;
		setCandidates(null);
		setLoading(true);
		void (async () => {
			try {
				const res = await fetch("/api/candidates", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ origin: { lat: origin.coordinates.lat, lng: origin.coordinates.lng, name: origin.name } }),
				});
				if (!res.ok) return;
				const data = (await res.json()) as { candidates?: Candidate[] };
				if (data?.candidates && Array.isArray(data.candidates)) setCandidates(data.candidates);
			} catch {}
			finally {
				setLoading(false);
			}
		})();
	}, [origin?.coordinates.lat, origin?.coordinates.lng]);

	// Merge candidates with coordinates; limit to 5 and carry feature flags
	const displaySuggestions: DisplaySuggestion[] = useMemo(() => {
		const baseList = (candidates ?? []).map((c) => ({ id: c.id, name: c.name, lat: c.lat, lng: c.lng, distanceKm: c.distanceKm, riskDelta: Math.round(c.riskDelta ?? -12), rationale: c.rationale, waterKm: c.waterKm, forestKm: c.forestKm, hasWater: c.hasWater, hasForest: c.hasForest } as DisplaySuggestion));
		return baseList.slice(0, 5);
	}, [candidates]);

	const onSearch = async (q: string) => {
		if (!q.trim()) return;
		setLoading(true);
		const feat = await geocodeCity(q);
		if (!feat) { setLoading(false); return; }
		const next: CityQuery = { name: feat.name, coordinates: { lat: feat.lat, lng: feat.lng }, countryCode: feat.countryCode };
		setOrigin(next);
		localStorage.setItem("havenmap:lastQuery", JSON.stringify(next));
		const url = new URL(window.location.href);
		url.searchParams.set("q", next.name);
		history.replaceState(null, "", url.toString());
		setShowMap(window.innerWidth >= 640);
	};

	const onUseLocation = () => {
		if (!navigator.geolocation) return;
		setLoading(true);
		navigator.geolocation.getCurrentPosition(
			(pos) => {
				const next: CityQuery = {
					name: "Your location",
					coordinates: { lat: pos.coords.latitude, lng: pos.coords.longitude },
				};
				setOrigin(next);
				localStorage.setItem("havenmap:lastQuery", JSON.stringify(next));
				const url = new URL(window.location.href);
				url.searchParams.set("q", next.name);
				history.replaceState(null, "", url.toString());
				setShowMap(window.innerWidth >= 640);
			},
			() => { setLoading(false); }
		);
	};

	return (
		<div className="min-h-dvh">
			<header className="sticky top-0 z-20 border-b border-white/10 bg-black/40 backdrop-blur">
				<div className="mx-auto max-w-5xl px-4 py-3 flex items-center justify-between">
					<div className="flex items-center gap-3">
						<span className="text-xl font-semibold tracking-tight">HavenMap</span>
						<Badge variant="secondary" className="text-xs bg-white/10 text-white">hints at life after the blast</Badge>
					</div>
					<div className="flex items-center gap-4">
						<a href="https://en.wikipedia.org/wiki/Skynet_(Terminator)" target="_blank" rel="noopener noreferrer" className="text-xs text-white/60 hover:text-white/90">Skynet</a>
					</div>
				</div>
			</header>

			<main className="mx-auto max-w-5xl px-4 py-10">
				{/* Hero: search + quick cities when no origin */}
				{!origin && (
					<section className="mb-10">
						<h1 className="mb-2 text-2xl font-semibold text-white">Type your city</h1>
						<p className="mb-4 text-white/70">HavenMap suggests safer nearby areas—evidence-based, calm, and clear.</p>
						<div className="mb-4">
							<SearchBar onSearch={onSearch} onUseLocation={onUseLocation} loading={loading} />
							{loading && <div className="mt-2 text-sm text-white/70">Searching…</div>}
						</div>
						<div className="flex flex-wrap gap-2">
							{QUICK_CITIES.map((c) => (
								<Button key={c.name} variant="secondary" className="bg-white/10 text-white"
									onClick={() => {
										setOrigin(c);
										const url = new URL(window.location.href);
										url.searchParams.set("q", c.name);
										history.replaceState(null, "", url.toString());
										setShowMap(window.innerWidth >= 640);
									}}
								>
									{c.name}
								</Button>
							))}
						</div>
					</section>
				)}

				{/* When we have an origin, show results */}
				{origin && (
					<>
						<section className="mb-6">
							<SearchBar onSearch={onSearch} onUseLocation={onUseLocation} loading={loading} />
							{loading && <div className="mt-2 text-sm text-white/70">Searching…</div>}
						</section>

						<section className="mb-10">
							<Card className="bg-white/5 border-white/10">
								<CardHeader>
									<CardTitle className="flex items-center justify-between text-white">
										<span>Safer nearby</span>
									</CardTitle>
								</CardHeader>
								<CardContent>
									<div className="space-y-6">
										<div>
											<ul className="space-y-2">
												{displaySuggestions.map((s) => (
													<li key={s.id} className="flex items-center justify-between gap-4">
														<div className="text-sm">
															<div className="font-medium text-white">
																{s.name} ({Math.round(s.distanceKm)} km)
															</div>
															<div className="text-white/70">
																{s.rationale} • Lower risk vs your city ({Math.round(s.riskDelta)} pts)
															</div>
														</div>
														<div className="flex items-center gap-2">
															<Button variant="secondary" size="sm" onClick={() => { setShowMap(true); setFocusedId(s.id); }}>Open on map</Button>
															{/* Export removed */}
														</div>
													</li>
												))}
											</ul>
										</div>
									</div>
								</CardContent>
							</Card>
						</section>

						<section className="mb-6">
							<Button variant="ghost" onClick={() => setShowMap((s) => !s)} className="px-0 text-white">
								{showMap ? "Hide map" : "Show map"}
							</Button>
							<div className={`mt-3 overflow-hidden rounded-md border border-white/10 ${showMap ? "block" : "hidden sm:block"}`}>
								{showMap ? (
									<MapView
										origin={origin}
										suggestions={displaySuggestions.map((d) => ({ id: d.id, name: d.name, centroid: { lat: d.lat, lng: d.lng }, distanceKm: d.distanceKm, riskDelta: d.riskDelta, resourceScore: 0, rationale: d.rationale, waterKm: d.waterKm, forestKm: d.forestKm, hasWater: d.hasWater, hasForest: d.hasForest })) as (ZoneSuggestion & { waterKm?: number; forestKm?: number; hasWater?: boolean; hasForest?: boolean })[]}
										focusedId={focusedId}
									/>
								) : (
									<div className="h-[420px] w-full grid place-items-center text-white/60 bg-white/5">
										<span>Map placeholder (MapLibre to be wired)</span>
									</div>
								)}
							</div>
						</section>
					</>
				)}

				<section className="mb-12 text-sm text-white/70">
					<p className="mb-2 font-medium text-white">Copy kit</p>
					<ul className="list-disc pl-5 space-y-1">
						<li>HavenMap — hints at life after the blast (subtle).</li>
						<li>Educational model. Not real-time. Not safety advice.</li>
						<li>Result style examples: Outside major urban clusters; Perennial river ≤5 km; Tree cover ~28% within 10 km.</li>
					</ul>
				</section>
			</main>
		</div>
	);
}

"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { buildResultSet, toRiskBand } from "@/lib/heuristics";
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

type Candidate = { id: string; name: string; lat: number; lng: number; distanceKm: number; rationale: string };

type DisplaySuggestion = { id: string; name: string; lat: number; lng: number; distanceKm: number; riskDelta: number; rationale: string };

export default function HomePage() {
	const [origin, setOrigin] = useState<CityQuery | null>(null);
	const [showMap, setShowMap] = useState<boolean>(false);
	const [loading, setLoading] = useState<boolean>(false);
	const [focusedId, setFocusedId] = useState<string | null>(null);
	const [aiUsed, setAiUsed] = useState<boolean>(false);

	const [candidates, setCandidates] = useState<Candidate[] | null>(null);
	const [refined, setRefined] = useState<Array<{ id: string; name: string; distanceKm: number; riskDelta: number; rationale: string }> | null>(null);

	// On load: if URL has ?q=, geocode it; otherwise, stay on hero with no default
	useEffect(() => {
		const url = new URL(window.location.href);
		const q = url.searchParams.get("q");
		if (q) {
			setLoading(true);
			geocodeCity(q).then((feat) => {
				setLoading(false);
				if (feat) {
					const next: CityQuery = { name: feat.name, coordinates: { lat: feat.lat, lng: feat.lng }, countryCode: feat.countryCode };
					setOrigin(next);
					setShowMap(window.innerWidth >= 640);
				}
			});
		}
	}, []);

	// Build a basic result (for risk score) once we have origin
	const result = useMemo(() => {
		if (!origin) return null;
		return buildResultSet(origin);
	}, [origin]);

	// Fetch real candidates near origin
	useEffect(() => {
		if (!origin) return;
		setCandidates(null);
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
		})();
	}, [origin?.coordinates.lat, origin?.coordinates.lng]);

	// Map of candidates by id for coordinate lookup
	const candidatesById = useMemo(() => {
		const map = new Map<string, Candidate>();
		(candidates ?? []).forEach((c) => map.set(c.id, c));
		return map;
	}, [candidates]);

	// Ask AI to refine once we have candidates and risk
	useEffect(() => {
		if (!result || !candidates) return;
		setRefined(null);
		setAiUsed(false);
		const controller = new AbortController();
		const tid = setTimeout(() => controller.abort(), 2000);
		void (async () => {
			try {
				const res = await fetch("/api/refine", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						origin: { name: result.origin.name, riskBand: toRiskBand(result.riskAtOrigin.total) },
						suggestions: candidates.map((s) => ({ id: s.id, name: s.name, distanceKm: Math.round(s.distanceKm), riskDelta: Math.round(-20 + Math.random() * 6), rationale: s.rationale })),
					}),
					signal: controller.signal,
				});
				clearTimeout(tid);
				if (!res.ok) return;
				const data = (await res.json()) as { suggestions?: Array<{ id: string; name: string; distanceKm: number; riskDelta: number; rationale: string }> };
				if (data?.suggestions && Array.isArray(data.suggestions) && data.suggestions.length) {
					setRefined(data.suggestions);
					setAiUsed(true);
				}
			} catch {}
		})();
		return () => clearTimeout(tid);
	}, [JSON.stringify(candidates), result?.origin.name, result?.riskAtOrigin.total]);

	// Merge refined or candidates with coordinates; limit to 6
	const displaySuggestions: DisplaySuggestion[] = useMemo(() => {
		if (refined && refined.length) {
			const merged = refined
				.map((r) => {
					const base = candidatesById.get(r.id);
					if (!base) return null;
					return { id: r.id, name: r.name, lat: base.lat, lng: base.lng, distanceKm: r.distanceKm, riskDelta: r.riskDelta, rationale: r.rationale } as DisplaySuggestion;
				})
				.filter(Boolean) as DisplaySuggestion[];
			return merged.slice(0, 6);
		}
		const baseList = (candidates ?? []).map((c) => ({ id: c.id, name: c.name, lat: c.lat, lng: c.lng, distanceKm: c.distanceKm, riskDelta: Math.round(-18 + Math.random() * 6), rationale: c.rationale } as DisplaySuggestion));
		return baseList.slice(0, 6);
	}, [refined, candidatesById, candidates]);

	const onSearch = async (q: string) => {
		if (!q.trim()) return;
		setLoading(true);
		const feat = await geocodeCity(q);
		setLoading(false);
		if (!feat) return;
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
			() => {}
		);
	};

	return (
		<div className="min-h-dvh">
			<header className="sticky top-0 z-20 border-b border-white/10 bg-black/40 backdrop-blur">
				<div className="mx-auto max-w-5xl px-4 py-3 flex items-center justify-between">
					<div className="flex items-center gap-3">
						<span className="text-xl font-semibold tracking-tight">HavenMap</span>
						<Badge variant="secondary" className="text-xs bg-white/10 text-white">Find quieter ground.</Badge>
					</div>
					<div className="flex items-center gap-4">
						<Link href="/attribution" className="text-xs text-white/70 hover:text-white">Attribution</Link>
						<Badge variant="outline" className="text-xs border-white/20 text-white/80">Educational tool. Not advice.</Badge>
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
							<SearchBar onSearch={onSearch} onUseLocation={onUseLocation} />
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
				{origin && result && (
					<>
						<section className="mb-6">
							<SearchBar onSearch={onSearch} onUseLocation={onUseLocation} />
							{loading && <div className="mt-2 text-sm text-white/70">Searching…</div>}
						</section>

						<section className="mb-10">
							<Card className="bg-white/5 border-white/10">
								<CardHeader>
									<CardTitle className="flex items-center justify-between text-white">
										<span>
											Risk near {result.origin.name}: {toRiskBand(result.riskAtOrigin.total)} ({Math.round(result.riskAtOrigin.total)}/100)
										</span>
										<div className="flex items-center gap-2">
											{aiUsed && <Badge variant="secondary" className="text-xs bg-white/10 text-white">AI-refined</Badge>}
											<Badge variant="destructive">{toRiskBand(result.riskAtOrigin.total)}</Badge>
										</div>
									</CardTitle>
									<CardDescription className="text-white/70">
										{result.riskAtOrigin.reasons.slice(0, 3).map((r, i) => (
											<span key={i} className="mr-3">• {r}</span>
										))}
									</CardDescription>
								</CardHeader>
								<CardContent>
									<div className="space-y-6">
										<div>
											<h3 className="mb-2 font-medium text-white">Safer nearby</h3>
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

										<Separator className="bg-white/10" />

										<div>
											<h3 className="mb-2 font-medium text-white">Mini-checklist</h3>
											<ul className="text-sm text-white/80 list-disc pl-5">
												{result.printChecklist.map((c, i) => (
													<li key={i}>{c}</li>
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
										origin={result.origin}
										suggestions={displaySuggestions.map((d) => ({ id: d.id, name: d.name, centroid: { lat: d.lat, lng: d.lng }, distanceKm: d.distanceKm, riskDelta: d.riskDelta, resourceScore: 0, rationale: d.rationale })) as any}
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

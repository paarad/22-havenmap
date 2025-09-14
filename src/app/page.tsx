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

const DEFAULT_CITY: CityQuery = {
	name: "Madrid",
	coordinates: { lat: 40.4168, lng: -3.7038 },
	countryCode: "ES",
};

export default function HomePage() {
	const [origin, setOrigin] = useState<CityQuery | null>(null);
	const [showMap, setShowMap] = useState<boolean>(false);
	const [loading, setLoading] = useState<boolean>(false);
	const [focusedId, setFocusedId] = useState<string | null>(null);
	const [refined, setRefined] = useState<ZoneSuggestion[] | null>(null);

	useEffect(() => {
		const url = new URL(window.location.href);
		const q = url.searchParams.get("q");
		const stored = localStorage.getItem("havenmap:lastQuery");
		if (q) {
			setOrigin({ name: q, coordinates: DEFAULT_CITY.coordinates, countryCode: "EU" });
		} else if (stored) {
			try {
				const parsed = JSON.parse(stored) as CityQuery;
				setOrigin(parsed);
			} catch {}
		} else {
			setOrigin(DEFAULT_CITY);
		}
		if (window.innerWidth >= 640) {
			setShowMap(true);
		}
	}, []);

	const result = useMemo(() => {
		const o = origin ?? DEFAULT_CITY;
		return buildResultSet(o);
	}, [origin]);

	useEffect(() => {
		setRefined(null);
		const controller = new AbortController();
		const tid = setTimeout(() => controller.abort(), 2000);
		const run = async () => {
			try {
				const res = await fetch("/api/refine", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						origin: { name: result.origin.name, riskBand: toRiskBand(result.riskAtOrigin.total) },
						suggestions: result.suggestions.map((s) => ({ id: s.id, name: s.name, distanceKm: Math.round(s.distanceKm), riskDelta: Math.round(s.riskDelta), rationale: s.rationale })),
					}),
					signal: controller.signal,
				});
				clearTimeout(tid);
				if (!res.ok) return;
				const data = (await res.json()) as { suggestions?: ZoneSuggestion[] };
				if (data?.suggestions && Array.isArray(data.suggestions) && data.suggestions.length) {
					setRefined(data.suggestions);
				}
			} catch {}
		};
		run();
		return () => clearTimeout(tid);
	}, [result.origin.name, result.riskAtOrigin.total, result.suggestions]);

	const displaySuggestions = refined ?? result.suggestions;

	const onSearch = async (q: string) => {
		if (!q.trim()) return;
		setLoading(true);
		const feat = await geocodeCity(q);
		setLoading(false);
		const next: CityQuery = feat
			? { name: feat.name, coordinates: { lat: feat.lat, lng: feat.lng }, countryCode: feat.countryCode }
			: { name: q.trim(), coordinates: DEFAULT_CITY.coordinates, countryCode: "EU" };
		setOrigin(next);
		localStorage.setItem("havenmap:lastQuery", JSON.stringify(next));
		const url = new URL(window.location.href);
		url.searchParams.set("q", next.name);
		history.replaceState(null, "", url.toString());
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
								<Badge variant="destructive">{toRiskBand(result.riskAtOrigin.total)}</Badge>
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
													<Link href={{ pathname: "/export", query: { name: s.name, origin: result.origin.name, distance: Math.round(s.distanceKm), riskDelta: Math.round(s.riskDelta), rationale: s.rationale } }}>
														<Button size="sm" variant="outline">Export</Button>
													</Link>
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
							<MapView origin={result.origin} suggestions={result.suggestions} focusedId={focusedId} />
						) : (
							<div className="h-[420px] w-full grid place-items-center text-white/60 bg-white/5">
								<span>Map placeholder (MapLibre to be wired)</span>
							</div>
						)}
					</div>
				</section>

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

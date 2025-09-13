"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { buildResultSet, toRiskBand } from "@/lib/heuristics";
import { CityQuery } from "@/lib/types";
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
		// Auto-open map on desktop (sm and up)
		if (window.innerWidth >= 640) {
			setShowMap(true);
		}
	}, []);

	const result = useMemo(() => {
		const o = origin ?? DEFAULT_CITY;
		return buildResultSet(o);
	}, [origin]);

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
		<div className="min-h-dvh bg-white text-neutral-900">
			<header className="sticky top-0 z-20 border-b bg-white/80 backdrop-blur">
				<div className="mx-auto max-w-4xl px-4 py-3 flex items-center justify-between">
					<div className="flex items-center gap-3">
						<span className="text-xl font-semibold tracking-tight">HavenMap</span>
						<Badge variant="secondary" className="text-xs">Find quieter ground.</Badge>
					</div>
					<div className="flex items-center gap-4">
						<Link href="/attribution" className="text-xs text-neutral-700 hover:underline">Attribution</Link>
						<Badge variant="outline" className="text-xs">Educational tool. Not advice.</Badge>
					</div>
				</div>
			</header>

			<main className="mx-auto max-w-4xl px-4 py-8">
				<section className="mb-6">
					<SearchBar onSearch={onSearch} onUseLocation={onUseLocation} />
					{loading && <div className="mt-2 text-sm text-neutral-600">Searching…</div>}
				</section>

				{/* Result card above the fold */}
				<section className="mb-10">
					<Card>
						<CardHeader>
							<CardTitle className="flex items-center justify-between">
								<span>
									Risk near {result.origin.name}: {toRiskBand(result.riskAtOrigin.total)} ({Math.round(result.riskAtOrigin.total)}/100)
								</span>
								<Badge variant="destructive">{toRiskBand(result.riskAtOrigin.total)}</Badge>
							</CardTitle>
							<CardDescription>
								{result.riskAtOrigin.reasons.slice(0, 3).map((r, i) => (
									<span key={i} className="mr-3">• {r}</span>
								))}
							</CardDescription>
						</CardHeader>
						<CardContent>
							<div className="space-y-6">
								<div>
									<h3 className="mb-2 font-medium">Safer nearby</h3>
									<ul className="space-y-2">
										{result.suggestions.map((s) => (
											<li key={s.id} className="flex items-center justify-between gap-4">
												<div className="text-sm">
													<div className="font-medium">
														{s.name} ({Math.round(s.distanceKm)} km)
													</div>
													<div className="text-neutral-600">
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

								<Separator />

								<div>
									<h3 className="mb-2 font-medium">Mini-checklist</h3>
									<ul className="text-sm text-neutral-700 list-disc pl-5">
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
					<Button variant="ghost" onClick={() => setShowMap((s) => !s)} className="px-0">
						{showMap ? "Hide map" : "Show map"}
					</Button>
					<div className={`mt-3 overflow-hidden rounded-md border ${showMap ? "block" : "hidden sm:block"}`}>
						{showMap ? (
							<MapView origin={result.origin} suggestions={result.suggestions} focusedId={focusedId} />
						) : (
							<div className="h-[360px] w-full bg-neutral-50 grid place-items-center text-neutral-500">
								<span>Map placeholder (MapLibre to be wired)</span>
							</div>
						)}
					</div>
				</section>

				<section className="mb-12 text-sm text-neutral-600">
					<p className="mb-2 font-medium">Copy kit</p>
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

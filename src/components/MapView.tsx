"use client";

import { useEffect, useMemo, useRef } from "react";
import maplibregl, { LngLatBounds } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { CityQuery, Coordinates, ZoneSuggestion } from "@/lib/types";
import { Protocol } from "pmtiles";

type MapViewProps = {
	origin: CityQuery;
	suggestions: ZoneSuggestion[];
	focusedId?: string | null;
};

const MAP_STYLE_URL = process.env.NEXT_PUBLIC_MAP_STYLE_URL || "https://demotiles.maplibre.org/style.json";

type AddProtocol = (scheme: string, handler: (...args: unknown[]) => unknown) => void;

export function MapView({ origin, suggestions, focusedId }: MapViewProps) {
	const containerRef = useRef<HTMLDivElement | null>(null);
	const mapRef = useRef<maplibregl.Map | null>(null);
	const pmtilesRegisteredRef = useRef<boolean>(false);

	const points = useMemo(() => {
		const arr: { id: string; name: string; coord: Coordinates; kind: "origin" | "suggestion" }[] = [
			{ id: "origin", name: origin.name, coord: origin.coordinates, kind: "origin" },
			...suggestions.map((s) => ({ id: s.id, name: s.name, coord: s.centroid, kind: "suggestion" as const })),
		];
		return arr;
	}, [origin, suggestions]);

	useEffect(() => {
		if (!containerRef.current || typeof window === "undefined") return;

		// Register pmtiles:// protocol once
		if (!pmtilesRegisteredRef.current) {
			try {
				const protocol = new Protocol();
				const anyMaplibre = maplibregl as unknown as { addProtocol?: AddProtocol };
				if (typeof anyMaplibre.addProtocol === "function") {
					const handler = (...args: unknown[]) => (protocol.tile as unknown as (...args: unknown[]) => unknown)(...args);
					anyMaplibre.addProtocol("pmtiles", handler);
					pmtilesRegisteredRef.current = true;
				}
			} catch {
				// ignore if not available
			}
		}

		const map = new maplibregl.Map({
			container: containerRef.current,
			style: MAP_STYLE_URL,
			center: [origin.coordinates.lng, origin.coordinates.lat],
			zoom: 7,
			attributionControl: { compact: true },
		});
		mapRef.current = map;

		// Add markers
		points.forEach((p) => {
			const el = document.createElement("div");
			el.style.width = p.kind === "origin" ? "14px" : "10px";
			el.style.height = p.kind === "origin" ? "14px" : "10px";
			el.style.borderRadius = "9999px";
			el.style.border = "2px solid white";
			el.style.boxShadow = "0 0 0 1px rgba(0,0,0,0.2)";
			el.style.backgroundColor = p.kind === "origin" ? "#111827" : "#2563eb";
			new maplibregl.Marker({ element: el })
				.setLngLat([p.coord.lng, p.coord.lat])
				.setPopup(new maplibregl.Popup({ offset: 12 }).setText(p.name))
				.addTo(map);
		});

		// Fit bounds
		const bounds = new LngLatBounds();
		points.forEach((p) => bounds.extend([p.coord.lng, p.coord.lat] as [number, number]));
		if (points.length > 1) {
			map.fitBounds(bounds, { padding: 40, maxZoom: 10, duration: 0 });
		}

		return () => {
			map.remove();
			mapRef.current = null;
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [containerRef, origin.name]);

	useEffect(() => {
		const map = mapRef.current;
		if (!map || !focusedId) return;
		const target = suggestions.find((s) => s.id === focusedId);
		if (!target) return;
		map.flyTo({ center: [target.centroid.lng, target.centroid.lat], zoom: 10 });
	}, [focusedId, suggestions]);

	return <div ref={containerRef} className="h-[360px] w-full" />;
} 
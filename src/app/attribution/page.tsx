export default function AttributionPage() {
	return (
		<div className="mx-auto max-w-3xl p-6 text-neutral-900">
			<h1 className="text-xl font-semibold mb-4">Attribution</h1>
			<p className="text-sm text-neutral-700 mb-4">HavenMap uses public datasets under their respective licenses. EU subset for MVP.</p>
			<ul className="list-disc pl-5 space-y-2 text-sm">
				<li>Urban vs Rural: GHSL GHS-SMOD (1 km)</li>
				<li>Water: HydroRIVERS, HydroLAKES</li>
				<li>Forest: ESA WorldCover 10 m (Tree cover)</li>
				<li>Coastline: generalized coastline; optional World Port Index</li>
				<li>Wind roses: per-airport summaries</li>
				<li>Elevation: SRTM / Mapbox Terrain</li>
			</ul>
			<p className="mt-6 text-xs text-neutral-500">Educational model. Not real-time. Not safety advice.</p>
		</div>
	);
} 
import Link from "next/link";

export default function ExportPage({ searchParams }: { searchParams: { [key: string]: string | string[] | undefined } }) {
	const name = (searchParams["name"] as string) || "Selected area";
	const origin = (searchParams["origin"] as string) || "Your city";
	const distance = (searchParams["distance"] as string) || "-";
	const riskDelta = (searchParams["riskDelta"] as string) || "-";
	const rationale = (searchParams["rationale"] as string) || "";

	const routeUrl = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(name)}`;

	return (
		<div className="mx-auto max-w-3xl p-6 text-neutral-900">
			<div className="mb-6 flex items-center justify-between print:hidden">
				<h1 className="text-xl font-semibold">HavenMap — Export</h1>
				<div className="flex gap-2">
					<button onClick={() => window.print()} className="rounded border px-3 py-1.5 text-sm">Print</button>
					<Link href="/" className="rounded border px-3 py-1.5 text-sm">Back</Link>
				</div>
			</div>

			<article className="prose prose-neutral max-w-none">
				<h2 className="mt-0">{name}</h2>
				<p className="text-sm text-neutral-600">Relative to: {origin}</p>
				<hr />
				<ul>
					<li>Distance: {distance} km (straight-line)</li>
					<li>Lower risk vs your city: {riskDelta} pts</li>
					<li>Why here: {rationale}</li>
				</ul>
				<h3>Mini-plan</h3>
				<ul>
					<li>Water: find perennial source within 3–5 km</li>
					<li>Fuel/wood: identify sustainable source</li>
					<li>Access: choose two ingress/egress roads</li>
				</ul>
				<p>
					Routes: <a href={routeUrl} target="_blank" rel="noreferrer">Open in Maps</a>
				</p>
				<p className="text-xs text-neutral-500">Disclaimer: Educational model. Not real-time. Not safety advice.</p>
			</article>
		</div>
	);
} 
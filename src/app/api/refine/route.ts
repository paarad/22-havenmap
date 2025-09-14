import { NextRequest, NextResponse } from "next/server";

export const runtime = "edge";

type CandidateSuggestion = {
	id: string;
	name: string;
	distanceKm: number;
	riskDelta: number;
	rationale: string;
};

type RefineRequest = {
	origin: { name: string; riskBand: string };
	suggestions: CandidateSuggestion[];
};

type RefineResponse = { suggestions: CandidateSuggestion[] };

export async function POST(req: NextRequest) {
	try {
		const body = (await req.json()) as RefineRequest;
		const { origin, suggestions } = body;
		const apiKey = process.env.OPENAI_API_KEY;
		if (!apiKey) {
			return NextResponse.json({ suggestions } satisfies RefineResponse, { status: 200 });
		}

		const controller = new AbortController();
		const tid = setTimeout(() => controller.abort(), 2000);

		const prompt = `You are HavenMap. Re-rank nearby areas to prefer closer options first when the origin is rural/medium risk, and provide a concise one-sentence rationale.
Origin: ${origin.name} (Risk: ${origin.riskBand})

Candidates (JSON): ${JSON.stringify(suggestions).slice(0, 4000)}

Return strictly JSON array with objects {id, name, distanceKm, riskDelta, rationale}.`;

		const res = await fetch("https://api.openai.com/v1/chat/completions", {
			method: "POST",
			headers: {
				Authorization: `Bearer ${apiKey}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				model: "gpt-4o-mini",
				messages: [
					{ role: "system", content: "You are a helpful, safety-conscious assistant." },
					{ role: "user", content: prompt },
				],
				temperature: 0.2,
				response_format: { type: "json_object" },
			}),
			signal: controller.signal,
		});
		clearTimeout(tid);

		if (!res.ok) return NextResponse.json({ suggestions } satisfies RefineResponse, { status: 200 });
		const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
		const content = data?.choices?.[0]?.message?.content;
		if (!content) return NextResponse.json({ suggestions } satisfies RefineResponse, { status: 200 });
		let parsed: unknown = null;
		try {
			parsed = JSON.parse(content);
		} catch {
			return NextResponse.json({ suggestions } satisfies RefineResponse, { status: 200 });
		}
		const out: CandidateSuggestion[] | undefined = Array.isArray(parsed)
			? (parsed as CandidateSuggestion[])
			: (parsed as { suggestions?: CandidateSuggestion[] })?.suggestions;
		return NextResponse.json({ suggestions: out && out.length ? out : suggestions } satisfies RefineResponse, { status: 200 });
	} catch {
		return NextResponse.json({ suggestions: [] } satisfies RefineResponse, { status: 200 });
	}
} 
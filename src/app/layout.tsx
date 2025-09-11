import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
	title: "HavenMap — Find quieter ground",
	description: "Input a city. Get safer nearby areas with transparent, map-based heuristics.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
	return (
		<html lang="en" className="bg-white">
			<body className="antialiased text-neutral-900">{children}</body>
		</html>
	);
}

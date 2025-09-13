import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
	title: "HavenMap — Find quieter ground",
	description: "Input a city. Get safer nearby areas with transparent, map-based heuristics.",
	icons: {
		icon: "/favicon.ico",
	},
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
	return (
		<html lang="en" className="dark h-full">
			<body className="min-h-dvh bg-background text-foreground antialiased">
				{/* Atmosphere background */}
				<div className="pointer-events-none fixed inset-0 -z-10">
					<div className="absolute inset-0 bg-[radial-gradient(1200px_600px_at_80%_-10%,rgba(251,113,133,0.06),transparent),radial-gradient(800px_400px_at_10%_10%,rgba(110,231,183,0.05),transparent),linear-gradient(180deg,rgba(2,6,23,1),rgba(2,6,23,0.9))]" />
					<div className="absolute inset-0 [mask-image:radial-gradient(ellipse_at_center,black,transparent_70%)]" />
				</div>
				{children}
			</body>
		</html>
	);
}

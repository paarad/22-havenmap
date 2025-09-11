"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function SearchBar({ onSearch, onUseLocation }: { onSearch: (q: string) => void; onUseLocation: () => void }) {
	const [value, setValue] = useState("");
	return (
		<div className="flex flex-col gap-3 sm:flex-row">
			<Input
				value={value}
				onChange={(e) => setValue(e.target.value)}
				placeholder="Type your city or use my location"
				className="flex-1"
				onKeyDown={(e) => {
					if (e.key === "Enter") onSearch(value);
				}}
			/>
			<div className="flex gap-2">
				<Button onClick={() => onSearch(value)}>Search</Button>
				<Button variant="secondary" onClick={onUseLocation}>Use my location</Button>
			</div>
		</div>
	);
} 
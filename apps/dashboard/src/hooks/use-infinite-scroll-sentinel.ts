"use client";

import { type RefObject, useEffect, useRef, useState } from "react";

/**
 * A single, stable IntersectionObserver for the lifetime of the sentinel.
 * Recreating the observer on every hasNextPage/isFetchingNextPage change
 * would re-trigger its "report current state" callback on every re-attach,
 * cascading through every remaining page regardless of actual scroll
 * position — the observer only needs to exist once; live values are read
 * from a ref so the callback always sees the latest state.
 */
export function useInfiniteScrollSentinel({
	rootRef,
	hasNextPage,
	isFetchingNextPage,
	fetchNextPage,
}: {
	rootRef: RefObject<HTMLElement | null>;
	hasNextPage: boolean;
	isFetchingNextPage: boolean;
	fetchNextPage: () => void;
}) {
	const [sentinel, setSentinel] = useState<HTMLDivElement | null>(null);
	const stateRef = useRef({ hasNextPage, isFetchingNextPage, fetchNextPage });
	stateRef.current = { hasNextPage, isFetchingNextPage, fetchNextPage };

	useEffect(() => {
		const root = rootRef.current;
		if (!sentinel || !root) return;

		const observer = new IntersectionObserver(
			(entries) => {
				const current = stateRef.current;
				if (
					entries[0]?.isIntersecting &&
					current.hasNextPage &&
					!current.isFetchingNextPage
				) {
					current.fetchNextPage();
				}
			},
			{ root, rootMargin: "200px" },
		);
		observer.observe(sentinel);
		return () => observer.disconnect();
	}, [rootRef, sentinel]);

	return setSentinel;
}

import { task } from "@trigger.dev/sdk";

import { syncLibraryTracks } from "../../../services/music";
import {
	checkCancelled,
	updateRun,
	updateStageProgress,
} from "../../../services/organize";
import { withAllowlistSlot } from "../../utils/allowlist-slot";

export const syncStageTask = task({
	id: "organize-stage-sync",
	retry: { maxAttempts: 2, minTimeoutInMs: 2000, factor: 2 },
	run: async ({ userId, runId }: { userId: string; runId: number }) => {
		await checkCancelled(runId, userId);
		await updateRun(runId, { currentStage: "sync" });
		return await withAllowlistSlot(userId, runId, () =>
			syncLibraryTracks(userId, async (p) => {
				await updateStageProgress(runId, "sync", p);
			}),
		);
	},
});

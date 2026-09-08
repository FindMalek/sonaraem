import { task } from "@trigger.dev/sdk";

import { autoExportUpdatedPlaylists } from "../../../services/music";
import {
	checkCancelled,
	updateRun,
	updateStageProgress,
} from "../../../services/organize";

export const exportStageTask = task({
	id: "organize-stage-export",
	retry: { maxAttempts: 2, minTimeoutInMs: 2000, factor: 2 },
	run: async ({
		userId,
		runId,
		playlistIds,
	}: {
		userId: string;
		runId: number;
		playlistIds: number[];
	}) => {
		await checkCancelled(runId, userId);
		await updateRun(runId, { currentStage: "export" });
		// No allowlist gating needed here (#392) — a permanently allowlisted user is always allowlisted.
		const result = await autoExportUpdatedPlaylists(userId, playlistIds);
		await updateStageProgress(runId, "export", result);
		return result;
	},
});

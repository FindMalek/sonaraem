import { task } from "@trigger.dev/sdk";

import { autoExportUpdatedPlaylists } from "../../../services/music";
import {
	checkCancelled,
	updateRun,
	updateStageProgress,
} from "../../../services/organize";
import { withAllowlistSlot } from "../../utils/allowlist-slot";

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
		const result = await withAllowlistSlot(userId, runId, () =>
			autoExportUpdatedPlaylists(userId, playlistIds),
		);
		await updateStageProgress(runId, "export", result);
		return result;
	},
});

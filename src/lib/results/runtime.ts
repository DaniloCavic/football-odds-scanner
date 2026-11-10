import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/settings-repo";
import { oddsPapiKey } from "@/lib/robot/providers";
import { OddsPapiClient } from "@/lib/robot/providers/oddspapi";
import { apiFootballKey, fetchDay } from "./apifootball";
import { fetchOddsPapiSettlement } from "./oddspapi-results";
import { runTracker, type TrackerReport } from "./tracker";

/** Pokreće Result Tracker sa pravim izvorima (ključevi iz environment varijabli). */
export async function runTrackerNow(): Promise<TrackerReport> {
  const settings = await getSettings();
  const af = apiFootballKey();
  const op = oddsPapiKey();
  const client = op ? new OddsPapiClient(op) : null;
  return runTracker({
    db: prisma,
    apiFootball: af ? (date) => fetchDay(af, date) : null,
    oddsPapi: client ? (id) => fetchOddsPapiSettlement(client, id) : null,
    resultCheckMinutes: settings.resultCheckMinutes,
    oddsPapiChecksPerDay: settings.oddsPapiResultChecksPerDay,
  });
}

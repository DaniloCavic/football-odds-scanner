import { PageHeader } from "@/components/ui";
import { getSettings } from "@/lib/settings-repo";
import { availableProviders } from "@/lib/robot/providers";
import { markStaleScans } from "@/lib/robot/runner";
import { recentScans } from "@/lib/robot/scans";
import { zonedYmd, ymdToString } from "@/lib/time";
import { RobotClient } from "./RobotClient";

export default async function RobotPage() {
  await markStaleScans();
  const [settings, scans] = await Promise.all([getSettings(), recentScans(5)]);
  const providers = availableProviders();
  return (
    <>
      <PageHeader title="Robot" subtitle={`Ručno skeniranje ponude: samo pravi fudbal, tipovi 1, X, 2, 2+, 0–3, kvote do ${settings.maxOdds.toFixed(2)}.`} />
      <RobotClient
        providers={providers}
        initialScans={scans}
        today={ymdToString(zonedYmd(new Date()))}
        maxOdds={settings.maxOdds}
        maxRequests={settings.maxRequestsPerScan}
      />
    </>
  );
}

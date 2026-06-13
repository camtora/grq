import { PageHeader } from "@/components/ui";
import ActivityFeed from "@/components/ActivityFeed";

export default async function Activity() {
  return (
    <main>
      <PageHeader
        title="Activity"
        sub="Every order the engine has seen — fills, resting limits, and rejections with the guardrail that fired."
      />
      <ActivityFeed limit={100} />
    </main>
  );
}

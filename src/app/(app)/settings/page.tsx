import { ApiButton } from "@/components/Actions";
import SettingsForm from "@/components/SettingsForm";
import { Badge, Card, CardHeader, PageHeader } from "@/components/ui";
import { getSetting } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function Settings() {
  const [login, autoCommentVal, webhookSecretVal] = await Promise.all([
    getSetting("github_login"),
    getSetting("auto_comment"),
    getSetting("webhook_secret"),
  ]);
  const autoComment = autoCommentVal === "1";
  const hasSecret = !!webhookSecretVal || !!process.env.GITHUB_WEBHOOK_SECRET;
  const llm = !!process.env.OPENAI_API_KEY;

  return (
    <>
      <PageHeader eyebrow="workspace" title="Settings" desc="Connect GitHub, automate pull request analysis and configure how explanations are written." />

      <div className="space-y-4">
        <SettingsForm login={login} hasEnvToken={!!process.env.GITHUB_TOKEN} autoComment={autoComment} hasSecret={hasSecret} />

        <Card className="overflow-hidden">
          <CardHeader
            eyebrow="explanations"
            title="Language model"
            subtitle="Detection, graphing, blast radius and risk scoring are deterministic. A model only rewrites findings as plain-language prose."
            right={<Badge tone={llm ? "accent" : "neutral"}>{llm ? "enabled" : "rule-based"}</Badge>}
          />
          <div className="space-y-2 p-4 text-[11.5px] leading-relaxed text-muted md:p-5">
            <p>
              Server-side environment variables: <code className="font-mono text-fg">OPENAI_API_KEY</code>, optional{" "}
              <code className="font-mono text-fg">OPENAI_MODEL</code> (default gpt-4o-mini) and{" "}
              <code className="font-mono text-fg">OPENAI_BASE_URL</code> for any OpenAI-compatible endpoint.
            </p>
            <p>Without a key, explanations come from the built-in natural-language engine — same facts, plainer phrasing.</p>
          </div>
        </Card>

        <Card className="overflow-hidden">
          <CardHeader
            eyebrow="illustrative data"
            title="Demo project"
            subtitle="A four-service commerce system with five open pull requests: user-service → order-service and billing-service → web-gateway."
          />
          <div className="flex flex-wrap gap-2 p-4 md:p-5">
            <ApiButton url="/api/demo" body={{ action: "reset" }} label="Reset demo project" busyLabel="Resetting…" variant="secondary" />
            <ApiButton url="/api/demo" body={{ action: "remove" }} label="Remove demo project" variant="danger" confirmText="Remove demo repositories and pull requests?" />
          </div>
        </Card>
      </div>
    </>
  );
}

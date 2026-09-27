"use client";

import { Button, ButtonLink, Card } from "@/components/ui";

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <Card className="mx-auto max-w-lg p-8 text-center" role="alert">
      <h1 className="text-xl font-semibold">Something went wrong loading this view</h1>
      <p className="mt-2 text-sm text-ink-muted">The demo data is local, so retrying usually fixes it. If not, reset the demo from the header.</p>
      <div className="mt-5 flex justify-center gap-2">
        <Button onClick={reset}>Try again</Button>
        <ButtonLink href="/" variant="secondary">Portfolio overview</ButtonLink>
      </div>
    </Card>
  );
}

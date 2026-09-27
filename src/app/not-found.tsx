import { ButtonLink, Card } from "@/components/ui";

export default function NotFound() {
  return (
    <Card className="mx-auto max-w-lg p-8 text-center">
      <h1 className="text-xl font-semibold">Record not found</h1>
      <p className="mt-2 text-sm text-ink-muted">That property or resident isn’t in the synthetic dataset.</p>
      <ButtonLink href="/" className="mt-5">Back to Portfolio Operations</ButtonLink>
    </Card>
  );
}

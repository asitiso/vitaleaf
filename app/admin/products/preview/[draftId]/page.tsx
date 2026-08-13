import { DraftPreview } from "./draft-preview";

export default async function DraftPreviewPage({ params }: { params: Promise<{ draftId: string }> }) {
  const { draftId } = await params;
  return <DraftPreview draftId={draftId} />;
}

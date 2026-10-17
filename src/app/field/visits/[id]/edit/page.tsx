import { notFound, redirect } from 'next/navigation';
import { FieldHeader } from '@/components/field/FieldChrome';
import VisitForm from '@/components/field/VisitForm';
import { canAccess, currentAgent, getVisit, photoLinks } from '@/lib/field-db';

export const dynamic = 'force-dynamic';

export default async function EditVisit({ params }: { params: Promise<{ id: string }> }) {
  const agent = await currentAgent();
  if (!agent) redirect('/field/signin');
  const { id } = await params;
  const visit = await getVisit(id);
  if (!visit || !canAccess(agent, visit)) notFound();
  const urls = await photoLinks(visit.photos);
  return (
    <>
      <FieldHeader title="Edit visit" back={`/field/visits/${id}`} />
      <VisitForm visit={visit} photoUrls={urls} />
    </>
  );
}

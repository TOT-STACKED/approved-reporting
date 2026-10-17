import { redirect } from 'next/navigation';
import { FieldHeader } from '@/components/field/FieldChrome';
import VisitForm from '@/components/field/VisitForm';
import { currentAgent } from '@/lib/field-db';

export const dynamic = 'force-dynamic';

export default async function NewVisit() {
  const agent = await currentAgent();
  if (!agent) redirect('/field/signin');
  return (
    <>
      <FieldHeader title="New visit" back="/field" />
      <VisitForm />
    </>
  );
}

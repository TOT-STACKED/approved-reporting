import { Suspense } from 'react';
import VenueMarketplace from '@/components/venues/VenueMarketplace';

export default function VenuesPage() {
  return (
    <Suspense>
      <VenueMarketplace />
    </Suspense>
  );
}

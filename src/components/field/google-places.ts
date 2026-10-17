// "Which venue are you in?" from Google Places, when a Google key is set.
// Runs in the browser on the same referrer-locked key as the map, so it needs
// "Places API (New)" enabled on that key. Better UK coverage than
// OpenStreetMap; the server's Photon lookup is the fallback.

import { loadGoogleMaps } from './google-loader';
import { distanceM, type NearbyPlace } from '@/lib/field-shared';

const TYPES = ['restaurant', 'cafe', 'coffee_shop', 'bar', 'pub', 'wine_bar', 'night_club', 'meal_takeaway', 'fast_food_restaurant', 'hotel'];
// Long-standing types only, in case a newer one is rejected.
const SAFE_TYPES = ['restaurant', 'cafe', 'bar', 'night_club', 'meal_takeaway', 'hotel'];

export async function googleNearby(lat: number, lng: number, radius: number): Promise<NearbyPlace[]> {
  await loadGoogleMaps();
  const { Place, SearchNearbyRankPreference } = (await google.maps.importLibrary('places')) as google.maps.PlacesLibrary;
  const request: google.maps.places.SearchNearbyRequest = {
    fields: ['id', 'displayName', 'location', 'formattedAddress', 'primaryType', 'addressComponents'],
    locationRestriction: { center: { lat, lng }, radius: Math.min(radius, 500) },
    includedTypes: TYPES,
    maxResultCount: 20,
    rankPreference: SearchNearbyRankPreference.DISTANCE,
  };
  let result: { places: google.maps.places.Place[] };
  try {
    result = await Place.searchNearby(request);
  } catch {
    result = await Place.searchNearby({ ...request, includedTypes: SAFE_TYPES });
  }
  return result.places
    .filter(p => p.location && p.displayName)
    .map(p => {
      const pLat = p.location!.lat();
      const pLng = p.location!.lng();
      const postcode = p.addressComponents?.find(c => c.types.includes('postal_code'))?.longText || '';
      // "12 Greek St, London W1D 4DJ, UK" → "12 Greek St, London"
      const address = (p.formattedAddress || '').replace(/,\s*(UK|United Kingdom)$/i, '').replace(postcode, '').replace(/\s+,|,\s*$/g, '').trim();
      return {
        ref: `google/${p.id}`,
        name: p.displayName!,
        lat: pLat,
        lng: pLng,
        kind: (p.primaryType || '').replace(/_/g, ' '),
        address,
        postcode,
        distance_m: distanceM(lat, lng, pLat, pLng),
      };
    })
    .sort((a, b) => a.distance_m - b.distance_m);
}

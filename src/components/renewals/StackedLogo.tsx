// The orange Stacked wordmark, as on wearestacked.io (self-hosted copy).
export default function StackedLogo({ className = 'h-7 w-auto' }: { className?: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src="/renewals-assets/stacked-logo.svg" alt="Stacked" className={className} />;
}

import TechCheckSummary from '@/components/TechCheckSummary';

export const metadata = {
  title: 'Tech Check - Tech on Toast',
};

export default function TechCheckPage() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="font-display text-4xl sm:text-6xl tracking-tight leading-[0.95] text-brand-green">Tech Check</h1>
        <p className="text-gray-500 mt-1 max-w-3xl text-sm">
          Every tool your venues picked in their stack review, grouped by category. Click any tool
          to see exactly which venues use it — with contact details ready to hand off to a partner
          pitch. Use the search and category jump pills to move around quickly.
        </p>
      </div>
      <TechCheckSummary />
    </div>
  );
}

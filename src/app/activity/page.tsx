'use client';

import { useState, useEffect } from 'react';

const ACTIVITY_TYPES = [
  'LinkedIn Spread', 'Podcast Episode', 'Event / Webinar', 'Social Media Post',
  'Email Campaign', 'Blog Post', 'PR / Press', 'Video Content', 'Partner Page', 'Other'
];

interface Activity {
  id?: string;
  activityTitle: string;
  activityType: string;
  date: string;
  partnersFeatured: string;
  impressions: number;
  engagements: number;
  clickThroughs: number;
  leadsGenerated: number;
  pipelineValue: number;
  url: string;
  notes: string;
}

interface Partner {
  name: string;
  slug: string;
}

export default function ActivityPage() {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  const [activityTitle, setActivityTitle] = useState('');
  const [activityType, setActivityType] = useState('');
  const [date, setDate] = useState('');
  const [selectedPartners, setSelectedPartners] = useState<string[]>([]);
  const [impressions, setImpressions] = useState('');
  const [engagements, setEngagements] = useState('');
  const [clickThroughs, setClickThroughs] = useState('');
  const [leadsGenerated, setLeadsGenerated] = useState('');
  const [pipelineValue, setPipelineValue] = useState('');
  const [url, setUrl] = useState('');
  const [notes, setNotes] = useState('');

  const loadData = () => {
    fetch('/api/activity').then(r => r.json()).then(d => setActivities(d.activities || []));
    fetch('/api/partners').then(r => r.json()).then(d => setPartners(d.partners || []));
  };

  useEffect(() => { loadData(); }, []);

  const togglePartner = (name: string) => {
    setSelectedPartners(prev =>
      prev.includes(name) ? prev.filter(p => p !== name) : [...prev, name]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setSuccess(false);

    try {
      const res = await fetch('/api/activity', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          activityTitle, activityType, date,
          partnersFeatured: selectedPartners.join(', '),
          impressions: Number(impressions) || 0,
          engagements: Number(engagements) || 0,
          clickThroughs: Number(clickThroughs) || 0,
          leadsGenerated: Number(leadsGenerated) || 0,
          pipelineValue: Number(pipelineValue) || 0,
          url, notes,
        }),
      });

      if (res.ok) {
        setSuccess(true);
        setActivityTitle(''); setActivityType(''); setSelectedPartners([]);
        setImpressions(''); setEngagements(''); setClickThroughs('');
        setLeadsGenerated(''); setPipelineValue(''); setUrl(''); setNotes('');
        loadData();
        setTimeout(() => setSuccess(false), 3000);
      }
    } catch { alert('Failed to save activity'); }
    setSubmitting(false);
  };

  const totalImpressions = activities.reduce((s, a) => s + a.impressions, 0);
  const totalEngagements = activities.reduce((s, a) => s + a.engagements, 0);
  const totalLeads = activities.reduce((s, a) => s + a.leadsGenerated, 0);
  const totalPipeline = activities.reduce((s, a) => s + a.pipelineValue, 0);

  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-8">
        <a href="/" className="text-sm text-gray-500 hover:text-gray-700">&larr; Back to Dashboard</a>
        <h1 className="text-2xl font-bold text-gray-900 mt-2">Log Marketing Activity</h1>
        <p className="text-gray-500 mt-1">Record activities that promote partners - these feed into partner value reports</p>
      </div>

      {/* Summary KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
          <p className="text-2xl font-bold text-blue-600">{totalImpressions.toLocaleString()}</p>
          <p className="text-xs text-gray-500 mt-1">Total Reach</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
          <p className="text-2xl font-bold text-green-600">{totalEngagements.toLocaleString()}</p>
          <p className="text-xs text-gray-500 mt-1">Total Engagements</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
          <p className="text-2xl font-bold text-purple-600">{totalLeads}</p>
          <p className="text-xs text-gray-500 mt-1">Leads Generated</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
          <p className="text-2xl font-bold text-orange-600">£{totalPipeline.toLocaleString()}</p>
          <p className="text-xs text-gray-500 mt-1">Pipeline Value</p>
        </div>
      </div>

      {success && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6 text-green-700">
          Activity logged successfully.
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
        <form onSubmit={handleSubmit} className="lg:col-span-3 bg-white rounded-xl border border-gray-200 p-6 space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Activity Title</label>
              <input type="text" value={activityTitle} onChange={e => setActivityTitle(e.target.value)} required
                placeholder="e.g. Weekly Spread #42 - SKY feature"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-gray-900 focus:ring-2 focus:ring-orange-500 focus:border-orange-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
              <select value={activityType} onChange={e => setActivityType(e.target.value)} required
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-gray-900 focus:ring-2 focus:ring-orange-500 focus:border-orange-500">
                <option value="">Select type...</option>
                {ACTIVITY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)} required
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-gray-900 focus:ring-2 focus:ring-orange-500 focus:border-orange-500" />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Partners Featured</label>
            <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto p-2 border border-gray-200 rounded-lg">
              <button type="button" onClick={() => {
                if (selectedPartners.length === partners.length) {
                  setSelectedPartners([]);
                } else {
                  setSelectedPartners(partners.map(p => p.name));
                }
              }}
                className={`text-xs px-3 py-1.5 rounded-full border font-medium transition-colors ${
                  selectedPartners.length === partners.length
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-blue-600 border-blue-300 hover:border-blue-500'
                }`}>
                All Partners
              </button>
              {partners.map(p => (
                <button key={p.slug} type="button" onClick={() => togglePartner(p.name)}
                  className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                    selectedPartners.includes(p.name)
                      ? 'bg-orange-500 text-white border-orange-500'
                      : 'bg-white text-gray-700 border-gray-300 hover:border-orange-300'
                  }`}>
                  {p.name}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Impressions / Reach</label>
              <input type="number" value={impressions} onChange={e => setImpressions(e.target.value)} placeholder="e.g. 12500"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-gray-900 focus:ring-2 focus:ring-orange-500 focus:border-orange-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Engagements</label>
              <input type="number" value={engagements} onChange={e => setEngagements(e.target.value)} placeholder="e.g. 340"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-gray-900 focus:ring-2 focus:ring-orange-500 focus:border-orange-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Click-throughs</label>
              <input type="number" value={clickThroughs} onChange={e => setClickThroughs(e.target.value)} placeholder="e.g. 85"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-gray-900 focus:ring-2 focus:ring-orange-500 focus:border-orange-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Leads Generated</label>
              <input type="number" value={leadsGenerated} onChange={e => setLeadsGenerated(e.target.value)} placeholder="e.g. 5"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-gray-900 focus:ring-2 focus:ring-orange-500 focus:border-orange-500" />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Pipeline Value (£)</label>
            <input type="number" value={pipelineValue} onChange={e => setPipelineValue(e.target.value)} placeholder="e.g. 15000"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-gray-900 focus:ring-2 focus:ring-orange-500 focus:border-orange-500" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">URL</label>
            <input type="url" value={url} onChange={e => setUrl(e.target.value)} placeholder="https://..."
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-gray-900 focus:ring-2 focus:ring-orange-500 focus:border-orange-500" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Any additional context..."
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-gray-900 focus:ring-2 focus:ring-orange-500 focus:border-orange-500" />
          </div>

          <button type="submit" disabled={submitting}
            className="w-full bg-orange-500 hover:bg-orange-600 text-white py-3 rounded-lg font-medium transition-colors disabled:opacity-50">
            {submitting ? 'Saving...' : 'Log Activity'}
          </button>
        </form>

        {/* Recent Activities */}
        <div className="lg:col-span-2">
          <h2 className="font-semibold text-gray-900 mb-4">Recent Activities</h2>
          <div className="space-y-3">
            {activities.length === 0 && <p className="text-gray-400 text-sm">No activities logged yet.</p>}
            {activities.slice(0, 10).map((a, i) => (
              <div key={i} className="bg-white rounded-lg border border-gray-200 p-4">
                <div className="flex items-start justify-between">
                  <p className="font-medium text-gray-900 text-sm">{a.activityTitle}</p>
                  <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full ml-2 whitespace-nowrap">{a.activityType}</span>
                </div>
                <p className="text-xs text-gray-500 mt-1">{a.date}</p>
                {a.partnersFeatured && <p className="text-xs text-orange-600 mt-1">{a.partnersFeatured}</p>}
                <div className="flex gap-3 mt-2 text-xs text-gray-500">
                  {a.impressions > 0 && <span>{a.impressions.toLocaleString()} reach</span>}
                  {a.engagements > 0 && <span>{a.engagements} engagements</span>}
                  {a.leadsGenerated > 0 && <span>{a.leadsGenerated} leads</span>}
                  {a.pipelineValue > 0 && <span>£{a.pipelineValue.toLocaleString()}</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// Shared plan/tier feature matrix (source-of-truth for UI gating)
// Notes:
// - Database enforces: action_items => Agent+, multiple Gmail accounts => Broker-only (max 5)
// - API endpoints should also enforce sensitive actions (AI reply draft, sending email)

(function () {
  const RANK = { viewer: 0, agent: 1, broker: 2 };

  function normalizePlan(plan) {
    const p = String(plan || '').toLowerCase().trim();
    // Back-compat with older naming in some pages
    if (p === 'free') return 'viewer';
    if (p === 'pro') return 'broker';
    if (p === 'viewer' || p === 'agent' || p === 'broker') return p;
    return 'viewer';
  }

  function rankOf(plan) {
    return RANK[normalizePlan(plan)] ?? 0;
  }

  function meetsMinPlan(plan, minPlan) {
    return rankOf(plan) >= rankOf(minPlan);
  }

  // Canonical features used for: pricing/tiers copy + dashboard gating.
  // Each entry can include per-plan label (for limits).
  const FEATURES = [
    { key: 'gmail_sync_manual', label: 'Gmail sync (manual)', minPlan: 'viewer' },
    { key: 'gmail_sync_background', label: 'Continuous background sync', minPlan: 'agent' },
    { key: 'ai_lead_scoring', label: 'AI lead scoring (1–100)', minPlan: 'viewer' },
    { key: 'deal_probability', label: 'Deal probability + lead classification', minPlan: 'viewer' },
    { key: 'pipeline_value', label: 'Pipeline value estimation', minPlan: 'agent' },
    { key: 'ai_reply_drafts', label: 'AI-generated reply drafts', minPlan: 'agent' },
    { key: 'send_email', label: 'Send emails from CloseLogic', minPlan: 'agent' },
    { key: 'action_items', label: 'Action Items automation', minPlan: 'agent' },
    { key: 'reply_reminders', label: 'Reply reminders automation', minPlan: 'agent' },
    { key: 'auto_reply', label: 'Auto Reply automation', minPlan: 'broker' },
    {
      key: 'gmail_accounts',
      labelByPlan: {
        viewer: 'Connect 1 Gmail inbox',
        agent: 'Connect 1 Gmail inbox',
        broker: 'Connect up to 5 Gmail inboxes'
      },
      minPlan: 'viewer'
    }
  ];

  const PLANS = [
    {
      key: 'viewer',
      name: 'Viewer',
      priceLabel: '$0/month',
      tagline: 'Read-only scoring + pipeline clarity',
      description: 'Best for getting started with lead scoring and prioritization.'
    },
    {
      key: 'agent',
      name: 'Agent',
      priceLabel: '$39/month',
      tagline: 'Draft replies + automations',
      description: 'For agents who want faster responses and smarter follow-up.'
    },
    {
      key: 'broker',
      name: 'Broker',
      priceLabel: '$79/month',
      tagline: 'Advanced automation + multi-inbox',
      description: 'For teams and power users who need scale and automation.'
    }
  ];

  function featureLabelForPlan(feature, plan) {
    if (feature.labelByPlan) {
      const p = normalizePlan(plan);
      return feature.labelByPlan[p] || feature.labelByPlan.viewer;
    }
    return feature.label;
  }

  function isFeatureAvailable(plan, featureKey) {
    const feature = FEATURES.find((f) => f.key === featureKey);
    if (!feature) return false;
    return meetsMinPlan(plan, feature.minPlan || 'viewer');
  }

  window.PLAN_FEATURES = {
    RANK,
    PLANS,
    FEATURES,
    normalizePlan,
    rankOf,
    meetsMinPlan,
    featureLabelForPlan,
    isFeatureAvailable
  };
})();



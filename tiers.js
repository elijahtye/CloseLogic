function $(id) { return document.getElementById(id); }

function getPlanFeatures() {
  // Loaded via planFeatures.js
  return window.PLAN_FEATURES || null;
}

async function getSupabaseClientSafe() {
  if (typeof window.getSupabaseClient === 'function') return window.getSupabaseClient();
  if (window.supabase?.createClient && window.CONFIG?.SUPABASE_URL && window.CONFIG?.SUPABASE_ANON_KEY) {
    return window.supabase.createClient(window.CONFIG.SUPABASE_URL, window.CONFIG.SUPABASE_ANON_KEY);
  }
  throw new Error('Supabase client not available');
}

function renderTiers({ currentPlan }) {
  const grid = $('tiersGrid');
  if (!grid) return;

  const pf = getPlanFeatures();
  const plans = pf?.PLANS || [
    { key: 'viewer', name: 'Viewer', priceLabel: '$0/month' },
    { key: 'agent', name: 'Agent', priceLabel: '$39/month' },
    { key: 'broker', name: 'Broker', priceLabel: '$79/month' }
  ];
  const features = pf?.FEATURES || [];

  grid.innerHTML = plans.map((t) => {
    const normalized = pf?.normalizePlan ? pf.normalizePlan(currentPlan) : String(currentPlan || 'viewer');
    const isCurrent = String(normalized || 'viewer') === t.key;
    const cta = `Select ${t.name}`;
    // Only show features that are available for this tier
    const availableFeatures = features.filter((f) => {
      return pf?.isFeatureAvailable ? pf.isFeatureAvailable(t.key, f.key) : false;
    });
    const tierFeaturesHtml = availableFeatures.map((f) => {
      const label = pf?.featureLabelForPlan ? pf.featureLabelForPlan(f, t.key) : (f.label || '');
      return `<li data-feature="${escapeHtml(f.key)}">
        <span class="dot"></span>
        <span>${escapeHtml(label)}</span>
      </li>`;
    }).join('');
    return `
      <div class="tier-card tier-${t.key} ${isCurrent ? 'current' : ''}" data-tier="${t.key}">
        ${isCurrent ? `<div class="tier-badge-current">Current</div>` : ''}
        <h3 class="tier-name">${t.name} Tier</h3>
        <div class="tier-price">${escapeHtml(t.priceLabel || t.price || '')}<span class="muted">billed monthly</span></div>
        <ul class="tier-features">
          ${tierFeaturesHtml}
        </ul>
        <div class="tier-actions">
          <button class="btn ${isCurrent ? 'btn-outline' : 'btn-primary'} tier-select-btn" ${isCurrent ? 'disabled' : ''}>
            ${isCurrent ? 'Selected' : escapeHtml(cta)}
          </button>
        </div>
      </div>
    `;
  }).join('');
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

async function setPlan(supabaseClient, userId, plan) {
  const { error } = await supabaseClient
    .from('profiles')
    .update({ plan, updated_at: new Date().toISOString() })
    .eq('id', userId);
  if (error) throw new Error(error.message);
}

function getReturnTo() {
  const url = new URL(window.location.href);
  return url.searchParams.get('returnTo') || '/dashboard';
}

function goBack() {
  const rt = getReturnTo();
  window.location.href = rt.startsWith('/') ? rt : `/${rt}`;
}

document.addEventListener('DOMContentLoaded', async () => {
  $('tiersBackBtn')?.addEventListener('click', goBack);
  $('backToDashboard')?.addEventListener('click', goBack);

  try {
    const supabaseClient = await getSupabaseClientSafe();

    const auth = await (typeof checkAuthAndOnboarding === 'function'
      ? checkAuthAndOnboarding({ requireAuth: true, requireOnboarding: true })
      : supabaseClient.auth.getSession());

    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) {
      window.location.href = '/auth';
      return;
    }

    const { data: profile, error: profileError } = await supabaseClient
      .from('profiles')
      .select('plan')
      .eq('id', user.id)
      .maybeSingle();
    if (profileError) throw new Error(profileError.message);

    const currentPlan = profile?.plan || 'viewer';
    renderTiers({ currentPlan });
    $('tiersFooter').textContent = `Current tier: ${String(currentPlan).toUpperCase()}`;

    document.querySelectorAll('.tier-card').forEach((card) => {
      card.querySelector('.tier-select-btn')?.addEventListener('click', async () => {
        const plan = card.getAttribute('data-tier');
        if (!plan) return;
        try {
          card.querySelector('.tier-select-btn').disabled = true;
          card.querySelector('.tier-select-btn').textContent = 'Saving...';
          await setPlan(supabaseClient, user.id, plan);
          renderTiers({ currentPlan: plan });
          $('tiersFooter').textContent = `Current tier: ${String(plan).toUpperCase()}`;
        } catch (e) {
          console.error('[tiers] Save failed:', e);
          alert(`Failed to update tier: ${e.message}`);
          renderTiers({ currentPlan });
        }
      });
    });
  } catch (e) {
    console.error('[tiers] init failed:', e);
    alert('Failed to load tiers page. Please refresh.');
  }
});



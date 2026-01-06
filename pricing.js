// Pricing Page JavaScript
// Central tier configuration for future Stripe integration

const tierConfig = {
    tiers: [
        {
            id: "viewer",
            name: "Viewer",
            price: 0,
            stripePriceId: null, // Will be set when Stripe is integrated
            features: []
        },
        {
            id: "agent",
            name: "Agent",
            price: 39,
            stripePriceId: null, // Will be set when Stripe is integrated
            features: []
        },
        {
            id: "broker",
            name: "Broker",
            price: 79,
            stripePriceId: null, // Will be set when Stripe is integrated
            features: []
        }
    ]
};

document.addEventListener('DOMContentLoaded', function() {
    // Get tier configuration from JSON script tag (for server-side rendering)
    const configScript = document.getElementById('tier-config');
    if (configScript) {
        try {
            const config = JSON.parse(configScript.textContent);
            Object.assign(tierConfig, config);
        } catch (e) {
            console.warn('Could not parse tier config from JSON:', e);
        }
    }

    // Handle tier button clicks
    const tierButtons = document.querySelectorAll('[data-tier]');
    tierButtons.forEach(button => {
        button.addEventListener('click', function() {
            const tierId = this.getAttribute('data-tier');
            const tierPrice = this.getAttribute('data-price');
            
            handleTierSelection(tierId, tierPrice);
        });
    });

    // Render per-tier features (included vs locked) from the canonical feature matrix
    renderTierFeatureLists();
});

function escapeHtml(str) {
    return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function iconSvg(stroke) {
    return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M20 6L9 17L4 12" stroke="${stroke}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`;
}

function renderTierFeatureLists() {
    const pf = window.PLAN_FEATURES;
    if (!pf?.FEATURES || !pf?.featureLabelForPlan || !pf?.isFeatureAvailable) {
        console.warn('[pricing] PLAN_FEATURES not available; skipping feature matrix render');
        return;
    }

    document.querySelectorAll('.feature-list[data-plan]').forEach((ul) => {
        const plan = ul.getAttribute('data-plan');
        ul.innerHTML = pf.FEATURES.map((f) => {
            const available = pf.isFeatureAvailable(plan, f.key);
            const label = pf.featureLabelForPlan(f, plan);
            const cls = available ? 'feature-item' : 'feature-item feature-locked locked-clickable';
            const stroke = available ? '#D4AF37' : '#9ca3af';
            const title = available ? '' : `Locked — requires ${String(f.minPlan || 'viewer').charAt(0).toUpperCase() + String(f.minPlan || 'viewer').slice(1)} tier`;
            const dataAttr = available ? '' : `data-locked="true" data-min-plan="${escapeHtml(f.minPlan || 'viewer')}"`;
            return `<li class="${cls}" ${title ? `title="${escapeHtml(title)}"` : ''} ${dataAttr}>
                ${iconSvg(stroke)}
                <span style="position: relative; z-index: 0;">${escapeHtml(label)}</span>
            </li>`;
        }).join('');
        
        // Add click handlers for locked features
        ul.querySelectorAll('.feature-locked').forEach((li) => {
            li.addEventListener('click', function(e) {
                e.preventDefault();
                e.stopPropagation();
                window.location.href = '/pricing';
            });
        });
    });
}

/**
 * Handle tier selection - ready for Stripe integration
 * @param {string} tierId - The tier identifier (viewer, agent, broker)
 * @param {string} tierPrice - The monthly price
 */
function handleTierSelection(tierId, tierPrice) {
    const tier = tierConfig.tiers.find(t => t.id === tierId);
    
    if (!tier) {
        console.error('Tier not found:', tierId);
        return;
    }

    // For now, redirect to signup with tier preference
    // When Stripe is integrated, this will initiate checkout
    if (tierId === 'viewer') {
        // Free tier - redirect to signup
        window.location.href = `/auth?tier=${tierId}`;
    } else {
        // Paid tiers - will redirect to Stripe checkout when integrated
        // For now, redirect to signup with tier preference
        console.log(`Selected tier: ${tier.name} - $${tier.price}/month`);
        console.log('Stripe Price ID:', tier.stripePriceId || 'Not configured');
        
        // TODO: When Stripe is integrated, replace this with:
        // initiateStripeCheckout(tier.stripePriceId, tierId);
        
        // Temporary: redirect to signup
        window.location.href = `/auth?tier=${tierId}`;
    }
}

/**
 * Future function for Stripe checkout integration
 * @param {string} priceId - Stripe Price ID
 * @param {string} tierId - Tier identifier
 */
function initiateStripeCheckout(priceId, tierId) {
    // This will be implemented when Stripe is integrated
    // Example:
    // stripe.redirectToCheckout({
    //     lineItems: [{ price: priceId, quantity: 1 }],
    //     mode: 'subscription',
    //     successUrl: `${window.location.origin}/success?tier=${tierId}`,
    //     cancelUrl: `${window.location.origin}/pricing.html`
    // });
    
    console.log('Stripe checkout will be initiated here');
    console.log('Price ID:', priceId);
    console.log('Tier ID:', tierId);
}

// Export tier config for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { tierConfig, handleTierSelection, initiateStripeCheckout };
}


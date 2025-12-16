// Pricing Page JavaScript
// Central tier configuration for future Stripe integration

const tierConfig = {
    tiers: [
        {
            id: "free",
            name: "Free",
            price: 0,
            stripePriceId: null, // Will be set when Stripe is integrated
            features: [
                "Connect 1 Gmail inbox",
                "Lead scoring for up to 50 leads per month",
                "Basic deal probability score (0–100)",
                "AI summary of lead intent",
                "Basic dashboard access"
            ],
            limitations: [
                "No AI-generated email replies",
                "No re-scoring leads",
                "No historical insights"
            ]
        },
        {
            id: "agent",
            name: "Agent",
            price: 39,
            stripePriceId: null, // Will be set when Stripe is integrated
            features: [
                "Unlimited lead scoring",
                "Advanced lead intent & engagement analysis",
                "AI-generated follow-up email drafts",
                "Lead confidence scoring (low / medium / high)",
                "Re-score leads on demand",
                "Lead filtering (hot / warm / cold)",
                "Email thread insights"
            ]
        },
        {
            id: "pro",
            name: "Pro",
            price: 79,
            stripePriceId: null, // Will be set when Stripe is integrated
            features: [
                "Everything in Agent",
                "Priority detection for high-intent leads",
                "Close timing predictions",
                "Objection detection (price, timing, financing)",
                "Weekly performance insights",
                "Advanced follow-up recommendations",
                "Custom tone presets for AI replies"
            ]
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
});

/**
 * Handle tier selection - ready for Stripe integration
 * @param {string} tierId - The tier identifier (free, agent, pro)
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
    if (tierId === 'free') {
        // Free tier - redirect to signup
        window.location.href = `auth.html?tier=${tierId}`;
    } else {
        // Paid tiers - will redirect to Stripe checkout when integrated
        // For now, redirect to signup with tier preference
        console.log(`Selected tier: ${tier.name} - $${tier.price}/month`);
        console.log('Stripe Price ID:', tier.stripePriceId || 'Not configured');
        
        // TODO: When Stripe is integrated, replace this with:
        // initiateStripeCheckout(tier.stripePriceId, tierId);
        
        // Temporary: redirect to signup
        window.location.href = `auth.html?tier=${tierId}`;
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


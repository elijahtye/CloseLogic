// Onboarding Flow JavaScript
// Using supabaseClient to avoid shadowing global window.supabase
let supabaseClient = null;

const onboardingData = {
    lead_volume: null,
    primary_goal: null,
    communication_style: null,
    email_connected: false
};

let currentStep = 1;
const totalSteps = 4;

document.addEventListener('DOMContentLoaded', async function() {
    try {
        supabaseClient = window.getSupabaseClient();
    } catch (e) {
        console.error('[onboarding] Supabase init failed:', e);
        window.location.href = 'auth.html';
        return;
    }

    // Require auth; if already onboarded, never show onboarding again
    const authResult = await window.authGuard.checkAuthAndOnboarding({
        requireAuth: true,
        requireOnboarding: false,
        redirectIfOnboarded: true
    });
    if (!authResult) return;
    
    // Initialize onboarding flow
    initializeOnboarding();
});

function initializeOnboarding() {
    // Set up step navigation
    setupStepNavigation();
    
    // Update progress indicator
    updateProgress();
    
    // Show first step
    showStep(1);
}

function setupStepNavigation() {
    // Handle option card clicks for steps 1-3
    const optionCards = document.querySelectorAll('.option-card[data-value]');
    optionCards.forEach(card => {
        card.addEventListener('click', function() {
            const step = getCurrentStep();
            const value = this.getAttribute('data-value');
            
            // Remove selected class from siblings
            const siblings = this.parentElement.querySelectorAll('.option-card');
            siblings.forEach(sibling => sibling.classList.remove('selected'));
            
            // Add selected class to clicked card
            this.classList.add('selected');
            
            // Store the value based on current step
            switch(step) {
                case 1:
                    onboardingData.lead_volume = value;
                    break;
                case 2:
                    onboardingData.primary_goal = value;
                    break;
                case 3:
                    onboardingData.communication_style = value;
                    break;
            }
            
            // Auto-advance after a short delay
            setTimeout(() => {
                if (step < totalSteps) {
                    nextStep();
                }
            }, 300);
        });
    });
    
    // Handle Gmail connection (Step 4)
    const connectGmailBtn = document.getElementById('connectGmailBtn');
    if (connectGmailBtn) {
        connectGmailBtn.addEventListener('click', function() {
            connectGmail();
        });
    }
}

function getCurrentStep() {
    const activeStep = document.querySelector('.onboarding-step.active');
    return activeStep ? parseInt(activeStep.getAttribute('data-step')) : 1;
}

function showStep(stepNumber) {
    // Hide all steps
    const allSteps = document.querySelectorAll('.onboarding-step');
    allSteps.forEach(step => step.classList.remove('active'));
    
    // Show current step
    const currentStepElement = document.querySelector(`[data-step="${stepNumber}"]`);
    if (currentStepElement) {
        currentStepElement.classList.add('active');
    }
    
    currentStep = stepNumber;
    updateProgress();
}

function nextStep() {
    // Validate current step before proceeding
    if (!validateCurrentStep()) {
        return;
    }
    
    if (currentStep < totalSteps) {
        showStep(currentStep + 1);
    } else {
        completeOnboarding();
    }
}

function validateCurrentStep() {
    switch(currentStep) {
        case 1:
            if (!onboardingData.lead_volume) {
                alert('Please select your lead volume.');
                return false;
            }
            break;
        case 2:
            if (!onboardingData.primary_goal) {
                alert('Please select your primary goal.');
                return false;
            }
            break;
        case 3:
            if (!onboardingData.communication_style) {
                alert('Please select your communication style.');
                return false;
            }
            break;
        case 4:
            if (!onboardingData.email_connected) {
                alert('Please connect your Gmail account to continue.');
                return false;
            }
            break;
    }
    return true;
}

function updateProgress() {
    const progressFill = document.getElementById('progressFill');
    const currentStepSpan = document.getElementById('currentStep');
    const totalStepsSpan = document.getElementById('totalSteps');
    
    if (progressFill) {
        const percentage = (currentStep / totalSteps) * 100;
        progressFill.style.width = `${percentage}%`;
    }
    
    if (currentStepSpan) {
        currentStepSpan.textContent = currentStep;
    }
    
    if (totalStepsSpan) {
        totalStepsSpan.textContent = totalSteps;
    }
}

function connectGmail() {
    // TODO: Implement Gmail OAuth flow
    // For now, simulate the connection
    
    const connectBtn = document.getElementById('connectGmailBtn');
    if (connectBtn) {
        connectBtn.disabled = true;
        connectBtn.textContent = 'Connecting...';
    }
    
    // Simulate OAuth flow
    // In production, this would redirect to Google OAuth
    setTimeout(() => {
        onboardingData.email_connected = true;
        
        if (connectBtn) {
            connectBtn.innerHTML = `
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="margin-right: 8px;">
                    <path d="M20 6L9 17L4 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
                Connected
            `;
            connectBtn.classList.remove('btn-primary');
            connectBtn.classList.add('btn-outline');
        }
        
        // Auto-advance to completion
        setTimeout(() => {
            completeOnboarding();
        }, 1000);
    }, 1500);
}

function completeOnboarding() {
    // Show loading state
    showStep('loading');
    
    // Save onboarding data to backend
    saveOnboardingData().then(() => {
        // Simulate dashboard loading
        setTimeout(() => {
            redirectToDashboard();
        }, 2000);
    }).catch(error => {
        console.error('Error saving onboarding data:', error);
        alert('There was an error saving your preferences. Please try again.');
    });
}

async function saveOnboardingData() {
    if (!supabaseClient) {
        throw new Error('Supabase client not initialized');
    }
    
    // Get current session
    const { data: { session }, error: sessionError } = await supabaseClient.auth.getSession();
    
    if (sessionError || !session || !session.user) {
        console.error('[onboarding] Not authenticated');
        throw new Error('Not authenticated. Please log in again.');
    }
    
    const userId = session.user.id;
    console.log('[onboarding] Saving onboarding data for user:', userId);
    
    // Prepare update data
    const updateData = {
        lead_volume: onboardingData.lead_volume,
        primary_goal: onboardingData.primary_goal,
        communication_style: onboardingData.communication_style,
        onboarding_completed: true,
        updated_at: new Date().toISOString()
    };
    
    console.log('[onboarding] Update data:', updateData);
    
    updateData.onboarding_completed_at = new Date().toISOString();

    // Upsert profile (avoids race condition if profile row doesn't exist yet)
    const { data, error } = await supabase
        .from('profiles')
        .upsert({ id: userId, ...updateData }, { onConflict: 'id' })
        .select()
        .single();
    
    if (error) {
        console.error('[onboarding] Error saving onboarding data:', error);
        throw new Error(`Failed to save onboarding data: ${error.message}`);
    }
    
    console.log('[onboarding] Onboarding data saved successfully');
    console.log('[onboarding] Profile updated:', { 
        userId, 
        onboarding_completed: data.onboarding_completed 
    });
    
    return data;
}

function redirectToDashboard() {
    // Redirect to dashboard
    window.location.href = 'dashboard.html';
}

/**
 * Get onboarding data formatted for AI prompt injection
 * This structure is ready to be injected into OpenAI prompts
 */
function getOnboardingDataForAI() {
    return {
        lead_volume: onboardingData.lead_volume,
        primary_goal: onboardingData.primary_goal,
        communication_style: onboardingData.communication_style,
        
        // Formatted for AI prompts
        ai_prompt_context: {
            lead_volume_context: getLeadVolumeContext(onboardingData.lead_volume),
            goal_context: getGoalContext(onboardingData.primary_goal),
            communication_tone: getCommunicationTone(onboardingData.communication_style)
        }
    };
}

function getLeadVolumeContext(volume) {
    const contexts = {
        '0-25': 'new agent building their pipeline',
        '25-100': 'growing agent managing moderate lead flow',
        '100-250': 'busy agent handling high lead volume',
        '250+': 'high-volume agent managing extensive pipeline'
    };
    return contexts[volume] || 'real estate agent';
}

function getGoalContext(goal) {
    const contexts = {
        'closing-more-deals': 'focused on increasing conversion rate and closing more deals',
        'responding-faster': 'prioritizing faster response times to leads',
        'prioritizing-leads': 'focused on identifying and prioritizing high-intent leads',
        'reducing-overwhelm': 'working to reduce inbox overwhelm and better manage communications'
    };
    return contexts[goal] || 'improving their real estate business';
}

function getCommunicationTone(style) {
    const tones = {
        'friendly-conversational': 'friendly, conversational, and approachable',
        'professional-direct': 'professional, direct, and business-focused',
        'warm-supportive': 'warm, supportive, and empathetic',
        'short-efficient': 'brief, efficient, and to the point'
    };
    return tones[style] || 'professional';
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        onboardingData,
        getOnboardingDataForAI,
        saveOnboardingData
    };
}


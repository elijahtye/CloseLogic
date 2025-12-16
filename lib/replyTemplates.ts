/**
 * CloseLogic Reply Template Generator v1
 * Template-based email reply generation
 */

export type Tone = 'friendly-conversational' | 'professional-direct' | 'warm-supportive' | 'short-efficient';

export interface ReplyInput {
    lastInboundMessage: string;
    leadName?: string;
    tone: Tone;
    leadScore?: number;
}

/**
 * Extract key intent from last message
 */
function extractIntent(message: string): {
    wantsViewing: boolean;
    wantsDetails: boolean;
    wantsOffer: boolean;
    hasQuestion: boolean;
} {
    const lower = message.toLowerCase();
    return {
        wantsViewing: /schedule|viewing|tour|showing|appointment|see|visit/.test(lower),
        wantsDetails: /details|information|tell me more|more about|specs/.test(lower),
        wantsOffer: /offer|buy|purchase|close|proceed|move forward/.test(lower),
        hasQuestion: /\?/.test(message) || /can you|how|what|when|where|why/.test(lower)
    };
}

/**
 * Generate greeting based on tone
 */
function getGreeting(tone: Tone, leadName?: string): string {
    const name = leadName ? ` ${leadName}` : '';
    
    switch (tone) {
        case 'friendly-conversational':
            return `Hi${name}!`;
        case 'professional-direct':
            return `Hello${name ? ` ${name}` : ''},`;
        case 'warm-supportive':
            return `Hi${name}!`;
        case 'short-efficient':
            return `Hi${name},`;
    }
}

/**
 * Generate closing based on tone
 */
function getClosing(tone: Tone): string {
    switch (tone) {
        case 'friendly-conversational':
            return 'Looking forward to hearing from you!';
        case 'professional-direct':
            return 'Please let me know if you have any questions.';
        case 'warm-supportive':
            return 'I\'m here to help make this process as smooth as possible.';
        case 'short-efficient':
            return 'Let me know if you have questions.';
    }
}

/**
 * Generate viewing suggestion based on tone
 */
function generateViewingSuggestion(tone: Tone): string {
    switch (tone) {
        case 'friendly-conversational':
            return 'I\'d love to schedule a viewing! Are you available this week? I can offer times on Tuesday afternoon, Wednesday morning, or Thursday evening.';
        case 'professional-direct':
            return 'I can schedule a viewing at your convenience. Available times: Tuesday 2-4pm, Wednesday 10am-12pm, or Thursday 5-7pm.';
        case 'warm-supportive':
            return 'I\'d be happy to schedule a viewing that works for you. I have availability Tuesday afternoon, Wednesday morning, or Thursday evening. What works best?';
        case 'short-efficient':
            return 'Available for viewing: Tue 2-4pm, Wed 10am-12pm, Thu 5-7pm. Let me know what works.';
    }
}

/**
 * Generate details offer based on tone
 */
function generateDetailsOffer(tone: Tone): string {
    switch (tone) {
        case 'friendly-conversational':
            return 'I\'d be happy to send you more details! I\'ll include property specs, neighborhood info, and recent comparable sales.';
        case 'professional-direct':
            return 'I\'ll send comprehensive property details including specifications, neighborhood information, and market comparables.';
        case 'warm-supportive':
            return 'I\'d love to provide you with all the details you need. I\'ll send property information, neighborhood highlights, and answer any questions you have.';
        case 'short-efficient':
            return 'Sending property details, specs, and neighborhood info now.';
    }
}

/**
 * Generate offer assistance based on tone
 */
function generateOfferAssistance(tone: Tone): string {
    switch (tone) {
        case 'friendly-conversational':
            return 'Great! Let\'s move forward. I can help you prepare the offer and guide you through the next steps.';
        case 'professional-direct':
            return 'I\'ll prepare the offer documents and guide you through the submission process.';
        case 'warm-supportive':
            return 'Excellent! I\'m here to help you through every step. Let me prepare the offer documents and walk you through the process.';
        case 'short-efficient':
            return 'Preparing offer documents. Will send next steps shortly.';
    }
}

/**
 * Generate question response based on tone
 */
function generateQuestionResponse(tone: Tone, message: string): string {
    const hasFinancing = /financing|loan|mortgage|pre-approved|budget/.test(message.toLowerCase());
    const hasTimeline = /timeline|when|how soon|timeframe/.test(message.toLowerCase());
    
    if (hasFinancing) {
        switch (tone) {
            case 'friendly-conversational':
                return 'Great question! I can connect you with trusted lenders who offer competitive rates. Would that be helpful?';
            case 'professional-direct':
                return 'I can provide lender referrals and financing options. Should I send that information?';
            case 'warm-supportive':
                return 'I\'d be happy to help with financing options. I work with several trusted lenders who can provide competitive rates.';
            case 'short-efficient':
                return 'Can connect you with lenders. Should I send referrals?';
        }
    }
    
    if (hasTimeline) {
        switch (tone) {
            case 'friendly-conversational':
                return 'Timeline depends on a few factors. Are you looking to move quickly, or do you have flexibility?';
            case 'professional-direct':
                return 'Typical timeline is 30-45 days from offer acceptance to closing. Your specific timeline depends on financing and inspection periods.';
            case 'warm-supportive':
                return 'I\'d be happy to discuss timeline options with you. It typically takes 30-45 days, but we can work around your schedule.';
            case 'short-efficient':
                return 'Typical timeline: 30-45 days. Can discuss specifics based on your needs.';
        }
    }
    
    switch (tone) {
        case 'friendly-conversational':
            return 'I\'d be happy to answer that! Let me know what specific information would be most helpful.';
        case 'professional-direct':
            return 'I can provide that information. What details would be most useful?';
        case 'warm-supportive':
            return 'I\'d love to help with that. What information would be most useful for you?';
        case 'short-efficient':
            return 'Can provide that info. What do you need?';
    }
}

/**
 * Generate reply based on input
 */
export function generateReply(input: ReplyInput): string {
    const { lastInboundMessage, leadName, tone, leadScore } = input;
    const intent = extractIntent(lastInboundMessage);
    
    const greeting = getGreeting(tone, leadName);
    let body = '';
    
    // Determine main content based on intent
    if (intent.wantsOffer || (leadScore && leadScore >= 70)) {
        body = generateOfferAssistance(tone);
    } else if (intent.wantsViewing) {
        body = generateViewingSuggestion(tone);
    } else if (intent.wantsDetails) {
        body = generateDetailsOffer(tone);
    } else if (intent.hasQuestion) {
        body = generateQuestionResponse(tone, lastInboundMessage);
    } else {
        // Generic helpful response
        switch (tone) {
            case 'friendly-conversational':
                body = 'Thanks for reaching out! I\'d love to help you find the perfect property. What are you looking for?';
                break;
            case 'professional-direct':
                body = 'Thank you for your interest. I can provide property information and schedule viewings at your convenience.';
                break;
            case 'warm-supportive':
                body = 'I\'m so glad you reached out! I\'m here to help make your property search smooth. What can I help you with?';
                break;
            case 'short-efficient':
                body = 'Thanks for reaching out. How can I help?';
                break;
        }
    }
    
    const closing = getClosing(tone);
    
    return `${greeting}\n\n${body}\n\n${closing}`;
}


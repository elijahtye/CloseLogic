/**
 * CloseLogic Rule-Based Scoring Engine v1
 * Deterministic scoring based on message analysis
 */

export interface ScoringInput {
    messages: Array<{
        direction: 'inbound' | 'outbound';
        body: string;
        sent_at: string;
    }>;
    leadEmail: string;
    leadName?: string;
}

export interface ScoringOutput {
    deal_probability: number; // 0-100
    confidence: 'low' | 'medium' | 'high';
    reason: string;
    recommended_actions: string[];
    needs_followup: boolean;
}

/**
 * Keywords that indicate high intent
 */
const HIGH_INTENT_KEYWORDS = [
    'schedule', 'viewing', 'tour', 'showing', 'appointment',
    'ready to buy', 'make an offer', 'close', 'closing',
    'financing', 'pre-approved', 'loan', 'mortgage',
    'timeline', 'when can we', 'as soon as possible', 'urgent',
    'interested', 'perfect', 'let\'s move forward', 'proceed'
];

/**
 * Keywords that indicate medium intent
 */
const MEDIUM_INTENT_KEYWORDS = [
    'more details', 'information', 'tell me more', 'questions',
    'considering', 'looking for', 'searching', 'options',
    'price', 'cost', 'budget', 'afford'
];

/**
 * Keywords that indicate low intent or ghosting risk
 */
const LOW_INTENT_KEYWORDS = [
    'just browsing', 'not ready', 'maybe later', 'still thinking',
    'not sure', 'not interested', 'no longer', 'changed my mind'
];

/**
 * Calculate time-based score component
 */
function calculateRecencyScore(messages: ScoringInput['messages']): number {
    if (messages.length === 0) return 0;
    
    const latestMessage = messages[messages.length - 1];
    const sentAt = new Date(latestMessage.sent_at);
    const hoursAgo = (Date.now() - sentAt.getTime()) / (1000 * 60 * 60);
    
    if (hoursAgo < 1) return 30; // Very recent
    if (hoursAgo < 6) return 25; // Recent
    if (hoursAgo < 24) return 15; // Today
    if (hoursAgo < 72) return 10; // This week
    if (hoursAgo < 168) return 5;  // This month
    return 0; // Old
}

/**
 * Calculate engagement score based on message count and frequency
 */
function calculateEngagementScore(messages: ScoringInput['messages']): number {
    if (messages.length === 0) return 0;
    
    const inboundCount = messages.filter(m => m.direction === 'inbound').length;
    const outboundCount = messages.filter(m => m.direction === 'outbound').length;
    
    // More inbound messages = higher engagement
    const messageRatio = inboundCount / Math.max(outboundCount, 1);
    
    let score = Math.min(inboundCount * 5, 30); // Up to 30 points for message count
    score += Math.min(messageRatio * 10, 20); // Up to 20 points for ratio
    
    return Math.min(score, 50);
}

/**
 * Calculate keyword-based intent score
 */
function calculateKeywordScore(messages: ScoringInput['messages']): number {
    const allText = messages.map(m => m.body.toLowerCase()).join(' ');
    
    let score = 0;
    
    // High intent keywords
    const highIntentMatches = HIGH_INTENT_KEYWORDS.filter(kw => 
        allText.includes(kw.toLowerCase())
    ).length;
    score += Math.min(highIntentMatches * 8, 40);
    
    // Medium intent keywords
    const mediumIntentMatches = MEDIUM_INTENT_KEYWORDS.filter(kw => 
        allText.includes(kw.toLowerCase())
    ).length;
    score += Math.min(mediumIntentMatches * 3, 15);
    
    // Low intent keywords (negative)
    const lowIntentMatches = LOW_INTENT_KEYWORDS.filter(kw => 
        allText.includes(kw.toLowerCase())
    ).length;
    score -= lowIntentMatches * 10;
    
    return Math.max(0, Math.min(score, 40));
}

/**
 * Calculate response speed score
 */
function calculateResponseSpeedScore(messages: ScoringInput['messages']): number {
    if (messages.length < 2) return 0;
    
    let totalResponseTime = 0;
    let responseCount = 0;
    
    for (let i = 1; i < messages.length; i++) {
        const prev = messages[i - 1];
        const curr = messages[i];
        
        // If previous was inbound and current is outbound, measure response time
        if (prev.direction === 'inbound' && curr.direction === 'outbound') {
            const prevTime = new Date(prev.sent_at).getTime();
            const currTime = new Date(curr.sent_at).getTime();
            const hoursDiff = (currTime - prevTime) / (1000 * 60 * 60);
            totalResponseTime += hoursDiff;
            responseCount++;
        }
    }
    
    if (responseCount === 0) return 0;
    
    const avgResponseTime = totalResponseTime / responseCount;
    
    // Faster responses = higher score
    if (avgResponseTime < 2) return 20; // Excellent
    if (avgResponseTime < 6) return 15; // Good
    if (avgResponseTime < 24) return 10; // Acceptable
    return 5; // Slow
}

/**
 * Determine if lead needs follow-up
 */
function calculateNeedsFollowup(messages: ScoringInput['messages']): boolean {
    if (messages.length === 0) return false;
    
    const latestMessage = messages[messages.length - 1];
    
    // If last message is inbound, check if there's an outbound after it
    if (latestMessage.direction === 'inbound') {
        // Check if there's any outbound message after this
        const latestInboundTime = new Date(latestMessage.sent_at).getTime();
        const hasOutboundAfter = messages.some(m => 
            m.direction === 'outbound' && 
            new Date(m.sent_at).getTime() > latestInboundTime
        );
        
        return !hasOutboundAfter;
    }
    
    return false;
}

/**
 * Determine confidence level based on score and data quality
 */
function determineConfidence(score: number, messageCount: number): 'low' | 'medium' | 'high' {
    if (messageCount < 2) return 'low';
    if (score >= 70 && messageCount >= 3) return 'high';
    if (score >= 50 && messageCount >= 2) return 'medium';
    if (score < 40) return 'low';
    return 'medium';
}

/**
 * Generate reason text explaining the score
 */
function generateReason(
    score: number,
    confidence: 'low' | 'medium' | 'high',
    messages: ScoringInput['messages']
): string {
    const inboundCount = messages.filter(m => m.direction === 'inbound').length;
    const latestMessage = messages[messages.length - 1];
    const hoursAgo = latestMessage 
        ? (Date.now() - new Date(latestMessage.sent_at).getTime()) / (1000 * 60 * 60)
        : 999;
    
    if (score >= 70) {
        if (hoursAgo < 6) {
            return `High intent score due to recent engagement (${Math.round(hoursAgo)}h ago), strong buying signals in messages, and active communication.`;
        }
        return `High intent score based on strong buying signals, multiple inbound messages (${inboundCount}), and clear interest indicators.`;
    }
    
    if (score >= 40) {
        return `Medium score indicates interest but needs more engagement. ${inboundCount > 0 ? `${inboundCount} inbound message(s)` : 'Limited communication'} shows potential, but more interaction needed to gauge true intent.`;
    }
    
    if (hoursAgo > 168) {
        return `Low score due to lack of recent activity (${Math.round(hoursAgo / 24)} days ago). Lead may need re-engagement or nurturing.`;
    }
    
    return `Low score indicates casual browsing or early-stage interest. Limited engagement and no strong buying signals detected yet.`;
}

/**
 * Generate recommended actions based on score and context
 */
function generateRecommendedActions(
    score: number,
    needsFollowup: boolean,
    messages: ScoringInput['messages']
): string[] {
    const actions: string[] = [];
    const latestMessage = messages[messages.length - 1];
    const hoursAgo = latestMessage 
        ? (Date.now() - new Date(latestMessage.sent_at).getTime()) / (1000 * 60 * 60)
        : 999;
    
    if (needsFollowup) {
        if (hoursAgo < 6) {
            actions.push('Respond within the next hour to maintain momentum');
        } else if (hoursAgo < 24) {
            actions.push('Follow up today to keep the conversation active');
        } else {
            actions.push('Re-engage with a personalized message');
        }
    }
    
    if (score >= 70) {
        actions.push('Suggest 2-3 specific viewing times');
        actions.push('Send property details and neighborhood information');
        if (hoursAgo < 2) {
            actions.push('Respond immediately - this is a hot lead');
        }
    } else if (score >= 40) {
        actions.push('Send comprehensive property details immediately');
        actions.push('Ask qualifying questions about timeline and financing');
        actions.push('Follow up with a phone call to gauge interest level');
    } else {
        actions.push('Add to nurture sequence with monthly property updates');
        actions.push('Focus on building relationship and trust');
        actions.push('Don\'t push for immediate action');
    }
    
    return actions.slice(0, 3); // Return top 3
}

/**
 * Main scoring function
 */
export function scoreLead(input: ScoringInput): ScoringOutput {
    const messages = input.messages.sort((a, b) => 
        new Date(a.sent_at).getTime() - new Date(b.sent_at).getTime()
    );
    
    // Calculate component scores
    const recencyScore = calculateRecencyScore(messages);
    const engagementScore = calculateEngagementScore(messages);
    const keywordScore = calculateKeywordScore(messages);
    const responseSpeedScore = calculateResponseSpeedScore(messages);
    
    // Total score (0-100)
    const totalScore = Math.round(
        recencyScore + 
        engagementScore + 
        keywordScore + 
        responseSpeedScore
    );
    
    // Clamp to 0-100
    const deal_probability = Math.max(0, Math.min(100, totalScore));
    
    // Determine confidence
    const confidence = determineConfidence(deal_probability, messages.length);
    
    // Check if needs follow-up
    const needs_followup = calculateNeedsFollowup(messages);
    
    // Generate reason
    const reason = generateReason(deal_probability, confidence, messages);
    
    // Generate recommended actions
    const recommended_actions = generateRecommendedActions(
        deal_probability,
        needs_followup,
        messages
    );
    
    return {
        deal_probability,
        confidence,
        reason,
        recommended_actions,
        needs_followup
    };
}


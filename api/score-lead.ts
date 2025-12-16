/**
 * API Route: POST /api/score-lead
 * Runs rule-based scoring and updates lead score
 */

import { scoreLead, ScoringInput } from '../lib/scoring';

export interface ScoreLeadRequest {
    user_id: string;
    lead_id: string;
}

export interface ScoreLeadResponse {
    success: boolean;
    score?: {
        deal_probability: number;
        confidence: 'low' | 'medium' | 'high';
        reason: string;
        recommended_actions: string[];
        needs_followup: boolean;
    };
    error?: string;
}

/**
 * POST /api/score-lead handler
 * TODO: Replace with actual Supabase queries
 */
export async function scoreLeadEndpoint(
    data: ScoreLeadRequest
): Promise<ScoreLeadResponse> {
    // Placeholder: In production, this would:
    // 1. Fetch lead and messages from Supabase
    // 2. Run scoring algorithm
    // 3. Insert score into lead_scores table
    // 4. Update leads table with new score/confidence/needs_followup
    
    // Example implementation:
    // const { data: lead } = await supabase
    //     .from('leads')
    //     .select('lead_email, lead_name')
    //     .eq('id', data.lead_id)
    //     .eq('user_id', data.user_id)
    //     .single();
    
    // const { data: messages } = await supabase
    //     .from('messages')
    //     .select('direction, body, sent_at')
    //     .eq('lead_id', data.lead_id)
    //     .order('sent_at', { ascending: true });
    
    // const scoringInput: ScoringInput = {
    //     messages: messages || [],
    //     leadEmail: lead.lead_email,
    //     leadName: lead.lead_name
    // };
    
    // const scoreResult = scoreLead(scoringInput);
    
    // // Insert score history
    // await supabase
    //     .from('lead_scores')
    //     .insert({
    //         lead_id: data.lead_id,
    //         user_id: data.user_id,
    //         deal_probability: scoreResult.deal_probability,
    //         confidence: scoreResult.confidence,
    //         reason: scoreResult.reason,
    //         recommended_actions: scoreResult.recommended_actions,
    //         model_version: 'rules_v1'
    //     });
    
    // // Update lead
    // await supabase
    //     .from('leads')
    //     .update({
    //         score: scoreResult.deal_probability,
    //         confidence: scoreResult.confidence,
    //         needs_followup: scoreResult.needs_followup,
    //         updated_at: new Date().toISOString()
    //     })
    //     .eq('id', data.lead_id);
    
    return {
        success: true,
        score: {
            deal_probability: 0,
            confidence: 'low',
            reason: 'Scoring not yet implemented',
            recommended_actions: [],
            needs_followup: false
        }
    };
}


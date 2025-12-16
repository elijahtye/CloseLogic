/**
 * API Route: GET /api/leads
 * Returns list of leads with filters and search
 */

export interface GetLeadsRequest {
    user_id: string;
    filter?: 'all' | 'hot' | 'warm' | 'cold' | 'followup';
    search?: string;
}

export interface LeadListItem {
    id: string;
    lead_name?: string;
    lead_email: string;
    score: number;
    confidence: 'low' | 'medium' | 'high';
    needs_followup: boolean;
    last_message_at?: string;
    last_message_snippet?: string;
}

export interface GetLeadsResponse {
    leads: LeadListItem[];
}

/**
 * GET /api/leads handler
 * TODO: Replace with actual Supabase query
 */
export async function getLeads(params: GetLeadsRequest): Promise<GetLeadsResponse> {
    // Placeholder: In production, this would query Supabase
    // let query = supabase
    //     .from('leads')
    //     .select(`
    //         id,
    //         lead_name,
    //         lead_email,
    //         score,
    //         confidence,
    //         needs_followup,
    //         last_message_at
    //     `)
    //     .eq('user_id', params.user_id)
    //     .order('last_message_at', { ascending: false });
    
    // // Apply filter
    // if (params.filter === 'hot') {
    //     query = query.gte('score', 70);
    // } else if (params.filter === 'warm') {
    //     query = query.gte('score', 40).lt('score', 70);
    // } else if (params.filter === 'cold') {
    //     query = query.lt('score', 40);
    // } else if (params.filter === 'followup') {
    //     query = query.eq('needs_followup', true);
    // }
    
    // // Apply search
    // if (params.search) {
    //     query = query.or(`lead_name.ilike.%${params.search}%,lead_email.ilike.%${params.search}%`);
    // }
    
    // const { data, error } = await query;
    
    return {
        leads: []
    };
}

/**
 * API Route: GET /api/leads/[id]
 * Returns lead details with messages and latest score
 */

export interface GetLeadDetailsRequest {
    user_id: string;
    lead_id: string;
}

export interface Message {
    id: string;
    direction: 'inbound' | 'outbound';
    subject?: string;
    body: string;
    sent_at: string;
}

export interface LeadScore {
    deal_probability: number;
    confidence: 'low' | 'medium' | 'high';
    reason: string;
    recommended_actions: string[];
    created_at: string;
}

export interface GetLeadDetailsResponse {
    id: string;
    lead_name?: string;
    lead_email: string;
    score: number;
    confidence: 'low' | 'medium' | 'high';
    needs_followup: boolean;
    messages: Message[];
    latest_score?: LeadScore;
}

/**
 * GET /api/leads/[id] handler
 * TODO: Replace with actual Supabase queries
 */
export async function getLeadDetails(
    params: GetLeadDetailsRequest
): Promise<GetLeadDetailsResponse | null> {
    // Placeholder: In production, this would query Supabase
    // // Get lead
    // const { data: lead, error: leadError } = await supabase
    //     .from('leads')
    //     .select('*')
    //     .eq('id', params.lead_id)
    //     .eq('user_id', params.user_id)
    //     .single();
    
    // if (leadError || !lead) return null;
    
    // // Get messages (last 50)
    // const { data: messages } = await supabase
    //     .from('messages')
    //     .select('id, direction, subject, body, sent_at')
    //     .eq('lead_id', params.lead_id)
    //     .order('sent_at', { ascending: true })
    //     .limit(50);
    
    // // Get latest score
    // const { data: latestScore } = await supabase
    //     .from('lead_scores')
    //     .select('deal_probability, confidence, reason, recommended_actions, created_at')
    //     .eq('lead_id', params.lead_id)
    //     .order('created_at', { ascending: false })
    //     .limit(1)
    //     .single();
    
    return null;
}


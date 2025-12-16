/**
 * API Route: GET /api/profile
 * Returns user profile with onboarding fields
 */

export interface GetProfileRequest {
    user_id: string;
}

export interface GetProfileResponse {
    id: string;
    email: string;
    full_name?: string;
    lead_volume?: string;
    primary_goal?: string;
    communication_style?: string;
    plan: string;
    created_at: string;
    updated_at: string;
}

/**
 * GET /api/profile handler
 * TODO: Replace with actual Supabase query
 */
export async function getProfile(userId: string): Promise<GetProfileResponse | null> {
    // Placeholder: In production, this would query Supabase
    // const { data, error } = await supabase
    //     .from('profiles')
    //     .select('*')
    //     .eq('id', userId)
    //     .single();
    
    // For now, return null (will be handled by API route)
    return null;
}

/**
 * API Route: POST /api/profile
 * Upserts user profile
 */

export interface UpdateProfileRequest {
    user_id: string;
    email: string;
    full_name?: string;
    lead_volume?: string;
    primary_goal?: string;
    communication_style?: string;
}

export interface UpdateProfileResponse {
    success: boolean;
    profile?: GetProfileResponse;
    error?: string;
}

/**
 * POST /api/profile handler
 * TODO: Replace with actual Supabase upsert
 */
export async function updateProfile(
    data: UpdateProfileRequest
): Promise<UpdateProfileResponse> {
    // Placeholder: In production, this would upsert to Supabase
    // const { data: profile, error } = await supabase
    //     .from('profiles')
    //     .upsert({
    //         id: data.user_id,
    //         email: data.email,
    //         full_name: data.full_name,
    //         lead_volume: data.lead_volume,
    //         primary_goal: data.primary_goal,
    //         communication_style: data.communication_style,
    //         updated_at: new Date().toISOString()
    //     }, {
    //         onConflict: 'id'
    //     })
    //     .select()
    //     .single();
    
    return {
        success: true,
        profile: {
            id: data.user_id,
            email: data.email,
            full_name: data.full_name,
            lead_volume: data.lead_volume,
            primary_goal: data.primary_goal,
            communication_style: data.communication_style,
            plan: 'free',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        }
    };
}


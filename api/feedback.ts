/**
 * API Route: POST /api/feedback
 * Submits user feedback
 */

export interface FeedbackRequest {
    user_id: string;
    message: string;
    page?: string;
}

export interface FeedbackResponse {
    success: boolean;
    error?: string;
}

/**
 * POST /api/feedback handler
 * TODO: Replace with actual Supabase insert
 */
export async function submitFeedback(
    data: FeedbackRequest
): Promise<FeedbackResponse> {
    // Placeholder: In production, this would insert into Supabase
    // const { error } = await supabase
    //     .from('feedback')
    //     .insert({
    //         user_id: data.user_id,
    //         message: data.message,
    //         page: data.page || null
    //     });
    
    // if (error) {
    //     return { success: false, error: error.message };
    // }
    
    return {
        success: true
    };
}


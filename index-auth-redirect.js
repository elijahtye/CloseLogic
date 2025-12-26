// Landing page: if user is already signed in, redirect them to the app.
// This avoids making signed-in users click "Login" again.

document.addEventListener('DOMContentLoaded', async () => {
  try {
    if (typeof window.getSupabaseClient !== 'function') return;
    const supabaseClient = window.getSupabaseClient();
    if (!supabaseClient?.auth?.getSession) return;

    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session?.user) return;

    // If we can load profile, route based on onboarding state; otherwise send to dashboard.
    try {
      const { data: profile } = await supabaseClient
        .from('profiles')
        .select('onboarding_completed')
        .eq('id', session.user.id)
        .maybeSingle();

      if (profile && profile.onboarding_completed !== true) {
        window.location.href = 'onboarding.html';
        return;
      }
    } catch (_) {
      // ignore and fall through
    }

    window.location.href = 'dashboard.html';
  } catch (e) {
    console.error('[index] auth redirect check failed:', e?.message || e);
  }
});



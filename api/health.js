// Health Check Endpoint
// GET /api/health
// Returns server status and basic info

export default async function handler(req, res) {
    try {
        // Set CORS headers
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
        
        // Handle preflight
        if (req.method === 'OPTIONS') {
            return res.status(200).end();
        }
        
        // Only allow GET
        if (req.method !== 'GET') {
            return res.status(405).json({ 
                ok: false,
                error: 'Method not allowed' 
            });
        }
        
        // Return health status
        return res.status(200).json({
            ok: true,
            status: 'healthy',
            timestamp: new Date().toISOString(),
            server: 'CloseLogic API'
        });
        
    } catch (error) {
        console.error('[health] Error:', error);
        return res.status(500).json({
            ok: false,
            error: error?.message || 'Internal server error'
        });
    }
}


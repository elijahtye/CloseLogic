// Dashboard JavaScript - Premium Analytics-First CRM UI
// CloseLogic Post-Onboarding Dashboard

// Initialize Supabase client
let supabase = null;

// Expanded mock data with sources and timestamps
const mockLeads = [
    {
        id: 1,
        name: "Sarah Johnson",
        email: "sarah.johnson@email.com",
        score: 87,
        confidence: "high",
        lastMessage: "Thanks for the info! When can we schedule a viewing?",
        lastActivity: "2h ago",
        lastMessageAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
        needsFollowup: false,
        source: "Zillow",
        pipelineValue: 450000,
        scoreExplanation: [
            "Asking about scheduling a viewing",
            "Fast response time (2 hours)",
            "Expressing specific interest in property details",
            "Engaged in active conversation"
        ],
        recommendations: [
            { text: "Respond within the next hour to maintain momentum", urgency: "high" },
            { text: "Suggest 2-3 specific viewing times", urgency: "high" },
            { text: "Send property details and neighborhood information", urgency: "medium" }
        ],
        messages: [
            {
                from: "lead",
                sender: "Sarah Johnson",
                time: "2h ago",
                sentAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
                body: "Thanks for the info! When can we schedule a viewing?"
            },
            {
                from: "agent",
                sender: "You",
                time: "3h ago",
                sentAt: new Date(Date.now() - 3 * 60 * 60 * 1000),
                body: "Hi Sarah! I'd be happy to help you find your perfect home. What type of property are you looking for?"
            },
            {
                from: "lead",
                sender: "Sarah Johnson",
                time: "3h ago",
                sentAt: new Date(Date.now() - 3 * 60 * 60 * 1000),
                body: "I'm interested in 3BR/2BA homes in the downtown area, budget around $450K."
            }
        ]
    },
    {
        id: 2,
        name: "Michael Chen",
        email: "mchen@email.com",
        score: 62,
        confidence: "medium",
        lastMessage: "Can you send me more details about the property?",
        lastActivity: "5h ago",
        lastMessageAt: new Date(Date.now() - 5 * 60 * 60 * 1000),
        needsFollowup: true,
        source: "Realtor.com",
        pipelineValue: 320000,
        scoreExplanation: [
            "Asking for property details shows genuine interest",
            "Response time could be faster",
            "Needs more engagement to move forward",
            "Moderate engagement level"
        ],
        recommendations: [
            { text: "Send comprehensive property details immediately", urgency: "high" },
            { text: "Follow up with a phone call to gauge interest level", urgency: "medium" },
            { text: "Ask qualifying questions about timeline and financing", urgency: "medium" }
        ],
        messages: [
            {
                from: "lead",
                sender: "Michael Chen",
                time: "5h ago",
                sentAt: new Date(Date.now() - 5 * 60 * 60 * 1000),
                body: "Can you send me more details about the property?"
            },
            {
                from: "agent",
                sender: "You",
                time: "1d ago",
                sentAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
                body: "Hi Michael, I saw you were interested in the property listing. Would you like to schedule a viewing?"
            }
        ]
    },
    {
        id: 3,
        name: "Emily Rodriguez",
        email: "emily.r@email.com",
        score: 94,
        confidence: "high",
        lastMessage: "Perfect! Let's move forward with the offer.",
        lastActivity: "30m ago",
        lastMessageAt: new Date(Date.now() - 30 * 60 * 1000),
        needsFollowup: false,
        source: "Referral",
        pipelineValue: 680000,
        scoreExplanation: [
            "Ready to make an offer",
            "Showing strong buying intent",
            "Expressing urgency",
            "High engagement and responsiveness"
        ],
        recommendations: [
            { text: "Respond immediately - this is a hot lead", urgency: "high" },
            { text: "Prepare offer documents and next steps", urgency: "high" },
            { text: "Schedule closing timeline discussion", urgency: "high" }
        ],
        messages: [
            {
                from: "lead",
                sender: "Emily Rodriguez",
                time: "30m ago",
                sentAt: new Date(Date.now() - 30 * 60 * 1000),
                body: "Perfect! Let's move forward with the offer."
            },
            {
                from: "agent",
                sender: "You",
                time: "1h ago",
                sentAt: new Date(Date.now() - 60 * 60 * 1000),
                body: "Great! I've prepared the offer documents. Would you like to review them?"
            }
        ]
    },
    {
        id: 4,
        name: "James Wilson",
        email: "jwilson@email.com",
        score: 35,
        confidence: "low",
        lastMessage: "Just browsing for now, thanks.",
        lastActivity: "2d ago",
        lastMessageAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
        needsFollowup: false,
        source: "Website",
        pipelineValue: 280000,
        scoreExplanation: [
            "Casual browsing behavior",
            "No immediate buying intent detected",
            "May need nurturing over time",
            "Low engagement level"
        ],
        recommendations: [
            { text: "Add to nurture sequence with monthly property updates", urgency: "low" },
            { text: "Don't push for immediate action", urgency: "low" },
            { text: "Focus on building relationship and trust", urgency: "low" }
        ],
        messages: [
            {
                from: "lead",
                sender: "James Wilson",
                time: "2d ago",
                sentAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
                body: "Just browsing for now, thanks."
            }
        ]
    },
    {
        id: 5,
        name: "Lisa Martinez",
        email: "lisa.m@email.com",
        score: 75,
        confidence: "high",
        lastMessage: "I'd like to see the property this weekend.",
        lastActivity: "1h ago",
        lastMessageAt: new Date(Date.now() - 60 * 60 * 1000),
        needsFollowup: false,
        source: "Zillow",
        pipelineValue: 520000,
        scoreExplanation: [
            "Requesting property viewing",
            "Specific timeline mentioned",
            "High engagement",
            "Quick response time"
        ],
        recommendations: [
            { text: "Schedule viewing for this weekend", urgency: "high" },
            { text: "Send property details and directions", urgency: "medium" },
            { text: "Prepare comparables for discussion", urgency: "medium" }
        ],
        messages: [
            {
                from: "lead",
                sender: "Lisa Martinez",
                time: "1h ago",
                sentAt: new Date(Date.now() - 60 * 60 * 1000),
                body: "I'd like to see the property this weekend."
            }
        ]
    },
    {
        id: 6,
        name: "David Kim",
        email: "david.kim@email.com",
        score: 58,
        confidence: "medium",
        lastMessage: "What's the HOA fee?",
        lastActivity: "8h ago",
        lastMessageAt: new Date(Date.now() - 8 * 60 * 60 * 1000),
        needsFollowup: true,
        source: "Realtor.com",
        pipelineValue: 380000,
        scoreExplanation: [
            "Asking specific property questions",
            "Moderate engagement",
            "Needs follow-up",
            "Showing interest in details"
        ],
        recommendations: [
            { text: "Provide HOA information immediately", urgency: "high" },
            { text: "Follow up with additional property details", urgency: "medium" },
            { text: "Ask about financing pre-approval", urgency: "medium" }
        ],
        messages: [
            {
                from: "lead",
                sender: "David Kim",
                time: "8h ago",
                sentAt: new Date(Date.now() - 8 * 60 * 60 * 1000),
                body: "What's the HOA fee?"
            }
        ]
    }
];

// State management
let currentLeads = [...mockLeads];
let selectedLeadId = null;
let currentFilter = 'all';
let searchQuery = '';
let onboardingData = {};
let currentDateRange = '30D';
let chartInstances = {};

// Helper function to get user_id from Supabase session
async function getUserId() {
    if (!supabase) {
        console.warn('Supabase client not initialized');
        return null;
    }
    
    try {
        const { data: { session }, error } = await supabase.auth.getSession();
        
        if (error) {
            console.error('Error getting session:', error);
            return null;
        }
        
        if (session && session.user) {
            return session.user.id;
        }
        
        return null;
    } catch (error) {
        console.error('Exception getting user ID:', error);
        return null;
    }
}

// Initialize dashboard
document.addEventListener('DOMContentLoaded', async function() {
    // Initialize Supabase client
    try {
        if (typeof window.supabase === 'undefined') {
            console.error('Supabase library not loaded. Redirecting to auth...');
            window.location.href = 'auth.html';
            return;
        }
        
        if (typeof window.SUPABASE_CONFIG === 'undefined' || 
            !window.SUPABASE_CONFIG.url || !window.SUPABASE_CONFIG.anonKey) {
            console.error('Supabase configuration missing. Redirecting to auth...');
            window.location.href = 'auth.html';
            return;
        }
        
        supabase = window.supabase.createClient(window.SUPABASE_CONFIG.url, window.SUPABASE_CONFIG.anonKey);
        console.log('Supabase client initialized');
    } catch (error) {
        console.error('Error initializing Supabase:', error);
        window.location.href = 'auth.html';
        return;
    }
    
    // Check for active session
    const hasSession = await checkSession();
    if (!hasSession) {
        console.log('No active session, redirecting to auth...');
        window.location.href = 'auth.html';
        return;
    }
    
    // Session exists, continue with dashboard initialization
    loadOnboardingData();
    initializeDashboard();
    setupEventListeners();
    renderKPIs();
    initCharts();
    filterAndRenderLeads();
    
    // Auto-select first hot lead or most recent
    if (currentLeads.length > 0) {
        const hotLead = currentLeads.find(l => l.score >= 70);
        selectLead(hotLead ? hotLead.id : currentLeads[0].id);
    }
});

/**
 * Check for active Supabase session
 */
async function checkSession() {
    if (!supabase) {
        return false;
    }
    
    try {
        const { data: { session }, error } = await supabase.auth.getSession();
        
        if (error) {
            console.error('Error checking session:', error);
            return false;
        }
        
        if (session) {
            console.log('Active session found:', session.user.email);
            return true;
        }
        
        return false;
    } catch (error) {
        console.error('Exception checking session:', error);
        return false;
    }
}

function loadOnboardingData() {
    const stored = localStorage.getItem('onboardingData');
    if (stored) {
        onboardingData = JSON.parse(stored);
    } else {
        onboardingData = {
            primary_goal: 'closing-more-deals',
            communication_style: 'professional-direct'
        };
    }
}

function initializeDashboard() {
    // Set up user menu
    const userMenuBtn = document.getElementById('userMenuBtn');
    const userMenuDropdown = document.getElementById('userMenuDropdown');
    
    if (userMenuBtn && userMenuDropdown) {
        userMenuBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            userMenuDropdown.classList.toggle('show');
        });
        
        document.addEventListener('click', function() {
            userMenuDropdown.classList.remove('show');
        });
    }
    
    // Set up logout
    const logoutLink = userMenuDropdown?.querySelector('a[href="index.html"]');
    if (logoutLink) {
        logoutLink.addEventListener('click', async function(e) {
            e.preventDefault();
            await signOut();
        });
    }
}

async function signOut() {
    if (!supabase) {
        window.location.href = 'auth.html';
        return;
    }
    
    try {
        const { error } = await supabase.auth.signOut();
        if (error) {
            console.error('Error signing out:', error);
        }
        window.location.href = 'auth.html';
    } catch (error) {
        console.error('Exception during sign out:', error);
        window.location.href = 'auth.html';
    }
}

function setupEventListeners() {
    // Date range buttons
    document.querySelectorAll('.date-range-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            document.querySelectorAll('.date-range-btn').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            currentDateRange = this.getAttribute('data-range');
            updateCharts(currentDateRange);
        });
    });
    
    // Content tabs
    document.querySelectorAll('.content-tab').forEach(tab => {
        tab.addEventListener('click', function() {
            const tabName = this.getAttribute('data-tab');
            document.querySelectorAll('.content-tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            this.classList.add('active');
            document.getElementById(`${tabName}Tab`).classList.add('active');
            
            // Initialize performance charts if switching to performance tab
            if (tabName === 'performance') {
                initPerformanceCharts();
            }
        });
    });
    
    // Filter buttons
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            currentFilter = this.getAttribute('data-filter');
            filterAndRenderLeads();
        });
    });
    
    // Follow-up toggle
    const followupToggle = document.getElementById('followupToggle');
    if (followupToggle) {
        followupToggle.addEventListener('change', function() {
            filterAndRenderLeads();
        });
    }
    
    // Search
    const searchInput = document.getElementById('leadSearch');
    if (searchInput) {
        searchInput.addEventListener('input', function() {
            searchQuery = this.value.toLowerCase();
            filterAndRenderLeads();
        });
    }
    
    // Sync inbox button
    document.getElementById('syncInboxBtn')?.addEventListener('click', syncInbox);
    document.getElementById('connectGmailEmptyBtn')?.addEventListener('click', connectGmail);
    
    // Score help tooltip
    const scoreHelpBtn = document.getElementById('scoreHelpBtn');
    const scoreTooltip = document.getElementById('scoreTooltip');
    const tooltipClose = document.getElementById('tooltipClose');
    
    if (scoreHelpBtn && scoreTooltip) {
        scoreHelpBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            scoreTooltip.style.display = 'flex';
        });
        
        if (tooltipClose) {
            tooltipClose.addEventListener('click', function(e) {
                e.stopPropagation();
                scoreTooltip.style.display = 'none';
            });
        }
        
        document.addEventListener('click', function(e) {
            if (scoreTooltip.style.display === 'flex' && 
                !scoreTooltip.contains(e.target) && 
                !scoreHelpBtn.contains(e.target)) {
                scoreTooltip.style.display = 'none';
            }
        });
    }
    
    // Conversation collapse
    const conversationHeader = document.getElementById('conversationHeader');
    const conversationThread = document.getElementById('conversationThread');
    if (conversationHeader && conversationThread) {
        conversationHeader.addEventListener('click', function() {
            this.classList.toggle('active');
            conversationThread.classList.toggle('collapsed');
        });
    }
    
    // Analysis status will be updated automatically when lead is selected
}

// KPI Calculations and Rendering
function renderKPIs() {
    const hotLeads = currentLeads.filter(l => l.score >= 70).length;
    const avgResponseTime = calculateAvgResponseTime();
    const followupsDue = currentLeads.filter(l => l.needsFollowup).length;
    const pipelineValue = calculatePipelineValue();
    
    document.getElementById('kpiHotLeads').textContent = hotLeads;
    document.getElementById('kpiResponseTime').textContent = avgResponseTime;
    document.getElementById('kpiFollowups').textContent = followupsDue;
    document.getElementById('kpiPipelineValue').textContent = formatCurrency(pipelineValue);
    
    // Update trends (mock data for now)
    updateKPITrends();
}

function calculateAvgResponseTime() {
    let totalMinutes = 0;
    let count = 0;
    
    currentLeads.forEach(lead => {
        if (lead.messages && lead.messages.length > 1) {
            for (let i = 0; i < lead.messages.length - 1; i++) {
                const msg1 = lead.messages[i];
                const msg2 = lead.messages[i + 1];
                if (msg1.from === 'lead' && msg2.from === 'agent') {
                    const diff = msg2.sentAt - msg1.sentAt;
                    totalMinutes += diff / (1000 * 60);
                    count++;
                }
            }
        }
    });
    
    return count > 0 ? Math.round(totalMinutes / count) : 0;
}

function calculatePipelineValue() {
    return currentLeads.reduce((sum, lead) => {
        const probability = lead.score / 100;
        return sum + (lead.pipelineValue * probability);
    }, 0);
}

function formatCurrency(amount) {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
    }).format(amount);
}

function updateKPITrends() {
    // Mock trend data - in production, compare with previous period
    document.getElementById('kpiHotLeadsTrend').innerHTML = '<span class="trend-icon">↑</span><span class="trend-text">+12%</span>';
    document.getElementById('kpiHotLeadsTrend').className = 'kpi-trend up';
    
    document.getElementById('kpiResponseTimeTrend').innerHTML = '<span class="trend-icon">↓</span><span class="trend-text">-8%</span>';
    document.getElementById('kpiResponseTimeTrend').className = 'kpi-trend down';
    
    document.getElementById('kpiFollowupsTrend').innerHTML = '<span class="trend-icon">↑</span><span class="trend-text">+5</span>';
    document.getElementById('kpiFollowupsTrend').className = 'kpi-trend up';
    
    document.getElementById('kpiPipelineValueTrend').innerHTML = '<span class="trend-icon">↑</span><span class="trend-text">+18%</span>';
    document.getElementById('kpiPipelineValueTrend').className = 'kpi-trend up';
}

// Chart Initialization
function initCharts() {
    initLeadMomentumChart();
    initPipelineMixChart();
}

function initLeadMomentumChart() {
    const ctx = document.getElementById('leadMomentumChart');
    if (!ctx) return;
    
    const data = generateMomentumData(currentDateRange);
    
    if (chartInstances.leadMomentum) {
        chartInstances.leadMomentum.destroy();
    }
    
    chartInstances.leadMomentum = new Chart(ctx, {
        type: 'line',
        data: {
            labels: data.labels,
            datasets: [{
                label: 'Hot Leads',
                data: data.hot,
                borderColor: '#dc2626',
                backgroundColor: 'rgba(220, 38, 38, 0.1)',
                tension: 0.4,
                fill: true
            }, {
                label: 'Total Leads',
                data: data.total,
                borderColor: '#D4AF37',
                backgroundColor: 'rgba(212, 175, 55, 0.1)',
                tension: 0.4,
                fill: true
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: true,
                    position: 'bottom'
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        stepSize: 1
                    }
                }
            }
        }
    });
}

function initPipelineMixChart() {
    const ctx = document.getElementById('pipelineMixChart');
    if (!ctx) return;
    
    const hot = currentLeads.filter(l => l.score >= 70).length;
    const warm = currentLeads.filter(l => l.score >= 40 && l.score < 70).length;
    const cold = currentLeads.filter(l => l.score < 40).length;
    
    if (chartInstances.pipelineMix) {
        chartInstances.pipelineMix.destroy();
    }
    
    chartInstances.pipelineMix = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Hot', 'Warm', 'Cold'],
            datasets: [{
                data: [hot, warm, cold],
                backgroundColor: ['#dc2626', '#f59e0b', '#6b7280'],
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: true,
                    position: 'bottom'
                }
            }
        }
    });
}

function generateMomentumData(range) {
    const days = range === '7D' ? 7 : range === '30D' ? 30 : 90;
    const labels = [];
    const hot = [];
    const total = [];
    
    for (let i = days - 1; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        labels.push(date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
        
        // Mock data - in production, use actual historical data
        hot.push(Math.floor(Math.random() * 5) + 2);
        total.push(Math.floor(Math.random() * 10) + 5);
    }
    
    return { labels, hot, total };
}

function updateCharts(range) {
    currentDateRange = range;
    initLeadMomentumChart();
    renderKPIs();
}

// Performance Charts
function initPerformanceCharts() {
    initResponseTimeChart();
    initLeadSourceChart();
    initPipelineVelocityChart();
}

function initResponseTimeChart() {
    const ctx = document.getElementById('responseTimeChart');
    if (!ctx) return;
    
    const data = generateResponseTimeData(currentDateRange);
    
    if (chartInstances.responseTime) {
        chartInstances.responseTime.destroy();
    }
    
    chartInstances.responseTime = new Chart(ctx, {
        type: 'line',
        data: {
            labels: data.labels,
            datasets: [{
                label: 'Avg Response Time (min)',
                data: data.values,
                borderColor: '#D4AF37',
                backgroundColor: 'rgba(212, 175, 55, 0.1)',
                tension: 0.4,
                fill: true
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        callback: function(value) {
                            return value + ' min';
                        }
                    }
                }
            }
        }
    });
}

function initLeadSourceChart() {
    const ctx = document.getElementById('leadSourceChart');
    if (!ctx) return;
    
    const sources = {};
    currentLeads.forEach(lead => {
        const source = lead.source || 'Other';
        if (!sources[source]) {
            sources[source] = 0;
        }
        sources[source] += lead.pipelineValue * (lead.score / 100);
    });
    
    const labels = Object.keys(sources);
    const values = Object.values(sources);
    
    if (chartInstances.leadSource) {
        chartInstances.leadSource.destroy();
    }
    
    chartInstances.leadSource = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Pipeline Value',
                data: values,
                backgroundColor: '#D4AF37',
                borderRadius: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        callback: function(value) {
                            return '$' + (value / 1000).toFixed(0) + 'k';
                        }
                    }
                }
            }
        }
    });
}

function initPipelineVelocityChart() {
    const ctx = document.getElementById('pipelineVelocityChart');
    if (!ctx) return;
    
    const data = generateVelocityData(currentDateRange);
    
    if (chartInstances.pipelineVelocity) {
        chartInstances.pipelineVelocity.destroy();
    }
    
    chartInstances.pipelineVelocity = new Chart(ctx, {
        type: 'line',
        data: {
            labels: data.labels,
            datasets: [{
                label: 'Deals Closed',
                data: data.values,
                borderColor: '#10b981',
                backgroundColor: 'rgba(16, 185, 129, 0.1)',
                tension: 0.4,
                fill: true
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        stepSize: 1
                    }
                }
            }
        }
    });
}

function generateResponseTimeData(range) {
    const days = range === '7D' ? 7 : range === '30D' ? 30 : 90;
    const labels = [];
    const values = [];
    
    for (let i = days - 1; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        labels.push(date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
        values.push(Math.floor(Math.random() * 60) + 30);
    }
    
    return { labels, values };
}

function generateVelocityData(range) {
    const weeks = range === '7D' ? 1 : range === '30D' ? 4 : 12;
    const labels = [];
    const values = [];
    
    for (let i = weeks - 1; i >= 0; i--) {
        labels.push(`Week ${weeks - i}`);
        values.push(Math.floor(Math.random() * 5) + 1);
    }
    
    return { labels, values };
}

// Pipeline Rendering
function filterAndRenderLeads() {
    let filtered = [...currentLeads];
    
    // Apply filter
    if (currentFilter !== 'all') {
        if (currentFilter === 'hot') {
            filtered = filtered.filter(l => l.score >= 70);
        } else if (currentFilter === 'warm') {
            filtered = filtered.filter(l => l.score >= 40 && l.score < 70);
        } else if (currentFilter === 'cold') {
            filtered = filtered.filter(l => l.score < 40);
        }
    }
    
    // Apply follow-up toggle
    const followupToggle = document.getElementById('followupToggle');
    if (followupToggle && followupToggle.checked) {
        filtered = filtered.filter(l => l.needsFollowup);
    }
    
    // Apply search
    if (searchQuery) {
        filtered = filtered.filter(l => 
            l.name.toLowerCase().includes(searchQuery) ||
            l.email.toLowerCase().includes(searchQuery) ||
            l.lastMessage.toLowerCase().includes(searchQuery)
        );
    }
    
    renderLeadList(filtered);
    
    // Show empty state if no leads
    const emptyState = document.getElementById('emptyState');
    const leadList = document.getElementById('leadList');
    if (filtered.length === 0 && currentLeads.length === 0) {
        if (emptyState) emptyState.style.display = 'flex';
        if (leadList) leadList.style.display = 'none';
    } else {
        if (emptyState) emptyState.style.display = 'none';
        if (leadList) leadList.style.display = 'block';
    }
}

function renderLeadList(leads) {
    const container = document.getElementById('leadList');
    if (!container) return;
    
    container.innerHTML = leads.map(lead => createLeadCard(lead)).join('');
    
    // Re-attach click handlers
    container.querySelectorAll('.lead-card').forEach(card => {
        card.addEventListener('click', function() {
            const leadId = parseInt(this.getAttribute('data-lead-id'));
            selectLead(leadId);
        });
    });
}

function createLeadCard(lead) {
    const scoreClass = lead.score >= 70 ? 'hot' : lead.score >= 40 ? 'warm' : 'cold';
    const isSelected = selectedLeadId === lead.id;
    
    return `
        <div class="lead-card ${isSelected ? 'selected' : ''}" data-lead-id="${lead.id}">
            <div class="lead-card-header">
                <div>
                    <div class="lead-card-name">${lead.name}</div>
                    <div class="lead-card-email">${lead.email}</div>
                </div>
                <div class="lead-card-badges">
                    <span class="score-badge ${scoreClass}">${lead.score}</span>
                    <span class="confidence-badge ${lead.confidence}">${lead.confidence}</span>
                </div>
            </div>
            <div class="lead-card-snippet">${lead.lastMessage}</div>
            <div class="lead-card-footer">
                <span class="lead-card-activity">${lead.lastActivity}</span>
                ${lead.needsFollowup ? '<span class="followup-indicator" style="font-size: 11px; color: #dc2626;">⚠ Follow-up</span>' : ''}
            </div>
        </div>
    `;
}

async function selectLead(leadId) {
    selectedLeadId = leadId;
    
    // Update UI
    document.querySelectorAll('.lead-card').forEach(card => {
        card.classList.remove('selected');
        if (parseInt(card.getAttribute('data-lead-id')) === leadId) {
            card.classList.add('selected');
        }
    });
    
    // Load and display lead details
    const lead = currentLeads.find(l => l.id === leadId);
    if (lead) {
        renderLeadDetail(lead);
    }
}

/**
 * Load lead detail with latest analysis from Supabase
 */
async function loadLeadDetailWithAnalysis(leadId) {
    try {
        if (!supabase) {
            throw new Error('Supabase client not initialized');
        }
        
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        if (sessionError || !session || !session.access_token) {
            throw new Error('Not authenticated');
        }
        
        // Show loading state
        updateAnalysisStatus('loading', 'Analyzing...');
        
        // Fetch lead details
        const lead = currentLeads.find(l => l.id === leadId);
        if (!lead) {
            throw new Error('Lead not found');
        }
        
        // Fetch latest analysis from Supabase
        const { data: latestScore, error: scoreError } = await supabase
            .from('lead_scores')
            .select('*')
            .eq('lead_id', leadId)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
        
        if (scoreError && scoreError.code !== 'PGRST116') {
            // PGRST116 = no rows returned, which is OK
            console.warn('Error fetching latest analysis:', scoreError);
        }
        
        // Update lead with latest score if available
        if (latestScore) {
            lead.score = latestScore.deal_probability;
            lead.confidence = latestScore.confidence;
            
            // Build score explanation from reason and signals
            const explanationItems = [];
            if (latestScore.reason) {
                explanationItems.push(latestScore.reason);
            }
            // Note: signals would be stored in recommended_actions if schema supports it
            // For now, use reason as explanation
            lead.scoreExplanation = explanationItems.length > 0 ? explanationItems : lead.scoreExplanation;
            lead.recommendations = latestScore.recommended_actions || lead.recommendations;
            
            updateAnalysisStatus('complete', 'Analysis complete');
        } else {
            // Check if analysis is in progress (recent message but no score yet)
            const hasRecentMessages = lead.messages && lead.messages.length > 0;
            if (hasRecentMessages) {
                updateAnalysisStatus('analyzing', 'Analysis in progress...');
                // Poll for analysis completion (check again in 3 seconds)
                setTimeout(() => {
                    if (selectedLeadId === leadId) {
                        loadLeadDetailWithAnalysis(leadId);
                    }
                }, 3000);
            } else {
                updateAnalysisStatus('pending', 'No analysis yet');
            }
        }
        
        // Render lead detail
        renderLeadDetail(lead, latestScore);
        
    } catch (error) {
        console.error('Error loading lead detail:', error);
        updateAnalysisStatus('error', 'Error loading analysis');
        // Still render lead detail with available data
        const lead = currentLeads.find(l => l.id === leadId);
        if (lead) {
            renderLeadDetail(lead, null);
        }
    }
}

function renderLeadDetail(lead, latestScore = null) {
    const content = document.getElementById('leadDetailContent');
    const empty = document.getElementById('detailEmptyState');
    
    if (content) content.style.display = 'block';
    if (empty) empty.style.display = 'none';
    
    // Update header
    document.getElementById('leadDetailName').textContent = lead.name;
    document.getElementById('leadDetailEmail').textContent = lead.email;
    
    const scoreClass = lead.score >= 70 ? 'hot' : lead.score >= 40 ? 'warm' : 'cold';
    document.getElementById('leadDetailScore').textContent = lead.score || 0;
    document.getElementById('leadDetailScore').className = `score-badge ${scoreClass}`;
    
    document.getElementById('leadDetailConfidence').textContent = lead.confidence || 'low';
    document.getElementById('leadDetailConfidence').className = `confidence-badge ${lead.confidence || 'low'}`;
    
    // Deal Probability
    const probability = lead.score || 0;
    document.getElementById('dealProbability').textContent = probability + '%';
    document.getElementById('probabilityFill').style.width = probability + '%';
    
    // Engagement Timeline
    initEngagementTimeline(lead);
    
    // Score explanation (from latest analysis or fallback)
    const scoreExplanationEl = document.getElementById('scoreExplanation');
    if (scoreExplanationEl) {
        if (latestScore && latestScore.reason) {
            // Use signals if available, otherwise use reason
            const explanationItems = latestScore.signals && latestScore.signals.length > 0
                ? latestScore.signals
                : [latestScore.reason];
            scoreExplanationEl.innerHTML = explanationItems.map(item => `<li>${item}</li>`).join('');
        } else if (lead.scoreExplanation) {
            if (Array.isArray(lead.scoreExplanation)) {
                scoreExplanationEl.innerHTML = lead.scoreExplanation.map(item => `<li>${item}</li>`).join('');
            } else {
                scoreExplanationEl.innerHTML = `<li>${lead.scoreExplanation}</li>`;
            }
        } else {
            scoreExplanationEl.innerHTML = '<li>No analysis available yet</li>';
        }
    }
    
    // Recommended Actions (from latest analysis or fallback)
    const recommendationsList = document.getElementById('recommendationsList');
    if (recommendationsList) {
        const actions = latestScore?.recommended_actions || lead.recommendations || [];
        if (actions.length > 0) {
            recommendationsList.innerHTML = actions.map(action => {
                const text = typeof action === 'string' ? action : action.text;
                const urgency = typeof action === 'object' ? action.urgency : 'medium';
                const icon = urgency === 'high' ? '🔥' : urgency === 'medium' ? '📋' : '💡';
                return `
                    <li>
                        <span class="action-icon">${icon}</span>
                        <span class="action-text">${text}</span>
                        ${typeof action === 'object' ? `<span class="action-urgency ${urgency}">${urgency}</span>` : ''}
                    </li>
                `;
            }).join('');
        } else {
            recommendationsList.innerHTML = '<li>No recommendations available yet</li>';
        }
    }
    
    // Render conversation
    renderConversation(lead.messages);
}

/**
 * Update analysis status indicator
 */
function updateAnalysisStatus(status, text) {
    const statusIndicator = document.getElementById('statusIndicator');
    const statusText = document.getElementById('statusText');
    const analysisStatus = document.getElementById('analysisStatus');
    
    if (!statusIndicator || !statusText || !analysisStatus) return;
    
    statusText.textContent = text;
    
    // Remove all status classes
    analysisStatus.className = 'analysis-status';
    
    switch (status) {
        case 'loading':
        case 'analyzing':
            analysisStatus.classList.add('status-analyzing');
            statusIndicator.textContent = '⏳';
            break;
        case 'complete':
            analysisStatus.classList.add('status-complete');
            statusIndicator.textContent = '✓';
            break;
        case 'error':
            analysisStatus.classList.add('status-error');
            statusIndicator.textContent = '⚠';
            break;
        case 'pending':
        default:
            analysisStatus.classList.add('status-pending');
            statusIndicator.textContent = '—';
            break;
    }
}

function initEngagementTimeline(lead) {
    const ctx = document.getElementById('engagementTimelineChart');
    if (!ctx || !lead.messages) return;
    
    // Prepare timeline data
    const messages = lead.messages.sort((a, b) => b.sentAt - a.sentAt).slice(0, 7);
    const labels = messages.map(m => {
        const date = new Date(m.sentAt);
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }).reverse();
    const inbound = messages.map(m => m.from === 'lead' ? 1 : 0).reverse();
    const outbound = messages.map(m => m.from === 'agent' ? 1 : 0).reverse();
    
    if (chartInstances.engagementTimeline) {
        chartInstances.engagementTimeline.destroy();
    }
    
    chartInstances.engagementTimeline = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Inbound',
                data: inbound,
                backgroundColor: '#D4AF37'
            }, {
                label: 'Outbound',
                data: outbound,
                backgroundColor: '#6b7280'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: true,
                    position: 'bottom'
                }
            },
            scales: {
                x: {
                    stacked: true
                },
                y: {
                    stacked: true,
                    beginAtZero: true,
                    ticks: {
                        stepSize: 1
                    }
                }
            }
        }
    });
}

function renderConversation(messages) {
    const container = document.getElementById('conversationThread');
    if (!container) return;
    
    if (!messages || messages.length === 0) {
        container.innerHTML = '<div class="message-item"><div class="message-body">No messages yet.</div></div>';
        return;
    }
    
    container.innerHTML = messages.map(msg => `
        <div class="message-item ${msg.from === 'lead' ? 'from-lead' : ''}">
            <div class="message-header">
                <span class="message-sender">${msg.sender}</span>
                <span class="message-time">${msg.time}</span>
            </div>
            <div class="message-body">${msg.body}</div>
        </div>
    `).join('');
}

function syncInbox() {
    const btn = document.getElementById('syncInboxBtn');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M21.5 2V6H17.5" stroke="currentColor" stroke-width="2"/></svg> Syncing...';
    }
    
    setTimeout(() => {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M21.5 2V6H17.5" stroke="currentColor" stroke-width="2"/></svg> Sync Inbox';
        }
        renderKPIs();
        filterAndRenderLeads();
        updateCharts(currentDateRange);
    }, 1500);
}

function connectGmail() {
    alert('Gmail OAuth integration will be implemented here');
}

/**
 * Show toast notification
 */
function showToast(message, type = 'info') {
    // Create toast element
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    toast.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: ${type === 'error' ? '#dc2626' : '#10b981'};
        color: white;
        padding: 12px 20px;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        z-index: 10000;
        font-size: 14px;
        animation: slideIn 0.3s ease-out;
    `;
    
    document.body.appendChild(toast);
    
    // Remove after 3 seconds
    setTimeout(() => {
        toast.style.animation = 'slideOut 0.3s ease-out';
        setTimeout(() => {
            if (document.body.contains(toast)) {
                document.body.removeChild(toast);
            }
        }, 300);
    }, 3000);
}

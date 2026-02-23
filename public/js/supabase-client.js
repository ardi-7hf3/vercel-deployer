// Inisialisasi Supabase client untuk frontend
// GANTI DENGAN MILIK ANDA
const SUPABASE_URL = 'https://rsrbamothnqyjgixmvyq.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJzcmJhbW90aG5xeWpnaXhtdnlxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE4MjI4ODYsImV4cCI6MjA4NzM5ODg4Nn0.6yJrYMc9OlUjAOHeB-BOmYgWZHPGAqbZfzwMEEbF1xc';

// Cek apakah supabase sudah di-load
const supabase = window.supabase 
    ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    : null;

/**
 * Subscribe ke newsletter
 */
async function subscribeNewsletter(email) {
    if (!supabase) {
        console.warn('Supabase not initialized');
        return { success: false, error: 'Supabase not configured' };
    }

    try {
        const { data, error } = await supabase
            .from('newsletter')
            .insert([{ 
                email: email, 
                subscribed_at: new Date().toISOString() 
            }]);

        if (error) throw error;
        return { success: true, data };
    } catch (error) {
        console.error('Error subscribing:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Track visitor
 */
async function trackVisitor(page) {
    if (!supabase) return;

    try {
        await supabase
            .from('visitors')
            .insert([{
                page: page,
                visited_at: new Date().toISOString(),
                user_agent: navigator.userAgent,
                referrer: document.referrer || 'direct'
            }]);
    } catch (error) {
        console.error('Error tracking visitor:', error);
    }
}

/**
 * Get deployment status
 */
async function checkDeploymentStatus(subdomain) {
    if (!supabase) return null;

    try {
        const { data, error } = await supabase
            .from('deployments')
            .select('*')
            .eq('subdomain', subdomain)
            .order('deployed_at', { ascending: false })
            .limit(1);

        if (error) throw error;
        return data[0] || null;
    } catch (error) {
        console.error('Error checking status:', error);
        return null;
    }
}

/**
 * Get deployment statistics
 */
async function getDeploymentStats() {
    if (!supabase) return null;

    try {
        const { data, error } = await supabase
            .from('deployments')
            .select('status, deployed_at')
            .limit(1000);

        if (error) throw error;
        
        const total = data.length;
        const success = data.filter(d => d.status === 'success').length;
        const failed = data.filter(d => d.status === 'failed').length;
        
        return {
            total,
            success,
            failed,
            successRate: total > 0 ? (success / total * 100).toFixed(1) : 0
        };
    } catch (error) {
        console.error('Error getting stats:', error);
        return null;
    }
}

// Export functions ke global scope
window.supabaseClient = {
    subscribeNewsletter,
    trackVisitor,
    checkDeploymentStatus,
    getDeploymentStats
};

// Track page view otomatis
document.addEventListener('DOMContentLoaded', () => {
    const page = window.location.pathname;
    trackVisitor(page);
    
    // Tampilkan stats di console (untuk debugging)
    getDeploymentStats().then(stats => {
        if (stats) {
            console.log('📊 Deployment Stats:', stats);
        }
    });
});

const { createClient } = require('@supabase/supabase-js');

// Inisialisasi Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY; // Gunakan service key (bukan anon key)

if (!supabaseUrl || !supabaseKey) {
    console.error('Supabase credentials missing');
}

const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * Menyimpan data deployment ke Supabase
 */
async function saveDeployment(subdomain, userId, files, status = 'success') {
    try {
        const { data, error } = await supabase
            .from('deployments')
            .insert([
                {
                    subdomain: subdomain,
                    user_id: userId,
                    files_count: files.length,
                    status: status,
                    deployed_at: new Date().toISOString(),
                    url: `https://${subdomain}.vercel.app`
                }
            ])
            .select();

        if (error) throw error;
        return { success: true, data };
    } catch (error) {
        console.error('Error saving deployment:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Mendapatkan semua deployment
 */
async function getDeployments(limit = 50) {
    try {
        const { data, error } = await supabase
            .from('deployments')
            .select('*')
            .order('deployed_at', { ascending: false })
            .limit(limit);

        if (error) throw error;
        return { success: true, data };
    } catch (error) {
        console.error('Error getting deployments:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Mendapatkan deployment by subdomain
 */
async function getDeploymentBySubdomain(subdomain) {
    try {
        const { data, error } = await supabase
            .from('deployments')
            .select('*')
            .eq('subdomain', subdomain)
            .single();

        if (error && error.code !== 'PGRST116') throw error;
        return { success: true, data };
    } catch (error) {
        console.error('Error getting deployment:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Update status deployment
 */
async function updateDeploymentStatus(id, status) {
    try {
        const { data, error } = await supabase
            .from('deployments')
            .update({ status: status })
            .eq('id', id)
            .select();

        if (error) throw error;
        return { success: true, data };
    } catch (error) {
        console.error('Error updating deployment:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Menyimpan feedback/user
 */
async function saveUser(email, name = null) {
    try {
        const { data, error } = await supabase
            .from('users')
            .upsert(
                { email: email, name: name, last_active: new Date().toISOString() },
                { onConflict: 'email' }
            )
            .select();

        if (error) throw error;
        return { success: true, data };
    } catch (error) {
        console.error('Error saving user:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Get statistics
 */
async function getStats() {
    try {
        // Total deployments
        const { count: totalDeployments, error: err1 } = await supabase
            .from('deployments')
            .select('*', { count: 'exact', head: true });

        // Deployments hari ini
        const today = new Date().toISOString().split('T')[0];
        const { count: todayDeployments, error: err2 } = await supabase
            .from('deployments')
            .select('*', { count: 'exact', head: true })
            .gte('deployed_at', today);

        // Unique users
        const { count: totalUsers, error: err3 } = await supabase
            .from('users')
            .select('*', { count: 'exact', head: true });

        if (err1 || err2 || err3) throw err1 || err2 || err3;

        return {
            success: true,
            data: {
                totalDeployments,
                todayDeployments,
                totalUsers
            }
        };
    } catch (error) {
        console.error('Error getting stats:', error);
        return { success: false, error: error.message };
    }
}

module.exports = {
    saveDeployment,
    getDeployments,
    getDeploymentBySubdomain,
    updateDeploymentStatus,
    saveUser,
    getStats
};

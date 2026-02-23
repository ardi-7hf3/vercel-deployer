// api/verify-admin.js
module.exports = async (req, res) => {
    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // Handle preflight request
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // Only accept POST
    if (req.method !== 'POST') {
        return res.status(405).json({ 
            success: false, 
            error: 'Method not allowed' 
        });
    }

    try {
        const { password } = req.body;
        
        // Ambil password dari environment variable
        const adminPassword = process.env.ADMIN_PASSWORD;
        
        // Log untuk debugging (hapus di production)
        console.log('Login attempt - Time:', new Date().toISOString());
        
        // Validasi input
        if (!password) {
            return res.status(400).json({ 
                success: false, 
                error: 'Password harus diisi' 
            });
        }

        // Cek apakah environment variable ada
        if (!adminPassword) {
            console.error('ADMIN_PASSWORD environment variable not set');
            return res.status(500).json({ 
                success: false, 
                error: 'Server configuration error' 
            });
        }

        // Verifikasi password
        const isValid = (password === adminPassword);
        
        if (isValid) {
            // Login sukses
            res.json({ 
                success: true, 
                message: 'Login berhasil' 
            });
        } else {
            // Login gagal - beri jeda kecil untuk mencegah brute force
            await new Promise(resolve => setTimeout(resolve, 1000));
            res.status(401).json({ 
                success: false, 
                error: 'Password salah' 
            });
        }
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Internal server error' 
        });
    }
};

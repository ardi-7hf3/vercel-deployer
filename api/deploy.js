const multer = require('multer');
const AdmZip = require('adm-zip');
const axios = require('axios');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { saveDeployment, saveUser } = require('./supabase.js');

// Konfigurasi multer untuk upload file
const upload = multer({ 
    dest: os.tmpdir(),
    limits: { fileSize: 10 * 1024 * 1024 } // 10MB max
});

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
        return res.status(405).json({ error: 'Method not allowed' });
    }

    // Handle file upload with multer
    upload.single('file')(req, res, async (err) => {
        if (err) {
            return res.status(400).json({ error: err.message });
        }

        try {
            const { subdomain, email } = req.body;
            const file = req.file;

            // Validasi input
            if (!file || !subdomain) {
                return res.status(400).json({ 
                    error: 'Subdomain dan file ZIP harus diisi' 
                });
            }

            // Validasi subdomain
            if (!/^[a-z0-9-]+$/.test(subdomain)) {
                return res.status(400).json({ 
                    error: 'Subdomain hanya boleh huruf kecil, angka, dan tanda hubung' 
                });
            }

            // Validasi panjang subdomain
            if (subdomain.length < 3 || subdomain.length > 30) {
                return res.status(400).json({
                    error: 'Subdomain harus antara 3-30 karakter'
                });
            }

            console.log(`Processing deployment for: ${subdomain}`);

            // Ekstrak ZIP ke temp folder
            const zip = new AdmZip(file.path);
            const extractPath = path.join(os.tmpdir(), `website-${Date.now()}`);
            zip.extractAllTo(extractPath, true);

            // Cek apakah ada index.html
            if (!fs.existsSync(path.join(extractPath, 'index.html'))) {
                // Cek di subfolder
                const files = fs.readdirSync(extractPath);
                let found = false;
                
                for (const item of files) {
                    const itemPath = path.join(extractPath, item);
                    if (fs.statSync(itemPath).isDirectory()) {
                        if (fs.existsSync(path.join(itemPath, 'index.html'))) {
                            // Move semua file ke root
                            const subFiles = fs.readdirSync(itemPath);
                            for (const subFile of subFiles) {
                                fs.renameSync(
                                    path.join(itemPath, subFile),
                                    path.join(extractPath, subFile)
                                );
                            }
                            fs.rmdirSync(itemPath);
                            found = true;
                            break;
                        }
                    }
                }
                
                if (!found) {
                    return res.status(400).json({ 
                        error: 'File ZIP harus mengandung index.html' 
                    });
                }
            }

            // Dapatkan daftar file
            const allFiles = getAllFiles(extractPath);

            // SIMPAN KE SUPABASE (jika email diberikan)
            if (email && email.includes('@')) {
                await saveUser(email);
            }

            // Deploy ke Vercel
            const result = await deployToVercel(extractPath, subdomain);

            // SIMPAN DATA DEPLOYMENT KE SUPABASE
            await saveDeployment(
                subdomain, 
                email || 'anonymous', 
                allFiles, 
                'success'
            );

            // Bersihkan file temporary
            fs.rmSync(extractPath, { recursive: true, force: true });
            fs.unlinkSync(file.path);

            res.json({
                success: true,
                url: `https://${subdomain}.vercel.app`,
                message: 'Website berhasil di deploy!'
            });

        } catch (error) {
            console.error('Deployment error:', error);
            
            // SIMPAN ERROR KE SUPABASE
            if (req.body.subdomain) {
                await saveDeployment(
                    req.body.subdomain, 
                    req.body.email || 'anonymous', 
                    [], 
                    'failed'
                );
            }
            
            // Error handling khusus
            if (error.response) {
                const status = error.response.status;
                
                if (status === 403) {
                    return res.status(403).json({ 
                        error: 'Token Vercel tidak valid atau expired' 
                    });
                } else if (status === 429) {
                    return res.status(429).json({ 
                        error: 'Terlalu banyak request, coba lagi nanti' 
                    });
                }
            }
            
            res.status(500).json({ 
                error: 'Gagal deploy: ' + (error.message || 'Unknown error')
            });
        }
    });
};

// Fungsi deploy ke Vercel
async function deployToVercel(folderPath, projectName) {
    // 1. Buat project baru di Vercel
    await createVercelProject(projectName);
    
    // 2. Upload file langsung ke Vercel
    const deploymentUrl = await directDeployToVercel(folderPath, projectName);
    
    return deploymentUrl;
}

async function createVercelProject(projectName) {
    try {
        await axios.post(
            'https://api.vercel.com/v9/projects',
            {
                name: projectName,
                framework: null,
                publicSource: true
            },
            {
                headers: {
                    'Authorization': `Bearer ${process.env.VERCEL_TOKEN}`,
                    'Content-Type': 'application/json'
                }
            }
        );
        console.log(`Project ${projectName} created`);
    } catch (error) {
        // Jika project sudah ada, abaikan error 409
        if (error.response?.status === 409) {
            console.log(`Project ${projectName} already exists`);
            return;
        }
        throw error;
    }
}

async function directDeployToVercel(folderPath, projectName) {
    // Baca semua file
    const files = getAllFiles(folderPath);
    const fileMap = {};
    
    // Konversi file ke base64
    for (const file of files) {
        const relativePath = path.relative(folderPath, file);
        // Ganti backslash dengan forward slash untuk Windows
        const normalizedPath = relativePath.split(path.sep).join('/');
        const content = fs.readFileSync(file);
        const base64Content = content.toString('base64');
        
        fileMap[normalizedPath] = base64Content;
        console.log(`Adding file: ${normalizedPath}`);
    }
    
    // Deploy langsung ke Vercel
    const deployRes = await axios.post(
        `https://api.vercel.com/v13/deployments`,
        {
            name: projectName,
            project: projectName,
            files: fileMap,
            target: 'production'
        },
        {
            headers: {
                'Authorization': `Bearer ${process.env.VERCEL_TOKEN}`,
                'Content-Type': 'application/json'
            }
        }
    );
    
    console.log(`Deployment successful: ${deployRes.data.url}`);
    return deployRes.data.url;
}

// Helper: baca semua file dalam folder
function getAllFiles(dir) {
    let results = [];
    const list = fs.readdirSync(dir);
    
    list.forEach(file => {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);
        
        if (stat && stat.isDirectory()) {
            results = results.concat(getAllFiles(filePath));
        } else {
            results.push(filePath);
        }
    });
    
    return results;
}

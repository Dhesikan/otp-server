const express = require('express');
const nodemailer = require('nodemailer');
const cors = require('cors');
const crypto = require('crypto');
require('dotenv').config();

const app = express();

// ============ UPDATED CORS FOR NETLIFY + RENDER ============
const allowedOrigins = [
    'http://localhost:3000',
    'http://localhost:5500',
    'http://127.0.0.1:5500',
    'https://*.netlify.app',
    'https://*.onrender.com'
];

app.use(cors({
    origin: function(origin, callback) {
        if (!origin) return callback(null, true);
        
        const isAllowed = allowedOrigins.some(pattern => {
            if (pattern.includes('*')) {
                const regex = new RegExp('^' + pattern.replace('*', '.*') + '$');
                return regex.test(origin);
            }
            return pattern === origin;
        });
        
        if (isAllowed) {
            callback(null, true);
        } else {
            console.log(`Blocked CORS from: ${origin}`);
            callback(new Error('CORS not allowed'), false);
        }
    },
    credentials: true
}));

app.use(express.json());

// Store OTPs temporarily
const otpStore = new Map();

// Nodemailer configuration
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

// Verify connection
transporter.verify((error, success) => {
    if (error) {
        console.error('❌ Nodemailer error:', error);
    } else {
        console.log('✅ Nodemailer ready to send OTPs');
    }
});

// Generate 6-digit OTP
function generateOTP() {
    return crypto.randomInt(100000, 999999).toString();
}

// ============ SEND OTP ENDPOINT ============
app.post('/api/send-otp', async (req, res) => {
    const { email } = req.body;
    
    console.log(`📧 Send OTP request for: ${email}`);
    
    if (!email) {
        return res.status(400).json({ 
            success: false, 
            message: 'Email is required' 
        });
    }
    
    const otp = generateOTP();
    
    // Store OTP with 5 minute expiry
    otpStore.set(email, {
        otp: otp,
        expiresAt: Date.now() + 5 * 60 * 1000,
        createdAt: new Date().toISOString()
    });
    
    console.log(`📝 OTP for ${email}: ${otp}`);
    
    const mailOptions = {
        from: `"Empty Portal" <${process.env.EMAIL_USER}>`,
        to: email,
        subject: 'Authentication Required - Your OTP Code',
        html: `<!DOCTYPE html>
<html>
<head>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');
    </style>
</head>
<body style="margin:0;background:#fafafa;font-family:'Inter',Arial,sans-serif;">
    <table width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
            <td align="center" style="padding:60px 20px;">
                <table width="500" style="background:#ffffff;padding:50px;border:1px solid #e5e7eb;border-radius:24px;box-shadow:0 4px 12px rgba(0,0,0,0.05);" cellpadding="0" cellspacing="0" border="0">
                    <tr>
                        <td align="center">
                            <div style="margin-bottom:25px;">
                                <div style="width:60px;height:60px;background:linear-gradient(135deg,#0052cc,#0066ff);border-radius:16px;display:inline-flex;align-items:center;justify-content:center;box-shadow:0 4px 12px rgba(0,82,204,0.3);">
                                    <span style="color:white;font-size:28px;font-weight:800;">E</span>
                                </div>
                            </div>
                            <div style="margin-bottom:15px;">
                                <span style="font-size:20px;font-weight:700;background:linear-gradient(135deg,#0052cc,#0066ff);-webkit-background-clip:text;background-clip:text;color:transparent;">Empty</span>
                                <span style="font-size:20px;font-weight:400;color:#4b5563;"> Portal</span>
                            </div>
                            <h2 style="margin-top:0;color:#111827;font-size:24px;font-weight:600;">Authentication Required</h2>
                            <p style="color:#6b7280;font-size:15px;margin-bottom:10px;">Your verification code</p>
                            <div style="margin:35px 0;">
                                <span style="font-size:48px;font-weight:700;letter-spacing:12px;color:#0052cc;background:#f0f5ff;padding:15px 20px;border-radius:12px;display:inline-block;font-family:'Courier New',monospace;">${otp}</span>
                            </div>
                            <div style="background:#fef2f2;border-left:4px solid #ef4444;padding:12px 16px;border-radius:8px;margin:20px 0;text-align:left;">
                                <p style="color:#991b1b;font-size:12px;margin:0;"><strong>⚠️ Security Notice</strong><br>This code expires in 5 minutes. Never share this OTP with anyone.</p>
                            </div>
                            <p style="color:#9ca3af;font-size:12px;margin-top:25px;">If you didn't request this, please ignore this email.</p>
                            <hr style="border:none;border-top:1px solid #e5e7eb;margin:25px 0 15px;">
                            <p style="color:#9ca3af;font-size:11px;margin:0;">© 2026 Empty Portal. All rights reserved.</p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>`
    };
    
    try {
        await transporter.sendMail(mailOptions);
        console.log(`✅ OTP sent to ${email}`);
        res.json({ 
            success: true, 
            message: 'OTP sent successfully! Check your email.' 
        });
    } catch (error) {
        console.error('Email error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to send OTP. Please check email configuration.' 
        });
    }
});

// ============ VERIFY OTP ENDPOINT ============
app.post('/api/verify-otp', async (req, res) => {
    const { email, otp } = req.body;
    
    console.log(`🔍 Verify OTP for: ${email}`);
    
    if (!email || !otp) {
        return res.status(400).json({ 
            success: false, 
            message: 'Email and OTP are required' 
        });
    }
    
    const storedData = otpStore.get(email);
    
    if (!storedData) {
        return res.status(400).json({ 
            success: false, 
            message: 'No OTP found. Please request a new one.' 
        });
    }
    
    if (storedData.expiresAt < Date.now()) {
        otpStore.delete(email);
        return res.status(400).json({ 
            success: false, 
            message: 'OTP has expired. Please request a new one.' 
        });
    }
    
    if (storedData.otp !== otp) {
        const remainingAttempts = (storedData.attempts || 0) + 1;
        storedData.attempts = remainingAttempts;
        otpStore.set(email, storedData);
        
        if (remainingAttempts >= 5) {
            otpStore.delete(email);
            return res.status(400).json({ 
                success: false, 
                message: 'Too many failed attempts. Please request a new OTP.' 
            });
        }
        
        return res.status(400).json({ 
            success: false, 
            message: 'Invalid OTP. Please try again.' 
        });
    }
    
    // Success - clear OTP
    otpStore.delete(email);
    console.log(`✅ OTP verified for ${email}`);
    
    res.json({ 
        success: true, 
        message: 'OTP verified successfully!' 
    });
});

// ============ HEALTH CHECK ENDPOINT ============
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        service: 'Nodemailer OTP Server',
        timestamp: new Date().toISOString(),
        activeOTPs: otpStore.size
    });
});

// ============ KEEP-ALIVE ENDPOINT (Prevents cold starts) ============
app.get('/api/keep-alive', (req, res) => {
    res.json({ 
        status: 'alive', 
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});

// ============ START SERVER ============
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    console.log(`\n🚀 Nodemailer OTP Server running on port ${PORT}`);
    console.log(`📧 Email configured for: ${process.env.EMAIL_USER}`);
    console.log(`📍 Send OTP: POST http://localhost:${PORT}/api/send-otp`);
    console.log(`📍 Verify OTP: POST http://localhost:${PORT}/api/verify-otp`);
    console.log(`📍 Keep Alive: GET http://localhost:${PORT}/api/keep-alive`);
    console.log(`📍 Health Check: GET http://localhost:${PORT}/api/health`);
    console.log(`=================================\n`);
});
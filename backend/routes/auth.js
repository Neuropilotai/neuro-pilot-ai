const express = require('express');
const router = express.Router();
const { UserModel, SessionModel } = require('../db/database');
const { generateToken, authenticateToken } = require('../middleware/auth');
const crypto = require('crypto');

router.post('/register', async (req, res) => {
    try {
        const { email, password, firstName, lastName, company } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password are required' });
        }

        if (password.length < 6) {
            return res.status(400).json({ error: 'Password must be at least 6 characters' });
        }

        const existingUser = await UserModel.findByEmail(email);
        if (existingUser) {
            return res.status(409).json({ error: 'Email already registered' });
        }

        const userId = await UserModel.create({
            email,
            password,
            firstName,
            lastName,
            company
        });

        const token = generateToken(userId);
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 7);

        await SessionModel.create(userId, token, expiresAt.toISOString());

        const user = await UserModel.findById(userId);
        delete user.password;

        // Broadcast new user event
        try {
            const { io } = require('../server');
            if (io) {
                io.emit('new_user', {
                    userId,
                    email: user.email,
                    name: `${user.firstName} ${user.lastName}`,
                    timestamp: new Date().toISOString()
                });
            }
        } catch (error) {
            // Ignore broadcast errors
        }

        res.status(201).json({
            message: 'Registration successful',
            token,
            user
        });
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ error: 'Registration failed' });
    }
});

router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password are required' });
        }

        const user = await UserModel.findByEmail(email);
        if (!user) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const isValidPassword = await UserModel.verifyPassword(password, user.password);
        if (!isValidPassword) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        if (!user.isActive) {
            return res.status(403).json({ error: 'Account is deactivated' });
        }

        const token = generateToken(user.id);
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 7);

        await SessionModel.create(user.id, token, expiresAt.toISOString());

        delete user.password;

        res.json({
            message: 'Login successful',
            token,
            user
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Login failed' });
    }
});

router.post('/logout', authenticateToken, async (req, res) => {
    try {
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1];

        await SessionModel.deleteByToken(token);

        res.json({ message: 'Logout successful' });
    } catch (error) {
        console.error('Logout error:', error);
        res.status(500).json({ error: 'Logout failed' });
    }
});

router.get('/me', authenticateToken, async (req, res) => {
    try {
        const user = await UserModel.findById(req.user.id);
        
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        delete user.password;
        delete user.resetPasswordToken;
        delete user.verificationToken;

        res.json({ user });
    } catch (error) {
        console.error('Get user error:', error);
        res.status(500).json({ error: 'Failed to get user info' });
    }
});

router.put('/me', authenticateToken, async (req, res) => {
    try {
        const { firstName, lastName, company } = req.body;
        const updates = {};

        if (firstName !== undefined) updates.firstName = firstName;
        if (lastName !== undefined) updates.lastName = lastName;
        if (company !== undefined) updates.company = company;

        await UserModel.updateUser(req.user.id, updates);

        const user = await UserModel.findById(req.user.id);
        delete user.password;

        res.json({
            message: 'Profile updated successfully',
            user
        });
    } catch (error) {
        console.error('Update profile error:', error);
        res.status(500).json({ error: 'Failed to update profile' });
    }
});

router.post('/change-password', authenticateToken, async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;

        if (!currentPassword || !newPassword) {
            return res.status(400).json({ error: 'Current and new passwords are required' });
        }

        if (newPassword.length < 6) {
            return res.status(400).json({ error: 'New password must be at least 6 characters' });
        }

        const user = await UserModel.findById(req.user.id);
        const isValidPassword = await UserModel.verifyPassword(currentPassword, user.password);
        
        if (!isValidPassword) {
            return res.status(401).json({ error: 'Current password is incorrect' });
        }

        const bcrypt = require('bcryptjs');
        const hashedPassword = await bcrypt.hash(newPassword, 10);
        
        await UserModel.updateUser(req.user.id, { password: hashedPassword });

        res.json({ message: 'Password changed successfully' });
    } catch (error) {
        console.error('Change password error:', error);
        res.status(500).json({ error: 'Failed to change password' });
    }
});

router.post('/forgot-password', async (req, res) => {
    try {
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({ error: 'Email is required' });
        }

        const user = await UserModel.findByEmail(email);
        if (!user) {
            return res.json({ message: 'If that email exists, we sent a reset link' });
        }

        const resetToken = crypto.randomBytes(32).toString('hex');
        const resetExpires = new Date();
        resetExpires.setHours(resetExpires.getHours() + 1);

        await UserModel.updateUser(user.id, {
            resetPasswordToken: resetToken,
            resetPasswordExpires: resetExpires
        });

        // Security: Log password reset request without exposing token
        console.log(`Password reset requested for user: [EMAIL_REDACTED]`);

        res.json({ message: 'If that email exists, we sent a reset link' });
    } catch (error) {
        console.error('Forgot password error:', error);
        res.status(500).json({ error: 'Failed to process password reset' });
    }
});

router.post('/reset-password', async (req, res) => {
    try {
        const { token, newPassword } = req.body;

        if (!token || !newPassword) {
            return res.status(400).json({ error: 'Token and new password are required' });
        }

        if (newPassword.length < 6) {
            return res.status(400).json({ error: 'Password must be at least 6 characters' });
        }

        const db = require('../db/database').getDb();
        const user = await db.get(
            `SELECT * FROM users WHERE resetPasswordToken = ? AND resetPasswordExpires > datetime('now')`,
            [token]
        );

        if (!user) {
            return res.status(400).json({ error: 'Invalid or expired reset token' });
        }

        const bcrypt = require('bcryptjs');
        const hashedPassword = await bcrypt.hash(newPassword, 10);

        await UserModel.updateUser(user.id, {
            password: hashedPassword,
            resetPasswordToken: null,
            resetPasswordExpires: null
        });

        res.json({ message: 'Password reset successful' });
    } catch (error) {
        console.error('Reset password error:', error);
        res.status(500).json({ error: 'Failed to reset password' });
    }
});

module.exports = router;
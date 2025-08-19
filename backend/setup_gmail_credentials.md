# 📧 Gmail Credentials Setup Guide

## Step 1: Enable 2-Factor Authentication

1. Go to **Google Account Security**: https://myaccount.google.com/security
2. Under "Signing in to Google", click **2-Step Verification**
3. Follow the steps to enable 2FA (required for app passwords)

## Step 2: Generate App Password

1. Go back to **Security**: https://myaccount.google.com/security
2. Under "Signing in to Google", click **App passwords**
3. Select app: **Mail**
4. Select device: **Other (Custom name)**
5. Enter name: **Neuro Pilot AI**
6. Click **Generate**
7. **Copy the 16-character password** (looks like: `abcd efgh ijkl mnop`)

## Step 3: Create .env File

Create a `.env` file in the backend directory:

```bash
# Email Configuration
EMAIL_USER=your.email@gmail.com
EMAIL_PASS=abcdefghijklmnop

# Replace with your actual Gmail and app password
# EMAIL_USER=david.mikulis@gmail.com
# EMAIL_PASS=your16digitapppassword
```

## Step 4: Test the Configuration

Run this command to test:

```bash
node test_send_order_email.js
```

## Quick Setup Script

Run this to create the .env file interactively:

```bash
node setup_email_config.js
```

## Troubleshooting

❌ **"Invalid login" error**:

- Make sure 2FA is enabled
- Use app password, not regular password
- No spaces in the app password

❌ **"Less secure app access"**:

- This is outdated - use app passwords instead

✅ **Success**: You should see "Email sent successfully!"

## Alternative: Use Different Email Service

If Gmail doesn't work, you can use:

- **Outlook**: service: 'hotmail'
- **Yahoo**: service: 'yahoo'
- **Custom SMTP**: Configure manually

## Security Note

- Never commit .env file to git
- App passwords are safer than regular passwords
- You can revoke app passwords anytime

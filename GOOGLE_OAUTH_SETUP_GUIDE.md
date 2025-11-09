# Google OAuth Setup for Make.com
## Custom OAuth Client - Permanent Solution (10 minutes)

---

## 🎯 **What You're Doing:**

Creating your own Google API credentials so Make.com can access your Google Drive without restrictions.

**You'll need:**
- Google account (neuro.pilot.ai@gmail.com)
- 10 minutes
- Two browser tabs open

---

## 📋 **Step-by-Step Instructions**

### **STEP 1: Go to Google Cloud Console (1 min)**

1. **Open new tab:** https://console.cloud.google.com/
2. **Sign in** with: `neuro.pilot.ai@gmail.com`
3. You'll see the Google Cloud Console dashboard

---

### **STEP 2: Create New Project (2 min)**

1. **Click** the project dropdown at the top (says "Select a project" or shows current project)
2. **Click:** "NEW PROJECT" button (top-right of popup)
3. **Project name:** Type `Group 7 Automation`
4. **Location:** Leave as "No organization"
5. **Click:** "CREATE"
6. Wait 10-20 seconds for project to be created
7. **Click:** "SELECT PROJECT" when it appears

✅ You should now see "Group 7 Automation" at the top of the page

---

### **STEP 3: Enable Google Drive API (2 min)**

1. **Click** the hamburger menu (≡) in top-left
2. **Navigate to:** "APIs & Services" → "Library"
   - Or use search: Type "API Library" and click it
3. In the API Library search box, **type:** `google drive`
4. **Click:** "Google Drive API" (should be first result)
5. **Click:** "ENABLE" button (big blue button)
6. Wait 5-10 seconds for it to enable

✅ You should see "API enabled" message

---

### **STEP 4: Configure OAuth Consent Screen (3 min)**

1. **Click** hamburger menu (≡) → "APIs & Services" → "OAuth consent screen"
2. **Select:** "External" (the only option available for Gmail accounts)
3. **Click:** "CREATE"

**Fill out the form:**

**App information:**
- **App name:** `Group 7 Make.com`
- **User support email:** Select `neuro.pilot.ai@gmail.com` from dropdown
- **App logo:** (optional - skip for now)

**App domain:** (optional - leave blank)

**Developer contact information:**
- **Email addresses:** `neuro.pilot.ai@gmail.com`

4. **Click:** "SAVE AND CONTINUE"

**Scopes page:**
5. **Click:** "ADD OR REMOVE SCOPES"
6. **Search for:** `drive`
7. **Check these boxes:**
   - ✅ `.../auth/drive` (See, edit, create, and delete all of your Google Drive files)
   - ✅ `.../auth/drive.file` (See, edit, create, and delete only the specific Google Drive files)
8. **Click:** "UPDATE" at bottom
9. **Click:** "SAVE AND CONTINUE"

**Test users page:**
10. **Click:** "ADD USERS"
11. **Enter:** `neuro.pilot.ai@gmail.com`
12. **Click:** "ADD"
13. **Click:** "SAVE AND CONTINUE"

**Summary page:**
14. **Click:** "BACK TO DASHBOARD"

✅ OAuth consent screen is configured!

---

### **STEP 5: Create OAuth Credentials (2 min)**

1. **Click** hamburger menu (≡) → "APIs & Services" → "Credentials"
2. **Click:** "CREATE CREDENTIALS" at top
3. **Select:** "OAuth client ID"

**Configure:**
- **Application type:** Select "Web application"
- **Name:** Type `Make.com Group 7`

**Authorized redirect URIs:**
4. **Click:** "ADD URI"
5. **Paste this EXACTLY:**
   ```
   https://www.integromat.com/oauth/cb/google-restricted
   ```
6. **Click:** "ADD URI" again
7. **Paste this EXACTLY:**
   ```
   https://www.make.com/oauth/cb/google-restricted
   ```

8. **Click:** "CREATE"

---

### **STEP 6: Copy Your Credentials (30 sec)**

A popup appears with your credentials!

**IMPORTANT - Copy these now:**

1. **Client ID:** (looks like: `123456789-abc123def456.apps.googleusercontent.com`)
   - Click the copy icon 📋
   - Paste into a text file or note

2. **Client secret:** (looks like: `GOCSPX-abc123def456ghi789`)
   - Click the copy icon 📋
   - Paste into a text file or note

**Click:** "OK"

✅ **Keep these credentials handy - you'll need them in 1 minute!**

---

### **STEP 7: Add Credentials to Make.com (2 min)**

**Go back to Make.com tab:**

1. In the Google Drive module settings panel (should still be open)
2. **Click:** "Add" next to Connection
3. You'll see a form with fields

**Fill in:**
- **Connection name:** `Google Drive - OAuth Custom`
- **Connection type:** Look for "Use custom OAuth client" or "Custom" checkbox
  - ✅ **Check this box**
- **Client ID:** Paste your Client ID from Step 6
- **Client Secret:** Paste your Client Secret from Step 6
- **Scope:** (should auto-fill, or paste):
  ```
  https://www.googleapis.com/auth/drive
  ```

4. **Click:** "Save" or "Continue"
5. **Click:** "Sign in with Google"
6. **Select:** `neuro.pilot.ai@gmail.com`
7. **Click:** "Continue" on the "Google hasn't verified this app" warning
8. **Click:** "Continue" again
9. **Check all boxes** (allow access to Google Drive)
10. **Click:** "Allow"

---

### **STEP 8: Configure File Path**

After connection succeeds:

1. **Select method:** Choose "By Path"
2. **File path:** Paste:
   ```
   /Group7/Production/CSV_Inputs/GROUP7_CANVA_BATCH_2025-10-30.csv
   ```
3. **Click:** "OK"

---

### **STEP 9: Test the Connection! 🧪**

1. **Right-click** on Module 2 (Google Drive)
2. **Select:** "Run this module only"
3. Wait 5-10 seconds
4. Should show: **✅ "Successfully processed 1 bundle"**
5. **Expand the output** - you should see your CSV data!

---

## 🎉 **SUCCESS!**

You now have:
- ✅ Custom OAuth credentials
- ✅ Full Google Drive access in Make.com
- ✅ No more "restricted scopes" errors
- ✅ Works permanently (no need to redo)

---

## 🔧 **Troubleshooting**

**"Google hasn't verified this app" warning:**
- This is normal for personal OAuth apps
- Click "Continue" (it's safe - it's YOUR app)
- Click "Continue" again if needed

**"Access blocked: This app's request is invalid":**
- Check you added BOTH redirect URIs in Step 5
- Make sure they're exactly as shown (no typos)
- Go back to Google Cloud Console → Credentials → Edit your OAuth client → Add URIs again

**"Invalid client" error:**
- Double-check Client ID and Secret were copied correctly
- No extra spaces before or after
- Try copying them again

**"File not found" after connection works:**
- Check CSV file exists at exact path
- Wait 1-2 minutes for Google Drive to sync
- Try path without date first: `/Group7/Production/CSV_Inputs/GROUP7_CANVA_BATCH_2025-10-30.csv`

---

## 📝 **Save Your Credentials**

**Important:** Store your Client ID and Secret somewhere safe:
- Password manager (1Password, LastPass)
- Secure note
- Encrypted file

You might need them again if you set up Make.com on another device.

---

## ✅ **Next Steps**

Once Module 2 works:
1. Configure Module 6 (second Google Drive) - use same connection
2. Add ElevenLabs API key (Module 5)
3. Test full scenario
4. Generate 7 voiceovers! 🎉

---

**Your OAuth credentials will work forever. You're done with this step!**

# Notion Database Setup Guide
## Group 7 Video Production Tracking

---

## 📋 Overview

This guide will help you set up **3 Notion databases** for the Group 7 automation pipeline:

1. **Video Log** - Track all video production and performance
2. **Engagement Review Queue** - Human-approved comment replies and follows
3. **Analytics Reports** - Daily and weekly performance summaries

---

## 🎬 Database 1: Video Log

### Quick Setup (Manual)

1. **Create New Database**
   - Open Notion
   - Click **"+ New Page"**
   - Select **"Table - Inline"**
   - Name it: **"Group 7 Video Log"**
   - Add icon: 🎬

2. **Add Properties** (in order)

Click **"+"** to add each property:

| Property Name | Type | Configuration |
|--------------|------|---------------|
| Video ID | Title | (default) |
| Agent | Select | Options: Lyra-7, Atlas-7, Nova-7, Cipher-7, Echo-7, Quantum-7, Nexus-7 |
| Theme | Select | Options: Creative_Architect, Strategic_Intelligence, etc. |
| Status | Select | Options: Pending, In Production, Scheduled, Published, Failed, Archived |
| Batch Date | Date | (no time) |
| Post Time (EST) | Date | Include time |
| Platforms | Multi-select | Options: TikTok, Instagram, YouTube |
| Voiceover Script | Text | (long text) |
| Caption | Text | (short text) |
| Hashtags | Multi-select | Options: Group7, NeuroGenesisAI, NeuroPilotAI, etc. |
| Video File | URL | |
| Voice File | URL | |
| Captions File | URL | |
| Metricool Post ID | Text | |
| Views (24h) | Number | Format: Number |
| Views (7d) | Number | Format: Number |
| Likes | Number | Format: Number |
| Comments | Number | Format: Number |
| Shares | Number | Format: Number |
| Saves | Number | Format: Number |
| Engagement Rate | Number | Format: Percent |
| Completion Rate | Number | Format: Percent |
| Avg Watch Time | Number | Format: Number (seconds) |
| Profile Visits | Number | Format: Number |
| Bio Link Clicks | Number | Format: Number |
| Follower Growth | Number | Format: Number |
| Performance Score | Formula | `if(prop("Views (24h)") > 0, (prop("Engagement Rate") * 100 + prop("Completion Rate") * 100) / 2, 0)` |
| Is Viral | Checkbox | |
| Repurpose Potential | Select | Options: ⭐, ⭐⭐, ⭐⭐⭐, ⭐⭐⭐⭐, ⭐⭐⭐⭐⭐ |
| Notes | Text | (long text) |
| Created By | Created by | (system) |
| Created Time | Created time | (system) |
| Last Edited | Last edited time | (system) |

3. **Create Views**

Click **"+ New view"** for each:

- **All Videos** (Table) - Sort by Post Time (newest first)
- **By Agent** (Board) - Group by Agent property
- **By Status** (Board) - Group by Status property
- **Published** (Table) - Filter: Status = Published, Sort by Views (24h) desc
- **Top Performers** (Gallery) - Filter: Views (24h) > 10,000
- **This Week** (Calendar) - Calendar by Post Time (EST)
- **Viral Potential** (Table) - Filter: Is Viral = true OR Engagement Rate > 10%

4. **Get Database ID**
   - Click **"..."** (top right of database)
   - Select **"Copy link to view"**
   - The ID is the string between the slash and the question mark:
     ```
     https://www.notion.so/YOUR_WORKSPACE/DATABASE_ID?v=VIEW_ID
                                          ^^^^^^^^^^^
     ```
   - Save this for Make.com integration

---

## 💬 Database 2: Engagement Review Queue

### Quick Setup

1. **Create New Database**
   - Name: **"Engagement Review Queue"**
   - Icon: 💬

2. **Add Properties**

| Property Name | Type | Configuration |
|--------------|------|---------------|
| Comment ID | Title | |
| Video | Relation | Link to Video Log database |
| Username | Text | |
| Comment Text | Text | (long text) |
| Reply Variant 1 | Text | |
| Reply Variant 2 | Text | |
| Why It Works | Text | |
| Confidence | Number | Format: Percent |
| Engagement Score | Number | Format: Number (1-10) |
| Follow Score | Number | Format: Number (1-10) |
| Follow Reasoning | Text | |
| Status | Select | Options: Pending Review, Approved, Published, Skipped |
| Action Taken | Select | Options: None, Reply V1, Reply V2, Custom Reply, Follow, Both |
| Published At | Date | Include time |
| Timestamp | Date | Include time |
| Created By | Created by | |

3. **Create Views**
   - **Pending Review** (Board) - Filter: Status = Pending Review
   - **Approved** (Table) - Filter: Status = Approved
   - **Published** (Table) - Filter: Status = Published, Sort by Published At desc
   - **High Priority** (Table) - Filter: Engagement Score ≥ 8 OR Follow Score ≥ 8

4. **Get Database ID** (same process as above)

---

## 📊 Database 3: Analytics Reports

### Quick Setup

1. **Create New Database**
   - Name: **"Analytics Reports"**
   - Icon: 📊

2. **Add Properties**

| Property Name | Type | Configuration |
|--------------|------|---------------|
| Report Date | Title (Date) | |
| Report Type | Select | Options: Daily, Weekly, Monthly |
| Top Performer | Relation | Link to Video Log database |
| Top Views | Number | |
| Avg Engagement Rate | Number | Format: Percent |
| Avg Completion Rate | Number | Format: Percent |
| Total Videos | Number | |
| Total Views | Number | |
| Total Followers Gained | Number | |
| Policy Version | Text | (e.g., v1.7) |
| Summary | Text | (long text, markdown supported) |
| Action Items | Text | (checklist) |
| Status | Select | Options: Generated, Reviewed, Actioned, Archived |
| Created Time | Created time | |

3. **Create Views**
   - **All Reports** (Table) - Sort by Report Date desc
   - **Daily Reports** (Table) - Filter: Report Type = Daily
   - **Weekly Reviews** (Gallery) - Filter: Report Type = Weekly
   - **Action Required** (Board) - Group by Status

4. **Get Database ID**

---

## 🔗 Connect to Make.com

### For Each Database:

1. **In Make.com scenario:**
   - Add module: **Notion > Create Database Item**
   - Click **"Add" connection**
   - Authorize Notion (allow access to workspace)

2. **Configure Module:**
   - Database ID: Paste the ID you copied
   - Map fields from CSV/API data to Notion properties

### Example Mapping (Video Log):

```
Make.com Variable → Notion Property
────────────────────────────────────
{{video_id}} → Video ID (title)
{{agent}} → Agent (select)
{{theme}} → Theme (select)
{{voiceover_script}} → Voiceover Script (text)
{{caption}} → Caption (text)
{{hashtags}} → Hashtags (multi-select, split by comma)
{{post_time_est}} → Post Time (EST) (date)
{{platforms}} → Platforms (multi-select)
{{metricool_post_id}} → Metricool Post ID (text)
```

---

## 🧪 Test With Sample Data

### Add Test Row to Video Log:

| Field | Value |
|-------|-------|
| Video ID | GRP7_TEST_001 |
| Agent | Lyra-7 |
| Theme | Creative_Architect |
| Status | Scheduled |
| Batch Date | 2025-10-30 |
| Post Time (EST) | 2025-10-30 19:30 |
| Platforms | TikTok, Instagram, YouTube |
| Caption | This is a test video for automation setup. 🧠⚡ |
| Hashtags | Group7, NeuroGenesisAI, TechTok |
| Views (24h) | 0 |
| Engagement Rate | 0% |
| Completion Rate | 0% |

### Verify:
- ✅ All properties display correctly
- ✅ Formula (Performance Score) calculates
- ✅ Views switch between different layouts
- ✅ Filters work as expected

---

## 🎯 Integration Checklist

Before running automation:

- [ ] Video Log database created with all properties
- [ ] Engagement Review Queue database created
- [ ] Analytics Reports database created
- [ ] All database IDs copied and saved
- [ ] Test row added to each database
- [ ] Notion integration authorized in Make.com
- [ ] Database relations configured (Video → Engagement, Video → Analytics)
- [ ] Views created for quick filtering

---

## 📝 Notes

**Multi-select Hashtags:**
When sending from Make.com, format as comma-separated:
```json
"hashtags": "Group7,NeuroGenesisAI,NeuroPilotAI,AIAgent"
```

**Date Formatting:**
Always use ISO 8601 with timezone:
```
2025-10-30T19:30:00-04:00
```

**Relations:**
Use Notion page IDs, not titles:
```json
"relation": [{"id": "page-id-here"}]
```

---

## 🆘 Troubleshooting

**"Database not found" error:**
- Verify database ID is correct
- Check Notion integration has access to the page
- Ensure database isn't in a private workspace

**Properties not mapping:**
- Property names must match exactly (case-sensitive)
- Multi-select requires array format
- Numbers can't have text characters

**Formula not calculating:**
- Ensure referenced properties exist
- Check property names in formula match exactly
- Notion formulas use different syntax than Excel

---

**Ready to proceed?** Next step: Test Make.com connection with one video!

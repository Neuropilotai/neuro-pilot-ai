# v13.5 Live Console Fix - Before & After Comparison

## API Response Changes

### `/api/owner/dashboard` - BEFORE (v13.0.1)
```json
{
  "success": true,
  "owner": "david@neuro...",
  "timestamp": "2025-10-12T...",
  "stats": { ... },
  "data": {
    "health": { "status": "ok", "version": "13.0.1", ... },
    "auditLogs": [ ... ],
    "dbStats": { ... },
    "aiModules": {
      "forecasting": {
        "enabled": true,
        "status": "ACTIVE",
        "lastRun": "2025-10-12T14:30:00Z"
      },
      "governance": {
        "enabled": true,
        "status": "ACTIVE",
        "lastRun": "2025-10-12T15:00:00Z"
      }
    },
    "learningInsights": [ ... ],
    "versionInfo": { ... }
  }
}
```

### `/api/owner/dashboard` - AFTER (v13.5)
```json
{
  "success": true,
  "owner": "david@neuro...",
  "timestamp": "2025-10-12T...",
  "stats": { ... },
  "data": {
    "health": { "status": "ok", "version": "13.0.1", ... },
    "auditLogs": [ ... ],
    "dbStats": { ... },
    "aiModules": {
      "forecasting": {
        "enabled": true,
        "status": "ACTIVE",
        "lastRun": "2025-10-12T14:30:00Z",
        "lastRunIso": "2025-10-12T14:30:00Z"    // ← Used by frontend
      },
      "governance": {
        "enabled": true,
        "status": "ACTIVE",
        "lastRun": "2025-10-12T15:00:00Z",
        "lastRunIso": "2025-10-12T15:00:00Z"    // ← Used by frontend
      }
    },
    "learningInsights": [ ... ],
    "versionInfo": { ... },
    "ai_ops_health": {                          // ← NEW FIELD
      "score": 87,
      "weights": {
        "forecastRecency": 25,
        "learningRecency": 20,
        "confidence7d": 15,
        "accuracy7d": 15,
        "pipelineHealth": 15,
        "latencyRealtime": 10
      },
      "components": {
        "forecastRecency": { "value": "0.5h ago", "score": 100 },
        "learningRecency": { "value": "2.3h ago", "score": 100 },
        "confidence7d": { "value": 75, "score": 75 },
        "accuracy7d": { "value": 82, "score": 82 },
        "pipelineHealth": { "checksPassed": 3, "checks": [...], "score": 100 },
        "latencyRealtime": { "avgMs": 3250, "recentEmits": 12, "score": 100 }
      },
      "explanations": [
        "Forecast ran within 24h (100 pts)",
        "Learning ran within 24h (100 pts)",
        "AI Confidence: 75%",
        "Forecast Accuracy: 82%",
        "Pipeline health: 3/4 checks passed (100 pts)",
        "Avg latency 3.2s (<5s, 100 pts)",
        "+10 pts: Recent realtime emit (12 in 24h)"
      ]
    }
  }
}
```

---

## Frontend UI Changes

### System Status Panel - BEFORE
```
┌────────────────────────────────────────┐
│ ⚡ System Status                       │
├────────────────────────────────────────┤
│ Status:   OK                           │
│ Version:  13.0.1                       │
│ Uptime:   45 minutes                   │
│ Memory:   128.45 MB                    │
└────────────────────────────────────────┘
```

### System Status Panel - AFTER
```
┌────────────────────────────────────────┐
│ ⚡ System Status                       │
├────────────────────────────────────────┤
│ Status:   OK                           │
│ Version:  13.0.1                       │
│ Uptime:   45 minutes                   │
│ Memory:   128.45 MB                    │
└────────────────────────────────────────┘

┌────────────────────────────────────────┐
│ AI Ops System Health          87%  ✅  │ ← GREEN
├────────────────────────────────────────┤
│ • Forecast ran within 24h (100 pts)   │
│ • Learning ran within 24h (100 pts)   │
│ • AI Confidence: 75%                   │
└────────────────────────────────────────┘
```

**Color Logic**:
- **≥85%**: Green background (healthy) ✅
- **60-84%**: Yellow background (needs attention) ⚠️
- **<60%**: Red background (critical) ❌

---

### AI Modules Panel - BEFORE
```
┌────────────────────────────────────────┐
│ 🤖 AI Modules                          │
├────────────────────────────────────────┤
│ Forecasting                   [ACTIVE] │
│                                        │
├────────────────────────────────────────┤
│ Governance                    [ACTIVE] │
│                                        │
├────────────────────────────────────────┤
│ Insights                      [ACTIVE] │
│                                        │
└────────────────────────────────────────┘
```

### AI Modules Panel - AFTER
```
┌────────────────────────────────────────┐
│ 🤖 AI Modules                          │
├────────────────────────────────────────┤
│ Forecasting                   [ACTIVE] │
│ Last: 0.5h ago                    ← NEW│
├────────────────────────────────────────┤
│ Governance                    [ACTIVE] │
│ Last: 2.3h ago                    ← NEW│
├────────────────────────────────────────┤
│ Insights                      [ACTIVE] │
│ Last: Never                       ← NEW│
└────────────────────────────────────────┘
```

**Time Formatting Logic**:
- **< 1 hour**: "45m ago"
- **1-24 hours**: "2.3h ago"
- **≥ 24 hours**: "5d ago"
- **No timestamp**: "Never"

---

## Code Changes Summary

### Backend: `/routes/owner.js`
**Lines Changed**: 43-62, 98
**What Changed**:
1. Added internal HTTP call to `/api/owner/ops/status` to fetch `ai_ops_health`
2. Added `ai_ops_health` to dashboard response `data` object
3. Fallback to `{ score: 45, explanations: ['No data available yet'] }` if fetch fails

### Frontend: `/owner-console.html`
**Lines Changed**: 297-314, 327, 351-401, 422-451
**What Changed**:
1. Added `timeAgo()` helper function (lines 297-314)
2. Updated `loadDashboard()` to pass `ai_ops_health` to `renderSystemStatus()` (line 327)
3. Updated `renderSystemStatus()` to display health score with color coding (lines 351-401)
4. Updated `renderAIModules()` to show "Xh ago" timestamps (lines 422-451)

---

## Testing Instructions

### 1. Get Owner Token
```bash
# Login as owner to get JWT token
curl -X POST http://localhost:8083/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"david@neuro...","password":"your-password"}'

# Extract token
export OWNER_TOKEN='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'
```

### 2. Verify API Response
```bash
curl -s http://localhost:8083/api/owner/dashboard \
  -H "Authorization: Bearer $OWNER_TOKEN" | \
  jq '.data | {ai_ops_health, aiModules}'
```

**Expected Output**:
```json
{
  "ai_ops_health": {
    "score": 87,
    "explanations": [
      "Forecast ran within 24h (100 pts)",
      "Learning ran within 24h (100 pts)",
      "AI Confidence: 75%"
    ]
  },
  "aiModules": {
    "forecasting": {
      "status": "ACTIVE",
      "lastRunIso": "2025-10-12T14:30:00Z"
    }
  }
}
```

### 3. Verify Frontend UI
```bash
# Open in browser
open http://localhost:8083/owner-console.html
```

**Visual Checklist**:
- [ ] System Status panel shows "AI Ops System Health: 87%"
- [ ] Health score is displayed in GREEN (≥85%)
- [ ] Top 3 explanations visible as bullet points
- [ ] AI Modules show "Last: Xh ago" timestamps
- [ ] Timestamps update format based on age (m/h/d)

---

## File Diff Summary

```diff
+++ b/backend/routes/owner.js
@@ -40,6 +40,20 @@
+    // v13.5: Get AI Ops System Health from owner-ops computeAIOpsHealth function
+    let aiOpsHealth = { score: 45, explanations: ['No data available yet'] };
+    try {
+      const axios = require('axios');
+      const token = req.headers.authorization?.replace('Bearer ', '');
+      if (token) {
+        const opsResponse = await axios.get(`http://localhost:${process.env.PORT || 8083}/api/owner/ops/status`, {
+          headers: { 'Authorization': `Bearer ${token}` },
+          timeout: 5000
+        }).catch(() => null);
+        if (opsResponse?.data?.ai_ops_health) {
+          aiOpsHealth = opsResponse.data.ai_ops_health;
+        }
+      }
+    } catch (err) {
+      console.debug('Failed to fetch AI Ops Health for dashboard:', err.message);
+    }

@@ -94,7 +108,8 @@
         aiModules,
         learningInsights,
-        versionInfo
+        versionInfo,
+        ai_ops_health: aiOpsHealth
       }
     });

+++ b/frontend/owner-console.html
@@ -288,6 +288,20 @@
+        // v13.5: Time ago helper function
+        function timeAgo(isoTimestamp) {
+          if (!isoTimestamp) return 'Never';
+          const now = Date.now();
+          const then = new Date(isoTimestamp).getTime();
+          const diffMs = now - then;
+          const diffHours = diffMs / (1000 * 60 * 60);
+
+          if (diffHours < 1) {
+            const diffMins = Math.floor(diffMs / (1000 * 60));
+            return `${diffMins}m ago`;
+          } else if (diffHours < 24) {
+            return `${diffHours.toFixed(1)}h ago`;
+          } else {
+            const diffDays = Math.floor(diffHours / 24);
+            return `${diffDays}d ago`;
+          }
+        }

@@ -325,7 +339,7 @@
-                renderSystemStatus(data.data.health);
+                renderSystemStatus(data.data.health, data.data.ai_ops_health);

@@ -351,8 +365,48 @@
-        // Render system status
-        function renderSystemStatus(health) {
+        // Render system status (v13.5: with AI Ops Health Score)
+        function renderSystemStatus(health, aiOpsHealth) {
             const container = document.getElementById('systemStatus');
+
+            // Determine health score color (≥85 green, ≥60 yellow, <60 red)
+            let healthColor = 'text-red-300';
+            let healthBg = 'bg-red-500/20';
+            if (aiOpsHealth && aiOpsHealth.score >= 85) {
+                healthColor = 'text-green-300';
+                healthBg = 'bg-green-500/20';
+            } else if (aiOpsHealth && aiOpsHealth.score >= 60) {
+                healthColor = 'text-yellow-300';
+                healthBg = 'bg-yellow-500/20';
+            }
+
+            // Get top 3 explanations
+            const topExplanations = aiOpsHealth && aiOpsHealth.explanations
+                ? aiOpsHealth.explanations.slice(0, 3)
+                : ['No health data available yet'];
+
             container.innerHTML = `
                 <div class="bg-white/10 rounded-lg p-4 space-y-2">
                     ...existing system metrics...
                 </div>
+
+                <div class="${healthBg} rounded-lg p-4 mt-3 border border-white/20">
+                    <div class="flex justify-between items-center mb-2">
+                        <span class="text-white font-semibold">AI Ops System Health</span>
+                        <span class="${healthColor} text-2xl font-bold">${aiOpsHealth ? aiOpsHealth.score : 45}%</span>
+                    </div>
+                    <ul class="space-y-1 text-sm text-white">
+                        ${topExplanations.map(exp => `<li class="flex items-start"><span class="mr-2">•</span><span class="text-purple-100">${exp}</span></li>`).join('')}
+                    </ul>
+                </div>
             `;
         }

@@ -422,17 +476,26 @@
-        // Render AI modules
+        // Render AI modules (v13.5: with timestamps)
         function renderAIModules(modules) {
             const container = document.getElementById('aiModules');
             let html = '';

             Object.entries(modules).forEach(([name, module]) => {
                 const statusColor = module.enabled ? 'bg-green-500' : 'bg-gray-500';
+
+                // Show last run time if available (v13.5)
+                const lastRunText = module.lastRunIso || module.lastRun
+                    ? `<div class="text-xs text-purple-200 mt-1">Last: ${timeAgo(module.lastRunIso || module.lastRun)}</div>`
+                    : '';
+
                 html += `
                     <div class="bg-white/10 rounded-lg p-4">
                         <div class="flex justify-between items-center">
-                            <span class="text-white font-semibold capitalize">${name}</span>
+                            <div>
+                                <span class="text-white font-semibold capitalize">${name}</span>
+                                ${lastRunText}
+                            </div>
                             <span class="${statusColor} px-3 py-1 rounded-full text-xs text-white">
                                 ${module.status.toUpperCase()}
                             </span>
```

---

**Summary**: 2 files modified, 0 files created, ~100 lines changed
**Impact**: Owner Console now displays real AI Ops System Health (87%) with live timestamps
**Backward Compatible**: Yes (existing API consumers unaffected)

---

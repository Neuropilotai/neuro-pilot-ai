# Inventory Enterprise Dashboard v2.5.0

Enterprise-grade React dashboard for real-time inventory management, multi-tenancy visualization, AI performance monitoring, and RBAC security insights.

## Features

- 🎨 **Modern UI** - Tailwind CSS with violet gradient branding
- 🌓 **Dark/Light Theme** - Automatic theme detection with manual toggle
- 🔐 **Secure Authentication** - JWT + 2FA modal support
- 📊 **Real-Time Metrics** - WebSocket integration for live updates
- 📈 **Rich Data Visualization** - Recharts for interactive graphs
- 🏢 **Multi-Tenancy** - Tenant management and traffic monitoring
- 👥 **RBAC Dashboard** - Permission matrix editor
- 🤖 **AI Performance** - Forecast accuracy and RL rewards tracking
- 🛡️ **Security Monitoring** - RBAC denials and active sessions
- 📱 **Responsive Design** - Mobile, tablet, and desktop breakpoints

## Tech Stack

- **React 18.3** - UI framework
- **Vite 5.1** - Build tool and dev server
- **Tailwind CSS 3.4** - Utility-first styling
- **Recharts 2.12** - Data visualization
- **Socket.IO Client 4.7** - Real-time WebSocket
- **Axios 1.6** - HTTP client
- **Zustand 4.5** - State management
- **React Router 6.22** - Client-side routing
- **Lucide React** - Icon library

## Prerequisites

- Node.js ≥ 18.0.0
- npm ≥ 9.0.0
- Backend server running on http://localhost:8083

## Quick Start

### 1. Install Dependencies

```bash
cd frontend/dashboard
npm install
```

### 2. Configure Environment

Create `.env` file in `frontend/dashboard/`:

```env
# API Configuration
VITE_API_BASE_URL=http://localhost:8083/api
VITE_WS_URL=http://localhost:8083

# Development Settings
VITE_NODE_ENV=development
```

### 3. Start Development Server

```bash
npm run dev
```

Dashboard will be available at http://localhost:3000

### 4. Build for Production

```bash
npm run build
```

Production files will be in `dist/` directory.

### 5. Preview Production Build

```bash
npm run preview
```

## Project Structure

```
frontend/dashboard/
├── public/                # Static assets
├── src/
│   ├── components/        # Reusable UI components
│   │   ├── DashboardLayout.jsx
│   │   └── TwoFactorModal.jsx
│   ├── pages/             # Dashboard pages
│   │   ├── Login.jsx
│   │   ├── Overview.jsx
│   │   ├── Tenants.jsx
│   │   ├── Roles.jsx
│   │   ├── AIPerformance.jsx
│   │   └── Security.jsx
│   ├── services/          # API and WebSocket services
│   │   ├── api.js
│   │   └── websocket.js
│   ├── stores/            # Zustand state management
│   │   ├── authStore.js
│   │   └── themeStore.js
│   ├── lib/               # Utilities
│   │   └── utils.js
│   ├── App.jsx            # Main app component
│   ├── main.jsx           # Entry point
│   └── index.css          # Global styles
├── package.json
├── vite.config.js
├── tailwind.config.js
└── README.md
```

## Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server (port 3000) |
| `npm run build` | Build for production |
| `npm run preview` | Preview production build |
| `npm run lint` | Run ESLint |
| `npm test` | Run tests with Vitest |
| `npm run test:ui` | Run tests with UI |
| `npm run coverage` | Generate test coverage report |

## Pages & Routes

| Route | Page | Description |
|-------|------|-------------|
| `/login` | Login | Authentication with 2FA support |
| `/dashboard/overview` | Overview | API metrics, cache, AI MAPE graphs |
| `/dashboard/tenants` | Tenants | Tenant table with traffic sparklines |
| `/dashboard/roles` | Roles | Permission matrix editor |
| `/dashboard/ai` | AI Performance | Forecast accuracy & RL rewards charts |
| `/dashboard/security` | Security | RBAC denials & active sessions |

## Authentication Flow

1. **Login** - Enter email and password
2. **2FA Verification** (if enabled) - Enter 6-digit code from authenticator app
3. **Dashboard** - Redirected to overview page
4. **WebSocket Connection** - Automatically established on login
5. **Logout** - Clears tokens and disconnects WebSocket

## Real-Time Features

### WebSocket Events

The dashboard subscribes to the following events via `/ai/realtime`:

- `forecast:update` - AI forecast updated
- `policy:update` - RL policy committed
- `anomaly:alert` - Anomaly detected (triggers toast notification)
- `feedback:ingested` - Feedback data processed
- `model:retrained` - Model retrained (triggers toast notification)
- `drift:detected` - Model drift detected (triggers toast notification)

### Live Data Updates

- **Overview Page** - Metrics refresh every 10 seconds
- **AI Performance** - Charts update on WebSocket events
- **Security Page** - Sessions refresh every 30 seconds
- **WebSocket Status** - Shown in sidebar (green = connected)

## Theme System

### Dark Mode (Default)

- Violet gradient (#667eea → #764ba2)
- Dark gray backgrounds (#1e293b, #0f172a)
- High contrast text

### Light Mode

- Same violet gradient for branding consistency
- White/light gray backgrounds
- Dark text for readability

### Theme Toggle

- Automatic detection via `prefers-color-scheme`
- Manual toggle in header (sun/moon icon)
- Persisted in localStorage

## Responsive Breakpoints

| Breakpoint | Width | Layout |
|------------|-------|--------|
| Mobile | < 768px | Sidebar hidden (hamburger menu) |
| Tablet | 768px - 1024px | Sidebar visible, 2-column grid |
| Desktop | ≥ 1024px | Full layout, 4-column grid |

## API Integration

### Authentication

```javascript
import { api } from '../services/api';

// Login
const result = await api.login(email, password);

// 2FA Verification
const result = await api.verify2FA(userId, code);

// Logout
await api.logout();
```

### Metrics

```javascript
// Get Prometheus metrics
const metrics = await api.getMetrics();

// Parsed format:
{
  http_requests_total: [{ labels: {...}, value: 1234 }],
  cache_hits_total: [{ labels: {...}, value: 567 }],
  ai_accuracy_mape: [{ labels: {item_code: 'ABC'}, value: 12.5 }],
  ...
}
```

### Tenants

```javascript
// List tenants
const { tenants } = await api.getTenants({ page: 1, limit: 20 });

// Get tenant details
const tenant = await api.getTenant('tenant_001');

// Create tenant
const newTenant = await api.createTenant({ name: 'Acme Corp' });
```

### Roles & Permissions

```javascript
// List roles
const { roles } = await api.getRoles();

// Get role permissions
const permissions = await api.getRolePermissions('role_admin');

// Update role permissions
await api.updateRolePermissions('role_custom', ['inventory:read', 'orders:read']);
```

## WebSocket Integration

```javascript
import { websocket } from '../services/websocket';

// Connect (automatic on login)
websocket.connect();

// Subscribe to events
const unsubscribe = websocket.on('forecast:update', (data) => {
  console.log('Forecast updated:', data);
});

// Unsubscribe
unsubscribe();

// Subscribe to item-specific updates
websocket.subscribe('ITEM_ABC');

// Subscribe to anomalies
websocket.subscribeAnomalies();

// Check connection status
const isConnected = websocket.isConnected();

// Disconnect
websocket.disconnect();
```

## State Management

### Auth Store

```javascript
import { useAuthStore } from '../stores/authStore';

function MyComponent() {
  const { user, isAuthenticated, login, logout } = useAuthStore();

  // Use state and actions...
}
```

### Theme Store

```javascript
import { useThemeStore } from '../stores/themeStore';

function MyComponent() {
  const { theme, toggleTheme, setTheme } = useThemeStore();

  // Use state and actions...
}
```

## Styling Guidelines

### Tailwind Utilities

```jsx
// Card component
<div className="card card-hover">
  <h3 className="stat-label">API Latency</h3>
  <p className="stat-value">87ms</p>
</div>

// Button variants
<button className="btn btn-primary">Primary</button>
<button className="btn btn-secondary">Secondary</button>
<button className="btn btn-danger">Delete</button>

// Badges
<span className="badge badge-success">Active</span>
<span className="badge badge-warning">Pending</span>
<span className="badge badge-danger">Error</span>

// Gradient text
<h1 className="gradient-text">Inventory Enterprise</h1>
```

### Custom Classes

Defined in `src/index.css`:

- `.card` - White/dark card with rounded borders
- `.card-hover` - Add hover effect to cards
- `.btn` - Base button styles
- `.btn-primary` - Violet gradient button
- `.input` - Form input field
- `.badge` - Small status badge
- `.stat-card`, `.stat-value`, `.stat-label` - Stat components
- `.gradient-text` - Gradient text effect

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `VITE_API_BASE_URL` | `/api` | Backend API base URL |
| `VITE_WS_URL` | `` | WebSocket server URL |
| `VITE_NODE_ENV` | `development` | Environment mode |

## Deployment

### Build

```bash
npm run build
```

This creates optimized production files in `dist/`:

- Code splitting (React, Charts, Socket.IO)
- Minification
- Source maps
- Asset hashing

### Deploy to Static Hosting

**Vercel**:
```bash
npm install -g vercel
vercel --prod
```

**Netlify**:
```bash
netlify deploy --prod --dir=dist
```

**Nginx**:
```nginx
server {
    listen 80;
    server_name dashboard.example.com;
    root /var/www/dashboard/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /api {
        proxy_pass http://localhost:8083;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### Docker

```dockerfile
# frontend/dashboard/Dockerfile
FROM node:18-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

Build and run:
```bash
docker build -t inventory-dashboard .
docker run -p 3000:80 inventory-dashboard
```

## Testing

```bash
# Run all tests
npm test

# Run tests with UI
npm run test:ui

# Generate coverage
npm run coverage
```

## Troubleshooting

### WebSocket not connecting

1. Check backend is running on port 8083
2. Verify `VITE_WS_URL` environment variable
3. Check browser console for connection errors
4. Ensure JWT token is valid

### Metrics not loading

1. Backend `/api/metrics` endpoint must be accessible
2. Check CORS configuration
3. Verify authentication token in request headers

### Theme not persisting

1. Check browser localStorage permissions
2. Clear localStorage and refresh
3. Manually toggle theme

### Build errors

1. Delete `node_modules` and `package-lock.json`
2. Run `npm install` again
3. Ensure Node.js version ≥ 18.0.0

## Performance Optimization

- **Code Splitting** - Vendor bundles for React, Charts, Socket.IO
- **Lazy Loading** - Routes loaded on demand
- **Debouncing** - Search inputs debounced (300ms)
- **Memoization** - React components memoized where beneficial
- **Asset Optimization** - Images compressed, SVG preferred
- **Cache Strategy** - API responses cached with SWR pattern

## Security

- **XSS Protection** - React escapes output by default
- **CSRF Protection** - JWT tokens in Authorization header
- **Secure Cookies** - httpOnly, secure, sameSite flags
- **Content Security Policy** - Configured in Helmet.js on backend
- **Rate Limiting** - 100 requests/minute per IP
- **Input Validation** - Client-side validation with server-side enforcement

## Browser Support

- Chrome/Edge ≥ 90
- Firefox ≥ 88
- Safari ≥ 14
- Mobile Safari ≥ 14
- Chrome Mobile ≥ 90

## Contributing

1. Create feature branch from `main`
2. Follow ESLint rules (`npm run lint`)
3. Add tests for new features
4. Update documentation
5. Submit pull request

## License

Proprietary - © 2025 NeuroInnovate

---

**Version**: 2.5.0
**Build Date**: 2025-10-07
**Powered by**: React 18 + Vite + Tailwind CSS

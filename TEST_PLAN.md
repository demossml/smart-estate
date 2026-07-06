# Smart Estate — Full Test Plan

## Scope
Full-stack: REST API (backend) + React PWA (frontend) + Data Consistency

## Targets
- Production: https://usadba.gimolost2.ru
- Local: http://localhost:8788

## Testing Areas

### 1. Backend API (3 agents)
- **agent-bot-1**: Core CRUD — devices, rooms, pending, CSRF
- **agent-bot-2**: Commands — on/off, gates, climate, scenarios, events
- **agent-bot-3**: Edge cases — auth bypass, SQL injection, rate limits, missing CSRF

### 2. Frontend Rendering (2 agents)
- **agent-branch-a**: PWA setup — index.html, sw.js, manifest, cache headers, asset delivery
- **agent-branch-b**: Data pipeline — normalization (lastSeenMin, presence, battery, LQI), error display, CSRF integration

### 3. Data Consistency (1 agent)
- **agent-clone**: Verify all device types render correctly, no empty fields where data exists

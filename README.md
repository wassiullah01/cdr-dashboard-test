# CDR Dashboard - Operation ECHO

An investigation analytics platform for processing and analyzing Call Detail Records (CDR) from telecommunication data.

## Overview

This dashboard helps investigators quickly understand communication patterns from CDR files. Upload files in various formats, the system automatically cleans and normalizes the data, and you get interactive visualizations to spot patterns, identify key contacts, and track timelines.

The focus is on correctness and clarity—handling messy real-world data formats without breaking, and presenting insights that actually help investigations move forward. This project was built as part of the Operation ECHO CDR Dashboard coding test.

## Key Features

**File Upload & Processing**
- Accepts CSV, XLS, and XLSX files
- Handles multiple files in one upload
- Automatic header detection for Excel files (finds the real header row even with metadata above it)
- Robust error handling: invalid rows are skipped with clear reasons while partial but usable data is preserved

**Automatic Normalization**
- Converts inconsistent schemas into one standard format
- Handles varying column names (e.g., "A Number", "A-Party", "msisdn" all map to the same field)
- Preserves data quality: phone numbers stay as strings (no scientific notation), dates parse correctly, short codes are preserved
- Site/location parsing extracts coordinates from pipe-separated formats when available

**Session-Based Uploads**
- Each upload is treated as a separate investigation session
- Dashboard defaults to showing the most recent upload
- Switch to "All Uploads" to combine data across sessions
- Prevents mixing different investigations accidentally

**Filters & Search**
- Date range filtering
- Phone number search (searches both A-party and B-party)
- Filter by event type (Call/SMS) and direction (Incoming/Outgoing)
- All filters work together

**Analytics & Visualizations**
- Summary cards: total events, calls, SMS, duration, unique contacts, incoming/outgoing split
- Timeline chart: events over time (day or hour grouping) to spot activity patterns
- Top contacts: for a given phone number, see who they communicate with most
- Event table: paginated, sortable, with detailed view modal

**Data Quality**
- Tracks normalization warnings (short codes, missing sites, etc.)
- Shows data quality issues without blocking ingestion
- Preserves source metadata (file name, sheet, row number) for traceability

## How Upload Sessions Work

Each time you upload files, the system creates a new session with a unique ID. The dashboard automatically shows data from your most recent upload—this keeps investigations separate and prevents confusion.

If you need to see data from multiple uploads combined, use the "All Uploads" dropdown. This is useful when working with related cases or wanting to see trends across time.

In real investigations, you might upload data from different sources or time periods. Keeping them separate by default means you're always looking at the right dataset, and you can combine them when needed.

## Data Normalization & Assumptions

The normalization layer handles the messy reality of CDR data formats.

**Phone Numbers**
- Stored as strings to prevent Excel from converting large numbers to scientific notation
- Normalized by removing spaces and hyphens, but preserving leading "+"
- Short codes (less than 8 digits) are preserved—these are valid for SMS services

**Dates**
- Handles DD/MM/YYYY format (common in international data)
- Parses Excel serial dates correctly
- Falls back to other formats when detected
- Invalid dates cause the row to be skipped

**Direction Parsing**
- Uses strict word matching to avoid false positives (e.g., "INTERNET" won't be classified as "INCOMING")
- If a dedicated "Direction" column exists, it takes priority
- Otherwise, derives direction from the event type field

**Site/Location**
- Looks for exact "Site" column first (case-insensitive)
- Parses pipe-separated format: `"site name|latitude|longitude|metadata"`
- Extracts clean site name and coordinates when available
- Preserves full original string for investigation value

**What Gets Skipped**
- Rows missing `startTime` are skipped
- Rows missing both `aParty` and `bParty` are skipped
- Everything else is kept, even if some fields are missing (warnings are tracked)

**What Gets Kept**
- Rows with partial data are kept (missing fields become null)
- Short codes are kept (marked with a flag)
- Rows with normalization warnings are kept (warnings stored in the document)

## Architecture Overview

The application follows a standard MERN stack architecture with clear separation between client and server.

**Client-Server Communication**
- Frontend runs on Vite dev server (port 3000) or deployed on Vercel
- Backend Express API (port 5000 locally, or Vercel serverless)
- In production, frontend uses environment variable for API URL
- In development, Vite proxy forwards `/api/*` requests to backend
- RESTful API design with JSON responses

**Data Flow**
1. Files uploaded via multipart form to `/api/uploads`
2. Files stored temporarily, metadata returned
3. Frontend calls `/api/ingest` with file metadata
4. Backend parses files, normalizes data, inserts into MongoDB
5. Frontend receives `uploadId` and switches to dashboard view
6. Dashboard queries analytics endpoints with `uploadId` for session filtering

**Key Design Patterns**
- Session-based data isolation (each upload gets unique `uploadId`)
- Normalization pipeline handles schema inconsistencies
- Error aggregation (collects errors without stopping processing)
- Source metadata preservation (tracks file/sheet/row for traceability)

## Tech Stack

**Frontend**
- React (Vite) with plain JavaScript
- Custom CSS (no frameworks)
- Recharts for visualizations
- Axios for HTTP requests

**Backend**
- Node.js with Express
- MongoDB Atlas (cloud-hosted)
- Multer for file uploads

**Data Processing**
- SheetJS (xlsx) for Excel parsing
- csv-parse for CSV files
- Custom normalization pipeline

## API Overview

The API is RESTful and straightforward. All analytics endpoints support session filtering via `uploadId` or `includeAll=true`.

**Main Endpoints:**

```
POST /api/ingest
Body: { files: [{ filename, originalName, ... }] }
Response: { uploadId, summary: { totalInserted, totalSkipped, fileSummaries, ... } }
```

```
GET /api/events?page=1&limit=50&uploadId=<uuid>&startDate=...&number=...
Response: { events: [...], pagination: {...}, uploadId: "..." }
```

```
GET /api/analytics/overview?uploadId=<uuid>
Response: {
  totalEvents: 1002,
  totalCalls: 500,
  totalSMS: 502,
  totalDurationHours: 12.5,
  uniqueContacts: 45,
  incomingCount: 600,
  outgoingCount: 402
}
```

```
GET /api/analytics/timeline?groupBy=day&uploadId=<uuid>
Response: { timeline: [{ timestamp: "2023-10-12", count: 45, calls: 20, sms: 25 }, ...] }
```

```
GET /api/analytics/top-contacts?number=923895890631&uploadId=<uuid>
Response: { topContacts: [{ number: "...", count: 50, calls: 30, sms: 20, ... }, ...] }
```

All endpoints return the resolved `uploadId` in the response, so the frontend can reliably stay in sync with the active upload session.

## Database Schema

**Events Collection** (`events`)

Stores normalized CDR events with the following structure:

```javascript
{
  eventType: "CALL" | "SMS",           // Required, indexed
  direction: "INCOMING" | "OUTGOING" | "UNKNOWN",  // Required, indexed
  aParty: String,                      // Phone number, indexed
  bParty: String,                      // Phone number, indexed
  startTime: Date,                     // Required, indexed
  endTime: Date | null,
  durationSec: Number,                 // Default: 0
  imei: String | null,
  imsi: String | null,
  cellId: String | null,
  lacId: String | null,
  lat: Number | null,
  lng: Number | null,
  site: String | null,                 // Full original site string
  siteName: String | null,             // Clean site name (extracted)
  siteMeta: String | null,             // Additional metadata
  provider: String | null,
  source: {
    fileName: String,
    sheetName: String | null,
    rowNumber: Number
  },
  ingestedAt: Date,                     // Auto-set on insert
  uploadId: String,                     // Required, indexed (UUID)
  isShortCode: Boolean,                 // Default: false
  normalizationWarnings: [String]       // Array of warning codes
}
```

**Indexes:**
- Single field: `eventType`, `direction`, `aParty`, `bParty`, `startTime`, `uploadId`
- Compound: `{ startTime: 1, eventType: 1 }`, `{ aParty: 1, bParty: 1 }`, `{ startTime: 1, aParty: 1 }`, `{ uploadId: 1, startTime: 1 }`

**Uploads Collection** (`uploads`)

Tracks upload sessions and ingestion metadata:

```javascript
{
  uploadId: String,                     // Required, unique (UUID)
  createdAt: Date,                      // Auto-set, indexed
  fileSummaries: [{
    fileName: String,
    inserted: Number,
    skipped: Number,
    totalRows: Number,
    warningsCount: Number
  }],
  errorSamples: [{                     // Limited to 50 total
    rowNumber: Number,
    reason: String,
    fileName: String
  }],
  stats: {
    totalInserted: Number,
    totalSkipped: Number,
    totalFiles: Number
  }
}
```

**Indexes:**
- `createdAt` (for finding most recent upload)

## Component Documentation

**Frontend Components** (`client/src/components/`)

- **App.jsx**: Root component, manages upload/dashboard state, handles `uploadId` persistence
- **UploadSection.jsx**: File selection, upload UI, progress feedback, error display
- **Dashboard.jsx**: Main dashboard container, manages filters and view mode (current/all uploads)
- **Filters.jsx**: Date range, phone search, event type, direction filters
- **SummaryCards.jsx**: Displays KPIs (total events, calls, SMS, duration, contacts, incoming/outgoing)
- **TimelineChart.jsx**: Line chart showing events over time (day/hour grouping)
- **TopContactsChart.jsx**: Bar chart showing top contacts for a given phone number
- **EventsTable.jsx**: Paginated, sortable table with event details modal
- **EventDetailsModal.jsx**: Modal showing complete event info (IMEI, IMSI, Cell ID, location, source metadata)
- **Header.jsx**: Application header with title and description

**State Management:**
- React hooks (`useState`, `useEffect`, `useCallback`)
- `localStorage` for `uploadId` persistence
- Props-based data flow

**Styling:**
- Organized CSS files in `client/src/styles/`
- `base.css`: Reset, typography, CSS variables
- `layout.css`: Grid, spacing, containers
- `dashboard.css`: Cards, charts, summary cards
- `filters.css`: Form controls, inputs
- `tables.css`: Table styling, pagination

## Running the Project Locally

**Prerequisites:**
- Node.js v18 or higher
- MongoDB Atlas account (free tier works)

**Installation:**

```bash
# Install all dependencies (root, server, client)
npm run install-all
```

**Environment Setup:**

1. **Server** - Create `server/.env`:
```
PORT=5000
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/cdr_dashboard?retryWrites=true&w=majority
NODE_ENV=development
FRONTEND_URL=http://localhost:3000
```

2. **Client** - Create `client/.env`:
```
# Leave empty to use Vite proxy (for local development)
VITE_API_BASE_URL=
```

Get your MongoDB Atlas connection string from the Atlas dashboard (Database → Connect → Connect your application).

**Run:**

```bash
# Start both server and client
npm run dev
```

This starts:
- Backend on `http://localhost:5000`
- Frontend on `http://localhost:3000`

The frontend proxies API requests to the backend automatically via Vite.

**MongoDB Atlas Setup:**
1. Create a free M0 cluster
2. Create a database user (save credentials)
3. Whitelist your IP (or use 0.0.0.0/0 for development)
4. Get connection string and add to `server/.env`

## Deployment

The application is deployed on Vercel with separate projects for frontend and backend.

**Production URLs:**
- Frontend: https://cdr-dashboard-client.vercel.app
- Backend: https://cdr-dashboard-server.vercel.app

**Backend Environment Variables (Vercel):**
- `MONGODB_URI`: MongoDB Atlas connection string (required)
- `FRONTEND_URL`: https://cdr-dashboard-client.vercel.app (for CORS)
- `NODE_ENV`: production

**Frontend Configuration:**
- The frontend automatically detects production vs development
- In production: Uses `https://cdr-dashboard-server.vercel.app` as backend URL
- In local development: Uses relative paths (Vite proxy handles routing to `http://localhost:5000`)
- Optional: Set `VITE_API_BASE_URL` in Vercel environment variables to override the default production URL

## Screenshots

### Upload
![Upload](screenshots/upload.PNG)

### Dashboard (Latest Upload)
![Dashboard Latest Upload](screenshots/dashboard%20(latest%20upload).PNG)

### Dashboard (All Uploads)
![Dashboard All Uploads](screenshots/dashboard%20(all%20uploads).PNG)

### Search & Filters
![Search Filter](screenshots/search%20filter.PNG)

### Events Table
![Events Table](screenshots/events%20table.PNG)

### Event Details
![Event Details](screenshots/event%20details.PNG)

## Limitations & Future Improvements

**Intentionally Not Implemented (Time Constraints):**

- **Map Visualization**: Geographic data is available via API but not visualized on a map. This would be valuable for tracking movement patterns.
- **Export Functionality**: Can't export filtered results to CSV/Excel. Would be useful for sharing with other tools.

These were conscious tradeoffs—focusing on core functionality and data correctness over additional visualizations. The architecture supports adding these features later.

**Other Limitations:**
- Large datasets (millions of rows) would benefit from MongoDB aggregation pipelines instead of in-memory processing
- No real-time updates (WebSocket support)
- No authentication or multi-user support
- No automatic data retention policies

## Closing Note

This dashboard prioritizes correctness and clarity. The normalization pipeline handles real-world data inconsistencies, the session-based approach keeps investigations separate, and the visualizations focus on actionable insights.

The code is organized for maintainability, error handling is robust, and the UX is designed for investigators who need to move fast. Everything is documented, assumptions are explicit, and the system degrades gracefully when data is messy.
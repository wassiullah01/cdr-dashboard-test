# CDR Dashboard - Operation ECHO

An investigation analytics platform for processing and analyzing Call Detail Records (CDR) from telecommunication data.

## Overview

This dashboard helps investigators quickly understand communication patterns from CDR files. You upload files in various formats, the system automatically cleans and normalizes the data, and you get interactive visualizations to spot patterns, identify key contacts, and track timelines.

The focus is on correctness and clarity—handling messy real-world data formats without breaking, and presenting insights that actually help investigations move forward.

## Key Features

**File Upload & Processing**
- Accepts CSV, XLS, and XLSX files
- Handles multiple files in one upload
- Automatic header detection for Excel files (finds the real header row even with metadata above it)
- Robust error handling—bad rows are skipped with clear reasons, processing continues

**Automatic Normalization**
- Converts inconsistent schemas into one standard format
- Handles varying column names (e.g., "A Number", "A-Party", "msisdn" all map to the same field)
- Preserves data quality—phone numbers stay as strings (no scientific notation), dates parse correctly, short codes are preserved
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

If you need to see data from multiple uploads combined, use the "All Uploads" dropdown. This is useful when you're working with related cases or want to see trends across time.

Why this matters: In real investigations, you might upload data from different sources or time periods. Keeping them separate by default means you're always looking at the right dataset, and you can combine them when needed.

## Data Normalization & Assumptions

The normalization layer handles the messy reality of CDR data formats. Here's what it does:

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

## Tech Stack

**Frontend**
- React (Vite) with plain JavaScript
- Custom CSS (no frameworks)
- Recharts for visualizations

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

All endpoints return the resolved `uploadId` in the response, so the frontend can sync session state.

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

Create `server/.env`:

```
PORT=5000
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/cdr_dashboard?retryWrites=true&w=majority
NODE_ENV=development
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

The frontend proxies API requests to the backend automatically.

**MongoDB Atlas Setup:**
1. Create a free M0 cluster
2. Create a database user (save credentials)
3. Whitelist your IP (or use 0.0.0.0/0 for development)
4. Get connection string and add to `.env`

## Screenshots

Screenshots demonstrating the dashboard are included in the repository:

- **Upload Page**: File selection and upload interface
- **Dashboard**: Overview with summary cards, charts, and filters
- **Filters**: Date range, phone search, event type, and direction filters
- **Event Details**: Modal showing complete event information including IMEI, IMSI, Cell ID, location data, and source metadata

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
# CDR Dashboard - Investigation Analytics Platform

An investigator-grade analytics platform for processing and analyzing Call Detail Records (CDR) from telecommunication data. Built for Operation ECHO coding assessment, this dashboard provides explainable analytics, network graph analysis, anomaly detection, and geographic movement visualization.

## Overview

This dashboard transforms raw CDR files into actionable intelligence through a robust canonical data pipeline and interactive visualizations. Designed for investigators who need to quickly understand communication patterns, identify anomalies, map relationships, and track geographic movements—all with transparent, explainable results.

**Key Differentiators:**
- **Canonical Data Foundation**: All analytics built on a normalized, enriched, deduplicated dataset
- **Explainable Anomaly Detection**: Rule-based anomaly detection with transparent metrics and explanations
- **Network Graph Analysis**: Interactive communication network visualization with community detection
- **Geographic Movement Tracking**: Heatmap, points, and movement path visualization
- **Investigator-First UX**: Drill-down actions, baseline/recent comparisons, deterministic behavior

## Key Features

### Dashboard Analytics

**Overview Metrics**
- Total events, calls, SMS, duration (hours), unique contacts
- Incoming/outgoing/internal split
- Real-time filtering by date range, phone number, event type

**Timeline Visualization**
- Events over time (day/hour grouping)
- Spot activity patterns, spikes, and trends
- Filtered by upload session or all uploads

**Top Contacts Analysis**
- Enter any phone number to see communication patterns
- Shows counterparty, event counts, call duration, first/last seen
- Sorted by interaction frequency

**Events Table**
- Paginated, sortable event listing
- Detailed modal with complete event information:
  - Location data (lat/lng, cell_id, IMEI, IMSI)
  - Source metadata (file, sheet, row number)
  - Normalization warnings and confidence scores

**Data Source**: All dashboard analytics use `events_canonical` collection (canonical pipeline output)

### Network Analysis

**Interactive Graph Visualization**
- Nodes = phone numbers, Edges = communication relationships
- Weighted by event count and duration
- Canvas-based rendering with physics simulation

**Community Detection**
- Louvain algorithm for clustering related numbers
- Color-coded communities
- Community isolation and highlighting

**Features**
- **Filters**: Date range, event type (all/call/sms), min edge weight, max nodes
- **Stabilize/Pause**: Control graph physics for investigation
- **Focus**: Auto-focus on specific phone number
- **Top Nodes**: List sorted by weighted degree
- **Node Details**: Click any node to see ego network, top contacts, activity stats

**Performance**: Server-side graph building with MongoDB aggregation, deterministic trimming for large datasets

### Explainable Anomaly Detection (Alerts)

**Four Anomaly Types**

1. **Volume Anomaly**
   - Detects sudden spikes in communication volume
   - Compares baseline vs. recent event counts
   - Flags: ≥2× increase OR ≥50% increase with absolute threshold

2. **Night Shift Anomaly**
   - Identifies unusual nighttime activity patterns
   - Compares baseline vs. recent night-hour event percentages
   - Flags: ≥20% increase in night activity share

3. **Burst Pattern Anomaly**
   - Detects changes in communication burst behavior
   - Analyzes burst session size and frequency
   - Flags: Significant changes in burst characteristics

4. **New Contact Emergence**
   - Identifies new communication relationships
   - Bidirectional analysis (caller ↔ receiver)
   - Flags: ≥5 new contacts OR ≥20% share of recent activity

**Baseline vs. Recent Split**
- Time-based split: 70% of time range = baseline, 30% = recent
- Computed from dataset's min/max timestamps (not record count)
- Ensures accurate historical comparison

**Alert Details**
- Severity levels: High, Medium, Low
- Transparent explanations with metrics
- Drill-down actions: View in Network, View Events, View Timeline

**Data Source**: Analyzes `events_canonical` with baseline/recent window labels

### Geographic Movement & Hotspots

**Three View Modes**

1. **Heatmap View** (Default)
   - Color-coded activity density overlay
   - Grid-based aggregation (configurable: 0.005°, 0.01°, 0.02°)
   - Weighted by event count + call duration

2. **Points View**
   - Individual event locations as markers
   - Zoom-gated rendering (shows at zoom ≥10 or with phone filter)
   - Clickable markers with event details

3. **Path View**
   - Movement trace for specific phone number
   - Chronological polyline connecting all points
   - Start (green) and end (red) markers, waypoint details

**Features**
- **Fit to Data**: Auto-zoom to data bounds
- **Filters**: Date range (presets anchored to dataset max time), event type, phone number
- **Point Limit**: Configurable (500-5000) for performance
- **Details Panel**: Selected point information, movement summary

**Data Source**: Uses `latitude`/`longitude` fields from `events_canonical`

### Canonical Data Pipeline

**Three-Stage Processing**

1. **Canonicalization** (`canonicalNormalizer.js`)
   - Normalizes raw CDR records to standard schema
   - Handles timezone conversion (Asia/Karachi → UTC)
   - Derives temporal fields (date, hour, day_of_week, is_weekend, is_night)
   - Creates contact_pair_key for relationship tracking
   - Validates and scores data quality

2. **Enrichment** (`enrichment.js`)
   - Computes burst sessions (scoped per contact pair)
   - Splits baseline/recent windows (time-based, 70/30)
   - Adds contact first/last seen timestamps
   - Calculates rolling averages (7-day, 30-day)

3. **Deduplication** (`deduplication.js`)
   - 1-second timestamp tolerance
   - 1-second duration tolerance
   - Bucket-based fingerprinting for efficiency
   - Preserves first occurrence, marks duplicates

**Output**: `events_canonical` collection with analytics-ready fields

## Architecture & Data Flow

```
┌─────────────┐
│ File Upload │ (CSV/XLS/XLSX)
└──────┬──────┘
       │
       ▼
┌─────────────────┐
│ File Parser     │ → Raw Records
└──────┬──────────┘
       │
       ▼
┌─────────────────────┐
│ Canonicalization    │ → Normalized Schema
│ - Timezone handling │
│ - Field derivation  │
└──────┬──────────────┘
       │
       ▼
┌─────────────────┐
│ Enrichment      │ → Analytics Fields
│ - Burst sessions │
│ - Baseline split │
└──────┬──────────┘
       │
       ▼
┌─────────────────┐
│ Deduplication   │ → Final Records
└──────┬──────────┘
       │
       ▼
┌──────────────────────┐
│ events_canonical     │ (MongoDB Collection)
└──────┬───────────────┘
       │
       ├─────────────────┬──────────────────┬─────────────────┐
       ▼                 ▼                  ▼                 ▼
┌─────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│ Dashboard   │  │ Network      │  │ Alerts       │  │ Geography    │
│ Analytics   │  │ Graph API    │  │ Detection    │  │ Movement API │
└──────┬──────┘  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘
       │                 │                  │                 │
       ▼                 ▼                  ▼                 ▼
┌──────────────────────────────────────────────────────────────┐
│                    React Frontend                            │
│  / (Dashboard)  /network  /alerts  /map                      │
└──────────────────────────────────────────────────────────────┘
```

**Mermaid Diagram** (optional rendering):

```mermaid
graph TD
    A[File Upload] --> B[File Parser]
    B --> C[Canonicalization]
    C --> D[Enrichment]
    D --> E[Deduplication]
    E --> F[events_canonical DB]
    F --> G[Dashboard API]
    F --> H[Network API]
    F --> I[Alerts API]
    F --> J[Geography API]
    G --> K[React Frontend]
    H --> K
    I --> K
    J --> K
```

## Tech Stack

**Frontend**
- React 18.2 (Vite)
- React Router DOM 6.21 (routing)
- Recharts 2.10 (timeline charts)
- Leaflet 1.9.4 + React-Leaflet 4.2 (map visualization)
- Leaflet.Heat 0.2.0 (heatmap overlay)
- Axios 1.6 (HTTP client)
- Custom CSS (no frameworks)

**Backend**
- Node.js (ES modules)
- Express 4.18 (REST API)
- Mongoose 8.0 (MongoDB ODM)
- Luxon 3.4 (timezone handling)
- Graphology 0.25 + graphology-communities-louvain 2.0 (network analysis)
- Multer 1.4 (file uploads)
- SheetJS (xlsx) 0.18 (Excel parsing)
- csv-parse 5.5 (CSV parsing)

**Database**
- MongoDB (Atlas or local)
- Collections: `events_canonical`, `uploads`

## Setup & Run Instructions

### Prerequisites

- **Node.js** v18 or higher
- **MongoDB** (Atlas cloud or local instance)

### Installation

```bash
# Install all dependencies (root, server, client)
npm run install-all
```

This installs:
- Root dependencies (concurrently for dev scripts)
- Server dependencies (Express, Mongoose, etc.)
- Client dependencies (React, Leaflet, etc.)

### Environment Configuration

Create `server/.env`:

```env
PORT=5000
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/cdr_dashboard?retryWrites=true&w=majority
```

**MongoDB Atlas Setup:**
1. Create a free M0 cluster
2. Create database user (save credentials)
3. Whitelist IP (0.0.0.0/0 for development)
4. Get connection string from Atlas dashboard
5. Add to `server/.env`

**Local MongoDB:**
```env
MONGODB_URI=mongodb://localhost:27017/cdr_dashboard
```

### Running the Application

**Development Mode** (both server and client):

```bash
npm run dev
```

This starts:
- **Backend**: `http://localhost:5000`
- **Frontend**: `http://localhost:3000` (proxies `/api/*` to backend)

**Separate Terminals** (optional):

```bash
# Terminal 1: Backend
npm run server

# Terminal 2: Frontend
npm run client
```

### First-Time Setup

1. **Upload a CDR file**:
   - Navigate to `http://localhost:3000`
   - Click "Choose Files" and select CSV/XLS/XLSX files
   - Files are processed through canonical pipeline
   - Dashboard appears after ingestion completes

2. **Verify Data**:
   - Check Dashboard tab for summary metrics
   - Verify Network tab shows graph (if relationships exist)
   - Check Alerts tab for anomalies
   - Verify Map tab shows locations (if coordinates exist)

### Troubleshooting

**MongoDB Connection Issues**
- Verify `MONGODB_URI` in `server/.env` is correct
- Check MongoDB Atlas IP whitelist includes your IP
- Verify network connectivity (firewall, VPN)
- Server logs connection status on startup

**Empty Analytics**
- Ensure files were uploaded successfully
- Check `events_canonical` collection has documents
- Verify `uploadId` matches between upload and analytics queries
- Check browser console for API errors

**CORS Errors**
- Frontend proxy should handle this automatically
- If using direct API calls, ensure backend CORS is enabled (already configured)

**Map Not Rendering**
- Verify Leaflet CSS is loaded (check browser console)
- Ensure dataset includes `latitude`/`longitude` fields
- Check Network tab for failed `/api/geo/*` requests

## API Documentation

### Analytics Endpoints

**GET `/api/analytics/overview`**
- Summary statistics for upload session
- Query params: `uploadId` (required)
- Returns: `totalEvents`, `totalCalls`, `totalSMS`, `totalDurationHours`, `uniqueContacts`, `incomingCount`, `outgoingCount`

**GET `/api/analytics/timeline`**
- Events over time with grouping
- Query params: `uploadId`, `groupBy` (day/hour), `from`, `to`
- Returns: Array of `{ timestamp, count, calls, sms }`

**GET `/api/analytics/top-contacts`**
- Top communication partners for a phone number
- Query params: `uploadId`, `number` (required)
- Returns: Array of `{ number, count, calls, sms, totalDuration, firstSeen, lastSeen }`

**GET `/api/analytics/events`**
- Paginated event listing
- Query params: `uploadId`, `page`, `limit`, `startDate`, `endDate`, `number`, `eventType`
- Returns: `{ events: [...], pagination: { page, limit, total } }`

### Network Analysis

**GET `/api/analytics/network`**
- Builds communication graph with communities
- Query params: `uploadId` (required), `from`, `to`, `eventType`, `minEdgeWeight`, `limitNodes`, `limitEdges`
- Returns: `{ graph: { nodes: [...], edges: [...] }, communities: [...], stats: {...} }`
- Nodes include: `id`, `degree`, `weightedDegree`, `community`, `totalEvents`
- Edges include: `source`, `target`, `weight`, `eventCount`

### Anomaly Detection

**GET `/api/analytics/anomalies`**
- Explainable anomaly detection results
- Query params: `uploadId` (required), `from`, `to`, `eventType`, `phone`
- Returns: `{ alerts: [...], alertsData: { baseline: {...}, recent: {...} } }`
- Each alert: `{ type, severity, phone, explanation, recommendedActions, window: {...} }`

### Geography Analytics

**GET `/api/analytics/geo/summary`**
- Geographic summary statistics
- Query params: `uploadId` (required), `from`, `to`, `eventType`, `phone`
- Returns: `{ totalEventsInWindow, eventsWithCoords, uniqueLocationsCount, bbox: {...}, timeRange: {...} }`

**GET `/api/analytics/geo/heatmap`**
- Aggregated heatmap cells
- Query params: `uploadId` (required), `from`, `to`, `eventType`, `phone`, `grid` (0.005/0.01/0.02)
- Returns: `{ cells: [{ lat, lng, weight }] }`

**GET `/api/analytics/geo/trace`**
- Movement trace points for phone number
- Query params: `uploadId` (required), `from`, `to`, `eventType`, `phone` (optional), `limit` (default: 2000)
- Returns: `{ points: [{ lat, lng, timestampUtc, eventType, counterparty }] }`
- Server-side downsampling if points exceed limit

### Ingestion

**POST `/api/ingest/canonical`**
- Processes files through canonical pipeline
- Body: `{ files: [{ filename, originalName }] }`
- Returns: `{ uploadId, summary: { totalInserted, totalInvalid, totalDuplicates, totalProcessed } }`

**POST `/api/uploads`**
- Uploads files to server
- Multipart form with `files[]` field
- Returns: `{ message, files: [{ filename, originalName, size, path }] }`

## UX Notes

### Drill-Down Actions

**From Alerts Page:**
- Click "View in Network" → Navigates to Network tab with:
  - Focused phone number
  - Date filters from alert window
  - Auto-selected node
- Click "View Events" → Navigates to Dashboard with:
  - Phone filter applied
  - Date range from alert window
- Click "View Timeline" → Navigates to Dashboard with:
  - Phone filter applied
  - Timeline chart visible

**Navigation State:**
- Uses React Router `location.state` for filter passing
- State is cleared after application to prevent re-application on refresh

### Baseline vs. Recent Logic

- **Time-Based Split**: 70% of dataset time range = baseline, 30% = recent
- **Calculation**: `cutoffTime = minTimestamp + 0.7 × (maxTimestamp - minTimestamp)`
- **Labeling**: Each record in `events_canonical` has `baseline_window_label: 'baseline' | 'recent'`
- **Anomaly Detection**: Compares baseline period metrics vs. recent period metrics

### Filter Behavior

- **Date Presets**: "Last 7d", "Last 30d" anchor to dataset's maximum time (not `Date.now()`)
- **Phone Filter**: Exact string match (trimmed), searches both `caller_number` and `receiver_number`
- **Event Type**: `all` | `call` | `sms`
- **Reset Filters**: Clears all filters and resets to defaults

## Testing / Verification Checklist

### Initial Setup
- [ ] MongoDB connection successful (check server logs)
- [ ] Frontend loads at `http://localhost:3000`
- [ ] No console errors on page load

### File Upload & Ingestion
- [ ] Upload CSV/XLS/XLSX file(s)
- [ ] Verify upload progress completes
- [ ] Check `events_canonical` collection has documents
- [ ] Verify upload summary shows inserted/duplicates/invalid counts

### Dashboard Tab
- [ ] Summary cards show correct totals
- [ ] Timeline chart renders with data points
- [ ] Top Contacts: Enter phone number, verify counterparties listed
- [ ] Events table: Pagination works, sorting works, modal shows details
- [ ] Filters: Date range, phone search, event type all work

### Network Tab
- [ ] Graph renders with nodes and edges
- [ ] Communities detected and color-coded
- [ ] Click node → Details panel shows correct information
- [ ] Filters: Date range, event type, min edge weight update graph
- [ ] Stabilize/Pause controls work
- [ ] "Fit to Data" button adjusts viewport

### Alerts Tab
- [ ] Anomalies detected and displayed
- [ ] Alert details show explanation and metrics
- [ ] Severity levels (High/Medium/Low) correct
- [ ] "View in Network" → Network tab opens with correct focus/filters
- [ ] "View Events" → Dashboard opens with phone filter
- [ ] Date presets work (anchored to dataset max time)

### Geography Tab
- [ ] Heatmap view renders (if coordinates exist)
- [ ] Points view shows markers (zoom in or with phone filter)
- [ ] Path view: Enter phone → Path line renders with start/end markers
- [ ] "Fit to Data" button works
- [ ] Filters update map correctly
- [ ] Click marker → Details panel shows point information

### Cross-Feature Verification
- [ ] Drill-down from Alerts to Network works
- [ ] Drill-down from Alerts to Dashboard works
- [ ] Navigation between tabs preserves uploadId
- [ ] URL routing works (`/`, `/network`, `/alerts`, `/map`)

## Known Limitations & Future Work

### Intentionally Deferred

- **Geo Anomalies**: Geographic anomaly detection (unusual locations, co-location) not implemented
- **Co-location Analysis**: Identifying phones that appear at same location/time
- **Export Functionality**: CSV/Excel export of filtered results
- **Real-time Updates**: WebSocket support for live data ingestion
- **Multi-user Support**: Authentication and user management
- **Data Retention**: Automatic cleanup policies

### Technical Limitations

- **Large Dataset Performance**: 
  - Very large datasets (>100k events) may require optimization
  - Network graph trimming is deterministic but may need tuning
  - Geography heatmap grid size may need adjustment for performance

- **Coordinate Coverage**:
  - Only events with valid `latitude`/`longitude` appear in Geography tab
  - No fallback to cell_id-based location estimation

- **Phone Number Matching**:
  - Exact string match required (no fuzzy/partial matching)
  - International format variations may require normalization

- **Baseline Split**:
  - Fixed 70/30 split (not configurable)
  - Requires sufficient time range in dataset

### Future Enhancements

- **Advanced Network Features**: 
  - Temporal network analysis (how relationships change over time)
  - Centrality metrics (betweenness, closeness)
  - Subgraph extraction and analysis

- **Enhanced Anomaly Detection**:
  - Machine learning-based anomaly scoring
  - Customizable threshold configuration
  - Anomaly correlation and clustering

- **Geography Enhancements**:
  - Stay-point detection (frequent locations)
  - Movement pattern classification
  - Geo-fencing and area-of-interest analysis

- **Performance Optimizations**:
  - Caching layer for frequently accessed analytics
  - Incremental aggregation updates
  - Client-side data virtualization for large tables

## Screenshots

### Upload Page
![Upload Page](screenshots/upload_page.PNG)
*File upload interface for selecting and uploading CDR files (CSV, XLS, XLSX formats)*

### Dashboard - Main View
![Dashboard with Filters, Summary, and Alerts](screenshots/dashboard_event_filters_summary_alerts.PNG)
*Main dashboard view showing filters, summary cards, timeline chart, events table, and navigation tabs*

### Timeline Chart
![Timeline Chart](screenshots/timline_chart.PNG)
*Events over time visualization with day/hour grouping to identify activity patterns and spikes*

### Top Contacts Bar Chart
![Top Contacts Bar Chart](screenshots/top_contacts_barchart.PNG)
*Bar chart displaying top communication partners for a selected phone number with interaction counts and duration*

### Events Table
![Events Table](screenshots/events_table.PNG)
*Paginated and sortable events table with detailed event information and filtering capabilities*

### Event Details Modal
![Event Details Modal](screenshots/events_detail_modal.PNG)
*Detailed event information modal showing location data (lat/lng, cell_id), device identifiers (IMEI, IMSI), source metadata (file, sheet, row number), and normalization warnings*

### Network Graph
![Network Graph](screenshots/networks_graph.PNG)
*Interactive communication network graph with nodes (phone numbers), edges (relationships), community detection, and node details panel*

### Anomaly Detection Alerts
![Anomaly Detection Alerts](screenshots/anomaly_detection_alerts.PNG)
*Explainable anomaly detection results showing alert types (Volume, Night Shift, Burst Pattern, New Contact), severity levels (High/Medium/Low), explanations, and drill-down actions (View in Network, View Events, View Timeline)*

### Geographic Analysis - Heatmap View
![Geographic Analysis Heatmap](screenshots/geographic_analysis_heatmap.PNG)
*Heatmap visualization showing communication activity density across geographic regions with color-coded intensity overlay*

### Geographic Analysis - Points View
![Geographic Analysis Points](screenshots/geographic_analysis_points.PNG)
*Points view displaying individual event locations as markers with zoom-gated rendering and clickable details*

### Geographic Analysis - Path View
![Geographic Analysis Path](screenshots/geographic_analysis_path.PNG)
*Movement path visualization tracing phone number movement over time with chronological polyline, start (green) and end (red) markers, and waypoint details*

---

## Project Structure

```
cdr-dashboard/
├── client/                 # React frontend
│   ├── src/
│   │   ├── components/    # React components
│   │   │   ├── Geo/       # Geography components
│   │   │   ├── Dashboard.jsx
│   │   │   ├── Network.jsx
│   │   │   ├── Alerts.jsx
│   │   │   └── ...
│   │   ├── styles/        # CSS files
│   │   └── utils/         # API client, helpers
│   └── package.json
├── server/                 # Express backend
│   ├── routes/            # API route handlers
│   ├── models/            # Mongoose schemas
│   ├── utils/             # Pipeline utilities
│   │   ├── canonicalNormalizer.js
│   │   ├── enrichment.js
│   │   ├── deduplication.js
│   │   ├── networkGraph.js
│   │   └── ...
│   └── package.json
└── README.md
```
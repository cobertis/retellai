# Retell AI Admin Dashboard

## Overview
This project is a comprehensive admin dashboard for managing automated call campaigns using Retell AI. It enables users to create AI voice agents, upload phone lists, launch campaigns, and track performance with detailed analytics. Built as a full-stack TypeScript application, it features a React frontend with shadcn/ui and an Express backend with PostgreSQL. The project aims to provide a robust, scalable, and user-friendly platform for AI-powered voice outreach, with a focus on clear data visualization and efficient campaign management.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Frameworks**: React with TypeScript, Vite for bundling, Wouter for routing.
- **UI/UX**: shadcn/ui component library, Tailwind CSS, custom design tokens, inspired by Linear/Stripe/Vercel dashboards for data clarity. The design incorporates custom CSS variables for theming (light/dark mode) and uses Inter for UI text and JetBrains Mono for monospace data.
- **State Management**: TanStack Query (React Query) for server state and caching; no global state library.
- **Authentication**: Session-based authentication via cookies, auth state managed via `/api/user`, protected routes using `useAuth` hook. Supports local and Replit OAuth.

### Backend Architecture
- **Server**: Express.js with TypeScript.
- **Middleware**: JSON parsing, URL encoding, request logging, `express-session` with PostgreSQL store.
- **Authentication**: Passport.js for local strategy (bcrypt hashing), optional Replit OAuth (OpenID Connect). Sessions stored in PostgreSQL with 7-day TTL. `isAuthenticated` middleware for route protection.
- **API**: RESTful design (`/api` prefix), routes organized in `server/routes.ts` with role-based access control. `multer` for file uploads (in-memory). Webhook endpoint for Retell AI callbacks with signature verification.
- **Business Logic**: `RetellService` for Retell SDK interactions, `Storage` interface for database operations, promoting separation of concerns.

### Data Storage Architecture
- **Database**: PostgreSQL with Neon serverless driver, Drizzle ORM for type-safe queries and schema management.
- **Schema Design**: Core entities include `users`, `sessions`, `agents`, `phoneLists`, `phoneNumbers`, `campaigns`, `calls`, `callLogs`, and `webhookEvents`.
- **Relationships**: Users own agents, phone lists, and campaigns. Campaigns link agents and phone lists. Calls reference campaigns.
- **Indexing**: Primary keys on ID fields (UUIDs), indexes on foreign keys for performance, session expiration index.

### System Design Choices

#### **Retell AI Batch Calling Architecture (Current)**
The system now uses Retell AI's native **Batch Calling API** for all campaign execution, eliminating manual concurrency management:

- **Webhook-Driven Data Flow**: All call records (`calls` and `call_logs` tables) are created and updated exclusively through Retell webhooks, ensuring data integrity and real-time accuracy.
  - `call_started` webhook: Creates `Call` and `CallLog` records using metadata from batch tasks
  - `call_ended` webhook: Updates call status, duration, disconnection reason, and campaign statistics
  - `call_analyzed` webhook: Stores transcripts, recordings, AI analysis, and Cal.com verification results

- **Batch Call Metadata**: Each batch task includes comprehensive metadata (userId, campaignId, listId, phoneNumberId, agentId) passed to Retell, enabling webhooks to associate calls with campaigns and update tracking data correctly.

- **Campaign Batch Tracking**: The `campaigns` table includes:
  - `retellBatchId`: The Retell batch_call_id for tracking the batch in Retell's system
  - `batchStats`: JSON object with `total_task_count`, `scheduled_timestamp`, and `phone_numbers[]` array
  - Legacy fields (`concurrencyLimit`, `currentBatch`, `totalBatches`, `isRunning`) are deprecated but retained for backwards compatibility

- **Duplicate Prevention**: Campaigns with an existing `retellBatchId` cannot create a new batch, preventing accidental duplicate batch creation. Users must create a new campaign or wait for the current batch to complete.

- **Pause/Resume/Stop Limitations**: The Retell SDK v4.56.0 does not yet support canceling or pausing batch calls. Endpoints return HTTP 501 (Not Implemented) with clear messaging:
  - Pause: "Pause is not available for batch campaigns. Retell AI will complete all scheduled calls automatically."
  - Resume: "Resume is not needed for batch campaigns. Retell AI handles call scheduling automatically."
  - Stop/Cancel: "Cancel is not currently available for batch campaigns. The batch call will complete automatically."

- **Scalability**: No concurrency limits - Retell's queue management handles all call scheduling and execution automatically. The system can scale to thousands of calls per campaign without manual intervention.

- **Cost**: $0.005 per dial attempt with Retell Batch Calling API (Pay-As-You-Go pricing).

#### **Other System Features**
- **Smart Retry Logic**: Webhook determines retry eligibility based on `disconnection_reason`. Retriable reasons: `dial_failed`, `dial_no_answer`, `dial_busy`. Configurable retry limits (default: 3).
- **Contact Tracking**: `phone_numbers` table includes `contacted` and `lastContactedAt` fields to track which numbers have been successfully reached. Campaign initialization automatically filters out already-contacted numbers to prevent duplicate calls.
- **AI Lead Classification**: Two-column Phone Lists page with an "AI Lead Processor" using OpenAI's GPT-4o for name classification (Hispanic/Latino vs Non-Hispanic). Creates separate lists. Flexible CSV column matching and phone number normalization.
- **Appointments Page**: Displays all upcoming Cal.com bookings directly from the Cal.com API. Includes stat cards, search functionality, and detailed booking information.
- **Cal.com Re-verification**: Endpoints for re-verifying individual calls and bulk verifying all unverified appointments with Cal.com.

## External Dependencies

- **Retell AI**: `retell-sdk` package for voice AI, agent management, call operations, and webhook integration (with signature verification). API key via `RETELL_API_KEY`.
- **Neon Serverless PostgreSQL**: Database service, connected via `DATABASE_URL` environment variable, uses Drizzle Kit for migrations.
- **OpenAI**: Used for AI-powered lead classification (`classifyNames()` method) via the OpenAI API.
- **Cal.com**: API v2 integration (`CalcomService`) for appointment verification and synchronization. Uses `calcomApiKey` and `calcomEventTypeId` stored per-user.
- **Replit OAuth**: Optional authentication provider, enabled via `REPL_ID` and `ISSUER_URL`.
- **Google Fonts CDN**: For `Inter` and `JetBrains Mono` fonts.
- **Replit-specific Vite plugins**: `cartographer`, `dev-banner`, `runtime-error-modal` (development only).
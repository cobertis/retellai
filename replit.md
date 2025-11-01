# Retell AI Admin Dashboard

## Overview

This is a comprehensive admin dashboard for managing automated call campaigns using the Retell AI service. The application enables users to create AI-powered voice agents, upload phone lists, launch call campaigns, and track call performance with detailed analytics. Built as a full-stack TypeScript application, it features a React frontend with shadcn/ui components and an Express backend with PostgreSQL database storage.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture

**Framework & Build Tools**
- React with TypeScript for type-safe component development
- Vite as the build tool and development server with HMR (Hot Module Replacement)
- Wouter for lightweight client-side routing instead of React Router

**UI Component System**
- shadcn/ui component library based on Radix UI primitives (configured in `components.json`)
- Tailwind CSS for styling with custom design tokens following the "new-york" style
- Design system inspired by Linear, Stripe Dashboard, and Vercel Dashboard focusing on data clarity
- Custom CSS variables for theming (light/dark mode support) with hover/active elevation effects
- Typography: Inter font for UI, JetBrains Mono for monospace data (call IDs, phone numbers)

**State Management**
- TanStack Query (React Query) for server state management and caching
- Custom query client configuration with automatic error handling and 401 detection
- No global state library - leveraging React Query for data synchronization

**Authentication Flow**
- Session-based authentication using cookies (httpOnly, secure in production)
- Auth state managed through `/api/user` endpoint query
- Protected routes via `useAuth` hook checking authentication status
- Support for both local authentication (email/password) and Replit OAuth

### Backend Architecture

**Server Framework**
- Express.js server with TypeScript
- Middleware chain: JSON parsing with raw body preservation, URL encoding, request logging
- Session management using express-session with PostgreSQL store (connect-pg-simple)

**Authentication System**
- Dual authentication support:
  1. Local strategy using Passport.js with bcrypt password hashing
  2. Replit OAuth integration using OpenID Connect (configured but optional)
- Session storage in PostgreSQL with 7-day TTL
- `isAuthenticated` middleware for protecting API routes

**API Structure**
- RESTful API design with `/api` prefix for all endpoints
- Route organization in `server/routes.ts` with role-based access control
- File upload handling via multer (in-memory storage for CSV processing)
- Webhook endpoint for Retell AI callbacks (signature verification using raw body)

**Business Logic Layer**
- `RetellService` class wrapping the Retell SDK for external API calls
- `Storage` interface abstracting all database operations
- Separation of concerns: routes handle HTTP, services handle business logic, storage handles persistence

### Data Storage Architecture

**Database System**
- PostgreSQL with Neon serverless driver for connection pooling
- Drizzle ORM for type-safe database queries and schema management
- WebSocket support for Neon's serverless capabilities

**Schema Design** (from `shared/schema.ts`)

Core entities:
- `users`: Local authentication with bcrypt-hashed passwords, profile information, default agent configuration, and Cal.com API credentials (calcomApiKey, calcomEventTypeId)
- `sessions`: PostgreSQL-backed session store for express-session
- `agents`: Retell AI agent configurations (voice settings, prompts, LLM parameters)
- `phoneLists`: Collections of phone numbers with metadata and classification
- `phoneNumbers`: Individual phone entries linked to lists
- `campaigns`: Call campaigns linking agents to phone lists
- `calls`: Individual call records with status, duration, cost, and metadata
- `callLogs`: Detailed call transcripts and interaction logs
- `webhookEvents`: Audit trail of all Retell webhook callbacks

**Relationships**
- Users own agents, phone lists, and campaigns (via `userId` foreign keys)
- Campaigns reference both agents and phone lists
- Calls reference campaigns and store Retell call IDs for lookup
- Call logs are one-to-one with calls for detailed information storage

**Indexing Strategy**
- Primary keys on all ID fields (UUID generation via `gen_random_uuid()`)
- Indexes on foreign keys for join performance
- Session expiration index for cleanup queries

### External Dependencies

**Retell AI Integration**
- Primary service: Retell SDK (`retell-sdk` package) for voice AI capabilities
- Agent management: Create, retrieve, update, delete AI voice agents
- Call operations: Initiate outbound calls, retrieve call details
- Webhook integration: Receive real-time call events (call-started, call-ended, call-analyzed)
- Webhook security: Raw body signature verification for authenticated callbacks
- API key authentication via environment variable `RETELL_API_KEY`

**Database Service**
- Neon Serverless PostgreSQL
- Connection string via `DATABASE_URL` environment variable
- WebSocket connection for serverless architecture
- Migration management via Drizzle Kit (`drizzle-kit push`)

**Authentication Providers**
1. Local authentication (always available)
2. Replit OAuth (optional, enabled when `REPL_ID` environment variable is present)
   - OpenID Connect discovery
   - Token refresh mechanism
   - User claims stored in session

**Environment Variables Required**
- `DATABASE_URL`: PostgreSQL connection string
- `SESSION_SECRET`: Session encryption key
- `RETELL_API_KEY`: Retell AI service authentication
- `REPL_ID`: (Optional) Replit workspace identifier
- `ISSUER_URL`: (Optional) OAuth issuer for Replit auth
- `NODE_ENV`: Environment indicator (development/production)

**Frontend Asset Loading**
- Google Fonts CDN: Inter and JetBrains Mono font families
- Favicon served from `/public` directory

**Cal.com Integration** (Implemented)
- Cal.com API v2 integration for automatic appointment verification
- Per-user Cal.com credentials stored in `users` table (`calcomApiKey`, `calcomEventTypeId`)
- Settings page allows users to configure Cal.com API credentials
- Automatic appointment verification against Cal.com bookings in webhook flow
- Supports adding, updating, and clearing Cal.com credentials (null values properly handled)
- CalcomService class handles all Cal.com API interactions
- Verifies appointments by phone number matching
- Displays verification status in calls table and call detail page

**Development Tools**
- Replit-specific Vite plugins (cartographer, dev-banner, runtime-error-modal)
- Only loaded in development when `REPL_ID` is present
- Source maps via `@jridgewell/trace-mapping`

## Recent Changes (November 1, 2025)

### Cal.com Integration - Complete Implementation
**Phase 1: Settings Infrastructure**
- Added `calcomApiKey` and `calcomEventTypeId` fields to `users` table for per-user Cal.com configuration
- Implemented Settings page (`/settings`) with dedicated Cal.com Integration section
- Backend API route (`PATCH /api/user/settings`) now supports updating Cal.com credentials
- Proper null handling: Users can add, update, and clear Cal.com credentials
- Settings page includes sections for:
  - Profile Information (read-only)
  - Retell AI Agent configuration
  - Cal.com Integration (API Key and Event Type ID)
  - API Configuration (Retell webhook URL)
  - Account management (logout)
- Multi-tenant ready: Each user has their own Cal.com credentials

**Phase 2: Cal.com API Integration**
- Created `CalcomService` class for interacting with Cal.com API v2
- **UPDATED LOGIC (Nov 1, 2025)**: Simplified verification to show ALL future appointments
  - Previous logic was too strict, missing legitimate appointments
  - Now searches for ALL future appointments from current time (not call time)
  - Shows the earliest upcoming appointment for the phone number
  - Indicates total count if multiple appointments exist
  - Removed temporal creation checks that caused false negatives
- Service supports:
  - Fetching bookings filtered by event type with date range
  - Finding bookings by phone number
  - Verifying appointments with detailed status and explanatory messages
- Automatic integration in `call_analyzed` webhook:
  - When ChatGPT detects an appointment, automatically verifies with Cal.com
  - Only runs if user has Cal.com credentials configured
  - Searches from NOW to +30 days in the future
  - Stores verification results in `aiAnalysis.calcomVerification`

**Phase 3: UI Enhancements**
- Updated Calls table to display Cal.com verification status:
  - Shows "Cita Agendada" badge for scheduled appointments
  - Additional badge: "✓ Cal.com Verified" (blue) or "⚠ Not in Cal.com" (yellow)
- Enhanced Call Detail page with comprehensive Cal.com verification section:
  - Customer name display
  - Appointment status with details
  - Cal.com verification panel showing:
    - Verification status (verified/not found)
    - Verification timestamp
    - Full booking details (start time, end time, booking ID)
    - Detailed message about verification result

**Technical Details**
- Cal.com API v2 endpoint: `https://api.cal.com/v2/bookings`
- Authentication: Bearer token with API key
- Booking fields used: `id`, `uid`, `title`, `start`, `end`, `createdAt`, `updatedAt`, `status`, `attendees`
- Phone number matching: Normalized comparison handling various formats
- Temporal validation: 
  - Search window: [callTime, callTime + 7 days]
  - Creation validation: booking.createdAt >= callTime - 1 hour
  - Tolerance: 1 hour for clock skew and timezone variations
- Error handling: Graceful fallback if Cal.com API is unavailable
- Ambiguity handling: Returns `verified: false` with explanatory message when:
  - Multiple bookings found (cannot determine which was just scheduled)
  - Booking created before call time (pre-existing appointment)
  - No future bookings found within window
- Architecture: Service-based design following existing patterns (RetellService, OpenAIService)
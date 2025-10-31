# Design Guidelines: Retell AI Admin Dashboard

## Design Approach

**Selected Approach:** Design System with Modern Dashboard References

**Primary References:** Linear (data clarity, modern UI), Stripe Dashboard (data visualization excellence), Vercel Dashboard (clean information architecture)

**Design Principles:**
- Information clarity over visual embellishment
- Efficient data scanning and task completion
- Professional, trustworthy aesthetic
- Consistent, predictable patterns throughout

## Core Design Elements

### A. Typography

**Font Family:**
- Primary: Inter (via Google Fonts CDN)
- Monospace: JetBrains Mono (for call IDs, phone numbers, timestamps)

**Type Scale:**
- Page Titles: text-2xl (24px), font-semibold
- Section Headers: text-lg (18px), font-semibold
- Card/Panel Titles: text-base (16px), font-medium
- Body Text: text-sm (14px), font-normal
- Small Text/Labels: text-xs (12px), font-medium
- Table Headers: text-xs (12px), font-semibold, uppercase, letter-spacing tight
- Metrics/Numbers: text-3xl (30px), font-bold for hero stats; text-xl (20px) for cards

### B. Layout System

**Spacing Primitives:** Use Tailwind units of 2, 4, 6, and 8 consistently
- Component padding: p-4, p-6
- Section spacing: space-y-6, gap-4
- Card margins: m-4
- Page containers: px-6, py-8

**Grid System:**
- Dashboard stats: grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4
- Data views: Two-column with sidebar: grid-cols-1 lg:grid-cols-[280px_1fr]
- Form layouts: max-w-2xl for focused data entry

**Container Widths:**
- Main content: max-w-7xl mx-auto
- Forms/Detail views: max-w-4xl
- Modals: max-w-2xl

### C. Component Library

**Navigation:**
- Fixed sidebar (280px width on desktop, collapsible on mobile)
- Navigation items: py-2 px-4, with icon + label
- Active state: subtle background treatment, bold text
- Top bar: h-16, includes breadcrumbs, user menu, notification bell

**Data Tables:**
- Zebra striping for row differentiation
- Sticky headers with shadow on scroll
- Row hover states for interactivity
- Compact spacing (py-3 px-4 cells)
- Action buttons: right-aligned, icon-only with tooltips
- Sorting indicators on sortable columns
- Pagination controls: simple prev/next with page numbers

**Cards/Panels:**
- Border treatment with subtle shadow
- Padding: p-6
- Header with title + optional actions (right-aligned)
- Dividers between sections within cards

**Status Indicators:**
- Pills/Badges: rounded-full px-3 py-1 text-xs font-medium
- Call status colors: green (completed), blue (in-progress), gray (queued), red (failed)
- Dot indicators for real-time status (8px circle)

**Forms:**
- Label above input pattern
- Input fields: h-10, px-4, border, rounded-md
- Helper text: text-xs, positioned below input
- Error states: red border + error message
- Multi-step forms: progress indicator at top
- File upload: drag-and-drop zone with clear visual feedback

**Buttons:**
- Primary: h-10 px-6, font-medium
- Secondary: h-10 px-6, border treatment
- Small: h-8 px-4, text-sm
- Icon buttons: w-10 h-10, square
- Disabled states: reduced opacity

**Charts & Visualizations:**
- Use Chart.js or Recharts library
- Consistent color palette for data series
- Clear axis labels and legends
- Tooltips on hover
- Responsive sizing

**Modals/Dialogs:**
- Overlay with backdrop blur
- Modal content: max-w-2xl, p-6
- Header with title + close button
- Footer with action buttons (right-aligned)

**Empty States:**
- Centered icon (96px)
- Title + description
- Primary action button
- Appears when no data in tables/lists

**Loading States:**
- Skeleton screens for tables (shimmer effect)
- Spinner for async actions
- Progress bars for file uploads/batch operations

**Toast Notifications:**
- Top-right positioning
- Auto-dismiss after 5 seconds
- Success, error, info, warning variants
- Action button support

### D. Dashboard-Specific Patterns

**Overview Dashboard:**
- Hero metrics: 4-column grid of stat cards
- Each card: large number (text-3xl), label, trend indicator (+/- percentage), sparkline chart
- Recent activity feed: chronological list with timestamps
- Quick actions: prominent CTAs for common tasks (Start Campaign, Upload List)

**Call Management:**
- Master-detail view: list on left, details panel on right
- Real-time status updates (WebSocket integration)
- Bulk actions toolbar when rows selected
- Filter sidebar with common filters (status, date range, agent)

**Analytics Dashboard:**
- Date range picker: top-right position
- Multi-metric cards showing KPIs
- Line charts for trends over time
- Comparison views (current vs. previous period)
- Export button for reports

**Phone Number Management:**
- Categorized lists with tags
- Bulk edit functionality
- Search and filter toolbar
- Classification badges visible in list view

**Call Detail View:**
- Tabbed interface: Overview, Transcript, Recording, Analytics
- Timeline of call events
- Audio player for recordings (with waveform if possible)
- Downloadable transcript and recording links
- Related metadata in sidebar

## Accessibility & Interactions

- Focus indicators: 2px outline on all interactive elements
- Keyboard navigation: logical tab order, skip links
- ARIA labels for icon-only buttons
- Sufficient contrast ratios (WCAG AA minimum)
- Form validation: inline error messages with icon
- Responsive breakpoints: mobile (<768px), tablet (768px-1024px), desktop (>1024px)

## Animation

Use sparingly and purposefully:
- Page transitions: none (instant navigation)
- Data loading: fade-in only
- Toasts: slide-in from top-right
- Modals: subtle fade + scale (duration-200)
- Avoid: hover animations, decorative transitions

## Icons

Use Heroicons (outline style) via CDN for consistency:
- Navigation icons: 20px
- Action buttons: 16px
- Status indicators: 16px
- Empty states: 96px
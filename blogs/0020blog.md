# Public Gallery: Showcase AI-Designed Hardware

**Date:** 2026-01-05

---

## The Goal

Create a public gallery page that showcases completed PHAESTUS projects without requiring authentication, allowing visitors to browse and learn about AI-designed hardware before signing up.

---

## The Problem

For the Gemini 3 hackathon submission:
1. Requiring login to see any content creates a barrier to entry
2. Judges need to see the product without creating accounts
3. The hackathon rules suggest avoiding paywalls and login requirements where possible

But we also can't expose the creation pipeline (which uses API credits) to unauthenticated users.

---

## The Solution

### Public Gallery API

New endpoints at `/api/gallery` that don't require authentication:

```typescript
// functions/api/gallery/index.ts
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { env } = context

  // Get completed projects - no auth required
  const result = await env.DB.prepare(`
    SELECT
      p.id, p.name, p.description, p.status, p.spec,
      p.created_at, p.updated_at,
      u.username as author_username
    FROM projects p
    JOIN users u ON p.user_id = u.id
    WHERE p.status = 'complete'
    ORDER BY p.updated_at DESC
    LIMIT ? OFFSET ?
  `).bind(limit, offset).all()

  // Extract safe fields (summary, thumbnail)
  const projects = result.results.map(row => ({
    id: row.id,
    name: row.name,
    thumbnailUrl: extractThumbnail(row.spec),
    specSummary: extractSummary(row.spec),
    authorUsername: row.author_username,
  }))

  return Response.json({ projects, total })
}
```

### Detail Page with Safe Fields

Individual project view exposes only public-safe information:

```typescript
// functions/api/gallery/[id].ts
const project = {
  id: result.id,
  name: result.name,
  authorUsername: result.author_username,
  spec: spec ? {
    // Only expose safe fields
    finalSpec: spec.finalSpec,
    blueprints: spec.blueprints,
    feasibility: {
      overallScore: spec.feasibility.overallScore,
      communication: spec.feasibility.communication,
      // ... other public fields
    },
    pcb: {
      boardSize: spec.pcb.boardSize,
      placedBlocks: spec.pcb.placedBlocks,
    },
    enclosure: {
      style: spec.enclosure.style,
    },
    firmware: {
      language: spec.firmware.language,
      files: spec.firmware.files?.map(f => ({ path: f.path })),
    },
  } : null,
}
```

### Middleware Update

Added `/api/gallery` to public routes:

```typescript
// functions/api/_middleware.ts
const PUBLIC_ROUTES = [
  '/api/auth/login',
  '/api/auth/logout',
  '/api/auth/me',
  '/api/blocks',
  '/api/images',
  '/api/gallery',  // NEW: Public gallery access
]
```

### Gallery Page Component

Responsive grid with search, thumbnails, and metadata:

```tsx
// src/pages/GalleryPage.tsx
export function GalleryPage() {
  const [searchQuery, setSearchQuery] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['gallery'],
    queryFn: () => fetchGalleryProjects(50, 0),
  })

  const filteredProjects = data?.projects.filter(
    project =>
      project.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      project.authorUsername.toLowerCase().includes(searchQuery.toLowerCase())
  )

  return (
    <div className="min-h-screen bg-ash">
      {/* Header */}
      <header className="sticky top-0 bg-surface-900/50 backdrop-blur-sm">
        <Link to="/">PHAESTUS</Link>
        <Link to="/login">Sign In to Create</Link>
      </header>

      {/* Hero with stats */}
      <div className="bg-surface-900">
        <h2>Hardware Designs by AI</h2>
        <p>Browse projects created with PHAESTUS</p>
        <Stats total={data?.total} />
      </div>

      {/* Search + Grid */}
      <main>
        <SearchInput value={searchQuery} onChange={setSearchQuery} />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredProjects?.map(project => (
            <ProjectCard key={project.id} project={project} />
          ))}
        </div>
      </main>
    </div>
  )
}
```

### Project Card with Hover Effects

```tsx
function ProjectCard({ project }: { project: GalleryProject }) {
  return (
    <Link to={`/gallery/${project.id}`} className="group">
      {/* Thumbnail */}
      <div className="aspect-video relative overflow-hidden">
        {project.thumbnailUrl ? (
          <img
            src={project.thumbnailUrl}
            className="group-hover:scale-105 transition-transform"
          />
        ) : (
          <ImageIcon className="text-surface-600" />
        )}
        {/* Overlay on hover */}
        <div className="absolute inset-0 opacity-0 group-hover:opacity-100">
          View Project <ChevronRight />
        </div>
      </div>

      {/* Content */}
      <h3>{project.name}</h3>
      <p>{project.specSummary || project.description}</p>
      <div className="flex items-center gap-4">
        <User /> {project.authorUsername}
        <Calendar /> {formatDate(project.createdAt)}
      </div>
    </Link>
  )
}
```

### Router Integration

Gallery routes are public - accessible without authentication:

```tsx
// src/App.tsx
function AppContent() {
  const { isAuthenticated, isLoading } = useAuthStore()
  const location = useLocation()

  // Public routes that don't require authentication
  const isPublicRoute = location.pathname.startsWith('/gallery')

  // Handle public routes regardless of auth state
  if (isPublicRoute) {
    return (
      <Routes>
        <Route path="/gallery" element={<GalleryPage />} />
        <Route path="/gallery/:id" element={<GalleryDetailPage />} />
      </Routes>
    )
  }

  if (!isAuthenticated) {
    return <LandingPage />
  }

  return <AuthenticatedApp />
}
```

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  Public Access (No Auth)                                        │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │ /gallery                     /gallery/:id                  ││
│  │ ┌─────────┐ ┌─────────┐     ┌──────────────────────────┐   ││
│  │ │Project 1│ │Project 2│     │ Full Detail View         │   ││
│  │ │ [thumb] │ │ [thumb] │     │ - Spec summary           │   ││
│  │ │ summary │ │ summary │     │ - Feasibility score      │   ││
│  │ └─────────┘ └─────────┘     │ - PCB blocks             │   ││
│  │                              │ - Enclosure style        │   ││
│  │                              │ - Firmware files         │   ││
│  │                              │ - Blueprints             │   ││
│  │                              └──────────────────────────┘   ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                  │
│  Authenticated Access (Login Required)                           │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │ /new         /project/:id     /project/:id/pcb ...         ││
│  │ Create       Workspace        Full Pipeline                 ││
│  │ Project      Edit Spec        AI Generation                 ││
│  └─────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
```

---

## Key Decisions

### Why Separate Public Routes?

- **Clear boundary**: Gallery is read-only, no API usage
- **Simple auth check**: `location.pathname.startsWith('/gallery')`
- **SEO friendly**: Public pages can be indexed
- **Hackathon friendly**: Judges can browse without login

### Why Limit Exposed Fields?

Some spec data shouldn't be public:
- User's original prompt (privacy)
- Full firmware code (IP protection)
- Detailed error logs (security)

We expose enough to showcase the design without revealing sensitive details.

### Why Client-Side Search?

- Projects are already loaded for the grid
- No additional API calls needed
- Instant results as user types
- Can expand to server-side later if needed

---

## Files Changed

```
frontend/
├── functions/api/
│   ├── _middleware.ts           # MOD: Added /api/gallery to PUBLIC_ROUTES
│   └── gallery/
│       ├── index.ts             # NEW: List completed projects
│       └── [id].ts              # NEW: Get project detail
├── src/
│   ├── App.tsx                  # MOD: Added public gallery routes
│   └── pages/
│       ├── GalleryPage.tsx      # NEW: Project grid with search
│       └── GalleryDetailPage.tsx # NEW: Full project view
└── blogs/
    └── 0020blog.md              # NEW: This blog post
```

---

## What's Next

1. Add link to gallery from landing page
2. Add "featured" flag for hand-picked projects
3. Add project count badge on landing page
4. Consider RSS feed for new projects

---

## Summary

| Feature | Implementation |
|---------|----------------|
| Public API | `/api/gallery` and `/api/gallery/:id` |
| No auth required | Added to middleware PUBLIC_ROUTES |
| Safe field exposure | Only public-safe spec data |
| Search | Client-side filter on name/author |
| Responsive grid | 1/2/3 columns based on viewport |
| CTA integration | "Sign In to Create" links throughout |

The gallery provides a showcase for PHAESTUS designs while keeping the creation pipeline behind authentication, satisfying both hackathon requirements and API cost protection.

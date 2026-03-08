# Agent Instructions — Money Blocks Portal

## Before Touching Code

1. **Read `README.md`** for project architecture and setup.
2. **Read `docs/portal-ui-guidelines.md`** if it exists for the design system.
3. **Never modify business logic, trading logic, API contracts, websocket behavior, or permission systems** unless explicitly required to fix a bug.
4. **Small JS changes are allowed** only for: UI presentation, responsive navigation, accessibility, and layout state management.

## Known Pitfalls

### The `inert` Attribute Bug (March 2026)
The `bindMobileNav()` function in `public/js/ui.js` manages the sidebar's mobile drawer state. A previous version unconditionally set `inert` on the sidebar whenever it lacked `.is-open`, which broke desktop navigation entirely. The fix gates `inert`/`aria-hidden` behind a mobile viewport check (`<= 768px`).

**Rule:** Never apply `inert` or `aria-hidden` to the sidebar on desktop viewports. The sidebar is always visible and interactive on desktop via CSS Grid.

### Page Spacing System
The `.main` container padding and `.top-bar` negative margin bleed are synchronized via the `--page-padding` CSS custom property. **Never hardcode padding values on `.main` or negative margins on `.top-bar`**—always override `--page-padding` inside the appropriate media query.

| Breakpoint | `--page-padding` |
|:---|:---|
| Desktop (default) | `1.8rem` |
| ≤ 768px (tablet/mobile) | `1.25rem` |
| ≤ 640px (small mobile) | `1rem` |

### Responsive Breakpoints
- **`1024px`**: Compact sidebar (icon-rail with abbreviated labels).
- **`768px`**: Sidebar becomes a fixed off-canvas drawer; hamburger toggle required.
- **`640px`**: Cards/grids reduce padding and stack to single column.

### Selector Safety
Before changing any HTML markup, ensure all IDs, classes, and `data-*` attributes relied on by JavaScript are preserved. Key elements:
- `#mobileNavToggle` — hamburger menu button (must exist in every authenticated page)
- `.sidebar`, `.nav-link`, `.brand` — sidebar elements
- `#logoutBtn`, `#ws-status`, `#managerLink` — shell controls
- `#scenarios-badge` — notification badge
- `.is-open` — mobile drawer state class

### Chart Constraints
- **Never** wrap `#tv-chart` with `overflow: hidden`.
- Preserve the chart mount node's DOM path exactly.

## File Overview

| Path | Purpose |
|:---|:---|
| `public/styles.css` | All CSS — tokens, shell, components, pages, responsive |
| `public/js/ui.js` | Shared UI utilities (formatters, auth, mobile nav) |
| `public/js/ws-manager.js` | WebSocket connection manager |
| `public/js/notifications.js` | Badge/notification polling |
| `public/*.html` | Page templates (multi-page app, not SPA) |
| `public/*.js` | Page-specific scripts |
| `public/index.php` | Front controller for clean URL routing |
| `public/.htaccess` | Apache rewrite rules for clean URLs |

## Testing Checklist

After every UI change:
1. Verify sidebar links work on desktop (no `inert` leak).
2. Verify mobile drawer opens/closes.
3. Check browser console for JS errors.
4. Test at 1440px, 800px, 400px widths.
5. Verify `.top-bar` is flush with edges at all breakpoints.
6. Verify tables scroll horizontally on mobile without page-level overflow.

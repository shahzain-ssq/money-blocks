# Money Blocks UI And Flow Guardrails

## Shared shell

- Every authenticated page should use the shared sidebar/top-bar shell and the helpers in `public/js/ui.js`.
- Authenticated pages should call `requireUser()` instead of duplicating inline `/api/auth_me.php` checks.
- Logout must go through `DELETE /api/auth_login.php`; redirect-only logout is not valid because it leaves the session alive.
- Live websocket state should be rendered through `updateWsStatus()` so copy, color, and reconnect states stay consistent.

## API response expectations

- `/api/auth_me.php` returns `{ user: null | sanitizedUser }`.
- `/api/portfolio.php` returns:
  - `portfolio`: current cash row
  - `positions`: open long positions with `current_price`, `position_value`, and `unrealized_pl`
  - `shorts`: open short positions with `current_price` and `pl`
  - `totals.portfolio_value`: portfolio equity, not just invested capital
  - `totals.long_value`, `totals.short_exposure`, `totals.net_exposure`, `totals.unrealized`
- `/api/stocks.php` returns active stocks only, with `current_price`, `previous_price`, `change`, `change_pct`, and the effective `updated_at` for the latest price.
- `/api/scenarios.php` returns only live scenarios:
  - `status = published`
  - `starts_at` must be null or in the past
  - `ends_at` must be null or in the future

## Trading flow rules

- Long buys must enforce:
  - positive quantity
  - sufficient cash
  - `per_user_limit`
  - `total_limit`
  - active stock status
- Short opens must enforce:
  - positive quantity
  - valid duration from configured options or default duration set
  - `per_user_short_limit`
  - active stock status
- Participant deletion must delete dependent rows in the correct order:
  - `scenario_reads`
  - `sessions`
  - portfolio `trades`
  - portfolio `positions`
  - portfolio `short_positions`
  - `portfolios`
  - `users`

## Responsive breakpoints

- `<= 1180px`: chart and trade two-column layouts collapse into one column.
- `<= 900px`: sidebar becomes a horizontal top nav and main content padding tightens.
- `<= 640px`: tables must be horizontally scrollable, cards tighten, and chart minimum height drops.

## Common pitfalls

- Do not use `innerHTML` with stock, scenario, participant, or instrument names unless values are escaped.
- Do not compute "portfolio value" as only long market value; the UI expects equity.
- Do not show future or expired scenarios in participant-facing feeds.
- Do not silently allow arbitrary short durations that the UI never offered.

## Manual QA checklist

- Login:
  - standard login shows inline validation and institution selection errors
  - SSO modal opens, searches, and redirects correctly
- Dashboard:
  - metrics, long positions, shorts, market cards, and scenarios render without overflow on desktop and mobile
- Trade:
  - query-string prefill works for `ticker` and `action`
  - buy, sell, short open, and short close all disable invalid submissions before POST
  - success and failure states remain visible inline after submission
- Activity:
  - empty state renders cleanly
  - notional and badges match trade types
- Scenarios:
  - unread count matches the badge
  - mark-read and mark-unread both work
- Admin:
  - create participant returns temp password
  - promote, reset password, edit stock, edit scenario, and delete participant all complete without 500s

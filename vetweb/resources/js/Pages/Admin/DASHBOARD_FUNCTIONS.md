# Admin Dashboard — what each function uses

This file explains the Admin Dashboard charts and helpers: which library draws each chart, what `.map()` is doing, and where the line on the appointments chart comes from.

## Where the files are

| What | Path |
| --- | --- |
| Dashboard page (charts, calendar, helpers) | `vetweb/resources/js/Pages/Admin/Dashboard.jsx` |
| Chart data (counts, series, colors) | `vetweb/app/Http/Controllers/Admin/AuthController.php` |
| Route that opens the dashboard | `vetweb/routes/web.php` → `GET /admin/dashboard` (`admin.dashboard`) |
| Chart library | `recharts` in `vetweb/package.json` (`recharts` ^3.9.2) |
| Page data from Laravel to React | Inertia (`Inertia::render('Admin/Dashboard', ...)`) |

The browser page is `/admin/dashboard`. Laravel method `dashboard()` in `AuthController` builds `stats`, `registrationFee`, and `charts`, then renders `Admin/Dashboard`.

---

## Libraries used on the page

Imported at the top of `Dashboard.jsx`:

| Import | From | Used for |
| --- | --- | --- |
| `Link`, `router`, `useForm`, `usePage` | `@inertiajs/react` | Links, form for the registration fee, flash messages |
| `useState`, `useEffect`, `useMemo` | `react` | Local state, loading unavailable dates, cached chart numbers |
| `Sidebar` | `@/Components/Admin/Sidebar` | Left menu |
| `AdminHeaderToolbar` | `@/Components/Admin/AdminHeaderToolbar` | Top toolbar |
| `axios` | `axios` | Save and delete vet unavailable dates |
| `Holidays` | `date-holidays` | Philippine holidays on the calendar (`new Holidays('PH')`) |
| Chart components below | `recharts` | Every graph in the Analytics section |

Recharts pieces imported:

- `ResponsiveContainer` — makes the chart fill its box
- `BarChart`, `Bar` — bar graphs
- `AreaChart`, `Area` — the appointments trend (filled area **and** the line)
- `PieChart`, `Pie`, `Cell` — donut charts
- `XAxis`, `YAxis` — the scales
- `CartesianGrid` — the faint grid lines
- `Tooltip` — hover box
- `Legend` — color key under the donuts
- `Label`, `LabelList` — axis title and the percent text on each bar or point

There is **no** `Line` or `LineChart` import. The appointments “line” is the stroke of an `Area`.

---

## `.map()` — what it is and where it runs

`.map()` walks a list and returns a new list of the same length. It does not draw the chart by itself. It only prepares data or one React element per item.

### In `Dashboard.jsx`

1. `withPercentLabel` (around line 115)

```js
items.map((item) => ({
    ...item,
    percentLabel: formatPercent(item[valueKey], total),
}))
```

Each row keeps its original fields and gains `percentLabel` (example: `"42%"`). That string is what `LabelList` prints on the bars and on the appointments area.

Used for:

- `barangayChartData`
- `appointmentChartData`
- `revenueChartData`
- `clientRegChartData`

Those four are wrapped in `useMemo` so the new list is rebuilt only when the source data or the total changes.

2. Max value for the axis (example around line 463)

```js
clientsByBarangay.map((item) => Number(item.count) || 0)
```

Same pattern for appointments, revenue, and new clients. The numbers go into `Math.max(...)`, then `chartAxisMax` adds about 5% headroom so bars do not touch the top of the chart.

3. Donut slice colors

```jsx
appointmentStatus.map((entry) => (
    <Cell key={entry.status} fill={entry.color} />
))
```

```jsx
petSpecies.map((entry) => (
    <Cell key={entry.name} fill={entry.color} />
))
```

One `Cell` per slice. `fill` is the color that PHP already attached to that row.

4. Calendar (not a chart)

- `weekDays.map` — Sun–Sat headers
- `generateCalendarDays().map` — one cell per date
- legend colors `.map`
- `unavailableDates.map` — blocked dates list
- `conflictingAppointments.map` — appointments that clash with a blocked day

### In `AuthController.php` (the data before it reaches React)

`buildAdminDashboardCharts()`:

- Laravel collection `->map(...)` on barangays → `{ name, short_name, count }`
- Laravel collection `->map(...)` on appointment statuses → `{ status, label, count, color }`
- Laravel collection `->map(...)` on species → `{ name, count }`
- PHP `array_map(...)` then adds a color from `$speciesColors` by index

`buildMonthlyDashboardSeries()` does **not** use `map`. It uses a `for` loop for the last 6 months and pushes `{ label, full_label, month, value }`.

---

## The line (appointments chart)

Chart: **Monthly appointments**

Component: `AreaChart` + `Area` (not `LineChart`).

```jsx
<Area
    type="monotone"
    dataKey="value"
    stroke="#1F7A8C"
    fill="url(#appointmentGradient)"
    strokeWidth={2}
>
```

| Prop | What it does |
| --- | --- |
| `type="monotone"` | Smooth curve through the monthly points |
| `dataKey="value"` | Reads `value` from each month |
| `stroke="#1F7A8C"` | The teal **line** |
| `strokeWidth={2}` | Line thickness |
| `fill="url(#appointmentGradient)"` | Soft fill under the line |

The gradient is an SVG `<linearGradient id="appointmentGradient">` with two `<stop>` tags (25% teal at the top, transparent at the bottom).

Grid behind it: `CartesianGrid` with `strokeDasharray="3 3"` (dashed lines) and `vertical={false}` so only horizontal lines show.

Percent text above each point: `LabelList` with `dataKey="percentLabel"` and `position="top"`.

---

## Other lines on the page (not chart series)

| Kind | Where | What draws it |
| --- | --- | --- |
| Chart grid | `CartesianGrid` | Recharts. `stroke="#e2e8f0"`, `strokeDasharray="3 3"` |
| Donut label connectors | `labelLine={false}` on `Pie` | Turned **off**. Percents sit inside the ring via `renderPieInsideLabel` |
| Card / panel borders | Tailwind `border-line` | CSS border, not a chart line |
| Icons | `<path stroke="currentColor" ... />` | Heroicon-style SVG paths (check, calendar, warning). `strokeLinecap` and `strokeLinejoin` only round the icon strokes |

`renderPieInsideLabel` places the percent with plain math:

- `radius` = halfway between `innerRadius` and `outerRadius`
- `x` / `y` = `cx` / `cy` plus `radius * cos/sin` of the slice angle
- Slices under 5% (`percent < 0.05`) get no label so text does not overlap

---

## Each chart

All charts sit in a `ChartPanel` (title, subtitle, total on the right). If the series is empty, `ChartEmpty` replaces the graph.

| Chart | Recharts | Data prop from PHP | Color | Label |
| --- | --- | --- | --- | --- |
| Clients by barangay | `BarChart` `layout="vertical"` + `Bar` | `charts.clients_by_barangay` | `#1F7A8C` | `LabelList` `position="insideRight"` |
| Monthly appointments | `AreaChart` + `Area` | `charts.monthly_appointments` | stroke `#1F7A8C` | `LabelList` `position="top"` |
| Monthly revenue | `BarChart` + `Bar` | `charts.monthly_revenue` | `#059669` | `LabelList` `position="center"` |
| Appointment status | `PieChart` + `Pie` (donut) | `charts.appointment_status` | color per status from PHP | `renderPieInsideLabel` |
| Animal species | `PieChart` + `Pie` (donut) | `charts.pet_species` | color per species from PHP | `renderPieInsideLabel` |
| New client registrations | `BarChart` + `Bar` | `charts.monthly_client_registrations` | `#3C91E6` | `LabelList` `position="center"` |

Barangay chart details:

- Horizontal bars: `layout="vertical"`, `XAxis type="number"`, `YAxis type="category"` `dataKey="short_name"`
- Bar thickness: `barSize={16}`
- Rounded end: `radius={[0, 4, 4, 0]}`
- Height grows with the number of barangays: `clientsByBarangay.length * 28`, clamped between 260 and 480
- Bottom axis title: Recharts `Label` text `"Number of clients"`

Revenue and new-client bars are vertical. `radius={[4, 4, 0, 0]}` rounds the top. `maxBarSize={48}` caps width.

Donuts: `innerRadius={38}`, `outerRadius={68}`, `paddingAngle={2}`. `Legend` sits at the bottom.

---

## Helper functions in `Dashboard.jsx`

| Function | What it does |
| --- | --- |
| `formatCurrency` | `₱` plus `toLocaleString` (no decimals) |
| `formatNumber` | `toLocaleString` for counts |
| `sumSeries` | `.reduce` to add `value` or `count` |
| `formatPercent` | `Math.round((amount / whole) * 100)` plus `%`. Returns `0%` if total is 0 |
| `chartAxisMax` | `Math.ceil(max * 1.05)`. Returns `1` if max is 0 so the axis still draws |
| `withPercentLabel` | `.map` that adds `percentLabel` |
| `renderPieInsideLabel` | White percent text inside a donut slice |
| `StatCard` | Top number cards. Optional Inertia `Link` when `href` is set |
| `SectionCard` | Calendar / availability cards |
| `ChartPanel` | White chart frame with total |
| `ChartEmpty` | “No data yet” placeholder |
| `SuccessModal` | Popup after a fee update |

`sumSeries` is the only `.reduce` on this page. `.some` checks whether any point is above 0 (`hasBarangayData`, `hasAppointmentTrend`, `hasRevenueTrend`, `hasClientTrend`) so an all-zero series shows the empty message.

---

## PHP functions that feed the charts

File: `vetweb/app/Http/Controllers/Admin/AuthController.php`

| Method | Role |
| --- | --- |
| `dashboard()` | Counts for the stat cards, registration fee, then `charts` |
| `buildAdminDashboardCharts()` | Builds the six chart arrays |
| `buildMonthlyDashboardSeries($months, $counter)` | Last 6 months. `$counter` is a closure that returns that month’s number |

Series keys sent to React:

- `clients_by_barangay` — `Barangay` with `withCount` of users where `role = client`
- `monthly_appointments` — `Appointment` counted by `booking_date`
- `monthly_revenue` — `PetRegistration` where `status = paid`, sum of `amount` by `paid_at`
- `monthly_client_registrations` — `User` where `role = client`, counted by `created_at`
- `appointment_status` — `Appointment` grouped by `status`
- `pet_species` — `Animal` joined to `species`, top 8, `archived_at` is null

Each month object looks like:

```text
{ label: "Sep", full_label: "Sep 2026", month: "2026-09", value: 12 }
```

`label` is the short axis text. `full_label` is the tooltip title (`labelFormatter`).

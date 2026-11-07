# Resource Profiles

A resource profile is an hourly series that says how much a technology can produce at each
location: the sun for PV, the wind for wind turbines, or a published availability curve for
thermal plants. TEMPO can calculate these for you, so you don't have to prepare and upload a
time series by hand.

Profiles are a starting point for regions without measured data. Replace them with
measured series when you have them.

---

## What a resource profile is

When you apply a profile, TEMPO writes it into the model like any other time series:

- One file per technology, named `profile_<technology>.csv`, with a `datetime` column and one
  column per location. It appears in [Time Series](time-series.md).
- On each location that hosts the technology, `resource` is set to
  `file=profile_<technology>.csv:<column>`, with `resource_unit` set to `energy_per_cap`.

Because it is an ordinary time series, the profile is saved with the model and goes with
exports and runs. The recipe used to build it (settings, coordinates, weather year, model
dates) is stored with it, so TEMPO can tell later whether it still matches the model.

---

## Which technologies get which profile

TEMPO decides from the technology's name and parent type.

| Technology | Profile | Source | Applied as |
|---|---|---|---|
| PV (`pv`, photovoltaic) | Capacity factor per location | Open-Meteo ERA5 weather + pvlib | Forced |
| Wind | Capacity factor per location | Open-Meteo ERA5 weather + windpowerlib turbine curves | Forced |
| Nuclear, coal, CCGT, OCGT, SMR, gas turbine, biomass, biogas, waste, geothermal | Availability | opentech-db | Upper bound |
| Tidal, marine, run-of-river | Capacity factor | opentech-db | Forced |

"Forced" sets `force_resource: true`: the technology produces exactly what the profile
allows. "Upper bound" sets `force_resource: false`: the profile limits output, but the
optimiser may produce less.

Notes:

- Only `supply` and `supply_plus` technologies can take a profile. Storage, transmission,
  distribution and demand technologies get none.
- A profile-capable technology on a `conversion` or `conversion_plus` parent (CHP, for
  example) is recognised and shown, but its profile is not applied.
- Concentrated solar (CSP), reforming, methane, hydrogen and electrolysis technologies get
  no profile.
- opentech-db profiles need the technology to be linked to an opentech-db entry and the
  catalog to be reachable. Only full-year hourly profiles (8760 values, 8784 in a leap
  year) are offered. The dialog says when there is no link, no profile, or no connection.

The profile section is at the top of the technology editor (in Technologies and in the
technology dialog of a location). It shows the profile type and a status:

| Status | Meaning |
|---|---|
| **Not set** | No profile has been applied. The button reads **Calculate profile** |
| **Applied** | A profile is in the model and matches it. The button reads **Edit profile** |
| **Out of date** | A profile is in the model but no longer matches it. See [Keeping profiles up to date](#keeping-profiles-up-to-date) |

The method of the stored profile, when there is one, is shown after the status.

---

## Installing the Renewables component

PV and wind profiles, the atlas overlays and the wind flow all run in a local service. Install
it under Settings → Components as **Renewables profiles**. The only data that leaves your
computer is the weather and atlas requests listed under
[Data sources and licences](#data-sources-and-licences).

Wind profiles and the map overlays need packages that older installs of the component do not
have (windpowerlib and the raster tools). If you installed the component earlier for PV only,
reinstall it from Settings → Components. Until then, wind calculations and the overlays
report that the component is missing a package.

In a profile dialog, a status block shows the state of the service:

- **Install renewables component**, when it is not installed.
- **Start service**, when it is installed but not running.
- Outside the desktop app (browser dev mode), the dialogs say they need the TEMPO desktop app.

---

## Solar PV

Click **Calculate profile** (or **Edit profile**) in the PV technology's profile section. The
dialog has a map of the locations that host the technology, a table with one row per
location, the settings, and a chart of the selected point.

### Settings

These apply to the whole technology.

| Setting | Default | Allowed range | Notes |
|---|---|---|---|
| **Weather year** | Last full calendar year | 2000 to last full year | The ERA5 year used for the weather |
| **Tracking** | Fixed | Fixed, Single-axis | Defaults to Single-axis when the technology name contains "track" |
| **System losses % (excl. inverter)** | 10 | 0 to 50 | Soiling, wiring, mismatch and similar. The inverter loss is separate |
| **DC/AC ratio** | 1.2 | 0.5 to 2 | The inverter clips output above 1/ratio of the DC rating |
| **Temp. coefficient %/K** | −0.4 | −1 to 0 | Power change per degree of cell temperature |

The inverter efficiency is fixed at 96 %. With the default 10 % losses, the total is close to
the 14 % all-in loss that PVGIS assumes. Single-axis tracking uses a north-south axis, a
maximum rotation of 60° and backtracking with a ground coverage ratio of 0.35.

The result is a capacity factor per kWp of DC capacity.

### Tilt and azimuth

Each location has its own **Tilt °** and **Azimuth °** in the table. Azimuth is compass
degrees: 0 is north, 90 east, 180 south, 270 west.

The default faces the equator:

- Tilt = 0.76 × |latitude| + 3.1, rounded, capped at 60°.
- Azimuth = 180 in the northern hemisphere, 0 in the southern hemisphere.

With Single-axis tracking, tilt and azimuth are not used.

### Calculate

Click **Calculate**. TEMPO fetches the ERA5 weather for every location and runs pvlib. The
table then shows, for each point, the annual yield in **kWh/kWp**, the **Mean CF** and a
**Status**: `current` for a fresh result, `stored` for values saved in the model, or `—`.
Click a row to see its hourly profile.

After a first calculation, the button only recalculates what changed. It reads
**Recalculate N changed** when only some points need it, and **All points current** when
nothing does. A point is recalculated when its coordinates, tilt, azimuth or any
technology-level setting changed. Weather downloads are cached, so changing only the losses
or the tilt does not download again.

**Apply to model** is enabled when every point is current, every location has coordinates,
the model has dates, and no calculation is running. It writes the profile and closes the
dialog.

---

## Optimising tilt and azimuth

The **Optimise tilt & azimuth** panel finds, for every point at once, the orientation that
collects the most sunlight. It changes only the Tilt and Azimuth fields. Click
**Recalculate** afterwards to get the new profile.

Pick the period from the list next to the button:

| Period | Months used |
|---|---|
| **Whole year** | January to December |
| **Summer** | June to August in the northern hemisphere, December to February in the southern |
| **Winter** | December to February in the northern hemisphere, June to August in the southern |
| **Custom months** | The months you toggle (J F M A M J J A S O N D). At least one is needed |

Summer and winter follow each point's own hemisphere.

How it works: TEMPO maximises the sunlight on the tilted plane (plane-of-array energy) over
the chosen months, using the weather year of the dialog. It searches tilts from 0° to 90° in
5° steps and azimuths within ±60° of the equator-facing direction in 10° steps, then refines
around the best result (±5° of tilt in 1° steps, ±10° of azimuth in 2° steps). If the best
tilt is 0° (flat), the azimuth is set to the equator-facing direction.

The panel reports how many points were optimised and the mean gain compared with the
orientation they had before. If the current orientation is already the best, it is kept and
the gain is 0. Because the target is sunlight on the plane and not final kWh, the gain after
recalculating differs slightly.

The button is disabled, with the reason shown, when Tracking is Single-axis (trackers follow
the sun), the service is not running, a calculation is running, or no point has coordinates.

Example: for Santiago, Chile, the whole-year optimum is a tilt of 29° facing roughly north
(azimuth 4°), close to the default rule.

---

## Wind

Click **Calculate profile** in the wind technology's profile section.

### Settings

| Setting | Default | Allowed range |
|---|---|---|
| **Weather year** | Last full calendar year | 2000 to last full year |
| **Turbine** | Generic IEC II (medium wind) | See below |
| **Hub height m** | 100 | 10 to 250 |
| **Loss % (wake + availability)** | 12 | 0 to 50 |

If the technology name contains "offshore", the defaults are **Generic offshore 15 MW (IEA
ref.)** at a 150 m hub height. This is the only offshore detection: it looks at the name, not
at the location.

### Turbines

The **Turbine** list has two groups.

| Group | Turbines |
|---|---|
| **Generic** | Generic IEC I (high wind), Generic IEC II (medium wind), Generic IEC III (low wind), Generic offshore 15 MW (IEA ref.) |
| **OEDB library** | Real turbine models with a published power curve from the Open Energy Database (via windpowerlib), listed as "manufacturer type" |

The generic turbines have a cut-in speed of 3 m/s and a cut-out speed of 25 m/s. Rated speed
is 13 m/s (IEC I), 11.5 m/s (IEC II), 10 m/s (IEC III) and 10.6 m/s (offshore 15 MW). If the
service cannot list the OEDB turbines, the dialog shows "Generic turbines only" with the
reason.

### How the wind speed is built

ERA5 gives wind at 10 m and 100 m. For each hour, TEMPO fits the wind shear between the two
heights and extrapolates to the hub height. It corrects for air density (from ERA5
temperature and pressure), reads the turbine's power curve, and multiplies by (1 − loss).

### Weather site versus location

Each point has a **Site lat** and **Site lon** in the table. By default the weather is taken
at the location. If you type a different site, or use **Suggest best point**, the weather
comes from that site and the map draws a pin with a line back to the location. The location
itself does not move in the model. Click the reset button in the row to return the site to
the location. An invalid site blocks **Apply to model** until it is fixed or reset.

### Suggest best point

ERA5 is a grid of about 28 km (0.25°), so the wind at your location is the average of its grid
cell. **Suggest best point** looks for a windier cell nearby. Choose a search radius of
**25 km**, **50 km** or **100 km**, then click the button. For each point, TEMPO compares the
point's own cell with the other ERA5 cells within the radius, nearest first, using at most 60
cells in total, and keeps the one with the highest capacity factor.

- If a better cell exists, the point's weather site moves there. The panel reports how many
  pins moved and the mean gain in capacity factor.
- If the own cell is already the best, the site goes back to the location.
- Click **Recalculate** afterwards to get the new profile.

This picks the windiest grid cell, not a micro-site. Treat it as a first screen. The first run
can take minutes at 100 km (up to about 60 weather downloads per point). Later runs use the
cache.

---

## Map overlays

The atlas and wind-flow overlays help you choose sites. They appear in the **Map** view
(controls at the top left) and on the point map inside the PV and wind dialogs.

### Atlas layers

| Layer | Unit | Colour range | Source |
|---|---|---|---|
| **Solar potential (PVOUT)** | kWh/kWp/yr | 700 to 2300 | Global Solar Atlas |
| **Solar irradiation (GHI)** | kWh/m²/yr | 800 to 2800 | Global Solar Atlas |
| **Wind speed 100 m** | m/s | 2 to 12 | Global Wind Atlas |

Values outside the range take the end colours. A legend with the range and unit appears
below the controls.

Atlas layers are per country. Pick a layer, then type or choose a **Country**. The first
time you use a country, a **Download <layer> for <country>** button appears, with a progress
counter in MB. The download is cached on your computer, so it happens once per country and
layer source.

| Download | Size |
|---|---|
| Chile wind (Global Wind Atlas) | about 166 MB |
| Chile solar (Global Solar Atlas zip, with both PVOUT and GHI) | about 145 MB |

For Chile, the Global Solar Atlas coverage stops at 46°S, so the solar layers show nothing
south of −46°. Other countries may have similar edges.

### Wind flow

Tick **Wind flow** for an animated layer of the 100 m wind. Use the date field and the hour
slider (shown as `HH:00 UTC`) to pick the moment. The default date is 7 days ago, and the
latest selectable date is 6 days ago, because ERA5 lags real time.

TEMPO makes one Open-Meteo request per map view and date, for a 16 × 16 grid of points. That
is 256 locations in one request, which Open-Meteo counts as about that many calls (n² for an
n × n grid; the service accepts n from 6 to 20, so at most 20 × 20). Results are cached.
Open-Meteo's free tier has rate limits, so avoid panning continuously while wind flow is on.

When an overlay is visible, its attribution is shown under the controls.

---

## Model calendar and weather year

The weather year and the model's dates are independent. A profile is built for the weather
year and then copied onto the model's calendar:

- The profile covers **whole calendar years**. If your run window is 15 March to 20 June 2030,
  the profile is stamped for all of 2030, so any run window inside the year works without
  recalculating.
- The run window is read the way the Run page reads it: the `subset_time_start` and
  `subset_time_end` parameters, then the model's subset time, then the model's start and end
  dates. A model with no dates cannot get a profile.
- Each model hour takes the value of the same month, day and hour (UTC) in the weather year.
- If the model has a 29 February and the weather year does not, that day uses 28 February.
  If the weather year has one and the model does not, it is dropped.
- A model resolution finer than 60 minutes repeats the hourly value.

The weather year must be a complete year of ERA5 data, so the current year is not offered.

---

## Keeping profiles up to date

TEMPO never recalculates a profile by itself. It compares the stored recipe with the model and
tells you what no longer matches. The status in the profile section changes to **Out of date**
when any of these is true:

| Reason | Meaning |
|---|---|
| **moved** | A location moved by more than about 10 m since the profile was built |
| **missing** | A location hosts the technology but has no column in the profile, for example a new location |
| **removed** | The profile has a column for a location that no longer hosts the technology |
| **calendar** | The model's years or resolution changed |

The same check feeds the model readiness panels (Dashboard and Run). The Run page checks its
own unsaved dates, so it can flag `calendar` before the Dashboard or the profile section does. A stale profile raises
the warning `profile_stale`: "These resource profiles no longer match the model", with one line
per technology that lists the reasons and the locations, for example `pv: moved Arica`. The
**Fix** link opens Technologies, selects that technology and opens its profile dialog.

A technology that needs a profile but has none raises `supply_no_resource`, which lists each
`location::technology`. Without a resource series, engines let the technology produce at full
capacity every hour. Its **Fix** link opens the same dialog, where you use **Calculate
profile**, but only for technologies that have a profile type (PV, wind, run-of-river and
tidal, and the dispatchable types listed above). For other weather-dependent technologies,
such as hydro, the warning has no profile link.

In the dialog, only the affected points need recalculating. A point that moved shows `—`. When other points are still current, the button reads
**Recalculate 1 changed**; for a technology with a single point it reads **Calculate**.
Recalculate, then **Apply to model**, and the
warning goes away.

---

## Accuracy notes

From development checks of the calculation service against real ERA5 data (not yet re-checked in the desktop app):

**Solar PV.** For Santiago (tilt 28, azimuth 0, 2023 ERA5), TEMPO gives 1790 kWh/kWp per year,
against 1829 for PVGIS with ERA5 weather (about 2 % lower).

**Wind.** ERA5 is a regional average of about 28 km. It smooths terrain, so it can miss wind in
valleys and on coasts shaped by local effects.

- Punta Arenas steppe (−52.9, −70.85), 2023: 10.1 m/s at 100 m and a capacity factor of 0.54,
  with Generic IEC II at 100 m and 12 % loss.
- The Coyhaique valley point (−45.3, −72.1) and the Antofagasta coast are calm in ERA5
  (capacity factor about 0.04).
- **Suggest best point** moved the Coyhaique pin by 24 km, for +49 % capacity factor. That gain
  is a statement about ERA5 cells, not a guarantee for a turbine at the new point.

For project-grade numbers, use measured wind data or a site assessment.

---

## Data sources and licences

| Data | Source | Licence and terms |
|---|---|---|
| Hourly weather (irradiance, temperature, wind, pressure) | Open-Meteo Historical Weather API (ERA5), `archive-api.open-meteo.com` | CC BY 4.0. The free tier is for non-commercial use and has rate limits; TEMPO throttles and retries when limited |
| Solar atlas layers | Global Solar Atlas 2.0 (Solargis / World Bank-ESMAP), `api.globalsolaratlas.info` | CC BY 4.0 |
| Wind atlas layer | Global Wind Atlas (DTU / World Bank-ESMAP), `globalwindatlas.info` | CC BY 4.0 |
| Turbine power curves | Open Energy Database (OEDB), through windpowerlib; bundled, works offline | See windpowerlib |
| PV model | pvlib (PVWatts-style losses, SAPM cell temperature, open-rack glass-polymer) | BSD licence |
| Availability and capacity-factor profiles | opentech-db (`otdb.th-deg.de`) | The dialog shows the source and citations of each profile |

The dialogs show "Weather data: Open-Meteo.com (ERA5), CC BY 4.0", and each overlay shows its
own attribution. Keep these when you publish results. For commercial use, check Open-Meteo's
terms for the subscription you need.

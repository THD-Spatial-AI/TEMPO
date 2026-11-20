# Locations

Locations are the geographic nodes of your energy system. Each location can host one or more technologies and is connected to other locations via links.

---

## Adding a location

Navigate to the **Locations** tab in the sidebar.

1. Click **Add Location**.
2. Fill in the fields:

| Field | Required | Description |
|---|---|---|
| **Name** | Yes | Unique identifier used in the Calliope YAML. No spaces; use underscores. |
| **Display name** | No | Human-readable label shown on the map. Defaults to the name. |
| **Latitude** | Yes | WGS84 decimal degrees. |
| **Longitude** | Yes | WGS84 decimal degrees. |
| **Available area** | No | Area in km² used by Calliope for area-constrained technologies (e.g. solar PV). |
| **Region / Country** | No | Metadata for grouping and filtering. Not used directly by Calliope. |

3. Click **Save**. The location marker appears on the map immediately.

---

## Editing a location

Click the location name in the list, or click its marker on the map. The location edit dialog opens. All fields can be updated. Click **Save** to confirm.

---

## Demand

A location that has a demand technology shows an **Electricity demand** card, in the Locations list and in the location edit dialog. It shows where the demand comes from (a constant or a time series), the yearly total in GWh, the average and the peak, and a sketch of the first week.

- **Rescale…** sets a new average and keeps the shape of the profile. A series shared with other locations is not changed for them.
- **Replace…** switches the source to a constant or to another time series in the model.

---

## Picking coordinates from the map

In the location edit dialog, click **Pick on map**. The cursor changes to a crosshair. Click anywhere on the map to fill in the latitude and longitude automatically.

---

## Bulk import from CSV

For large models you can import many locations at once from a CSV file.

1. Go to **Bulk Import** in the sidebar.
2. Download the locations template (`locations_template.csv`) from the link on the screen.
3. Fill in your data. Required columns: `name`, `lat`, `lon`.
4. Upload the CSV and click **Import**. A preview shows what will be created.
5. Click **Confirm** to commit the import.

!!! note "Template files"
    Template CSV files for European and US example networks are available in `public/templates/`.

---

## Deleting a location

Click **⋯** → **Delete** next to the location in the list. Deleting a location also removes all links and technology assignments connected to it.

---

## Location display on the map

Each location is rendered as a circular marker, colour-coded by the technologies assigned to it. Clicking a marker opens the location edit dialog. Hovering shows the name and coordinates in a tooltip.

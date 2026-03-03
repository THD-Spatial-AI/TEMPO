# Links

Links are transmission connections between two locations. They allow energy to flow from one node to another and are rendered as lines on the map.

---

## Adding a link

Navigate to the **Links** tab in the sidebar.

1. Click **Add Link**.
2. Fill in the fields:

| Field | Required | Description |
|---|---|---|
| **From** | Yes | Source location. |
| **To** | Yes | Destination location. |
| **Carrier** | Yes | Energy carrier (e.g. `electricity`, `heat`, `hydrogen`). |
| **Distance (km)** | No | Used by Calliope to compute transmission losses if a loss-per-km coefficient is set on the technology. |
| **Efficiency** | No | One-way transmission efficiency (0–1). Defaults to `1.0` (lossless). |

3. Click **Save**. A line connecting the two locations appears on the map.

---

## Directed vs. bidirectional links

In Calliope, transmission links are inherently bidirectional — defining a link from A to B also allows flow from B to A. You do **not** need to create a separate link in the other direction.

---

## Editing a link

Click the link in the list, or click the line geometry on the map. The edit dialog opens with all current values pre-filled.

---

## Bulk import from CSV

Links can also be bulk-imported from a CSV file. Required columns: `from`, `to`, `carrier`. Optional columns: `distance`, `efficiency`.

1. Go to **Bulk Import** in the sidebar.
2. Download the links template or use `links_template.csv`.
3. Upload the filled CSV and click **Import** → **Confirm**.

---

## Deleting a link

Click **⋯** → **Delete** next to the link in the list. The map line is removed immediately.

---

## Link display on the map

Links are drawn as straight lines between location markers. The colour indicates the carrier type. Clicking a line opens the link edit dialog.

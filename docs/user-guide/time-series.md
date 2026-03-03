# Time Series

Time series are CSV files that supply temporal data to technology parameters — resource availability (e.g. solar irradiance, wind speed capacity factors), demand profiles, and electricity prices.

---

## File format

Time series CSV files must follow these rules:

- **First column**: datetime index in ISO 8601 format (`YYYY-MM-DD HH:MM:SS` or `YYYY-MM-DDTHH:MM:SS`).
- **Remaining columns**: numeric values, one column per variable.
- **Header row**: the first row must contain column names.
- **Time resolution**: must match the model time resolution defined in Parameters.
- **Time coverage**: must cover the full time horizon of the model.

**Example (`solar_capacity_factor.csv`)**:

```
datetime,city_pv,wind_farm_pv
2023-01-01 00:00:00,0.00,0.00
2023-01-01 01:00:00,0.00,0.00
2023-01-01 06:00:00,0.12,0.15
2023-01-01 07:00:00,0.35,0.40
...
```

!!! warning "Missing values"
    The Calliope runner will fail if the time series has gaps or NaN values within the model time horizon. Pre-process your data before uploading.

---

## Uploading a time series

1. Navigate to the **Time Series** tab.
2. Click **Upload CSV**.
3. Select your file. The application parses the file and shows a preview of the first rows and detected columns.
4. Give the time series a descriptive **name** (used to reference it in the parameter forms).
5. Click **Save**. The file is sent to the backend and stored with the model.

---

## Visualizing a time series

After upload, select a time series from the list. The chart below shows all numeric columns as a multi-line plot for the full uploaded date range. Use the zoom controls to inspect specific periods.

Click a column name in the legend to show or hide individual series.

---

## Linking a time series to a technology parameter

In the **Technologies** screen, parameters that support time series show a wave icon (`~`) next to the input field:

1. Click the icon.
2. Select the uploaded time series from the dropdown.
3. Select the specific column that contains the data for this parameter.
4. Click **Apply**.

The parameter value is replaced by a reference to the time series. In the exported YAML this becomes a `resource: file=...` directive.

---

## Removing a time series

Click **⋯** → **Delete** in the time series list. If the series is referenced by one or more technology parameters, a warning is shown listing the affected parameters. You must unlink the references before deletion is allowed.

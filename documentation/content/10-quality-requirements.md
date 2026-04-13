# Quality Requirements

## Quality Scenarios

The following scenarios make the quality goals from the introduction concrete and testable.

### Usability

- A researcher opens the application for the first time and successfully creates a two-location model with one transmission link and one solar PV technology within 30 minutes, guided only by the in-app tutorial.
- A user imports 50 locations from a CSV file using the Bulk Import screen without manual data entry.

### Correctness

- A model exported as YAML from the application can be loaded and solved by the Calliope CLI without any modification.
- Time series data uploaded as CSV is correctly aligned to the model time horizon in the generated YAML.

### Portability

- The NSIS installer completes successfully on a clean Windows 11 machine that has Anaconda installed. The application starts without requiring any manual path configuration.
- The application detects an existing Calliope conda environment automatically and uses it for the first run.

### Performance

- The frontend map renders 200 location markers and 300 link geometries without noticeable lag (frame rate above 30 fps) on a mid-range laptop with integrated graphics.
- A model with 10 locations and 5 technologies completes the export-to-YAML step in under 2 seconds.

### Extensibility

- Adding a new technology category requires only adding an entry to `src/components/TechnologiesData.js`; no other source files need to be changed.

# Constraints

This chapter documents the fixed technical and organizational constraints that influenced the architecture and cannot be changed during development.

## Technical Constraints

The build and runtime environment imposes several hard requirements:

- The primary target operating system is **Windows 10/11 x64**. The Electron-based packaging and the Go backend binary are compiled specifically for this platform. Linux and macOS support exists for the web-only mode but is not part of the official distribution.
- The optimization engine is **Calliope**, which requires a **Python 3.9 or newer** environment with the Calliope package and a compatible LP solver (e.g. GLPK or Gurobi) installed on the host machine. The application cannot perform optimization without this dependency.
- Local data persistence is handled by **SQLite** via the Go backend. No external database server is required.
- Map tile rendering relies on **MapLibre GL** with raster and vector tiles served either from public tile servers or a local GeoServer instance. An internet connection or a running local GeoServer is therefore required for full map functionality.
- OSM power infrastructure data must be pre-processed and loaded into the application data directory before regional infrastructure layers become available. This processing requires the **osmium-tool** and supporting Python libraries.

## Organizational Constraints

- The project is developed and maintained within the School of Applied Computer Science at DIT.
- The codebase is hosted on the institutional GitLab instance.
- The Calliope framework is an external open-source dependency maintained by third parties; compatibility with framework updates must be verified manually after upstream releases.
- All generated model files must conform to the Calliope 0.7 specification to maintain interoperability with existing institutional workflows.

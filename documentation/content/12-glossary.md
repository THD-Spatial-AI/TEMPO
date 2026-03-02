# Glossary

**Calliope**
An open-source multi-scale energy systems modelling framework developed in Python. It uses a YAML-based configuration format to describe locations, technologies, and time series data, then formulates and solves a linear or mixed-integer program to find the cost-optimal system configuration.

**Carrier**
In Calliope terminology, an energy carrier is the form of energy that flows between technologies (e.g. electricity, heat, hydrogen). Each technology declares which carriers it consumes or produces.

**Deck.gl**
A WebGL-based geospatial visualization framework from the OpenJS Foundation. Used in this application to render map layers with large numbers of geographic features at interactive frame rates.

**Electron**
A framework for building cross-platform desktop applications using Node.js and Chromium. It provides a main process (Node.js) that manages OS resources and one or more renderer processes (Chromium) that display the user interface.

**GeoJSON**
A standard JSON-based format for encoding geographic data structures (points, lines, polygons) and their properties.

**GeoServer**
An open-source Java-based server for serving geospatial data via OGC standards (WMS, WFS, WMTS). Used optionally in this project to serve pre-processed OSM vector tile layers.

**Gin**
A fast HTTP web framework for Go used to implement the REST API in the backend.

**GLPK**
The GNU Linear Programming Kit, an open-source LP/MIP solver that Calliope can use as a backend solver when commercial options like Gurobi are not available.

**Go (Golang)**
A statically typed, compiled programming language developed by Google. Used here for the backend server.

**IPC (Inter-Process Communication)**
The mechanism by which the Electron main process and renderer process exchange messages. In Electron this is done through `ipcMain` and `ipcRenderer` APIs exposed via a preload script.

**Link**
In Calliope, a transmission link connects two locations and allows energy to flow between them. Links have associated loss factors and capacity constraints.

**Location**
A node in a Calliope model representing a geographic point or region. Each location can host technologies and is connected to others via links.

**MapLibre GL**
An open-source JavaScript library for rendering interactive maps using WebGL. It is the rendering engine used for the base map in this application.

**NSIS (Nullsoft Scriptable Install System)**
A script-driven installer system for Windows. Used by electron-builder to create the application installer.

**OSM (OpenStreetMap)**
A collaborative mapping project providing freely available geographic data. In this project, OSM data is used to source power infrastructure information (substations, power plants, transmission lines).

**Overpass API**
A read-only HTTP API for querying the OpenStreetMap database. The Go backend uses it to fetch real-time geographic features around a given area.

**PBF (Protocol Buffer Format)**
A compact binary format used to distribute OpenStreetMap data dumps. The OSM processing scripts download and parse PBF files using the osmium-tool Python bindings.

**React**
A JavaScript library for building user interfaces from composable components. Version 19 is used in this project.

**SQLite**
A file-based relational database engine. Used in this project as the persistence layer for model and job data managed by the Go backend.

**Vite**
A frontend build tool that provides a fast development server with hot module replacement and bundles the production output using Rollup.

**YAML**
A human-readable data serialization format. Calliope uses YAML files to define model configurations. The application generates YAML output from the internal JSON model representation.

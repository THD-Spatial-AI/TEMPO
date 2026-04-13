# Architectural Decisions
## ADR-01: Electron as Desktop Shell

**Context**: The application needs to run as a desktop program on Windows while sharing code with a potential future web deployment.

**Decision**: Use Electron to wrap the React SPA. The frontend remains a standard web application; Electron provides the OS integration (file system access, child process management, system tray).

**Consequences**: The distribution package is larger than a native application (Electron ships Chromium), but the frontend codebase requires no platform-specific code.

## ADR-02: Separate Go Process for the Backend

**Context**: A persistent local store and a job management layer are required. The options were an in-process Node.js/Electron solution or a separate server process.

**Decision**: Implement the backend as a standalone Go process with a REST interface.

**Consequences**: Adds a process-management responsibility to the Electron main process (start, health-check, stop). In exchange, the backend can be developed, tested, and updated independently of the Electron packaging, and it could be deployed as a remote server without changes.

## ADR-03: Python HTTP Service for Calliope Execution

**Context**: Calliope is a Python library. The options were to call it from a persistent HTTP service, run it as a one-shot subprocess per job, or embed a Python interpreter.

**Decision**: Implement a FastAPI HTTP service (`calliope_service.py`) that wraps `calliope_runner.py`. The Go backend calls this service via a REST endpoint rather than spawning a subprocess directly.

**Consequences**: The service must be running before solver jobs can be submitted (one additional process to manage). In exchange, the solver is independently deployable as a Docker container, supports streaming log output via Server-Sent Events, and can be scaled or replaced without changing the Go backend. The service lifetime is decoupled from individual solver jobs, eliminating per-job interpreter startup overhead.

## ADR-04: Multipart HTTP as the Go-to-Python Interface

**Context**: The Go backend must transfer a complete model definition to the Python runner and receive results back.

**Decision**: The Go backend serialises the model to YAML in memory and sends it as a multipart HTTP POST to `calliope_service.py`. Results are returned as JSON in the HTTP response.

**Consequences**: The interface is well-defined by the FastAPI route contract and does not require temporary files on disk. Log output streams back via Server-Sent Events, removing the need for IPC-level log forwarding from the Electron main process.

## ADR-05: No Authentication

**Context**: The application is a single-user desktop tool.

**Decision**: The Go backend does not implement authentication or authorization. All endpoints are accessible to any process on localhost.

**Consequences**: This is acceptable for a local desktop application. It would need to be revisited if the backend were ever exposed on a network interface.
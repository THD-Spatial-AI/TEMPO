# Architectural Decisions
## ADR-01: Electron as Desktop Shell

**Context**: The application needs to run as a desktop program on Windows while sharing code with a potential future web deployment.

**Decision**: Use Electron to wrap the React SPA. The frontend remains a standard web application; Electron provides the OS integration (file system access, child process management, system tray).

**Consequences**: The distribution package is larger than a native application (Electron ships Chromium), but the frontend codebase requires no platform-specific code.

## ADR-02: Separate Go Process for the Backend

**Context**: A persistent local store and a job management layer are required. The options were an in-process Node.js/Electron solution or a separate server process.

**Decision**: Implement the backend as a standalone Go process with a REST interface.

**Consequences**: Adds a process-management responsibility to the Electron main process (start, health-check, stop). In exchange, the backend can be developed, tested, and updated independently of the Electron packaging, and it could be deployed as a remote server without changes.

## ADR-03: Python Subprocess for Calliope Execution

**Context**: Calliope is a Python library. The options were to call it from a persistent Python service, run it as a one-shot subprocess per job, or embed a Python interpreter.

**Decision**: Spawn a new Python subprocess for each job using the user's existing conda/venv environment.

**Consequences**: Startup overhead per job is higher than a persistent service, but there are no inter-job memory leaks, no need to manage a long-running Python daemon, and the user can update the Calliope installation independently.

## ADR-04: JSON as the Go-to-Python Interface

**Context**: The Go backend must transfer a complete model definition to the Python runner and receive results back.

**Decision**: Write the model as a JSON file before spawning the process; the runner writes results to a second JSON file. The two file paths are passed as command-line arguments.

**Consequences**: The interface is simple and debuggable (both files can be inspected with any text editor). It avoids the complexity of a socket-based inter-process protocol.

## ADR-05: No Authentication

**Context**: The application is a single-user desktop tool.

**Decision**: The Go backend does not implement authentication or authorization. All endpoints are accessible to any process on localhost.

**Consequences**: This is acceptable for a local desktop application. It would need to be revisited if the backend were ever exposed on a network interface.
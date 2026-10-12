# Remote Runs (MEME)

Large models can take hours and a lot of memory. Instead of solving on your own computer,
TEMPO can send a run to a MEME server and show the results when it finishes. The results
come back in the same format as a local run, so every Results view works the same.

Remote execution is in beta.

---

## Which engines can run remotely

| Engine | Remote |
|---|---|
| PyPSA | Yes |
| Calliope 0.7 | Yes, including SPORES |
| AdOpT-NET0 | Yes |
| Calliope 0.6.8 | No, always local |
| OSeMOSYS | No, always local |

---

## Connecting to a server

Open **Settings → Remote Execution (MEME)**.

1. Enter the **Server URL**, for example `http://192.168.1.50:8080`.
2. Enter the **API key** if the server requires one. Leave it blank otherwise.
3. Click **Save**.
4. Click **Test connection**. If the server answers, TEMPO lists the engines it supports.

!!! note "The MEME API key is not encrypted"
    The MEME key is saved in TEMPO's local settings on this computer as plain text, unlike
    Model Advisor keys. It is sent with every request to the server.

---

## Running remotely

Once a server is saved, the **Run** screen shows a **Compute** switch for engines that can
run remotely:

- **Local** runs on this computer.
- **Remote (MEME)** sends the run to the server. The address is shown next to the switch.

The first line of the run log always says where the run is happening.

Scenario Studio has the same switch, labelled **Local / MEME**, in its top bar.

!!! note "Scenarios and overrides run locally"
    On the Run screen, remote execution handles one baseline run. If you select scenarios
    or overrides, the run goes to your computer instead, and the log says so. To run
    scenario variants remotely, use [Scenario Studio](scenario-studio.md), which applies
    its changes before sending each run.

---

## How remote runs differ

- **Log updates**: TEMPO asks the server for new log lines every second or two, so the log
  arrives in small batches instead of line by line.
- **No CPU or memory figures**: the server only reports elapsed time.
- **Stopping**: the server has no way to cancel a job. **Stop** disconnects TEMPO from the
  run, but the server keeps solving until it finishes and cleans the job up later.
- **Translation notes**: TEMPO converts the model to MEME's format before sending it.
  Notes from that conversion appear at the top of the log, followed by any warnings from
  the server, which start with `[MEME]`.

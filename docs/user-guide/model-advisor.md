# Model Advisor

Model Advisor is a tab in the Results screen. It sends a finished run's results to a large
language model, which writes a plain-language report: what the solver decided, the main
trade-offs, and what you might want to revisit. You can then ask follow-up questions about
the run in a chat.

TEMPO does not include an AI service or an API key. You use your own account with one of
the supported providers, or a model running on your own hardware through Ollama.

Model Advisor only works in the desktop app, not in the browser dev server.

---

## Privacy

!!! warning "Model data leaves your computer"
    With any provider except Ollama, the results of the selected run are sent to that
    provider. This is the only feature in TEMPO that sends model data off your device.
    Read the provider's data-handling terms before you use it.

With Ollama, the data only goes to the Ollama server you point TEMPO at.

Your API key is stored encrypted on this computer using the operating system's secure
storage. The rest of TEMPO never sees the key, only whether one is stored.

---

## Setting it up

Open **Settings → Model Advisor**.

1. Choose a **Provider**.
2. Check the **Model** field. It is filled with the provider's default; change it if you
   want a different model.
3. Paste your **API key** and click **Save key**. The panel shows where to get a key for
   each provider.
4. Click **Test key**. TEMPO sends a short request and shows the model's reply.

| Provider | Default model | Notes |
|---|---|---|
| Anthropic (Claude) | `claude-sonnet-4-6` | |
| Google (Gemini) | `gemini-3.6-flash` | |
| Groq (free tier) | `openai/gpt-oss-20b` | |
| Ollama | `llama3.1:8b` | No key. Set the **Ollama server URL**, or leave it blank for `http://localhost:11434`. Pull the model first (`ollama pull llama3.1:8b`) |
| OpenAI (GPT) | `gpt-4o` | |
| OpenAI-compatible | none | Set a **Base URL**, for example OpenRouter, Azure or a local server, and type the model name |

**Remove key** deletes the stored key for the current provider.

---

## Using it

Open a finished run in **Results** and select the **Model Advisor** tab.

### The report

Click **Generate report**. The text streams in as the model writes it. **Stop** cancels it,
and **Regenerate** writes a new one.

### Questions

Type into **Ask about this run**, for example "Why is gas capacity so low?" or "Which
region is most expensive and why?". The model answers using the same run data as the
report.

The report and the conversation stay available while TEMPO is open, even if you switch to
other screens. They are not saved when you close the app.

---

## Controlling what is sent

The bar at the top of the tab shows the provider, the model and an estimate of how many
tokens of run data will be sent. Large models with many locations and long time series can
exceed a model's context window, or cost more than you expect. TEMPO warns you when the
estimate is large.

Click **Data sent** to reduce it:

| Control | Effect |
|---|---|
| **Include dispatch timeseries** | Untick to leave out the hourly dispatch, usually the largest part |
| **Dispatch downsample** | Keep only every n-th timestep (1 to 24) |
| **Cap keys** | Keep only the top N entries of the capacity and cost-by-location tables (0 = all) |
| **Include model input assumptions** | Also send a summary of the model's inputs, when available |

# IPC Architecture Documentation

### IPC Architecture

Pulse uses Electron's IPC (Inter-Process Communication) to bridge the **Main Process** (Node.js — file I/O, AWS SDK, listeners) and the **Renderer Process** (Vue.js UI). All communication passes through a **Preload Script** that uses `contextBridge` to expose a typed API, ensuring the renderer never has direct access to Node.js APIs.

#### Process Responsibilities

| Process | Responsibilities |
|---|---|
| **Main** | File system (read/write JSON configs), AWS SDK operations (Kinesis, SQS, EventBridge), listener lifecycle management, AWS profile discovery, session persistence, logging |
| **Renderer** | Vue.js UI, Pinia state management, user interactions, displaying streamed listener data and logs |
| **Preload** | Exposes a typed `window.app` object via `contextBridge`, split into `window.app.api` (request/response methods) and `window.app.channels` (push/listen channels). |

#### Communication Patterns

| Pattern | Electron Mechanism | Use Case |
|---|---|---|
| **Request/Response** | `ipcRenderer.invoke()` → `ipcMain.handle()` | CRUD operations, sending events, AWS profile discovery — any call where the renderer needs a result or confirmation |
| **Main → Renderer Push** | `webContents.send()` → `ipcRenderer.on()` | Listener data streams, log entries, long-running operation progress — any data the main process pushes asynchronously |
| **Renderer → Main Fire-and-Forget** | `ipcRenderer.send()` → `ipcMain.on()` | Non-critical notifications (e.g. UI telemetry, window state changes) |

#### IPC Channels

Logical operations are still grouped by domain, but runtime identifiers are now generated as dotted paths: `api.<domain>.<method>` and `channels.<domain>.<event>`.

##### System Management — `systems:*`
| Channel | Pattern | Description |
|---|---|---|
| `systems:list` | invoke/handle | List all configured target systems |
| `systems:get` | invoke/handle | Get a target system by ID |
| `systems:create` | invoke/handle | Create a new target system |
| `systems:update` | invoke/handle | Update a target system |
| `systems:delete` | invoke/handle | Delete a target system |
| `systems:export` | invoke/handle | Export a system config (sensitive fields omitted) |
| `systems:import` | invoke/handle | Import a system config (prompts for sensitive fields) |

##### Schema Management — `schemas:*`
| Channel | Pattern | Description |
|---|---|---|
| `schemas:list` | invoke/handle | List schemas for a target system |
| `schemas:get` | invoke/handle | Get a schema by ID |
| `schemas:create` | invoke/handle | Create a new schema |
| `schemas:update` | invoke/handle | Update a schema |
| `schemas:delete` | invoke/handle | Delete a schema |
| `schemas:validate` | invoke/handle | Validate a schema (returns warnings) |

##### Environment Management — `environments:*`
| Channel | Pattern | Description |
|---|---|---|
| `environments:list` | invoke/handle | List environments for a target system |
| `environments:get` | invoke/handle | Get an environment by ID |
| `environments:create` | invoke/handle | Create a new environment |
| `environments:update` | invoke/handle | Update an environment |
| `environments:delete` | invoke/handle | Delete an environment |

##### Profile Management — `profiles:*`
| Channel | Pattern | Description |
|---|---|---|
| `profiles:list` | invoke/handle | List profiles for a target system |
| `profiles:get` | invoke/handle | Get a profile by ID |
| `profiles:create` | invoke/handle | Create a new profile |
| `profiles:update` | invoke/handle | Update a profile |
| `profiles:delete` | invoke/handle | Delete a profile |

##### Template Management — `templates:*`
| Channel | Pattern | Description |
|---|---|---|
| `templates:list` | invoke/handle | List templates (tree structure) for a system |
| `templates:get` | invoke/handle | Get a template by ID |
| `templates:create` | invoke/handle | Create a new template |
| `templates:update` | invoke/handle | Update a template |
| `templates:delete` | invoke/handle | Delete a template |
| `templates:move` | invoke/handle | Move a template to a different folder |

##### Event Operations — `events:*`
| Channel | Pattern | Description |
|---|---|---|
| `events:generate` | invoke/handle | Generate an event from a schema (with profile overrides and variable replacement applied) |
| `events:send` | invoke/handle | Send a generated event to the target system input (Kinesis/SQS/EventBridge) |
| `events:validate` | invoke/handle | Validate a generated event against its schema (used to return warnings to user) |

##### Session Management — `sessions:*`
| Channel | Pattern | Description |
|---|---|---|
| `sessions:create` | invoke/handle | Create a new session for a target system |
| `sessions:list` | invoke/handle | List sessions for a target system (respects history limit) |
| `sessions:get` | invoke/handle | Get a session by ID (includes sent/received events) |
| `sessions:delete` | invoke/handle | Delete a session |
| `sessions:add-event` | invoke/handle | Record a sent or received event to a session |

##### Listener Management — `listeners:*`
| Channel | Pattern | Description |
|---|---|---|
| `api.listeners.start` | invoke/handle | Start a listener (Kinesis/SQS) with correlation/filter config; returns start result |
| `api.listeners.stop` | invoke/handle | Stop an active listener by ID |
| `api.listeners.status` | invoke/handle | Get the status of all active listeners |
| `channels.listeners.lifecycle` | main→renderer push | Lifecycle transition event (`starting` / `running` / `stopping` / `stopped` / `error`) |
| `channels.listeners.data` | main→renderer push | Streamed data from an active listener (filtered by session context) |
| `channels.listeners.error` | main→renderer push | Listener error notification |

###### Listener Start Contract (`api.listeners.start`)

`api.listeners.start` accepts `ListenerConfig` and returns `ListenerStartResult`.

```typescript
interface ListenerStartResult {
  listenerId: string;
  status: ListenerLifecycleState;
}
```

Filter/correlation behavior for each received record:
1. Resolve correlation value from `ListenerConfig.correlation`.
2. Compare with incoming payload at `correlation.receivedPath`.
3. Evaluate enabled `filters` according to `filterMode` (`all`/`any`).
4. For accepted records, persist a `SessionEvent(direction="received")` and emit `channels.listeners.data`.
5. Emit `channels.listeners.lifecycle` on state changes and `channels.listeners.error` on failures.

##### AWS — `aws:*`
| Channel | Pattern | Description |
|---|---|---|
| `aws:list-profiles` | invoke/handle | Discover AWS profiles from ~/.aws/, env vars, and IAM roles |
| `aws:validate-credentials` | invoke/handle | Validate that the selected AWS profile/credentials are functional |

##### Logging — `log:*`
| Channel | Pattern | Description |
|---|---|---|
| `log:entry` | main→renderer push | Log entry pushed from main process to renderer for display in the console panel |

##### Application — `app:*`
| Channel | Pattern | Description |
|---|---|---|
| `app:get-settings` | invoke/handle | Get application-level settings (history limit, defaults, etc.) |
| `app:update-settings` | invoke/handle | Update application settings |
| `app:get-data-path` | invoke/handle | Get the path to the app data directory |

#### Preload API Shape

The preload script now exposes `window.app`:

```typescript
// preload/index.ts
window.app = {
  platform: process.platform,
  api: {
    app: { ... },
    systems: { ... },
    schemas: { ... },
    environments: { ... },
    customTypes: { ... },
    sessions: { ... },
    templates: { ... },
    profiles: { ... },
    listeners: { ... }
  },
  channels: {
    listeners: {
      lifecycle: { send, listen },
      data: { send, listen },
      error: { send, listen }
    },
    log: {
      entry: { send, listen }
    }
  }
}
```

### Declarative Bridge Pattern

IPC wiring is now configured in a single `app({ apis, channels })` object (`src/app.ts`) using two helpers:

- `api(instance)` marks an API object for invoke/handle registration.
- `channel<T>()` marks an event channel for push/listen wiring.

At startup:

- In main, `App.initialize(ipcMain, window)` recursively walks the config and registers API handlers (`api.<path>.<method>`) plus main-side channel objects.
- In preload, `App.expose(ipcRenderer)` walks the same config and exposes invoke proxies and renderer-side channel objects.

This keeps API/channel registration in one place and avoids hand-written per-method IPC boilerplate.

#### Security Considerations

- **Context Isolation**: Enabled (`contextIsolation: true`). The renderer cannot access Node.js APIs directly.
- **Node Integration**: Disabled (`nodeIntegration: false`).
- **Preload-only bridge**: All IPC is mediated by the preload script. No `remote` module usage.
- **Input Validation**: API methods should validate incoming arguments before processing.
- **Sensitive Data Masking**: AWS credentials and other sensitive fields are masked in the renderer. The main process handles raw credentials but never sends them to the renderer unless explicitly unmasked by the user.


# IPC Architecture Documentation

### IPC Architecture

Pulse uses Electron's IPC (Inter-Process Communication) to bridge the **Main Process** (Node.js — file I/O, AWS SDK, listeners) and the **Renderer Process** (Vue.js UI). All communication passes through a **Preload Script** that uses `contextBridge` to expose a typed API, ensuring the renderer never has direct access to Node.js APIs.

#### Process Responsibilities

| Process | Responsibilities |
|---|---|
| **Main** | File system (read/write JSON configs), AWS SDK operations (Kinesis, SQS, EventBridge), listener lifecycle management, AWS profile discovery, session persistence, logging |
| **Renderer** | Vue.js UI, Pinia state management, user interactions, displaying streamed listener data and logs |
| **Preload** | Exposes a typed `window.api` object via `contextBridge`. All IPC calls are wrapped in typed functions — the renderer never imports `ipcRenderer` directly. |

#### Communication Patterns

| Pattern | Electron Mechanism | Use Case |
|---|---|---|
| **Request/Response** | `ipcRenderer.invoke()` → `ipcMain.handle()` | CRUD operations, sending events, AWS profile discovery — any call where the renderer needs a result or confirmation |
| **Main → Renderer Push** | `webContents.send()` → `ipcRenderer.on()` | Listener data streams, log entries, long-running operation progress — any data the main process pushes asynchronously |
| **Renderer → Main Fire-and-Forget** | `ipcRenderer.send()` → `ipcMain.on()` | Non-critical notifications (e.g. UI telemetry, window state changes) |

#### IPC Channels

Channels are namespaced by domain using a colon-delimited convention: `domain:action`.

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
| `listeners:start` | invoke/handle | Start a listener (Kinesis/SQS) with correlation/filter config; returns start result |
| `listeners:stop` | invoke/handle | Stop an active listener by ID |
| `listeners:status` | invoke/handle | Get the status of all active listeners |
| `listeners:lifecycle` | main→renderer push | Lifecycle transition event (`starting` / `running` / `stopping` / `stopped` / `error`) |
| `listeners:data` | main→renderer push | Streamed data from an active listener (filtered by session context) |
| `listeners:error` | main→renderer push | Listener error notification |

###### Listener Start Contract (`listeners:start`)

`listeners:start` accepts `ListenerConfig` and returns `ListenerStartResult`.

```typescript
interface ListenerStartResult {
  listenerId: string;
  status: ListenerLifecycleState; // always "starting" at creation time
  startedAt: string;              // ISO 8601
}
```

Filter/correlation behavior for each received record:
1. Resolve correlation value from `ListenerConfig.correlation`.
2. Compare with incoming payload at `correlation.receivedPath`.
3. Evaluate enabled `filters` according to `filterMode` (`all`/`any`).
4. For accepted records, persist a `SessionEvent(direction="received")` and emit `listeners:data`.
5. Emit `listeners:lifecycle` on state changes and `listeners:error` on failures.

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

The preload script exposes `window.api` with the following structure. Each method maps to an IPC channel above.

```typescript
// preload/index.ts — exposed via contextBridge.exposeInMainWorld('api', api)

export interface PulseAPI {
  // System
  systems: {
    list(): Promise<System[]>;
    get(id: string): Promise<System>;
    create(data: CreateSystemInput): Promise<System>;
    update(id: string, data: UpdateSystemInput): Promise<System>;
    delete(id: string): Promise<void>;
    export(id: string): Promise<ExportedSystem>;
    import(data: ExportedSystem): Promise<System>;
  };

  // Schema
  schemas: {
    list(systemId: string): Promise<Schema[]>;
    get(id: string): Promise<Schema>;
    create(data: CreateSchemaInput): Promise<Schema>;
    update(id: string, data: UpdateSchemaInput): Promise<Schema>;
    delete(id: string): Promise<void>;
    validate(id: string): Promise<ValidationResult>;
  };

  // Environment
  environments: {
    list(systemId: string): Promise<Environment[]>;
    get(id: string): Promise<Environment>;
    create(data: CreateEnvInput): Promise<Environment>;
    update(id: string, data: UpdateEnvInput): Promise<Environment>;
    delete(id: string): Promise<void>;
  };

  // Profile
  profiles: {
    list(systemId: string): Promise<Profile[]>;
    get(id: string): Promise<Profile>;
    create(data: CreateProfileInput): Promise<Profile>;
    update(id: string, data: UpdateProfileInput): Promise<Profile>;
    delete(id: string): Promise<void>;
  };

  // Template
  templates: {
    list(systemId: string): Promise<TemplateTree>;
    get(id: string): Promise<Template>;
    create(data: CreateTemplateInput): Promise<Template>;
    update(id: string, data: UpdateTemplateInput): Promise<Template>;
    delete(id: string): Promise<void>;
    move(id: string, targetFolderId: string): Promise<Template>;
  };

  // Event
  events: {
    generate(input: GenerateEventInput): Promise<GeneratedEvent>;
    send(input: SendEventInput): Promise<SendEventResult>;
    validate(event: GeneratedEvent, schemaId: string): Promise<ValidationResult>;
  };

  // Session
  sessions: {
    create(systemId: string): Promise<Session>;
    list(systemId: string): Promise<Session[]>;
    get(id: string): Promise<SessionDetail>;
    delete(id: string): Promise<void>;
    addEvent(sessionId: string, event: SessionEvent): Promise<void>;
  };

  // Listener
  listeners: {
    start(config: ListenerConfig): Promise<ListenerStartResult>;
    stop(listenerId: string): Promise<void>;
    status(): Promise<ListenerStatus[]>;
    onLifecycle(callback: (event: ListenerLifecycleEvent) => void): () => void; // returns unsubscribe fn
    onData(callback: (data: ListenerDataEvent) => void): () => void;   // returns unsubscribe fn
    onError(callback: (error: ListenerErrorEvent) => void): () => void; // returns unsubscribe fn
  };

  // AWS
  aws: {
    listProfiles(): Promise<AWSProfile[]>;
    validateCredentials(profileName: string): Promise<CredentialValidation>;
  };

  // Logging
  log: {
    onEntry(callback: (entry: LogEntry) => void): () => void; // returns unsubscribe fn
  };

  // App
  app: {
    getSettings(): Promise<AppSettings>;
    updateSettings(data: Partial<AppSettings>): Promise<AppSettings>;
    getDataPath(): Promise<string>;
  };
}
```

#### IPC Handler Registration (Main Process)

Handlers are organized into domain-specific modules registered at app startup:

```
src/
  main/
    ipc/
      index.ts          # Registers all handlers
      systems.ts
      schemas.ts
      environments.ts
      profiles.ts
      templates.ts
      events.ts
      sessions.ts
      listeners.ts
      aws.ts
      app.ts
```

Each handler module exports a `register(ipcMain, services)` function. The `services` parameter provides access to shared service classes (file storage, AWS clients, etc.), keeping handlers thin and testable.

#### Security Considerations

- **Context Isolation**: Enabled (`contextIsolation: true`). The renderer cannot access Node.js APIs directly.
- **Node Integration**: Disabled (`nodeIntegration: false`).
- **Preload-only bridge**: All IPC is mediated by the preload script. No `remote` module usage.
- **Input Validation**: All IPC handlers validate incoming arguments before processing.
- **Sensitive Data Masking**: AWS credentials and other sensitive fields are masked in the renderer. The main process handles raw credentials but never sends them to the renderer unless explicitly unmasked by the user.

### Dynamic Bridge Pattern

#### Goal

Provide a single, declarative registry of backend API classes that automatically wires up Electron IPC handlers (main process) and matching IPC invokers (renderer preload), so adding a new API surface requires only writing a class and registering it — no manual `ipcMain.handle` / `ipcRenderer.invoke` boilerplate.

#### The `Api` interface

```ts
interface Api {
  readonly api: string; // a unique namespace, e.g. "collections"
}
```

#### The `ApiRegistry`

```ts
class ApiRegistry {

    private readonly apis: Record<string, Api>

    constructor(...apis: Api[]) {
        this.apis = apis.reduce((acc, api) => {
            acc[api.api] = api;
            return acc;
        }, {} as Record<string, Api>);
    }

    public initialize(main: IpcMain): void {
        for (let name in this.apis) {
            const api = this.apis[name] as any;

            Object.getOwnPropertyNames(Object.getPrototypeOf(api))
                .filter(key => typeof api[key] === 'function' && key !== 'constructor')
                .forEach(method => {
                    main.handle(`${name}.${method}`, (event, ...args) => {
                        return api[method](event, ...args);
                    })
                });

            console.debug("Initialized server-side api");
        }
    }

    public expose(renderer: IpcRenderer, api: any): any {
        for (let name in this.apis) {
            api[name] = {};

            const a = this.apis[name] as any;

            Object.getOwnPropertyNames(Object.getPrototypeOf(a))
                .filter(key => typeof a[key] === 'function' && key !== 'constructor')
                .forEach(method => {
                    api[name][method] = (...args: any[]) => renderer.invoke(`${name}.${method}`, ...args)
                    console.debug(`Exposing ${name}.${method}`, api);
                });
        }

        console.debug("Exposing API for frontend", api);

        return api;
    }

}
```

#### Usage

The `api/index.ts` script initializes the registry,
```ts
import { Environments } from './environments';

const apis = [
    new Environments(),
];

...

export default ApiRegistry(...apis);

```

The `main/index.ts` script initilaizes the `ipcMain`,
```ts
import { app, BrowserWindow, ipcMain } from 'electron'
import Api from './api'

Api.initialize(ipcMain);
```
This registers the configured api method, via the generated handle, pointing it to the method from the exposed Api implementation.

The `main/preload.ts` script exposes the Api on the renderer,
```ts
import { contextBridge, ipcRenderer } from 'electron';
import Api from './api';

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', Api.expose(ipcRenderer, {
  platform: process.platform,
}));
```

#### Functionality

This usage builds an object like the following:
```ts
{
    platform: "darwin",
    environments: {
        load: (...args) => ipcRenderer.invoke("environments.load", ...args),
        save: (...args) => ipcRenderer.invoke("environments.save", ...args),
        delete: (...args) => ipcRenderer.invoke("environments.delete", ...args),
    }
}
```
and exposes it to the renderer as `window.electronAPI`.

An example of the hypothetical Environments api:
```ts
export class Environments implements Api {

    readonly api: string = 'environments'; // IPC channel namespace

    async load() {
        /* ... returns data .. */
    }

    async save(event: IpcMainInvokeEvent, environment: Environment) {
        /* ... saves data ... */
    }

    async delete(event: IpcMainInvokeEvent, id: string) {
        /* ... deletes data ... */
    }

}
```

#### Key Details
- The `api` string property becomes the namespace prefix for all IPC channels.
- Every public method on the class prototype (except `constructor`) is auto-registered.
- On the **main side**, the first argument to each handler is the Electron `IpcMainInvokeEvent`, followed by the args the renderer sent.
- On the **renderer side**, the proxy functions strip the event — callers just pass data args (e.g. `window.electronAPI.environments.save(environment)`). Electron injects the event automatically on the main side.

The key insight is that both sides share the same registry instance and the same class definitions. The reflection over `Object.getPrototypeOf(api)` ensures that whenever you add a method to an API class, it is automatically available on both sides with zero additional wiring.

#### Type Safety
The renderer defines matching TypeScript interfaces so `window.electronAPI` is typed:
```ts
// api.ts
interface ServiceApi {
  environments: Environments
}

interface Environments {
  load(): Promise<Environment[]>
  save(environment: Environment): Promise<void>
  delete(id: string): Promise<void>
}

// electron.d.ts
interface IElectronAPI extends ServiceApi {
  platform: string
}
declare global {
  interface Window { electronAPI: IElectronAPI }
}
```
These interfaces mirror the backend API classes but without the `IpcMainInvokeEvent` parameter (since the renderer never sees it).
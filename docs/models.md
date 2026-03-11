# Data Models & Entity Relationships

## Entity Relationship Overview

```
┌──────────────────────────────────────────────────────────────────────────┐
│                              AppSettings                                │
│                         (singleton, app-level)                          │
└──────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────┐
│                               System                                    │
│                      (top-level workspace entity)                       │
├──────────┬──────────┬──────────┬──────────┬──────────┬─────────────────┤
│  Schema  │   Env    │ Profile  │ Template │ Session  │  Input/Output   │
│   1:N    │   1:N    │   1:N    │   1:N    │   1:N    │      1:N        │
└────┬─────┴──────────┴────┬─────┴────┬─────┴────┬─────┴─────────────────┘
     │                     │          │          │
     ▼                     │          │          ▼
 SchemaElement             │          │     SessionEvent
     │                     │          │      (sent/received)
     ▼                     │          │
  DataType                 │          ▼
     │                     │    TemplateFolder
     ▼                     │     (recursive tree)
 GenerationStrategy        │
                           ▼
                    ProfileOverride
                  (targets schema paths)
```

---

## Core Models

### System

The top-level organizational unit — analogous to a Postman Workspace. All other entities are scoped to a system.

```typescript
interface System {
  id: string;                  // UUID
  name: string;
  description?: string;
  inputs: InputConfig[];       // configured destinations for sending events
  outputs: OutputConfig[];     // configured sources for listening
  createdAt: string;           // ISO 8601
  updatedAt: string;           // ISO 8601
}
```

<details>
<summary>system.json</summary>

```json
{
  "id": "sys-a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "name": "Order Processing Service",
  "description": "Handles incoming order events and produces fulfillment outputs",
  "inputs": [
    {
      "id": "inp-11111111-1111-1111-1111-111111111111",
      "name": "Order Ingestion Stream",
      "type": "kinesis",
      "config": {
        "streamName": "{{ env }}-order-events",
        "region": "{{ region }}",
        "partitionKey": "orderId"
      }
    },
    {
      "id": "inp-22222222-2222-2222-2222-222222222222",
      "name": "Order Command Queue",
      "type": "sqs",
      "config": {
        "queueUrl": "https://sqs.{{ region }}.amazonaws.com/123456789012/{{ env }}-order-commands",
        "region": "{{ region }}"
      }
    },
    {
      "id": "inp-33333333-3333-3333-3333-333333333333",
      "name": "Order Event Bus",
      "type": "eventbridge",
      "config": {
        "eventBusName": "{{ env }}-order-bus",
        "region": "{{ region }}",
        "source": "com.acme.orders",
        "detailType": "OrderPlaced"
      }
    }
  ],
  "outputs": [
    {
      "id": "out-aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      "name": "Fulfillment Output Stream",
      "type": "kinesis",
      "config": {
        "streamName": "{{ env }}-fulfillment-events",
        "region": "{{ region }}"
      }
    },
    {
      "id": "out-bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
      "name": "Notification Queue",
      "type": "sqs",
      "config": {
        "queueUrl": "https://sqs.{{ region }}.amazonaws.com/123456789012/{{ env }}-notifications",
        "region": "{{ region }}"
      }
    }
  ],
  "createdAt": "2026-01-15T09:30:00.000Z",
  "updatedAt": "2026-02-20T14:22:00.000Z"
}
```

</details>

---

### InputConfig / OutputConfig

Defines how the system connects to cloud resources for sending and receiving events.

```typescript
type InputType = 'kinesis' | 'sqs' | 'eventbridge';
type OutputType = 'kinesis' | 'sqs';

interface InputConfig {
  id: string;                  // UUID
  name: string;
  type: InputType;
  config: KinesisConfig | SqsConfig | EventBridgeConfig;
}

interface OutputConfig {
  id: string;                  // UUID
  name: string;
  type: OutputType;
  config: KinesisConfig | SqsConfig;
}

interface KinesisConfig {
  streamName: string;          // supports {{ variable }} replacement
  region: string;              // supports {{ variable }} replacement
}

interface SqsConfig {
  queueUrl: string;            // supports {{ variable }} replacement
  region: string;              // supports {{ variable }} replacement
}

interface EventBridgeConfig {
  eventBusName: string;        // supports {{ variable }} replacement
  region: string;              // supports {{ variable }} replacement
  source: string;              // supports {{ variable }} replacement
  detailType: string;          // supports {{ variable }} replacement
}
```

JSON representations for InputConfig and OutputConfig are shown inline within the System example above.

---

### Environment

A named set of key-value variable pairs. Variables are substituted via `{{ variable }}` in schemas, inputs/outputs, profiles, and templates.

```typescript
interface Environment {
  id: string;                  // UUID
  systemId: string;            // FK → System
  name: string;
  variables: EnvironmentVariable[];
  createdAt: string;           // ISO 8601
  updatedAt: string;           // ISO 8601
}

interface EnvironmentVariable {
  key: string;
  value: string;
  sensitive: boolean;          // masked in UI; omitted on export
}
```

<details>
<summary>environment.json</summary>

```json
{
  "id": "env-d4e5f6a7-b8c9-0123-d456-e7f8a9b0c1d2",
  "systemId": "sys-a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "name": "Development",
  "variables": [
    {
      "key": "env",
      "value": "dev",
      "sensitive": false
    },
    {
      "key": "region",
      "value": "us-east-1",
      "sensitive": false
    },
    {
      "key": "apiKey",
      "value": "sk-dev-abc123xyz789",
      "sensitive": true
    }
  ],
  "createdAt": "2026-01-15T09:35:00.000Z",
  "updatedAt": "2026-02-10T11:00:00.000Z"
}
```

</details>

---

### Schema

A definition used to generate events. Follows the OpenAPI spec and is stored as JSON.

```typescript
interface Schema {
  id: string;                  // UUID
  systemId: string;            // FK → System
  name: string;
  description?: string;
  elements: SchemaElement[];   // top-level fields; can be nested
  createdAt: string;           // ISO 8601
  updatedAt: string;           // ISO 8601
}
```

<details>
<summary>schema.json</summary>

```json
{
  "id": "sch-f1e2d3c4-b5a6-9780-1234-567890abcdef",
  "systemId": "sys-a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "name": "OrderPlaced Event",
  "description": "Schema for an incoming order placement event",
  "elements": [
    {
      "name": "orderId",
      "description": "Unique order identifier",
      "required": true,
      "dataType": {
        "type": "string"
      },
      "generationStrategy": {
        "type": "pattern",
        "config": {
          "pattern": "ORD-[A-Z0-9]{8}"
        }
      },
      "constraints": {
        "pattern": "^ORD-[A-Z0-9]{8}$"
      }
    },
    {
      "name": "customerId",
      "required": true,
      "dataType": {
        "type": "AccountId",
        "customTypeId": "ctype-abcdef12-3456-7890-abcd-ef1234567890"
      },
      "generationStrategy": {
        "type": "faker",
        "config": {
          "method": "string.uuid"
        }
      }
    },
    {
      "name": "amount",
      "required": true,
      "dataType": {
        "type": "number"
      },
      "generationStrategy": {
        "type": "range",
        "config": {
          "min": 1.00,
          "max": 9999.99,
          "decimals": 2
        }
      },
      "constraints": {
        "minimum": 0.01
      }
    },
    {
      "name": "currency",
      "required": true,
      "dataType": {
        "type": "string"
      },
      "generationStrategy": {
        "type": "enum",
        "config": {
          "values": ["USD", "EUR", "GBP", "CAD"]
        }
      },
      "constraints": {
        "enum": ["USD", "EUR", "GBP", "CAD"]
      }
    },
    {
      "name": "status",
      "required": true,
      "dataType": {
        "type": "string"
      },
      "generationStrategy": {
        "type": "constant",
        "config": {
          "value": "PLACED"
        }
      },
      "constraints": {
        "enum": ["PLACED", "CONFIRMED", "CANCELLED"]
      }
    },
    {
      "name": "shippingAddress",
      "required": false,
      "dataType": {
        "type": "object"
      },
      "generationStrategy": {
        "type": "random",
        "config": {}
      },
      "children": [
        {
          "name": "street",
          "required": true,
          "dataType": { "type": "string" },
          "generationStrategy": {
            "type": "faker",
            "config": { "method": "location.streetAddress" }
          }
        },
        {
          "name": "city",
          "required": true,
          "dataType": { "type": "string" },
          "generationStrategy": {
            "type": "faker",
            "config": { "method": "location.city" }
          }
        },
        {
          "name": "state",
          "required": true,
          "dataType": { "type": "string" },
          "generationStrategy": {
            "type": "faker",
            "config": { "method": "location.state", "locale": "en_US" }
          }
        },
        {
          "name": "zip",
          "required": true,
          "dataType": { "type": "string" },
          "generationStrategy": {
            "type": "pattern",
            "config": { "pattern": "\\d{5}" }
          },
          "constraints": {
            "pattern": "^\\d{5}$"
          }
        }
      ]
    },
    {
      "name": "items",
      "required": true,
      "dataType": {
        "type": "array"
      },
      "generationStrategy": {
        "type": "random",
        "config": {}
      },
      "children": [
        {
          "name": "sku",
          "required": true,
          "dataType": { "type": "string" },
          "generationStrategy": {
            "type": "pattern",
            "config": { "pattern": "SKU-[A-Z]{2}\\d{4}" }
          }
        },
        {
          "name": "quantity",
          "required": true,
          "dataType": { "type": "integer" },
          "generationStrategy": {
            "type": "range",
            "config": { "min": 1, "max": 10 }
          }
        },
        {
          "name": "unitPrice",
          "required": true,
          "dataType": { "type": "number" },
          "generationStrategy": {
            "type": "range",
            "config": { "min": 0.99, "max": 499.99, "decimals": 2 }
          }
        }
      ]
    },
    {
      "name": "placedAt",
      "required": true,
      "dataType": {
        "type": "string"
      },
      "generationStrategy": {
        "type": "faker",
        "config": {
          "method": "date.recent"
        }
      },
      "constraints": {
        "format": "date-time"
      }
    },
    {
      "name": "notes",
      "required": false,
      "dataType": {
        "type": "string"
      },
      "generationStrategy": {
        "type": "faker",
        "config": {
          "method": "lorem.sentence"
        }
      },
      "constraints": {
        "maxLength": 500
      }
    }
  ],
  "createdAt": "2026-01-16T10:00:00.000Z",
  "updatedAt": "2026-02-18T16:45:00.000Z"
}
```

</details>

---

### SchemaElement

An individual field within a schema. Elements can be nested (for objects/arrays) and each carries a datatype with generation rules.

```typescript
interface SchemaElement {
  name: string;                         // field name / JSON key
  description?: string;
  required: boolean;
  dataType: DataTypeRef;                // reference to a built-in or custom type
  generationStrategy: GenerationStrategy;
  children?: SchemaElement[];           // nested elements (for object / array types)
  constraints?: SchemaConstraints;      // optional validation constraints
}

interface SchemaConstraints {
  minLength?: number;
  maxLength?: number;
  pattern?: string;                     // regex
  enum?: any[];                         // allowed values
  format?: string;                      // OpenAPI format hint (e.g. "date-time", "email")
}
```

JSON representations for SchemaElement and SchemaConstraints are shown inline within the Schema example above.

---

### DataType

Defines both built-in and user-configured custom types. Each type specifies how values are randomly generated.

```typescript
type BuiltInType =
  | 'string'
  | 'integer'
  | 'number'
  | 'boolean'
  | 'object'
  | 'array'
  | 'null';

interface DataTypeRef {
  type: BuiltInType | string;          // built-in type name or custom type ID
  customTypeId?: string;               // FK → CustomDataType (when using a custom type)
}

interface CustomDataType {
  id: string;                           // UUID
  systemId: string;                     // FK → System
  name: string;                         // e.g. "PhoneNumber", "AccountId"
  baseType: BuiltInType;               // the underlying primitive
  defaultStrategy: GenerationStrategy;  // default generation config for this type
  constraints?: SchemaConstraints;
}
```

<details>
<summary>custom-type.json</summary>

```json
{
  "id": "ctype-abcdef12-3456-7890-abcd-ef1234567890",
  "systemId": "sys-a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "name": "AccountId",
  "baseType": "string",
  "defaultStrategy": {
    "type": "pattern",
    "config": {
      "pattern": "ACCT-[A-Z0-9]{12}"
    }
  },
  "constraints": {
    "pattern": "^ACCT-[A-Z0-9]{12}$",
    "minLength": 17,
    "maxLength": 17
  }
}
```

</details>

---

### GenerationStrategy

Controls how a value is randomly generated when not explicitly provided.

```typescript
type StrategyType =
  | 'random'        // fully random within constraints
  | 'faker'         // use a faker.js method
  | 'enum'          // pick from a list
  | 'pattern'       // regex-based generation
  | 'range'         // numeric range
  | 'constant'      // always the same value
  | 'template';     // string template with {{ variable }} interpolation

interface GenerationStrategy {
  type: StrategyType;
  config: RandomConfig | FakerConfig | EnumConfig | PatternConfig | RangeConfig | ConstantConfig | TemplateConfig;
}

interface RandomConfig {}                                    // uses type + constraints

interface FakerConfig {
  method: string;                                            // e.g. "person.firstName"
  locale?: string;
}

interface EnumConfig {
  values: any[];
}

interface PatternConfig {
  pattern: string;                                           // e.g. "[A-Z]{3}-\\d{4}"
}

interface RangeConfig {
  min: number;
  max: number;
  step?: number;
  decimals?: number;
}

interface ConstantConfig {
  value: any;
}

interface TemplateConfig {
  template: string;                                          // e.g. "ORD-{{ uuid }}"
}
```

JSON representations for GenerationStrategy configs are shown inline within the Schema and CustomDataType examples above.

---

### Profile

A named set of schema element overrides. Profiles are stackable and applied in order (last-write-wins per element path).

```typescript
interface Profile {
  id: string;                  // UUID
  systemId: string;            // FK → System
  name: string;
  description?: string;
  overrides: ProfileOverride[];
  createdAt: string;           // ISO 8601
  updatedAt: string;           // ISO 8601
}

interface ProfileOverride {
  elementPath: string;         // dot-notation path to the schema element (e.g. "payload.status")
  action: OverrideAction;
  value?: any;                 // the override value (when action is 'set')
  generationStrategy?: GenerationStrategy;  // override the generation strategy (when action is 'generate')
}

type OverrideAction =
  | 'set'             // replace with a fixed value
  | 'generate'        // replace generation strategy
  | 'omit'            // remove the field entirely
  | 'require'         // force a non-required field to be included
  | 'nullify';        // explicitly set to null
```

<details>
<summary>profile.json</summary>

```json
{
  "id": "prof-99887766-5544-3322-1100-aabbccddeeff",
  "systemId": "sys-a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "name": "High-Value Order",
  "description": "Forces a high-value order amount and requires shipping address",
  "overrides": [
    {
      "elementPath": "amount",
      "action": "set",
      "value": 8500.00
    },
    {
      "elementPath": "currency",
      "action": "set",
      "value": "USD"
    },
    {
      "elementPath": "shippingAddress",
      "action": "require"
    },
    {
      "elementPath": "notes",
      "action": "omit"
    }
  ],
  "createdAt": "2026-01-20T08:00:00.000Z",
  "updatedAt": "2026-02-12T13:15:00.000Z"
}
```

</details>

<details>
<summary>profile.json — with generation strategy override</summary>

```json
{
  "id": "prof-11223344-5566-7788-99aa-bbccddeeff00",
  "systemId": "sys-a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "name": "Cancelled Order",
  "description": "Simulates a cancelled order for negative testing",
  "overrides": [
    {
      "elementPath": "status",
      "action": "set",
      "value": "CANCELLED"
    },
    {
      "elementPath": "amount",
      "action": "generate",
      "generationStrategy": {
        "type": "range",
        "config": {
          "min": 0.01,
          "max": 50.00,
          "decimals": 2
        }
      }
    },
    {
      "elementPath": "shippingAddress",
      "action": "nullify"
    }
  ],
  "createdAt": "2026-01-22T14:30:00.000Z",
  "updatedAt": "2026-02-15T09:00:00.000Z"
}
```

</details>

---

### Template

A stored, ready-to-send event configuration. Templates live in a folder hierarchy and reference a schema, a destination input, and optionally pre-applied profiles.

```typescript
interface Template {
  id: string;                  // UUID
  systemId: string;            // FK → System
  folderId: string | null;     // FK → TemplateFolder (null = root)
  name: string;
  description?: string;
  schemaId: string;            // FK → Schema
  inputId: string;             // FK → InputConfig (destination)
  profileIds: string[];        // FK[] → Profile (applied in order)
  fields: TemplateField[];     // preset field values
  createdAt: string;           // ISO 8601
  updatedAt: string;           // ISO 8601
}

interface TemplateField {
  elementPath: string;         // dot-notation path (e.g. "payload.orderId")
  value: any;                  // the preset value
  omitted: boolean;            // true = purposefully excluded (even if required)
}
```

<details>
<summary>template.json</summary>

```json
{
  "id": "tmpl-aabb1122-3344-5566-7788-99aabbccddee",
  "systemId": "sys-a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "folderId": "fold-11112222-3333-4444-5555-666677778888",
  "name": "Standard USD Order",
  "description": "Quick-send a typical USD order to Kinesis",
  "schemaId": "sch-f1e2d3c4-b5a6-9780-1234-567890abcdef",
  "inputId": "inp-11111111-1111-1111-1111-111111111111",
  "profileIds": [
    "prof-99887766-5544-3322-1100-aabbccddeeff"
  ],
  "fields": [
    {
      "elementPath": "currency",
      "value": "USD",
      "omitted": false
    },
    {
      "elementPath": "status",
      "value": "PLACED",
      "omitted": false
    },
    {
      "elementPath": "notes",
      "value": null,
      "omitted": true
    }
  ],
  "createdAt": "2026-02-01T10:00:00.000Z",
  "updatedAt": "2026-02-18T15:30:00.000Z"
}
```

</details>

---

### TemplateFolder

Provides the folder hierarchy for organizing templates.

```typescript
interface TemplateFolder {
  id: string;                  // UUID
  systemId: string;            // FK → System
  parentId: string | null;     // FK → TemplateFolder (null = root)
  name: string;
}

/** Recursive tree returned by `templates:list` */
interface TemplateTree {
  folders: TemplateFolderNode[];
  templates: Template[];       // root-level templates
}

interface TemplateFolderNode {
  folder: TemplateFolder;
  children: TemplateFolderNode[];
  templates: Template[];
}
```

<details>
<summary>folders.json</summary>

```json
[
  {
    "id": "fold-11112222-3333-4444-5555-666677778888",
    "systemId": "sys-a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "parentId": null,
    "name": "Orders"
  },
  {
    "id": "fold-aaaabbbb-cccc-dddd-eeee-ffff00001111",
    "systemId": "sys-a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "parentId": "fold-11112222-3333-4444-5555-666677778888",
    "name": "Negative Tests"
  },
  {
    "id": "fold-22223333-4444-5555-6666-777788889999",
    "systemId": "sys-a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "parentId": null,
    "name": "Notifications"
  }
]
```

</details>

<details>
<summary>Resolved TemplateTree (runtime, returned by templates:list)</summary>

```json
{
  "folders": [
    {
      "folder": {
        "id": "fold-11112222-3333-4444-5555-666677778888",
        "systemId": "sys-a1b2c3d4-e5f6-7890-abcd-ef1234567890",
        "parentId": null,
        "name": "Orders"
      },
      "children": [
        {
          "folder": {
            "id": "fold-aaaabbbb-cccc-dddd-eeee-ffff00001111",
            "systemId": "sys-a1b2c3d4-e5f6-7890-abcd-ef1234567890",
            "parentId": "fold-11112222-3333-4444-5555-666677778888",
            "name": "Negative Tests"
          },
          "children": [],
          "templates": []
        }
      ],
      "templates": [
        { "id": "tmpl-aabb1122-3344-5566-7788-99aabbccddee", "name": "Standard USD Order", "...":  "..." }
      ]
    },
    {
      "folder": {
        "id": "fold-22223333-4444-5555-6666-777788889999",
        "systemId": "sys-a1b2c3d4-e5f6-7890-abcd-ef1234567890",
        "parentId": null,
        "name": "Notifications"
      },
      "children": [],
      "templates": []
    }
  ],
  "templates": []
}
```

</details>

---

### Session

A logical grouping of send/receive activity against a target system. Historical sessions are retained up to a configurable limit.

```typescript
interface Session {
  id: string;                  // UUID
  systemId: string;            // FK → System
  name?: string;               // auto-generated or user-supplied
  createdAt: string;           // ISO 8601
  updatedAt: string;           // ISO 8601
}

interface SessionDetail extends Session {
  events: SessionEvent[];
  logs: LogEntry[];
}
```

<details>
<summary>session.json</summary>

```json
{
  "id": "sess-12345678-abcd-ef01-2345-6789abcdef01",
  "systemId": "sys-a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "name": "Session 2026-02-22 #1",
  "createdAt": "2026-02-22T10:00:00.000Z",
  "updatedAt": "2026-02-22T10:45:00.000Z"
}
```

</details>

---

### SessionEvent

An individual event recorded within a session — either sent by the user or received via a listener.

```typescript
type EventDirection = 'sent' | 'received';

interface SessionEvent {
  id: string;                          // UUID
  sessionId: string;                   // FK → Session
  direction: EventDirection;
  timestamp: string;                   // ISO 8601
  inputId?: string;                    // FK → InputConfig (for sent events)
  outputId?: string;                   // FK → OutputConfig (for received events)
  listenerId?: string;                 // FK → active listener (for received events)
  schemaId?: string;                   // FK → Schema (for sent events)
  profileIds?: string[];               // FK[] → Profile (profiles active at send time)
  payload: Record<string, any>;        // the actual event body
  metadata?: Record<string, any>;      // cloud-specific metadata (e.g. sequence number, message ID)
  status: EventStatus;
  error?: string;                      // error message if status is 'failed'
}

type EventStatus = 'pending' | 'success' | 'failed';
```

<details>
<summary>session-event.json — sent event</summary>

```json
{
  "id": "sevt-aaaa1111-bbbb-2222-cccc-3333dddd4444",
  "sessionId": "sess-12345678-abcd-ef01-2345-6789abcdef01",
  "direction": "sent",
  "timestamp": "2026-02-22T10:05:32.000Z",
  "inputId": "inp-11111111-1111-1111-1111-111111111111",
  "schemaId": "sch-f1e2d3c4-b5a6-9780-1234-567890abcdef",
  "profileIds": [
    "prof-99887766-5544-3322-1100-aabbccddeeff"
  ],
  "payload": {
    "orderId": "ORD-X7K9M2P4",
    "customerId": "ACCT-R3F8G1H5J2K9",
    "amount": 8500.00,
    "currency": "USD",
    "status": "PLACED",
    "shippingAddress": {
      "street": "742 Evergreen Terrace",
      "city": "Springfield",
      "state": "Illinois",
      "zip": "62704"
    },
    "items": [
      {
        "sku": "SKU-AB1234",
        "quantity": 2,
        "unitPrice": 4250.00
      }
    ],
    "placedAt": "2026-02-22T10:05:30.000Z"
  },
  "metadata": {
    "sequenceNumber": "49629384752834957348573495",
    "shardId": "shardId-000000000001"
  },
  "status": "success"
}
```

</details>

<details>
<summary>session-event.json — received event</summary>

```json
{
  "id": "sevt-eeee5555-ffff-6666-0000-7777aaaa8888",
  "sessionId": "sess-12345678-abcd-ef01-2345-6789abcdef01",
  "direction": "received",
  "timestamp": "2026-02-22T10:05:35.200Z",
  "outputId": "out-aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
  "listenerId": "lsnr-44445555-6666-7777-8888-9999aaaabbbb",
  "payload": {
    "fulfillmentId": "FUL-92837465",
    "orderId": "ORD-X7K9M2P4",
    "status": "PROCESSING",
    "estimatedDelivery": "2026-02-25T17:00:00.000Z",
    "warehouseId": "WH-EAST-03"
  },
  "metadata": {
    "sequenceNumber": "49629384752834957348573500",
    "shardId": "shardId-000000000000",
    "approximateArrivalTimestamp": 1740218735200
  },
  "status": "success"
}
```

</details>

---

### Listener

Runtime state for an active listener. Listeners are started/stopped at runtime and are not persisted as configuration — their *configs* live in `OutputConfig`, and their *filter rules* are provided when starting.

```typescript
type ListenerLifecycleState = 'starting' | 'running' | 'stopping' | 'stopped' | 'error';

interface ListenerConfig {
  outputId: string;            // FK → OutputConfig
  sessionId: string;           // FK → Session (used for filter context)
  correlation?: ListenerCorrelationConfig;
  filters?: ListenerFilter[];
  filterMode?: ListenerFilterMode;       // default: 'all'
  includeUnmatched?: boolean;            // default: false
}

type ListenerFilterMode = 'all' | 'any';

interface ListenerCorrelationConfig {
  strategy: 'fromSentEvent' | 'static';
  receivedPath: string;                  // JSONPath used on incoming events
  sentEventId?: string;                  // required when strategy = 'fromSentEvent'
  sentPath?: string;                     // required when strategy = 'fromSentEvent'
  value?: string | number | boolean;     // required when strategy = 'static'
  caseSensitive?: boolean;               // default: true
}

interface ListenerFilter {
  id?: string;
  enabled?: boolean;             // default: true
  type: ListenerFilterType;
  config: JsonPathFilterConfig | RegexFilterConfig;
}

type ListenerFilterType =
  | 'jsonpath'         // match a value at a JSON path
  | 'regex';           // match payload text against a regex

interface JsonPathFilterConfig {
  path: string;                // e.g. "$.header.eventType"
  operator: 'equals' | 'notEquals' | 'contains' | 'exists';
  value?: any;                 // required for all operators except 'exists'
}

interface RegexFilterConfig {
  pattern: string;             // regex applied to payload text or extracted field
  flags?: string;              // e.g. "i"
  targetPath?: string;         // optional JSONPath; if omitted the full payload is stringified
}

interface ListenerStatus {
  listenerId: string;
  outputId: string;
  sessionId: string;
  status: ListenerLifecycleState;
  startedAt?: string;          // ISO 8601
  stoppedAt?: string;          // ISO 8601
  lastEventAt?: string;        // ISO 8601
  eventsReceived: number;
  stopReason?: ListenerStopReason;
  lastError?: string;
}

type ListenerStopReason =
  | 'user-request'
  | 'session-ended'
  | 'app-shutdown'
  | 'fatal-error';

interface ListenerLifecycleEvent {
  listenerId: string;
  outputId: string;
  sessionId: string;
  previousState?: ListenerLifecycleState;
  state: ListenerLifecycleState;
  timestamp: string;           // ISO 8601
  reason?: ListenerStopReason;
  error?: string;
}

interface ListenerDataEvent {
  listenerId: string;
  sessionId: string;
  event: SessionEvent;         // the received event (direction = 'received')
}

interface ListenerErrorEvent {
  listenerId: string;
  error: string;
  timestamp: string;           // ISO 8601
  recoverable?: boolean;       // when true, listener keeps running
}
```

Lifecycle rules:
- `listeners:start` moves a listener to `starting` immediately.
- On successful source subscription, state transitions to `running`.
- `listeners:stop` moves a running listener to `stopping`, then `stopped` once resources are released.
- Runtime failures emit `listeners:error`; recoverable failures keep state as `running`, fatal failures transition to `error`.
- Listener events are only persisted to `SessionEvent` when they satisfy correlation + filter evaluation.

Correlation and filter evaluation order:
1. Resolve correlation value:
    - `fromSentEvent`: read value from `SessionEvent(sentEventId)` at `sentPath`.
    - `static`: use configured `value`.
2. Apply correlation match to incoming event at `receivedPath`. If no match, drop event unless `includeUnmatched = true`.
3. Evaluate enabled `filters` using `filterMode` (`all` = logical AND, `any` = logical OR).
4. Persist accepted event to `SessionEvent` and emit `ListenerDataEvent`.

<details>
<summary>ListenerConfig (runtime, passed to listeners:start)</summary>

```json
{
  "outputId": "out-aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
  "sessionId": "sess-12345678-abcd-ef01-2345-6789abcdef01",
  "correlation": {
    "strategy": "fromSentEvent",
    "sentEventId": "sevt-aaaa1111-bbbb-2222-cccc-3333dddd4444",
    "sentPath": "$.orderId",
    "receivedPath": "$.orderId",
    "caseSensitive": true
  },
  "filterMode": "all",
  "includeUnmatched": false,
  "filters": [
    {
      "id": "flt-status-processing",
      "enabled": true,
      "type": "jsonpath",
      "config": {
        "path": "$.status",
        "operator": "equals",
        "value": "PROCESSING"
      }
    },
    {
      "id": "flt-warehouse-east",
      "enabled": true,
      "type": "regex",
      "config": {
        "targetPath": "$.warehouseId",
        "pattern": "^WH-EAST-",
        "flags": "i"
      }
    }
  ]
}
```

</details>

<details>
<summary>ListenerStatus (runtime, returned by listeners:status)</summary>

```json
[
  {
    "listenerId": "lsnr-44445555-6666-7777-8888-9999aaaabbbb",
    "outputId": "out-aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    "sessionId": "sess-12345678-abcd-ef01-2345-6789abcdef01",
    "status": "running",
    "startedAt": "2026-02-22T10:04:00.000Z",
    "lastEventAt": "2026-02-22T10:05:35.200Z",
    "eventsReceived": 3
  }
]
```

</details>

<details>
<summary>ListenerLifecycleEvent (runtime, pushed via listeners:lifecycle)</summary>

```json
{
  "listenerId": "lsnr-44445555-6666-7777-8888-9999aaaabbbb",
  "outputId": "out-aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
  "sessionId": "sess-12345678-abcd-ef01-2345-6789abcdef01",
  "previousState": "starting",
  "state": "running",
  "timestamp": "2026-02-22T10:04:00.120Z"
}
```

</details>

<details>
<summary>ListenerDataEvent (runtime, pushed via listeners:data)</summary>

```json
{
  "listenerId": "lsnr-44445555-6666-7777-8888-9999aaaabbbb",
  "sessionId": "sess-12345678-abcd-ef01-2345-6789abcdef01",
  "event": {
    "id": "sevt-eeee5555-ffff-6666-0000-7777aaaa8888",
    "sessionId": "sess-12345678-abcd-ef01-2345-6789abcdef01",
    "direction": "received",
    "timestamp": "2026-02-22T10:05:35.200Z",
    "outputId": "out-aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    "listenerId": "lsnr-44445555-6666-7777-8888-9999aaaabbbb",
    "payload": {
      "fulfillmentId": "FUL-92837465",
      "orderId": "ORD-X7K9M2P4",
      "status": "PROCESSING"
    },
    "metadata": {
      "sequenceNumber": "49629384752834957348573500",
      "shardId": "shardId-000000000000"
    },
    "status": "success"
  }
}
```

</details>

<details>
<summary>ListenerErrorEvent (runtime, pushed via listeners:error)</summary>

```json
{
  "listenerId": "lsnr-44445555-6666-7777-8888-9999aaaabbbb",
  "error": "Kinesis GetRecords failed: ExpiredIteratorException — the shard iterator has expired",
  "timestamp": "2026-02-22T10:10:00.000Z"
}
```

</details>

---

### Event Generation & Sending

Transient models used during event generation and sending workflows.

```typescript
interface GenerateEventInput {
  schemaId: string;             // FK → Schema
  environmentId?: string;       // FK → Environment (for variable replacement)
  profileIds?: string[];        // FK[] → Profile (applied in order)
  overrides?: Record<string, any>;  // ad-hoc field overrides (dot-notation paths)
}

interface GeneratedEvent {
  schemaId: string;
  payload: Record<string, any>;
  appliedProfiles: string[];    // IDs of profiles that were applied
  warnings: ValidationWarning[];
}

interface SendEventInput {
  inputId: string;              // FK → InputConfig (destination)
  sessionId: string;            // FK → Session
  event: GeneratedEvent;
  awsProfile: string;           // selected AWS profile name
  environmentId?: string;       // FK → Environment (for input config variable replacement)
}

interface SendEventResult {
  success: boolean;
  sessionEventId: string;      // FK → SessionEvent (recorded in session)
  metadata?: Record<string, any>;  // cloud response metadata
  error?: string;
}

interface ValidationResult {
  valid: boolean;
  warnings: ValidationWarning[];
}

interface ValidationWarning {
  elementPath: string;
  message: string;
  severity: 'info' | 'warning';
}
```

<details>
<summary>GenerateEventInput (passed to events:generate)</summary>

```json
{
  "schemaId": "sch-f1e2d3c4-b5a6-9780-1234-567890abcdef",
  "environmentId": "env-d4e5f6a7-b8c9-0123-d456-e7f8a9b0c1d2",
  "profileIds": [
    "prof-99887766-5544-3322-1100-aabbccddeeff"
  ],
  "overrides": {
    "orderId": "ORD-MANUAL01",
    "items[0].sku": "SKU-ZZ9999"
  }
}
```

</details>

<details>
<summary>GeneratedEvent (returned by events:generate)</summary>

```json
{
  "schemaId": "sch-f1e2d3c4-b5a6-9780-1234-567890abcdef",
  "payload": {
    "orderId": "ORD-MANUAL01",
    "customerId": "ACCT-T4W8K2N6P3R1",
    "amount": 8500.00,
    "currency": "USD",
    "status": "PLACED",
    "shippingAddress": {
      "street": "1428 Elm Street",
      "city": "Dayton",
      "state": "Ohio",
      "zip": "45402"
    },
    "items": [
      {
        "sku": "SKU-ZZ9999",
        "quantity": 5,
        "unitPrice": 1700.00
      }
    ],
    "placedAt": "2026-02-22T09:58:14.000Z"
  },
  "appliedProfiles": [
    "prof-99887766-5544-3322-1100-aabbccddeeff"
  ],
  "warnings": []
}
```

</details>

<details>
<summary>SendEventInput (passed to events:send)</summary>

```json
{
  "inputId": "inp-11111111-1111-1111-1111-111111111111",
  "sessionId": "sess-12345678-abcd-ef01-2345-6789abcdef01",
  "event": {
    "schemaId": "sch-f1e2d3c4-b5a6-9780-1234-567890abcdef",
    "payload": { "orderId": "ORD-MANUAL01", "...":  "..." },
    "appliedProfiles": ["prof-99887766-5544-3322-1100-aabbccddeeff"],
    "warnings": []
  },
  "awsProfile": "dev-account",
  "environmentId": "env-d4e5f6a7-b8c9-0123-d456-e7f8a9b0c1d2"
}
```

</details>

<details>
<summary>SendEventResult (returned by events:send)</summary>

```json
{
  "success": true,
  "sessionEventId": "sevt-aaaa1111-bbbb-2222-cccc-3333dddd4444",
  "metadata": {
    "sequenceNumber": "49629384752834957348573495",
    "shardId": "shardId-000000000001"
  }
}
```

</details>

<details>
<summary>ValidationResult (returned by events:validate / schemas:validate)</summary>

```json
{
  "valid": true,
  "warnings": [
    {
      "elementPath": "shippingAddress.zip",
      "message": "Value '4540' does not match pattern ^\\d{5}$",
      "severity": "warning"
    },
    {
      "elementPath": "notes",
      "message": "Optional field 'notes' is not present",
      "severity": "info"
    }
  ]
}
```

</details>

---

### AWS

```typescript
interface AWSProfile {
  name: string;
  source: 'credentials-file' | 'config-file' | 'environment' | 'iam-role';
  region?: string;
}

interface CredentialValidation {
  valid: boolean;
  identity?: {
    account: string;
    arn: string;
  };
  error?: string;
}
```

<details>
<summary>AWSProfile (returned by aws:list-profiles)</summary>

```json
[
  {
    "name": "dev-account",
    "source": "credentials-file",
    "region": "us-east-1"
  },
  {
    "name": "staging-account",
    "source": "config-file",
    "region": "us-west-2"
  },
  {
    "name": "default",
    "source": "environment"
  }
]
```

</details>

<details>
<summary>CredentialValidation (returned by aws:validate-credentials)</summary>

```json
{
  "valid": true,
  "identity": {
    "account": "123456789012",
    "arn": "arn:aws:iam::123456789012:user/developer"
  }
}
```

</details>

---

### Logging

```typescript
type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  id: string;                  // UUID
  timestamp: string;           // ISO 8601
  level: LogLevel;
  source: string;              // e.g. "listeners", "events", "aws"
  message: string;
  sessionId?: string;          // FK → Session (if log is session-scoped)
  metadata?: Record<string, any>;
}
```

<details>
<summary>logs.json (session-scoped log entries)</summary>

```json
[
  {
    "id": "log-11112222-3333-4444-5555-666677778888",
    "timestamp": "2026-02-22T10:05:31.500Z",
    "level": "info",
    "source": "events",
    "message": "Sending event to Kinesis stream dev-order-events (partition key: orderId)",
    "sessionId": "sess-12345678-abcd-ef01-2345-6789abcdef01",
    "metadata": {
      "schemaId": "sch-f1e2d3c4-b5a6-9780-1234-567890abcdef",
      "inputId": "inp-11111111-1111-1111-1111-111111111111"
    }
  },
  {
    "id": "log-aaaabbbb-cccc-dddd-eeee-ffff00001111",
    "timestamp": "2026-02-22T10:05:32.100Z",
    "level": "info",
    "source": "events",
    "message": "Event sent successfully — sequenceNumber: 49629384752834957348573495",
    "sessionId": "sess-12345678-abcd-ef01-2345-6789abcdef01"
  },
  {
    "id": "log-22223333-4444-5555-6666-777788889999",
    "timestamp": "2026-02-22T10:05:35.300Z",
    "level": "info",
    "source": "listeners",
    "message": "Listener received matching event from Kinesis stream dev-fulfillment-events",
    "sessionId": "sess-12345678-abcd-ef01-2345-6789abcdef01",
    "metadata": {
      "listenerId": "lsnr-44445555-6666-7777-8888-9999aaaabbbb",
      "matchedFilter": "correlation"
    }
  },
  {
    "id": "log-33334444-5555-6666-7777-888899990000",
    "timestamp": "2026-02-22T10:10:00.000Z",
    "level": "error",
    "source": "listeners",
    "message": "Kinesis GetRecords failed: ExpiredIteratorException — the shard iterator has expired",
    "sessionId": "sess-12345678-abcd-ef01-2345-6789abcdef01",
    "metadata": {
      "listenerId": "lsnr-44445555-6666-7777-8888-9999aaaabbbb"
    }
  }
]
```

</details>

---

### AppSettings

Singleton application-level configuration.

```typescript
interface AppSettings {
  sessionHistoryLimit: number;          // default: 10
  defaultRegion: string;
  theme: 'light' | 'dark' | 'system';
  dataDirectory: string;                // path to JSON data storage
  logLevel: LogLevel;
}
```

<details>
<summary>settings.json</summary>

```json
{
  "sessionHistoryLimit": 10,
  "defaultRegion": "us-east-1",
  "theme": "dark",
  "dataDirectory": "/Users/developer/Library/Application Support/Pulse/data",
  "logLevel": "info"
}
```

</details>

---

## Entity Relationships

| Parent | Child | Cardinality | FK Location | Notes |
|---|---|---|---|---|
| System | InputConfig | 1 : N | Embedded in `System.inputs` | Inline array |
| System | OutputConfig | 1 : N | Embedded in `System.outputs` | Inline array |
| System | Schema | 1 : N | `Schema.systemId` | |
| System | Environment | 1 : N | `Environment.systemId` | |
| System | Profile | 1 : N | `Profile.systemId` | |
| System | Template | 1 : N | `Template.systemId` | |
| System | TemplateFolder | 1 : N | `TemplateFolder.systemId` | |
| System | Session | 1 : N | `Session.systemId` | Capped by `sessionHistoryLimit` |
| System | CustomDataType | 1 : N | `CustomDataType.systemId` | |
| Schema | SchemaElement | 1 : N | Embedded in `Schema.elements` | Recursive (children) |
| SchemaElement | DataTypeRef | 1 : 1 | Embedded in `SchemaElement.dataType` | References built-in or custom type |
| SchemaElement | GenerationStrategy | 1 : 1 | Embedded in `SchemaElement.generationStrategy` | |
| CustomDataType | GenerationStrategy | 1 : 1 | Embedded in `CustomDataType.defaultStrategy` | |
| Profile | ProfileOverride | 1 : N | Embedded in `Profile.overrides` | Targets schema element paths |
| TemplateFolder | TemplateFolder | 1 : N | `TemplateFolder.parentId` | Recursive (nested folders) |
| TemplateFolder | Template | 1 : N | `Template.folderId` | `null` = root level |
| Template | Schema | N : 1 | `Template.schemaId` | |
| Template | InputConfig | N : 1 | `Template.inputId` | Destination |
| Template | Profile | N : N | `Template.profileIds` | Ordered array of FK references |
| Template | TemplateField | 1 : N | Embedded in `Template.fields` | |
| Session | SessionEvent | 1 : N | `SessionEvent.sessionId` | |
| Session | LogEntry | 1 : N | `LogEntry.sessionId` | Optional association |
| SessionEvent | InputConfig | N : 1 | `SessionEvent.inputId` | For sent events |
| SessionEvent | OutputConfig | N : 1 | `SessionEvent.outputId` | For received events |
| OutputConfig | ListenerConfig | 1 : N | `ListenerConfig.outputId` | Runtime only |
| Session | ListenerConfig | 1 : N | `ListenerConfig.sessionId` | Runtime only |

---

## Storage Layout

All data is persisted as JSON files under the application data directory.

```
<dataDirectory>/
├── settings.json                          # AppSettings
├── systems/
│   ├── <systemId>/
│   │   ├── system.json                    # System (with inputs/outputs)
│   │   ├── schemas/
│   │   │   └── <schemaId>.json            # Schema (with embedded elements)
│   │   ├── environments/
│   │   │   └── <environmentId>.json       # Environment
│   │   ├── profiles/
│   │   │   └── <profileId>.json           # Profile
│   │   ├── custom-types/
│   │   │   └── <typeId>.json              # CustomDataType
│   │   ├── templates/
│   │   │   ├── folders.json               # TemplateFolder[] (flat list, tree built at runtime)
│   │   │   └── <templateId>.json          # Template
│   │   └── sessions/
│   │       └── <sessionId>/
│   │           ├── session.json           # Session metadata
│   │           ├── events/
│   │           │   └── <eventId>.json     # SessionEvent
│   │           └── logs.json              # LogEntry[] for this session
```

import { describe, it, expectTypeOf } from 'vitest'
import type {
  System,
  InputConfig,
  OutputConfig,
  InputType,
  OutputType,
  KinesisConfig,
  SqsConfig,
  EventBridgeConfig
} from '../../../src/shared/models/system'
import type { Environment, EnvironmentVariable } from '../../../src/shared/models/environment'
import type {
  Schema,
  SchemaElement,
  SchemaConstraints,
  DataTypeRef,
  BuiltInType,
  CustomDataType
} from '../../../src/shared/models/schema'
import type {
  GenerationStrategy,
  StrategyType,
  RandomConfig,
  FakerConfig,
  EnumConfig,
  PatternConfig,
  RangeConfig,
  ConstantConfig,
  TemplateConfig
} from '../../../src/shared/models/generation'
import type { Profile, ProfileOverride, OverrideAction } from '../../../src/shared/models/profile'
import type {
  Template,
  TemplateField,
  TemplateFolder,
  TemplateTree,
  TemplateFolderNode
} from '../../../src/shared/models/template'
import type {
  Session,
  SessionDetail,
  SessionEvent,
  EventDirection,
  EventStatus
} from '../../../src/shared/models/session'
import type {
  ListenerConfig,
  ListenerLifecycleState,
  ListenerFilterMode,
  ListenerFilter,
  ListenerFilterType,
  JsonPathFilterConfig,
  RegexFilterConfig,
  ListenerStatus,
  ListenerStopReason,
  ListenerLifecycleEvent,
  ListenerDataEvent,
  ListenerErrorEvent,
  ListenerStartResult
} from '../../../src/shared/models/listener'
import type {
  GenerateEventInput,
  GeneratedEvent,
  SendEventInput,
  SendEventResult,
  ValidationResult,
  ValidationWarning
} from '../../../src/shared/models/event'
import type { AWSProfile, CredentialValidation } from '../../../src/shared/models/aws'
import type { LogLevel, LogEntry } from '../../../src/shared/models/log'
import type { AppSettings } from '../../../src/shared/models/settings'
import type { CreateSystemInput, UpdateSystemInput, ExportedSystem } from '../../../src/shared/dto/systems'
import type { CreateSchemaInput, UpdateSchemaInput } from '../../../src/shared/dto/schemas'
import type { CreateEnvInput, UpdateEnvInput } from '../../../src/shared/dto/environments'
import type { CreateProfileInput, UpdateProfileInput } from '../../../src/shared/dto/profiles'
import type { CreateTemplateInput, UpdateTemplateInput } from '../../../src/shared/dto/templates'

describe('shared models — System', () => {
  it('KinesisConfig satisfies interface shape', () => {
    const config: KinesisConfig = { streamName: '{{ env }}-stream', region: 'us-east-1' }
    expectTypeOf(config).toMatchTypeOf<KinesisConfig>()
  })

  it('SqsConfig satisfies interface shape', () => {
    const config: SqsConfig = {
      queueUrl: 'https://sqs.us-east-1.amazonaws.com/123/queue',
      region: 'us-east-1'
    }
    expectTypeOf(config).toMatchTypeOf<SqsConfig>()
  })

  it('EventBridgeConfig satisfies interface shape', () => {
    const config: EventBridgeConfig = {
      eventBusName: 'my-bus',
      region: 'us-east-1',
      source: 'com.example',
      detailType: 'OrderPlaced'
    }
    expectTypeOf(config).toMatchTypeOf<EventBridgeConfig>()
  })

  it('InputConfig satisfies interface shape', () => {
    const input: InputConfig = {
      id: 'inp-1',
      name: 'Order Stream',
      type: 'kinesis' as InputType,
      config: { streamName: 'order-events', region: 'us-east-1' }
    }
    expectTypeOf(input).toMatchTypeOf<InputConfig>()
  })

  it('OutputConfig satisfies interface shape', () => {
    const output: OutputConfig = {
      id: 'out-1',
      name: 'Fulfillment Stream',
      type: 'kinesis' as OutputType,
      config: { streamName: 'fulfillment-events', region: 'us-east-1' }
    }
    expectTypeOf(output).toMatchTypeOf<OutputConfig>()
  })

  it('System satisfies interface shape', () => {
    const system: System = {
      id: 'sys-1',
      name: 'Order Processing Service',
      inputs: [],
      outputs: [],
      createdAt: '2026-01-15T09:30:00.000Z',
      updatedAt: '2026-02-20T14:22:00.000Z'
    }
    expectTypeOf(system).toMatchTypeOf<System>()
  })
})

describe('shared models — Environment', () => {
  it('EnvironmentVariable satisfies interface shape', () => {
    const v: EnvironmentVariable = { key: 'env', value: 'dev', sensitive: false }
    expectTypeOf(v).toMatchTypeOf<EnvironmentVariable>()
  })

  it('Environment satisfies interface shape', () => {
    const env: Environment = {
      id: 'env-1',
      systemId: 'sys-1',
      name: 'Development',
      variables: [{ key: 'env', value: 'dev', sensitive: false }],
      createdAt: '2026-01-15T09:35:00.000Z',
      updatedAt: '2026-02-10T11:00:00.000Z'
    }
    expectTypeOf(env).toMatchTypeOf<Environment>()
  })
})

describe('shared models — Schema & Generation', () => {
  it('GenerationStrategy (faker) satisfies interface shape', () => {
    const strategy: GenerationStrategy = {
      type: 'faker' as StrategyType,
      config: { method: 'string.uuid' } as FakerConfig
    }
    expectTypeOf(strategy).toMatchTypeOf<GenerationStrategy>()
  })

  it('GenerationStrategy configs satisfy their interface shapes', () => {
    const random: RandomConfig = {}
    const faker: FakerConfig = { method: 'person.firstName', locale: 'en' }
    const enumCfg: EnumConfig = { values: ['A', 'B'] }
    const pattern: PatternConfig = { pattern: '[A-Z]{3}' }
    const range: RangeConfig = { min: 1, max: 100 }
    const constant: ConstantConfig = { value: 42 }
    const template: TemplateConfig = { template: 'ORD-{{ uuid }}' }
    expectTypeOf(random).toMatchTypeOf<RandomConfig>()
    expectTypeOf(faker).toMatchTypeOf<FakerConfig>()
    expectTypeOf(enumCfg).toMatchTypeOf<EnumConfig>()
    expectTypeOf(pattern).toMatchTypeOf<PatternConfig>()
    expectTypeOf(range).toMatchTypeOf<RangeConfig>()
    expectTypeOf(constant).toMatchTypeOf<ConstantConfig>()
    expectTypeOf(template).toMatchTypeOf<TemplateConfig>()
  })

  it('DataTypeRef satisfies interface shape', () => {
    const ref: DataTypeRef = { type: 'string' as BuiltInType }
    expectTypeOf(ref).toMatchTypeOf<DataTypeRef>()
  })

  it('SchemaConstraints satisfies interface shape', () => {
    const constraints: SchemaConstraints = { minLength: 1, maxLength: 100, pattern: '^[A-Z]+$' }
    expectTypeOf(constraints).toMatchTypeOf<SchemaConstraints>()
  })

  it('SchemaElement satisfies interface shape', () => {
    const element: SchemaElement = {
      name: 'orderId',
      required: true,
      dataType: { type: 'string' },
      generationStrategy: { type: 'pattern', config: { pattern: 'ORD-[A-Z0-9]{8}' } }
    }
    expectTypeOf(element).toMatchTypeOf<SchemaElement>()
  })

  it('Schema satisfies interface shape', () => {
    const schema: Schema = {
      id: 'sch-1',
      systemId: 'sys-1',
      name: 'OrderPlaced Event',
      elements: [],
      createdAt: '2026-01-16T10:00:00.000Z',
      updatedAt: '2026-02-18T16:45:00.000Z'
    }
    expectTypeOf(schema).toMatchTypeOf<Schema>()
  })

  it('CustomDataType satisfies interface shape', () => {
    const customType: CustomDataType = {
      id: 'ctype-1',
      systemId: 'sys-1',
      name: 'AccountId',
      baseType: 'string',
      defaultStrategy: { type: 'pattern', config: { pattern: 'ACCT-[A-Z0-9]{12}' } }
    }
    expectTypeOf(customType).toMatchTypeOf<CustomDataType>()
  })
})

describe('shared models — Profile', () => {
  it('ProfileOverride satisfies interface shape', () => {
    const override: ProfileOverride = {
      elementPath: 'amount',
      action: 'set' as OverrideAction,
      value: 8500.0
    }
    expectTypeOf(override).toMatchTypeOf<ProfileOverride>()
  })

  it('Profile satisfies interface shape', () => {
    const profile: Profile = {
      id: 'prof-1',
      systemId: 'sys-1',
      name: 'High-Value Order',
      overrides: [{ elementPath: 'amount', action: 'set', value: 8500.0 }],
      createdAt: '2026-01-20T08:00:00.000Z',
      updatedAt: '2026-02-12T13:15:00.000Z'
    }
    expectTypeOf(profile).toMatchTypeOf<Profile>()
  })
})

describe('shared models — Template', () => {
  it('TemplateField satisfies interface shape', () => {
    const field: TemplateField = { elementPath: 'currency', value: 'USD', omitted: false }
    expectTypeOf(field).toMatchTypeOf<TemplateField>()
  })

  it('Template satisfies interface shape', () => {
    const template: Template = {
      id: 'tmpl-1',
      systemId: 'sys-1',
      folderId: null,
      name: 'Standard USD Order',
      schemaId: 'sch-1',
      inputId: 'inp-1',
      profileIds: [],
      fields: [],
      createdAt: '2026-02-01T10:00:00.000Z',
      updatedAt: '2026-02-18T15:30:00.000Z'
    }
    expectTypeOf(template).toMatchTypeOf<Template>()
  })

  it('TemplateFolder satisfies interface shape', () => {
    const folder: TemplateFolder = {
      id: 'fold-1',
      systemId: 'sys-1',
      parentId: null,
      name: 'Orders'
    }
    expectTypeOf(folder).toMatchTypeOf<TemplateFolder>()
  })

  it('TemplateTree satisfies interface shape', () => {
    const tree: TemplateTree = { folders: [], templates: [] }
    expectTypeOf(tree).toMatchTypeOf<TemplateTree>()
  })

  it('TemplateFolderNode satisfies interface shape', () => {
    const node: TemplateFolderNode = {
      folder: { id: 'fold-1', systemId: 'sys-1', parentId: null, name: 'Orders' },
      children: [],
      templates: []
    }
    expectTypeOf(node).toMatchTypeOf<TemplateFolderNode>()
  })
})

describe('shared models — Session', () => {
  it('SessionEvent satisfies interface shape', () => {
    const event: SessionEvent = {
      id: 'sevt-1',
      sessionId: 'sess-1',
      direction: 'sent' as EventDirection,
      timestamp: '2026-02-22T10:05:32.000Z',
      payload: { orderId: 'ORD-X7K9M2P4' },
      status: 'success' as EventStatus
    }
    expectTypeOf(event).toMatchTypeOf<SessionEvent>()
  })

  it('Session satisfies interface shape', () => {
    const session: Session = {
      id: 'sess-1',
      systemId: 'sys-1',
      createdAt: '2026-02-22T10:00:00.000Z',
      updatedAt: '2026-02-22T10:45:00.000Z'
    }
    expectTypeOf(session).toMatchTypeOf<Session>()
  })

  it('SessionDetail satisfies interface shape', () => {
    const detail: SessionDetail = {
      id: 'sess-1',
      systemId: 'sys-1',
      createdAt: '2026-02-22T10:00:00.000Z',
      updatedAt: '2026-02-22T10:45:00.000Z',
      events: [],
      logs: []
    }
    expectTypeOf(detail).toMatchTypeOf<SessionDetail>()
  })
})

describe('shared models — Listener', () => {
  it('ListenerConfig satisfies interface shape', () => {
    const config: ListenerConfig = {
      outputId: 'out-1',
      sessionId: 'sess-1'
    }
    expectTypeOf(config).toMatchTypeOf<ListenerConfig>()
  })

  it('JsonPathFilterConfig satisfies interface shape', () => {
    const config: JsonPathFilterConfig = {
      path: '$.status',
      operator: 'equals',
      value: 'PROCESSING'
    }
    expectTypeOf(config).toMatchTypeOf<JsonPathFilterConfig>()
  })

  it('RegexFilterConfig satisfies interface shape', () => {
    const config: RegexFilterConfig = { pattern: '^WH-EAST-', flags: 'i', targetPath: '$.warehouseId' }
    expectTypeOf(config).toMatchTypeOf<RegexFilterConfig>()
  })

  it('ListenerFilter satisfies interface shape', () => {
    const filter: ListenerFilter = {
      type: 'jsonpath' as ListenerFilterType,
      config: { path: '$.status', operator: 'equals', value: 'OK' }
    }
    expectTypeOf(filter).toMatchTypeOf<ListenerFilter>()
  })

  it('ListenerStatus satisfies interface shape', () => {
    const status: ListenerStatus = {
      listenerId: 'lsnr-1',
      outputId: 'out-1',
      sessionId: 'sess-1',
      status: 'running' as ListenerLifecycleState,
      eventsReceived: 3
    }
    expectTypeOf(status).toMatchTypeOf<ListenerStatus>()
  })

  it('ListenerLifecycleEvent satisfies interface shape', () => {
    const event: ListenerLifecycleEvent = {
      listenerId: 'lsnr-1',
      outputId: 'out-1',
      sessionId: 'sess-1',
      state: 'running' as ListenerLifecycleState,
      timestamp: '2026-02-22T10:04:00.120Z'
    }
    expectTypeOf(event).toMatchTypeOf<ListenerLifecycleEvent>()
  })

  it('ListenerDataEvent satisfies interface shape', () => {
    const dataEvent: ListenerDataEvent = {
      listenerId: 'lsnr-1',
      sessionId: 'sess-1',
      event: {
        id: 'sevt-1',
        sessionId: 'sess-1',
        direction: 'received',
        timestamp: '2026-02-22T10:05:35.200Z',
        payload: {},
        status: 'success'
      }
    }
    expectTypeOf(dataEvent).toMatchTypeOf<ListenerDataEvent>()
  })

  it('ListenerErrorEvent satisfies interface shape', () => {
    const errorEvent: ListenerErrorEvent = {
      listenerId: 'lsnr-1',
      error: 'connection failed',
      timestamp: '2026-02-22T10:10:00.000Z'
    }
    expectTypeOf(errorEvent).toMatchTypeOf<ListenerErrorEvent>()
  })

  it('ListenerStartResult satisfies interface shape', () => {
    const result: ListenerStartResult = {
      listenerId: 'lsnr-1',
      status: 'starting' as ListenerLifecycleState
    }
    expectTypeOf(result).toMatchTypeOf<ListenerStartResult>()
  })

  it('ListenerStopReason is a valid string union type', () => {
    const reason: ListenerStopReason = 'user-request'
    expectTypeOf(reason).toMatchTypeOf<ListenerStopReason>()
  })

  it('ListenerFilterMode is a valid string union type', () => {
    const mode: ListenerFilterMode = 'all'
    expectTypeOf(mode).toMatchTypeOf<ListenerFilterMode>()
  })
})

describe('shared models — Event Generation', () => {
  it('ValidationWarning satisfies interface shape', () => {
    const warning: ValidationWarning = {
      elementPath: 'shippingAddress.zip',
      message: "Value '4540' does not match pattern",
      severity: 'warning'
    }
    expectTypeOf(warning).toMatchTypeOf<ValidationWarning>()
  })

  it('GenerateEventInput satisfies interface shape', () => {
    const input: GenerateEventInput = {
      schemaId: 'sch-1'
    }
    expectTypeOf(input).toMatchTypeOf<GenerateEventInput>()
  })

  it('GeneratedEvent satisfies interface shape', () => {
    const event: GeneratedEvent = {
      schemaId: 'sch-1',
      payload: { orderId: 'ORD-X7K9M2P4' },
      appliedProfiles: [],
      warnings: []
    }
    expectTypeOf(event).toMatchTypeOf<GeneratedEvent>()
  })

  it('SendEventInput satisfies interface shape', () => {
    const input: SendEventInput = {
      inputId: 'inp-1',
      sessionId: 'sess-1',
      event: {
        schemaId: 'sch-1',
        payload: {},
        appliedProfiles: [],
        warnings: []
      },
      awsProfile: 'dev-account'
    }
    expectTypeOf(input).toMatchTypeOf<SendEventInput>()
  })

  it('SendEventResult satisfies interface shape', () => {
    const result: SendEventResult = {
      success: true,
      sessionEventId: 'sevt-1'
    }
    expectTypeOf(result).toMatchTypeOf<SendEventResult>()
  })

  it('ValidationResult satisfies interface shape', () => {
    const result: ValidationResult = { valid: true, warnings: [] }
    expectTypeOf(result).toMatchTypeOf<ValidationResult>()
  })
})

describe('shared models — AWS', () => {
  it('AWSProfile satisfies interface shape', () => {
    const profile: AWSProfile = {
      name: 'dev-account',
      source: 'credentials-file',
      region: 'us-east-1'
    }
    expectTypeOf(profile).toMatchTypeOf<AWSProfile>()
  })

  it('CredentialValidation satisfies interface shape', () => {
    const validation: CredentialValidation = {
      valid: true,
      identity: { account: '123456789012', arn: 'arn:aws:iam::123456789012:user/developer' }
    }
    expectTypeOf(validation).toMatchTypeOf<CredentialValidation>()
  })
})

describe('shared models — Log', () => {
  it('LogEntry satisfies interface shape', () => {
    const entry: LogEntry = {
      id: 'log-1',
      timestamp: '2026-02-22T10:05:31.500Z',
      level: 'info' as LogLevel,
      source: 'events',
      message: 'Sending event to Kinesis'
    }
    expectTypeOf(entry).toMatchTypeOf<LogEntry>()
  })
})

describe('shared models — AppSettings', () => {
  it('AppSettings satisfies interface shape', () => {
    const settings: AppSettings = {
      sessionHistoryLimit: 10,
      defaultRegion: 'us-east-1',
      theme: 'dark',
      dataDirectory: '/data',
      logLevel: 'info'
    }
    expectTypeOf(settings).toMatchTypeOf<AppSettings>()
  })
})

describe('shared dto — systems', () => {
  it('CreateSystemInput satisfies interface shape', () => {
    const input: CreateSystemInput = { name: 'My System' }
    expectTypeOf(input).toMatchTypeOf<CreateSystemInput>()
  })

  it('UpdateSystemInput satisfies interface shape', () => {
    const input: UpdateSystemInput = { name: 'Updated Name' }
    expectTypeOf(input).toMatchTypeOf<UpdateSystemInput>()
  })

  it('ExportedSystem satisfies interface shape', () => {
    const exported: ExportedSystem = {
      system: {
        id: 'sys-1',
        name: 'My System',
        inputs: [],
        outputs: [],
        createdAt: '2026-01-15T09:30:00.000Z',
        updatedAt: '2026-02-20T14:22:00.000Z'
      },
      schemas: [],
      environments: [],
      profiles: [],
      templates: [],
      templateFolders: [],
      customTypes: []
    }
    expectTypeOf(exported).toMatchTypeOf<ExportedSystem>()
  })
})

describe('shared dto — schemas', () => {
  it('CreateSchemaInput satisfies interface shape', () => {
    const input: CreateSchemaInput = { systemId: 'sys-1', name: 'My Schema', elements: [] }
    expectTypeOf(input).toMatchTypeOf<CreateSchemaInput>()
  })

  it('UpdateSchemaInput satisfies interface shape', () => {
    const input: UpdateSchemaInput = { name: 'Updated Schema' }
    expectTypeOf(input).toMatchTypeOf<UpdateSchemaInput>()
  })
})

describe('shared dto — environments', () => {
  it('CreateEnvInput satisfies interface shape', () => {
    const input: CreateEnvInput = { systemId: 'sys-1', name: 'Dev', variables: [] }
    expectTypeOf(input).toMatchTypeOf<CreateEnvInput>()
  })

  it('UpdateEnvInput satisfies interface shape', () => {
    const input: UpdateEnvInput = { name: 'Staging' }
    expectTypeOf(input).toMatchTypeOf<UpdateEnvInput>()
  })
})

describe('shared dto — profiles', () => {
  it('CreateProfileInput satisfies interface shape', () => {
    const input: CreateProfileInput = { systemId: 'sys-1', name: 'High-Value Order', overrides: [] }
    expectTypeOf(input).toMatchTypeOf<CreateProfileInput>()
  })

  it('UpdateProfileInput satisfies interface shape', () => {
    const input: UpdateProfileInput = { name: 'Cancelled Order' }
    expectTypeOf(input).toMatchTypeOf<UpdateProfileInput>()
  })
})

describe('shared dto — templates', () => {
  it('CreateTemplateInput satisfies interface shape', () => {
    const input: CreateTemplateInput = {
      systemId: 'sys-1',
      folderId: null,
      name: 'My Template',
      schemaId: 'sch-1',
      inputId: 'inp-1',
      profileIds: [],
      fields: []
    }
    expectTypeOf(input).toMatchTypeOf<CreateTemplateInput>()
  })

  it('UpdateTemplateInput satisfies interface shape', () => {
    const input: UpdateTemplateInput = { name: 'Updated Template' }
    expectTypeOf(input).toMatchTypeOf<UpdateTemplateInput>()
  })
})

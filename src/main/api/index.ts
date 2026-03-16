import { ApiRegistry } from './registry'
import { AppApi } from './app'
import { SystemsApi } from './systems'
import { SchemasApi } from './schemas'
import { EnvironmentsApi } from './environments'
import { CustomTypesApi } from './custom-types'
import { SessionsApi } from './sessions'
import { TemplatesApi } from './templates'
import { ProfilesApi } from './profiles'
import { EventsApi } from './events'
import { StorageService } from '../services/storage'
import { SettingsService } from '../services/settings.service'
import { EventGenerationService } from '../services/event-generation.service'
import { EventSenderService } from '../services/publishers/event-sender.service'
import { CloudService } from '../services/cloud.service'
import { PublisherFactory } from '../services/publishers/factory'
import { VariableReplacementService } from '../services/variable-replacement.service'

const storage = new StorageService()
const settings = new SettingsService(storage)

const cloud = new CloudService(storage, settings)
const publisherFactory = new PublisherFactory(cloud)
const variables = new VariableReplacementService()
const generation = new EventGenerationService()
const sender = new EventSenderService(storage, settings, publisherFactory, variables)

export const eventsApi = new EventsApi(storage, settings, generation, sender)

const apis = [
  new AppApi(settings),
  new SystemsApi(storage, settings),
  new SchemasApi(storage),
  new EnvironmentsApi(storage, settings),
  new CustomTypesApi(storage, settings),
  new SessionsApi(storage, settings),
  new TemplatesApi(storage, settings),
  new ProfilesApi(storage, settings),
  eventsApi
]

export default new ApiRegistry(
  ...apis
)

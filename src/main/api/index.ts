import { ApiRegistry } from './registry'
import { AppApi } from './app'
import { SystemsApi } from './systems'
import { SchemasApi } from './schemas'
import { EnvironmentsApi } from './environments'
import { CustomTypesApi } from './custom-types'
import { StorageService } from '../services/storage'
import { SettingsService } from '../services/settings.service'

const storage = new StorageService()
const settings = new SettingsService(storage)

const apis = [
  new AppApi(settings),
  new SystemsApi(storage, settings),
  new SchemasApi(storage),
  new EnvironmentsApi(storage, settings),
  new CustomTypesApi(storage, settings)
]

export default new ApiRegistry(
  ...apis
)

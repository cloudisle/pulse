import { ApiRegistry } from './registry'
import { AppApi } from './app'
import { SystemsApi } from './systems'
import { EnvironmentsApi } from './environments'
import { StorageService } from '../services/storage'
import { SettingsService } from '../services/settings.service'

const storage = new StorageService()
const settings = new SettingsService(storage)

const apis = [
  new AppApi(settings),
  new SystemsApi(storage, settings),
  new EnvironmentsApi(storage, settings)
]

export default new ApiRegistry(
  ...apis
)

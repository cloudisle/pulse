import { ApiRegistry } from './registry'
import { AppApi } from './app'
import { SystemsApi } from './systems'
import { StorageService } from '../services/storage'
import { SettingsService } from '../services/settings.service'

const storage = new StorageService()
const settings = new SettingsService(storage)

const apis = [
  new AppApi(storage),
  new SystemsApi(storage, settings)
]

export default new ApiRegistry(
  ...apis
)

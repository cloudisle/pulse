import { ApiRegistry } from './registry'
import { AppApi } from './app'
import { EnvironmentsApi } from './environments'
import { StorageService } from '../services/storage'
import { SettingsService } from '../services/settings.service'

const storage = new StorageService()
const settings = new SettingsService(storage)

export default new ApiRegistry(
  new AppApi(storage),
  new EnvironmentsApi(storage, settings)
)

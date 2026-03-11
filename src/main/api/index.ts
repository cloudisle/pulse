import { ApiRegistry } from './registry'
import { AppApi } from './app'

const Api = new ApiRegistry(new AppApi())

export default Api

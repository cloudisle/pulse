import { ApiRegistry } from './registry'
import { AppApi } from './app'
import { SchemasApi } from './schemas'
import {StorageService} from "../services/storage";

const storage = new StorageService();

const apis = [
    new AppApi(storage),
    new SchemasApi(storage),
]

export default new ApiRegistry(
    ...apis,
);

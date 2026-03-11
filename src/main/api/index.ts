import { ApiRegistry } from './registry'
import { AppApi } from './app'
import {StorageService} from "../services/storage";

const storage = new StorageService();

const apis = [
    new AppApi(storage),
]

export default new ApiRegistry(
    ...apis,
);

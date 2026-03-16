import type { Api } from '../../shared/api'
import {CloudService, PutMode} from "../services/cloud.service";

export class CloudApi implements Api {

    readonly api = "cloud"

    readonly cloud: CloudService;

    constructor(cloud: CloudService) {
        this.cloud = cloud;
    }

    async get(platform: string, key?: string): Promise<any> {
        return this.cloud.get(platform, key);
    }

    async put(platform: string, key: string, data: Record<string, any>): Promise<void> {
        await this.cloud.put(platform, key, data);
    }

    async putAll(platform: string, data: Record<string, any>, mode: PutMode = PutMode.MERGE): Promise<void> {
        await this.cloud.putAll(platform, data, mode);
    }

}
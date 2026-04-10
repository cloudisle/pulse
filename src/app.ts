import {app, api, channel} from "@cloudisle/electron-app";
import {ListenerDataEvent, ListenerErrorEvent, ListenerLifecycleEvent, LogEntry} from "@shared/models";
import {SchemasApi} from "@main/api/schemas";
import {ProfilesApi} from "@main/api/profiles";
import {ListenersApi} from "@main/api/listeners";
import {StorageService} from "@main/services/storage.service";
import {SettingsService} from "@main/services/settings.service";
import {AppApi} from "@main/api/app";
import {SystemsApi} from "@main/api/systems";
import {EnvironmentsApi} from "@main/api/environments";
import {CustomTypesApi} from "@main/api/custom-types";
import {SessionsApi} from "@main/api/sessions";
import {TemplatesApi} from "@main/api/templates";
import {OpenApiImportApi} from "@main/api/openapi-import";
import {ListenerFactory, ListenerLifecycleFactory} from "@main/services/listeners/factory";
import {ConverterFactory} from "@main/services/listeners/converter";
import {FilterFactory} from "@main/services/listeners/filter";
import {AwsApi} from "@main/api/aws";
import {EventsApi} from "@main/api/events";
import {EventSenderService} from "@main/services/publishers/event-sender.service";
import {EventGenerationService} from "@main/services/event-generation.service";
import {PublisherFactory} from "@main/services/publishers/factory";
import {ListenerManagerService} from "@main/services/listeners/listener-manager.service";
import { SessionSentValueIndexService } from '@main/services/listeners/session-sent-value-index.service';

const storage = new StorageService();
const settings = new SettingsService(storage);
const generation = new EventGenerationService();

const listenerFactory = new ListenerFactory();
const converterFactory = new ConverterFactory();
const sentValueIndex = new SessionSentValueIndexService(storage, settings);
const filterFactory = new FilterFactory(sentValueIndex);
const publisherFactory = new PublisherFactory();
const lifecycleFactory = new ListenerLifecycleFactory(listenerFactory, converterFactory, filterFactory);

const events = new EventSenderService(storage, settings, publisherFactory, sentValueIndex);
const manager = new ListenerManagerService(lifecycleFactory, sentValueIndex);

export { settings, manager }
export default app({
    apis: {
        app: api(new AppApi(settings)),
        aws: api(new AwsApi()),
        systems: api(new SystemsApi(storage, settings)),
        schemas: api(new SchemasApi(storage, settings)),
        environments: api(new EnvironmentsApi(storage, settings)),
        customTypes: api(new CustomTypesApi(storage, settings)),
        sessions: api(new SessionsApi(storage, settings)),
        templates: api(new TemplatesApi(storage, settings)),
        profiles: api(new ProfilesApi(storage, settings)),
        events: api(new EventsApi(storage, settings, generation, events)),
        listeners: api(new ListenersApi(storage, settings, manager)),
        openapiImport: api(new OpenApiImportApi()),
    },
    channels: {
        listeners: {
            lifecycle: channel<ListenerLifecycleEvent>(),
            data: channel<ListenerDataEvent>(),
            error: channel<ListenerErrorEvent>()
        },
        log: {
            entry: channel<LogEntry>()
        }
    }
})
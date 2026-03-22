import {app, api, channel} from "./app/index";
import {ListenerDataEvent, ListenerErrorEvent, ListenerLifecycleEvent, LogEntry} from "./shared/models";
import {SchemasApi} from "./main/api/schemas";
import {ProfilesApi} from "./main/api/profiles";
import {ListenersApi} from "./main/api/listeners";
import {StorageService} from "./main/services/storage";
import {SettingsService} from "./main/services/settings.service";
import {AppApi} from "./main/api/app";
import {SystemsApi} from "./main/api/systems";
import {EnvironmentsApi} from "./main/api/environments";
import {CustomTypesApi} from "./main/api/custom-types";
import {SessionsApi} from "./main/api/sessions";
import {TemplatesApi} from "./main/api/templates";
import {PushService} from "./main/services/push.service";
import {ListenerFactory, ListenerLifecycleFactory} from "./main/services/listeners/factory";
import {BrowserWindow} from "electron";
import {CloudService} from "./main/services/cloud.service";
import {ConverterFactory} from "./main/services/listeners/converter";
import {FilterFactory} from "./main/services/listeners/filter";
import {AwsApi} from "./main/api/aws";
import {EventsApi} from "./main/api/events";
import {EventSenderService} from "./main/services/publishers/event-sender.service";
import {EventGenerationService} from "./main/services/event-generation.service";
import {PublisherFactory} from "./main/services/publishers/factory";

const storage = new StorageService();
const settings = new SettingsService(storage);
const cloud = new CloudService(storage, settings);
const generation = new EventGenerationService();

const listenerFactory = new ListenerFactory(cloud);
const converterFactory = new ConverterFactory();
const filterFactory = new FilterFactory();
const publisherFactory = new PublisherFactory(cloud);

const events = new EventSenderService(storage, settings, publisherFactory);

const lifecycleFactoryProvider = (window: BrowserWindow) => {
    const pushService = new PushService(window);
    return new ListenerLifecycleFactory(
        pushService,
        listenerFactory,
        converterFactory,
        filterFactory
    )
}

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
        listeners: api(new ListenersApi(storage, settings, lifecycleFactoryProvider)),
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
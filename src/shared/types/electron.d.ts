import App from '../../app'

type ExposedAppConfig = ReturnType<typeof App.expose>

export interface IElectronAPI {
  platform: string
  api: ExposedAppConfig['apis']
  channels: ExposedAppConfig['channels']
}

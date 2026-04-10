import type { Configuration } from 'electron-builder'

const config: Configuration = {
  appId: 'com.cloudisle.pulse',
  productName: 'Pulse',
  copyright: 'Copyright © 2026 cloudisle',
  directories: {
    buildResources: 'resources'
  },
  files: [
    'out/**/*',
    '!out/**/*.map'
  ],
  mac: {
    target: [
      {
        target: 'dmg',
        arch: ['x64', 'arm64']
      }
    ],
    category: 'public.app-category.developer-tools'
  },
  win: {
    target: [
      {
        target: 'nsis',
        arch: ['x64']
      }
    ]
  },
  linux: {
    target: ['AppImage', 'deb'],
    category: 'Development'
  },
  nsis: {
    oneClick: false,
    allowToChangeInstallationDirectory: true
  }
}

export default config

import { test, expect } from '@playwright/test'
import { _electron as electron } from 'playwright'
import path from 'path'

test('app window opens', async () => {
  const electronApp = await electron.launch({
    args: ['--no-sandbox', path.join(__dirname, '../../out/main/index.js')]
  })

  const window = await electronApp.firstWindow()

  expect(window).not.toBeNull()

  const title = await window.title()
  expect(typeof title).toBe('string')

  await electronApp.close()
})

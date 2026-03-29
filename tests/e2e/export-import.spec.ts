import { test, expect } from '@playwright/test'
import { _electron as electron, type ElectronApplication, type Page } from 'playwright'
import path from 'path'
import os from 'os'
import fs from 'fs'

let electronApp: ElectronApplication
let window: Page
let tmpDir: string

test.beforeAll(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-e2e-export-'))

  electronApp = await electron.launch({
    args: ['--no-sandbox', path.join(__dirname, '../../out/main/index.js')]
  })

  window = await electronApp.firstWindow()
})

test.afterAll(async () => {
  await electronApp.close()
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

test('export → import round-trip creates a new system in the sidebar', async () => {
  const exportFilePath = path.join(tmpDir, 'exported-system.json')

  // Step 1: Create a system via the UI
  await window.click('[title="Create system"]')

  await window.fill('#sys-name', 'Export Test System')
  await window.fill('#sys-desc', 'Created for export/import testing')
  await window.click('button:has-text("Save")')

  // Wait for the system to appear in the sidebar select
  await window.waitForSelector('option:has-text("Export Test System")')

  // Step 2: Select the system in the sidebar to enable the Edit button
  await window.selectOption('.sidebar__system-select', { label: 'Export Test System' })

  // Click the edit button (✎) for the selected system
  await window.click('.sidebar__edit-btn')

  // Wait for the system editor to be visible with the Export button
  await window.waitForSelector('button:has-text("Export")')

  // Step 3: Mock the dialog.showSaveDialog to return our temp file path
  await electronApp.evaluate(
    async ({ dialog }, { filePath }) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath })
    },
    { filePath: exportFilePath }
  )

  // Click the Export button
  await window.click('button:has-text("Export")')

  // Wait for the export file to be written — poll from the Node.js side
  await expect(async () => {
    fs.accessSync(exportFilePath)
  }).toPass({ timeout: 5000 })

  // Verify the exported file exists and is valid JSON
  const exportedContent = fs.readFileSync(exportFilePath, 'utf-8')
  const exportedData = JSON.parse(exportedContent)
  expect(exportedData.system.name).toBe('Export Test System')

  // Step 4: Mock dialog.showOpenDialog to return our temp file path
  await electronApp.evaluate(
    async ({ dialog }, { filePath }) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [filePath] })
    },
    { filePath: exportFilePath }
  )

  // Click the Import System button (↑ icon in the Systems section header)
  await window.click('[title="Import system"]')

  // Wait for the new imported system to appear in the sidebar
  // The imported system will have the same name as the original (or similar)
  await window.waitForFunction(
    () => {
      const options = Array.from(document.querySelectorAll('.sidebar__system-select option'))
      return options.filter((opt) => (opt as HTMLOptionElement).text === 'Export Test System').length >= 2
    },
    { timeout: 10000 }
  )

  // Verify two systems with that name exist (original + imported)
  const systemOptions = await window.$$eval(
    '.sidebar__system-select option',
    (opts) => opts.map((o) => (o as HTMLOptionElement).text)
  )
  const matchingNames = systemOptions.filter((name) => name === 'Export Test System')
  expect(matchingNames.length).toBeGreaterThanOrEqual(2)
})

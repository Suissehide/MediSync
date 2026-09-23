import { buildTestApp, type TestApp } from './setup/app'
import { testDb, truncateAll } from './setup/db'

describe('GET /health', () => {
  let testApp: TestApp

  beforeAll(async () => {
    await truncateAll()
    testApp = await buildTestApp()
  })

  afterAll(async () => {
    await testApp.close()
    await testDb.$disconnect()
  })

  it('repond 200 sans session', async () => {
    const res = await testApp.app.inject({ method: 'GET', url: '/health' })
    expect(res.statusCode).toBe(200)
  })
})

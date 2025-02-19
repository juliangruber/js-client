import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { describe, it, before, after } from 'node:test'
import { getMockServer, mockJWT, MSW_SERVER_OPTS } from './test-utils.js'
import { Saturn } from '#src/index.js'

const TEST_CID = 'QmXjYBY478Cno4jzdCcPy4NcJYFrwHZ51xaCP8vUwN9MGm'
const TEST_AUTH = 'https://fz3dyeyxmebszwhuiky7vggmsu0rlkoy.lambda-url.us-west-2.on.aws/'
const clientKey = 'abc123'

describe('Saturn client', () => {
  describe('constructor', () => {
    it('should work w/o custom client ID', () => {
      new Saturn({ clientKey }) // eslint-disable-line
    })

    it('should work with custom client ID', () => {
      const clientId = randomUUID()
      const saturn = new Saturn({ clientId, clientKey })
      assert.strictEqual(saturn.config.clientId, clientId)
    })

    it('should work with custom CDN URL', () => {
      const cdnURL = 'custom.com'
      const saturn = new Saturn({ cdnURL, clientKey })
      assert.strictEqual(saturn.config.cdnURL, cdnURL)
    })

    it('should work with custom connect timeout', () => {
      const saturn = new Saturn({ connectTimeout: 1234, clientKey })
      assert.strictEqual(saturn.config.connectTimeout, 1234)
    })

    it('should work with custom download timeout', () => {
      const saturn = new Saturn({ downloadTimeout: 3456, clientKey })
      assert.strictEqual(saturn.config.downloadTimeout, 3456)
    })
  })

  describe('Fetch a CID', () => {
    const client = new Saturn({ clientKey, authURL: TEST_AUTH })
    const handlers = [
      mockJWT(TEST_AUTH)
    ]
    const server = getMockServer(handlers)

    before(() => {
      server.listen(MSW_SERVER_OPTS)
    })
    after(() => {
      server.close()
    })
    it('should fetch test CID', async () => {
      const { res } = await client.fetchCID(TEST_CID)
      assert(res instanceof Response)
    })

    it('should fail to fetch non CID', async () => {
      await assert.rejects(client.fetchCID('a'))
    })

    it('should fail when exceeding connection timeout', async () => {
      await assert.rejects(client.fetchCID(TEST_CID, { connectTimeout: 1 }))
    })

    it('should use external abort controller', async () => {
      const controller = new AbortController()
      setTimeout(() => controller.abort(), 5)

      await assert.rejects(
        client.fetchCID(TEST_CID, { controller }),
        {
          name: 'AbortError',
          message: 'This operation was aborted'
        }
      )
    })

    it.skip('should fail when exceeding download timeout', async () => {
      await assert.rejects(client.fetchCID(`${TEST_CID}/blah`, { downloadTimeout: 1 }))
    })
  })

  describe('Logging', () => {
    const handlers = [
      mockJWT(TEST_AUTH)
    ]
    const server = getMockServer(handlers)
    const client = new Saturn({ clientKey, clientId: 'tesd', authURL: TEST_AUTH })
    before(() => {
      server.listen(MSW_SERVER_OPTS)
    })
    after(() => {
      server.close()
    })
    it('should create a log on fetch success', async () => {
      client.reportingLogs = true
      for await (const _ of client.fetchContent(TEST_CID)) {} // eslint-disable-line

      const log = client.logs.pop()

      assert(Number.isFinite(log.ttfbMs) && log.ttfbMs > 0)
      assert.strictEqual(log.httpStatusCode, 200)
      assert(Number.isFinite(log.numBytesSent) && log.numBytesSent > 0)
      assert(Number.isFinite(log.requestDurationSec) && log.requestDurationSec > 0)
      assert(!log.ifNetworkError)
    })

    it('should create a log on fetch network error', async () => {
      await assert.rejects(client.fetchContentBuffer(TEST_CID, { connectTimeout: 1 }))
      const log = client.logs.pop()
      assert.strictEqual(log.error, 'This operation was aborted')
    })
  })
})

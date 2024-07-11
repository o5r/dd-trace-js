'use strict'

const {
  FakeAgent,
  createSandbox,
  spawnPluginIntegrationTestProc
} = require('../../../../integration-tests/helpers')
const { expect } = require('chai')

describe('esm', () => {
  let agent
  let proc
  let sandbox

  withVersions('pino', 'pino', version => {
    before(async function () {
      sandbox = await createSandbox([`'pino@${version}'`],
        false, ['./packages/datadog-plugin-pino/test/integration-test/*'])
    }, { timeout: 20000 })

    after(async () => {
      await sandbox.remove()
    })

    beforeEach(async () => {
      agent = await new FakeAgent().start()
    })

    afterEach(async () => {
      proc && proc.kill()
      await agent.stop()
    })

    it('is instrumented', async () => {
      proc = await spawnPluginIntegrationTestProc(
        sandbox.folder,
        'server.mjs',
        agent.port,
        (data) => {
          const jsonObject = JSON.parse(data.toString())
          expect(jsonObject).to.have.property('dd')
        }
      )
    }).timeout(20000)
  })
})

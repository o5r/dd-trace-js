'use strict'

const proxyquire = require('proxyquire')

describe('module', () => {
  let llmobsModule
  let openai
  let injectCh
  let handleLLMObsSpan
  let registerPlugins
  let logger

  let handleLLMObsParentIdInjection
  let store

  function createStubChannel () {
    const ch = {}

    ch._subscriberCount = 0
    ch.subscribe = sinon.stub().callsFake((handler) => {
      if (handler.name === 'handleLLMObsParentIdInjection') {
        handleLLMObsParentIdInjection = handler
      }
      ch._subscriberCount++
    })
    ch.unsubscribe = sinon.stub()

    Object.defineProperty(ch, 'hasSubscribers', {
      get () {
        return ch._subscriberCount > 0
      }
    })

    return ch
  }

  beforeEach(() => {
    openai = createStubChannel()
    injectCh = createStubChannel()

    handleLLMObsSpan = sinon.stub()
    registerPlugins = sinon.stub()

    logger = {
      warn: sinon.stub()
    }

    store = {}
    llmobsModule = proxyquire('../../src/llmobs', {
      './integrations/channels': {
        openai,
        injectCh
      },
      './integrations': {
        handleLLMObsSpan,
        registerPlugins
      },
      '../log': logger,
      '../../../datadog-core': {
        storage: {
          getStore () {
            return store
          }
        }
      }
    })
  })

  after(() => {
    // this will cause integration tests to error otherwise
    delete require.cache[require.resolve('../../src/llmobs')]
  })

  it('enables', () => {
    const config = {}
    llmobsModule.enable(config)

    expect(registerPlugins).to.have.been.calledWith(config)
    expect(openai.subscribe).to.have.been.called
    expect(injectCh.subscribe).to.have.been.calledWith(handleLLMObsParentIdInjection)
  })

  it('disables without active subscribers', () => {
    llmobsModule.disable()

    expect(openai.unsubscribe).to.not.have.been.called
    expect(injectCh.unsubscribe).to.not.have.been.called
  })

  it('disables with active subscribers', () => {
    llmobsModule.enable({})
    llmobsModule.disable()

    expect(openai.unsubscribe).to.have.been.called
    expect(injectCh.unsubscribe).to.have.been.calledWith(handleLLMObsParentIdInjection)
  })

  it('injects LLMObs parent ID when there is a parent LLMObs span', () => {
    llmobsModule.enable({})
    store.llmobsSpan = {
      context () {
        return {
          toSpanId () {
            return 'parent-id'
          }
        }
      }
    }

    const carrier = {
      'x-datadog-tags': ''
    }
    handleLLMObsParentIdInjection({ carrier })

    expect(carrier['x-datadog-tags']).to.equal(',_dd.p.llmobs_parent_id=parent-id')
  })

  it('does not inject LLMObs parent ID when there is no parent LLMObs span', () => {
    llmobsModule.enable({})

    const carrier = {
      'x-datadog-tags': ''
    }
    handleLLMObsParentIdInjection({ carrier })
    expect(logger.warn).to.have.been.calledWith('No active span to inject LLMObs info.')
    expect(carrier['x-datadog-tags']).to.equal('')
  })
})

'use strict'

const { handleLLMObsSpan, registerPlugins } = require('./integrations')
const { injectCh, openai } = require('./integrations/channels')

const log = require('../log')
const { PROPAGATED_PARENT_ID_KEY } = require('./constants')
const { storage } = require('../../../datadog-core')

// TODO make this more generic once we have more integrations
const openaiHandler = ctx => handleLLMObsSpan('openai', ctx)

function enable (config) {
  registerPlugins(config)
  openai.subscribe(openaiHandler) // openai integration
  injectCh.subscribe(handleLLMObsParentIdInjection) // inject LLMObs info for distributed tracing
}

function disable () {
  if (openai.hasSubscribers) openai.unsubscribe(openaiHandler)
  if (injectCh.hasSubscribers) injectCh.unsubscribe(handleLLMObsParentIdInjection)
}

function handleLLMObsParentIdInjection ({ carrier }) {
  const parent = storage.getStore()?.llmobsSpan
  if (!parent) {
    log.warn('No active span to inject LLMObs info.')
    return
  }

  const parentId = parent?.context().toSpanId()

  carrier['x-datadog-tags'] += `,${PROPAGATED_PARENT_ID_KEY}=${parentId}`
}

module.exports = { enable, disable }

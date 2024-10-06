'use strict'

const OpenAIIntegration = require('./openai')

const plugins = {}

function handleLLMObsSpan (integration, ctx) {
  const plugin = plugins[integration]
  if (plugin) plugin.setLLMObsTags(ctx)
}

function registerPlugins (config) {
  // TODO: maybe let LLMObs plugins be configurable
  plugins.openai = new OpenAIIntegration(config)
}

module.exports = {
  handleLLMObsSpan,
  registerPlugins
}

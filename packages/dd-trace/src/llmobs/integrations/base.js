'use strict'

const LLMObsTagger = require('../tagger')

class BaseLLMObsIntegration {
  constructor (config) {
    this._config = config
    this._tagger = new LLMObsTagger(config)
  }

  setLLMObsTags (ctx) {
    throw new Error('setLLMObsTags must be implemented by the LLMObs subclass')
  }
}

module.exports = BaseLLMObsIntegration

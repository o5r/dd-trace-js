'use strict'

const BaseLLMObsIntegration = require('./base')

const {
  MODEL_NAME,
  INPUT_TOKENS_METRIC_KEY,
  OUTPUT_TOKENS_METRIC_KEY,
  TOTAL_TOKENS_METRIC_KEY
} = require('../constants')

const logger = require('../../log')

class OpenAIIntegration extends BaseLLMObsIntegration {
  setLLMObsTags (ctx) {
    // methodName, args, and result are set by the APM OpenAI integration
    const span = ctx.currentStore?.span
    if (!span) {
      logger.warn('Tried to start an LLMObs OpenAI span without an active APM span. Not starting LLMObs span.')
      return
    }

    const resource = ctx.methodName
    const methodName = this._gateResource(this._normalizeOpenAIResourceName(resource))
    if (!methodName) return // we will not trace all openai methods for llmobs

    const parent = ctx.currentStore?.llmobsSpan
    const inputs = ctx.args[0] // completion, chat completion, and embeddings take one argument
    const response = ctx.result?.data // no result if error
    const error = !!span.context()._tags.error

    const name = `openai.${methodName}`

    const operation = this._getOperation(methodName)
    const kind = operation === 'embedding' ? 'embedding' : 'llm'

    this._tagger.setLLMObsSpanTags(span, kind, {
      modelProvider: 'openai',
      parentLLMObsSpan: parent
    }, name)

    if (operation === 'completion') {
      this._tagCompletion(span, inputs, response, error)
    } else if (operation === 'chat') {
      this._tagChatCompletion(span, inputs, response, error)
    } else if (operation === 'embedding') {
      this._tagEmbedding(span, inputs, response, error)
    }

    if (!error) {
      const tags = span.context()._tags
      this._tagger.tagMetrics(span, {
        [INPUT_TOKENS_METRIC_KEY]: tags['openai.response.usage.prompt_tokens'],
        [OUTPUT_TOKENS_METRIC_KEY]: tags['openai.response.usage.completion_tokens'],
        [TOTAL_TOKENS_METRIC_KEY]: tags['openai.response.usage.total_tokens']
      })
    }
  }

  _tagEmbedding (span, inputs, response, error) {
    const { model, ...parameters } = inputs
    if (model) span.setTag(MODEL_NAME, model)

    const metadata = {
      encoding_format: parameters.encoding_format || 'float'
    }
    if (inputs.dimensions) metadata.dimensions = inputs.dimensions
    this._tagger.tagMetadata(span, metadata)

    let embeddingInputs = inputs.input
    if (!Array.isArray(embeddingInputs)) embeddingInputs = [embeddingInputs]
    const embeddingInput = embeddingInputs.map(input => ({ text: input }))

    if (error) {
      this._tagger.tagEmbeddingIO(span, embeddingInput, undefined)
      return
    }

    const float = Array.isArray(response.data[0].embedding)
    let embeddingOutput
    if (float) {
      const embeddingDim = response.data[0].embedding.length
      embeddingOutput = `[${response.data.length} embedding(s) returned with size ${embeddingDim}]`
    } else {
      embeddingOutput = `[${response.data.length} embedding(s) returned]`
    }

    this._tagger.tagEmbeddingIO(span, embeddingInput, embeddingOutput)
  }

  _tagCompletion (span, inputs, response, error) {
    let { prompt, model, ...parameters } = inputs
    if (!Array.isArray(prompt)) prompt = [prompt]
    if (model) span.setTag(MODEL_NAME, model)

    const completionInput = prompt.map(p => ({ content: p }))

    const completionOutput = error ? [{ content: '' }] : response.choices.map(choice => ({ content: choice.text }))

    this._tagger.tagLLMIO(span, completionInput, completionOutput)
    this._tagger.tagMetadata(span, parameters)
  }

  _tagChatCompletion (span, inputs, response, error) {
    const { messages, model, ...parameters } = inputs
    if (model) span.setTag(MODEL_NAME, model)

    if (error) {
      this._tagger.tagLLMIO(span, messages, [{ content: '' }])
      return
    }

    const outputMessages = []
    const { choices } = response
    for (const choice of choices) {
      const message = choice.message || choice.delta
      const content = message.content || ''
      const role = message.role

      if (message.function_call) {
        const functionCallInfo = {
          name: message.function_call.name,
          arguments: JSON.parse(message.function_call.arguments)
        }
        outputMessages.push({ content, role, tool_calls: [functionCallInfo] })
      } else if (message.tool_calls) {
        const toolCallsInfo = []
        for (const toolCall of message.tool_calls) {
          const toolCallInfo = {
            arguments: JSON.parse(toolCall.function.arguments),
            name: toolCall.function.name,
            tool_id: toolCall.id,
            type: toolCall.type
          }
          toolCallsInfo.push(toolCallInfo)
        }
        outputMessages.push({ content, role, tool_calls: toolCallsInfo })
      } else {
        outputMessages.push({ content, role })
      }
    }

    this._tagger.tagLLMIO(span, messages, outputMessages)

    const metadata = Object.entries(parameters).reduce((obj, [key, value]) => {
      if (!['tools', 'functions'].includes(key)) {
        obj[key] = value
      }

      return obj
    }, {})

    this._tagger.tagMetadata(span, metadata)
  }

  _isEmbeddingOperation (resource) {
    return resource === 'createEmbedding'
  }

  // TODO: this will be moved to the APM integration
  _normalizeOpenAIResourceName (resource) {
    switch (resource) {
      // completions
      case 'completions.create':
        return 'createCompletion'

      // chat completions
      case 'chat.completions.create':
        return 'createChatCompletion'

      // embeddings
      case 'embeddings.create':
        return 'createEmbedding'
      default:
        return resource
    }
  }

  _gateResource (resource) {
    return ['createCompletion', 'createChatCompletion', 'createEmbedding'].includes(resource)
      ? resource
      : undefined
  }

  _getOperation (resource) {
    switch (resource) {
      case 'createCompletion':
        return 'completion'
      case 'createChatCompletion':
        return 'chat'
      case 'createEmbedding':
        return 'embedding'
      default:
        // should never happen
        return 'unknown'
    }
  }
}

module.exports = OpenAIIntegration

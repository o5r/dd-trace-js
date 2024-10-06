'use strict'

const { channel } = require('dc-polyfill')

module.exports = {
  injectCh: channel('dd-trace:span:inject'),
  openai: channel('tracing:apm:openai:request:asyncEnd')
}

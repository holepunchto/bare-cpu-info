const binding = require('./binding')
const constants = require('./lib/constants')

module.exports = exports = class CPUInfo {
  constructor() {
    this._destroyed = false

    binding.init(this)
  }

  query() {
    this._check()

    return normalizeCpu(binding.query(this))
  }

  features() {
    this._check()

    return binding.features(this)
  }

  sample() {
    this._check()

    return normalizeUsage(binding.sample(this))
  }

  coreCount() {
    this._check()

    return binding.coreCount(this)
  }

  coreUsage(index) {
    this._check()

    validateIndex(index, this.coreCount())

    return normalizeUsage(binding.coreUsage(this, index))
  }

  coreType(index) {
    this._check()

    validateIndex(index, this.coreCount())

    return binding.coreType(this, index)
  }

  coreFrequency(index) {
    this._check()

    validateIndex(index, this.coreCount())

    return binding.coreFrequency(this, index)
  }

  coreCache(index, level) {
    this._check()

    validateIndex(index, this.coreCount())

    validateInteger(level, 'Cache level')

    return binding.coreCache(this, index, level)
  }

  destroy() {
    if (this._destroyed) return

    this._destroyed = true

    binding.destroy(this)
  }

  [Symbol.dispose]() {
    this.destroy()
  }

  _check() {
    if (this._destroyed) {
      throw new Error('CPU information has been destroyed')
    }
  }
}

exports.CPUInfo = exports

exports.constants = constants

// The library reports an unknown string as empty; surface those as `null` so
// consumers can distinguish "unknown" from a genuine empty value.
function normalizeCpu(cpu) {
  if (cpu.name === '') cpu.name = null
  if (cpu.vendor === '') cpu.vendor = null

  return cpu
}

// The library reports an unavailable metric as a negative value; surface those
// as `undefined` so consumers can distinguish "unsupported" from a genuine `0`.
function normalizeUsage(usage) {
  if (usage.compute < 0) usage.compute = undefined

  return usage
}

function validateIndex(index, count) {
  if (!Number.isInteger(index)) {
    throw new TypeError(`Index must be an integer. Received type ${typeof index} (${index})`)
  }

  if (index < 0 || index >= count) {
    throw new RangeError(`Index ${index} out of range [0, ${count})`)
  }
}

function validateInteger(value, name) {
  if (!Number.isInteger(value)) {
    throw new TypeError(`${name} must be an integer. Received type ${typeof value} (${value})`)
  }
}

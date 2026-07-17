const test = require('brittle')
const CPUInfo = require('.')
const { constants } = CPUInfo

test('query', (t) => {
  using info = new CPUInfo()

  const cpu = info.query()

  t.comment(`${cpu.name} (${cpu.vendor}), ${cpu.arch}`)
  t.comment(`${cpu.physicalCores} physical, ${cpu.logicalCores} logical`)
  t.comment(
    cpu.memory === undefined
      ? 'memory unknown'
      : `${(cpu.memory / (1024 * 1024 * 1024)).toFixed(1)} GiB`
  )

  t.ok(cpu.name === null || typeof cpu.name === 'string', 'name is a string or null')
  t.ok(cpu.vendor === null || typeof cpu.vendor === 'string', 'vendor is a string or null')
  t.ok(Object.values(constants.arch).includes(cpu.arch), 'is a known arch')

  // A logical core count of zero would indicate detection failed entirely.
  t.ok(cpu.logicalCores > 0, 'has at least one logical core')
  t.ok(cpu.physicalCores > 0, 'has at least one physical core')
  t.ok(cpu.logicalCores >= cpu.physicalCores, 'logical cores >= physical cores')

  t.is(typeof cpu.performanceCores, 'number')
  t.is(typeof cpu.efficiencyCores, 'number')
  t.ok(cpu.frequency === undefined || typeof cpu.frequency === 'number', 'frequency')
  t.ok(cpu.cacheLine === undefined || typeof cpu.cacheLine === 'number', 'cacheLine')
  t.ok(cpu.memory === undefined || cpu.memory > 0, 'installed memory is positive or undefined')
  t.is(typeof cpu.features, 'object')
})

test('features', (t) => {
  using info = new CPUInfo()

  const features = info.features()

  const enabled = Object.keys(features).filter((key) => features[key])

  t.comment(enabled.join(' ') || '(none)')

  for (const key of Object.keys(features)) {
    t.is(typeof features[key], 'boolean', `${key} is a boolean`)
  }
})

test('sample', (t) => {
  using info = new CPUInfo()

  // The first sample reports a real reading; a zero-length interval reads as 0
  // rather than the unavailable sentinel. `undefined` only ever means compute
  // utilization cannot be measured on this platform.
  const usage = info.sample()

  t.comment(`compute ${(usage.compute * 100).toFixed(1)}%`)
  t.comment(`memory ${usage.memoryUsed} / ${usage.memoryTotal}`)

  t.is(typeof usage.compute, 'number', 'compute is a number')
  t.ok(usage.compute >= 0 && usage.compute <= 1, 'compute is in [0, 1]')
  t.ok(
    usage.memoryUsed === undefined || usage.memoryUsed >= 0,
    'memory used is non-negative or undefined'
  )
  t.ok(
    usage.memoryTotal === undefined || usage.memoryTotal > 0,
    'memory total is positive or undefined'
  )
})

test('core count and per-core usage', (t) => {
  using info = new CPUInfo()

  const cpu = info.query()

  const cores = info.coreCount()

  t.comment(`${cores} sampleable cores`)

  t.ok(cores > 0, 'has at least one sampleable core')
  t.ok(cores <= cpu.logicalCores, 'sampleable cores <= logical cores')

  // Sample to populate the per-core snapshot; before the first sample the
  // per-core readings are unavailable.
  info.sample()

  for (let i = 0; i < cores; i++) {
    const usage = info.coreUsage(i)

    // A core that cannot be measured (e.g. offline) reports `undefined`.
    t.ok(
      usage.compute === undefined || (usage.compute >= 0 && usage.compute <= 1),
      `core ${i} compute is in [0, 1] or undefined`
    )

    const type = info.coreType(i)

    t.ok(Object.values(constants.coreType).includes(type), `core ${i} has a known type`)

    const frequency = info.coreFrequency(i)

    t.ok(
      frequency === undefined || typeof frequency === 'number',
      `core ${i} frequency is a number or undefined`
    )

    for (const level of Object.values(constants.cache)) {
      const size = info.coreCache(i, level)

      t.ok(
        size === undefined || size > 0,
        `core ${i} cache level ${level} is positive or undefined`
      )
    }
  }
})

test('coreCache accepts cache-level constants', (t) => {
  using info = new CPUInfo()

  for (const level of Object.values(constants.cache)) {
    const size = info.coreCache(0, level)

    t.ok(size === undefined || size > 0, `cache level ${level} is positive or undefined`)
  }
})

test('per-core methods throw on out-of-range index', (t) => {
  using info = new CPUInfo()

  const cores = info.coreCount()

  for (const method of ['coreUsage', 'coreType', 'coreFrequency']) {
    t.exception.all(() => info[method](cores), /out of range/i, `${method} rejects count`)
    t.exception.all(() => info[method](-1), /out of range/i, `${method} rejects -1`)
  }

  t.exception.all(
    () => info.coreCache(cores, constants.cache.L1D),
    /out of range/i,
    'coreCache rejects count'
  )
})

test('per-core methods throw on non-integer index', (t) => {
  using info = new CPUInfo()

  for (const method of ['coreUsage', 'coreType', 'coreFrequency']) {
    t.exception.all(() => info[method](0.5), /must be an integer/i, `${method} rejects 0.5`)
    t.exception.all(() => info[method]('0'), /must be an integer/i, `${method} rejects '0'`)
  }

  t.exception.all(
    () => info.coreCache(0.5, constants.cache.L1D),
    /must be an integer/i,
    'coreCache rejects 0.5'
  )
})

test('coreCache throws on non-integer level', (t) => {
  using info = new CPUInfo()

  t.exception.all(() => info.coreCache(0, 'l1d'), /cache level must be an integer/i)
  t.exception.all(() => info.coreCache(0, 1.5), /cache level must be an integer/i)
})

test('destroy is idempotent', (t) => {
  const info = new CPUInfo()

  info.destroy()

  t.execution(() => info.destroy())
})

test('use after destroy throws', (t) => {
  const info = new CPUInfo()

  info.destroy()

  t.exception(() => info.query(), /destroyed/i)
  t.exception(() => info.features(), /destroyed/i)
  t.exception(() => info.sample(), /destroyed/i)
  t.exception(() => info.coreCount(), /destroyed/i)
  t.exception(() => info.coreUsage(0), /destroyed/i)
  t.exception(() => info.coreType(0), /destroyed/i)
  t.exception(() => info.coreFrequency(0), /destroyed/i)
  t.exception(() => info.coreCache(0, constants.cache.L1D), /destroyed/i)
})

test('disposes with a using declaration', (t) => {
  let cpu

  {
    using info = new CPUInfo()

    cpu = info.query()
  }

  t.ok(cpu.logicalCores > 0, 'queried before disposal')
})

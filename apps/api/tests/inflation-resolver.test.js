const assert = require('node:assert/strict');
const { buildInflationResolver } = require('../services/inflation-resolver');

const resolver = buildInflationResolver(
    [
        { period_id: '2025-02', ipc_valor: 100 },
        { period_id: '2025-04', ipc_valor: 100 },
        { period_id: '2025-12', ipc_valor: 100 },
        { period_id: '2026-01', ipc_valor: 102 },
        { period_id: '2026-02', ipc_valor: 104.04 },
    ],
    [
        { period_id: '2026-03', mediana: 3, fecha_consulta: '2026-03-31' },
        { period_id: '2026-04', mediana: 2, fecha_consulta: '2026-03-31' },
    ],
);

const official = resolver.resolveYearOverYear('2026-02');
assert.equal(official.source, 'official');
assert.equal(official.isProjected, false);
assert.ok(Math.abs(official.yoyRate - 0.0404) < 1e-12);

const projected = resolver.resolveYearOverYear('2026-04');
assert.equal(projected.source, 'rem_bcra');
assert.equal(projected.isProjected, true);
assert.equal(projected.remPublishedAt, '2026-03-31');
assert.ok(Math.abs(projected.yoyRate - 0.09304424) < 1e-12);

const missing = resolver.resolveYearOverYear('2026-05');
assert.equal(missing.yoyRate, null);
assert.equal(missing.source, 'unavailable');
assert.deepEqual(resolver.toApiMeta(missing), {
    ipc_missing: true,
    ipc_projected: false,
    ipc_source: 'unavailable',
    ipc_rem_published_at: null,
});

console.log('inflation-resolver: ok');

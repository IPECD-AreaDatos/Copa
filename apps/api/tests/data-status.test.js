const assert = require('node:assert/strict');
const test = require('node:test');
const { loadDataStatus, buildInflationStatus, SOURCES } = require('../services/data-status');
const { IPC_QUERY, REM_QUERY } = require('../services/inflation-resolver');

const now = () => new Date('2026-10-19T15:00:00Z');
const officialRows = [
    { period_id: '2025-09', ipc_valor: 100 },
    { period_id: '2025-10', ipc_valor: 100 },
    { period_id: '2026-09', ipc_valor: 130 },
];
const remRows = [{ period_id: '2026-10', mediana: 2, fecha_consulta: '2026-10-06' }];

function database({ fail, emptyResources = false } = {}) {
    return {
        async query({ text }) {
            if (text === IPC_QUERY) return { rows: officialRows };
            if (text === REM_QUERY) {
                if (fail === 'rem') throw Object.assign(new Error('private connection details'), { code: 'ECONNREFUSED' });
                return { rows: remRows };
            }
            const source = SOURCES.find((candidate) => candidate.sql === text);
            assert.ok(source, 'cada consulta debe corresponder a una fuente conocida');
            if (source.id === fail) throw Object.assign(new Error('private connection details'), { code: 'ECONNREFUSED' });
            const resource = ['ron', 'rop'].includes(source.id);
            return { rows: [{
                row_count: 10,
                last_recorded_date: source.id === 'ron' ? '2026-10-31' : '2026-09',
                last_positive_date: resource && !emptyResources ? source.id === 'ron' ? '2026-10-16' : '2026-08' : null,
                last_updated_at: resource ? null : '2026-10-13T14:18:11.894Z',
                latest_value: resource && !emptyResources ? '123456.78' : null,
            }] };
        },
    };
}

test('informa el período real de recursos, los cambios de gastos y la inflación con el mismo resolver', async () => {
    const db = database();
    const result = await loadDataStatus({ db, datalake: db, now });
    assert.equal(result.checked_at, '2026-10-19T15:00:00.000Z');
    assert.equal(result.sources.length, 6);
    const ron = result.sources.find((source) => source.id === 'ron');
    assert.equal(ron.last_recorded_date, '2026-10-31');
    assert.equal(ron.last_positive_date, '2026-10-16');
    assert.equal(ron.latest_value, 123456.78);
    assert.equal(ron.last_updated_at, null);
    const gasto = result.sources.find((source) => source.id === 'gastos');
    assert.equal(gasto.last_updated_at, '2026-10-13T14:18:11.894Z');
    const october = result.inflation.periods.find((period) => period.period_id === '2026-10');
    assert.equal(october.ipc_source, 'rem_bcra');
    assert.equal(october.ipc_rem_published_at, '2026-10-06');
    assert.ok(Math.abs(october.yoy_percent - 32.6) < 1e-10);
    assert.equal(result.inflation.periods.find((period) => period.period_id === '2026-09').ipc_source, 'official');
});

test('un fallo en una fuente conserva las demás y no expone detalles privados', async () => {
    const db = database({ fail: 'gastos_fte' });
    const result = await loadDataStatus({ db, datalake: db, now });
    assert.equal(result.sources.find((source) => source.id === 'gastos_fte').status, 'error');
    assert.equal(result.sources.filter((source) => source.status === 'ok').length, 5);
    assert.equal(JSON.stringify(result).includes('private connection'), false);
});

test('una caída de REM conserva el IPC oficial y deja sin datos los meses proyectados', async () => {
    const db = database({ fail: 'rem' });
    const result = await loadDataStatus({ db, datalake: db, now });
    assert.equal(result.sources.find((source) => source.id === 'rem').status, 'error');
    assert.equal(result.inflation.periods.find((period) => period.period_id === '2026-09').ipc_source, 'official');
    assert.equal(result.inflation.periods.find((period) => period.period_id === '2026-10').yoy_percent, null);
});

test('las filas de recursos sin importes positivos no se presentan como datos disponibles', async () => {
    const db = database({ emptyResources: true });
    const result = await loadDataStatus({ db, datalake: db, now });
    for (const source of result.sources.filter((source) => ['ron', 'rop'].includes(source.id))) {
        assert.equal(source.status, 'missing');
        assert.equal(source.last_positive_date, null);
        assert.equal(source.latest_value, null);
        assert.equal(source.last_updated_at, null);
    }
});

test('la llegada de IPC oficial reemplaza el REM y los huecos no inventan inflación', () => {
    const status = buildInflationStatus([...officialRows, { period_id: '2026-10', ipc_valor: 131 }], remRows, now());
    assert.equal(status.periods[0].ipc_source, 'official');
    assert.ok(Math.abs(status.periods[0].yoy_percent - 31) < 1e-10);
    const missing = buildInflationStatus(officialRows, [], now()).periods[0];
    assert.equal(missing.ipc_source, 'unavailable');
    assert.equal(missing.yoy_percent, null);
});

test('el mes de referencia respeta la fecha argentina al cruzar medianoche UTC', () => {
    const status = buildInflationStatus([], [], new Date('2026-11-01T01:00:00Z'));
    assert.equal(status.default_period_id, '2026-10');
});

test('la ruta exige JWT y el mismo permiso exclusivo de admin que la auditoría', () => {
    const router = require('../routes/admin');
    const auth = require('../middleware/auth');
    const route = router.stack.find((layer) => layer.route?.path === '/data-status').route;
    const usageRoute = router.stack.find((layer) => layer.route?.path === '/usage').route;
    assert.equal(route.stack[0].handle, auth);
    assert.equal(route.stack[1].handle, usageRoute.stack[1].handle);
    for (const username of ['admin', 'gcorrales', 'jpvaldes', undefined]) {
        let allowed = false;
        let status;
        route.stack[1].handle({ user: { username } }, {
            status(code) { status = code; return this; }, json() {},
        }, () => { allowed = true; });
        assert.equal(allowed, username === 'admin');
        if (!allowed) assert.equal(status, 403);
    }
});

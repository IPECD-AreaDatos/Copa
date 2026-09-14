const test = require('node:test');
const assert = require('node:assert/strict');

const {
    buildMonthlyReport,
    previousCalendarMonth,
} = require('../scripts/send-monthly-report');

function monthlySnapshot({ complete = true } = {}) {
    return {
        meta: {
            available_periods: [{ id: '2026-07', is_complete: complete }],
        },
        data: {
            '2026-07': {
                completeness: { is_complete: complete },
                kpi: {
                    resumen: {
                        total_disponible_current: 252714,
                        post_sueldos_current: 90764,
                    },
                    recaudacion: {
                        current: 220295,
                        prev: 155137.3239,
                        var_nom: 42,
                        var_real: 6.1,
                        ipc_used_for_calc: 33.84,
                    },
                    rop: {
                        disponible_current: 32419,
                        disponible_prev: 25546.8873,
                        var_nom: 26.9,
                        var_real: -5.2,
                    },
                    distribucion_municipal: {
                        current: 38217,
                        nacion_current: 30757,
                        provincia_current: 7460,
                        var_nom: 47.7,
                        var_real: 10.4,
                    },
                    masa_salarial: {
                        var_real: 5.6,
                        cobertura_current: 54.2,
                    },
                },
            },
        },
    };
}

test('resuelve diciembre como mes anterior a enero', () => {
    assert.deepEqual(
        previousCalendarMonth(new Date('2026-01-06T15:00:00Z')),
        { id: '2025-12', year: 2025, month: 12 },
    );
});

test('genera el informe mensual con montos y porcentajes localizados', () => {
    const report = buildMonthlyReport(
        monthlySnapshot(),
        { id: '2026-07', year: 2026, month: 7 },
    );

    assert.equal(report.subject, 'Tablero Ejecutivo Provincial | Julio 2026 📊🏛️');
    assert.match(report.text, /\$252\.714 M/);
    assert.match(report.text, /\$220\.295 M/);
    assert.match(report.text, /\+42,0%/);
    assert.match(report.text, /-5,2%/);
    assert.match(report.text, /\$30\.757 M nacional \/ \$7\.460 M provincial/);
    assert.match(report.text, /54,2% sobre los recursos disponibles/);
    assert.match(report.text, /\$90\.764 M/);
});

test('no genera un envío para un período incompleto', () => {
    assert.throws(
        () => buildMonthlyReport(
            monthlySnapshot({ complete: false }),
            { id: '2026-07', year: 2026, month: 7 },
        ),
        /todavía está incompleto/,
    );
});

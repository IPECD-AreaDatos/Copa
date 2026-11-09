function currentPeriod(now = new Date()) {
    const parts = new Intl.DateTimeFormat('en', {
        timeZone: 'America/Argentina/Cordoba', year: 'numeric', month: '2-digit',
    }).formatToParts(now);
    return `${parts.find((p) => p.type === 'year').value}-${parts.find((p) => p.type === 'month').value}`;
}

// Último mes calendario finalizado con registros de ejecución y crédito.
// El número de movimientos varía legítimamente por institución: una caída no
// demuestra una carga incompleta. El mes en curso nunca abre por defecto.
function latestCompletePeriod(rows, now = new Date()) {
    const states = ['Comprometido', 'Ordenado', 'Cred Vig'];
    const counts = Object.fromEntries(states.map((state) => [state, {}]));
    for (const row of rows) {
        const period = `${row.anio}-${String(row.mes).padStart(2, '0')}`;
        if (counts[row.tipo_de_g]) counts[row.tipo_de_g][period] = Number(row.row_count);
    }
    const periods = [...new Set(rows.map((r) => `${r.anio}-${String(r.mes).padStart(2, '0')}`))]
        .filter((period) => period < currentPeriod(now)).sort().reverse();
    const period = periods.find((id) => states.every((state) => counts[state][id] > 0));
    return period ? { anio: Number(period.slice(0, 4)), mesDesde: 1, mesHasta: Number(period.slice(5)), periodo: period } : null;
}

module.exports = { currentPeriod, latestCompletePeriod };

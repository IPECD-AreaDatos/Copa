const db = require('../db_datalake');

/**
 * Servicio para calcular proyecciones de IPC basadas en el REM.
 */
async function getIpcProjections(lastOfficialYear, lastOfficialMonth, lastOfficialValue) {
    try {
        const query = `
            SELECT fecha, mediana
            FROM rem_precios_minoristas
            WHERE fecha_consulta = (SELECT MAX(fecha_consulta) FROM rem_precios_minoristas)
            ORDER BY fecha ASC
        `;
        const { rows } = await db.query(query);
        
        const projections = [];
        let currentYear = lastOfficialYear;
        let currentMonth = lastOfficialMonth;
        let currentValue = lastOfficialValue;

        for (const row of rows) {
            const fecha = new Date(row.fecha);
            const remYear = fecha.getUTCFullYear();
            const remMonth = fecha.getUTCMonth() + 1;

            // Solo proyectamos si es posterior al último dato oficial
            if (remYear > currentYear || (remYear === currentYear && remMonth > currentMonth)) {
                const variation = parseFloat(row.mediana) / 100;
                currentValue = currentValue * (1 + variation);
                
                projections.push({
                    anio: remYear,
                    mes: remMonth,
                    ipc_valor: currentValue,
                    ipc_var_mensual: variation,
                    is_projection: true
                });
                
                currentYear = remYear;
                currentMonth = remMonth;
            }
        }
        
        return projections;
    } catch (err) {
        console.error('Error calculando proyecciones:', err.message);
        return [];
    }
}

module.exports = {
    getIpcProjections
};

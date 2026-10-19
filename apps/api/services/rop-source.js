// Criterio de ROP confirmado: los tributos individuales NULL cuentan como cero.
// Una fila mensual ausente sigue siendo un dato ausente en el mapa de períodos.
const ROP_COLUMNS = [
    'inmobiliario_rural',
    'tasas',
    'marcas_y_senales',
    'sellos',
    'premios',
    'ingresos_brutos',
    'apremios_concursos_quiebras_reg_judiciales',
];

const ROP_AMOUNT_SQL = ROP_COLUMNS.map((column) => `COALESCE(${column}, 0)`).join(' + ');
const ROP_MONTHLY_QUERY = `
    SELECT anio::int, mes::int, SUM(${ROP_AMOUNT_SQL}) AS rop_bruta
    FROM copa_reca_rop
    GROUP BY 1, 2
`;

module.exports = { ROP_COLUMNS, ROP_AMOUNT_SQL, ROP_MONTHLY_QUERY };

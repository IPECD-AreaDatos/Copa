const fs = require('fs');
const path = require('path');

require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });

const MONTH_NAMES = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

const REPORT_SOURCE = 'Elaborado por el Instituto de Modernización e Innovación de Corrientes, a través de su Gerencia de IA y Ciencia de Datos, en base a datos del INDEC, Ministerio de Economía de la Nación y Contaduría General de la Provincia de Corrientes.';

function previousCalendarMonth(now = new Date(), timeZone = 'America/Argentina/Buenos_Aires') {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone,
        year: 'numeric',
        month: 'numeric',
    }).formatToParts(now);
    const year = Number(parts.find((part) => part.type === 'year').value);
    const month = Number(parts.find((part) => part.type === 'month').value);
    const previous = new Date(Date.UTC(year, month - 2, 1));

    return {
        id: `${previous.getUTCFullYear()}-${String(previous.getUTCMonth() + 1).padStart(2, '0')}`,
        year: previous.getUTCFullYear(),
        month: previous.getUTCMonth() + 1,
    };
}

function requiredNumber(value, label) {
    if (value === null || value === undefined || value === '') {
        throw new Error(`Falta el indicador requerido: ${label}`);
    }
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) throw new Error(`Falta el indicador requerido: ${label}`);
    return parsed;
}

function formatAmount(value) {
    return Math.round(value).toLocaleString('es-AR');
}

function formatPercent(value, { explicitPlus = true } = {}) {
    const rounded = value.toLocaleString('es-AR', {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
    });
    return `${explicitPlus && value > 0 ? '+' : ''}${rounded}%`;
}

function buildMonthlyReport(snapshot, period) {
    const availablePeriod = snapshot?.meta?.available_periods?.find((item) => item.id === period.id);
    const periodData = snapshot?.data?.[period.id];
    if (!availablePeriod || !periodData) {
        throw new Error(`El período ${period.id} todavía no está disponible`);
    }
    if (!availablePeriod.is_complete || !periodData.completeness?.is_complete) {
        throw new Error(`El período ${period.id} todavía está incompleto`);
    }

    const kpi = periodData.kpi;
    const ron = kpi.recaudacion;
    const rop = kpi.rop;
    const municipal = kpi.distribucion_municipal;
    const salary = kpi.masa_salarial;

    const totalCurrent = requiredNumber(kpi.resumen.total_disponible_current, 'recursos disponibles');
    const ronCurrent = requiredNumber(ron.current, 'RON actual');
    const ronPrevious = requiredNumber(ron.prev, 'RON anterior');
    const ropCurrent = requiredNumber(rop.disponible_current, 'ROP actual');
    const ropPrevious = requiredNumber(rop.disponible_prev, 'ROP anterior');
    const ipc = requiredNumber(ron.ipc_used_for_calc, 'IPC interanual');
    const totalPrevious = ronPrevious + ropPrevious;
    const totalRealVariation = ((totalCurrent / totalPrevious) / (1 + ipc / 100) - 1) * 100;

    const values = {
        totalCurrent,
        totalRealVariation,
        ronCurrent,
        ronNominal: requiredNumber(ron.var_nom, 'variación nominal RON'),
        ronReal: requiredNumber(ron.var_real, 'variación real RON'),
        ropCurrent,
        ropNominal: requiredNumber(rop.var_nom, 'variación nominal ROP'),
        ropReal: requiredNumber(rop.var_real, 'variación real ROP'),
        municipalCurrent: requiredNumber(municipal.current, 'distribución municipal'),
        municipalNational: requiredNumber(municipal.nacion_current, 'distribución municipal nacional'),
        municipalProvincial: requiredNumber(municipal.provincia_current, 'distribución municipal provincial'),
        municipalNominal: requiredNumber(municipal.var_nom, 'variación nominal municipal'),
        municipalReal: requiredNumber(municipal.var_real, 'variación real municipal'),
        salaryReal: requiredNumber(salary.var_real, 'variación real salarial'),
        salaryCoverage: requiredNumber(salary.cobertura_current, 'cobertura salarial'),
        operatingMargin: requiredNumber(kpi.resumen.post_sueldos_current, 'margen operativo'),
    };

    const monthName = MONTH_NAMES[period.month - 1];
    const subject = `Tablero Ejecutivo Provincial | ${monthName} ${period.year} 📊🏛️`;
    const trendEmoji = values.totalRealVariation >= 0 ? '📈' : '📉';
    const text = `${subject}

En ${monthName.toLowerCase()} de ${period.year}, los Recursos Disponibles Totales de la Provincia alcanzaron los $${formatAmount(values.totalCurrent)} M, registrando una variación real interanual del ${formatPercent(values.totalRealVariation)} ${trendEmoji}.

Puntos destacados del mes:

Recursos de Origen Nacional (RON): totalizaron $${formatAmount(values.ronCurrent)} M, con una variación nominal del ${formatPercent(values.ronNominal)} y una variación real del ${formatPercent(values.ronReal)} respecto a ${monthName.toLowerCase()} de ${period.year - 1}.

Recaudación de Origen Provincial (ROP): alcanzó los $${formatAmount(values.ropCurrent)} M (${formatPercent(values.ropNominal)} nominal), con una variación real del ${formatPercent(values.ropReal)} interanual.

Distribución Municipal: los municipios recibieron $${formatAmount(values.municipalCurrent)} M ($${formatAmount(values.municipalNational)} M nacional / $${formatAmount(values.municipalProvincial)} M provincial), lo que representa una variación real del ${formatPercent(values.municipalReal)} (${formatPercent(values.municipalNominal)} nominal).

Situación Salarial: la masa salarial presentó una variación real del ${formatPercent(values.salaryReal)} interanual, ubicando la cobertura salarial en ${formatPercent(values.salaryCoverage, { explicitPlus: false })} sobre los recursos disponibles.

Margen operativo: tras la cobertura de salarios, el remanente disponible para gastos operativos e inversión se ubicó en $${formatAmount(values.operatingMargin)} M.

Fuente: ${REPORT_SOURCE}`;

    return { subject, text, values };
}

function loadDeliveryState(statePath) {
    try {
        return JSON.parse(fs.readFileSync(statePath, 'utf8'));
    } catch (error) {
        if (error.code === 'ENOENT') return {};
        throw error;
    }
}

function saveDeliveryState(statePath, state) {
    fs.mkdirSync(path.dirname(statePath), { recursive: true });
    const temporaryPath = `${statePath}.${process.pid}.tmp`;
    fs.writeFileSync(temporaryPath, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
    fs.renameSync(temporaryPath, statePath);
}

function reportRecipients() {
    return (process.env.MONTHLY_REPORT_RECIPIENTS || '')
        .split(',')
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean);
}

async function fetchMonthlySnapshot() {
    const secret = process.env.MONTHLY_REPORT_JOB_SECRET;
    if (!secret) throw new Error('Falta MONTHLY_REPORT_JOB_SECRET');

    const port = process.env.PORT || 4000;
    const response = await fetch(`http://127.0.0.1:${port}/api/dashboard/monthly-report`, {
        headers: { 'x-report-job-secret': secret },
    });
    if (!response.ok) {
        throw new Error(`La API de Copa respondió HTTP ${response.status}`);
    }
    return response.json();
}

async function sendReport() {
    const period = previousCalendarMonth(new Date(), process.env.REPORT_TIMEZONE);
    const snapshot = await fetchMonthlySnapshot();
    const report = buildMonthlyReport(snapshot, period);

    if (process.argv.includes('--preview')) {
        console.log(report.text);
        return;
    }

    const recipients = reportRecipients();
    if (recipients.length === 0) throw new Error('Falta MONTHLY_REPORT_RECIPIENTS');
    if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
        throw new Error('Faltan GMAIL_USER o GMAIL_APP_PASSWORD');
    }

    const nodemailer = require('nodemailer');
    const transporter = nodemailer.createTransport({
        host: 'smtp.gmail.com',
        port: 465,
        secure: true,
        auth: {
            user: process.env.GMAIL_USER,
            pass: process.env.GMAIL_APP_PASSWORD.replace(/\s+/g, ''),
        },
    });

    const statePath = process.env.MONTHLY_REPORT_STATE_FILE
        || path.resolve(__dirname, '../../../state/copa-monthly-email.json');
    const state = loadDeliveryState(statePath);
    state[period.id] ||= { recipients: {} };

    for (const recipient of recipients) {
        if (state[period.id].recipients[recipient]?.sent_at) {
            console.log(`[monthly-report] ${period.id} ya fue enviado a ${recipient}`);
            continue;
        }

        const result = await transporter.sendMail({
            from: `Instituto de Modernización e Innovación <${process.env.GMAIL_USER}>`,
            to: recipient,
            subject: report.subject,
            text: report.text,
        });
        state[period.id].recipients[recipient] = {
            sent_at: new Date().toISOString(),
            message_id: result.messageId,
        };
        saveDeliveryState(statePath, state);
        console.log(`[monthly-report] ${period.id} enviado a ${recipient}`);
    }
}

if (require.main === module) {
    sendReport().catch((error) => {
        console.error(`[monthly-report] ${error.message}`);
        process.exitCode = 1;
    });
}

module.exports = {
    buildMonthlyReport,
    formatAmount,
    formatPercent,
    loadDeliveryState,
    previousCalendarMonth,
    reportRecipients,
    saveDeliveryState,
};

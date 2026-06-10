const path = require('path');
// Import routes relative to tests directory
const dashboardRouter = require('../routes/dashboard');
const ronRouter = require('../routes/ron');

async function getRouteData(router, routePath, req = {}) {
    return new Promise((resolve, reject) => {
        const route = router.stack.find(layer => layer.route && layer.route.path === routePath);
        if (!route) {
            return reject(new Error(`Route ${routePath} not found`));
        }
        // Bypassing middleware (like authMiddleware) by calling the last layer's handle
        const handler = route.route.stack[route.route.stack.length - 1].handle;
        const res = {
            headers: {},
            setHeader(name, value) {
                this.headers[name] = value;
            },
            status(code) {
                this.statusCode = code;
                return this;
            },
            json(data) {
                resolve(data);
            },
            send(data) {
                resolve(data);
            }
        };
        handler(req, res).catch(reject);
    });
}

function filter2024Data(homeData, monthlyData, annualData) {
    const result = {
        home: {},
        monthly: {},
        annual: {}
    };

    // Filter home data for 2024
    if (homeData && homeData.data) {
        for (const [key, val] of Object.entries(homeData.data)) {
            if (key.startsWith('2024-')) {
                result.home[key] = val;
            }
        }
    }

    // Filter monthly data for 2024
    if (monthlyData && monthlyData.data) {
        for (const [key, val] of Object.entries(monthlyData.data)) {
            if (key.startsWith('2024-')) {
                result.monthly[key] = val;
            }
        }
    }

    // Filter annual data for 2024
    if (annualData && annualData.annual_monitor && annualData.annual_monitor.data) {
        if (annualData.annual_monitor.data['2024']) {
            result.annual['2024'] = annualData.annual_monitor.data['2024'];
        }
    }

    return result;
}

async function main() {
    try {
        const homeData = await getRouteData(dashboardRouter, '/home');
        const monthlyData = await getRouteData(dashboardRouter, '/monthly');
        const annualData = await getRouteData(ronRouter, '/annual-monitor');

        const kpis2024 = filter2024Data(homeData, monthlyData, annualData);
        console.log(JSON.stringify(kpis2024, null, 2));
        process.exit(0);
    } catch (err) {
        console.error('Error extracting KPIs:', err);
        process.exit(1);
    }
}

main();

const fs = require('fs');

const code = fs.readFileSync('history.js', 'utf8');

// Mock DOM
global.document = {
    getElementById: (id) => ({
        innerHTML: '',
        value: '0.95',
        addEventListener: () => {},
        getContext: () => ({}),
        appendChild: () => {}
    }),
    createElement: () => ({
        className: '',
        innerHTML: ''
    })
};
global.window = {
    location: { hostname: '127.0.0.1', origin: 'http://127.0.0.1:58888' },
    chartInstances: {}
};
global.Chart = class { constructor() {} destroy() {} };
global.fetch = async (url) => {
    if (url.includes('/api/portfolio')) return { json: async () => JSON.parse(fs.readFileSync('portfolio.json', 'utf8')) };
    if (url.includes('/api/history')) return { json: async () => [] };
    if (url.includes('/api/stock/')) return { json: async () => ({ latest_close: 2400, ma5: 2300 }) };
    throw new Error('Unknown url ' + url);
};
global.alert = console.log;

// Inject code
eval(code);

// Run loadData and catch specific error
loadData().then(() => {
    console.log("loadData finished");
}).catch(e => {
    console.error("loadData threw:", e);
});

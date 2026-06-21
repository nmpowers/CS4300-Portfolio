import puppeteer from 'puppeteer';

(async () => {
    const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
    const page = await browser.newPage();
    
    page.on('console', msg => {
        console.log(`[CONSOLE] ${msg.text()}`);
    });
    page.on('pageerror', err => {
        console.error(`[PAGEERROR] ${err.message}`);
    });
    
    await page.goto('http://localhost:5173/shingles/index.html', { waitUntil: 'networkidle2', timeout: 5000 });
    
    await new Promise(r => setTimeout(r, 1000));
    await browser.close();
})();

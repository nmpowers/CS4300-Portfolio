import puppeteer from 'puppeteer';

(async () => {
    const browser = await puppeteer.launch({ headless: "new" });
    const page = await browser.newPage();
    
    page.on('console', msg => {
        if (msg.text().includes('error') || msg.text().includes('ERROR') || msg.text().includes('THREE')) {
            console.log(`[BROWSER]: ${msg.text()}`);
        }
    });

    await page.goto('http://localhost:5173/shingles/', { waitUntil: 'networkidle0' });
    
    await browser.close();
})();

import puppeteer from 'puppeteer';

(async () => {
    console.log("Starting puppeteer...");
    const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
    const page = await browser.newPage();
    
    page.on('console', msg => {
        if (msg.type() === 'error') console.log('PAGE LOG ERROR:', msg.text());
        else console.log('PAGE LOG:', msg.text());
    });
    
    page.on('pageerror', error => {
        console.log('PAGE ERROR:', error.message);
    });

    console.log("Navigating...");
    try {
        await page.goto('http://localhost:5173/shingles/index.html', { waitUntil: 'networkidle2', timeout: 5000 });
        console.log("Navigation complete.");
    } catch (e) {
        console.log("Nav error:", e.message);
    }
    
    // Evaluate a script in the page to check if sg loop is running
    await new Promise(r => setTimeout(r, 2000));
    
    try {
        const loopRunning = await page.evaluate(() => {
            return window.requestAnimationFrame !== undefined;
        });
        console.log("Is loop running? ", loopRunning);
    } catch(e) {}
    
    await new Promise(r => setTimeout(r, 2000));
    await browser.close();
})();

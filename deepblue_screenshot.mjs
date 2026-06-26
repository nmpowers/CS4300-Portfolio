import puppeteer from 'puppeteer';
import fs from 'fs';

(async () => {
    console.log("Starting puppeteer...");
    const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
    const page = await browser.newPage();
    
    console.log("Navigating...");
    await page.goto('http://localhost:5173/deep-blue/index.html', { waitUntil: 'load', timeout: 5000 });
    
    await new Promise(r => setTimeout(r, 2000));
    
    await page.screenshot({ path: 'screenshot.png' });
    console.log("Screenshot saved.");
    
    await browser.close();
})();

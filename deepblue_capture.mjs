import fs from 'fs';
import puppeteer from 'puppeteer';
import { execSync } from 'child_process';

const delay = ms => new Promise(res => setTimeout(res, ms));

const transcriptPath = '/Users/nathanielpowers/.gemini/antigravity-ide/brain/ff24e29c-a22c-40c4-81c4-70d95ab23e88/.system_generated/logs/transcript.jsonl';
const lines = fs.readFileSync(transcriptPath, 'utf-8').split('\n');

const stripQuotes = str => {
    if (!str) return '';
    let s = str.replace(/^"|"$/g, '');
    s = s.replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\');
    return s;
};

(async () => {
    console.log("Backing up public/deep-blue...");
    execSync('rm -rf public/deep-blue-backup');
    execSync('cp -r public/deep-blue public/deep-blue-backup');

    try {
        console.log("Restoring initial state from git 7a2f608...");
        execSync('git show 7a2f608:public/deep-blue/frag.wgsl > public/deep-blue/frag.wgsl');
        execSync('git show 7a2f608:public/deep-blue/main.js > public/deep-blue/main.js');
        
        execSync('rm -rf deepblue_screenshots');
        execSync('mkdir -p deepblue_screenshots');

        console.log("Starting puppeteer...");
        const browser = await puppeteer.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--enable-unsafe-webgpu']
        });
        const page = await browser.newPage();
        await page.setViewport({ width: 800, height: 600 });
        
        // Load initial page
        await page.goto('http://localhost:5173/deep-blue/index.html', { waitUntil: 'networkidle0' });
        await delay(1000);
        await page.screenshot({ path: `deepblue_screenshots/step_initial.png` });

        let stepCount = 0;
        
        for (const line of lines) {
            if (!line) continue;
            const obj = JSON.parse(line);
            if (obj.tool_calls) {
                let changed = false;
                for (const tc of obj.tool_calls) {
                    const name = tc.name;
                    let args = tc.args;
                    if (typeof args === 'string') {
                        try { args = JSON.parse(args); } catch(e) { continue; }
                    }
                    
                    if (!args.TargetFile || !args.TargetFile.includes('deep-blue')) continue;
                    
                    const targetFile = stripQuotes(args.TargetFile);
                    const localPath = 'public/deep-blue/' + targetFile.split('/').pop();
                    
                    if (!fs.existsSync(localPath)) continue;
                    
                    let fileContent = fs.readFileSync(localPath, 'utf-8');
                    
                    if (name === 'default_api:write_to_file' || name === 'write_to_file') {
                        fileContent = stripQuotes(args.CodeContent);
                        changed = true;
                    } else if (name === 'default_api:replace_file_content' || name === 'replace_file_content') {
                        fileContent = fileContent.replace(stripQuotes(args.TargetContent), stripQuotes(args.ReplacementContent));
                        changed = true;
                    } else if (name === 'default_api:multi_replace_file_content' || name === 'multi_replace_file_content') {
                        for (const chunk of args.ReplacementChunks) {
                            fileContent = fileContent.replace(stripQuotes(chunk.TargetContent), stripQuotes(chunk.ReplacementContent));
                        }
                        changed = true;
                    }
                    
                    if (changed) {
                        fs.writeFileSync(localPath, fileContent);
                    }
                }
                
                if (changed) {
                    stepCount++;
                    console.log(`Capturing step ${stepCount} at log index ${obj.step_index}...`);
                    // Vite should auto-reload because files changed. Wait for it.
                    await delay(1500); 
                    await page.screenshot({ path: `deepblue_screenshots/step_${stepCount.toString().padStart(3, '0')}.png` });
                }
            }
        }

        await browser.close();
        console.log("Done.");

    } finally {
        console.log("Restoring backup...");
        execSync('rm -rf public/deep-blue');
        execSync('mv public/deep-blue-backup public/deep-blue');
        // create zip
        execSync('zip -r deepblue_screenshots.zip deepblue_screenshots');
        console.log("Created deepblue_screenshots.zip");
    }
})();

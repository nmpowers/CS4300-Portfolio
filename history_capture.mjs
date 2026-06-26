import fs from 'fs';
import path from 'path';
import puppeteer from 'puppeteer';

const transcriptPath = '/Users/nathanielpowers/.gemini/antigravity-ide/brain/ff24e29c-a22c-40c4-81c4-70d95ab23e88/.system_generated/logs/transcript.jsonl';
const fileToTrack = 'frag.glsl';

let fileContent = '';
let stepCount = 0;

const lines = fs.readFileSync(transcriptPath, 'utf-8').split('\n').filter(l => l.trim() !== '');
const versions = [];

for (const line of lines) {
    const entry = JSON.parse(line);
    if (entry.tool_calls) {
        for (const tc of entry.tool_calls) {
            const name = tc.name;
            let args = tc.args;
            if (typeof args === 'string') {
                try { args = JSON.parse(args); } catch(e) { continue; }
            }
            const stripQuotes = str => {
                if (!str) return '';
                let s = str.replace(/^"|"$/g, '');
                // Also unescape newlines and quotes
                s = s.replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\');
                return s;
            };
            if (name === 'default_api:write_to_file' || name === 'write_to_file') {
                const target = stripQuotes(args.TargetFile);
                if (target.endsWith(fileToTrack)) {
                    fileContent = stripQuotes(args.CodeContent);
                    versions.push(fileContent);
                }
            } else if (name === 'default_api:replace_file_content' || name === 'replace_file_content') {
                if (stripQuotes(args.TargetFile).endsWith(fileToTrack) && fileContent) {
                    fileContent = fileContent.replace(stripQuotes(args.TargetContent), stripQuotes(args.ReplacementContent));
                    versions.push(fileContent);
                }
            } else if (name === 'default_api:multi_replace_file_content' || name === 'multi_replace_file_content') {
                if (stripQuotes(args.TargetFile).endsWith(fileToTrack) && fileContent) {
                    for (const chunk of args.ReplacementChunks) {
                        fileContent = fileContent.replace(stripQuotes(chunk.TargetContent), stripQuotes(chunk.ReplacementContent));
                    }
                    versions.push(fileContent);
                }
            }
        }
    }
}

console.log(`Found ${versions.length} versions of ${fileToTrack}.`);

(async () => {
    console.log("Starting puppeteer...");
    const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
    const page = await browser.newPage();
    
    // Backup original frag.glsl
    const origContent = fs.readFileSync('/Users/nathanielpowers/Documents/CS4300-Portfolio/public/shingles/frag.glsl', 'utf-8');
    
    fs.mkdirSync('progression_screenshots', { recursive: true });

    let i = 0;
    // Let's sample maybe 20 versions max to not take forever
    const stepSize = Math.max(1, Math.floor(versions.length / 20));
    const sampledVersions = versions.filter((_, idx) => idx % stepSize === 0 || idx === versions.length - 1);
    
    for (const v of sampledVersions) {
        fs.writeFileSync('/Users/nathanielpowers/Documents/CS4300-Portfolio/public/shingles/frag.glsl', v);
        
        console.log(`Capturing step ${i}...`);
        await page.goto('http://localhost:5173/shingles/index.html', { waitUntil: 'load', timeout: 5000 });
        await new Promise(r => setTimeout(r, 1000));
        
        await page.screenshot({ path: `progression_screenshots/step_${String(i).padStart(3, '0')}.png` });
        i++;
    }
    
    await browser.close();
    fs.writeFileSync('/Users/nathanielpowers/Documents/CS4300-Portfolio/public/shingles/frag.glsl', origContent);
    console.log("Done.");
})();

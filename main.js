const { exec } = require('child_process');
const fs = require('fs').promises;
const path = require('path');

function getLinkDepth(link) {
    return (new URL(link)).pathname.split('/').filter(part => part.length > 0).length;
}

function selectBestLink(links) {
    return links.sort((a, b) => {
        const keywords = ['products', 'collections', 'shop', 'product'];
        const aDepth = getLinkDepth(a);
        const bDepth = getLinkDepth(b);
        const aHasProducts = a.includes('products') || a.includes('product');
        const bHasProducts = b.includes('products') || b.includes('product');
        const aHasCollections = a.includes('collections');
        const bHasCollections = b.includes('collections');

        // Prioritize 'products' over 'collections'
        if (aHasProducts && !bHasProducts) return -1;
        if (!aHasProducts && bHasProducts) return 1;
        if (aHasCollections && !bHasCollections) return -1;
        if (!aHasCollections && bHasCollections) return 1;

        // If both have or neither have the keywords, sort by depth and then length
        if (aDepth !== bDepth) return aDepth - bDepth;
        return a.length - b.length;
    })[0];
}

function getCurrentTimestamp() {
    return new Date().toISOString();
}

async function runScraperAndProcessResults() {
    try {
        console.log(`[${getCurrentTimestamp()}] Running scraper script...`);
        await new Promise((resolve, reject) => {
            exec('node scrape.js', (error, stdout, stderr) => {
                if (error) {
                    console.error(`Error executing scraper script: ${stderr}`);
                    reject(error);
                } else {
                    console.log(stdout);
                    resolve();
                }
            });
        });

        console.log(`[${getCurrentTimestamp()}] Reading output.json...`);
        const outputPath = path.resolve(__dirname, 'output.json');
        const data = await fs.readFile(outputPath, 'utf-8');
        const results = JSON.parse(data);

        const selectedLinks = {};
        for (const domain in results) {
            if (results[domain].length > 0) {
                selectedLinks[domain] = selectBestLink(results[domain]);
            } else {
                selectedLinks[domain] = domain; // Use domain itself if no URLs found
            }
        }

        // Sort the selected links alphabetically by domain
        const sortedSelectedLinks = {};
        Object.keys(selectedLinks).sort().forEach(domain => {
            sortedSelectedLinks[domain] = selectedLinks[domain];
        });

        const selectedOutputPath = path.resolve(__dirname, 'selectedLinks.json');
        console.log(`[${getCurrentTimestamp()}] Writing selected links to ${selectedOutputPath}...`);
        await fs.writeFile(selectedOutputPath, JSON.stringify(sortedSelectedLinks, null, 2), 'utf-8');
        console.log(`[${getCurrentTimestamp()}] Selected links written to ${selectedOutputPath}`);

        // Find domains in urls.json but not in selectedLinks.json
        const urlsPath = path.resolve(__dirname, 'urls.json');
        const urlsData = await fs.readFile(urlsPath, 'utf-8');
        const urls = JSON.parse(urlsData);
        const diff = urls.filter(domain => !selectedLinks.hasOwnProperty(domain));

        const diffOutputPath = path.resolve(__dirname, 'diff.json');
        console.log(`[${getCurrentTimestamp()}] Writing diff to ${diffOutputPath}...`);
        await fs.writeFile(diffOutputPath, JSON.stringify(diff, null, 2), 'utf-8');
        console.log(`[${getCurrentTimestamp()}] Diff written to ${diffOutputPath}`);

        console.log(`[${getCurrentTimestamp()}] Running scoring script...`);
        await new Promise((resolve, reject) => {
            exec('node scoring.js', (error, stdout, stderr) => {
                if (error) {
                    console.error(`Error executing scoring script: ${stderr}`);
                    reject(error);
                } else {
                    console.log(stdout);
                    resolve();
                }
            });
        });

    } catch (error) {
        console.error(`[${getCurrentTimestamp()}] Error:`, error.message);
    }
}

runScraperAndProcessResults();

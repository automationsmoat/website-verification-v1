const { exec } = require('child_process');
const { MongoClient, ServerApiVersion } = require('mongodb');

const uri = "mongodb+srv://admin:r3afdDqdQPnty8uc@websiteverificationsyst.auswgs2.mongodb.net/?retryWrites=true&w=majority&appName=websiteverificationsystem";
const DATABASE_NAME = 'websitescoring';

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

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
    let clientConnection;
    try {
        console.log(`[${getCurrentTimestamp()}] Connecting to MongoDB...`);
        clientConnection = await client.connect();
        const database = clientConnection.db(DATABASE_NAME);

        console.log(`[${getCurrentTimestamp()}] Clearing selectedLinks collection...`);
        const selectedLinksCollection = database.collection('selectedLinks');
        await selectedLinksCollection.deleteMany({});

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

        console.log(`[${getCurrentTimestamp()}] Reading from output collection...`);
        const outputCollection = database.collection('output');
        const outputData = await outputCollection.find().toArray();

        const selectedLinks = {};

        if (outputData.length > 0) {
            const results = outputData[0].results;
            for (const domain in results) {
                const links = results[domain];
                if (links.length > 0) {
                    selectedLinks[domain] = selectBestLink(links);
                } else {
                    selectedLinks[domain] = domain; // Use domain itself if no URLs found
                }
            }
        }

        // Sort the selected links alphabetically by domain
        const sortedSelectedLinks = {};
        Object.keys(selectedLinks).sort().forEach(domain => {
            sortedSelectedLinks[domain] = selectedLinks[domain];
        });

        console.log(`[${getCurrentTimestamp()}] Writing selected links to selectedLinks collection...`);
        await selectedLinksCollection.insertOne({ timestamp: getCurrentTimestamp(), links: sortedSelectedLinks });
        console.log(`[${getCurrentTimestamp()}] Selected links written to selectedLinks collection`);

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
    } finally {
        // Ensures that the client will close when you finish/error
        if (clientConnection) {
            await clientConnection.close();
        }
    }
}

runScraperAndProcessResults().catch(console.dir);

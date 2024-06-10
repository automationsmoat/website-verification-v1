const express = require('express');
const bodyParser = require('body-parser');
const { MongoClient, ServerApiVersion } = require('mongodb');
const { exec } = require('child_process');
const os = require('os');
const now = require('performance-now');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// MongoDB connection URI and database name
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

app.use(bodyParser.json());

// Function to execute main.js
function runMainScript() {
    return new Promise((resolve, reject) => {
        exec('node main.js', (error, stdout, stderr) => {
            if (error) {
                reject(`Error executing main script: ${stderr}`);
            } else {
                resolve(stdout);
            }
        });
    });
}

function logPerformance(startTime, endTime, logFile) {
    const performanceData = {
        timestamp: new Date().toISOString(),
        executionTime: endTime - startTime,
        memoryUsage: process.memoryUsage(),
        cpuUsage: os.loadavg()
    };

    fs.appendFile(logFile, JSON.stringify(performanceData, null, 2) + ',\n', (err) => {
        if (err) {
            console.error(`Error writing to log file: ${err}`);
        } else {
            console.log('Performance data logged.');
        }
    });
}

app.post('/process-urls', async (req, res) => {
    const startTime = now();
    const logFile = 'performance-log.json';

    try {
        // Validate input
        const urls = req.body.urls;
        if (!urls || !Array.isArray(urls)) {
            return res.status(400).send('Invalid input: "urls" should be an array.');
        }

        // Connect to MongoDB
        await client.connect();
        const database = client.db(DATABASE_NAME);

        // Clear the URLs collection before inserting new data
        const urlsCollection = database.collection('urls');
        await urlsCollection.deleteMany({});
        console.log('URLs collection cleared');

        // Save URLs to MongoDB
        await urlsCollection.insertMany(urls.map(url => ({ url })));
        console.log('URLs saved to MongoDB');

        // Run the main script
        await runMainScript();
        console.log('Main script executed successfully');

        // Fetch and return the contents of the scores collection
        const scoresCollection = database.collection('scores');
        const scoresData = await scoresCollection.find().toArray();
        res.status(200).send(scoresData);

    } catch (error) {
        console.error(`Error: ${error}`);
        res.status(500).send(`Internal Server Error: ${error}`);
    } finally {
        // Ensure the client will close when you finish/error
        await client.close();

        const endTime = now();
        logPerformance(startTime, endTime, logFile);
    }
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

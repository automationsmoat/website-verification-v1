
const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs').promises;
const path = require('path');
const { exec } = require('child_process');

const app = express();
const PORT = process.env.PORT || 3000;

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

// Endpoint to receive URLs and process them
app.post('/process-urls', async (req, res) => {
    try {
        // Save the URLs to urls.json
        const urls = req.body.urls;
        if (!urls || !Array.isArray(urls)) {
            return res.status(400).send('Invalid input: "urls" should be an array.');
        }
        const urlsPath = path.resolve(__dirname, 'urls.json');
        await fs.writeFile(urlsPath, JSON.stringify(urls, null, 2), 'utf-8');
        console.log('URLs saved to urls.json');

        // Run the main script
        await runMainScript();
        console.log('Main script executed successfully');

        // Read and return the contents of scores.json
        const scoresPath = path.resolve(__dirname, 'scores.json');
        const scoresData = await fs.readFile(scoresPath, 'utf-8');
        res.status(200).send(scoresData);
    } catch (error) {
        console.error(`Error: ${error}`);
        res.status(500).send(`Internal Server Error: ${error}`);
    }
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

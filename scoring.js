const axios = require('axios');
const { MongoClient, ServerApiVersion } = require('mongodb');
const path = require('path');

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

// Function to analyze HTML content
function analyzeHtml(html) {
    const currencyCodes = [
        'USD', 'EUR', 'JPY', 'GBP', 'AUD', 'CAD', 'CHF', 'CNY', 'SEK', 'NZD',
        'MXN', 'SGD', 'HKD', 'NOK', 'KRW', 'TRY', 'RUB', 'INR', 'BRL', 'ZAR',
        'DKK', 'PLN', 'AED', 'ARS', 'THB', 'IDR', 'TWD', 'SAR', 'QAR', 'MYR',
        'PHP', 'PEN', 'CZK', 'HUF', 'ILS', 'CLP', 'PKR', 'VND', 'EGP', 'NGN',
        'COP', 'JOD', 'KZT', 'LKR', 'MAD', 'UAH', 'RON', 'BDT', 'GHS', 'KES'
    ];

    const phrases = [
        'add to cart', 'buy now', 'shop now', 'Add To Bag', 'ADD TO BAG',
        'Buy-Button', 'buy-buttons', 'checkout', 'add to basket', 'sold', 'sold out'
    ];

    const addToCartRegex = />\s*(add to cart|"\s*add to cart\s*")\s*</i;

    let score = 0;
    let cart = false;
    let button = false;
    let shipping = false;
    let pay = false;
    let rating = false;
    let promo = false;
    let price = false;

    html = html.toLowerCase();

    const htmlIncludesPhrase = phrases.some(phrase => html.includes(phrase.toLowerCase())) || addToCartRegex.test(html);
    if (htmlIncludesPhrase) {
        score += 4;
        button = true;
    }

    if (html.match(/<a[^>]* href=["'].*\/cart|\/basket["']/i) || html.includes('/cart')) {
        score += 1;
        cart = true;
    }

    if (html.includes('free shipping') || html.includes('shipping options') || html.includes('shipping')) {
        score += 1;
        shipping = true;
    }

    if (html.includes('paypal') || html.includes('visa') || html.includes('mastercard') || html.includes('amex') || html.includes('discover') || html.includes('elo')) {
        score++;
        pay = true;
    }

    if (html.includes('customer reviews') || html.includes('ratings') || html.includes('testimonials') || html.includes('reviews')) {
        score += 1;
        rating = true;
    }

    if (html.includes('discount') || html.includes('sale')) {
        score++;
        promo = true;
    }

    const primaryPriceRegex = new RegExp(`(${currencyCodes.join('|')})\\s+\\d+\\.?\\d*|\\$\\s+\\d+\\.?\\d*|\\d+\\s*(${currencyCodes.join('|')})`, 'i');
    if (primaryPriceRegex.test(html)) {
        score += 0.5;
        price = true;
    } else {
        const secondaryPriceRegex = new RegExp(`\\b(${currencyCodes.join('|')})\\b`, 'i');
        if (secondaryPriceRegex.test(html)) {
            score += 1;
            price = true;
        }
    }

    return { ecommerceScore: score, buttons: button, cart: cart, shipping: shipping, pay: pay, rating: rating, promo: promo, price: price };
}

const fetchAndAnalyze = async (link, domain) => {
    try {
        const { data } = await axios.get(link);
        return analyzeHtml(data);
    } catch (error) {
        if (error.response && error.response.status === 404 && link !== domain) {
            console.log(`404 error for ${link}. Trying the domain URL: ${domain}`);
            try {
                const { data } = await axios.get(domain);
                return analyzeHtml(data);
            } catch (domainError) {
                console.error(`Error fetching data from ${domain}:`, domainError.message);
                return { ecommerceScore: 0, status: 'error', error: domainError.message };
            }
        } else {
            console.error(`Error fetching data from ${link}:`, error.message);
            return { ecommerceScore: 0, status: 'error', error: error.message };
        }
    }
};

const processBatch = async (batch, selectedLinks) => {
    const results = {};
    await Promise.all(batch.map(async (domain) => {
        const link = selectedLinks[domain];
        console.log(`Fetching data from: ${link}`);
        results[domain] = await fetchAndAnalyze(link, domain);
    }));
    return results;
};

(async () => {
    let clientConnection;
    try {
        clientConnection = await client.connect();
        const database = clientConnection.db(DATABASE_NAME);

        const selectedLinksCollection = database.collection('selectedLinks');
        const scoresCollection = database.collection('scores');

        // Clear the scores collection at the beginning
        await scoresCollection.deleteMany({});
        console.log('Cleared scores collection.');

        const selectedLinksCursor = await selectedLinksCollection.find();
        const selectedLinksData = await selectedLinksCursor.toArray();
        const selectedLinks = selectedLinksData.reduce((acc, doc) => {
            acc[doc.domain] = doc.link;
            return acc;
        }, {});

        const results = {};
        const batchSize = 500; // Process 500 URLs at a time
        const domains = Object.keys(selectedLinks);

        for (let i = 0; i < domains.length; i += batchSize) {
            const batch = domains.slice(i, i + batchSize);
            const batchResults = await processBatch(batch, selectedLinks);
            Object.assign(results, batchResults);
        }

        // Adding the status based on ecommerceScore
        const finalResults = [];
        for (const domain in results) {
            if (results[domain].ecommerceScore !== undefined) {
                finalResults.push({
                    domain,
                    ...results[domain],
                    status: results[domain].ecommerceScore >= 5 ? 'true' : 'false'
                });
            } else {
                finalResults.push({ domain, ...results[domain] });
            }
        }

        await scoresCollection.insertMany(finalResults);

        console.log(`Results written to the scores collection in MongoDB`);
    } catch (error) {
        console.error('Error:', error.message);
    } finally {
        if (clientConnection) {
            await clientConnection.close();
        }
    }
})();

const express = require('express');
const db = require('./db');
const config = require('./config.json');

const log = (...args) => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}]`, ...args);
};

const app = express();

app.use((req, res, next) => {
    log(req.headers['cf-connecting-ip'], req.method, req.url);
    next();
});

app.set('view engine', 'ejs');
app.use(express.static('public'));

app.get('/', (req, res) => {
    res.render('layout', {
        page: 'home'
    });
});

app.get('/leaderboard', (req, res) => {
    const page = parseInt(req.query.p) || 1;
    res.render('layout', {
        title: 'Leaderboard',
        page: 'leaderboard'
    });
});

app.get('/users/:id', (req, res) => {
    const userId = req.params.id;
    res.render('layout', {
        title: userId,
        page: 'profile',
        userId: userId
    });
});

app.get('/queue', (req, res) => {
    res.render('layout', {
        title: `Update queue`,
        page: 'queue'
    });
});

app.use((req, res) => {
    res.status(404).render('layout', {
        title: '404 Not Found',
        page: 'error',
        number: 404,
        message: `The page you requested couldn't be found.`
    });
});

app.use((err, req, res, next) => {
    log(err);
    res.status(500);
    res.render('layout', {
        title: `500 Internal Server Error`,
        page: 'error',
        number: 500,
        message: `An internal server error occurred. Please try again later.`
    });
});

app.listen(config.webserver_port, () => {
    console.log(`Server is running on port ${config.webserver_port}`);
});

let shuttingDown = false;

process.on('unhandledRejection', (reason, promise) => {
    if (shuttingDown) return;
    shuttingDown = true;
    log('Unhandled Rejection at:', promise, 'reason:', reason);
    db.close();
});

process.on('uncaughtException', (err) => {
    if (shuttingDown) return;
    shuttingDown = true;
    log('Uncaught Exception:', err);
    db.close();
});

process.on('SIGINT', () => {
    if (shuttingDown) return;
    shuttingDown = true;
    log('Received SIGINT');
    db.close();
});

process.on('SIGTERM', () => {
    if (shuttingDown) return;
    shuttingDown = true;
    log('Received SIGTERM');
    db.close();
});
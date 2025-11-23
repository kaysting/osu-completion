const express = require('express');
const db = require('./db');
const config = require('./config.json');

const app = express();
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
        page: '404'
    });
});

app.listen(config.webserver_port, () => {
    console.log(`Server is running on port ${config.webserver_port}`);
});
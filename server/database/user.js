const Router = require('express-promise-router');
const db = require('./index.js');
const router = new Router();
module.exports = router;

const bodyParser = require('body-parser');
const http = require('http');
const jwt = require('jsonwebtoken');
const passport = require("passport");
const passportJWT = require("passport-jwt");
const pbkdf2 = require('pbkdf2');
const crypto = require('crypto');
const request = require('request');

const ExtractJwt = passportJWT.ExtractJwt;
const JwtStrategy = passportJWT.Strategy;

const jwtOptions = {}
jwtOptions.jwtFromRequest = ExtractJwt.fromAuthHeaderAsBearerToken();
jwtOptions.secretOrKey = 'majorestOfSecrets';

function hashPassword(password, salt) {
  return pbkdf2.pbkdf2Sync(
    password,
    salt,
    2149,
    128,
    'sha512'
  ).toString('hex');
}

function generateSalt() {
  return crypto.randomBytes(16).toString('hex');
}

const strategy = new JwtStrategy(jwtOptions, function (jwt_payload, next) {
  if (jwt_payload) {
    next(null, true);
  } else {
    next(null, false);
  }
});

passport.use(strategy);

router.use(passport.initialize());
router.use(bodyParser.json());
router.use(bodyParser.urlencoded({ extended: false }));

router.post('/login', async (req, res) => {
  try {
    if (req.body.username && req.body.password) {
      const { rows } = await db.query('SELECT password, salt, public_key FROM users WHERE username = $1', [req.body.username]);
      if (rows[0]) {
        const password = hashPassword(req.body.password, rows[0].salt);
        if (password === rows[0].password) {
          const payload = rows[0].public_key;
          const token = jwt.sign(payload, jwtOptions.secretOrKey);
          res.status(200).json({ token: token });
        } else {
          res.status(201).json({ message: "Wrong username or password" });
        }
      } else {
        res.status(201).json({ message: "Wrong username or password" });
      }
    }
  } catch (err) {
    console.log(err);
    res.status(500);
  }
});

router.get('/available', async (req, res) => {
  const username = req.query.username;
  const { rows } = await db.query('SELECT username FROM users WHERE username = $1 LIMIT 1', [username]);
  if (rows[0]) {
    res.json({ available: false });
  } else {
    res.json({ available: true });
  }
});


router.post('/register', async (req, res) => {
  try {
    if (req.body.username && req.body.password) {
      const salt = generateSalt();
      const password = hashPassword(req.body.password, salt);
      const { rows } = await db.query('SELECT username FROM users WHERE username = $1 LIMIT 1', [req.body.username]);
      if (rows[0]) {
        res.status(201).json({ message: "Username already taken" });
      } else {
        const { rows } = await db.query('INSERT INTO users (username, password, salt) VALUES ($1, $2, $3) RETURNING id, public_key', [
          req.body.username,
          password,
          salt
        ]);
        await db.query('INSERT INTO mems (id, name, user_id) SELECT id, name, $1 FROM mems_data', [rows[0].id]);
        const payload = rows[0].public_key;
        const token = jwt.sign(payload, jwtOptions.secretOrKey);
        res.status(200).json({ token: token });
      }
    }
  } catch (err) {
    console.log(err)
    res.status(500);
  }
});

router.post('/mem/update', async (req, res) => {
  try {
    const token = jwt.decode(req.body.token);
    var { rows } = await db.query('SELECT id FROM users WHERE public_key = $1 LIMIT 1', [token]);
    if (!rows[0]) {
      res.status(404).json({ message: "Invalid token, data not saved" });
    } else {
      id = rows[0].id;
      db.query('UPDATE mems SET best_time = $1, last_time = $2, index = $3 WHERE id = $4 AND user_id = $5', [
        req.body.besttime,
        req.body.lasttime,
        req.body.index,
        req.body.id,
        id
      ]);
      res.status(200).json({ message: "Data updated" });
    }
  } catch (err) {
    console.log(err);
    res.status(500).json({ message: "Something went wrong" });
  }
});

router.get('/mem/get', async (req, res) => {
  try {
    const token = jwt.decode(req.query.token);
    var { rows } = await db.query('SELECT id FROM users WHERE public_key = $1 LIMIT 1', [token]);
    if (!rows[0]) {
      res.status(404).json({ message: "Invalid token" });
    } else {
      id = rows[0].id;
      var { rows } = await db.query('SELECT id, name, best_time, last_time, index FROM mems WHERE user_id = $1 ORDER BY index ASC', [id]);
      if (rows[0]) {
        res.status(200).json({ rows });
      }
    }
  } catch (err) {
    console.log(err);
    res.status(500).json({ message: "Something went wrong" });
  }
});


router.get('/authenticate', passport.authenticate('jwt', { session: false }), async (req, res) => {
  res.status(200).json({ message: "Authentication succesfull" });
});

/* router.get('/test', async (req, res) => {
  res.status(200).json({ message: "stuff" });
});

router.get('/memstest', async (req, res) => {
  const token = req.query.token;
  console.log(req.query.token);
}); */
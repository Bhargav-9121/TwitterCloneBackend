const express = require("express");
const app = express();
app.use(express.json());
const bcrypt = require("bcrypt");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const path = require("path");
const jwt = require("jsonwebtoken");
const dbPath = path.join(__dirname, "twitterClone.db");
let db = null;

const initializeDBAndServer = async () => {
  try {
    db = await open({ filename: dbPath, driver: sqlite3.Database });
    app.listen(3000, () => {
      console.log("Server Running at http:/localhost:3000/");
    });
  } catch (e) {
    console.log(e.message);
  }
};

initializeDBAndServer();

// No need actually, but just cuz I wanted to try out the middleware function thing
const checkingThing = async (request, response, next) => {
  const { username, password, name, gender } = request.body;
  const checkQuery = `select * from user where username = '${username}';`;
  const checkResult = await db.get(checkQuery);

  if (checkResult === undefined) {
    if (password.length >= 6) {
      request.username = username;
      request.password = password;
      request.name = name;
      request.gender = gender;
    } else {
      response.status(400);
      response.send("Password is too short");
      return;
    }
  } else {
    response.status(400);
    response.send("User already exists");
    return;
  }
  next();
};

const authenticateToken = (request, response, next) => {
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "MY_SECRET_TOKEN", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.username = payload.username;
        next();
      }
    });
  }
};

//registering thing
app.post("/register/", checkingThing, async (request, response) => {
  const { username, password, name, gender } = request;
  const hashedPass = await bcrypt.hash(password, 10);
  const addUser = `insert into user (username, password, name, gender)
                        values ('${username}', '${hashedPass}', '${name}', '${gender}')`;
  await db.run(addUser);
  response.send("User created successfully");
});

//login thing
app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const checkQuery = `select * from user where username = '${username}';`;
  const checkThing = await db.get(checkQuery);
  if (checkThing === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const isPassCorrect = await bcrypt.compare(password, checkThing.password);
    if (isPassCorrect) {
      const payload = {
        username: username,
      };
      const jwtToken = jwt.sign(payload, "MY_SECRET_TOKEN");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

//API-3
app.get("/user/tweets/feed/", authenticateToken, async (request, response) => {
  const { username } = request;
  const queryThing = `SELECT
user.username, tweet.tweet, tweet.date_time AS dateTime
FROM
follower
INNER JOIN tweet
ON follower.following_user_id = tweet.user_id
INNER JOIN user
ON tweet.user_id = user.user_id
WHERE
follower.follower_user_id = (select user_id from user where username = '${username}')
ORDER BY
tweet.date_time DESC
LIMIT 4;`;
  const queryRes = await db.all(queryThing);
  response.send(queryRes);
});

//API-4 The users - owner is following
app.get("/user/following/", authenticateToken, async (request, response) => {
  const { username } = request;
  const queryThing = `select name from user where user_id in (select following_user_id from follower where follower_user_id = (select user_id from user where username = '${username}'));`;
  const queryRes = await db.all(queryThing);

  response.send(queryRes);
});

//API-5
app.get("/user/followers/", authenticateToken, async (request, response) => {
  const { username } = request;
  const queryThing = `select name from user where user_id in (select follower_user_id from follower where following_user_id = (select user_id from user where username = '${username}'));`;
  const queryRes = await db.all(queryThing);
  response.send(queryRes);
});

//API-6
app.get("/tweets/:tweetId/", authenticateToken, async (request, response) => {
  const { tweetId } = request.params;
  const { username } = request;
  const queryThing = `select user_id from user where user_id in (select following_user_id from follower where follower_user_id = (select user_id from user where username = '${username}'));`;
  const queryRes = await db.all(queryThing);
  console.log(queryRes);

  const listThing = [];
  queryRes.map((each) => listThing.push(each.user_id));
  console.log(listThing);

  const tweetQuery = `select user_id from tweet where tweet_id = ${tweetId};`;
  const tweetThing = await db.get(tweetQuery);
  console.log(tweetThing.user_id);

  if (listThing.includes(tweetThing.user_id)) {
    const finalQuery = `select 
    (select tweet from tweet where tweet_id=1) as tweet,
    (select count(tweet_id) from like where tweet_id=1) as likes,
    (select count(tweet_id) from reply where tweet_id=1) as replies,
    (select date_time from tweet where tweet_id = 1) as dateTime;`;
    const finalRes = await db.get(finalQuery);
    response.send(finalRes);
    console.log(finalRes);
  } else {
    console.log("Still");
    response.status(401);
    response.send("Invalid Request");
  }
});

//API-7
app.get(
  "/tweets/:tweetId/likes/",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;
    const { username } = request;
    const queryThing = `select user_id from user where user_id in (select following_user_id from follower where follower_user_id = (select user_id from user where username = '${username}'));`;
    const queryRes = await db.all(queryThing);
    console.log(queryRes);

    const listThing = [];
    queryRes.map((each) => listThing.push(each.user_id));
    console.log(listThing);

    const tweetQuery = `select user_id from tweet where tweet_id = ${tweetId};`;
    const tweetThing = await db.get(tweetQuery);
    console.log(tweetThing.user_id);

    if (listThing.includes(tweetThing.user_id)) {
      const resQuery = `select user.username as likes from user join like on like.user_id = user.user_id
                        where tweet_id = ${tweetId};`;
      const resThing = await db.all(resQuery);
      const likes = [];
      resThing.map((each) => likes.push(each.likes));
      console.log({ likes });
      response.send({ likes });
    } else {
      console.log("Still");
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

//API-8
app.get(
  "/tweets/:tweetId/replies/",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;
    const { username } = request;
    const queryThing = `select user_id from user where user_id in (select following_user_id from follower where follower_user_id = (select user_id from user where username = '${username}'));`;
    const queryRes = await db.all(queryThing);
    console.log(queryRes);

    const listThing = [];
    queryRes.map((each) => listThing.push(each.user_id));
    console.log(listThing);

    const tweetQuery = `select user_id from tweet where tweet_id = ${tweetId};`;
    const tweetThing = await db.get(tweetQuery);
    console.log(tweetThing.user_id);

    if (listThing.includes(tweetThing.user_id)) {
      const resQuery = `select user.name, reply.reply from user join reply on reply.user_id = user.user_id
                        where tweet_id = ${tweetId};`;
      const replies = await db.all(resQuery);
      response.send({ replies });
    } else {
      console.log("Still");
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

//API-9
app.get("/user/tweets/", authenticateToken, async (request, response) => {
  const { username } = request;
  const queryThing = `select
    tweet.tweet,
    coalesce(like_count.like_count, 0) AS likes,
    coalesce(reply_count.reply_count, 0) AS replies,
    tweet.date_time as dateTime
    from
            tweet
        left join
            (
                select
                    tweet_id,
                    count(*) AS like_count
                from
                    like
                group by
                    tweet_id
            ) AS like_count ON tweet.tweet_id = like_count.tweet_id
        left join
            (
                select
                    tweet_id,
                    count(*) AS reply_count
                from
                    REPLY
                group by
                    tweet_id
            ) AS reply_count ON tweet.tweet_id = reply_count.tweet_id
        where
            tweet.user_id = (select user_id from user where username = '${username}')
                        group by tweet.tweet_id;`;

  const queryRes = await db.all(queryThing);
  response.send(queryRes);
});

//API-10
app.post("/user/tweets/", authenticateToken, async (request, response) => {
  const { tweet } = request.body;
  const { username } = request;
  const reqQuery = `INSERT INTO tweet (tweet)
VALUES ('${tweet}');`;
  await db.run(reqQuery);
  response.send("Created a Tweet");
});

//API-11
app.delete(
  "/tweets/:tweetId/",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;
    const { username } = request;
    const tweetIdQuery = `select tweet_id from tweet where user_id = (select user_id from user where username = '${username}');`;
    const tweetIdThing = await db.all(tweetIdQuery);
    const newList = [];
    tweetIdThing.map((each) => newList.push(each.tweet_id));

    if (newList.includes(Number(tweetId))) {
      const finalQuery = `delete from tweet where tweet_id = ${tweetId}`;
      await db.run(finalQuery);
      response.send("Tweet Removed");
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

module.exports = app;

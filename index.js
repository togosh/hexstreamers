var CONFIG = require('./config.json');
var DEBUG = CONFIG.debug;
var TEST_DATA = CONFIG.testData;

var onlineListHTML = '';
var offlineListHTML = '';
var videoListHTML = '';
var scheduledListHTML = '';
var rssListHTML = '';
var tikTokListHTML = '';
var hexPrice = '';

var connections = {};

const TYPE_YOUTUBE = 'YOUTUBE';
const TYPE_TWITCH = 'TWITCH';
const TYPE_DLIVE = 'DLIVE';
const TYPE_THETA = 'THETA';
const TYPE_TROVO = 'TROVO';

const fs = require('fs');
const http = require('http');
const https = require('https');
const express = require('express');
const path = require('path');
const fetch = require('node-fetch');
const imgSize = require('request-image-size');
const sharp = require('sharp'); sharp.cache(false);

var mongoose = require('mongoose');
var Schema = mongoose.Schema;

var hostname = CONFIG.hostname;
if(DEBUG){ hostname = 'localhost' }

var httpPort  = 80; 
if(DEBUG){ httpPort  = 3000;}
const httpsPort = 443;

var httpsOptions = undefined;
if(!DEBUG){ httpsOptions = {
	cert: fs.readFileSync(CONFIG.https.cert),
	ca: fs.readFileSync(CONFIG.https.ca),
	key: fs.readFileSync(CONFIG.https.key)
};}

var ConnectionSchema = new Schema({
	created: {
    type: Date, 
    required: true
  },
	ipaddress: {
    type: String, 
    required: true
  }
});

const Connection = mongoose.model('Connection', ConnectionSchema);

const app = express();

app.use(function(req, res, next) {
	try {
	if (req.path === "/" && req.ip){
		//log('CONNECT - IP ADDRESS: ' + req.ip);
		connections[req.ip] = Date.now();

		const connection = new Connection({ 
			created: Date.now(),
			ipaddress: req.ip
		});

		//log('CONNECT - SAVE: ' + req.ip);
		connection.save(function (err) {
			if (err) return console.error(err);
		});
	}
	} catch (error) {
		log('APP ----- RECORD IP - ' + error);
	}

	next();
});

const httpServer = http.createServer(app);
var httpsServer = undefined;
if(!DEBUG){ httpsServer = https.createServer(httpsOptions, app);}

if(!DEBUG){ app.use((req, res, next) => 
{
	if(req.protocol === 'http') { 
		res.redirect(301, 'https://' + hostname); 
	}
	next(); 
}); }

app.use(express.static(path.join(__dirname, 'public')));

app.get("/", function(req, res){ res.sendFile('/index.html', {root: __dirname}); });

httpServer.listen(httpPort,  hostname, () => { log('listening on *:' + httpPort ); });
if(!DEBUG){ httpsServer.listen(httpsPort, hostname, () => { log('listening on *:' + httpsPort); }); }

var io = undefined;
if(DEBUG){ io = require('socket.io')(httpServer);
} else { io = require('socket.io')(httpsServer, {secure: true}); }

io.on('connection', (socket) => {
	log('SOCKET -- ************* CONNECTED: ' + socket.id + ' *************');
	socket.emit("onlineList", onlineListHTML);
	socket.emit("offlineList", offlineListHTML);
	socket.emit("videoList", videoListHTML);
	socket.emit("scheduledList", scheduledListHTML);
	socket.emit("rssList", rssListHTML);
	socket.emit("tikTokList", tikTokListHTML);
	socket.emit("hexPrice", hexPrice);
});


/////////////  TWITCH SETUP

var { ApiClient } = require('twitch');
var { ClientCredentialsAuthProvider } = require('twitch-auth');

const clientId = CONFIG.twitch.clientId;
const clientSecret = CONFIG.twitch.clientSecret;

authProvider = undefined;
twitchAPI = undefined;
if (CONFIG.twitch.enabled) {
	authProvider = new ClientCredentialsAuthProvider(clientId, clientSecret);
	twitchAPI = new ApiClient({authProvider});
}

///////////// YOUTUBE SETUP

const youtube = require('scrape-youtube').default;
const youtubeKey = CONFIG.youtube.key;

///////////// DLIVE SETUP

const dlive = require('dlivetv-api');
const dliveKey = CONFIG.dlive.key;
var dliveAPI = undefined;
if (CONFIG.dlive.enabled) {
	dliveAPI = new dlive(dliveKey); }

async function updateDliveAPI() {
	dliveAPI = new dlive(dliveKey);
}

//////////////////////
// TIMERS

if (CONFIG.twitch.enabled) {
var twitchTimer = CONFIG.timers.twitch * 60 * 1000; // minutes * seconds * milliseconds
setInterval(function() {
  log("TWITCH -- ****TIMER: " + (twitchTimer / 1000) + ' seconds');
	updateTwitch();
}, twitchTimer); }

if (CONFIG.youtube.enabled) {
var youtubeTimer = CONFIG.timers.youtube * 60 * 1000;
setInterval(function() {
  log("YOUTUBE - ****TIMER: " + (youtubeTimer / 1000) + ' seconds');
	updateYoutube();
}, youtubeTimer); }

if (CONFIG.dlive.enabled) {
var dliveTimer = CONFIG.timers.dlive * 60 * 1000;
var dliveTimerCount = 0;
setInterval(async function() {
  log("DLIVE --- ****TIMER: " + (dliveTimer / 1000) + ' seconds');
	//await updateDlive();
	dliveTimerCount += 1;
	if (dliveTimerCount > 60){
		//updateDliveAPI();
		dliveTimerCount = 0;
	}
}, dliveTimer); }

var listTimer = CONFIG.timers.list * 60 * 1000;
setInterval(function() {
	//log("UPDATE LISTS -- ****TIMER: " + (listTimer / 1000) + ' seconds');
	updateOnlineList();
	updateOfflineList();
}, listTimer);

if (CONFIG.schedule.enabled) {
var scheduleTimer = CONFIG.timers.schedule * 60 * 1000;
setInterval(function() {
	//log("UPDATE SCHEDULE -- ****TIMER: " + (scheduleTimer / 1000) + ' seconds');
	updateSchedule();
}, scheduleTimer); }

if (CONFIG.youtube.enabledVideo) {
var youtubeVideoTimer = CONFIG.timers.youtubeVideo * 60 * 1000;
setInterval(function() {
  log("YTCLIP - ****TIMER: " + (youtubeVideoTimer / 1000) + ' seconds');
	updateYoutubeVideos();
}, youtubeVideoTimer); 

var youtubeVideoListTimer = CONFIG.timers.youtubeVideoList * 60 * 1000;
setInterval(function() {
  log("YTCLIP - ****TIMER: " + (youtubeVideoListTimer / 1000) + ' seconds');
	updateYoutubeVideoList();
}, youtubeVideoListTimer); 
}

if (CONFIG.theta.enabled) {
var thetaTimer = CONFIG.timers.theta * 60 * 1000;
setInterval(function() {
  log("THETA --- ****TIMER: " + (thetaTimer / 1000) + ' seconds');
	updateTheta();
}, thetaTimer); }

if (CONFIG.trovo.enabled) {
var trovoTimer = CONFIG.timers.trovo * 60 * 1000;
setInterval(function() {
  log("TROVO --- ****TIMER: " + (trovoTimer / 1000) + ' seconds');
	updateTrovo();
}, trovoTimer); }

if (CONFIG.rss.enabled) {
var rssTimer = CONFIG.timers.rss * 60 * 1000;
setInterval(function() {
	log("UPDATE RSS -- ****TIMER: " + (rssTimer / 1000) + ' seconds');
	updateRSSItems();
}, rssTimer); 

var rssListTimer = CONFIG.timers.rssList * 60 * 1000;
setInterval(function() {
	log("UPDATE RSSLIST -- ****TIMER: " + (rssListTimer / 1000) + ' seconds');
	updateRSSList();
}, rssListTimer); }

if (CONFIG.tiktok.enabled) {
	var tikTokTimer = CONFIG.timers.tiktok * 60 * 1000;
	setInterval(function() {
		log("UPDATE TIKTOK -- ****TIMER: " + (tikTokTimer / 1000) + ' seconds');
		updateTikTokVideos();
	}, tikTokTimer); 
	
	var tikTokListTimer = CONFIG.timers.tiktokList * 60 * 1000;
	setInterval(function() {
		log("UPDATE TIKTOKLIST -- ****TIMER: " + (tikTokListTimer / 1000) + ' seconds');
		updateTikTokList();
	}, tikTokListTimer); }
	
if (CONFIG.price.enabled) {
	var priceTimer = CONFIG.timers.price * 60 * 1000;
	setInterval(function() {
		//log("PRICE --- ****TIMER: " + (priceTimer / 1000) + ' seconds');
		updatePrice();
	}, priceTimer); }
		

//////////////////////
// STREAM MODEL

var StreamSchema = new Schema({
	searchKey: { // username, channelId 
    type: String, 
    required: true
  },
	name: String,
	title: String,
	profileURL: {
    type: String,
    default: 'defaultprofile.png'
	},
	viewers: Number,
	streamType: { // TWITCH, YOUTUBE, DLIVE
    type: String, 
    required: true
  },
	live: Boolean,
	streamEnd: Date,
	isTestData: Boolean,
	videoId: String,
	twitter: String,
	scheduledDate: Date,
	hideOffline: {
		type: Boolean,
		default: false
	}
});

StreamSchema.methods.getLink = function (video = false) {
  if (this.streamType === TYPE_TWITCH)  {return 'https://twitch.tv/' + this.searchKey;}
	if (this.streamType === TYPE_DLIVE)   {return 'https://dlive.tv/' + this.searchKey;}
	if (this.streamType === TYPE_YOUTUBE) {
		if (video && this.videoId) { return 'https://www.youtube.com/watch?v=' + this.videoId;}
		else 											 { return 'https://www.youtube.com/channel/' + this.searchKey + '/live';}
	}
	if (this.streamType === TYPE_THETA) {return 'https://www.theta.tv/' + this.searchKey;}
	if (this.streamType === TYPE_TROVO) {return 'https://trovo.live/' + this.searchKey;}

	return '';
};

StreamSchema.methods.getColor = function () {
  if (this.streamType === TYPE_TWITCH)  {return '#8A2BE2'}
	if (this.streamType === TYPE_YOUTUBE) {return 'red'    }
	if (this.streamType === TYPE_DLIVE)   {return 'yellow' }
	if (this.streamType === TYPE_THETA)   {return '#3db3df'}
	if (this.streamType === TYPE_TROVO)   {return 'green'  }
	return 'grey';
};

StreamSchema.methods.generateHTML = function (isOffline) {
	var html = ''
	+ '<a href="' + this.getLink(true) + '" style="text-decoration: none; color: inherit;" target="_blank" onMouseOver="this.style.opacity=0.7" onMouseOut="this.style.opacity=1.0">' //onMouseOut="this.style.color=\'#FFFFFF\'" onMouseOver="this.style.color=\'#f90fb7\'" // onMouseOut="this.style.border-top=\'1px solid #d0d0d0\'";
	+ '<div class="streamRow" style="display: flex; margin: 0px 0px 7px 0px; border: 1px solid black; max-height: 110px; border-right: 5px solid ' + this.getColor() + '; border-bottom-right-radius: 24px; border-top-right-radius: 24px; border-bottom-left-radius: 24px; border-top-left-radius: 24px; background-color: #1b1b1b;" onMouseOver="this.style.opacity=0.7" onMouseOut="this.style.opacity=1.0">'
	+ '<div class="streamIcon" style="min-width: 100px"><img loading="lazy" width="100" height="100" src="' + this.profileURL + '" style="border: 1px solid #000; border-radius: 15px;" onMouseOver="this.style.opacity=0.7" onMouseOut="this.style.opacity=1.0"></div>'
	+ '<div class="streamInfo" style="padding-left: 10px; padding-top: 10px; width: 100%; overflow: hidden;">'
	+ '<div class="streamName" style="font-size: 200%; color: white;">' + this.name + '</div>'
	+ '<div class="streamTitle" style="font-size: 120%; color: #a9a9a9; max-width: 600px; max-height: 48px; overflow: hidden; padding-left: 3px;">' + this.title + '</div></div>' // text-overflow: ellipsis; white-space: nowrap; overflow: hidden;
	+ '<div class="streamViewers" style="width: 65px; color: white; position: relative; float: right; font-size: 150%; margin: 36px 14px 0px 0px; text-align: right;">' + this.viewers + '</div>'
	+ '</div></a>';
	return html;
}

StreamSchema.methods.generateHTMLOffline = function () {
	var hoursAgo = 24;
	if (this.streamEnd){
		hoursAgo = Math.round((Math.abs(Date.now() - this.streamEnd) / 1000 / 60 / 60));
	}
	var html = ''
	+ '<a href="' + this.getLink(true) + '" style="text-decoration: none; color: inherit;" target="_blank" onMouseOver="this.style.opacity=0.7" onMouseOut="this.style.opacity=1.0">' //onMouseOut="this.style.color=\'#FFFFFF\'" onMouseOver="this.style.color=\'#f90fb7\'" // onMouseOut="this.style.border-top=\'1px solid #d0d0d0\'";
	+ '<div class="streamRow" style="display: flex; margin: 0px 0px 7px 0px; border: 1px solid black; max-height: 70px; border-right: 5px solid ' + this.getColor() + '; border-bottom-right-radius: 24px; border-top-right-radius: 24px; border-bottom-left-radius: 24px; border-top-left-radius: 24px; background-color: #1b1b1b;" onMouseOver="this.style.opacity=0.7" onMouseOut="this.style.opacity=1.0">'
	+ '<div class="streamIcon" style="min-width: 70px"><img loading="lazy" width="70" height="70" src="' + this.profileURL + '" style="border: 1px solid #000; border-radius: 15px;" onMouseOver="this.style.opacity=0.7" onMouseOut="this.style.opacity=1.0"></div>'
	+ '<div class="streamInfo" style="padding-left: 10px; padding-top: 0px; width: 100%; overflow: hidden;">'
	+ '<div class="streamName" style="height: 100%; font-size: 160%; color: white; display: flex; justify-content: center; align-content: center; flex-direction: column;">' + this.name + '</div>'
	+ '</div>'
	+ '<div class="streamViewers" style="min-width: 90px; color: white; font-size: 130%; margin: 0px 10px 0px 0px; display: flex; justify-content: center; flex-direction: column; text-align: right;">' + hoursAgo + ' hrs ago</div>'
	//'<div class="streamViewers" style="min-width: 90px; color: white; position: relative; float: right; font-size: 150%; margin: 0px 14px 0px 0px; text-align: right;">'
	+ '</div></a>';
	return html;
}

StreamSchema.methods.generateHTMLSchedule = function () {
	var scheduledHours = 24;
	var scheduledMinutes = 60;
	if (this.scheduledDate){
		scheduledMinutes = Math.round((Math.abs(this.scheduledDate - Date.now()) / 1000 / 60));
		scheduledHours = Math.round((scheduledMinutes / 60));
	}
	var html = ''
	+ '<a href="' + this.getLink() + '" style="text-decoration: none; color: inherit;" target="_blank" onMouseOver="this.style.opacity=0.7" onMouseOut="this.style.opacity=1.0">' //onMouseOut="this.style.color=\'#FFFFFF\'" onMouseOver="this.style.color=\'#f90fb7\'" // onMouseOut="this.style.border-top=\'1px solid #d0d0d0\'";
	+ '<div class="streamRow" style="display: flex; margin: 0px 0px 7px 0px; border: 1px solid black; max-height: 70px; border-right: 5px solid ' + this.getColor() + '; border-bottom-right-radius: 24px; border-top-right-radius: 24px; border-bottom-left-radius: 24px; border-top-left-radius: 24px; background-color: #1b1b1b;" onMouseOver="this.style.opacity=0.7" onMouseOut="this.style.opacity=1.0">'
	+ '<div class="streamIcon" style="min-width: 70px"><img loading="lazy" width="70" height="70" src="' + this.profileURL + '" style="border: 1px solid #000; border-radius: 15px;" onMouseOver="this.style.opacity=0.7" onMouseOut="this.style.opacity=1.0"></div>'
	+ '<div class="streamInfo" style="padding-left: 10px; padding-top: 0px; width: 100%; overflow: hidden;">'
	+ '<div class="streamName" style="height: 100%; font-size: 160%; color: white; display: flex; justify-content: center; align-content: center; flex-direction: column;">' + this.name + '</div>'
	+ '</div>'
	+ '<div class="streamViewers" style="min-width: 90px; color: white; font-size: 130%; margin: 0px 10px 0px 0px; display: flex; justify-content: center; flex-direction: column; text-align: right;">'; 
	
	if (scheduledMinutes > 90) {
		html += scheduledHours + ' hrs';
	} else {
		html += scheduledMinutes + ' min';
	}
	//'<div class="streamViewers" style="min-width: 90px; color: white; position: relative; float: right; font-size: 150%; margin: 0px 14px 0px 0px; text-align: right;">'
	html += ' </div></div></a>';
	return html;
}

const Stream = mongoose.model('Stream', StreamSchema);

function createInitialStreams() {
	return;
	log('createInitialStreams() START');
	const stream = new Stream({ 
		searchKey: 'ABC',
		streamType: TYPE_YOUTUBE,
		isTestData: false
	});
	stream.save(function (err) {
		if (err) return console.error(err);
	});
	log('createInitialStreams() END');
}

//////////////////////
// YoutubeVideo

var YoutubeVideoSchema = new Schema({
	videoId: {
    type: String, 
    required: true
  },
	channelId: {
    type: String, 
    required: true
  },
	name: String,
	title: String,
	profileURL: String,
	isTestData: Boolean,
	hide: {
		type: Boolean,
		default: false
	},
	published: Date,
	twitter: String
});

YoutubeVideoSchema.methods.getLink = function () {
  return 'https://www.youtube.com/watch?v=' + this.videoId;
};

YoutubeVideoSchema.methods.generateHTML = function () {
	var html = ''
	+ '<a href="' + this.getLink() + '" style="text-decoration: none; color: inherit;" target="_blank" onMouseOver="this.style.opacity=0.7" onMouseOut="this.style.opacity=1.0">' //onMouseOut="this.style.color=\'#FFFFFF\'" onMouseOver="this.style.color=\'#f90fb7\'" // onMouseOut="this.style.border-top=\'1px solid #d0d0d0\'";
	+ '<div class="streamRow" style="display: flex; margin: 0px 0px 7px 0px; border: 1px solid black; max-height: 90px; border-right: 5px solid red; border-bottom-right-radius: 24px; border-top-right-radius: 24px; border-bottom-left-radius: 24px; border-top-left-radius: 24px; background-color: #1b1b1b;" onMouseOver="this.style.opacity=0.7" onMouseOut="this.style.opacity=1.0">'
	+ '<div class="streamIcon" style="min-width: 100px"><img loading="lazy" width="100" height="75" src="' + this.profileURL + '" style="border: 1px solid #000; border-radius: 15px;" onMouseOver="this.style.opacity=0.7" onMouseOut="this.style.opacity=1.0"></div>'
	+ '<div class="streamInfo" style="padding-left: 10px; padding-top: 2px; width: 100%; overflow: hidden;">'
	+ '<div class="streamName" style="font-size: 160%; color: white;">' + this.name + '</div>'
	+ '<div class="streamTitle" style="font-size: 120%; color: #a9a9a9; max-width: 600px; max-height: 48px; overflow: hidden; padding-left: 3px;">' + this.title + '</div></div>' // text-overflow: ellipsis; white-space: nowrap; overflow: hidden;
	+ '<div class="streamViewers" style="color: white; position: relative; float: right; font-size: 150%; text-align: right;"></div>'
	+ '</div></a>';
	return html;
}

const YoutubeVideo = mongoose.model('YoutubeVideo', YoutubeVideoSchema);

function createInitialYoutubeVideo() {
	log('createInitialYoutubeVideo() START');
	const youtubeVideo = new YoutubeVideo({ 
		videoId: 'ubKIknPI_xM',
		channelId: '',
		name: "hodl dog",
		title: "A little HEX correction is healthy",
		profileURL: "https://yt3.ggpht.com/ytc/AAUvwnjnOySdVyqUksWuDU9lE8tobpHtIaWyGZ5MrJMT=s48-c-k-c0x00ffffff-no-rj",
		isTestData: false,
		hide: false,
		published: new Date()
	});
	youtubeVideo.save(function (err) {
		if (err) return console.error(err);
	});
	log('createInitialYoutubeVideo() END');
}

//////////////////////
// YoutubeCreator

var YoutubeCreatorSchema = new Schema({
	channelId: {
    type: String, 
    required: true
  },
	name: String,
	limit: Number,
	isTestData: Boolean,
	twitter: String
});

const YoutubeCreator = mongoose.model('YoutubeCreator', YoutubeCreatorSchema);

function createInitialYoutubeCreator() {
	log('createInitialYoutubeCreator() START');
	const youtubeCreator = new YoutubeCreator({ 
		channelId: 'UC7d6K2rDalsphrftXO-SKYA',
		name: "Long Live HEX",
		limit: 1,
		isTestData: false
	});
	youtubeCreator.save(function (err) {
		if (err) return console.error(err);
	});
	log('createInitialYoutubeCreator() END');
}

//////////////////////
// DATABASE & STREAM MODEL

var mongoDB = CONFIG.mongodb.connectionString;
mongoose.connect(mongoDB, {useNewUrlParser: true, useUnifiedTopology: true}).then(() => {
		
		updateOnlineList();
		updateOfflineList();

		if (CONFIG.youtube.enabled){updateYoutube();}
		if (CONFIG.twitch.enabled){updateTwitch();}
		if (CONFIG.dlive.enabled){updateDlive();}
		if (CONFIG.theta.enabled){updateTheta();}
		if (CONFIG.trovo.enabled){updateTrovo();}
		if (CONFIG.youtube.enabledVideo) {updateYoutubeVideoList();}
		if (CONFIG.schedule.enabled){updateSchedule();}
		if (CONFIG.rss.enabled){updateRSSList();}
    if (CONFIG.tiktok.enabled){updateTikTokList();}
		if (CONFIG.price.enabled){updatePrice();}

		//updateTikTokVideos();
		//testRedditRSS(); //////////////////// TESTING
});

var db = mongoose.connection;
db.on('error', console.error.bind(console, 'MongoDB connection error:'));


////////////////////// 
// TWITCH

async function updateTwitchStream(stream){
	try {
	// https://d-fischer.github.io/twitch/reference/classes/HelixUser.html
	var user = await twitchAPI.helix.users.getUserByName(stream.searchKey);
	if (user) {
		await sleep(1000);
		stream.profileURL = user.profilePictureUrl.replace("300x300", "150x150");

		// https://d-fischer.github.io/twitch/reference/classes/HelixStream.html
		var streamData = await twitchAPI.helix.streams.getStreamByUserName(stream.searchKey);
		if (streamData) {
			log('TWITCH -- ONLINE: ' + stream.searchKey);
			stream.name = streamData.userDisplayName;
			stream.title = streamData.title;
			stream.viewers = Number(streamData.viewers);

			try {
				// https://static-cdn.jtvnw.net/previews-ttv/live_user_joehexotic369-{width}x{height}.jpg
				stream.thumbnail = streamData.thumbnailUrl.replace("{width}", "640").replace("{height}", "360");
				//('TWITCH -- THUMBNAIL - ' + stream.thumbnail);
			} catch (err) {
				log("TWITCH -- THUMBNAIL - ERROR: " + err);
			}

			//log('TWITCH -- stream.live - ' + stream.live);
			if (stream.live === false && stream.thumbnail) {
				//log('TWITCH -- THUMBNAIL EXISTS TWEET');

				var sendTweet = true;
				//log('TWITCH -- stream.streamEnd - ' + stream.streamEnd);
				if (stream.streamEnd !== undefined) {
					//log('TWITCH -- stream.streamEnd exists');
					var hoursAgo = new Date();
					hoursAgo.setHours(hoursAgo.getHours() - CONFIG.twitter.buffer);
					var endDate = new Date(stream.streamEnd);
					var hoursAgoDate = new Date(hoursAgo);
					//log('TWITCH -- EndDate: ' + endDate + " - HoursAgoDate: " + hoursAgoDate);
					if (endDate > hoursAgoDate) {
						//log('TWITCH -- endDate < hoursAgoDate - TRUE');
						sendTweet = false;
					}
				}

				if (sendTweet && stream.twitter && stream.twitter !== "") {
					tweet(stream);
					//var tweetURL = await tweet(stream);
					//if (tweetURL) { telegramSendMessage(tweetURL); }
				}
			}

			stream.live = true;
		}
		else {
			if (stream.live === true){
				stream.title = '';
				stream.viewers = 0;
				stream.streamEnd = Date.now();
			}
			stream.live = false;
		}
	}
	await sleep(1000);

	stream.save(function (err) {
		if (err) return console.error(err);
	});
	} catch (err) {
		log("TWITCH -- ERROR - updateTwitchStream() - " + err + "\n" + err.stack);
	}
}

async function updateTwitch(){
	try {
	var streams = [];
	if (!TEST_DATA) {
		streams = await Stream.find({ $and: [{ streamType: { $eq: TYPE_TWITCH } }, {isTestData: { $eq: false}}]});
	} else {
		//streams = await Stream.find({ streamType: { $eq: TYPE_TWITCH } });
		streams = await Stream.find({ $and: [{ streamType: { $eq: TYPE_TWITCH } }, {isTestData: { $eq: true}}]});
	}

	for (var stream of streams) {
		//if (stream.searchKey === 'fundinggym') { /////////////////////////////
			//log('TWITCH -- ' + stream.searchKey);
			await updateTwitchStream(stream);
			await sleep(1000);
		//} ////////////////////////////
	}
	} catch (err) {
		log("TWITCH -- ERROR - updateTwitch() - " + err + "\n" + err.stack);
	}
}

////////////////////// 
// YOUTUBE

async function updateYoutubeStream(stream){
	try {
	var resp = await fetch(stream.getLink()); // youtube.com/channel/searchKey/live
	var data = await resp.text();

	var premiering = data.includes('PREMIERING NOW');
	var live = data.includes("watching now");

	var scheduled = false;
	//log('YOUTUBE - SCHEDULE MATCH CHECK ');
	var scheduleMatch = data.match('<yt-formatted-string.{10, 80}>Scheduled for');
	if (scheduleMatch) { scheduled = true; } 
	else {
		//log('YOUTUBE - SCHEDULE MATCH CHECK 2');
		var scheduleMatch2 = data.match('"dateText":{"simpleText":"Scheduled for');
		if (scheduleMatch2) { scheduled = true; }
	}

	// Get Scheduled Start Time
	if (scheduled) {
		//log('YOUTUBE - SCHEDULED - ' + scheduled);
		var scheduleTimeMatch = data.match('{"liveStreamOfflineSlateRenderer":{"scheduledStartTime":"([0-9]{6,12})"');

		if (scheduleTimeMatch && scheduleTimeMatch.length >= 2){
			var scheduleStartTime = scheduleTimeMatch[1];
			var scheduledStartDate = new Date(scheduleStartTime * 1000);
			//log('YOUTUBE - SCHEDULED START DATE - ' + scheduledStartDate);
			stream.scheduledDate = scheduledStartDate;
		}
		else {
			//log('YOUTUBE - NO SCHEDULED MATCH');
			stream.scheduledDate = undefined;
		}
	} else {
		stream.scheduledDate = undefined;
	}

	//if((live === true || premiering === true ) && scheduled === false){
	if(((live === true && premiering === false ) || (live === false && premiering === true )) 
		  && scheduled === false){
		log('YOUTUBE - ONLINE: ' + stream.searchKey + ' - ' + stream.name);

		// Get videoId
		var videoMatch = data.match('"addedVideoId":"(.*?)","action":"ACTION_ADD_VIDEO"');
		var videoURL = "";
		if (videoMatch && videoMatch.length >= 2){
			var addedVideoId = videoMatch[1];
			videoURL = 'https://www.youtube.com/watch?v=' + addedVideoId;
			//log('YOUTUBE - VIDEO URL: ' + videoURL);
			stream.videoId = addedVideoId;
		}
		else {
			//log('YOUTUBE - No Video Match');
		}
		
		// Load Premiere Video
		if (premiering) {
			log('YOUTUBE - PREMIERING NOW - ' + stream.getLink());
			resp = await fetch(videoURL);
			data = await resp.text();
			//log('YOUTUBE - VIDEO MATCH - ' + videoURL);
		}

		//////var results = await youtube.search(stream.searchKey, { type: 'live' });
		//log('results');
		//////if (results.streams && results.streams.length > 0){
			//log('results2');
			//////var result1 = results.streams[0];
			//////stream.name = result1.channel.name;
			//////stream.title = result1.title;
			//////stream.profileURL = result1.channel.thumbnail;
			//////stream.viewers = Number(result1.watching);
			//////stream.thumbnail = result1.thumbnail;
		//////} 
		//////else {
			// Manual Scraping
			//log('test nameMatch2');
			//var nameMatch2 = data.match('"text":"([^,":#]{0,50})","navigationEndpoint":');
			var nameMatch2 = data.match('"title".{0,16}"text":"([^,":#]{0,50})","navigationEndpoint":');
			if (nameMatch2 && nameMatch2.length >= 2 && nameMatch2[1] !== "Report this ad")
			{
				//log("YOUTUBE TITLE: " + nameMatch2[1]);
				stream.name = nameMatch2[1];
			} 
			else {
				//log('test nameMatch3');
				//var nameMatch3 = data.match('"text":"([^,":]{0,50})","navigationEndpoint":');
				var nameMatch3 = data.match('"title".{0,16}"text":"([^,":]{0,50})","navigationEndpoint":');
				if (nameMatch3 && nameMatch3.length >= 2 && nameMatch3[1] !== "Report this ad")
				{
					//log("YOUTUBE TITLE: " + nameMatch3[1]);
					stream.name = nameMatch3[1];
				} 
				else {
					//log('test nameMatch1');
					//var nameMatch1 = data.match('"text":"(.{0,50})"},{"text":"#.*?","navigationEndpoint":');
					var nameMatch1 = data.match('"title".{0,16}"text":"(.{0,50})","navigationEndpoint":');
					if (nameMatch1 && nameMatch1.length >= 2 && nameMatch1[1] !== "Report this ad")
					{
						//log("YOUTUBE TITLE: " + nameMatch1[1]);
						stream.name = nameMatch1[1];
					} 
				}
			}

			// {"contents":[{"videoPrimaryInfoRenderer".{0,10}"title".{0,10}"runs".{0,10}"text":"(.{0,101})"}

			var titleMatch2 = data.match('"title":"(.{0,101})","alternateType":".{0,30}"}],"viewCount"');
			if (titleMatch2 && titleMatch2.length >= 2){
				stream.title = unicodeToChar(titleMatch2[1]).replace(/\\/g,"");
			} else {
				var titleMatch3 = data.match('"title".{0,20}"runs".{0,20}"text":"(.{0,101}?)"}');
				if (titleMatch3 && titleMatch3.length >= 2){
					stream.title = unicodeToChar(titleMatch3[1]).replace(/\\/g,"");
				} else {
					var titleMatch = data.match('"text":"(.{0,101})"}]},"viewCount"');
					if (titleMatch && titleMatch.length >= 2){
						stream.title = unicodeToChar(titleMatch[1]).replace(/\\/g,"");
					}
				}
			}
			
			var profileMatch = data.match('url":"https://yt3.ggpht.com/ytc/([^,"]*?)","width":[0-9][0-9][0-9],"height":[0-9][0-9][0-9]}]},"title"');
			if (profileMatch && profileMatch.length >= 2){
				stream.profileURL = 'https://yt3.ggpht.com/ytc/' + profileMatch[1];
			}

			// {"viewCount":{"runs":[{"text":"12"},{"text":" watching now"}
			// '"([0-9,]*?)".{0,17}watching now'
			// '"([0-9,]*?).{0,17}watching now'
			var viewersMatch = data.match('"([0-9,]*?) watching now');
			if (viewersMatch && viewersMatch.length >= 2){
				var viewerCountParse = parseFloat(viewersMatch[1].replace(/,/g, ''));
				if (viewerCountParse) {
					stream.viewers = viewerCountParse;
					//log('YOUTUBE - VIEWERCOUNT: ' + viewerCountParse);
				} else {
					//log("YOUTUBE - VIEWERCOUNT PARSE: " + viewerCountParse + ' - viewersMatch[1]: ' + viewersMatch[1] + ' ***********');

					var viewersMatch2 = data.match('"([0-9,]+).{0,17}watching now');
					if (viewersMatch2 && viewersMatch2.length >= 2){
						var viewerCountParse2 = parseFloat(viewersMatch2[1].replace(/,/g, ''));
						if (viewerCountParse2) {
							stream.viewers = viewerCountParse2;
							//log('YOUTUBE - VIEWERCOUNT 2: ' + viewerCountParse2);
						} else {
							//log("YOUTUBE - VIEWERCOUNT PARSE 2: " + viewerCountParse2 + ' - viewersMatch2[1]: ' + viewersMatch2[1] + ' ***********');
						}
					}
				}
			}
		//////}
		
		try {
		// Check if switching from offline to online, and send tweet
		//log('YOUTUBE - stream.live - ' + stream.live);
		if (stream.live === false) {

			// Check if recently streamed (skip brand new streams)
			var sendTweet = true;
			//log('YOUTUBE - stream.streamEnd - ' + stream.streamEnd);
			if (stream.streamEnd !== undefined) {
				log('YOUTUBE - stream.streamEnd exists');
				var hoursAgo = new Date();
				hoursAgo.setHours(hoursAgo.getHours() - CONFIG.twitter.buffer);
				var endDate = new Date(stream.streamEnd);
				var hoursAgoDate = new Date(hoursAgo);
				log('YOUTUBE - EndDate: ' + endDate + " - HoursAgoDate: " + hoursAgoDate);
				if (endDate > hoursAgoDate) {
					log('YOUTUBE - endDate < hoursAgoDate - TRUE');
					if (stream.searchKey !== "UCA-M7KEQ3Ha50UInqZuPj3g") { //Kryptosparbuch does GER then ENG stream in a row
						sendTweet = false;
					}
				}
			}

			if (sendTweet && CONFIG.twitter.enabled){
				// Save Image for Twitter to Public Folder
				//log('YOUTUBE - CHECK TWITTER: ' + stream.twitter + " - VIDEOID: " + stream.videoId);
				var maxResMissing = false;
				var sdMissing = false;
				if (stream.twitter && stream.twitter !== "" && stream.videoId) {
					stream.thumbnail = "https://img.youtube.com/vi/" + stream.videoId + "/maxresdefault.jpg";
					//log('YOUTUBE - REQUEST IMAGE SIZE: ' + stream.thumbnail);
					try {
						const imageSize = await imgSize(stream.thumbnail);
						// Example: { width: 245, height: 66, type: 'png', downloaded: 856 }

						//log("YOUTUBE - IMAGE SIZE: " + imageSize);
						if ((!imageSize.width || !imageSize.height) || imageSize.width < 200 || imageSize.height < 200) {
								maxResMissing = true;
						}
					} catch (error) {
						log("YOUTUBE - REQUEST IMAGE MAXRES ERROR: " + error);
						maxResMissing = true;
					}

					try {
						if (maxResMissing){
							stream.thumbnail = "https://img.youtube.com/vi/" + stream.videoId + "/sddefault.jpg";
							//log('YOUTUBE - IMAGE STANDARD: ' + stream.thumbnail);

							const imageSize2 = await imgSize(stream.thumbnail);
							if ((!imageSize2.width || !imageSize2.height) || imageSize2.width < 200 || imageSize2.height < 200) {
								sdMissing = true;
								stream.thumbnail = "";
							} else {

							var resp2 = await fetch(stream.thumbnail);
							const buffer = await resp2.buffer();

							//log('YOUTUBE - IMAGE BEFORE SHARP: ' + stream.thumbnail);
							await sharp(buffer).extract({ width: 640, height: 360, left: 0, top: 60 }).toFile("./public/" + stream.videoId + ".jpg");
							if(!DEBUG){ stream.thumbnail = "https://" + CONFIG.hostname + "/" + stream.videoId + ".jpg"; }
							else { 			stream.thumbnail = "http://localhost:3000/" 	 + stream.videoId + ".jpg"; }
							//log('YOUTUBE - CUSTOM IMAGE: ' + stream.thumbnail);
							}
						}
					} catch (error) {
						log("YOUTUBE - REQUEST IMAGE SD ERROR: " + error);
						stream.thumbnail = "";
					}

					tweet(stream);
					//var tweetURL = await tweet(stream);
					//if (tweetURL) { telegramSendMessage(tweetURL); }
				}
			}
		}
		} catch (error) {
			log("YOUTUBE - TWITTER ERROR: " + error);
		}
		
		stream.live = true;
	} 
	else {
		if (stream.live === true){
			stream.title = '';
			stream.viewers = 0;
			stream.streamEnd = Date.now();
		}
		stream.live = false;
	}

	stream.save(function (err) {
		if (err) return console.error(err);
	});

	} catch (err) {
		log("YOUTUBE -  ERROR - updateYoutubeStream() - " + err + "\n" + err.stack);
	}
}

async function updateYoutube(){
	try {
	var streams = [];
	if (!TEST_DATA) {
		streams = await Stream.find({ $and: [{ streamType: { $eq: TYPE_YOUTUBE } }, {isTestData: { $eq: false}}]});
	} else {
		//streams = await Stream.find({ streamType: { $eq: TYPE_YOUTUBE } });
		streams = await Stream.find({ $and: [{ streamType: { $eq: TYPE_YOUTUBE } }, {isTestData: { $eq: true}}]});
	}

	for(var stream of streams){
		//if (stream.searchKey === "UCmogLEBMMWglIYou2XMMRUw") { /////////////////////////////
		//log('YOUTUBE - ' + stream.searchKey);
		await updateYoutubeStream(stream);
		await sleep(2000);
		//} ////////////////////////////////////////
	}

	} catch (err) {
		log("YOUTUBE -  ERROR - updateYoutube() - " + err + "\n" + err.stack);
	}
}

//////////////////////
// DLIVE

async function updateDliveStream(stream){
	try {
		var result = await dliveAPI.getLivestreamPage(stream.searchKey);
		if (result){
				stream.profileURL = result.avatar;
				stream.name = result.displayname;

				if (result.livestream){
					log('DLIVE --- ONLINE: ' + stream.searchKey);
					stream.live = true;
					stream.title = result.livestream.title;
					stream.viewers = result.livestream.watchingCount;
				}
				else {
					if (stream.live === true){
						stream.title = '';
						stream.viewers = 0;
						stream.streamEnd = Date.now();
					}
					stream.live = false;
				}
		}
	}
	catch(err) {
		log('ERROR - updateDliveStream() - ' + err);
		await updateDliveAPI();
	}

	return stream;
}

async function updateDlive(){
	var streams = [];
	if (!TEST_DATA) {
		streams = await Stream.find({ $and: [{ streamType: { $eq: TYPE_DLIVE } }, {isTestData: { $eq: false}}]});
	} else {
		//streams = await Stream.find({ streamType: { $eq: TYPE_DLIVE } });
		streams = await Stream.find({ $and: [{ streamType: { $eq: TYPE_DLIVE } }, {isTestData: { $eq: true}}]});
	}

	for(var stream of streams){
		//if (stream.searchKey === 'ABC') { //////////////////////////////////////////
			//log('DLIVE --- ' + stream.searchKey);
			var streamUpdated = await updateDliveStream(stream);
			streamUpdated.save(function (err) {
				if (err) return console.error(err);
			});
			await sleep(2000);
		//} //////////////////////////////////////////
	}

}

//////////////////////
// ONLINE & OFFLINE LISTS

async function updateOnlineList() {
	let html = '';
	var streams = [];
	if (!TEST_DATA) {
		streams = await Stream.find({ $and: [{ live: { $eq: true }}, {isTestData: { $eq: false}}]}).sort({ viewers: 'desc'});
	} else {
		//streams = await Stream.find({ live: { $eq: true } }).sort({ viewers: 'desc'});
		streams = await Stream.find({ $and: [{ live: { $eq: true }}, {isTestData: { $eq: true}}]}).sort({ viewers: 'desc'});
	}

	for (var stream of streams){
		if (stream.live){
			html += stream.generateHTML();
		}
	}
	if (onlineListHTML === undefined || onlineListHTML !== html) {
		onlineListHTML = html;
		//log('SOCKET -- ****EMIT: onlineList');
		io.emit("onlineList", onlineListHTML);
	}
}

async function updateOfflineList() {
	let html = '';
	var streams = [];
	if (!TEST_DATA) {
		streams = await Stream.find({ $and: [{ live: { $eq: false }}, {streamEnd: { $ne: null }}, {isTestData: { $eq: false}}, {hideOffline: { $eq: false}}]}).sort({ streamEnd : 'desc'}).limit(CONFIG.youtube.offlineLimit);
	} else {
		//streams = await Stream.find({ $and: [{ live: { $eq: false }}, {streamEnd: { $ne: null }}]}).sort({ streamEnd : 'desc'}).limit(30);
		streams = await Stream.find({ $and: [{ live: { $eq: false }}, {streamEnd: { $ne: null }}, {isTestData: { $eq: true}}, {hideOffline: { $eq: false}}]}).sort({ streamEnd : 'desc'}).limit(CONFIG.youtube.offlineLimit);
	}

	for (var stream of streams){
		html += stream.generateHTMLOffline();
	}
	if (offlineListHTML === undefined || offlineListHTML !== html) {
		offlineListHTML = html;
		//log('SOCKET -- ****EMIT: offlineList');
		io.emit("offlineList", offlineListHTML);
	}
}

//////////////////////
// SCHEDULE

async function updateSchedule() {
	try {
	let html = '';
	var streams = [];
	if (!TEST_DATA) {
		streams = await Stream.find({ $and: [{ streamType: { $eq: "YOUTUBE" }}, {isTestData: { $eq: false}}, {scheduledDate: { $exists: true}}]}).sort({ scheduledDate: 'asc'}); //desc
	} else {
		//streams = await Stream.find({ live: { $eq: true } }).sort({ viewers: 'desc'});
		streams = await Stream.find({ $and: [{ streamType: { $eq: "YOUTUBE" }}, {isTestData: { $eq: true}}, {scheduledDate: { $exists: true}}]}).sort({ scheduledDate: 'asc'}); //desc
	}

	var now = new Date();
	var dayAhead = new Date();
	dayAhead.setHours(dayAhead.getHours() + CONFIG.schedule.hoursAhead);

	for (var stream of streams){
		if (stream.scheduledDate && (dayAhead > stream.scheduledDate) && (stream.scheduledDate > now)){
			//log("SCHEDULE - GENERATE HTML: " + stream.name);
			html += stream.generateHTMLSchedule();
		}
	}

	if (scheduledListHTML === undefined || scheduledListHTML !== html) {
		scheduledListHTML = html;
		log('SOCKET -- ****EMIT: scheduledList');
		io.emit("scheduledList", scheduledListHTML);
	}
	} catch (error){
		log('SCHEDULE - ERROR - updateSchedule() - ' + error);
	}
}

//////////////////////
// HELPER

function sleep(ms){
  return new Promise(resolve => setTimeout(resolve, ms))
}

function unicodeToChar(text) {
	return text.replace(/\\u[\dA-F]{4}/gi, 
				 function (match) {
							return String.fromCharCode(parseInt(match.replace(/\\u/g, ''), 16));
				 });
}

function log(message){
	console.log(new Date().toISOString() + ", " + message);
}

function isEmpty(obj) {
	for(var prop in obj) {
			if(obj.hasOwnProperty(prop))
					return false;
	}

	return true;
}

function getRandomInt(max) {
  return Math.floor(Math.random() * Math.floor(max));
}

function stripTrailingSlash(str) {
	if(str.substr(-1) === '/') {
			return str.substr(0, str.length - 1);
	}
	return str;
}

//////////////////////

async function updateYoutubeVideos(){
	try {
	var youtubeCreators = [];
	if (!TEST_DATA) {
		//youtubeCreators = await YoutubeCreator.find({channelId: { $eq: "UC8zmZ7KrfHvniLsNA7Rrf0g"}});
		youtubeCreators = await YoutubeCreator.find({isTestData: { $eq: false}});
	} else {
		youtubeCreators = await YoutubeCreator.find({isTestData: { $eq: true}});
	}

	var videoList = [];
	for(var youtubeCreator of youtubeCreators){
		//log('YTVIDEO - GET VIDEOS: ' + youtubeCreator.channelId + " - " + youtubeCreator.name);
		videoList = videoList.concat(await getYoutubeVideosByCreator(youtubeCreator));
	}

	videoList.sort((a, b) => (a.published < b.published) ? 1 : -1);

	var daysAgo = new Date();
	daysAgo.setDate(daysAgo.getDate() - CONFIG.youtube.videoDaysAgo);
	for(var video of videoList){
		//log("CHECK VIDEOID: " + video.videoId);
		try {
		var endDate     = new Date(video.published);
		var daysAgoDate = new Date(daysAgo);
		//log(endDate);
		//log(daysAgoDate);
		if (endDate < daysAgoDate) {
			//log("SKIP VIDEOID: " + video.videoId); //////////////////////////////////////////////
			continue;
		}

		var youtubeVideoFind = await YoutubeVideo.find({videoId: { $eq: video.videoId}});
		if (isEmpty(youtubeVideoFind)) {
			log("YTVIDEO - SAVE: " + video.videoId + " - " + video.name);
			video.save(function (err) {
				if (err) return log("YTVIDEO - SAVE ERROR: " + err);
			});
			
			if (video.twitter && video.twitter !== "") {
				var youtubeStreamFind = await Stream.find({videoId: { $eq: video.videoId}});
				if (isEmpty(youtubeStreamFind)){
					tweetVideo(video);
				}
				
				//var tweetURL = await tweetVideo(video);
				//if (tweetURL) { telegramSendMessage(tweetURL); }
			}
		} 
		} catch (error) { log("YTVIDEO - ERROR - VideoId: " + video.videoId + " - Message: " + error)}
	}

	} catch (err) {
		log("YTVIDEO - ERROR - updateYoutubeVideos() - " + err + "\n" + err.stack);
	}
}

async function getYoutubeVideosByCreator(youtubeCreator){
	try {
	var list = [];
	// Get Uploads Id
	//https://www.googleapis.com/youtube/v3/channels?id={channel Id}&key={API key}&part=contentDetails
	var apiURL = 'https://youtube.googleapis.com/youtube/v3/channels?';
	apiURL += 'id=' + youtubeCreator.channelId;
	apiURL += '&key=' + youtubeKey;
	apiURL += '&part=contentDetails';

	const resp = await fetch(apiURL);
	const data = await resp.json();

	if (data && data.items.length > 0) {
		const firstItem = data.items[0];
		var uploads = firstItem.contentDetails.relatedPlaylists.uploads;

		await sleep(5000);

		// Use this "uploads" Id to query PlaylistItems to get the list of videos.
		if (uploads) {
			// https://www.googleapis.com/youtube/v3/playlistItems?playlistId={"uploads" Id}&key={API key}&part=snippet&maxResults=50
			var apiURL2 = 'https://youtube.googleapis.com/youtube/v3/playlistItems?';
			apiURL2 += 'playlistId=' + uploads;
			apiURL2 += '&key=' + youtubeKey;
			apiURL2 += '&part=snippet';
			apiURL2 += '&maxResults=' + youtubeCreator.limit;

			const resp2 = await fetch(apiURL2);
			const data2 = await resp2.json();

			if (data2 && data2.items.length > 0) {
				for (var firstItem2 of data2.items){
					const youtubeVideo = new YoutubeVideo({ 
						videoId: firstItem2.snippet.resourceId.videoId,
						channelId: youtubeCreator.channelId,
						name: firstItem2.snippet.channelTitle,
						title: firstItem2.snippet.title, //firstItem2.snippet.title ? firstItem2.snippet.title.trim() : '',
						profileURL: firstItem2.snippet.thumbnails.default.url,
						isTestData: false,
						hide: false,
						published: firstItem2.snippet.publishedAt,
						twitter: youtubeCreator.twitter
					});
					//log('YTVIDEO - VIDEO: ' + youtubeVideo);

					//if (ytClip.title.toLowerCase().includes('dishwasher')) {
					//	continue;
					//}
					list.push(youtubeVideo);
				}
			}
		}
	} 

	await sleep(5000);
	return list;
	} catch (err) {
		log("YTVIDEO - ERROR - getYoutubeVideos() - " + err + "\n" + err.stack);
	}
}

async function updateYoutubeVideoList() {
	try {
		var youtubeCreators = [];
		var youtubeVideos = [];
		if (!TEST_DATA) {
			youtubeCreators = await YoutubeCreator.find({isTestData: { $eq: false}});

			var dateOffset = (24*60*60*1000) * CONFIG.youtube.videoDaysAgo;
			var myDate = new Date();
			myDate.setTime(myDate.getTime() - dateOffset);
		
			youtubeVideos = await YoutubeVideo.find({ $and: [{ hide: { $eq: false } }, {isTestData: { $eq: false}}, {published: {$gte: myDate}}]});

		} else {
			youtubeCreators = await YoutubeCreator.find({isTestData: { $eq: true}});

			var dateOffset = (24*60*60*1000) * CONFIG.youtube.videoDaysAgo;
			var myDate = new Date();
			myDate.setTime(myDate.getTime() - dateOffset);
		
			youtubeVideos = await YoutubeVideo.find({ $and: [{ hide: { $eq: false } }, {isTestData: { $eq: true}}, {published: {$gte: myDate}}]});
		}

		youtubeVideos.sort((a, b) => (a.published < b.published) ? 1 : -1);

		var videoList = [];
		youtubeCreators.forEach(youtubeCreator => {
			var list = youtubeVideos.filter(video => video.channelId === youtubeCreator.channelId);
			videoList = videoList.concat(list.slice(0, youtubeCreator.limit))
		});

		// Get Manually added Videos
		videoList = videoList.concat(youtubeVideos.filter(video => (video.channelId === undefined || video.channelId === "")));

		videoList.sort((a, b) => (a.published < b.published) ? 1 : -1);
		videoList.slice(0, CONFIG.youtube.videoLimit);

		var html = '';
		videoList.forEach(video => {
			html += video.generateHTML();
		});

		if (videoListHTML === "" || videoListHTML === undefined || videoListHTML !== html) {
			videoListHTML = html;
			log('YTVIDEO - ****EMIT: videoList');
			io.emit("videoList", videoListHTML);
		}
	} catch (err) {
		log("YTVIDEO - ERROR - updateYoutubeVideoList() - " + err + "\n" + err.stack);
	}
}

//////////////////////
// TWITTER

const twitterAPI = require('twitter-api-client');

var twitterClient = undefined;
if (CONFIG.twitter.enabled){
twitterClient = new twitterAPI.TwitterClient({
	apiKey: CONFIG.twitter.apiKey,
	apiSecret: CONFIG.twitter.apiSecret,
  accessToken: CONFIG.twitter.accessToken,
  accessTokenSecret: CONFIG.twitter.accessTokenSecret,
});}

var twitterClientReddit = undefined;
if (CONFIG.twitterReddit.enabled){
	twitterClientReddit = new twitterAPI.TwitterClient({
	apiKey: CONFIG.twitterReddit.apiKey,
	apiSecret: CONFIG.twitterReddit.apiSecret,
  accessToken: CONFIG.twitterReddit.accessToken,
  accessTokenSecret: CONFIG.twitterReddit.accessTokenSecret,
});}

async function tweetReddit(redditPost) {
	// Profit // TODO
	return;
};

async function tweet(stream){
	if (CONFIG.twitter.enabled && !DEBUG && stream.twitter && stream.twitter !== ""){
	try {
	var mediaId = '';
	if (stream.thumbnail && stream.thumbnail !== "") {
		log('TWITTER - THUMBNAIL EXISTS - UPLOAD');
		await sleep(180000);
		log('TWITTER - THUMBNAIL WAITED - 180 seconds - ' + stream.thumbnail);
		mediaId = await uploadImage(stream.thumbnail);
		//log('TWITTER - VIDEOID CHECK - ' + stream.videoId);
		if (stream.videoId) { // Delete Youtube Thumbnails
			try {
				const imageFilePath = "./public/" + stream.videoId + ".jpg";
				//log('TWITTER - CHECK EXISTS - ' + imageFilePath);
				if (fs.existsSync(imageFilePath)) {
					//log('TWITTER - UNLINK - ' + imageFilePath);
					fs.unlinkSync(imageFilePath);
				}
			} catch (error) {
				log('TWITTER - VIDEOID DELETE ERROR - ' + error);
			}
		}
	}

	var tweetStatus = stream.name + " is live!";
	
	if (stream.twitter) {
		tweetStatus += " @" + stream.twitter;
	}

	tweetStatus += "\r\n\r\n";

	if (stream.title && stream.title !== "") {
		var tweetTitle = "";
		if (stream.title.length > 0) {
			tweetTitle += '"' + stream.title + '"';
		}
		if (!stream.title.toLowerCase().includes('#hex')) {
			tweetTitle += " #HEX";
		}
		if (!stream.title.toLowerCase().includes('#crypto')) {
			tweetTitle += " #Crypto";
		}
		if (!stream.title.toLowerCase().includes('#btc')) {
			tweetTitle += " #BTC";
		}
		if (!stream.title.toLowerCase().includes('#eth')) {
			tweetTitle += " #ETH";
		}
		if (!stream.title.toLowerCase().includes('#defi')) {
			tweetTitle += " #DeFi";
		} 
		if (!stream.title.toLowerCase().includes('#passiveincome')) {
			tweetTitle += " #PassiveIncome";
		} 
		tweetTitle = tweetTitle.trim();
		
		tweetStatus += tweetTitle;
		tweetStatus += "\r\n\r\n";
	}

	tweetStatus += stream.streamType + ": " + stream.getLink(true);

	// https://developer.twitter.com/en/docs/twitter-api/v1/tweets/post-and-engage/api-reference/post-statuses-update
	const data = await twitterClient.tweets.statusesUpdate({ 
		status: tweetStatus,
		media_ids: mediaId
	});
	log('TWITTER - TWEET'); // + JSON.stringify(data));

	// Get Tweet URL
	var expandedURL = "";
	
	if (data && data.id_str && stream.twitter) {
		expandedURL = "https://twitter.com/" + CONFIG.twitter.username + "/status/" + data.id_str;
		log('TWITTER - TWEET: URL 001: ' + expandedURL);
	}

	//if (data && data.entities && data.entities.urls && data.entities.urls.length > 0 && data.entities.urls[0].expanded_url) {
	//	expandedURL = data.entities.urls[0].expanded_url;
	//	log('TWITTER - TWEET: URL 002: ' + expandedURL);
	//}

	if (expandedURL !== ''){
		var tweetTelegramText = stream.name + " is live!" + "\r\n";
		if (stream.streamType == "TWITCH" && stream.title && stream.title !== "" && stream.title.length > 0) {tweetTelegramText += '"' + stream.title.trim() + '"' + "\r\n"; }
		tweetTelegramText += stream.getLink(true);
		telegramSendMessage(tweetTelegramText);
		return expandedURL;
	}

	// TODO - Save tweet url to database?

	} catch (err){
		log('TWITTER - ERROR: ' + err);
	}
	}

	return '';
}

async function tweetVideo(video){
	log('TWITTER - tweetVideo()');
	if (CONFIG.twitter.enabled && !DEBUG){ //&& stream.twitter && stream.twitter !== ""){
	try {
	var mediaId = '';
	if (video.profileURL && video.profileURL !== "") {
		log('TWITTER - VIDEO - THUMBNAIL EXISTS - UPLOAD');

		var url = video.profileURL.replace("default", "maxresdefault");
		log('TWITTER - VIDEO - url - ' + url);

		try {
			const imageSize = await imgSize(url);
			// Example: { width: 245, height: 66, type: 'png', downloaded: 856 }

			//log("YOUTUBE - IMAGE SIZE: " + imageSize);
			if ((!imageSize.width || !imageSize.height) || imageSize.width < 200 || imageSize.height < 200) {
					maxResMissing = true;
					log('TWITTER - VIDEO - maxres missing');
			} else {
				log('TWITTER - VIDEO - THUMBNAIL EXISTS - URL - ' + url);
				mediaId = await uploadImage(url);
			}
		} catch (err) {
			log('TWITTER - VIDEO - IMAGE SIZE ERROR: ' + err);
		}
	}

	var tweetStatus = video.name + " has a new video!";
	
	if (video.twitter && video.twitter !== "") {
		tweetStatus += " @" + video.twitter;
	}

	tweetStatus += "\r\n\r\n";

	if (video.title && video.title !== "") {
		var tweetTitle = "";
		if (video.title.length > 0) {
			tweetTitle += '"' + video.title + '"';
		}
		if (!video.title.toLowerCase().includes('#hex')) {
			tweetTitle += " #HEX";
		}
		if (!video.title.toLowerCase().includes('#crypto')) {
			tweetTitle += " #Crypto";
		}
		if (!video.title.toLowerCase().includes('#btc')) {
			tweetTitle += " #BTC";
		}
		if (!video.title.toLowerCase().includes('#eth')) {
			tweetTitle += " #ETH";
		}
		if (!video.title.toLowerCase().includes('#defi')) {
			tweetTitle += " #DeFi";
		} 
		if (!video.title.toLowerCase().includes('#passiveincome')) {
			tweetTitle += " #PassiveIncome";
		}
		tweetTitle = tweetTitle.trim();
		
		tweetStatus += tweetTitle;
		tweetStatus += "\r\n\r\n";
	}

	tweetStatus += video.getLink();

	// https://developer.twitter.com/en/docs/twitter-api/v1/tweets/post-and-engage/api-reference/post-statuses-update
	const data = await twitterClient.tweets.statusesUpdate({ 
		status: tweetStatus,
		media_ids: mediaId
	});
	log('TWITTER - VIDEO - TWEET: ' + data);

	// Get Tweet URL
	var expandedURL = "";
	
	if (data && data.id_str && video.twitter) {
		expandedURL = "https://twitter.com/" + CONFIG.twitter.username + "/status/" + data.id_str;
		log('TWITTER - VIDEO - TWEET - URL 001: ' + expandedURL);
	}

	//if (data && data.entities && data.entities.urls && data.entities.urls.length > 0 && data.entities.urls[0].expanded_url) {
	//	expandedURL = data.entities.urls[0].expanded_url;
	//	log('TWITTER - TWEET: URL 002: ' + expandedURL);
	//}

	if (expandedURL !== ''){
		var tweetTelegramText = video.name + " has a new video!" + "\r\n";
		tweetTelegramText += video.getLink();
		telegramSendMessage(tweetTelegramText);
		return expandedURL;
	}

	} catch (err){
		log('TWITTER - VIDEO - ERROR: ' + err);
	}
	}

	return '';
}

async function tweetRSS(rssItem){
	if (CONFIG.twitter.enabled && !DEBUG && rssItem.twitter && rssItem.twitter !== ""){
	try {
	var mediaId = '';

	var tweetStatus = rssItem.name + " published new content!";
	if (rssItem.twitter) { tweetStatus += " @" + rssItem.twitter;}
	tweetStatus += "\r\n\r\n";

	if (rssItem.title && rssItem.title !== "") {
		var tweetTitle = "";
		if (rssItem.title.length > 0) {tweetTitle += '"' + rssItem.title + '"';}
		if (!rssItem.title.toLowerCase().includes('#hex')) {tweetTitle += " #HEX";}
		if (!rssItem.title.toLowerCase().includes('#crypto')) {tweetTitle += " #Crypto";}
		if (!rssItem.title.toLowerCase().includes('#btc')) {tweetTitle += " #BTC";}
		if (!rssItem.title.toLowerCase().includes('#eth')) {tweetTitle += " #ETH";}
		if (!rssItem.title.toLowerCase().includes('#defi')) {tweetTitle += " #DeFi";} 
		if (!rssItem.title.toLowerCase().includes('#passiveincome')) {tweetTitle += " #PassiveIncome";} 
		tweetTitle = tweetTitle.trim();
		
		tweetStatus += tweetTitle;
		tweetStatus += "\r\n\r\n";
	}

	tweetStatus += rssItem.getLink(true);

	// https://developer.twitter.com/en/docs/twitter-api/v1/tweets/post-and-engage/api-reference/post-statuses-update
	const data = await twitterClient.tweets.statusesUpdate({ 
		status: tweetStatus,
		media_ids: mediaId
	});
	log('TWITTER - TWEET RSS'); // + JSON.stringify(data));

	// Get Tweet URL
	var expandedURL = "";
	
	if (data && data.id_str && rssItem.twitter) {
		expandedURL = "https://twitter.com/" + CONFIG.twitter.username + "/status/" + data.id_str;
		log('TWITTER - TWEET: URL 001: ' + expandedURL);
	}

	if (expandedURL !== ''){
		var tweetTelegramText = rssItem.name + " published new content!" + "\r\n";
		tweetTelegramText += rssItem.getLink(true);
		telegramSendMessage(tweetTelegramText);
		return expandedURL;
	}

	// TODO - Save tweet url to database?

	} catch (err){
		log('TWITTER - ERROR: ' + err);
	}
	}

	return '';
}

const imageToBase64 = require('image-to-base64');

async function uploadImage(imageURL){
	if (CONFIG.twitter.enabled) {
	try {
	log("TWITTER - IMAGE URL - " + imageURL);
	
	var imageData = await imageToBase64(imageURL);

	//https://developer.twitter.com/en/docs/twitter-api/v1/media/upload-media/api-reference/post-media-upload
	const data = await twitterClient.media.mediaUpload({ media_data: imageData });
	log('TWITTER - UPLOAD IMAGE - ' + data);
	return data.media_id_string || '';
	} catch (err) {
		log('TWITTER - IMAGE ERROR - ' + err);
		return '';
	}
	}
}

//////////////////////
// TELEGRAM

async function telegramSendMessage(text){
	try {
		if (CONFIG.telegram.enabled) {
			if (text && text !== ''){

				var url = "https://api.telegram.org/" +
				"bot" + CONFIG.telegram.token + "/" +
				"sendMessage?chat_id=" + CONFIG.telegram.channel +
				"&text=" + encodeURIComponent(text);

				const resp = await fetch(url);
				const data = await resp.text();

				log('TELEGRM - SUCCESS: ' + data);
			}
		}
	} catch (err){
		log('TELEGRM - ERROR: ' + err + " CODE E9");
	}
}

//////////////////////
// SELENIUM

const { Builder, By } = require('selenium-webdriver');
var firefox = require('selenium-webdriver/firefox');

const options = new firefox.Options();
options.addArguments("--headless");


////////////////////// 
// THETA

async function updateThetaStream(stream){
	//log('THETA --- updateThetaStream() - ' + stream.getLink());
	const driver = await new Builder()
			.forBrowser('firefox') //chrome
			.setFirefoxOptions(options)
			//.setChromeOptions(options)
			.build();

	try {
		await driver.get(stream.getLink());
		await driver.sleep(5000);
		let data = await driver.getPageSource();

		//// Name
		// <div class="user-info"><div class="username"><span>DiscourseSyndicate</span></div>
		var nameMatch = data.match('user-info"><div class="username"><span>([a-zA-Z0-9]{0,50})<');
		if (nameMatch && nameMatch.length >= 2)
		{
			//log("THETA --- Name: " + nameMatch[1]);
			stream.name = nameMatch[1];
		} 
		else {
			//log('THETA --- Name Missing');
		}

		//// Offline
		//<div class="stream-offline"><div class="offline-info">Offline</div>
		var offlineMatch = data.match('<div class="stream-offline"><div class="offline-info">Offline<');
		if (offlineMatch)
		{
			//log("THETA --- Offline EXISTS");
		} 
		else {
			//log('THETA --- Offline Missing');
		}

		//// Viewer Count
		// <span class="count">19</span>
		var viewerMatch = data.match('<span class="count">([0-9,]{0,7})<');
		if (viewerMatch && viewerMatch.length >= 2)
		{
			//log("THETA --- Viewer Count: " + viewerMatch[1]);
			stream.viewers = parseFloat(viewerMatch[1].replace(/,/g, ''));
		} 
		else {
			//log('THETA --- Viewer Count Missing');
		}

		//// Live? = Offline div not existing and Viewer Count span existing --- Live = (!Offline && ViewerCount)
		if (!offlineMatch && viewerMatch) {
			log('THETA --- is LIVE: ' + stream.searchKey);
			//// Title
			// <div class="stream-title">DiscourseSyndicate's Live Stream</div>
			var titleMatch = data.match('<div class="stream-title">([^<]{0,100})<');
			if (titleMatch && titleMatch.length >= 2)
			{
				//log("THETA --- Title: " + titleMatch[1]);
				stream.title = titleMatch[1];
			} 
			else {
				//log('THETA --- Title Missing');
			}

			//// Profile Image URL
			// <div class="streamer section"><div class="g-user-card l"><div class="g-avatar l"><div class="thumbnail" style="background-image: url(&quot;https://user-prod-theta-tv.imgix.net/usrzfep4zduci5n61yv/avatar/1609397655714.jpg?w=256&quot;);"></div></div>
			// https://user-prod-theta-tv.imgix.net/usrzfep4zduci5n61yv/avatar/1609397655714.jpg?w=300
			// ?w=256&quot;);"><
			var profileMatch = data.match('g-avatar l"><div class="thumbnail" style="background-image: url.{0,2}&quot;(.{0,130});.{0,2};"><');
			if (profileMatch && profileMatch.length >= 2)
			{
				//log("THETA --- Profile URL: " + profileMatch[1]);
				stream.profileURL = profileMatch[1].replace("w=300", "w=150");
			} 
			else {
				//log('THETA --- Profile URL Missing');
			}

			stream.live = true;
		}
		else {
			//log('THETA --- OFFLINE');
			if (stream.live === true){
				stream.title = '';
				stream.viewers = 0;
				stream.streamEnd = Date.now();
			}
			stream.live = false;
		}
	
		stream.save(function (err) {
			if (err) return console.error(err);
		});
	} catch (err) {
		log("THETA --- ERROR: " + err + "\n" + err.stack);
	} finally {
		//await driver.close();
		await driver.quit();
	}


}

async function updateTheta(){
	try {
	var streams = [];
	if (!TEST_DATA) {
		streams = await Stream.find({ $and: [{ streamType: { $eq: TYPE_THETA } }, {isTestData: { $eq: false}}]});
	} else {
		//streams = await Stream.find({ streamType: { $eq: TYPE_THETA } });
		streams = await Stream.find({ $and: [{ streamType: { $eq: TYPE_THETA } }, {isTestData: { $eq: true}}]});
	}

	for(var stream of streams){
		//if (stream.searchKey === "UC4cjfUjNZcCSSjnFb8_AVwA") { /////////////////////////////
		//log('THETA --- ' + stream.searchKey);
		await updateThetaStream(stream);
		await sleep(5000);
		//} ////////////////////////////////////////
	}

	} catch (err){
		log("THETA --- updateTheta() ERROR: " + err);
	}
}


////////////////////// 
// TROVO

async function updateTrovoStream(stream){
	//log('TROVO --- updateTrovoStream()');

	const driver = await new Builder()
			.forBrowser('firefox')
			.setFirefoxOptions(options)
			.build();

	try {
		await driver.get(stream.getLink());
		await driver.sleep(5000);
		let data = await driver.getPageSource();

		// Live
		//<span data-v-5c0712c5="" data-v-48bf7ded="" class="status ml5 live">Live</span>
		var liveMatch = data.match('<span.{0,44}class="status.{2,7}live".{0,50}>[\n. ]{0,10}Live[\n. ]{0,10}<');
		//if (liveMatch) { log("TROVO --- Live EXISTS" ); } 
		//else { 					 log('TROVO --- Live MISSING'); }

		//// Live
		if (liveMatch) {
			log('TROVO --- is LIVE: ' + stream.searchKey);

			//// Name
			//<p data-v-48bf7ded="" title="Colombi" class="streamer-name text-overflow">Colombi<
			var nameMatch = data.match('<p.{0,25}title="(.{0,50})" class="streamer-name');
			if (nameMatch && nameMatch.length >= 2)
			{
				//log("TROVO --- Name: " + nameMatch[1]);
				stream.name = nameMatch[1];
			} 
			else {
				//log('TROVO --- Name Missing');
			}

			//// Title
			//<h3 data-v-f5eba19e="" class="title text-overflow" title="DS COLOMBI K.D 15 ">DS COLOMBI K.D 15 </h3>
			var titleMatch = data.match('<h3.{0,70}title="(.{0,100}?)"{0,70}class="title text-overflow".{0,70}>');
			if (titleMatch && titleMatch.length >= 2)
			{
				//log("TROVO --- Title 1: " + titleMatch[1]);
				stream.title = titleMatch[1];
			} 
			else {
				//log('TROVO --- Title 1 Missing');

				var titleMatch2 = data.match('<h3.{0,70}class="title text-overflow".{0,70}title="(.{0,100}?)"{0,70}>');
				if (titleMatch2 && titleMatch2.length >= 2)
				{
					//log("TROVO --- Title 2: " + titleMatch2[1]);
					stream.title = titleMatch2[1];
				} 
				else {
					//log('TROVO --- Title 2 Missing');
				}
			}

			// Viewers
			//<span data-v-f5eba19e="">251 viewers</span>
			var viewerMatch = data.match('<span.{0,25}>([0-9,]{0,7}) viewers<');
			if (viewerMatch && viewerMatch.length >= 2)
			{
				//log("TROVO --- Viewer Count: " + viewerMatch[1]);
				stream.viewers = parseFloat(viewerMatch[1].replace(/,/g, ''));
			} 
			else {
				//log('TROVO --- Viewer Count Missing');
			}

			//// Profile Image URL
			//<img data-v-cb85e9a0="" src="https://headicon.trovo.live/user/jrxrabqaaaaabyi57tvoi7c6cy.jpeg?t=0&amp;max_age=31536000&amp;imageView2/2/w/100/h/100/format/webp" zheight="100" zwidth="100" zradio="1" alt="face" class="img-face"></img>
			//var profileMatch = data.match('<img.{0,25}src="(.{0,150}?)".{0,170}class="img-face"');
			var profileMatch = data.match('<img.{0,25}src="(.{0,150}?)".{0,170}class="img-face".{0,130}class="streamer-name');
			if (profileMatch && profileMatch.length >= 2)
			{
				//log("TROVO --- Profile URL 1: " + profileMatch[1]);
				stream.profileURL = profileMatch[1];
			} 
			else {
				//log('TROVO --- Profile URL Missing');
			}

			stream.live = true;
		}
		else {
			//log('TROVO --- OFFLINE');
			if (stream.live === true){
				stream.title = '';
				stream.viewers = 0;
				stream.streamEnd = Date.now();
			}
			stream.live = false;
		}
	
		stream.save(function (err) {
			if (err) return console.error(err);
		});
	} catch (err){
		log("TROVO --- ERROR: " + err + "\n" + err.stack);
	} finally {
		//await driver.close();
		await driver.quit();
	}


}

async function updateTrovo(){
	try {
	var streams = [];
	if (!TEST_DATA) {
		streams = await Stream.find({ $and: [{ streamType: { $eq: TYPE_TROVO } }, {isTestData: { $eq: false}}]});
	} else {
		//streams = await Stream.find({ streamType: { $eq: TYPE_TROVO } });
		streams = await Stream.find({ $and: [{ streamType: { $eq: TYPE_TROVO } }, {isTestData: { $eq: true}}]});
	}

	for(var stream of streams){
		//if (stream.searchKey === "UC4cjfUjNZcCSSjnFb8_AVwA") { /////////////////////////////
		//log('TROVO --- ' + stream.searchKey);
		await updateTrovoStream(stream);
		await sleep(5000);
		//} ////////////////////////////////////////
	}

	} catch (err){
		log("TROVO --- updateTrovo() ERROR: " + err);
	}
}


////////////////////// 
// RSSCreator

var RSSCreatorSchema = new Schema({
	link: {
    type: String, 
    required: true
  },
	name: String,
	limit: Number,
	isTestData: Boolean,
	twitter: String
});

const RSSCreator = mongoose.model('RSSCreator', RSSCreatorSchema);

function createInitialRSSCreator() {
	log('createInitialRSSCreator() START');
	const rssCreator = new RSSCreator({ 
		link: 'https://www.blogtalkradio.com/thesouthbayshow/2021/02/18/the-hex-show',
		name: "The SouthBay Show",
		limit: 1,
		isTestData: false,
		twitter: ''
	});
	rssCreator.save(function (err) {
		if (err) return console.error(err);
	});
	log('createInitialRSSCreator() END');
}

////////////////////// 
// RSS Item

var RSSItemSchema = new Schema({
	guid: {
    type: String, 
    required: true
  },
	link: {
    type: String, 
    required: true
  },
	parentLink: {
    type: String, 
    required: true
  },
	name: String,
	title: String,
	profileURL: String,
	isTestData: Boolean,
	hide: {
		type: Boolean,
		default: false
	},
	published: Date,
	twitter: String,
});

RSSItemSchema.methods.getLink = function () {
  return this.link;
};

RSSItemSchema.methods.getLinkAlphaNumeric = function () {
  return this.parentLink.replace(/[^a-zA-Z0-9]/g, '');
};

RSSItemSchema.methods.generateHTML = function () {
	var html = ''
	+ '<a href="' + this.getLink() + '" style="text-decoration: none; color: inherit;" target="_blank" onMouseOver="this.style.opacity=0.7" onMouseOut="this.style.opacity=1.0">' //onMouseOut="this.style.color=\'#FFFFFF\'" onMouseOver="this.style.color=\'#f90fb7\'" // onMouseOut="this.style.border-top=\'1px solid #d0d0d0\'";
	+ '<div class="streamRow" style="display: flex; margin: 0px 0px 7px 0px; border: 1px solid black; max-height: 90px; border-right: 5px solid #FF6700; border-bottom-right-radius: 24px; border-top-right-radius: 24px; border-bottom-left-radius: 24px; border-top-left-radius: 24px; background-color: #1b1b1b;" onMouseOver="this.style.opacity=0.7" onMouseOut="this.style.opacity=1.0">'
	+ '<div class="streamIcon" style="min-width: 70px"><img loading="lazy" width="70" height="70" src="' + this.profileURL + '" style="border: 1px solid #000; border-radius: 15px;" onMouseOver="this.style.opacity=0.7" onMouseOut="this.style.opacity=1.0"></div>'
	+ '<div class="streamInfo" style="padding-left: 10px; padding-top: 2px; width: 100%; overflow: hidden;">'
	+ '<div class="streamName" style="font-size: 160%; color: white;">' + this.name + '</div>'
	+ '<div class="streamTitle" style="font-size: 120%; color: #a9a9a9; max-width: 600px; max-height: 48px; overflow: hidden; padding-left: 3px;">' + this.title + '</div></div>' // text-overflow: ellipsis; white-space: nowrap; overflow: hidden;
	+ '<div class="streamViewers" style="color: white; position: relative; float: right; font-size: 150%; text-align: right;"></div>'
	+ '</div></a>';
	return html;
}

const RSSItem = mongoose.model('RSSItem', RSSItemSchema);

function createInitialRSSItem() {
	log('createInitialRSSItem() START');
	const rssItem = new RSSItem({ 
		guid: 'TESTING',
		link: 'https://anchor.fm/litecoin-moses/episodes/Drunken-stupor-er6b83',
		parentLink: 'https://anchor.fm/litecoin-moses',
		name: "Dollar cost crypto",
		title: "Drunken stupor",
		profileURL: "https://d3t3ozftmdmh3i.cloudfront.net/production/podcast_uploaded/485225/485225-1545248462240-94f1f1ec7abf9.jpg",
		isTestData: false,
		hide: false,
		published: new Date(),
		twitter: ''
	});
	rssItem.save(function (err) {
		if (err) return console.error(err);
	});
	log('createInitialRSSItem() END');
}


////////////////////// 
// RSS Parser

let Parser = require('rss-parser');

async function updateRSSItems(){
	try {
	var rssCreators = [];
	if (!TEST_DATA) {
		//rssCreators = await rssCreators.find({link: { $eq: "UC8zmZ7KrfHvniLsNA7Rrf0g"}});
		rssCreators = await RSSCreator.find({isTestData: { $eq: false}});
	} else {
		rssCreators = await RSSCreator.find({isTestData: { $eq: true}});
	}

	var rssItemList = [];
	for(var rssCreator of rssCreators){
		//log('RSSITEM - GET RSS ITEMS: ' + rssCreator.link + " - " + rssCreator.name);
		rssItemList = rssItemList.concat(await getRSSItemsByCreator(rssCreator));
	}

	rssItemList.sort((a, b) => (a.published < b.published) ? 1 : -1);

	var daysAgo = new Date();
	daysAgo.setDate(daysAgo.getDate() - CONFIG.rss.daysAgo);
	for(var rssItem of rssItemList){
		//log("CHECK RSSITEM: " + rssItem.title + " " + rssItem.link);
		try {
		var endDate     = new Date(rssItem.published);
		var daysAgoDate = new Date(daysAgo);
		//log(endDate);
		//log(daysAgoDate);
		if (endDate < daysAgoDate) {
			//log("SKIP rssItem: " + rssItem.link); //////////////////////////////////////////////
			continue;
		}

		var rssItemFind = await RSSItem.find({guid: { $eq: rssItem.guid}});
		if (isEmpty(rssItemFind)) {
			log("RSSITEM - SAVE: " + rssItem.link + " - " + rssItem.name);
			rssItem.save(function (err) {
				if (err) return log("RSSITEM - SAVE ERROR: " + err);
			});
			
			tweetRSS(rssItem);
		} 
		} catch (error) { log("RSSITEM - ERROR - Link: " + rssItem.link + " - Message: " + error)}
	}

	} catch (err) {
		log("RSSITEM - ERROR - updateRSSItems() - " + err + "\n" + err.stack);
	}
}

async function getRSSItemsByCreator(rssCreator) {
	try {
		var list = [];
		let parser = new Parser();

		let feed = await parser.parseURL(rssCreator.link);
		
		//log(feed.title); // name
		//log(feed.description);
		//log(feed.link);
		//log(feed.image.url); // profileURL

		var count = 0;

		for (var item of feed.items) {
			const rssItem = new RSSItem({ 
				guid: item.guid,
				link: item.link,
				parentLink: rssCreator.link,
				name: rssCreator.name, //feed.title,
				title: item.title,
				profileURL: feed.image.url,
				isTestData: false,
				hide: false,
				published: item.isoDate, //pubDate
				twitter: rssCreator.twitter
			});

			// Save Profile Image
			const imageFileName = rssItem.getLinkAlphaNumeric() + ".webp";
			const imageFilePath = "./public/" + imageFileName;
			
			//log('RSS ---- CHECK IMAGE EXISTS - ' + imageFilePath);
			if (!fs.existsSync(imageFilePath)) {
					try {
							// Download image to buffer
							var resp2 = await fetch(rssItem.profileURL);
							const buffer = await resp2.buffer();

							// Save image to public folder
							await sharp(buffer).resize({ width: 140, height: 140}).toFile(imageFilePath);

							rssItem.profileURL = imageFileName;
							
							log('RSS ---- IMAGE DOWNLOADED & SAVED - ' + imageFilePath);
					} catch (err) {
							log("RSS ---- ERROR SAVE IMAGE LOCAL: " + err + "\n" + err.stack);
					} 
			} else {
					rssItem.profileURL = imageFileName;
			}

			if (rssCreator.link === "https://www.blogtalkradio.com/thesouthbayshow/podcast"){
				if (rssItem.title.toLowerCase().includes('hex')) {
					list.push(rssItem);
				}
			} else {
				list.push(rssItem);
			}
		}
	
		await sleep(5000);
		return list;
		} catch (err) {
			log("RSSITEM - ERROR - getRSSItemsByCreator() - " + err + "\n" + err.stack);
		}
}

async function updateRSSList() {
	try {
		var rssCreators = [];
		var rssItems = [];
		if (!TEST_DATA) {
			rssCreators = await RSSCreator.find({isTestData: { $eq: false}});

			var dateOffset = (24*60*60*1000) * CONFIG.rss.daysAgo;
			var myDate = new Date();
			myDate.setTime(myDate.getTime() - dateOffset);
		
			rssItems = await RSSItem.find({ $and: [{ hide: { $eq: false } }, {isTestData: { $eq: false}}, {published: {$gte: myDate}}]});

		} else {
			rssCreators = await RSSCreator.find({isTestData: { $eq: true}});

			var dateOffset = (24*60*60*1000) * CONFIG.rss.daysAgo;
			var myDate = new Date();
			myDate.setTime(myDate.getTime() - dateOffset);
		
			rssItems = await RSSItem.find({ $and: [{ hide: { $eq: false } }, {isTestData: { $eq: true}}, {published: {$gte: myDate}}]});
		}

		rssItems.sort((a, b) => (a.published < b.published) ? 1 : -1);

		var rssList = [];
		rssCreators.forEach(rssCreator => {
			var list = rssItems.filter(rssItem => rssItem.parentLink === rssCreator.link);
			rssList = rssList.concat(list.slice(0, rssCreator.limit))
		});

		// Get Manually added RSS items
		//rssList = rssList.concat(rssItems.filter(rssItem => (rssItem.link === undefined || rssItem.link === "")));

		rssList.sort((a, b) => (a.published < b.published) ? 1 : -1);
		rssList.slice(0, CONFIG.rss.limit);

		var html = '';
		rssList.forEach(rssItem => {
			html += rssItem.generateHTML();
		});

		if (rssListHTML === "" || rssListHTML === undefined || rssListHTML !== html) {
			rssListHTML = html;
			//log(rssListHTML);
			log('RSSITEM - ****EMIT: rssList');
			io.emit("rssList", rssListHTML);
		}
	} catch (err) {
		log("RSSITEM - ERROR - updateRSSList() - " + err + "\n" + err.stack);
	}
}

////////////////////// 
// TikTokCreator

var TikTokCreatorSchema = new Schema({
	link: {
    type: String, 
    required: true
  },
	name: String,
	limit: Number,
	isTestData: Boolean,
	twitter: String,
	secUid: String
});

const TikTokCreator = mongoose.model('TikTokCreator', TikTokCreatorSchema);

function createInitialTikTokCreator() {
	log('createInitialTikTokCreator() START');
	const tiktokCreator = new TikTokCreator({ 
		link: 'https://www.tiktok.com/@superhexwin',
		name: "superhexwin",
		limit: 1,
		isTestData: false,
		twitter: ''
	});
	tiktokCreator.save(function (err) {
		if (err) return console.error(err);
	});
	log('createInitialTikTokCreator() END');
}

////////////////////// 
// TikTokVideo

var TikTokVideoSchema = new Schema({
	guid: {
    type: String, 
    required: true
  },
	link: {
    type: String, 
    required: true
  },
	parentLink: {
    type: String, 
    required: true
  },
	name: String,
	title: String,
	profileURL: String,
	profileURL2: String,
	isTestData: Boolean,
	hide: {
		type: Boolean,
		default: false
	},
	published: Date,
	twitter: String,
});

TikTokVideoSchema.methods.getLink = function () {
  return this.link;
};

TikTokVideoSchema.methods.getLinkAlphaNumeric = function () {
  return this.parentLink.replace(/[^a-zA-Z0-9]/g, '');
};

TikTokVideoSchema.methods.generateHTML = function () {
	var html = ''
	+ '<a href="' + this.getLink() + '" style="text-decoration: none; color: inherit;" target="_blank" onMouseOver="this.style.opacity=0.7" onMouseOut="this.style.opacity=1.0">' //onMouseOut="this.style.color=\'#FFFFFF\'" onMouseOver="this.style.color=\'#f90fb7\'" // onMouseOut="this.style.border-top=\'1px solid #d0d0d0\'";
	+ '<div class="streamRow" style="display: flex; margin: 0px 0px 7px 0px; border: 1px solid black; max-height: 90px; border-right: 5px solid #69C9D0; border-bottom-right-radius: 24px; border-top-right-radius: 24px; border-bottom-left-radius: 24px; border-top-left-radius: 24px; background-color: #1b1b1b;" onMouseOver="this.style.opacity=0.7" onMouseOut="this.style.opacity=1.0">'
	+ '<div class="streamIcon" style="min-width: 70px"><img loading="lazy" width="70" height="70" src="' + this.profileURL + '" style="border: 1px solid #000; border-radius: 15px;" onMouseOver="this.style.opacity=0.7" onMouseOut="this.style.opacity=1.0"></div>'
	+ '<div class="streamInfo" style="padding-left: 10px; padding-top: 2px; width: 100%; overflow: hidden;">'
	+ '<div class="streamName" style="font-size: 160%; color: white;">' + this.name + '</div>'
	+ '<div class="streamTitle" style="font-size: 120%; color: #a9a9a9; max-width: 600px; max-height: 48px; overflow: hidden; padding-left: 3px;">' + this.title + '</div></div>' // text-overflow: ellipsis; white-space: nowrap; overflow: hidden;
	+ '<div class="streamViewers" style="color: white; position: relative; float: right; font-size: 150%; text-align: right;"></div>'
	+ '</div></a>';
	return html;
}

const TikTokVideo = mongoose.model('TikTokVideo', TikTokVideoSchema);

function createInitialTikTokVideo() {
	log('createInitialTikTokVideo() START');
	const tikTokVideo = new TikTokVideo({ 
		guid: 'TESTING123',
		link: 'https://www.tiktok.com/@superhexwin/video/6935686352436612357',
		parentLink: 'https://www.tiktok.com/@superhexwin',
		name: "superhexwin",
		title: "Imagine if you owned a piece of the entire #bitcoin network",
		profileURL: "https://p16-sign-va.tiktokcdn.com/tos-maliva-avt-0068/78c74b51a50bf013159e2e1bf68409ea~c5_720x720.jpeg?x-expires=1615708800&x-signature=D%2Bhgaa9KT4dXGxB9F5hRKRBYGOQ%3D",
		isTestData: false,
		hide: false,
		published: new Date(),
		twitter: ''
	});
	tikTokVideo.save(function (err) {
		if (err) return console.error(err);
	});
	log('createInitialTikTokVideo() END');
}

////////////////////// 
// TikTok

async function updateTikTokVideos(){
	try {
	var tikTokCreators = [];
	if (!TEST_DATA) {
		//tikTokCreators = await TikTokCreator.find({link: { $eq: "https://www.tiktok.com/@hexfabio"}}); //"https://www.tiktok.com/@superhexwin"}});
		tikTokCreators = await TikTokCreator.find({isTestData: { $eq: false}});
	} else {
		tikTokCreators = await TikTokCreator.find({isTestData: { $eq: true}});
	}

	var tikTokVideoList = [];
	for(var tikTokCreator of tikTokCreators){
		log('TIKTOK -- GET TIKTOK VIDEOS: ' + tikTokCreator.link + " - " + tikTokCreator.name);
		//tikTokVideoList = tikTokVideoList.concat(await getTikTokVideosByCreator(tikTokCreator));
		await getTikTokVideosByCreator(tikTokCreator);
		await sleep(60000);
	}

	/*
	tikTokVideoList.sort((a, b) => (a.published < b.published) ? 1 : -1);

	var daysAgo = new Date();
	daysAgo.setDate(daysAgo.getDate() - CONFIG.tiktok.daysAgo);
	for(var tikTokVideo of tikTokVideoList){
		log("CHECK TIKTOK: " + tikTokVideo.name + " " + tikTokVideo.link);
		try {
		var endDate     = new Date(tikTokVideo.published);
		var daysAgoDate = new Date(daysAgo);
		//log(endDate);
		//log(daysAgoDate);
		if (endDate < daysAgoDate) {
			log("SKIP tikTokVideo: " + tikTokVideo.link); //////////////////////////////////////////////
			continue;
		}

		var tikTokVideoFind = await TikTokVideo.find({guid: { $eq: tikTokVideo.guid}});
		if (isEmpty(tikTokVideoFind)) {
			log("TIKTOK -- SAVE: " + tikTokVideo.link + " - " + tikTokVideo.name);
			tikTokVideo.save(function (err) {
				if (err) return log("TIKTOK -- SAVE ERROR: " + err);
			});
			
			//tweetTikTok(tikTokVideo); //////////// TODO
		} 
		} catch (error) { log("TIKTOK -- ERROR - Link: " + tikTokVideo.link + " - Message: " + error)}
	}
	*/

	} catch (err) {
		log("TIKTOK -- ERROR - updateTikTokVideos() - " + err + "\n" + err.stack);
	}
}

const randomUseragent = require('random-useragent');
var urlencode = require('urlencode');

async function getTikTokVideosByCreatorTikApi(tikTokCreator){
	log("TIKAPI - getTikTokVideosByCreatorTikApi()");
	var data = undefined;
	try {
	if (CONFIG.tikapi.enabled && tikTokCreator.secUid){

		var url = "https://api.tikapi.io/public/posts?secUid=" + tikTokCreator.secUid + "&count=10&cursor=0";

		const options = {
			headers: {
				'X-API-KEY': CONFIG.tikapi.key,
				'accept': 'application/json'
			}
		};
		var resp = await fetch(url, options);
		data = await resp.json();
		//log('data: ' + JSON.stringify(data));
		if (data && data.status == "success" && data.itemList.length > 0) {
			//data.itemList.forEach(item => {
			for(let item of data.itemList) {
				try {
				var published = Date.now();
				if (item.createTime) {
					const itemDate = new Date(item.createTime * 1000);

					var dateOffset = (24*60*60*1000) * CONFIG.tiktok.daysAgo;
					var pastDate = new Date();
					pastDate.setTime(pastDate.getTime() - dateOffset);
					//log("pastDate: " + pastDate);
					//log("itemDate: " + itemDate);

					if (itemDate <= pastDate) {
						continue;
					}

					published = itemDate;
				}
				//log("ID: " + item.id + "");
				log("Desc: " + item.desc);
				log("Video ID: " + item.video.id);
				//log("Video Cover: " + item.video.cover);
				//log("Dynamic Cover: " + item.video.dynamicCover);
				//log("Reflow Cover: " + item.video.reflowCover);
				//log("Share Cover: " + item.video.shareCover);
				//log("Video OriginCover: " + item.video.originCover);

				if (tikTokCreator.link && tikTokCreator.link !== "") {
					var videoLink = stripTrailingSlash(tikTokCreator.link) + "/video/" + item.id;
					log("videoLink: " + videoLink);
					// Check if tiktok already exists in database
					var tikTokVideoFind = await TikTokVideo.find({link: { $eq: videoLink}});
					if (isEmpty(tikTokVideoFind)) {

						var tikTokVideo = new TikTokVideo({ 
							guid: videoLink,
							link: videoLink,
							parentLink: tikTokCreator.link,
							name: tikTokCreator.name,
							title: truncate(item.desc, 36).trim(),
							profileURL: item.author.avatarMedium, //item.video.cover,
							isTestData: false,
							hide: false,
							published: Date.now(),
							twitter: tikTokCreator.twitter
						});

						// Save Profile Image
						const imageFileName = tikTokVideo.getLinkAlphaNumeric() + ".webp";
						const imageFilePath = "./public/" + imageFileName;
						
						log('TIKAPI - CHECK IMAGE EXISTS - ' + imageFilePath);
						if (!fs.existsSync(imageFilePath)) {
							try {
								// Download image to buffer
								var resp2 = await fetch(tikTokVideo.profileURL);
								const buffer = await resp2.buffer();

								// Save image to public folder
								await sharp(buffer).resize({ width: 140, height: 140}).toFile(imageFilePath);

								tikTokVideo.profileURL = imageFileName;
								
								log('TIKAPI - IMAGE DOWNLOADED & SAVED - ' + imageFilePath);
							} catch (err) {
								log("TIKAPI -- ERROR SAVE IMAGE LOCAL: " + err + "\n" + err.stack);
							} 
						} else {
							tikTokVideo.profileURL = imageFileName;
						}

						log("TIKTOK -- SAVE: " + tikTokVideo.link + " - " + tikTokVideo.name);
						tikTokVideo.save(function (err) {
							if (err) return log("TIKTOK -- SAVE ERROR: " + err);
						});
					}
				}
			} catch (err) {
				log("TIKAPI -- ERROR - getTikTokVideosByCreatorTikApi() - Individual - " + err + "\n" + err.stack);
			}
			await sleep(10000); // 10 seconds
			}
		}
	}
	} catch (err) {
		log("TIKAPI -- ERROR - getTikTokVideosByCreatorTikApi() - " + err + "\n" + err.stack);
		log('data: ' + JSON.stringify(data));
	}
}

async function getTikTokVideosByCreator(tikTokCreator) {
	try {
		if (CONFIG.tikapi.enabled){
			await getTikTokVideosByCreatorTikApi(tikTokCreator);
		} else {
		var list = [];

		var randomAgent = randomUseragent.getRandom(function (ua) {
			return ua.browserName === 'Firefox';
		});
		//var randomAgent = "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:86.0) Gecko/20100101 Firefox/86.0";

		log('TIKTOK --- RANDOM AGENT: ' + randomAgent);

		const optionsTikTok = new firefox.Options();
		options.addArguments("--headless");
		options.addArguments("--user-agent=" + randomAgent);

		const driver = await new Builder()
			.forBrowser('firefox')
			.setFirefoxOptions(options)
			.build();
		
		try {	
			//await driver.get(tikTokCreator.link);
			// ISSUE, cant go directly to profile
			// Go to Search Page:

			// https://www.tiktok.com/search?q=justin%20bieber
			var searchPageURL = "https://www.tiktok.com/search?q=" + urlencode(tikTokCreator.name);

			await driver.get(searchPageURL);
			await driver.sleep(10000);

			var aYearFromNow = new Date();
			aYearFromNow.setFullYear(aYearFromNow.getFullYear() + 1);
			await driver.manage().addCookie({name:'others_view_mode', value: 'feed', domain: '.tiktok.com', path: '/', expiry: aYearFromNow});

			if (!fs.existsSync("screenshots")){
				fs.mkdirSync("screenshots");
			}

			//var screenshot = await driver.takeScreenshot();
		  //if (screenshot) { fs.writeFileSync(path.resolve(__dirname, "screenshots/" + new Date().toISOString().replace(/:/g, '') + "_" + tikTokCreator.name.replace(/ /g, '') + "01.png"), screenshot, 'base64'); }

			await driver.findElement(By.xpath('//*[@id="main"]/div[2]/div[2]/a[1]')).click();
			await driver.sleep(20000);

			//screenshot = await driver.takeScreenshot();
			//if (screenshot) { fs.writeFileSync(path.resolve(__dirname, "screenshots/" + new Date().toISOString().replace(/:/g, '') + "_" + tikTokCreator.name.replace(/ /g, '') + "02.png"), screenshot, 'base64'); }

			var iconFeed = undefined;
			var iconGrid = undefined;
			try {
				iconFeed = await driver.findElement(By.className('icon-feed'));
			} catch (error) {}
			if (iconFeed){
				log("TIKTOK --- FEED ICON EXISTS - CLICKING!");
				iconFeed.click();

				await driver.sleep(20000);
				
				//screenshot = await driver.takeScreenshot();
				//if (screenshot) { fs.writeFileSync(path.resolve(__dirname, "screenshots/" + new Date().toISOString().replace(/:/g, '') + "_" + tikTokCreator.name.replace(/ /g, '') + "03.png"), screenshot, 'base64'); }
	
			} else {
				try {
					iconGrid = await driver.findElement(By.className('icon-grid'));
				} catch (error) {}
				if (iconGrid){
					log("TIKTOK --- GRID ICON EXISTS");
				}
				else {
					log("TIKTOK --- NO ICON EXISTS - WTF?");
				}
			}

			let data = await driver.getPageSource();

			var tikTokVideo = new TikTokVideo({ 
				guid: "",
				link: "",
				parentLink: tikTokCreator.link,
				name: tikTokCreator.name,
				title: "",
				profileURL: "",
				isTestData: false,
				hide: false,
				published: Date.now(),
				twitter: tikTokCreator.twitter
			});

			//// LINK
			// <a href="https://www.tiktok.com/@superhexwin/video/6938642919804996869" class="jsx-747277952 jsx-2715883145 item-video-card-wrapper">
			// <a href="https://www.tiktok.com/@superhexwin/video/6938642919804996869" class="jsx-3109748587 video-feed-item-wrapper">
			var linkMatch = data.match('<a href="([^"]+)" class="[^"]*(item-video-card-wrapper|video-feed-item-wrapper)">');
			if (linkMatch && linkMatch.length >= 2)
			{
				log("TIKTOK --- Link: " + linkMatch[1]);
				tikTokVideo.link = linkMatch[1];
				tikTokVideo.guid = linkMatch[1];
			} 
			else {
				log('TIKTOK --- Link Missing');
				log(data);
			}

			if (tikTokVideo.link && tikTokVideo.link !== "") {
				// Check if tiktok already exists in database
				var tikTokVideoFind = await TikTokVideo.find({link: { $eq: tikTokVideo.link}});
				if (isEmpty(tikTokVideoFind)) {

					//// PROFILEURL
					// <span class="tiktok-avatar tiktok-avatar-circle avatar jsx-3659161049" style="cursor: unset; width: 56px; height: 56px;">
					//<img alt="" src="https://p16-sign-va.tiktokcdn.com/muWyS%2BEeIBwDD%2FVNZs%3D"></span></a> <!-- profileURL --->
					// tiktok-avatar.{0,120}><img.{0,10}src="(.{0,200})">
					//var profileMatch = data.match('tiktok-avatar.{0,120}><img.{0,10}src="(.{0,200})">');

					//<meta property="og:image" content="">
					var profileMatch = data.match('<meta property="og:image" content="(.{0,200}?)"');
					if (profileMatch && profileMatch.length >= 2)
					{
						log("TIKTOK --- Profile Image: " + profileMatch[1]);
						tikTokVideo.profileURL = profileMatch[1];

						try {
							const imageFileName = tikTokVideo.getLinkAlphaNumeric() + ".webp";
							const imageFilePath = "./public/" + imageFileName;
							
							log('TIKTOK - CHECK IMAGE EXISTS - ' + imageFilePath);
							if (!fs.existsSync(imageFilePath)) {
								// Download image to buffer
								var resp2 = await fetch(tikTokVideo.profileURL);
								const buffer = await resp2.buffer();

								// Save image to public folder
								await sharp(buffer).resize({ width: 140, height: 140}).toFile(imageFilePath);
								
								log('TIKTOK - IMAGE DOWNLOADED & SAVED - ' + imageFilePath);
							}

							tikTokVideo.profileURL = imageFileName;

						} catch (err) {
							log("TIKTOK -- ERROR SAVE IMAGE: " + err + "\n" + err.stack);
						} 

					} 
					else {
						log('TIKTOK --- Profile Image Missing');
					}

					//<div class="jsx-828470630 image-card" style="border-radius: 4px; background-image: url(
					//	&quot;https://p16-sign-va.tiktokcdn.com/tos-maliva-p-0068/~tbd74.image?x-expires=1616342400&amp;x-signature=CzNAbZ0%3D&quot;);

					var coverMatch = data.match('<div class=".{0,40}image-card.{0,100}background-image.{0,30}quot;(.{0,300})&quot');
					if (coverMatch && coverMatch.length >= 2)
					{
						log("COVER ---- Cover Image: " + coverMatch[1]);
						tikTokVideo.profileURL2 = coverMatch[1];
					} 
					else {
						log('COVER ---- Cover Image Missing');
						log(data);
					}

					if(!iconFeed && !iconGrid) {
						
						await driver.get(tikTokVideo.link); // NEXT TRY class=video-card-mask  and click
						await driver.sleep(10000);

						//screenshot = await driver.takeScreenshot();
						//if (screenshot) { fs.writeFileSync(path.resolve(__dirname, "screenshots/" + new Date().toISOString().replace(/:/g, '') + "_" + tikTokCreator.name.replace(/ /g, '') + "25.png"), screenshot, 'base64'); }
	
						data = await driver.getPageSource();

						/*
						var videoFeedItem1 = undefined;
						var videoFeedItem = undefined;
						var itemVideoCard = undefined;

						try {
							videoFeedItem1 = await driver.findElement(By.className('video-feed-item'));
						} catch (error) {}
						if (videoFeedItem1){
							log("TIKTOK --- FEEDITEM EXISTS - CLICKING!");
							videoFeedItem1.click();

							await driver.sleep(20000);
							
							screenshot = await driver.takeScreenshot();
							if (screenshot) { fs.writeFileSync(path.resolve(__dirname, "screenshots/" + new Date().toISOString().replace(/:/g, '') + "_" + tikTokCreator.name.replace(/ /g, '') + "04a.png"), screenshot, 'base64'); }
						}

						if (!videoFeedItem1) {
							try {
								videoFeedItem = await driver.findElement(By.className('video-feed-item-wrapper'));
							} catch (error) {}
							if (videoFeedItem){
								log("TIKTOK --- FEEDITEM EXISTS - CLICKING!");
								videoFeedItem.click();

								await driver.sleep(20000);
								
								screenshot = await driver.takeScreenshot();
								if (screenshot) { fs.writeFileSync(path.resolve(__dirname, "screenshots/" + new Date().toISOString().replace(/:/g, '') + "_" + tikTokCreator.name.replace(/ /g, '') + "04.png"), screenshot, 'base64'); }
							}

							if (!videoFeedItem){
								try {
									itemVideoCard = await driver.findElement(By.className('item-video-card-wrapper'));
								} catch (error) {}
								if (itemVideoCard){
									log("TIKTOK --- ITEMVIDEOCARD EXISTS - CLICKING!");
									itemVideoCard.click();

									await driver.sleep(20000);
									
									screenshot = await driver.takeScreenshot();
									if (screenshot) { fs.writeFileSync(path.resolve(__dirname, "screenshots/" + new Date().toISOString().replace(/:/g, '') + "_" + tikTokCreator.name.replace(/ /g, '') + "05.png"), screenshot, 'base64'); }
								}
							}
						}

						if (videoFeedItem1 || videoFeedItem || itemVideoCard) {
							//// TITLE
							//video-meta-title"><strong class="jsx-1505980143">Hex.com <
							var titleMatch = data.match('video-meta-title"><.{0,30}>(.{0,200}?)<');
							if (titleMatch && titleMatch.length >= 2)
							{
								log("TIKTOK --- Title A: " + titleMatch[1]);
								tikTokVideo.title = truncate(titleMatch[1], 36).trim(); //titleMatch[1];
							} 
							else {
								log('TIKTOK --- Title A Missing');
								log(data);

								var titleMatch2 = data.match('video-meta-title.{0,30}">(.{0,200}?)<');
								if (titleMatch2 && titleMatch2.length >= 2)
								{
									log("TIKTOK --- Title B:" + titleMatch2[1]);
									tikTokVideo.title = truncate(titleMatch2[1], 36).trim(); //titleMatch[1];
								} else {
									log('TIKTOK --- Title B Missing');
								}
							}
						}*/


					} //else {

					//// TITLE
					// <div class="tt-video-meta-caption jsx-1385049866 jsx-531976133"><span>Make money moves: Best high yield savings account.  <
					//var titleMatch = data.match('<div class="tt-video-meta-caption.{0,70}><span>(.{0,200})<');
					// "showUpload":true,"type":"webapp"}},"items":[{"id":"6938642919804996869","desc":"Make money moves:asdfsdf","createTime"
					// "webapp".{0,3},"items":.{0,3}"id":".{0,25}","desc":"(.{0,200})","createTime"
					//var titleMatch = data.match('"webapp".{0,3},"items":.{0,3}"id":".{0,25}","desc":"(.{0,200})","createTime"');

					// <div class="tt-video-meta-caption jsx-1385049866 jsx-531976133"><span>HEX allows me to do what I want when I want.  <

					//log('TIKTOK --- DATA HTML DUMP');
					//log(data);

					//class="tt-video-meta-caption jsx-1385049866 jsx-531976133"><a href="/tag/btc?lang=en" class="jsx-531976133" rel="noopener"><span>#btc </span>

					var titleDiv = undefined;
					try {
						titleDiv = await driver.findElement(By.className('tt-video-meta-caption'));
					} catch (error) {log(error);}
					if (titleDiv){
						log("TIKTOK --- INNER TEXT");
						var innerText = await titleDiv.getAttribute("innerText");
						//log(innerText);

						tikTokVideo.title = truncate(innerText, 48).trim();
		
						await driver.sleep(20000);
					} else {
						var titleMatch = data.match('tt-video-meta-caption.{0,100}">.{0,100}?<span>(.{0,200}?)<');
						if (titleMatch && titleMatch.length >= 2 && titleMatch[1].trim().length > 2)
						{
							log("TIKTOK --- Title: " + titleMatch[1]);
							tikTokVideo.title = truncate(titleMatch[1], 36).trim(); //titleMatch[1];
						} else {
							log('TIKTOK --- Title Missing');
							var titleMatch2 = data.match('tt-video-meta-caption.{0,100}">.{0,100}?<strong>(.{0,200}?)<');
							if (titleMatch2 && titleMatch2.length >= 2 && titleMatch2[1].trim().length > 2)
							{
								log("TIKTOK --- Title 2: " + titleMatch2[1]);
								tikTokVideo.title = truncate(titleMatch2[1], 36).trim(); //titleMatch[1];
							} else {
								log('TIKTOK --- Title 2 Missing');

								var titleMatch3 = data.match('<title>(.{0,200}?)<');
								if (titleMatch3 && titleMatch3.length >= 2)
								{
									log("TIKTOK --- Title 3: " + titleMatch3[1]);
									tikTokVideo.title = truncate(titleMatch3[1], 36).trim(); //titleMatch[1];
									
								} else {
									log('TIKTOK --- Title 3 Missing');
								}
							}
						}
					}

					if (tikTokVideo.title.length < 3){
						log('TIKTOK --- WARNING - SMALL TITLE: ' + tikTokVideo.title);
					}
	
					//list.push(tikTokVideo);
					
					log("TIKTOK -- SAVE: " + tikTokVideo.link + " - " + tikTokVideo.name);
					tikTokVideo.save(function (err) {
						if (err) return log("TIKTOK -- SAVE ERROR: " + err);
					});
				}
			} 
		} catch (err) {
			log("TIKTOK -- ERROR: " + err + "\n" + err.stack);
		} finally {
			//await driver.close();
			await driver.quit();
		}

		await sleep(900000 + getRandomInt(300000)); // 15 minutes + 0-5 minutes
		return;
		//return list;
	}
	} catch (err) {
		log("TIKTOK -- ERROR - getTikTokVideosByCreator() - " + err + "\n" + err.stack);
	}
}

function truncate(str, n){
  return (str.length > n) ? str.substr(0, n-1) + '&hellip;' : str;
};

async function updateTikTokList() {
	try {
		var tikTokCreators = [];
		var tikTokVideos = [];
		if (!TEST_DATA) {
			tikTokCreators = await TikTokCreator.find({isTestData: { $eq: false}});

			var dateOffset = (24*60*60*1000) * CONFIG.tiktok.daysAgo;
			var myDate = new Date();
			myDate.setTime(myDate.getTime() - dateOffset);
		
			tikTokVideos = await TikTokVideo.find({ $and: [{ hide: { $eq: false } }, {isTestData: { $eq: false}}, {published: {$gte: myDate}}]});

		} else {
			tikTokCreators = await TikTokCreator.find({isTestData: { $eq: true}});

			var dateOffset = (24*60*60*1000) * CONFIG.tiktok.daysAgo;
			var myDate = new Date();
			myDate.setTime(myDate.getTime() - dateOffset);
		
			tikTokVideos = await TikTokVideo.find({ $and: [{ hide: { $eq: false } }, {isTestData: { $eq: true}}, {published: {$gte: myDate}}]});
		}

		tikTokVideos.sort((a, b) => (a.published < b.published) ? 1 : -1);

		var tikTokList = [];
		tikTokCreators.forEach(tikTokCreator => {
			var list = tikTokVideos.filter(tickTockVideo => tickTockVideo.parentLink === tikTokCreator.link);
			tikTokList = tikTokList.concat(list.slice(0, tikTokCreator.limit))
		});

		// Get Manually added
		//tikTokList = tikTokList.concat(tikTokVideos.filter(tickTockVideo => (tickTockVideo.link === undefined || tickTockVideo.link === "")));

		tikTokList.sort((a, b) => (a.published < b.published) ? 1 : -1);
		tikTokList.slice(0, CONFIG.tiktok.limit);

		var html = '';
		tikTokList.forEach(tickTockVideo => {
			html += tickTockVideo.generateHTML();
		});

		if (tikTokListHTML === "" || tikTokListHTML === undefined || tikTokListHTML !== html) {
			tikTokListHTML = html;
			//log(tikTokListHTML);
			log('TIKTOK -- ****EMIT: tikTokList');
			io.emit("tikTokList", tikTokListHTML);
		}
	} catch (err) {
		log("TIKTOK -- ERROR - updateTikTokList() - " + err + "\n" + err.stack);
	}
}


////////////////////// 
// PRICE

var priceUrl = "https://api.nomics.com/v1/currencies/ticker?key=" + CONFIG.price.nomicsKey + "&ids=HEX";

async function updatePrice(){
	try {
		const resp = await fetch(priceUrl);
		const data = await resp.json();

		if (data && data.length >= 1) {
			var hexData = data[0];
			if (hexData && hexData.price) {
				//log("PRICE --- UPDATE - " + hexData.price);
				hexPrice = parseFloat(hexData.price).toFixed(4).toString();
				io.emit("hexPrice", hexPrice);
			}
		}
	} catch (err) {
		log("PRICE --- ERROR - updatePrice() - " + err + "\n" + err.stack);
	}
}

//////////////////////////////////////////////////
// REDDIT

////////////////////// 
// RedditCreator

var RedditCreatorSchema = new Schema({
	link: {
    type: String, 
    required: true
  },
	name: String,
	isTestData: Boolean,
	twitter: String
});

const RedditCreator = mongoose.model('RedditCreator', RedditCreatorSchema);

function createInitialRedditCreator() {
	log('createInitialRedditCreator() START');
	const redditCreator = new RedditCreator({ 
		link: 'https://www.reddit.com/r/HEXcrypto/',
		name: "HEX Crypto",
		isTestData: false,
		twitter: 'HEXcrypto'
	});
	redditCreator.save(function (err) {
		if (err) return console.error(err);
	});
	log('createInitialRedditCreator() END');
}

////////////////////// 
// RedditPost

var RedditPostSchema = new Schema({
	guid: {
    type: String, 
    required: true
  },
	link: {
    type: String, 
    required: true
  },
	parentLink: {
    type: String, 
    required: true
  },
	name: String,
	title: String,
	isTestData: Boolean,
	published: Date,
	twitter: String,
});

RedditPostSchema.methods.getLink = function () {
  return this.link;
};

RedditPostSchema.methods.getLinkAlphaNumeric = function () {
  return this.parentLink.replace(/[^a-zA-Z0-9]/g, '');
};

const RedditPostVideo = mongoose.model('RedditPostVideo', RedditPostSchema);

function createInitialRedditPostVideo() {
	log('createInitialRedditPostVideo() START');
	const redditPostVideo = new RedditPostVideo({ 
		guid: 't3_mp3gt3',
		link: 'https://www.reddit.com/r/HEXcrypto/comments/mp3gt3/i_us_we_and_all_the_hexicans_this_is_a_call_to/',
		parentLink: 'https://www.reddit.com/r/HEXcrypto/',
		name: "/u/SnooPeppers5877",
		title: "I, Us, We, and all the HEXICANS!!!!! This is a CALL TO ARMS!!!! All hands on DECK!!!!",
		isTestData: false,
		published: new Date(),
		twitter: 'HEXcrypto'
	});
	redditPostVideo.save(function (err) {
		if (err) return console.error(err);
	});
	log('createInitialRedditPostVideo() END');
}

async function testRedditRSS(){
	try {
		let parser = new Parser();
		let feed = await parser.parseURL("https://www.reddit.com/r/hexcrypto.rss");
		log(feed);
		log(JSON.stringify(feed));
	} catch (err) {
		log("REDDIT -- ERROR - testRedditRSS() - " + err + "\n" + err.stack);
	}
}
/*
{
   "items":[
      {
         "title":"I, Us, We, and all the HEXICANS!!!!! This is a CALL TO ARMS!!!! All hands on DECK!!!!",
         "link":"https://www.reddit.com/r/HEXcrypto/comments/mp3gt3/i_us_we_and_all_the_hexicans_this_is_a_call_to/",
         "pubDate":"2021-04-12T00:55:28.000Z",
         "author":"/u/SnooPeppers5877",
         "content":"AAAAAAAAA",
         "contentSnippet":"Just alittle click bait title.... for the sake of all Hexicans, now and in the future....\n So, I was watching a Youtube channel the last couple months, of a BIG GUY down in Orlando, Florida...\n This mans name is Ben Mallah... https://www.youtube.com/channel/UC94m18wtI9QAYrXKXqFPWDg\n Heres the link to his Youtube channel.....\n Well, the other day Ben and his sons were conducting a livestream call in show, answering questions about real estate.... Ben Mallah's whole channel is about investing in real estate....\n During the livestream, some freaking badass HEXICAN, paided money for a \"super chat\" to be read out loud live on air....\n Some one asked Ben if he would do a LIVE interview, with Richard Heart to talk about HEX.... BEN MALLAH basically said YES!!!!! \n Ben Mallah said he would do an interview with Richard Heart, but someone or some Hexican needs to \n go to this link.... https://benmallah.com/shop/\n to set up a ZOOM meeting interview with Ben..... \n If you guys and gals don't know who Ben Mallah is, well, he has a $150,000,000 real estate portfolio of hotels and motels in Florida... And he bought i think the most expensive beach house in Orlando.... It cost about $16,000,000 for the house he lives in.\n So, if any one wants to set that interview up.... I'm pretty confident Richard Heart is ready....\n    submitted by    /u/SnooPeppers5877  \n [link]   [comments]",
         "id":"t3_mp3gt3",
         "isoDate":"2021-04-12T00:55:28.000Z"
      },

			const rssItem = new RSSItem({ 
				link: item.link,
				//parentLink: rssCreator.link,
				name: item.author,
				title: item.title,
				isTestData: false,
				hide: false,
				published: item.isoDate
			});
*/
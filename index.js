const Discord = require("discord.js");
const Express = require("express");
const puppeteer = require("puppeteer");
const app = Express();
const port = process.env.PORT || 8080;

const client = new Discord.Client({ intents: [Discord.Intents.FLAGS.GUILDS, Discord.Intents.FLAGS.GUILD_MESSAGES] });

const discordToken = process.env.discord_token;
const botId = process.env.bot_id;

client.on("ready", () => {
    console.log("Ready.");
    client.user.setActivity("Thinking");
})

var existingBrowser = null;
var existingPage = null;
var botRespondMsgArray = [];
const formalPunctuation = /["'!,.]/g;
var emojiRequests = 0;

const mention = /<@(.*?)>/g; //When the bot is pinged, the message includes a string for the mention which follows a format of <@----------->. 
//Cleverbot percieves it as HTML and does not allow it as an input unless it is filtered out.

var reactWord = async (msg, word) => {
    word = word.toLowerCase();
    for (var i = 0; i < word.length; i++) {
        const char = String(word.charAt(i));
        const difference = char.charCodeAt(0) - "a".charCodeAt(0);
        var UnicodeA = 0x1F1E6; //Unicode for the A emoji, all the letter emojis are consectutive.
        UnicodeA += difference;
        const unicodeCharacter = String.fromCodePoint(UnicodeA);
        if (unicodeCharacter != null && emojiRequests < 50) {
            emojiRequests++;
            await msg.react(unicodeCharacter);
            emojiRequests--;
        }
    }
}


//Checks if the bot can react to a message, requirements: all characters must be unique and all be letters ( no numbers /symbols)
var isUnique = (text) => {
    text = text.toLowerCase();
    var chars = new Set(text);//initializing a set with characters
    if (text.length != chars.size) {
        return false; //Checking for uniqueness
    }

    for (var i = 0; i < text.length; i++) { //Checking if all letters
        const char = String(text.charAt(i));
        if (char.charCodeAt(0) < "a".charCodeAt(0) || char.charCodeAt(0) > "z".charCodeAt(0)) {
            return false;
        }
    }
    return true;
}

var retrieveResponse = async () => { //webscrapes cleverbot.com for response to input
    await client.user.setActivity("Thinking");
    try {
        const origMsg = botRespondMsgArray[0];
        if (existingBrowser == null) {
            existingBrowser = await puppeteer.launch({
                product: "firefox", headless: true, args: ["--no-sandbox", "--disabled-setupid-sandbox"] });
        }
        console.log("start");
        if (existingPage == null) {
            existingPage = await existingBrowser.newPage();
            await existingPage.setDefaultNavigationTimeout(1000 * 60 * 1.5); //a minute and thirty seconds.
            await existingPage.goto("https://www.cleverbot.com");
            await existingPage.waitForSelector("#noteb input");
            await existingPage.click("#noteb input");
        }

        await existingPage.waitForSelector("#avatarform input");
        const msgToType = await (origMsg.content.replaceAll(mention, ""));
        await existingPage.type("#avatarform input", msgToType);
        await existingPage.waitForSelector(".sayitbutton");
        await existingPage.click(".sayitbutton");
        await existingPage.waitForSelector("#line1 #snipTextIcon");
        await existingPage.waitForSelector("#line1 .bot");

        const grabResponse = await existingPage.evaluate(() => {
            const response = document.querySelector("#line1 .bot");
            return response.innerHTML;
        });

        var line = await grabResponse.toLowerCase();
        line = line.replace(formalPunctuation, ""); //Bot is meant to seem informal, so takes out some grammar from response.

        if (line == "") {
            line = "no response";
        }
        if (origMsg != null) {
            origMsg.reply(line, {tts: true});
        }
        await botRespondMsgArray.shift();

        if (botRespondMsgArray.length > 0) {
            retrieveResponse();
        }
        else {
            await existingPage.close();
            await existingBrowser.close();
            existingBrowser = null;
            existingPage = null;
        }
    }
    catch (e) {
        console.log("CAUGHT: " + e);
        if (botRespondMsgArray.length > 0) {
            botRespondMsgArray.shift();
        }
    }
    if (botRespondMsgArray.length == 0) {
        await client.user.setActivity("Waiting");
    }
}

client.on("messageCreate", async msg => {
    //msg.reply(msg.content);
    var respond = false;
    const lowerMsg = msg.content.toLowerCase();
    var replyBot = false;
    const reply = msg.reference;
    if (isUnique(lowerMsg) && msg.author.id != botId) {
        reactWord(msg, lowerMsg);
    }
    if (reply != null) {
        const repliedTo = await msg.channel.messages.fetch(reply.messageId);
        if (repliedTo.author.id == botId) {
            replyBot = true;
        }
    }

    if (msg.mentions.has(client.user)) {
        replyBot = true;
    }

    if (replyBot) {
        botRespondMsgArray.push(msg);
        if (botRespondMsgArray.length == 1 && existingPage == null) {
            retrieveResponse();
        }
    }
})

client.login(discordToken);

app.get("/", (request, response) => {
    response.sendStatus(200);
});

app.listen(port, function () {
    console.log("Listening at http://localhost:${port}");
});
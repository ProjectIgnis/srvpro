var Discord = require('discord.js');
var fs = require('fs');

function getLines(file) {
	const raw = fs.readFileSync(file, "utf8");
	const list = raw.split("\n");
	for (let i = list.length; i > -1; i--) {
		if (list[i] === "") {
			list.splice(i, 1);
		}
	}
	return list;
}

async function save(file, list) {
	const buffer = list.reduce((str, value) => `${str}${value}\n`, "");
	try {
		await fs.promises.writeFile(file, buffer);
	} catch(e) {
		console.error(`Couldn't save ${file}\n`, e);
	}
}

function useSerializer(file) {
	const list = getLines(file);
	return [list, () => save(file, list)];
}

const [controlers, savechannels] = useSerializer("controlers.txt");
const [channels, savecontrolers] = useSerializer("channels.txt");
const [chatWarningChannels, saveChatWarn] = useSerializer("chatWarningChannels.txt");

function addChannel(type, message, list, callback) {
	if (list.includes(message.channel.id)) {
		message.channel.send("Already working in this channel!");
	} else {
		console.log(`Starting ${type} in ${message.channel.id}`);
		list.push(message.channel.id);
		callback();
		message.channel.send(`Starting ${type} in this channel.`)
	}
}

function removeChannel(type, message, list, callback) {
	const i = list.findIndex(i => i === message.channel.id);
	if (i === -1) {
		message.channel.send(`This channel wasn't used for ${type}!`);
	} else {
		list.splice(i, 1);
		console.log(`Ending ${type} in ${message.channel.id}`);
		callback();
		message.channel.send(`Ending ${type} in this channel`);
	}
}

var bot = new Discord.Client()

bot.on('ready', function () {
	console.log('Logged in as %s - %s\n', bot.user.username, bot.user.id);
	//server.start();
});

bot.on('message', function (message) {
	var ok = false;
	for (let i = 0; i < controlers.length; i++) {
		if (controlers[i] === message.author.id) {
			ok = true;
			break;
		}
	}
	if (!ok) return;
	if (message.content.indexOf(".addcontroler") === 0) {
		var res = message.content.substring(".addcontroler".length + 1, message.content.length);
		usid = res.substring(2, res.length - 1);
		if (bot.users.find('id', usid)) {
			let chk = true;
			for (let i = 0; i < controlers.length; i++) {
				if (controlers[i] === usid) {
					chk = false;
					break;
				}
			}
			if (chk) {
				console.log('adding ' + usid + ' as a controler');
				controlers.push(usid);
				message.channel.send("user added as controler");
				savecontrolers();
			} else {
				message.channel.send("user already controler");
			}
		}
	}
	if (message.content.indexOf(".removecontroler") === 0) {
		var res = message.content.substring(".removecontroler".length + 1, message.content.length);
		usid = res.substring(2, res.length - 1);
		if (bot.users[usid]) {
			let chk = false;
			for (let i = 0; i < controlers.length; i++) {
				if (controlers[i] === usid) {
					chk = true;
					controlers.splice(i, 1);
				}
			}
			if (chk) {
				console.log('removed ' + usid + ' from the controlers');
				message.channel.send("user is no longer a controler");
				savecontrolers();
			} else {
				message.channel.send("user isn't a controler");
			}
		}
	}
	if (message.content === ".addlogging") {
		addChannel("logging", message, channels, savechannels);
	}
	if (message.content === ".removelogging") {
		removeChannel("logging", message, channels, savechannels);
	}
	if (message.content === ".addchatwarn") {
		addChannel("chat warnings", message, chatWarningChannels, saveChatWarn);
	}
	if (message.content === ".removechatwarn") {
		removeChannel("chat warnings", message, chatWarningChannels, saveChatWarn);
	}
	//if (message.content === ".restartai") {
		//server.restartAI();
		//message.channel.send("ai restart not reimplemented yet");
	//}
});

function write(output) {
	for (let i = 0; i < channels.length; i++) {
		bot.channels.get(channels[i]).send("```" + output + "```");
	}
};

function write2(output, room) {
	let j, len1, line, ref;
	if (room) {
		write("Room id: " + room.game_id + "\nRoom Password: " + room.pass + "\nRoom Notes: " + room.notes + "\nHost Player: " + room.players[0].name + "\nRoom Status: " + room.status)
	}

	ref = (require('underscore')).lines(output);
	for (j = 0, len1 = ref.length; j < len1; j++) {
		if ((line + "\n" + ref[j]).length > 2000 - 6) {
			write(line);
			line = "";
		}
		line = line + "\n" + ref[j];
	}
	write(line);
};

async function uploadreplay(room, code, signal) {
	if (!room || signal === "SIGPIPE") {
		return;
	}
	const botChannels = channels.map(channel => bot.channels.get(channel));
	const messageHeader = code !== undefined && signal !== undefined
		? "```Room had an error```" + `Process ${room.process_pid} exited with code ${code} and signal ${signal}\n`
		: "```Room had an error```";
	const message = messageHeader +
		"```Room id: " + room.game_id +
		"\nRoom Notes: " + room.notes +
		"\nHost Player: " + room.players[0].name + "```";
	let messageSuffix = "";
	if (code !== undefined && signal !== undefined) {
		try {
			const lastAnswer = await fs.promises.readFile(`./ygopro/replay/${room.game_id}.answ`);
			await fs.promises.appendFile(`./ygopro/replay/${room.game_id}.yrp`, lastAnswer);
			messageSuffix = "\nFinal `.answ` was appended.";
		} catch (e) {
			messageSuffix = "\nNo `.answ` was appended.";
		}
	}
	try {
		await Promise.all(
			botChannels.map(channel => channel.send(message + messageSuffix, {
				files: [
					`./ygopro/replay/${room.game_id}.yrp`,
					`./ygopro/replay/${room.game_id}.yrpX`
				]
			}))
		);
	} catch (e) {
		console.error(`No replay available for room ${room.game_id}, was process ${room.process_pid}.`);
	}
	// Don't really care if these fail since they might not exist.
	fs.promises.unlink(`./ygopro/replay/${room.game_id}.yrp`).catch(() => { });
	fs.promises.unlink(`./ygopro/replay/${room.game_id}.yrpX`).catch(() => { });
	fs.promises.unlink(`./ygopro/replay/${room.game_id}.answ`).catch(() => { });
}

async function chatWarning(message, name, ip, roomNotes) {
	const fields = [
		{ name: "Nickname", value: name, inline: true },
		{ name: "IP", value: ip, inline: true }
	];
	if (roomNotes) {
		fields.push({ name: "Room notes", value: roomNotes });
	}
	await Promise.allSettled(
		chatWarningChannels.map(channel => bot.channels.get(channel).send({
			embed: {
				title: `Infraction: ${message}`,
				fields
			}
		}))
	);
}

module.exports = {
	connect: function (token) {
		return bot.login(token);
	},
	write: write,
	write2: write2,
	uploadreplay: uploadreplay,
	chatWarning: chatWarning
};

(async () => {

require('dotenv').config();

const { MPPCLONE_TOKEN } = process.env;
const { Level } = require('level');
const MPPClient = require('mppclone-client');
// const MPPClient = require('mpp-client-xt');
const db = new Level('./bot2023.db', { valueEncoding: 'json' });

const uri = "wss://mppclone.com:8443";
// const uri = "wss://mpp.hri7566.info:8443";
let gName = "Paint Watching Club";
let gColor = '#8d3f50';
let gChannel = '✧𝓓𝓔𝓥 𝓡𝓸𝓸𝓶✧';
const defaultLocationId = 'home';

const defaultObjectTable = [
	{
		id: 'couch',
		static: {
			displayName: 'Couch',
			enableSit: true
		}
	}
];

db.getObjectTable = async () => {
	let objs = await db.get(`objects`).catch(err => {
		return defaultObjectTable;
	});

	// set new objects
	//? should static properties be skipped?
	for (let obj of defaultObjectTable) {
		if (!objs[obj.id]) {
			objs[obj.id] = obj;
		}
	}

	await db.put(`objects`, objs);

	return objs;
}

class ObjectHandler {
	static async get(id) {
		let objtab = await db.getObjectTable();
		return objtab.find(o => o.id == id);
	}

	static async set(obj) {
		let objtab = await db.getObjectTable();
		objtab[objtab.indexOf(objtab.find(o => o.id == obj.id))] = obj;
	}

	static async setStaticProperty(id, prop, value) {
		let obj = await this.get(id);
		if (!obj) return;
		obj.static[prop] = value;
		this.set(obj);
	}

	static async getStaticProperty(id, property) {
		let obj = await this.get(id);
		if (!obj) return;
		return obj.static[prop];
	}

	static instance(obj) {
		let nobj = {};
		
		for (let key of Object.keys(obj)) {
			if (key == 'static') continue;
			nobj[key] = obj[key];
		}

		return nobj;
	}

	static async new(id) {
		let obj = await this.get(id);
		return this.instance(obj);
	}

	static async getName(id) {
		let obj = await this.get(id);
		return obj.static.displayName || '_MISSING';
	}
}

const defaultLocationTable = [
	{
		id: 'home',
		displayName: 'Home',
		aliases: [ 'inside', 'in' ],
		world: 'Earth',
		objects: [
			await ObjectHandler.new('couch')
		],
		reach: [ 'outside' ]
	},
	{
		id: 'outside',
		displayName: 'Outside',
		aliases: [ 'out' ],
		world: 'Earth',
		reach: [ 'home' ]
	}
];

const getDOW = () => {
	return new Date().getDay();
}

db.setLocation = async (_id, loc) => await db.put(`location~${_id}`, loc);

db.getLocation = async _id => {
	let locId = await db.get(`location~${_id}`).catch(err => {
		return defaultLocationId;
	});

	let loc = (await db.getLocationTable()).find(l => l.id == locId);
	
	if (!loc) return {
		id: 'deleted',
		displayName: 'Deleted Land'
	}

	return loc;
}

db.addAdmin = async _id => {
	let admin = await db.get('admin').catch(err => { return new Array(); });
	if (!admin) admin = [];
	admin.push(_id);
	await db.put(`admin`, admin);
}

db.removeAdmin = async _id => {
	let admin = await db.get('admin').catch(err => { return new Array(); });
	if (!admin) return;
	admin.splice(admin.indexOf(_id), 1);
	await db.put(`admin`, admin);
}

db.isAdmin = async _id => {
	let admin = await db.get(`admin`).catch(err => JSON.stringify([]));
	return admin.includes(_id);
}

db.getLocationTable = async () => {
	let locs = await db.get(`locations`).catch(err => {
		return defaultLocationTable;
	});

	// set new locations and new location properties
	for (let loc of defaultLocationTable) {
		if (!locs.find(l => l.id == loc.id)) {
			locs[defaultLocationTable.indexOf(loc)] = loc;
		}

		//! only top-level keys
		for (let key of Object.keys(loc)) {
			if (!locs.find(l => l.id == loc.id).hasOwnProperty(key)) {
				locs.find(l => l.id == loc.id)[key] = loc[key];
			}
		}
	}

	await db.put(`locations`, locs);

	return locs;
}

await db.getLocationTable(); // also sets initial values

db.getOwnParticipant = async () => {
	return await db.get('ownParticipant').catch(err => { gName, gColor });
}

class Bot {
	static client = new MPPClient(uri, MPPCLONE_TOKEN);
	static connect() {
		console.log('********START********');
		this.client.start();
		this.client.setChannel(gChannel);
		this.bindEventListeners();
	}

	static bindEventListeners() {
		this.client.on('hi', msg => this.checkUserset(msg.u));
		this.client.on('t', msg => this.checkUserset());

		this.client.on('a', msg => {
			console.log(`${msg.p._id.substring(0, 6)} ${msg.p.name}: ${msg.a}`);

			CommandHandler.handleCommand(msg, this);
		});

		this.client.on('ch', msg => {
			if (msg.ch._id !== gChannel) this.correctChannel = false;
			else this.correctChannel = true;

			console.log(`Connected to ${msg.ch._id}`);
		});

		this.client.once('wserror', msg => {
			console.warn('Issues connected to MPPClone, hopefully not a server outage...');
		});
	}

	static say(str) {
		this.client.sendArray([{
			m: 'a',
			message: `\u034f${str}`
		}]);
	}

	static checkUserset(u) {
		let name = this.client.getOwnParticipant().name
		let color = this.client.getOwnParticipant().color;
		
		if (u) {
			name = u.name;
			color = u.color;
		}

		if (name !== gName || color !== gColor) {
			this.sendUserset(gName, gColor);
		}
	}

	static sendUserset(name, color) {
		this.client.sendArray([{m: 'userset', set: { name: name || gName, color: color || gColor }}]);
	}

	static getUserFuzzy(str) {
		str = str.toLowerCase();
		
		for (let p of Object.values(this.client.ppl)) {
			return p.name.toLowerCase().includes(str) || p._id.toLowerCase().includes(str) || p.id.toLowerCase().includes(str);
		}
	}
}

class Command {
	constructor(id, aliases, cb, admin = false) {
		this.id = id;
		this.aliases = aliases;
		this.cb = cb;
		this.admin = admin;
	}
}

class Prefix {
	constructor(id, separated) {
		this.id = id;
		this.separated = separated;
	}
}

class CommandHandler {
	static commands = [];
	static prefixes = [];

	static addCommand(cmd) {
		this.commands.push(cmd);
	}

	static addPrefix(pre) {
		this.prefixes.push(pre);
	}

	static async handleCommand(msg, bot) {
		if (bot) {
			if (msg.p._id == bot.client.getOwnParticipant()._id) return;
		}

		let say = str => {
			console.log(str);
		}

		if (bot) say = (...args) => { bot.say(...args); }

		msg.args = msg.a.split(' ');
		msg.argcat = msg.a.substring(msg.args[0].length).trim();
		msg.admin = msg.admin || db.isAdmin(msg.p._id);

		prefixLoop:
		for (let prefix of this.prefixes) {
			if (!prefix.separated) {
				if (msg.args[0].startsWith(prefix.id)) {
					msg.prefix = prefix;
					msg.cmd = msg.args[0].substring(prefix.id.length);
					break prefixLoop;
				}
			} else {
				if (msg.args[0] == prefix.id) {
					msg.prefix = prefix;
					msg.args.shift();
					msg.cmd = msg.args[0];
					break prefixLoop;
				}
			}
		}

		cmdLoop:
		for (let cmd of this.commands) {
			let cont = false;

			aliasLoop:
			for (let alias of cmd.aliases) {
				if (msg.cmd == alias) {
					cont = true;
					msg.usedAlias = alias;
					break aliasLoop;
				}
			}

			if (!cont) continue; // no command
			try {
				const out = await cmd.cb(msg, say);
				if (out) say(out);
			} catch (err) {
				console.error(err);
				say('An error has occurred.');
			}
		}
	}
}

process.stdin.on('data', omsg => {
	try {
		omsg = omsg.toString().split('\n').join(' ');
		let isUsingPrefix = false;

		for (let prefix of CommandHandler.prefixes) {
			if (omsg.startsWith(prefix.id)) isUsingPrefix = true;
		}
		
		if (!isUsingPrefix) {
			Bot.say(omsg);
			return;
		}

		let msg = {}
		msg.m = 'a';
		msg.a = omsg;
		
		msg.p = {
			name: 'Console',
			color: gColor,
			_id: 'console'
		}

		msg.admin = true;

		CommandHandler.handleCommand(msg);
	} catch (err) {
		console.error(err);
	}
});

Bot.connect();

CommandHandler.addPrefix(new Prefix('/', false));
CommandHandler.addPrefix(new Prefix('=', false));

CommandHandler.addCommand(new Command(
	'help',
	['help', 'h', 'cmds'],
	(msg, say) => {
		say('help menu goes here')
	}
));

CommandHandler.addCommand(new Command(
	'location',
	['location', 'where', 'whereami', 'loc'],
	async (msg, say) => {
		let loc = await db.getLocation(msg.p._id);
		say(`Your current location: ${loc.displayName}`);
	}
));

CommandHandler.addCommand(new Command(
	'go',
	['go', 'move'],
	async (msg, say) => {
		if (!msg.args[1]) return `Where do you want to go?`;
		let cur = await db.getLocation(msg.p._id);
		let loctab = await db.getLocationTable();
		let loc;

		let sitting = await db.get(`sitting~${msg.p._id}`).catch(err => false);
		if (sitting) return `You can't move because you are sitting.`;

		// find location
		for (let l of loctab) {
			let go = msg.argcat.toLowerCase();
			
			if (cur.world && l.world) {
				if (cur.world !== l.world) continue;
			}

			let alias = false;
			aliasLoop:
			for (let al of l.aliases) {
				if (al.includes(go))  {
					alias = true;
					break aliasLoop;
				}
			}

			if (!l.id.includes(go) && !l.displayName.includes(go) && !alias) continue;
			loc = l;
		}

		if (!loc) {
			let noMapAnswers = [
				`I don't see "${msg.argcat}" on the map.`,
				`There's no "${msg.argcat}" in this world.`,
				`You stare at the map for hours, only to find no location called "${msg.argcat}".`,
				`You decided not to go to "${msg.argcat}".`
			];

			return noMapAnswers[Math.floor(Math.random() * noMapAnswers.length)];
		}

		if (loc.banned) {
			if (loc.banned.includes(msg.p._id)) {
				if (loc.id == cur) await db.setLocation(msg.p._id, defaultLocationId);
				return `My dude ${msg.p.name}, you aren't allowed here.`;
			}
		}

		if (cur == loc.id) {
			return `My dude ${msg.p.name}, you're already there, man!`;
		}

		db.setLocation(msg.p._id, loc.id);
		return `${msg.p.name} went ${loc.displayName}.`;
	}
));

CommandHandler.addCommand(new Command(
	'get',
	['get'],
	async (msg, say) => {
		let cont = true;
		return db.get(msg.argcat).catch(err => {
			if (err) {
				say(`Friend ${msg.p.name} get FAIL: ${err}`);
				cont = false;
			}
		}).then(res => {
			if (cont) return `Friend ${msg.p.name} get SUCCESS: ${JSON.stringify(res)}`;
		});
	},
	true
));

CommandHandler.addCommand(new Command(
	'put',
	['put'],
	async (msg, say) => {
		let argslice = msg.a.substring(msg.args[0].length + msg.args[1].length + '  '.length).trim();
		return db.put(msg.args[1], argslice).then(res => {
			return `Friend ${msg.p.name} put SUCCESS: ${JSON.stringify(res)}`;
		}).catch(err => {
			return `Friend ${msg.p.name} put FAIL: ${err}`, undefined;
		});
	},
	true
));

CommandHandler.addCommand(new Command(
	'del',
	['del'],
	async (msg, say) => {
		return db.del(msg.argcat).then(() => {
			return `Friend ${msg.p.name} del SUCCESS`;
		}).catch(err => {
			return `Friend ${msg.p.name} del FAIL: ${err}`, undefined;
		});
	},
	true
));

CommandHandler.addCommand(new Command(
	'admin+',
	['admin+'],
	async (msg, say) => {
		await db.addAdmin(msg.argcat);
		return `Added \`${msg.argcat}\` to admin table.`;
	},
	true
));

CommandHandler.addCommand(new Command(
	'id',
	['id', 'myid', 'qmyid'],
	async (msg, say) => {
		return `Friend ${msg.p.name}: \`${msg.p._id}\``;
	}
));

CommandHandler.addCommand(new Command(
	'look',
	['look', 'inspect'],
	async (msg, say) => {
		let loc = await db.getLocation(msg.p._id);
		if (!loc.objects) return `There's nothing to look at here.`;
		return `There's ` + await Promise.all(loc.objects.map(async o => {
			return (await ObjectHandler.getName(o.id));
		})) + `... about.`;
	},
	true
));

CommandHandler.addCommand(new Command(
	'resetlocation',
	['resetlocation', 'resetloc', 'rsloc'],
	async (msg, say) => {
		let qid = msg.argcat;
		if (!qid) return 'Missed entirely, you need a parameter';
		let loctab = await db.getLocationTable();
		let loc = loctab.find(l => l.id == qid);
		if (!loc) return `Missed location ${qid} (not in location table) :(`;
		loctab[loctab.indexOf(loc)] = defaultLocationTable.find(l => l.id == qid);
		return `Reset location with id ${loc.id}`
	},
	true
));

CommandHandler.addCommand(new Command(
	'exit',
	['exit'],
	async (msg, say) => {
		say('Exiting process...');
		process.exit();
	},
	true
));

})();

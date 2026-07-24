require("dotenv").config();
const { App } = require("@slack/bolt");
const axios = require("axios");

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  appToken: process.env.SLACK_APP_TOKEN,
  socketMode: true,
});

const footballApi = axios.create({
  baseURL: "https://api.football-data.org/v4/",
  headers: { "X-Auth-Token": process.env.FOOTBALL_DATA_API_KEY },
});


const LEAGUE_MAP = {

  prem: "PL",
  premier: "PL",
  pl: "PL",
  epl: "PL",
  "premier league": "PL",

  laliga: "PD",
  "la liga": "PD",
  pd: "PD",
  spain: "PD",

  bundesliga: "BL1",
  bl1: "BL1",
  germany: "BL1",

  "serie a": "SA",
  seriea: "SA",
  sa: "SA",
  italy: "SA",

  "ligue 1": "FL1",
  ligue1: "FL1",
  fl1: "FL1",
  france: "FL1",

  cl: "CL",
  champions: "CL",
  "champions league": "CL",
};

app.command("/soccer-ping", async ({ ack, respond }) => {
  const start = Date.now();
  await ack();
  const latency = Date.now() - start;
  await respond({ text: `Pong!\nLatency: ${latency}ms` });
});


app.command("/soccer-premier", async ({ ack, respond }) => {
  await ack();

  try {
    const response = await footballApi.get("competitions/PL/matches?status=FINISHED");
    const matches = response.data.matches;

    if (!matches || matches.length === 0) {
      await respond({ text: "No recent finished matches found." });
      return;
    }

    const recentMatches = matches.slice(-5).reverse();

    let text = `*Premier League - Recent Match Results*\n\n`;
    recentMatches.forEach((m) => {
      const score = `${m.score.fullTime.home} - ${m.score.fullTime.away}`;
      const date = m.utcDate.split("T")[0];
      text += `• *${m.homeTeam.shortName || m.homeTeam.name}* ${score} *${m.awayTeam.shortName || m.awayTeam.name}* (${date})\n`;
    });

    await respond({ text });
  } catch (err) {
    console.error("Error in /soccer-premier:", err?.response?.data || err.message);
    await respond({ text: "Failed to fetch soccer scores." });
  }
});

app.command("/soccer-table", async ({ command, ack, respond }) => {
  await ack();
  const rawInput = command.text ? command.text.trim().toLowerCase() : "";

  const compCode = LEAGUE_MAP[rawInput] || (rawInput ? null : "PL");

  if (!compCode) {
    await respond({
      text: `Unknown league "*${command.text}*". Supported leagues:\n• \`/soccer-table prem\` (Premier League)\n• \`/soccer-table la liga\` (La Liga)\n• \`/soccer-table bundesliga\` (Bundesliga)\n• \`/soccer-table serie a\` (Serie A)\n• \`/soccer-table ligue 1\` (Ligue 1)`,
    });
    return;
  }

  try {
    const response = await footballApi.get(`competitions/${compCode}/standings`);
    const leagueName = response.data.competition.name;
    const standings = response.data.standings[0]?.table;

    if (!standings) {
      await respond({ text: `Standings data currently unavailable for ${leagueName}.` });
      return;
    }

    let text = `*${leagueName} Standings*\n\n`;
    text += `\`Pos  Team                   P    PTS   GD\`\n`;
    text += `\`----------------------------------------\`\n`;

    standings.slice(0, 10).forEach((row) => {
      const pos = String(row.position).padEnd(4, " ");
      const team = (row.team.shortName || row.team.name).padEnd(20, " ");
      const played = String(row.playedGames).padEnd(5, " ");
      const points = String(row.points).padEnd(5, " ");
      const gd = String(row.goalDifference);

      text += `\`${pos}${team}${played}${points}${gd}\`\n`;
    });

    text += `\n_Showing Top 10 teams._`;

    await respond({ text });
  } catch (err) {
    console.error("Error in /soccer-table:", err?.response?.data || err.message);
    await respond({ text: "Failed to fetch standings." });
  }
});

app.command("/soccer-team", async ({ command, ack, respond }) => {
  await ack();
  const query = command.text ? command.text.trim().toLowerCase() : "";

  if (!query) {
    await respond({
      text: "Please supply a team name! Example: `/soccer-team Barcelona` or `/soccer-team Arsenal`",
    });
    return;
  }

  try {
    let targetTeam = null;

    for (const compCode of ["PD", "PL", "CL", "BL1", "SA", "FL1"]) {
      try {
        const teamsRes = await footballApi.get(`competitions/${compCode}/teams`);
        const teams = teamsRes.data.teams || [];
        
        targetTeam = teams.find(
          (t) =>
            t.name.toLowerCase().includes(query) ||
            (t.shortName && t.shortName.toLowerCase().includes(query)) ||
            (t.tla && t.tla.toLowerCase() === query)
        );

        if (targetTeam) break;
      } catch (err) {

      }
    }

    if (!targetTeam) {
      const searchRes = await footballApi.get(`teams?name=${encodeURIComponent(query)}`);
      const searchTeams = searchRes.data.teams || [];

      targetTeam = searchTeams.find(
        (t) =>
          t.name.toLowerCase().includes(query) ||
          (t.shortName && t.shortName.toLowerCase().includes(query))
      ) || searchTeams[0];
    }

    if (!targetTeam) {
      await respond({ text: `Could not find any team matching "*${command.text}*".` });
      return;
    }

    const matchRes = await footballApi.get(`teams/${targetTeam.id}/matches`);
    const matches = matchRes.data.matches || [];

    if (matches.length === 0) {
      await respond({ text: `No matches found for *${targetTeam.name}*.` });
      return;
    }


    let text = `*Matches for ${targetTeam.name}:*\n\n`;
    matches.slice(-5).forEach((m) => {
      const status =
        m.status === "FINISHED"
          ? `${m.score.fullTime.home} - ${m.score.fullTime.away}`
          : "vs";
      const date = m.utcDate.split("T")[0];
      text += `• ${date}: *${m.homeTeam.shortName || m.homeTeam.name}* ${status} *${
        m.awayTeam.shortName || m.awayTeam.name
      }* (${m.competition.name})\n`;
    });

    await respond({ text });
  } catch (err) {
    console.error("Error in /soccer-team:", err?.response?.data || err.message);
    await respond({ text: "Failed to retrieve team data. Please try again." });
  }
});

(async () => {
  await app.start();
  console.log("Soccer Bot is online with dynamic tables and accurate team search!");
})();
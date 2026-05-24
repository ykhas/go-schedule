const TIME_ZONE = "America/Toronto";
const MAX_JOURNEY_COUNT = 12;

const DIRECTIONS = {
  u: {
    id: "u",
    title: "Union to Maple",
    origin: "Union Station GO",
    destination: "Maple GO",
    fromStopCode: "UN",
    toStopCode: "MP"
  },
  m: {
    id: "m",
    title: "Maple to Union",
    origin: "Maple GO",
    destination: "Union Station GO",
    fromStopCode: "MP",
    toStopCode: "UN"
  }
};

export default {
  async fetch(request, env) {
    if (request.method === "GET") {
      return new Response("GO Schedule Telegram bot is running.\n", {
        headers: { "content-type": "text/plain; charset=utf-8" }
      });
    }

    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    if (env.TELEGRAM_WEBHOOK_SECRET) {
      const actual = request.headers.get("x-telegram-bot-api-secret-token");
      if (actual !== env.TELEGRAM_WEBHOOK_SECRET) {
        return new Response("Unauthorized", { status: 401 });
      }
    }

    const update = await request.json();
    await handleUpdate(update, env);
    return new Response("OK");
  }
};

async function handleUpdate(update, env) {
  if (update.callback_query) {
    await handleCallback(update.callback_query, env);
    return;
  }

  const message = update.message;
  if (!message?.chat?.id) return;

  if (!isAllowedChat(message.chat.id, env)) {
    await sendMessage(env, message.chat.id, `This bot is private. Your chat ID is ${message.chat.id}.`);
    return;
  }

  const text = (message.text || "").trim();
  const parsed = parseCommand(text);

  if (!parsed) {
    await sendHelp(env, message.chat.id);
    return;
  }

  if (parsed.kind === "help") {
    await sendHelp(env, message.chat.id);
    return;
  }

  await sendSchedule(env, message.chat.id, parsed.direction, parsed.selectedAt);
}

async function handleCallback(callback, env) {
  const chatId = callback.message?.chat?.id;
  if (!chatId) return;

  if (!isAllowedChat(chatId, env)) {
    await answerCallback(env, callback.id, "This bot is private.");
    return;
  }

  const [action, directionId, selectedAtValue] = String(callback.data || "").split(":");
  const direction = DIRECTIONS[directionId];
  if (!direction || (action !== "now" && action !== "refresh")) {
    await answerCallback(env, callback.id, "Unknown action.");
    return;
  }

  await answerCallback(env, callback.id, action === "now" ? "Loading..." : "Refreshing...");
  const selectedAt = action === "now" ? new Date() : new Date(Number(selectedAtValue));
  if (Number.isNaN(selectedAt.getTime())) {
    await sendMessage(env, chatId, "That saved schedule time is invalid. Please choose a route again.");
    return;
  }

  await sendSchedule(env, chatId, direction, selectedAt);
}

function parseCommand(text) {
  if (!text || /^\/(?:start|help)(?:@\w+)?$/i.test(text)) {
    return { kind: "help" };
  }

  const match = text.match(/^\/(u|m)(?:@\w+)?(?:\s+(.+))?$/i);
  if (!match) return null;

  const direction = DIRECTIONS[match[1].toLowerCase()];
  const selectedAt = match[2] ? parseTorontoDateTime(match[2]) : new Date();
  if (!selectedAt) return { kind: "help" };

  return { kind: "schedule", direction, selectedAt };
}

async function sendHelp(env, chatId) {
  await sendMessage(env, chatId, "GO Schedule", {
    reply_markup: {
      inline_keyboard: [
        [{ text: "Union to Maple", callback_data: "now:u" }],
        [{ text: "Maple to Union", callback_data: "now:m" }]
      ]
    }
  });
}

async function sendSchedule(env, chatId, direction, selectedAt) {
  if (!env.GO_TRANSIT_API_KEY) {
    await sendMessage(env, chatId, "GO Transit API key is missing.");
    return;
  }

  try {
    const requestStart = new Date(selectedAt.getTime() - 30 * 60 * 1000);
    const response = await fetchJourney(env.GO_TRANSIT_API_KEY, direction, requestStart);

    if (response.Metadata?.ErrorCode !== "200") {
      await sendMessage(env, chatId, response.Metadata?.ErrorMessage || "Could not load the schedule.");
      return;
    }

    const trips = scheduledTrips(response);
    await sendMessage(env, chatId, formatSchedule(direction, requestStart, trips), {
      reply_markup: {
        inline_keyboard: [
          [{ text: "Refresh same time", callback_data: `refresh:${direction.id}:${selectedAt.getTime()}` }],
          [
            { text: "Union to Maple now", callback_data: "now:u" },
            { text: "Maple to Union now", callback_data: "now:m" }
          ]
        ]
      }
    });
  } catch {
    await sendMessage(env, chatId, "Could not load today's schedule.");
  }
}

async function fetchJourney(apiKey, direction, requestStart) {
  const date = formatTorontoParts(requestStart, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
  const time = formatTorontoParts(requestStart, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    hourCycle: "h23"
  });

  const apiDate = `${date.year}${date.month}${date.day}`;
  const apiStartTime = `${time.hour}${time.minute}`;
  const path = `/OpenDataAPI/api/V1/Schedule/Journey/${apiDate}/${direction.fromStopCode}/${direction.toStopCode}/${apiStartTime}/${MAX_JOURNEY_COUNT}`;
  const url = new URL(`https://api.openmetrolinx.com${path}`);
  url.searchParams.set("key", apiKey);

  const response = await fetch(url);
  if (!response.ok) throw new Error(`GO API returned ${response.status}`);
  return response.json();
}

function scheduledTrips(response) {
  return (response.SchJourneys || [])
    .flatMap((journey) => journey.Services || [])
    .map((service, index) => {
      const primaryTrip = service.Trips?.Trip?.[0];
      return {
        id: service.tripHash || `${service.StartSortTime || ""}-${service.EndSortTime || ""}-${index}`,
        departureDisplay: displayTime(service.StartTime),
        arrivalDisplay: displayTime(service.EndTime),
        durationMinutes: durationMinutes(service.Duration),
        route: service.Code,
        routeName: primaryTrip?.Line || service.Code,
        mode: primaryTrip?.Type === "T" ? "Train" : "Bus",
        headsign: primaryTrip?.Display || service.Direction,
        transferCount: service.transferCount || 0
      };
    });
}

function formatSchedule(direction, requestStart, trips) {
  const lines = [
    `${direction.title}`,
    `${direction.origin} -> ${direction.destination}`,
    `Starting from ${formatTorontoDisplay(requestStart)}`,
    ""
  ];

  if (trips.length === 0) {
    lines.push("No trips found.");
    return lines.join("\n");
  }

  for (const trip of trips.slice(0, MAX_JOURNEY_COUNT)) {
    const transfers = trip.transferCount > 0
      ? `, ${trip.transferCount} transfer${trip.transferCount === 1 ? "" : "s"}`
      : "";
    lines.push(`${trip.departureDisplay} -> ${trip.arrivalDisplay} | ${trip.mode} ${trip.route} | ${trip.durationMinutes} min${transfers}`);
  }

  return lines.join("\n");
}

function displayTime(value) {
  const rawTime = String(value || "").split(" ").at(-1);
  const parts = rawTime.split(":").map((part) => Number.parseInt(part, 10));
  if (parts.length < 2 || parts.some(Number.isNaN)) return value || "";

  const [hour, minute] = parts;
  const suffix = hour < 12 ? "AM" : "PM";
  const displayHour = hour % 12 === 0 ? 12 : hour % 12;
  return `${displayHour}:${String(minute).padStart(2, "0")} ${suffix}`;
}

function durationMinutes(value) {
  const parts = String(value || "").split(":").map((part) => Number.parseInt(part, 10));
  if (parts.length !== 3 || parts.some(Number.isNaN)) return 0;
  return parts[0] * 60 + parts[1] + (parts[2] > 0 ? 1 : 0);
}

function parseTorontoDateTime(value) {
  const match = String(value).trim().match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})$/);
  if (!match) return null;

  const [, year, month, day, hour, minute] = match.map(Number);
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59) return null;

  const utcGuess = Date.UTC(year, month - 1, day, hour, minute);
  const offsetMinutes = torontoOffsetMinutes(new Date(utcGuess));
  return new Date(utcGuess - offsetMinutes * 60 * 1000);
}

function torontoOffsetMinutes(date) {
  const parts = formatTorontoParts(date, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    hourCycle: "h23"
  });
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second)
  );
  return (asUtc - date.getTime()) / 60000;
}

function formatTorontoDisplay(date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(date);
}

function formatTorontoParts(date, options) {
  return Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE, ...options })
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value])
  );
}

function isAllowedChat(chatId, env) {
  if (!env.ALLOWED_CHAT_IDS) return true;
  return env.ALLOWED_CHAT_IDS.split(",")
    .map((id) => id.trim())
    .filter(Boolean)
    .includes(String(chatId));
}

async function sendMessage(env, chatId, text, extra = {}) {
  return telegram(env, "sendMessage", {
    chat_id: chatId,
    text,
    disable_web_page_preview: true,
    ...extra
  });
}

async function answerCallback(env, callbackQueryId, text) {
  return telegram(env, "answerCallbackQuery", {
    callback_query_id: callbackQueryId,
    text
  });
}

async function telegram(env, method, payload) {
  const response = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!response.ok) throw new Error(`Telegram ${method} failed with ${response.status}`);
  return response.json();
}

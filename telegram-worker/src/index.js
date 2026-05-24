const TIME_ZONE = "America/Toronto";
const MAX_JOURNEY_COUNT = 12;
const MAX_REQUEST_BYTES = 64 * 1024;
const DATE_TIME_PROMPT_PREFIX = "Reply with a date/time for";

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

    const missingSecret = requiredSecrets(env).find((name) => !env[name]);
    if (missingSecret) {
      return new Response(`Missing required secret: ${missingSecret}`, { status: 500 });
    }
    if (env.REQUIRE_DAILY_RATE_LIMIT !== "false") {
      if (!dailyRequestLimit(env)) {
        return new Response("Missing or invalid variable: DAILY_REQUEST_LIMIT", { status: 500 });
      }
      if (!env.RATE_LIMIT_KV) {
        return new Response("Missing required binding: RATE_LIMIT_KV", { status: 500 });
      }
    }

    const actual = request.headers.get("x-telegram-bot-api-secret-token");
    if (actual !== env.TELEGRAM_WEBHOOK_SECRET) {
      return new Response("Unauthorized", { status: 401 });
    }

    if (!isJsonRequest(request)) {
      return new Response("Unsupported media type", { status: 415 });
    }

    const contentLength = Number(request.headers.get("content-length") || "0");
    if (contentLength > MAX_REQUEST_BYTES) {
      return new Response("Payload too large", { status: 413 });
    }

    let update;
    try {
      update = await request.json();
    } catch {
      return new Response("Bad request", { status: 400 });
    }

    if (!(await consumeDailyRequest(env))) {
      return new Response("OK");
    }

    await handleUpdate(update, env);
    return new Response("OK");
  }
};

function requiredSecrets(env) {
  const secrets = ["GO_TRANSIT_API_KEY", "TELEGRAM_BOT_TOKEN", "TELEGRAM_WEBHOOK_SECRET"];
  return secrets;
}

function isJsonRequest(request) {
  const contentType = request.headers.get("content-type") || "";
  return contentType.toLowerCase().includes("application/json");
}

async function consumeDailyRequest(env) {
  if (!env.RATE_LIMIT_KV && env.REQUIRE_DAILY_RATE_LIMIT === "false") return true;

  const limit = dailyRequestLimit(env);
  const key = `daily:${torontoDateKey(new Date())}`;
  const current = Number.parseInt(await env.RATE_LIMIT_KV.get(key) || "0", 10);
  if (current >= limit) return false;

  await env.RATE_LIMIT_KV.put(key, String(current + 1), { expirationTtl: 3 * 24 * 60 * 60 });
  return true;
}

function dailyRequestLimit(env) {
  const configured = Number.parseInt(env.DAILY_REQUEST_LIMIT || "", 10);
  return Number.isFinite(configured) && configured > 0 ? configured : null;
}

function torontoDateKey(date) {
  const parts = formatTorontoParts(date, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
  return `${parts.year}-${parts.month}-${parts.day}`;
}

async function handleUpdate(update, env) {
  if (update.callback_query) {
    await handleCallback(update.callback_query, env);
    return;
  }

  const message = update.message;
  if (!message?.chat?.id) return;

  if (!isAllowedChat(message.chat.id, env)) {
    return;
  }

  const text = (message.text || "").trim();
  const replyParsed = parseDateTimeReply(message, text);
  if (replyParsed) {
    if (replyParsed.kind === "invalid_time") {
      await sendInvalidDateTime(env, message.chat.id, replyParsed.direction);
      return;
    }

    await sendSchedule(env, message.chat.id, replyParsed.direction, replyParsed.selectedAt);
    return;
  }

  const parsed = parseCommand(text);

  if (!parsed) {
    await sendHelp(env, message.chat.id);
    return;
  }

  if (parsed.kind === "help") {
    await sendHelp(env, message.chat.id);
    return;
  }

  if (parsed.kind === "invalid_time") {
    await sendInvalidDateTime(env, message.chat.id, parsed.direction);
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
  if (!direction || (action !== "now" && action !== "refresh" && action !== "pick")) {
    await answerCallback(env, callback.id, "Unknown action.");
    return;
  }

  if (action === "pick") {
    await answerCallback(env, callback.id, "Reply with the time.");
    await sendDateTimePrompt(env, chatId, direction);
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
  if (!selectedAt) return { kind: "invalid_time", direction };

  return { kind: "schedule", direction, selectedAt };
}

async function sendHelp(env, chatId) {
  await sendMessage(env, chatId, [
    "GO Schedule",
    "",
    "Choose a route for the next trips, or use Pick date/time.",
    "",
    "You can also send:",
    "/u",
    "/m",
    "/u today 5pm",
    "/m tomorrow 7:30am",
    "/u 2026-05-25 10:00"
  ].join("\n"), {
    reply_markup: {
      inline_keyboard: [
        [
          { text: "Union to Maple now", callback_data: "now:u" },
          { text: "Pick date/time", callback_data: "pick:u" }
        ],
        [
          { text: "Maple to Union now", callback_data: "now:m" },
          { text: "Pick date/time", callback_data: "pick:m" }
        ]
      ]
    }
  });
}

async function sendDateTimePrompt(env, chatId, direction) {
  await sendMessage(env, chatId, [
    `${DATE_TIME_PROMPT_PREFIX} ${direction.title}.`,
    "",
    "Examples: now, today 5pm, tomorrow 7:30am, May 25 8:15am, 2026-05-25 10:00"
  ].join("\n"), {
    reply_markup: {
      force_reply: true,
      input_field_placeholder: "today 5pm"
    }
  });
}

async function sendInvalidDateTime(env, chatId, direction) {
  await sendMessage(env, chatId, [
    "I could not read that date/time.",
    "",
    "Try: now, today 5pm, tomorrow 7:30am, May 25 8:15am, or 2026-05-25 10:00."
  ].join("\n"), {
    reply_markup: direction ? {
      inline_keyboard: [
        [{ text: `Pick ${direction.title} again`, callback_data: `pick:${direction.id}` }]
      ]
    } : undefined
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
      await sendMessage(env, chatId, "Could not load the schedule.");
      return;
    }

    const trips = scheduledTrips(response);
    await sendMessage(env, chatId, formatSchedule(direction, selectedAt, requestStart, trips), {
      reply_markup: {
        inline_keyboard: [
          [{ text: "Refresh same time", callback_data: `refresh:${direction.id}:${selectedAt.getTime()}` }],
          [{ text: `Pick another time for ${direction.title}`, callback_data: `pick:${direction.id}` }],
          [
            { text: "Union to Maple now", callback_data: "now:u" },
            { text: "Maple to Union now", callback_data: "now:m" }
          ]
        ]
      }
    });
  } catch {
    await sendMessage(env, chatId, "Could not load the schedule.");
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

function formatSchedule(direction, selectedAt, requestStart, trips) {
  const lines = [
    `${direction.title}`,
    `${direction.origin} -> ${direction.destination}`,
    `Requested for ${formatTorontoDisplay(selectedAt)}`,
    `Searching from ${formatTorontoDisplay(requestStart)}`,
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

function parseDateTimeReply(message, text) {
  const replyText = message.reply_to_message?.text || "";
  if (!replyText.startsWith(DATE_TIME_PROMPT_PREFIX)) return null;

  const direction = Object.values(DIRECTIONS).find((item) => replyText.includes(item.title));
  if (!direction) return null;

  const selectedAt = parseTorontoDateTime(text);
  if (!selectedAt) return { kind: "invalid_time", direction };

  return { kind: "schedule", direction, selectedAt };
}

function parseTorontoDateTime(value, baseDate = new Date()) {
  const raw = String(value || "").trim().replace(/\s+/g, " ");
  if (!raw) return null;
  if (/^now$/i.test(raw)) return new Date();

  const isoMatch = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T]+(.+))?$/);
  if (isoMatch) {
    const time = isoMatch[4] ? parseTimeOfDay(isoMatch[4]) : { hour: 0, minute: 0 };
    if (!time) return null;
    return dateFromTorontoParts(Number(isoMatch[1]), Number(isoMatch[2]), Number(isoMatch[3]), time.hour, time.minute);
  }

  const relativeMatch = raw.match(/^(today|tomorrow)(?:\s+(.+))?$/i);
  if (relativeMatch) {
    const date = addTorontoDays(baseDate, relativeMatch[1].toLowerCase() === "tomorrow" ? 1 : 0);
    const time = relativeMatch[2] ? parseTimeOfDay(relativeMatch[2]) : { hour: 0, minute: 0 };
    if (!time) return null;
    return dateFromTorontoParts(date.year, date.month, date.day, time.hour, time.minute);
  }

  const monthMatch = raw.match(/^([a-z]+)\s+(\d{1,2})(?:,?\s+(\d{4}))?(?:\s+(.+))?$/i);
  if (monthMatch) {
    const month = monthNumber(monthMatch[1]);
    if (!month) return null;
    const base = torontoDateParts(baseDate);
    const year = monthMatch[3] ? Number(monthMatch[3]) : base.year;
    const time = monthMatch[4] ? parseTimeOfDay(monthMatch[4]) : { hour: 0, minute: 0 };
    if (!time) return null;
    return dateFromTorontoParts(year, month, Number(monthMatch[2]), time.hour, time.minute);
  }

  const timeOnly = parseTimeOfDay(raw);
  if (timeOnly) {
    const date = torontoDateParts(baseDate);
    return dateFromTorontoParts(date.year, date.month, date.day, timeOnly.hour, timeOnly.minute);
  }

  return null;
}

function parseTimeOfDay(value) {
  const match = String(value || "").trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i);
  if (!match) return null;

  let hour = Number(match[1]);
  const minute = match[2] ? Number(match[2]) : 0;
  const meridiem = match[3]?.toLowerCase();

  if (minute > 59) return null;
  if (meridiem) {
    if (hour < 1 || hour > 12) return null;
    if (meridiem === "am") hour = hour === 12 ? 0 : hour;
    if (meridiem === "pm") hour = hour === 12 ? 12 : hour + 12;
  } else if (hour > 23) {
    return null;
  }

  return { hour, minute };
}

function dateFromTorontoParts(year, month, day, hour, minute) {
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59) return null;

  const utcGuess = Date.UTC(year, month - 1, day, hour, minute);
  const offsetMinutes = torontoOffsetMinutes(new Date(utcGuess));
  const date = new Date(utcGuess - offsetMinutes * 60 * 1000);
  const parts = formatTorontoParts(date, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    hourCycle: "h23"
  });

  if (
    Number(parts.year) !== year ||
    Number(parts.month) !== month ||
    Number(parts.day) !== day ||
    Number(parts.hour) !== hour ||
    Number(parts.minute) !== minute
  ) {
    return null;
  }

  return date;
}

function addTorontoDays(date, days) {
  const parts = torontoDateParts(date);
  const nextNoon = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days, 12, 0));
  return torontoDateParts(nextNoon);
}

function torontoDateParts(date) {
  const parts = formatTorontoParts(date, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day)
  };
}

function monthNumber(value) {
  const key = String(value || "").slice(0, 3).toLowerCase();
  return {
    jan: 1,
    feb: 2,
    mar: 3,
    apr: 4,
    may: 5,
    jun: 6,
    jul: 7,
    aug: 8,
    sep: 9,
    oct: 10,
    nov: 11,
    dec: 12
  }[key] || null;
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

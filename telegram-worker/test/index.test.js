import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import worker from "../src/index.js";

const ORIGINAL_FETCH = globalThis.fetch;

beforeEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
});

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
});

test("command date/time requests fetch a schedule for the selected Toronto time", async () => {
  const harness = createHarness();

  await harness.postTelegramUpdate({
    message: {
      chat: { id: 123 },
      text: "/u 2026-05-25 17:00"
    }
  });

  assert.equal(harness.goUrls.length, 1);
  assert.match(
    harness.goUrls[0].pathname,
    /\/OpenDataAPI\/api\/V1\/Schedule\/Journey\/20260525\/UN\/MP\/1630\/12$/
  );

  const schedule = harness.telegramMessages.find((message) => message.text.includes("Union to Maple"));
  assert.ok(schedule);
  assert.match(schedule.text, /Requested for May 25, 2026, 5:00 p\.m\./);
  assert.match(schedule.text, /Searching from May 25, 2026, 4:30 p\.m\./);
  assert.match(schedule.text, /5:02 PM -> 5:45 PM \| Train 61 \| 43 min/);
});

test("pick date/time callback sends a ForceReply prompt", async () => {
  const harness = createHarness();

  await harness.postTelegramUpdate({
    callback_query: {
      id: "callback-1",
      data: "pick:m",
      message: { chat: { id: 123 } }
    }
  });

  assert.deepEqual(harness.callbackAnswers, ["Reply with the time."]);
  assert.equal(harness.telegramMessages.length, 1);
  assert.match(harness.telegramMessages[0].text, /Reply with a date\/time for Maple to Union\./);
  assert.deepEqual(harness.telegramMessages[0].reply_markup, {
    force_reply: true,
    input_field_placeholder: "today 5pm"
  });
});

test("date/time replies are routed without storing chat state", async () => {
  const harness = createHarness();

  await harness.postTelegramUpdate({
    message: {
      chat: { id: 123 },
      text: "May 25 8:15am",
      reply_to_message: {
        text: [
          "Reply with a date/time for Maple to Union.",
          "",
          "Examples: now, today 5pm, tomorrow 7:30am, May 25 8:15am, 2026-05-25 10:00"
        ].join("\n")
      }
    }
  });

  assert.equal(harness.goUrls.length, 1);
  assert.match(
    harness.goUrls[0].pathname,
    /\/OpenDataAPI\/api\/V1\/Schedule\/Journey\/20260525\/MP\/UN\/0745\/12$/
  );

  const schedule = harness.telegramMessages.find((message) => message.text.includes("Maple to Union"));
  assert.ok(schedule);
  assert.match(schedule.text, /Requested for May 25, 2026, 8:15 a\.m\./);
  assert.match(schedule.text, /Searching from May 25, 2026, 7:45 a\.m\./);
});

test("invalid command date/time gives a retry button for the same route", async () => {
  const harness = createHarness();

  await harness.postTelegramUpdate({
    message: {
      chat: { id: 123 },
      text: "/m not-a-time"
    }
  });

  assert.equal(harness.goUrls.length, 0);
  assert.equal(harness.telegramMessages.length, 1);
  assert.match(harness.telegramMessages[0].text, /I could not read that date\/time\./);
  assert.deepEqual(harness.telegramMessages[0].reply_markup, {
    inline_keyboard: [
      [{ text: "Pick Maple to Union again", callback_data: "pick:m" }]
    ]
  });
});

test("start/help keeps now as the default route action", async () => {
  const harness = createHarness();

  await harness.postTelegramUpdate({
    message: {
      chat: { id: 123 },
      text: "/start"
    }
  });

  assert.equal(harness.telegramMessages.length, 1);
  assert.match(harness.telegramMessages[0].text, /GO Schedule/);
  assert.deepEqual(harness.telegramMessages[0].reply_markup.inline_keyboard, [
    [
      { text: "Union to Maple now", callback_data: "now:u" },
      { text: "Pick date/time", callback_data: "pick:u" }
    ],
    [
      { text: "Maple to Union now", callback_data: "now:m" },
      { text: "Pick date/time", callback_data: "pick:m" }
    ]
  ]);
});

test("daily request limit is required when rate limiting is enabled", async () => {
  const response = await worker.fetch(new Request("https://example.test", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-telegram-bot-api-secret-token": "webhook-secret"
    },
    body: JSON.stringify({ message: { chat: { id: 123 }, text: "/start" } })
  }), {
    GO_TRANSIT_API_KEY: "go-key",
    TELEGRAM_BOT_TOKEN: "bot-token",
    TELEGRAM_WEBHOOK_SECRET: "webhook-secret",
    RATE_LIMIT_KV: createMemoryKv()
  });

  assert.equal(response.status, 500);
  assert.equal(await response.text(), "Missing or invalid variable: DAILY_REQUEST_LIMIT");
});

test("daily request limit comes from the configured worker variable", async () => {
  const harness = createHarness({
    env: {
      DAILY_REQUEST_LIMIT: "1",
      REQUIRE_DAILY_RATE_LIMIT: "true",
      RATE_LIMIT_KV: createMemoryKv()
    }
  });

  await harness.postTelegramUpdate({
    message: {
      chat: { id: 123 },
      text: "/u 2026-05-25 17:00"
    }
  });
  await harness.postTelegramUpdate({
    message: {
      chat: { id: 123 },
      text: "/u 2026-05-25 17:00"
    }
  });

  assert.equal(harness.goUrls.length, 1);
});

function createHarness(options = {}) {
  const telegramMessages = [];
  const callbackAnswers = [];
  const goUrls = [];
  const env = {
    GO_TRANSIT_API_KEY: "go-key",
    TELEGRAM_BOT_TOKEN: "bot-token",
    TELEGRAM_WEBHOOK_SECRET: "webhook-secret",
    REQUIRE_DAILY_RATE_LIMIT: "false",
    ...options.env
  };

  globalThis.fetch = async (url, init = {}) => {
    const parsedUrl = new URL(String(url));

    if (parsedUrl.hostname === "api.telegram.org") {
      const payload = JSON.parse(init.body);
      if (parsedUrl.pathname.endsWith("/sendMessage")) {
        telegramMessages.push(payload);
      } else if (parsedUrl.pathname.endsWith("/answerCallbackQuery")) {
        callbackAnswers.push(payload.text);
      } else {
        throw new Error(`Unexpected Telegram method: ${parsedUrl.pathname}`);
      }

      return Response.json({ ok: true, result: {} });
    }

    if (parsedUrl.hostname === "api.openmetrolinx.com") {
      goUrls.push(parsedUrl);
      return Response.json({
        Metadata: { ErrorCode: "200" },
        SchJourneys: [
          {
            Services: [
              {
                tripHash: "trip-1",
                StartTime: "2026-05-25 17:02:00",
                EndTime: "2026-05-25 17:45:00",
                Duration: "00:43:00",
                Code: "61",
                Direction: "Eastbound",
                transferCount: 0,
                Trips: { Trip: [{ Type: "T", Line: "Richmond Hill" }] }
              }
            ]
          }
        ]
      });
    }

    throw new Error(`Unexpected fetch: ${url}`);
  };

  return {
    callbackAnswers,
    goUrls,
    telegramMessages,
    async postTelegramUpdate(update) {
      const response = await worker.fetch(new Request("https://example.test", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-telegram-bot-api-secret-token": "webhook-secret"
        },
        body: JSON.stringify(update)
      }), env);

      assert.equal(response.status, 200);
      assert.equal(await response.text(), "OK");
    }
  };
}

function createMemoryKv() {
  const values = new Map();
  return {
    async get(key) {
      return values.get(key) || null;
    },
    async put(key, value) {
      values.set(key, value);
    }
  };
}

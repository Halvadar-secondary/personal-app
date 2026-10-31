import { randomUUID } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import { Pool } from "pg";
import { isPhone, uniqueName } from "./helpers/app";
import { loginWithPassword } from "./helpers/login";

// No model is called: /api/chat is answered from a script.

const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];
const MODEL = "claude-haiku-5-5";
const TOOL = "toolu_e2e_guitar";

test.beforeEach(async ({ page }) => {
  await loginWithPassword(
    page,
    process.env.E2E_OWNER_EMAIL!,
    process.env.E2E_OWNER_PASSWORD!,
  );
});

/** The turn for "Add guitar area": a word, the tool line, the reply. */
function script(conversationId: string, title: string, batchId: string) {
  return [
    { type: "conversation", id: conversationId, title, model: MODEL },
    { type: "text", delta: "Adding " },
    { type: "text", delta: "it." },
    {
      type: "tool",
      id: TOOL,
      name: "create_area",
      summary: "Created area “Guitar”",
      batchId,
      error: false,
    },
    { type: "text", delta: "Added your Guitar area." },
    { type: "done", model: MODEL, changed: true },
  ]
    .map((e) => JSON.stringify(e))
    .join("\n");
}

async function answerFromScript(page: Page, body: string) {
  const posts: unknown[] = [];
  await page.route("**/api/chat", async (route) => {
    posts.push(route.request().postDataJSON());
    await route.fulfill({
      contentType: "application/x-ndjson",
      body: `${body}\n`,
    });
  });
  return posts;
}

async function openChat(page: Page) {
  // The button renders before the page hydrates; retry until the panel opens.
  await expect(async () => {
    await page.getByRole("button", { name: "Ask Claude" }).click();
    await expect(page.getByRole("dialog", { name: "Claude" })).toBeVisible({
      timeout: 1000,
    });
  }).toPass();
  return page.getByRole("dialog", { name: "Claude" });
}

async function expectTurn(panel: ReturnType<Page["getByRole"]>) {
  await expect(
    panel.getByText("Add guitar area", { exact: true }),
  ).toBeVisible();
  await expect(panel.getByText("Adding it.")).toBeVisible();
  const line = panel.getByRole("listitem").filter({
    hasText: "Created area “Guitar”",
  });
  await expect(line.getByRole("button", { name: "Undo" })).toBeVisible();
  await expect(panel.getByText("Added your Guitar area.")).toBeVisible();
  await expect(panel.getByText("Claude Haiku 5.5").first()).toBeVisible();
}

test("ask Claude: the reply streams in with an Undo line", async ({ page }) => {
  const posts = await answerFromScript(
    page,
    script(randomUUID(), "Add guitar area", randomUUID()),
  );
  await page.goto("/today");
  const panel = await openChat(page);
  await expect(
    panel.getByRole("button", { name: "Plan my day" }),
  ).toBeVisible();

  const { violations } = await new AxeBuilder({ page })
    .include('[role="dialog"]')
    .withTags(TAGS)
    .analyze();
  expect(
    violations.map((v) => ({
      id: v.id,
      nodes: v.nodes.map((n) => n.target.join(" ")),
    })),
  ).toEqual([]);

  await panel
    .getByRole("textbox", { name: "Message Claude" })
    .fill("Add guitar area");
  await panel.getByRole("button", { name: "Send" }).click();
  await expectTurn(panel);
  expect(posts).toEqual([{ tier: "quick", text: "Add guitar area" }]);
});

test("a past conversation reopens with the same items", async ({
  page,
}, testInfo) => {
  test.skip(isPhone(testInfo), "one reopen run is enough");
  // The script doesn't store anything, so the stored side is written here.
  // That needs the database, which only a local run has.
  test.skip(
    !process.env.DATABASE_URL,
    "needs DATABASE_URL to store the scripted conversation",
  );
  const title = uniqueName("Add guitar area");
  const batchId = randomUUID();
  const id = await storeConversation(title, batchId);
  try {
    await answerFromScript(page, script(id, title, batchId));
    await page.goto("/today");
    let panel = await openChat(page);
    await panel
      .getByRole("textbox", { name: "Message Claude" })
      .fill("Add guitar area");
    await panel.getByRole("button", { name: "Send" }).click();
    await expectTurn(panel);

    await page.reload();
    panel = await openChat(page);
    await expect(panel.getByText("Adding it.")).toHaveCount(0);
    await panel.getByRole("button", { name: "Conversations" }).click();
    await panel.getByRole("button", { name: new RegExp(`^${title}`) }).click();
    await expectTurn(panel);
  } finally {
    await removeConversation(id);
  }
});

function pool() {
  return new Pool({ connectionString: process.env.DATABASE_URL });
}

/** What the engine stores for the scripted turn. */
async function storeConversation(
  title: string,
  batchId: string,
): Promise<string> {
  const db = pool();
  try {
    const owner = await db.query<{ id: string }>(
      `select id from "user" where email = $1`,
      [process.env.E2E_OWNER_EMAIL!.trim().toLowerCase()],
    );
    const ownerId = owner.rows[0]!.id;
    const c = await db.query<{ id: string }>(
      `insert into conversations (owner_id, title, model) values ($1, $2, $3) returning id`,
      [ownerId, title, MODEL],
    );
    const id = c.rows[0]!.id;
    const messages: [string, unknown, string | null, unknown][] = [
      ["user", [{ type: "text", text: "Add guitar area" }], null, null],
      [
        "assistant",
        [
          { type: "text", text: "Adding it." },
          { type: "tool_use", id: TOOL, name: "create_area", input: {} },
        ],
        MODEL,
        null,
      ],
      [
        "user",
        [{ type: "tool_result", tool_use_id: TOOL, content: "ok" }],
        null,
        { tools: { [TOOL]: { summary: "Created area “Guitar”", batchId } } },
      ],
      [
        "assistant",
        [{ type: "text", text: "Added your Guitar area." }],
        MODEL,
        null,
      ],
    ];
    for (const [seq, [role, content, model, meta]] of messages.entries())
      await db.query(
        `insert into chat_messages (conversation_id, owner_id, seq, role, content, model, meta)
         values ($1, $2, $3, $4, $5, $6, $7)`,
        [
          id,
          ownerId,
          seq,
          role,
          JSON.stringify(content),
          model,
          meta && JSON.stringify(meta),
        ],
      );
    return id;
  } finally {
    await db.end();
  }
}

async function removeConversation(id: string) {
  const db = pool();
  try {
    await db.query(`delete from conversations where id = $1`, [id]);
  } finally {
    await db.end();
  }
}

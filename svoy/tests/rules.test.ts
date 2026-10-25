// Запуск: npm run test:rules  (поднимает эмуляторы Firebase и выполняет проверки)
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";

let env: RulesTestEnvironment;
const tok = { email_verified: true };
const A = () => env.authenticatedContext("alice", tok).database();
const B = () => env.authenticatedContext("bob", tok).database();
const C = () => env.authenticatedContext("carol", tok).database();   // посторонний
const ANON = () => env.unauthenticatedContext().database();

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-svoy",
    database: { rules: readFileSync("database.rules.json", "utf8") },
    storage: { rules: readFileSync("storage.rules", "utf8") },
  });
});
afterAll(() => env.cleanup());
beforeEach(async () => {
  await env.clearDatabase();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const d = ctx.database();
    await d.ref("chats/alice_bob").set({ type: "direct", createdBy: "alice", createdAt: 1, members: { alice: "owner", bob: "member" } });
    await d.ref("messages/alice_bob/m1").set({ from: "alice", ts: 1, text: "секрет" });
    await d.ref("users/alice").set({ username: "alice", displayName: "Alice", createdAt: 1 });
    await d.ref("usernames/alice").set("alice");
  });
});

describe("переписка", () => {
  it("участник читает сообщения", () => assertSucceeds(B().ref("messages/alice_bob").get()));
  it("посторонний НЕ читает чужую переписку", () => assertFails(C().ref("messages/alice_bob").get()));
  it("посторонний НЕ читает метаданные чата", () => assertFails(C().ref("chats/alice_bob").get()));
  it("неавторизованный НЕ читает ничего", () => assertFails(ANON().ref("messages/alice_bob").get()));
  it("участник пишет от своего имени", () =>
    assertSucceeds(B().ref("messages/alice_bob/m2").set({ from: "bob", ts: { ".sv": "timestamp" }, text: "привет" })));
  it("нельзя писать от чужого имени", () =>
    assertFails(B().ref("messages/alice_bob/m3").set({ from: "alice", ts: { ".sv": "timestamp" }, text: "подделка" })));
  it("посторонний НЕ пишет в чужой чат", () =>
    assertFails(C().ref("messages/alice_bob/m4").set({ from: "carol", ts: { ".sv": "timestamp" }, text: "спам" })));
  it("нельзя изменить чужое сообщение", () => assertFails(B().ref("messages/alice_bob/m1/text").set("взлом")));
  it("посторонний НЕ может добавить себя в чат", () => assertFails(C().ref("chats/alice_bob/members/carol").set("member")));
  it("слишком длинное сообщение отклоняется", () =>
    assertFails(A().ref("messages/alice_bob/m5").set({ from: "alice", ts: { ".sv": "timestamp" }, text: "x".repeat(4001) })));
  it("посторонний НЕ читает непрочитанные/список чатов", () => assertFails(C().ref("userChats/alice").get()));
});

describe("профили и роли", () => {
  it("свой профиль можно создать", () =>
    assertSucceeds(B().ref("users/bob").set({ username: "bob", displayName: "Bob", createdAt: { ".sv": "timestamp" } })));
  it("чужой профиль менять нельзя", () => assertFails(B().ref("users/alice/displayName").set("Взломан")));
  it("нельзя записать role: admin в профиль", () =>
    assertFails(B().ref("users/bob").set({ username: "bob", displayName: "Bob", createdAt: 1, role: "admin" })));
  it("занятое имя пользователя угнать нельзя", () => assertFails(B().ref("usernames/alice").set("bob")));
  it("свободное имя можно занять", () => assertSucceeds(B().ref("usernames/bob").set("bob")));
  it("без подтверждённой почты запись запрещена", () =>
    assertFails(env.authenticatedContext("dave", { email_verified: false }).database()
      .ref("users/dave").set({ username: "dave", displayName: "Dave", createdAt: 1 })));
});

describe("присутствие и звонки", () => {
  it("своё присутствие писать можно", () => assertSucceeds(A().ref("presence/alice/connections/c1").set(1)));
  it("чужое присутствие подделать нельзя", () => assertFails(B().ref("presence/alice/connections/c1").set(1)));
  it("посторонний не читает чужой звонок", async () => {
    await env.withSecurityRulesDisabled((ctx) => ctx.database().ref("calls/c1").set({ caller: "alice", callee: "bob", chatId: "alice_bob", type: "audio", status: "ringing" }));
    await assertFails(C().ref("calls/c1").get());
    await assertSucceeds(B().ref("calls/c1").get());
  });
  it("нельзя звонить тому, кто не в вашем чате", () =>
    assertFails(A().ref("calls/c2").set({ caller: "alice", callee: "carol", chatId: "alice_bob", type: "audio", status: "ringing" })));
});

describe("Storage", () => {
  const png = new Uint8Array([1, 2, 3]);
  it("аватар в свою папку — можно", () =>
    assertSucceeds(env.authenticatedContext("alice", tok).storage().ref("avatars/alice/avatar").put(png, { contentType: "image/png" })));
  it("аватар в чужую папку — нельзя", () =>
    assertFails(env.authenticatedContext("bob", tok).storage().ref("avatars/alice/avatar").put(png, { contentType: "image/png" })));
  it("исполняемый файл как аватар — нельзя", () =>
    assertFails(env.authenticatedContext("alice", tok).storage().ref("avatars/alice/avatar").put(png, { contentType: "application/x-msdownload" })));
});

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getGuide, getGeneratedGuide, listGeneratedGuides, saveGuide, storageMode } from "./store";
import { SEED_GUIDES } from "./seed-guides";

// Local-file store round trip using a synthetic fixture in a temp dir (not a real research result).
describe("local store", () => {
  const original = process.cwd();
  let tmp = "";
  beforeAll(() => {
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.VERCEL;
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "launchpad-"));
    process.chdir(tmp);
  });
  afterAll(() => {
    process.chdir(original);
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("saves, reads back, lists and upserts a generated guide", async () => {
    expect(storageMode()).toBe("local-file");
    const g = { ...structuredClone(SEED_GUIDES[0]), kind: "generated" as const, slug: "fixture-abc123" };
    await saveGuide(g);
    expect((await getGeneratedGuide("fixture-abc123"))?.slug).toBe("fixture-abc123");
    expect((await getGuide("fixture-abc123"))?.kind).toBe("generated");
    expect(await listGeneratedGuides()).toHaveLength(1);
    await saveGuide({ ...g, appName: "Changed" });
    const list = await listGeneratedGuides();
    expect(list).toHaveLength(1);
    expect(list[0].appName).toBe("Changed");
    expect(await getGuide("missing-slug")).toBeNull();
  });

  it("serves seeded guides first", async () => {
    expect((await getGuide("slack-oauth-v2"))?.kind).toBe("curated");
  });
});

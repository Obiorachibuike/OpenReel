const { chromium } = require("playwright-core");
const binary = process.env.CHROMIUM_PATH
  ? {
      args: ["--no-sandbox"],
      executablePath: async () => process.env.CHROMIUM_PATH,
    }
  : require("@sparticuz/chromium").default;
(async () => {
  const browser = await chromium.launch({
    args: binary.args,
    executablePath: await binary.executablePath(),
    headless: true,
  });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1050 },
  });
  page.on("response", async (r) => {
    if (
      r.status() >= 400 &&
      !r.url().endsWith("/me") &&
      r.url().includes("/api/")
    )
      console.error(r.status(), r.url(), await r.text());
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(process.env.OPENREEL_WEB_URL || "http://localhost:3000");
  await page
    .getByLabel("Email address")
    .fill(`browser-${Date.now()}@example.com`);
  await page
    .getByLabel("Password", { exact: true })
    .fill("browser-test-password");
  await page.getByRole("button", { name: "Create your workspace" }).click();
  await page
    .getByRole("heading", { name: "Your creative workspace." })
    .waitFor();
  await page.screenshot({ path: ".local/dashboard.png", fullPage: true });
  await page
    .getByRole("button", { name: "Create video", exact: true })
    .first()
    .click();
  await page.getByLabel("Project title").fill("Browser verified story");
  await page
    .getByRole("button", { name: "Create project", exact: true })
    .click();
  await page.getByRole("heading", { name: "Project settings" }).waitFor();
  await page
    .getByLabel("Script / supplied narration")
    .fill("Every frame tells a story.");
  await page.getByRole("button", { name: "Save settings" }).click();
  await page
    .getByRole("button", { name: "Add scenes from paragraphs" })
    .click();
  await page.getByLabel("Caption text").waitFor();
  await page.locator("input[type=file]").setInputFiles({
    name: "test-frame.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAoAAAAFoCAIAAABIUN0GAAAFlElEQVR4nO3VMQHAIADAMEAbCvCB/3cu6LFEQb/Ofc8AAN5adQAA/JEBA0DAgAEgYMAAEDBgAAgYMAAEDBgAAgYMAAEDBoCAAQNAwIABIGDAABAwYAAIGDAABAwYAAIGDAABAwaAgAEDQMCAASBgwAAQMGAACBgwAAQMGAACBgwAAQMGgIABA0DAgAEgYMAAEDBgAAgYMAAEDBgAAgYMAAEDBoCAAQNAwIABIGDAABAwYAAIGDAABAwYAAIGDAABAwaAgAEDQMCAASBgwAAQMGAACBgwAAQMGAACBgwAAQMGgIABA0DAgAEgYMAAEDBgAAgYMAAEDBgAAgYMAAEDBoCAAQNAwIABIGDAABAwYAAIGDAABAwYAAIGDAABAwaAgAEDQMCAASBgwAAQMGAACBgwAAQMGAACBgwAAQMGgIABA0DAgAEgYMAAEDBgAAgYMAAEDBgAAgYMAAEDBoCAAQNAwIABIGDAABAwYAAIGDAABAwYAAIGDAABAwaAgAEDQMCAASBgwAAQMGAACBgwAAQMGAACBgwAAQMGgIABA0DAgAEgYMAAEDBgAAgYMAAEDBgAAgYMAAEDBoCAAQNAwIABIGDAABAwYAAIGDAABAwYAAIGDAABAwaAgAEDQMCAASBgwAAQMGAACBgwAAQMGAACBgwAAQMGgIABA0DAgAEgYMAAEDBgAAgYMAAEDBgAAgYMAAEDBoCAAQNAwIABIGDAABAwYAAIGDAABAwYAAIGDAABAwaAgAEDQMCAASBgwAAQMGAACBgwAAQMGAACBgwAAQMGgIABA0DAgAEgYMAAEDBgAAgYMAAEDBgAAgYMAAEDBoCAAQNAwIABIGDAABAwYAAIGDAABAwYAAIGDAABAwaAgAEDQMCAASBgwAAQMGAACBgwAAQMGAACBgwAAQMGgIABA0DAgAEgYMAAEDBgAAgYMAAEDBgAAgYMAAEDBoCAAQNAwIABIGDAABAwYAAIGDAABAwYAAIGDAABAwaAgAEDQMCAASBgwAAQMGAACBgwAAQMGAACBgwAAQMGgIABA0DAgAEgYMAAEDBgAAgYMAAEDBgAAgYMAAEDBoCAAQNAwIABIGDAABAwYAAIGDAABAwYAAIGDAABAwaAgAEDQMCAASBgwAAQMGAACBgwAAQMGAACBgwAAQMGgIABA0DAgAEgYMAAEDBgAAgYMAAEDBgAAgYMAAEDBoCAAQNAwIABIGDAABAwYAAIGDAABAwYAAIGDAABAwaAgAEDQMCAASBgwAAQMGAACBgwAAQMGAACBgwAAQMGgIABA0DAgAEgYMAAEDBgAAgYMAAEDBgAAgYMAAEDBoCAAQNAwIABIGDAABAwYAAIGDAABAwYAAIGDAABAwaAgAEDQMCAASBgwAAQMGAACBgwAAQMGAACBgwAAQMGgIABA0DAgAEgYMAAEDBgAAgYMAAEDBgAAgYMAAEDBoCAAQNAwIABIGDAABAwYAAIGDAABAwYAAIGDAABAwaAgAEDQMCAASBgwAAQMGAACBgwAAQMGAACBgwAAQMGgIABA0DAgAEgYMAAEDBgAAgYMAAEDBgAAgYMAAEDBoCAAQNAwIABIGDAABAwYAAIGDAABAwYAAIGDAABAwaAgAEDQMCAASBgwAAQMGAACBgwAAQMGAACBgwAAQMGgIABA0DAgAEgYMAAEDBgAAgYMAAEDBgAAgYMAAEDBoCAAQNAwIABIGDAABAwYAAIGDAABAwYAAIGDAABAwaAgAEDQMCAASBgwAAQMGAACBgwAAQMGAACBgwAAQMGgIABA0DAgAEgYMAAEDBgAAgYMAAEDBgAAgYMAAEDBoCAAQNAwIABIGDAABAwYAAIGDAABAwYAAIGDAABAwaAgAEDQMCAASBgwAAQMGAACBgwAAQMGAACH/UtA9OdIANzAAAAAElFTkSuQmCC",
      "base64",
    ),
  });
  await page
    .getByText("Media uploaded and validated", { exact: true })
    .waitFor();
  const select = page.getByLabel("Scene media");
  await select.selectOption({ label: "test-frame.png" });
  await page.getByLabel("Duration (seconds)").fill("1");
  await page.getByRole("button", { name: "Save scene", exact: true }).click();
  await page.getByText("Scene saved", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Render MP4" }).click();
  await page
    .getByRole("link", { name: "Download MP4", exact: true })
    .waitFor({ timeout: 45000 });
  await page.screenshot({ path: ".local/editor.png", fullPage: true });
  for (const name of [
    "Overview",
    "Projects",
    "Asset library",
    "AI models",
    "API keys",
    "Usage",
    "Documentation",
  ]) {
    await page
      .locator("nav")
      .getByRole("button", { name, exact: false })
      .click();
    await page.waitForTimeout(200);
  }
  await page.getByRole("button", { name: "Toggle theme" }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .locator("nav")
    .getByRole("button", { name: "Overview", exact: true })
    .click();
  await page.screenshot({ path: ".local/mobile.png", fullPage: true });
  if (errors.length) throw new Error(errors.join("\n"));
  console.log(
    "PASS: browser registration, project, upload, scene edits, render/download, navigation, theme, mobile; no page errors.",
  );
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});

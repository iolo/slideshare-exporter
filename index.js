require('dotenv').config();
const playwright = require('playwright-extra');
const recaptchaPlugin = require('puppeteer-extra-plugin-recaptcha');

const BROWSER = 'chromium';
const browserType = playwright[BROWSER];
const browserLaunchOptions = { headless: false };

function initPlaywrightExtra({ twoCaptchaApiKey }) {
  if (browserType.__playwrightInitialized__) {
    console.warn('Playwright Extra already initialized');
    return;
  }
  browserType.__playwrightInitialized__ = true;
  console.info('Initializing Playwright Extra...');
  const recaptchaOptions = {
    visualFeedback: true,
    provider: {
      id: '2captcha',
      token: twoCaptchaApiKey,
    },
  };
  browserType.use(recaptchaPlugin(recaptchaOptions));
}

async function exportSlideshare({ username, password, downloadDir }) {
  if (!username || !password) {
    console.error('Missing username or password');
    return [];
  }
  if (!downloadDir) {
    console.warn('Dry run! No files will be downloaded');
  }
  const result = [];
  const browser = await browserType.launch(browserLaunchOptions);
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto('https://www.slideshare.net/login/email');
  await page.locator('#user_login').fill(username);
  await page.locator('#user_password').fill(password);
  await page.frameLocator('iframe[title="reCAPTCHA"]').locator('#recaptcha-anchor-label').click({ delay: 300 });
  await page.solveRecaptchas();
  await page.locator('#login_from_loginpage').click();
  //await page.goto(`https://www.slideshare.net/${username}/edit_my_uploads`);
  await page.locator('div[data-cy="user-dropdown-trigger"]').click();
  await page.locator('div[data-cy="edit-my-uploads-link"]').click();
  await page.waitForTimeout(1000);
  while (true) {
    const rows = await page.locator('.my-upload-row').all();
    for (const row of rows) {
      const titleEl = await row.locator('.title-container');
      const title = await titleEl.innerText();
      let filename;
      if (downloadDir) {
        const downloadPromise = page.waitForEvent('download');
        await row.getByLabel('Download slideshow').click();
        const download = await downloadPromise;
        filename = download.suggestedFilename();
        await download.saveAs(`${downloadDir}/${filename}`);
        await download.delete();
      } else {
        // dry run!
        filename = (await row.getByLabel('Delete slideshow').getAttribute('data-delete-id')) + '.pdf';
      }
      result.push({ title, filename });
    }
    const nextLink = await page.locator('.next_page a');
    const nextUrl = await nextLink.getAttribute('href');
    if (nextUrl !== '#') {
      await nextLink.click();
      await page.waitForTimeout(1000);
    } else {
      break;
    }
  }
  await browser.close();
  return result;
}

async function main() {
  initPlaywrightExtra({
    twoCaptchaApiKey: process.env.TWOCAPTCHA_APIKEY,
  });

  const result = await exportSlideshare({
    username: process.env.SLIDESHARE_USERNAME,
    password: process.env.SLIDESHARE_PASSWORD,
    dryRun: true,
    downloadDir: '.',
  });
  console.log('=============================');
  console.log(JSON.stringify(result, undefined, 2));
  console.log('=============================');
}

main().then(console.info).catch(console.error);

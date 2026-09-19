import { chromium } from 'playwright';

async function inspectProductPage() {
  console.log('Launching Playwright browser...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 }
  });
  const page = await context.newPage();

  console.log('Navigating to https://demo.inelabteamdev.com/product/329...');
  await page.goto('https://demo.inelabteamdev.com/product/329', { waitUntil: 'networkidle', timeout: 15000 });

  console.log('Page loaded. Checking for cookie banner or modal...');
  const cookieBtn = await page.$('button:has-text("Accept"), button:has-text("Allow"), button:has-text("Got it")');
  if (cookieBtn) {
    console.log('Dismissing cookie banner...');
    await cookieBtn.click();
  }

  // Find price element or container
  console.log('Looking for price container / button...');
  const priceBlock = await page.waitForSelector('.price-block, button[aria-label="Reveal price"]', { timeout: 10000 });
  console.log('Found price container or button!');

  // Get bounding box of price block
  const box = await priceBlock.boundingBox();
  console.log('Price block bounding box:', box);

  if (box) {
    console.log('Simulating mouse movements over price block...');
    // Move across the box in 12 steps over 800ms
    const steps = 12;
    for (let i = 0; i <= steps; i++) {
      const x = box.x + (box.width * i) / steps;
      const y = box.y + (box.height / 2) + Math.sin(i) * 5;
      await page.mouse.move(x, y);
      await page.waitForTimeout(70);
    }
  }

  // Wait for reveal price button to become enabled
  console.log('Waiting for Reveal price button to be enabled...');
  const revealBtn = await page.waitForSelector('button[aria-label="Reveal price"]:not([disabled])', { timeout: 5000 });
  console.log('Button is enabled! Clicking button...');
  await revealBtn.click();

  console.log('Clicked Reveal price button. Waiting for price to render...');
  // Wait for either price text, or error message, or loading completion
  await page.waitForTimeout(2000);

  const priceBlockHtml = await page.$eval('.price-block', el => el.outerHTML);
  console.log('Price block outerHTML after reveal:\n', priceBlockHtml);

  await browser.close();
}

inspectProductPage().catch(err => {
  console.error('Inspection failed:', err);
  process.exit(1);
});

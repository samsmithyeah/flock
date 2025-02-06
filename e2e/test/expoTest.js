import wd from 'wd';
import assert from 'assert';
import { describe, it, before, after } from 'mocha';

describe('Expo Go App - Basic Test', function () {
  let driver;
  // Increase Mocha’s timeout to allow emulator/app launch time.
  this.timeout(300000);

  before(async function () {
    driver = wd.promiseChainRemote('localhost', 4723);
    const desiredCaps = {
      platformName: 'Android',
      deviceName: 'Android Emulator',
      automationName: 'UiAutomator2',
      // Targeting the Expo Go client.
      appPackage: 'host.exp.exponent',
      appActivity: 'host.exp.exponent.LauncherActivity',
      noReset: true,
    };
    await driver.init(desiredCaps);
    await driver.sleep(5000);
  });

  after(async function () {
    if (driver) {
      await driver.quit();
    }
  });

  it('should load the Expo Go home screen', async function () {
    // Example: Check for an element that is always on the Expo Go home screen.
    // Replace 'accessibilityIdHere' with an actual accessibility identifier you know is present.
    const element = await driver.elementByAccessibilityId(
      'accessibilityIdHere',
    );
    const displayed = await element.isDisplayed();
    assert.strictEqual(displayed, true);
  });
});

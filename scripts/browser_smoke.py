"""Local browser checks. Requires installed Python Playwright + Microsoft Edge."""
from pathlib import Path
import json
from playwright.sync_api import sync_playwright

BASE = 'http://127.0.0.1:4173'
ROOT = Path(__file__).resolve().parents[1]
ARTIFACTS = ROOT / 'artifacts'
ARTIFACTS.mkdir(exist_ok=True)
checks = []
errors = []
network = []

def check(condition, label):
    assert condition, label
    checks.append(label)

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, channel='msedge')
    context = browser.new_context(locale='id-ID', timezone_id='Asia/Jakarta')
    page = context.new_page()
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.on('request', lambda request: network.append(request.url))
    for width in [1440, 768, 320]:
        page.set_viewport_size({'width': width, 'height': 1000})
        page.goto(BASE)
        page.locator('#dashboard').wait_for(state='visible')
        check(page.locator('#business-items .business-card').count() == 3, f'{width}: three business cards')
        check(page.locator('#attention-items .attention-card').count() == 2, f'{width}: two attention cards')
        check('Bumi Makmur' in page.locator('.attention-card').first.inner_text(), f'{width}: mismatch first')
        check('Rp12.150.000' in page.locator('#business-items').inner_text(), f'{width}: POS projection')
        check('Rp4.200.000' in page.locator('#business-items').inner_text(), f'{width}: Kost amount')
        check('Belum terhubung' in page.locator('#business-items').inner_text(), f'{width}: unavailable not zero')
        check('Rp8.750.000' not in page.locator('body').inner_text(), f'{width}: personal masked')
        check(not any('/demo/personal.json' in url for url in network), f'{width}: no early personal fetch')
        check(page.evaluate('document.documentElement.scrollWidth <= innerWidth'), f'{width}: no horizontal overflow')
        opener = page.get_by_role('button', name='Lihat rincian')
        opener.click()
        dialog = page.locator('#detail-dialog')
        check(dialog.is_visible(), f'{width}: POS dialog opens')
        text = dialog.inner_text()
        for value in ['Rp12.400.000', 'Rp12.150.000', 'Rp250.000', '121 dari 123 struk', '10.00 WIB', '10.05']:
            check(value in text, f'{width}: POS detail {value}')
        for _ in range(5):
            page.keyboard.press('Tab')
            check(page.evaluate("document.querySelector('#detail-dialog').contains(document.activeElement)"), f'{width}: Tab stays in dialog')
        if width == 320:
            page.screenshot(path=str(ARTIFACTS / 'pos-mobile.png'), full_page=True)
        page.keyboard.press('Escape')
        check(not dialog.is_visible(), f'{width}: Escape closes')
        check(opener.evaluate('(el) => el === document.activeElement'), f'{width}: focus restored')
        page.get_by_role('button', name='Lihat cakupan').click()
        text = dialog.inner_text()
        for value in ['17 dari 20 kamar', 'Rp4.200.000', '09.30 WIB', '09.42', 'Dana titipan penyewa dicatat terpisah']:
            check(value in text, f'{width}: Kost detail {value}')
        page.get_by_role('button', name='Tutup rincian', exact=True).last.click()
        check(not dialog.is_visible(), f'{width}: close button works')
        page.screenshot(path=str(ARTIFACTS / f'home-{width}.png'), full_page=True)
    toggle = page.get_by_role('button', name='Tampilkan saldo contoh')
    toggle.click()
    page.get_by_text('Rp8.750.000', exact=True).wait_for()
    check(page.locator('#toggle-balance').get_attribute('aria-expanded') == 'true', 'personal explicit reveal')
    page.get_by_role('button', name='Sembunyikan saldo contoh').click()
    check('Rp8.750.000' not in page.locator('body').inner_text(), 'personal hides again')
    page.reload()
    page.locator('#dashboard').wait_for(state='visible')
    check('Rp8.750.000' not in page.locator('body').inner_text(), 'personal hidden after reload')
    check(page.evaluate('localStorage.length === 0 && sessionStorage.length === 0'), 'no browser storage')
    page.route('**/demo/overview.json', lambda route: route.fulfill(status=503, body='{}'))
    page.reload()
    page.get_by_text('Ringkasan gagal dimuat.', exact=False).wait_for()
    check(page.locator('#dashboard').is_hidden(), 'page error does not become source status')
    check(all(url.startswith(BASE) for url in network), 'all browser requests loopback only')
    check(not errors, f'no JS errors: {errors}')
    browser_version = browser.version
    browser.close()
report = {'result': 'PASS', 'checks': len(checks), 'browser': browser_version, 'assertions': checks, 'javascript_errors': errors, 'requests': sorted(set(network))}
(ARTIFACTS / 'browser-results.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps(report, ensure_ascii=False, indent=2))

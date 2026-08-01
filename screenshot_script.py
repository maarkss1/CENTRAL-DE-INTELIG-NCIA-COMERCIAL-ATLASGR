from playwright.sync_api import sync_playwright

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()
        page.goto('http://localhost:3000/app')
        page.wait_for_timeout(2000)
        page.screenshot(path='01_dashboard.png')

        # Click through sidebar items
        page.click('text=Prospecção')
        page.wait_for_timeout(2000)
        page.screenshot(path='02_prospecting.png')

        page.click('text=Pipeline CRM')
        page.wait_for_timeout(2000)
        page.screenshot(path='03_crm.png')

        page.click('text=Decisores')
        page.wait_for_timeout(2000)
        page.screenshot(path='04_contacts.png')

        page.click('text=Empresas')
        page.wait_for_timeout(2000)
        page.screenshot(path='05_companies.png')

        page.click('text=Agenda')
        page.wait_for_timeout(2000)
        page.screenshot(path='06_activities.png')

        page.click('text=Dojo de Vendas')
        page.wait_for_timeout(2000)
        page.screenshot(path='07_roleplay.png')

        page.click('text=Hub de IA')
        page.wait_for_timeout(2000)
        page.screenshot(path='08_intelligence.png')

        page.click('text=Academy')
        page.wait_for_timeout(2000)
        page.screenshot(path='09_academy.png')

        page.click('text=Bitrix24')
        page.wait_for_timeout(2000)
        page.screenshot(path='10_bitrix.png')

        page.click('text=Relatórios IA')
        page.wait_for_timeout(2000)
        page.screenshot(path='11_reports.png')

        browser.close()

if __name__ == '__main__':
    run()
